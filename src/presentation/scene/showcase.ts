import * as THREE from 'three/webgpu';
import { color, mix, screenUV } from 'three/tsl';
import gsap from 'gsap';
import type { Assets } from './assets';
import { Robot } from './robot';
import type { Stage, StageView } from './stage';

const CAMERA_HEIGHT = 1.2;
const CAMERA_DISTANCE = 11;
/** Where the camera aims. On tall screens the HUD panel needs the lower half, so the robot moves up. */
const LOOK_AT_Y_WIDE = -0.1;
const LOOK_AT_Y_TALL = -1.2;
const ROBOT_SCALE = 1.6;

/** A small stage of its own for previewing skins. */
export class Showcase implements StageView {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
  private readonly robot: Robot;
  private turning?: gsap.core.Tween;

  constructor(assets: Assets, stage: Stage) {
    this.scene.backgroundNode = mix(color('#8a7be0'), color('#2f2c7a'), screenUV.y.oneMinus().pow(1.1));
    this.scene.add(new THREE.HemisphereLight('#ffffff', '#6a5bd0', 2.4));
    const sun = new THREE.DirectionalLight('#fff4e0', 2.6);
    sun.position.set(-3, 6, 6);
    this.scene.add(sun);

    this.robot = new Robot(assets);
    this.robot.root.scale.setScalar(ROBOT_SCALE);
    this.scene.add(this.robot.root);

    for (let i = 0; i < 26; i++) {
      const cloud = assets.clone('cloud');
      const x = ((i * 7.3) % 44) - 22;
      const y = ((i * 3.7) % 11) - 6.5;
      cloud.position.set(x, y, -11 - (i % 4) * 2);
      cloud.scale.set(3 + (i % 4) * 1.4, 0.8 + (i % 3) * 0.4, 2);
      this.scene.add(cloud);
      stage.onTick((_, elapsed) => {
        cloud.position.x = x + Math.sin(elapsed * 0.06 + i) * 1.5;
      });
    }

    stage.onTick((delta) => this.robot.update(delta));
  }

  fit(aspect: number) {
    this.camera.aspect = aspect;
    this.camera.position.set(0, CAMERA_HEIGHT, CAMERA_DISTANCE / Math.min(1, aspect * 1.4));
    this.camera.lookAt(0, aspect < 1 ? LOOK_AT_Y_TALL : LOOK_AT_Y_WIDE, 0);
    this.camera.updateProjectionMatrix();
  }

  /** The robot alone, turning slowly so a skin can be seen from every side. */
  showSkins(skin: string) {
    this.robot.setSkin(skin);
    this.robot.play('idle');
    this.turning?.kill();
    this.turning = gsap.fromTo(
      this.robot.body.rotation,
      { y: -0.5 },
      { y: 0.5, duration: 2.4, repeat: -1, yoyo: true, ease: 'sine.inOut' },
    );
  }

  previewSkin(skin: string) {
    this.robot.setSkin(skin);
    this.robot.play('jump');
    gsap.to(this.robot.root.position, {
      y: 0.55,
      duration: 0.2,
      yoyo: true,
      repeat: 1,
      ease: 'power2.out',
      onComplete: () => this.robot.play('idle'),
    });
  }

  stop() {
    this.turning?.kill();
  }
}
