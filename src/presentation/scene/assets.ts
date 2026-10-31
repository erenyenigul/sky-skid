import type { AnimationClip, Object3D } from 'three/webgpu';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';

const MODEL_PATHS = {
  'platform-falling': 'platform-falling',
  brick: 'brick',
  cloud: 'cloud',
  coin: 'coin',
  flag: 'flag',
  grass: 'grass',
  character: 'character',
  chest: 'survival/chest',
} as const;
export type ModelName = keyof typeof MODEL_PATHS;

export class Assets {
  private constructor(private readonly gltfs: Map<ModelName, GLTF>) {}

  static async load() {
    const loader = new GLTFLoader();
    const entries = await Promise.all(
      (Object.entries(MODEL_PATHS) as [ModelName, string][]).map(async ([name, path]) => {
        const gltf = await loader.loadAsync(`${import.meta.env.BASE_URL}assets/models/${path}.glb`);
        gltf.scene.traverse((node) => {
          node.castShadow = true;
          node.receiveShadow = true;
        });
        return [name, gltf] as const;
      }),
    );
    return new Assets(new Map(entries));
  }

  clone(name: ModelName): Object3D {
    return cloneSkinned(this.gltfs.get(name)!.scene);
  }

  clips(name: ModelName): AnimationClip[] {
    return this.gltfs.get(name)!.animations;
  }
}
