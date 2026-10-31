import * as THREE from 'three/webgpu';
import gsap from 'gsap';

const loader = new THREE.TextureLoader();
const textures = {
  sparkle: loader.load(`${import.meta.env.BASE_URL}assets/sprites/sparkle.png`),
  puff: loader.load(`${import.meta.env.BASE_URL}assets/sprites/particle.png`),
};
Object.values(textures).forEach((texture) => (texture.colorSpace = THREE.SRGBColorSpace));

export class Effects {
  constructor(private readonly scene: THREE.Scene) {}

  private burstOf(
    texture: keyof typeof textures,
    at: THREE.Vector3,
    { count, spread, size, tint, duration }: { count: number; spread: number; size: number; tint: string; duration: number },
  ) {
    for (let i = 0; i < count; i++) {
      const material = new THREE.SpriteMaterial({ map: textures[texture], color: tint, transparent: true, depthWrite: false });
      const sprite = new THREE.Sprite(material);
      sprite.position.copy(at);
      sprite.scale.setScalar(size);
      this.scene.add(sprite);

      const angle = Math.random() * Math.PI * 2;
      const reach = spread * (0.5 + Math.random() * 0.5);
      gsap.to(sprite.position, {
        x: at.x + Math.cos(angle) * reach,
        y: at.y + 0.3 + Math.random() * spread,
        z: at.z + Math.sin(angle) * reach,
        duration,
        ease: 'power2.out',
      });
      gsap.to(material, {
        opacity: 0,
        duration,
        ease: 'power1.in',
        onComplete: () => {
          this.scene.remove(sprite);
          material.dispose();
        },
      });
    }
  }

  coin(at: THREE.Vector3) {
    this.burstOf('sparkle', at, { count: 10, spread: 0.9, size: 0.28, tint: '#ffd84d', duration: 0.5 });
  }

  dust(at: THREE.Vector3) {
    this.burstOf('puff', at, { count: 3, spread: 0.25, size: 0.3, tint: '#ffffff', duration: 0.35 });
  }

  win(at: THREE.Vector3, stars: number) {
    this.burstOf('sparkle', at, { count: 18 + stars * 14, spread: 2.2 + stars * 0.4, size: 0.34, tint: stars === 3 ? '#ffd84d' : '#ffffff', duration: 0.95 });
  }
}
