import { CHEST_STARS, SKINS, starsFor, totalStars, type Rewards } from '../../application/progress';
import { ZONES } from '../../application/catalog';
import type { Direction } from '../../domain/game';
import type { GameController } from '../gameController';
import * as store from '../store';

const ARROW: Record<Direction, string> = { up: '↑', down: '↓', left: '←', right: '→' };

const Stars = ({ count, size = '' }: { count: number; size?: string }) => (
  <span class={`stars ${size}`} aria-label={`${count} of 3 stars`}>
    {[1, 2, 3].map((n) => (
      <i key={n} class={n <= count ? 'star on' : 'star'} />
    ))}
  </span>
);

const Button = ({ color = 'blue', nudge = false, onClick, children, testId }: { color?: string; nudge?: boolean; onClick: () => void; children: preact.ComponentChildren; testId?: string }) => (
  <button class={`kenney-btn ${color} ${nudge ? 'nudge' : ''}`} onClick={onClick} data-testid={testId}>
    {children}
  </button>
);

function nearMissLine(rewards: Rewards) {
  if (rewards.stars === 3) {
    return rewards.perfectStreak > 1 ? `Perfect! ${rewards.perfectStreak} in a row` : 'Perfect. Mathematically, it cannot be done in fewer.';
  }
  if (!rewards.nearMiss) return 'Cleared. There is a much shorter way...';
  const { movesOff } = rewards.nearMiss;
  return `So close: only ${movesOff} ${movesOff === 1 ? 'move' : 'moves'} away from perfect!`;
}

function TopBar() {
  const level = store.level.value!;
  const progress = store.progress.value!;
  const preview = starsFor(Math.max(store.moves.value, level.par), level.par);
  return (
    <div class="top-bar">
      <div class="kenney-panel chip">
        <small>{store.isDaily.value ? 'Daily sky' : ZONES[progress.zone].name}</small>
        <b>{store.isDaily.value ? today() : `Level ${store.levelNumber.value}`}</b>
      </div>
      <div class="kenney-panel chip center" data-testid="moves" data-level={level.id}>
        <b>
          {store.moves.value} <small>/ par {level.par}</small>
        </b>
        <Stars count={preview} />
      </div>
      <div class="kenney-panel chip" title="Earn stars to open a chest">
        <small>Next chest</small>
        <div class="meter">
          <i style={{ width: `${(100 * progress.chestStars) / CHEST_STARS}%` }} />
        </div>
      </div>
    </div>
  );
}

const today = () => new Date().toISOString().slice(0, 10);

function PlayControls({ game }: { game: GameController }) {
  const struggling = store.falls.value >= 3 || store.restarts.value >= 2 || store.stuck.value;
  const { hints } = store.progress.value!;
  return (
    <div class="controls">
      {store.stuck.value && <div class="kenney-panel stuck-note">No way through from here. Undo or restart.</div>}
      {store.hintDirection.value && <div class="kenney-panel hint-note">Try {ARROW[store.hintDirection.value]}</div>}
      <div class="row">
        <Button color="grey" onClick={() => game.undo()}>Undo <kbd>Z</kbd></Button>
        <Button color="grey" onClick={() => game.retry()}>Restart <kbd>R</kbd></Button>
        <Button color={struggling && hints ? 'yellow' : 'grey'} nudge={struggling && hints > 0} onClick={() => game.useHint()}>Hint ({hints}) <kbd>H</kbd></Button>
        {struggling && !store.isDaily.value && <Button color="grey" onClick={() => game.skip()} testId="skip">Skip</Button>}
      </div>
    </div>
  );
}

function ClearDialog({ game }: { game: GameController }) {
  const rewards = store.rewards.value!;
  const retryFirst = rewards.stars < 3 && !!rewards.nearMiss;
  const chest = rewards.chest;
  return (
    <div class="scrim">
      <div class="kenney-panel dialog" data-testid="clear-dialog">
        <Stars count={rewards.stars} size="big" />
        <p>{nearMissLine(rewards)}</p>
        {rewards.newBestStreak && <p class="accent">New best streak!</p>}
        {chest && (
          <div class="kenney-panel yellow reward">
            {chest === 'bonus' ? 'Chest opened: every skin is already yours!' : (
              <>Chest opened: <b style={{ color: chest.color }} class="outlined">{chest.name}</b> ({chest.rarity})</>
            )}
          </div>
        )}
        {rewards.zoneUnlocked !== null && (
          <div class="kenney-panel green reward">Unlocked {ZONES[rewards.zoneUnlocked].name}. A new rule awaits.</div>
        )}
        <div class="row">
          <Button color={retryFirst ? 'yellow' : 'grey'} nudge={retryFirst} onClick={() => game.retry()}>Retry <kbd>R</kbd></Button>
          <Button color={retryFirst ? 'grey' : 'green'} onClick={() => game.next()} testId="next">Next <kbd>↵</kbd></Button>
        </div>
      </div>
    </div>
  );
}

function TitleScreen({ game }: { game: GameController }) {
  const progress = store.progress.value!;
  const doneToday = progress.daily.lastDay === today();
  return (
    <div class="scrim light">
      <h1 class="logo">Sky Skid</h1>
      <div class="kenney-panel dialog">
        <p>
          <i class="star on inline" /> {totalStars(progress)} stars
          {progress.daily.streak > 0 && <> · {progress.daily.streak} day streak</>}
        </p>
        <Button color="green" onClick={() => game.play()} testId="play">
          {Object.keys(progress.best).length ? 'Keep climbing' : 'Play'} <kbd>↵</kbd>
        </Button>
        <Button color="yellow" onClick={() => game.playDaily()} testId="daily">
          {doneToday ? 'Replay daily sky' : 'Daily sky'}
        </Button>
        <Button color="blue" onClick={() => game.openSkins()} testId="skins">
          Skins {progress.skins.length}/{SKINS.length}
        </Button>
      </div>
    </div>
  );
}

function SkinsDialog({ game }: { game: GameController }) {
  const progress = store.progress.value!;
  return (
    <div class="scrim">
      <div class="kenney-panel dialog wide">
        <h2>Skins</h2>
        <div class="skin-grid">
          {SKINS.map((skin) => {
            const owned = progress.skins.includes(skin.id);
            return (
              <button
                key={skin.id}
                class={`kenney-panel skin ${progress.skin === skin.id ? 'selected' : ''}`}
                disabled={!owned}
                onClick={() => game.chooseSkin(skin.id)}
              >
                <i class="swatch" style={{ background: owned ? skin.color : '#9aa0a8' }} />
                <small>{owned ? skin.name : `??? ${skin.rarity}`}</small>
              </button>
            );
          })}
        </div>
        <Button onClick={() => game.closeSkins()}>Back</Button>
      </div>
    </div>
  );
}

export function Hud({ game }: { game: GameController }) {
  const screen = store.screen.value;
  if (!store.progress.value || !store.level.value) return null;
  return (
    <>
      {screen !== 'title' && screen !== 'skins' && <TopBar />}
      {screen === 'play' && <PlayControls game={game} />}
      {screen === 'play' && store.toast.value && <div class="kenney-panel yellow toast">{store.toast.value}</div>}
      {screen === 'clear' && store.rewards.value && <ClearDialog game={game} />}
      {screen === 'title' && <TitleScreen game={game} />}
      {screen === 'skins' && <SkinsDialog game={game} />}
    </>
  );
}
