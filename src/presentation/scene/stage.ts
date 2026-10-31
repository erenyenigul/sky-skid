import * as THREE from 'three/webgpu';
import { color, mix, screenUV } from 'three/tsl';
import gsap from 'gsap';
import type { Assets } from './assets';

const BOARD_PITCH = 0.963;
const FOCUS_PITCH = 0.62;
const FOCUS_DISTANCE = 10;
const FOCUS_RISE = 0.3;
const FOCUS_DROP = 0.7;

interface CameraPose {
  x: number;
  y: number;
  z: number;
  distance: number;
  pitch: number;
}

/** A self-contained scene that can take over the canvas from the level. */
export interface StageView {
  readonly scene: THREE.Scene;
  readonly camera: THREE.Camera;
  fit(aspect: number): void;
}

/** Renderer, camera, light and sky. Knows nothing about the game. */
export class Stage {
  readonly scene = new THREE.Scene();
  readonly renderer = new THREE.WebGPURenderer({ antialias: true });
  private readonly camera = new THREE.PerspectiveCamera(32, 1, 0.1, 200);
  private readonly rig = new THREE.Group();
  private readonly tickers: ((delta: number, elapsed: number) => void)[] = [];
  private readonly timer = new THREE.Timer();
  private boardSpan = 6;
  private view: StageView | null = null;
  private focused = false;
  private readonly pose: CameraPose = { x: 0, y: 0, z: 0.2, distance: 20, pitch: BOARD_PITCH };

  constructor(host: HTMLElement) {
    this.renderer.shadowMap.enabled = true;
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    host.append(this.renderer.domElement);

    this.scene.backgroundNode = mix(color('#f4d9ff'), color('#6fb7ff'), screenUV.y.oneMinus().pow(1.3));
    this.rig.add(this.camera);
    this.scene.add(this.rig);

    this.scene.add(new THREE.HemisphereLight('#ffffff', '#b39ddb', 2.2));
    const sun = new THREE.DirectionalLight('#fff4e0', 2.6);
    sun.position.set(-6, 14, 7);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -10, right: 10, top: 10, bottom: -10 });
    sun.shadow.bias = -0.0005;
    this.scene.add(sun);

    addEventListener('resize', () => this.fit());
  }

  get usesWebGPU() {
    return !!(this.renderer.backend as { isWebGPUBackend?: boolean }).isWebGPUBackend;
  }

  async start() {
    await this.renderer.init();
    this.fit();
    this.renderer.setAnimationLoop(() => {
      this.timer.update();
      for (const tick of this.tickers) tick(this.timer.getDelta(), this.timer.getElapsed());
      this.renderer.render(this.view?.scene ?? this.scene, this.view?.camera ?? this.camera);
    });
  }

  show(view: StageView | null) {
    this.view = view;
    this.fit();
  }

  onTick(tick: (delta: number, elapsed: number) => void) {
    this.tickers.push(tick);
  }

  frameBoard(width: number, height: number) {
    this.boardSpan = Math.max(width, height * 1.1) + 2;
    this.focused = false;
    gsap.killTweensOf(this.pose);
    this.fit();
  }

  /** Frames the whole board; on portrait phones as well as desktop. */
  private boardPose(): CameraPose {
    const distance = (this.boardSpan * 1.9) / Math.min(1, this.camera.aspect) + 3;
    return { x: 0, y: 0, z: 0.2, distance, pitch: BOARD_PITCH };
  }

  private applyPose() {
    const { x, y, z, distance, pitch } = this.pose;
    this.camera.position.set(x, y + distance * Math.sin(pitch), z + distance * Math.cos(pitch));
    this.camera.lookAt(x, y, z);
    this.camera.updateProjectionMatrix();
  }

  private moveCamera(to: CameraPose) {
    gsap.killTweensOf(this.pose);
    gsap.to(this.pose, { ...to, duration: 0.7, ease: 'power2.inOut', onUpdate: () => this.applyPose() });
  }

  /** Eases in on a point in the level, leaving the lower screen free for the HUD. */
  focusOn(target: THREE.Vector3) {
    this.focused = true;
    const distance = FOCUS_DISTANCE / Math.min(1, this.camera.aspect * 1.1);
    this.moveCamera({ x: target.x, y: target.y + FOCUS_RISE, z: target.z + FOCUS_DROP, distance, pitch: FOCUS_PITCH });
  }

  releaseFocus() {
    this.focused = false;
    this.moveCamera(this.boardPose());
  }

  private fit() {
    const { innerWidth, innerHeight } = window;
    this.renderer.setSize(innerWidth, innerHeight);
    this.camera.aspect = innerWidth / innerHeight;
    if (!this.focused) Object.assign(this.pose, this.boardPose());
    this.applyPose();
    this.view?.fit(this.camera.aspect);
  }

  shake(strength = 0.12) {
    gsap.killTweensOf(this.rig.position);
    gsap.fromTo(
      this.rig.position,
      { x: strength, z: -strength },
      { x: 0, z: 0, duration: 0.3, ease: 'elastic.out(1.2, 0.3)' },
    );
  }

  addSkyDecor(assets: Assets) {
    const CLOUDS = 150;
    const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < CLOUDS; i++) {
      const angle = i * GOLDEN_ANGLE;
      // An ellipse matching the widescreen view.
      const spread = 0.45 + 0.8 * Math.sqrt(i / CLOUDS);
      const x = Math.cos(angle) * spread * 44;
      const z = Math.sin(angle) * spread * 30;
      // Gaps in the board must show open sky, or a hole could pass for a white tile.
      if (Math.abs(x) < 15 && Math.abs(z) < 12) continue;
      const cloud = assets.clone('cloud');
      const baseY = -9 - (i % 6) * 3.5;
      cloud.position.set(x, baseY, z);
      cloud.scale.set(4 + (i % 5) * 1.8, 0.9 + (i % 3) * 0.5, 2 + (i % 3) * 0.9); // long side runs left to right
      cloud.traverse((node) => {
        node.castShadow = false;
        node.receiveShadow = false;
      });
      this.scene.add(cloud);
      this.onTick((_, elapsed) => {
        cloud.position.y = baseY + Math.sin(elapsed * 0.4 + i) * 0.4;
        cloud.position.x = x + Math.sin(elapsed * 0.05 + i) * 2;
      });
    }
  }
}
