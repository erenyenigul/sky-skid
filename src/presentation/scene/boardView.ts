import * as THREE from 'three/webgpu';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import gsap from 'gsap';
import type { Board } from '../../domain/board';
import { hasCoin, isCracked, type GameState } from '../../domain/game';
import type { Assets } from './assets';
import type { Stage } from './stage';

const TILE_HEIGHT = 0.6;
const RIM_BASE = -0.12;
const tileGeometry = new RoundedBoxGeometry(0.98, TILE_HEIGHT, 0.98, 3, 0.07);
const tileMaterials = ['#6f83cf', '#6274c0'].map((color) => new THREE.MeshStandardMaterial({ color, roughness: 0.9 }));

export const cellPosition = (board: Board, cell: number, y = 0) =>
  new THREE.Vector3(
    (cell % board.width) - (board.width - 1) / 2,
    y,
    Math.floor(cell / board.width) - (board.height - 1) / 2,
  );

/** Everything on the island. Renders a GameState; never decides game rules. */
export class BoardView {
  private readonly root = new THREE.Group();
  private readonly coins = new Map<number, THREE.Object3D>();
  private readonly crumbles = new Map<number, { model: THREE.Object3D; gone: boolean }>();
  private readonly clouds: THREE.Object3D[] = [];
  private flag: THREE.Object3D | null = null;
  private board: Board | null = null;

  constructor(
    private readonly assets: Assets,
    stage: Stage,
  ) {
    stage.scene.add(this.root);
    stage.onTick((_, elapsed) => {
      let phase = 0;
      for (const coin of this.coins.values()) {
        coin.rotation.y = elapsed * 2.4 + phase;
        coin.position.y = 0.18 + Math.sin(elapsed * 3 + phase) * 0.05;
        phase += 0.9;
      }
      for (const cloud of this.clouds) cloud.rotation.y = elapsed * 0.8;
    });
  }

  build(board: Board) {
    gsap.killTweensOf(this.root.children);
    this.root.clear();
    this.coins.clear();
    this.crumbles.clear();
    this.clouds.length = 0;
    this.flag = null;
    this.board = board;

    board.tiles.forEach((tile, cell) => {
      if (tile === 'gap') return;
      const tileGroup = new THREE.Group();
      tileGroup.position.copy(cellPosition(board, cell));
      if (tile === 'crumble') {
        const model = this.assets.clone('platform-falling');
        model.scale.set(0.42, 0.3, 0.42);
        model.position.y = -0.15;
        tileGroup.add(model);
        this.crumbles.set(cell, { model: tileGroup, gone: false });
      } else {
        const parity = ((cell % board.width) + Math.floor(cell / board.width)) % 2;
        const slab = new THREE.Mesh(tileGeometry, tileMaterials[parity]);
        slab.position.y = -TILE_HEIGHT / 2;
        slab.receiveShadow = true;
        slab.castShadow = true;
        tileGroup.add(slab);
      }
      this.decorate(tileGroup, tile, cell);
      this.addAnimated(tileGroup, (cell % board.width) + Math.floor(cell / board.width));
    });

    for (let y = -1; y <= board.height; y++) {
      for (let x = -1; x <= board.width; x++) {
        if (x >= 0 && y >= 0 && x < board.width && y < board.height) continue;
        const brick = this.assets.clone('brick');
        brick.position.set(x - (board.width - 1) / 2, RIM_BASE, y - (board.height - 1) / 2);
        brick.scale.set(1, 0.3, 1);
        this.addAnimated(brick, Math.abs(x) + Math.abs(y));
      }
    }
  }

  private decorate(group: THREE.Group, tile: Board['tiles'][number], cell: number) {
    switch (tile) {
      case 'wall': {
        const brick = this.assets.clone('brick');
        brick.scale.setScalar(0.96);
        group.add(brick);
        break;
      }
      case 'coin': {
        const coin = this.assets.clone('coin');
        coin.scale.setScalar(1.7);
        group.add(coin);
        this.coins.set(cell, coin);
        break;
      }
      case 'grass': {
        const grass = this.assets.clone('grass');
        grass.scale.setScalar(1.7);
        group.add(grass);
        break;
      }
      case 'cloud': {
        const cloud = this.assets.clone('cloud');
        cloud.scale.setScalar(0.68);
        cloud.position.y = 0.05;
        group.add(cloud);
        this.clouds.push(cloud);
        break;
      }
      case 'flag': {
        const flag = this.assets.clone('flag');
        flag.rotation.y = -Math.PI / 2; // cloth faces the camera instead of pointing at it
        group.add(flag);
        this.flag = flag;
        break;
      }
    }
  }

  private addAnimated(object: THREE.Object3D, order: number) {
    const restY = object.position.y;
    object.position.y = restY - 8;
    this.root.add(object);
    gsap.to(object.position, { y: restY, duration: 0.42, delay: order * 0.022, ease: 'back.out(1.4)' });
  }

  /** Makes the island match `state`. Safe to call after any move or restart. */
  sync(state: GameState) {
    const board = this.board!;
    for (const [cell, coin] of this.coins) coin.visible = !hasCoin(state, board, cell);

    for (const [cell, crumble] of this.crumbles) {
      const shouldBeGone = isCracked(state, board, cell) && state.at !== cell;
      if (shouldBeGone === crumble.gone) continue;
      crumble.gone = shouldBeGone;
      const rest = cellPosition(board, cell);
      gsap.killTweensOf(crumble.model.position);
      if (shouldBeGone) {
        gsap.to(crumble.model.position, {
          y: -9,
          duration: 0.5,
          ease: 'power2.in',
          onComplete: () => void (crumble.model.visible = false),
        });
      } else {
        crumble.model.visible = true;
        crumble.model.position.copy(rest);
      }
    }

    const open = state.coins === board.allCoins;
    if (this.flag) {
      gsap.to(this.flag.scale, { x: open ? 1.9 : 1, y: open ? 1.9 : 0.8, z: open ? 1.9 : 1, duration: 0.25, ease: 'back.out(3)' });
    }
  }

  /** Clears the flag out of a close-up of the robot standing on it. `sync` brings it back. */
  lowerFlag() {
    if (this.flag) gsap.to(this.flag.scale, { x: 0, y: 0, z: 0, duration: 0.25, ease: 'back.in(2)' });
  }

  hideCoin(cell: number) {
    this.coins.get(cell)!.visible = false;
  }

  /** Lets a crumble wobble underfoot the moment it's crossed. */
  wobble(cell: number) {
    const crumble = this.crumbles.get(cell);
    if (crumble) gsap.fromTo(crumble.model.rotation, { z: 0.08 }, { z: 0, duration: 0.3, ease: 'elastic.out(2, 0.3)' });
  }
}
