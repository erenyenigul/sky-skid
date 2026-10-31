import * as THREE from 'three/webgpu';
import gsap from 'gsap';
import type { Assets } from './assets';
import type { Effects } from './effects';
import type { Stage } from './stage';

/** High enough that the cloud's underside clears the tallest thing on the board, a 1-unit brick. */
const HOVER_Y = 1.6;
/** How far from the robot it hovers, on the side nearer the middle of the board. */
const BESIDE_ROBOT = 1.75;
const SKY_Y = 14;
/** The chest stays shut until the robot has leapt in front of it. */
const ROBOT_ARRIVAL_WAIT = 0.75;
const CHEST_SCALE = 5.5;
const WOOD_TINT = '#b98a63'; // the kit's wood is the same peach as the bricks

export interface ChestDropCallbacks {
  onLand(): void;
  onRattle(): void;
  onOpen(): void;
}

/** The reward chest: rides a cloud down beside the robot, opens there, then floats away. */
export class ChestDrop {
  private readonly root = new THREE.Group();
  private readonly chest: THREE.Object3D;
  private readonly openLid: THREE.AnimationAction;
  private context?: gsap.Context;

  constructor(
    assets: Assets,
    stage: Stage,
    private readonly effects: Effects,
  ) {
    this.chest = assets.clone('chest');
    this.chest.scale.setScalar(CHEST_SCALE);
    this.chest.traverse((node) => {
      const mesh = node as THREE.Mesh;
      if (!mesh.isMesh) return;
      const material = (mesh.material as THREE.MeshStandardMaterial).clone();
      material.color.set(WOOD_TINT);
      material.side = THREE.DoubleSide; // the model has no inside faces, and the lid opens
      mesh.material = material;
    });

    const cloud = assets.clone('cloud');
    cloud.scale.set(2, 0.45, 2.8);
    cloud.position.set(0, -0.48, 0.6); // reaches forward: the robot stands here to show off
    this.root.add(this.chest, cloud);

    const mixer = new THREE.AnimationMixer(this.chest);
    this.openLid = mixer.clipAction(assets.clips('chest').find((clip) => clip.name === 'open')!);
    this.openLid.setLoop(THREE.LoopOnce, 1);
    this.openLid.clampWhenFinished = true;
    stage.onTick((delta) => mixer.update(delta));

    this.root.visible = false;
    stage.scene.add(this.root);
  }

  /** Where the chest will hover, given the robot's position. */
  static besideRobot(robot: THREE.Vector3) {
    return new THREE.Vector3(robot.x + (robot.x > 0 ? -BESIDE_ROBOT : BESIDE_ROBOT), HOVER_Y, robot.z - 0.2);
  }

  /** Where the robot stands: on the cloud, in front of the chest. */
  static showOffSpot(robot: THREE.Vector3) {
    return ChestDrop.besideRobot(robot).add(new THREE.Vector3(0, -0.03, 1.15));
  }

  enter(robot: THREE.Vector3, { onLand, onRattle, onOpen }: ChestDropCallbacks) {
    this.context?.kill();
    this.openLid.stop();
    this.chest.rotation.set(0, 0, 0);
    this.root.visible = true;
    this.root.position.copy(ChestDrop.besideRobot(robot)).setY(SKY_Y);

    this.context = gsap.context(() => {
      const timeline = gsap.timeline();
      timeline.to(this.root.position, { y: HOVER_Y, duration: 0.6, ease: 'back.out(1.3)' });
      timeline.call(onLand);
      timeline.to({}, { duration: ROBOT_ARRIVAL_WAIT });

      [-0.1, 0.1, -0.15, 0.15].forEach((z) => {
        timeline.call(onRattle);
        timeline.to(this.chest.rotation, { z, duration: 0.09, ease: 'sine.inOut' });
      });
      timeline.to(this.chest.rotation, { z: 0, duration: 0.06 });

      timeline.call(() => {
        this.openLid.reset().play();
        onOpen();
        this.burst();
      });

      gsap.to(this.root.position, {
        y: HOVER_Y + 0.14,
        duration: 1.4,
        delay: 2.4,
        repeat: -1,
        yoyo: true,
        ease: 'sine.inOut',
      });
    });
  }

  private burst() {
    this.effects.win(this.root.position.clone().setY(this.root.position.y + 0.8), 3);
  }

  leave() {
    this.context?.kill();
    gsap.to(this.root.position, {
      y: SKY_Y,
      duration: 0.4,
      ease: 'power2.in',
      onComplete: () => void (this.root.visible = false),
    });
  }
}
