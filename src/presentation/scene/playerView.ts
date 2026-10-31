import * as THREE from 'three/webgpu';
import gsap from 'gsap';
import type { Board } from '../../domain/board';
import type { DashResult, Direction } from '../../domain/game';
import type { Assets } from './assets';
import { cellPosition } from './boardView';
import { Robot } from './robot';
import type { Stage } from './stage';

const CELLS_PER_SECOND = 15;
const FACING: Record<Direction, number> = { down: 0, right: Math.PI / 2, up: Math.PI, left: -Math.PI / 2 };

export interface DashCallbacks {
  onCell(cell: number): void;
  onImpact(): void;
}

const HINT_DISTANCE = 0.72;
const PRESENT_SCALE = 1.35;

function createHintArrow() {
  const shape = new THREE.Shape()
    .moveTo(0, 0.42)
    .lineTo(0.32, 0)
    .lineTo(0.13, 0)
    .lineTo(0.13, -0.34)
    .lineTo(-0.13, -0.34)
    .lineTo(-0.13, 0)
    .lineTo(-0.32, 0)
    .closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: 0.08, bevelEnabled: false });
  geometry.rotateX(Math.PI / 2); // lie flat, tip pointing along +z
  return new THREE.Mesh(
    geometry,
    new THREE.MeshStandardMaterial({ color: '#ffc21a', emissive: '#ff8f00', emissiveIntensity: 0.6, roughness: 0.4 }),
  );
}

export class PlayerView {
  private readonly robot: Robot;
  private readonly hintPivot = new THREE.Group();
  private readonly hintArrow = createHintArrow();
  private board!: Board;
  private leaping?: gsap.core.Timeline;
  private readonly home = new THREE.Vector3();

  constructor(assets: Assets, stage: Stage) {
    this.robot = new Robot(assets);
    stage.scene.add(this.robot.root);
    stage.onTick((delta) => this.robot.update(delta));

    this.hintPivot.position.y = 0.5;
    this.hintPivot.visible = false;
    this.hintPivot.add(this.hintArrow);
    this.robot.root.add(this.hintPivot);
  }

  /** Points an arrow along the next dash; null hides it. */
  showHint(direction: Direction | null) {
    gsap.killTweensOf(this.hintArrow.position);
    this.hintPivot.visible = direction !== null;
    if (!direction) return;
    this.hintPivot.rotation.y = FACING[direction];
    gsap.fromTo(
      this.hintArrow.position,
      { z: HINT_DISTANCE },
      { z: HINT_DISTANCE + 0.22, duration: 0.38, repeat: -1, yoyo: true, ease: 'sine.inOut' },
    );
  }

  get position() {
    return this.robot.root.position;
  }

  setSkin(hex: string) {
    this.robot.setSkin(hex);
  }

  place(board: Board, cell: number) {
    this.board = board;
    this.leaping?.kill();
    gsap.killTweensOf([this.robot.root.position, this.robot.root.scale, this.robot.body.rotation]);
    this.robot.root.position.copy(cellPosition(board, cell));
    this.robot.root.scale.setScalar(1);
    this.robot.body.rotation.set(0, FACING.down, 0);
    this.robot.play('idle');
  }

  popIn() {
    gsap.fromTo(this.robot.root.scale, { x: 0, y: 0, z: 0 }, { x: 1, y: 1, z: 1, duration: 0.3, ease: 'back.out(3)' });
  }

  /** Plays a dash out; resolves once it has fully landed. */
  animate(direction: Direction, result: DashResult, restCell: number, callbacks: DashCallbacks): Promise<void> {
    this.showHint(null);
    return new Promise((resolve) => {
      const board = this.board;
      const timeline = gsap.timeline({ onComplete: resolve });
      this.robot.body.rotation.y = FACING[direction];

      if (result.outcome === 'blocked') {
        const bump = this.robot.root.position.clone().add(new THREE.Vector3(Math.sin(FACING[direction]) * 0.12, 0, Math.cos(FACING[direction]) * 0.12));
        timeline.to(this.robot.root.position, { x: bump.x, z: bump.z, duration: 0.05 });
        timeline.to(this.robot.root.position, { x: this.robot.root.position.x, z: this.robot.root.position.z, duration: 0.08 });
        return;
      }

      this.robot.play('walk');
      for (const cell of result.path) {
        const target = cellPosition(board, cell);
        timeline.to(this.robot.root.position, {
          x: target.x,
          z: target.z,
          duration: 1 / CELLS_PER_SECOND,
          ease: 'none',
          onComplete: () => callbacks.onCell(cell),
        });
      }

      if (result.outcome === 'fell') {
        timeline.to(this.robot.root.position, { y: -7, duration: 0.42, ease: 'power2.in' });
        timeline.to(this.robot.root.scale, { x: 0.3, y: 0.3, z: 0.3, duration: 0.42 }, '<');
        timeline.call(() => {
          this.robot.root.position.copy(cellPosition(board, restCell));
          this.robot.root.scale.setScalar(1);
          this.robot.play('idle');
        });
        timeline.from(this.robot.root.scale, { x: 0, y: 0, z: 0, duration: 0.18, ease: 'back.out(3)' });
        return;
      }

      if (result.outcome === 'warped') {
        const exit = cellPosition(board, restCell);
        timeline.to(this.robot.root.scale, { x: 0, y: 0, z: 0, duration: 0.09 });
        timeline.call(() => this.robot.root.position.copy(exit));
        timeline.to(this.robot.root.scale, { x: 1, y: 1, z: 1, duration: 0.16, ease: 'back.out(3)' });
      }

      timeline.call(() => {
        callbacks.onImpact();
        this.robot.play('idle');
      });
      // Squash on landing: the small detail that makes a stop feel weighty.
      timeline.to(this.robot.root.scale, { x: 1.2, y: 0.78, z: 1.2, duration: 0.05 });
      timeline.to(this.robot.root.scale, { x: 1, y: 1, z: 1, duration: 0.12, ease: 'back.out(3)' });
    });
  }

  /** Leaps to `spot`, enlarged, and waits there looking away from the camera at the chest. */
  arriveAt(spot: THREE.Vector3) {
    const { root, body } = this.robot;
    this.home.copy(root.position);
    this.leaping?.kill();
    gsap.killTweensOf(body.rotation);
    body.rotation.y = FACING.up;
    this.robot.play('jump');
    this.leaping = this.leap(spot, PRESENT_SCALE).call(() => this.robot.play('idle'));
  }

  /** Turns to face the camera and hops for joy until `stepBack`. */
  showOff() {
    const { root, body } = this.robot;
    const restY = root.position.y;
    this.robot.play('jump');
    gsap.to(body.rotation, { y: FACING.down, duration: 0.35, ease: 'back.out(1.6)' });
    this.leaping = gsap
      .timeline({ repeat: -1, repeatDelay: 0.7 })
      .to(root.position, { y: restY + 0.35, duration: 0.17, yoyo: true, repeat: 3, ease: 'power2.out' });
  }

  stepBack() {
    this.leaping?.kill();
    this.robot.play('jump');
    this.leaping = this.leap(this.home, 1).call(() => this.robot.play('idle'));
  }

  private leap(to: THREE.Vector3, scale: number) {
    const { root } = this.robot;
    const apex = Math.max(root.position.y, to.y) + 0.9;
    return gsap
      .timeline()
      .to(root.position, { x: to.x, z: to.z, duration: 0.5, ease: 'none' }, 0)
      .to(root.position, { y: apex, duration: 0.25, ease: 'power2.out' }, 0)
      .to(root.position, { y: to.y, duration: 0.25, ease: 'power2.in' }, 0.25)
      .to(root.scale, { x: scale, y: scale, z: scale, duration: 0.5, ease: 'none' }, 0);
  }

  celebrate() {
    this.robot.play('jump');
    gsap.to(this.robot.root.position, { y: 0.7, duration: 0.22, yoyo: true, repeat: 1, ease: 'power2.out' });
    gsap.to(this.robot.body.rotation, { y: this.robot.body.rotation.y + Math.PI * 2, duration: 0.5, ease: 'power2.out' });
  }
}
