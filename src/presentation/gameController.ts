import { DragGesture } from '@use-gesture/vanilla';
import gsap from 'gsap';
import { boardOf, ZONES, type LevelData } from '../application/catalog';
import { completeDaily, completeLevel, dailyLevel, pickNextLevel, skipLevel, SKINS, spendHint, type Progress } from '../application/progress';
import { LevelSession } from '../application/session';
import type { Direction } from '../domain/game';
import { playSound } from '../infrastructure/audio';
import { loadProgress, saveProgress } from '../infrastructure/progressStore';
import { BoardView, cellPosition } from './scene/boardView';
import { Effects } from './scene/effects';
import { ChestDrop } from './scene/chestDrop';
import { PlayerView } from './scene/playerView';
import { Showcase } from './scene/showcase';
import type { Stage } from './scene/stage';
import type { Assets } from './scene/assets';
import * as store from './store';

const KEY_DIRECTIONS: Record<string, Direction> = {
  ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
  w: 'up', s: 'down', a: 'left', d: 'right',
};

const today = () => new Date().toISOString().slice(0, 10);

/** Connects input, the application layer, the 3D views and the HUD store. */
export class GameController {
  private readonly boardView: BoardView;
  private readonly player: PlayerView;
  private readonly effects: Effects;
  private readonly showcase: Showcase;
  private readonly chestDrop: ChestDrop;
  private session!: LevelSession;
  private busy = false;
  private queued: Direction | null = null;
  private coinChain = 0;

  constructor(
    private readonly stage: Stage,
    assets: Assets,
  ) {
    this.boardView = new BoardView(assets, stage);
    this.player = new PlayerView(assets, stage);
    this.effects = new Effects(stage.scene);
    this.showcase = new Showcase(assets, stage);
    this.chestDrop = new ChestDrop(assets, stage, this.effects);
    this.showcase.fit(innerWidth / innerHeight);
    this.update(loadProgress());
    this.player.setSkin(this.skinColor);
    this.bindInput();
    this.show(pickNextLevel(store.progress.value!), false);
    store.screen.value = 'title';
  }

  private get skinColor() {
    return SKINS.find((skin) => skin.id === store.progress.value!.skin)!.color;
  }

  private update(progress: Progress) {
    store.progress.value = progress;
    saveProgress(progress);
  }

  private bindInput() {
    addEventListener('keydown', (event) => this.onKey(event));
    new DragGesture(
      this.stage.renderer.domElement,
      ({ swipe: [sx, sy] }) => {
        if (sx) this.input(sx > 0 ? 'right' : 'left');
        else if (sy) this.input(sy > 0 ? 'down' : 'up');
      },
      { swipe: { distance: 24, velocity: 0.15 } },
    );
  }

  private onKey(event: KeyboardEvent) {
    const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
    const direction = KEY_DIRECTIONS[key];
    if (direction) {
      event.preventDefault();
      this.input(direction);
    } else if (key === 'Escape') this.onEscape();
    else if (key === 'r') this.retry();
    else if (key === 'h') this.useHint();
    else if (key === 'Enter' || key === ' ') {
      event.preventDefault();
      if (store.screen.value === 'chest') this.closeChest(true);
      else if (store.screen.value === 'clear') this.next();
      else if (store.screen.value === 'title') this.play();
    }
  }

  play() {
    playSound('click1');
    // Coming back from the menu resumes the level, unless it's over or was the daily.
    if (this.session.won || store.isDaily.value) {
      store.isDaily.value = false;
      this.show(pickNextLevel(store.progress.value!));
    }
    store.screen.value = 'play';
    this.announceZone();
  }

  openMenu() {
    playSound('click1');
    this.queued = null;
    store.screen.value = 'title';
  }

  private onEscape() {
    const current = store.screen.value;
    if (current === 'skins') this.closeSkins();
    else if (current === 'chest') this.closeChest(false);
    else if (current !== 'title') this.openMenu();
  }

  /** The prize is always kept; wearing it is the player's call. */
  closeChest(wear: boolean) {
    playSound('click1');
    const chest = store.rewards.value?.chest;
    if (wear && chest && chest !== 'bonus') this.update({ ...store.progress.value!, skin: chest.id });
    this.player.setSkin(this.skinColor);
    this.player.stepBack();
    this.chestDrop.leave();
    this.stage.releaseFocus();
    this.boardView.sync(this.session.state);
    store.screen.value = 'clear';
  }

  playDaily() {
    playSound('click1');
    store.isDaily.value = true;
    this.show(dailyLevel(today()));
  }

  openSkins() {
    playSound('click1');
    this.showcase.showSkins(this.skinColor);
    this.stage.show(this.showcase);
    store.screen.value = 'skins';
  }

  closeSkins() {
    playSound('click1');
    this.showcase.stop();
    this.stage.show(null);
    store.screen.value = 'title';
  }

  chooseSkin(id: string) {
    playSound('switch2');
    this.update({ ...store.progress.value!, skin: id });
    this.player.setSkin(this.skinColor);
    this.showcase.previewSkin(this.skinColor);
  }

  next() {
    playSound('click1');
    store.isDaily.value = false;
    this.show(pickNextLevel(store.progress.value!));
    this.announceZone();
  }

  private announceZone() {
    const progress = store.progress.value!;
    if (progress.seenTips.includes(progress.zone) || store.isDaily.value) return;
    store.toast.value = ZONES[progress.zone].tip;
    this.update({ ...progress, seenTips: [...progress.seenTips, progress.zone] });
    gsap.delayedCall(6, () => (store.toast.value = null));
  }

  private show(level: LevelData, enter = true) {
    const board = boardOf(level);
    this.session = new LevelSession(board);
    this.busy = false;
    this.queued = null;
    this.stage.frameBoard(board.width, board.height);
    this.boardView.build(board);
    this.boardView.sync(this.session.state);
    this.player.place(board, board.start);
    this.player.popIn();
    store.level.value = level;
    store.levelNumber.value = Object.keys(store.progress.value!.best).length + 1;
    store.rewards.value = null;
    this.publish();
    if (enter) store.screen.value = 'play';
  }

  private publish() {
    store.moves.value = this.session.moves;
    store.falls.value = this.session.falls;
    store.restarts.value = this.session.restarts;
    store.stuck.value = this.session.isStuck;
    // Once paid for, the arrow keeps guiding for the rest of the level.
    this.player.showHint(this.session.hinted ? this.session.hint() : null);
  }

  input(direction: Direction) {
    if (store.screen.value === 'clear') return this.next();
    if (store.screen.value !== 'play') return;
    if (this.busy) {
      this.queued = direction; // one buffered input keeps fast players from feeling dropped
      return;
    }
    void this.perform(direction);
  }

  private async perform(direction: Direction) {
    this.busy = true;
    const session = this.session;
    const result = session.dash(direction);
    const board = session.board;
    this.coinChain = 0;

    if (result.outcome === 'blocked') playSound('tile-swap', 0.7);
    else playSound('jump', 0.9 + Math.random() * 0.2);

    await this.player.animate(direction, result, session.state.at, {
      onCell: (cell) => {
        this.effects.dust(cellPosition(board, cell, 0.1));
        this.boardView.wobble(cell);
        if (result.collected.includes(cell)) {
          // Rising pitch: a multi-coin dash sounds like a little melody.
          playSound('coin', 1 + this.coinChain++ * 0.14);
          this.effects.coin(cellPosition(board, cell, 0.4));
          this.boardView.hideCoin(cell);
        }
      },
      onImpact: () => {
        playSound('land');
        if (result.path.length >= 3) this.stage.shake(0.05);
      },
    });
    if (session !== this.session) return;

    if (result.outcome === 'fell') {
      playSound('fall');
      this.stage.shake(0.14);
      this.queued = null; // the plan died with the attempt
    }
    if (result.outcome === 'warped') playSound('tile-match', 1.5);

    this.boardView.sync(session.state);
    this.busy = false;
    this.publish();

    if (result.outcome === 'won') return this.finish();

    const queued = this.queued;
    this.queued = null;
    if (queued) void this.perform(queued);
  }

  private finish() {
    const level = store.level.value!;
    const { progress, rewards } = completeLevel(store.progress.value!, level, this.session.attempt, Math.random);
    const updated = store.isDaily.value ? completeDaily(progress, today()) : progress;
    this.update(updated);
    store.rewards.value = rewards;

    this.player.celebrate();
    this.effects.win(this.player.position.clone().setY(0.6), rewards.stars);
    this.stage.shake(0.08);
    playSound('tile-match', 0.9 + rewards.stars * 0.1);

    gsap.delayedCall(0.35, () => {
      if (store.rewards.value !== rewards || store.screen.value !== 'play') return;
      store.screen.value = rewards.chest ? 'chest' : 'clear';
      if (!rewards.chest) return;
      const prize = rewards.chest === 'bonus' ? this.skinColor : rewards.chest.color;
      const robot = this.player.position.clone();
      this.boardView.lowerFlag();
      this.stage.focusOn(ChestDrop.besideRobot(robot));
      this.chestDrop.enter(robot, {
        onLand: () => {
          playSound('land');
          this.stage.shake(0.1);
          this.player.arriveAt(ChestDrop.showOffSpot(robot));
        },
        onRattle: () => playSound('tile-swap', 0.8),
        onOpen: () => {
          playSound('break', 1.3);
          playSound('tile-match', 1.6);
          this.player.setSkin(prize); // a try-on: Keep current puts the old skin back
          this.player.showOff();
        },
      });
    });
  }

  /** Instant, free, no confirmation: the distance from failure to trying again must be zero. */
  retry() {
    if (store.screen.value !== 'play' && store.screen.value !== 'clear') return;
    playSound('switch2');
    if (store.screen.value === 'clear') return this.show(store.level.value!);
    if (this.busy) return;
    this.restartLevel();
  }

  private restartLevel() {
    this.session.restart();
    this.boardView.build(this.session.board);
    this.boardView.sync(this.session.state);
    this.player.place(this.session.board, this.session.state.at);
    this.player.popIn();
    this.publish();
  }

  skip() {
    if (store.screen.value !== 'play' || store.isDaily.value) return;
    playSound('click1');
    this.update(skipLevel(store.progress.value!, store.level.value!));
    this.show(pickNextLevel(store.progress.value!));
  }

  useHint() {
    if (store.screen.value !== 'play' || this.busy) return;
    // One charge unlocks the route for the whole level, so a hint always finishes the job.
    if (!this.session.hinted) {
      if (store.progress.value!.hints === 0) return;
      this.update(spendHint(store.progress.value!));
    }
    playSound('rollover1');
    // From an unwinnable position the only useful advice is to start again, so just do it.
    if (this.session.isStuck) this.restartLevel();
    this.session.hint();
    this.publish();
  }
}
