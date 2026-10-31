import type { AnimationClip, Object3D } from 'three/webgpu';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';

const MODEL_NAMES = ['platform-grass-large-round', 'platform-falling', 'brick', 'cloud', 'coin', 'flag', 'grass', 'character'] as const;
export type ModelName = (typeof MODEL_NAMES)[number];

export class Assets {
  private constructor(
    private readonly scenes: Map<ModelName, Object3D>,
    readonly characterClips: AnimationClip[],
  ) {}

  static async load() {
    const loader = new GLTFLoader();
    const gltfs = await Promise.all(
      MODEL_NAMES.map((name) => loader.loadAsync(`/assets/models/${name}.glb`).then((gltf) => [name, gltf] as const)),
    );
    gltfs.forEach(([, gltf]) =>
      gltf.scene.traverse((node) => {
        node.castShadow = true;
        node.receiveShadow = true;
      }),
    );
    return new Assets(
      new Map(gltfs.map(([name, gltf]) => [name, gltf.scene])),
      gltfs.find(([name]) => name === 'character')![1].animations,
    );
  }

  clone(name: ModelName): Object3D {
    return cloneSkinned(this.scenes.get(name)!);
  }
}
