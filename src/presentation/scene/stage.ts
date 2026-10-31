import * as THREE from 'three/webgpu';
import { color, mix, screenUV } from 'three/tsl';
import gsap from 'gsap';
import type { Assets } from './assets';

/** Renderer, camera, light and sky. Knows nothing about the game. */
export class Stage {
  readonly scene = new THREE.Scene();
  readonly renderer = new THREE.WebGPURenderer({ antialias: true });
  private readonly camera = new THREE.PerspectiveCamera(32, 1, 0.1, 200);
  private readonly rig = new THREE.Group();
  private readonly tickers: ((delta: number, elapsed: number) => void)[] = [];
  private readonly timer = new THREE.Timer();
  private boardSpan = 6;

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
      this.renderer.render(this.scene, this.camera);
    });
  }

  onTick(tick: (delta: number, elapsed: number) => void) {
    this.tickers.push(tick);
  }

  frameBoard(width: number, height: number) {
    this.boardSpan = Math.max(width, height * 1.1) + 2;
    this.fit();
  }

  private fit() {
    const { innerWidth, innerHeight } = window;
    this.renderer.setSize(innerWidth, innerHeight);
    this.camera.aspect = innerWidth / innerHeight;
    // Keep the whole board in view on portrait phones as well as desktop.
    const distance = (this.boardSpan * 1.9) / Math.min(1, this.camera.aspect) + 3;
    this.camera.position.set(0, distance * 0.82, distance * 0.57);
    this.camera.lookAt(0, 0, 0.2);
    this.camera.updateProjectionMatrix();
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
    for (let i = 0; i < 12; i++) {
      const cloud = assets.clone('cloud');
      const angle = (i / 12) * Math.PI * 2;
      const radius = 22 + (i % 4) * 7;
      const baseY = -14 - (i % 3) * 4;
      cloud.position.set(Math.cos(angle) * radius, baseY, Math.sin(angle) * radius);
      cloud.scale.setScalar(2 + (i % 3));
      cloud.rotation.y = angle;
      cloud.traverse((node) => (node.castShadow = false));
      this.scene.add(cloud);
      this.onTick((_, elapsed) => {
        cloud.position.y = baseY + Math.sin(elapsed * 0.4 + i) * 0.5;
      });
    }
  }
}
