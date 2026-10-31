import * as THREE from 'three/webgpu';
import type { Assets } from './assets';

export type RobotClip = 'idle' | 'walk' | 'jump';

/** The animated, tintable character, shared by the level and the showcase. */
export class Robot {
  readonly root = new THREE.Group();
  readonly body: THREE.Object3D;
  private readonly mixer: THREE.AnimationMixer;
  private readonly actions = new Map<string, THREE.AnimationAction>();
  private current?: THREE.AnimationAction;
  private readonly tintable: THREE.MeshStandardMaterial[] = [];

  constructor(assets: Assets) {
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
    this.mixer = new THREE.AnimationMixer(this.body);
    for (const clip of assets.clips('character')) this.actions.set(clip.name, this.mixer.clipAction(clip));
    this.play('idle');
  }

  update(delta: number) {
    this.mixer.update(delta);
  }

  play(name: RobotClip) {
    const next = this.actions.get(name)!;
    if (next === this.current) return;
    next.reset().fadeIn(0.08).play();
    this.current?.fadeOut(0.08);
    this.current = next;
  }

  setSkin(hex: string) {
    for (const material of this.tintable) material.color.set(hex);
  }
}
