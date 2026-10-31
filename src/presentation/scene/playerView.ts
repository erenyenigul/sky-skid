import * as THREE from 'three/webgpu';
import gsap from 'gsap';
import type { Board } from '../../domain/board';
import type { DashResult, Direction } from '../../domain/game';
import type { Assets } from './assets';
import { cellPosition } from './boardView';
import type { Stage } from './stage';

const CELLS_PER_SECOND = 15;
const FACING: Record<Direction, number> = { down: 0, right: Math.PI / 2, up: Math.PI, left: -Math.PI / 2 };

export interface DashCallbacks {
  onCell(cell: number): void;
  onImpact(): void;
}

export class PlayerView {
  private readonly root = new THREE.Group();
  private readonly body: THREE.Object3D;
  private readonly mixer: THREE.AnimationMixer;
  private readonly actions = new Map<string, THREE.AnimationAction>();
  private current?: THREE.AnimationAction;
  private readonly tintable: THREE.MeshStandardMaterial[] = [];
  private board!: Board;

  constructor(assets: Assets, stage: Stage) {
    this.body = assets.clone('character');
    this.body.traverse((node) => {
      const mesh = node as THREE.Mesh;
      if (mesh.isMesh) {
        const material = (mesh.material as THREE.MeshStandardMaterial).clone();
        mesh.material = material;
        this.tintable.push(material);
      }
    });
    this.root.add(this.body);
    stage.scene.add(this.root);

    this.mixer = new THREE.AnimationMixer(this.body);
    for (const clip of assets.characterClips) this.actions.set(clip.name, this.mixer.clipAction(clip));
    this.play('idle');
    stage.onTick((delta) => this.mixer.update(delta));
  }

  private play(name: 'idle' | 'walk' | 'jump') {
    const next = this.actions.get(name)!;
    if (next === this.current) return;
    next.reset().fadeIn(0.08).play();
    this.current?.fadeOut(0.08);
    this.current = next;
  }

  get position() {
    return this.root.position;
  }

  setSkin(hex: string) {
    for (const material of this.tintable) material.color.set(hex);
  }

  place(board: Board, cell: number) {
    this.board = board;
    gsap.killTweensOf([this.root.position, this.root.scale, this.body.rotation]);
    this.root.position.copy(cellPosition(board, cell));
    this.root.scale.setScalar(1);
    this.body.rotation.set(0, FACING.down, 0);
    this.play('idle');
  }

  popIn() {
    gsap.fromTo(this.root.scale, { x: 0, y: 0, z: 0 }, { x: 1, y: 1, z: 1, duration: 0.3, ease: 'back.out(3)' });
  }

  /** Plays a dash out; resolves once it has fully landed. */
  animate(direction: Direction, result: DashResult, restCell: number, callbacks: DashCallbacks): Promise<void> {
    return new Promise((resolve) => {
      const board = this.board;
      const timeline = gsap.timeline({ onComplete: resolve });
      this.body.rotation.y = FACING[direction];

      if (result.outcome === 'blocked') {
        const bump = this.root.position.clone().add(new THREE.Vector3(Math.sin(FACING[direction]) * 0.12, 0, Math.cos(FACING[direction]) * 0.12));
        timeline.to(this.root.position, { x: bump.x, z: bump.z, duration: 0.05 });
        timeline.to(this.root.position, { x: this.root.position.x, z: this.root.position.z, duration: 0.08 });
        return;
      }

      this.play('walk');
      for (const cell of result.path) {
        const target = cellPosition(board, cell);
        timeline.to(this.root.position, {
          x: target.x,
          z: target.z,
          duration: 1 / CELLS_PER_SECOND,
          ease: 'none',
          onComplete: () => callbacks.onCell(cell),
        });
      }

      if (result.outcome === 'fell') {
        timeline.to(this.root.position, { y: -7, duration: 0.42, ease: 'power2.in' });
        timeline.to(this.root.scale, { x: 0.3, y: 0.3, z: 0.3, duration: 0.42 }, '<');
        timeline.call(() => {
          this.root.position.copy(cellPosition(board, restCell));
          this.root.scale.setScalar(1);
          this.play('idle');
        });
        timeline.from(this.root.scale, { x: 0, y: 0, z: 0, duration: 0.18, ease: 'back.out(3)' });
        return;
      }

      if (result.outcome === 'warped') {
        const exit = cellPosition(board, restCell);
        timeline.to(this.root.scale, { x: 0, y: 0, z: 0, duration: 0.09 });
        timeline.call(() => this.root.position.copy(exit));
        timeline.to(this.root.scale, { x: 1, y: 1, z: 1, duration: 0.16, ease: 'back.out(3)' });
      }

      timeline.call(() => {
        callbacks.onImpact();
        this.play('idle');
      });
      // Squash on landing: the small detail that makes a stop feel weighty.
      timeline.to(this.root.scale, { x: 1.2, y: 0.78, z: 1.2, duration: 0.05 });
      timeline.to(this.root.scale, { x: 1, y: 1, z: 1, duration: 0.12, ease: 'back.out(3)' });
    });
  }

  celebrate() {
    this.play('jump');
    gsap.to(this.root.position, { y: 0.7, duration: 0.22, yoyo: true, repeat: 1, ease: 'power2.out' });
    gsap.to(this.body.rotation, { y: this.body.rotation.y + Math.PI * 2, duration: 0.5, ease: 'power2.out' });
  }
}
