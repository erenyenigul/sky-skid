import { LEVELS, levelsInZone, ZONES, type LevelData } from './catalog';

export const SKINS = [
  { id: 'classic', name: 'Factory White', color: '#ffffff', rarity: 'common' },
  { id: 'mint', name: 'Mint Chip', color: '#9df2c8', rarity: 'common' },
  { id: 'peach', name: 'Peach Fuzz', color: '#ffc1a1', rarity: 'common' },
  { id: 'sky', name: 'Clear Sky', color: '#9ad8ff', rarity: 'common' },
  { id: 'lilac', name: 'Lilac Hour', color: '#d3b4ff', rarity: 'common' },
  { id: 'lemon', name: 'Lemon Drop', color: '#fff17a', rarity: 'rare' },
  { id: 'rose', name: 'Rose Alloy', color: '#ff8fb3', rarity: 'rare' },
  { id: 'teal', name: 'Deep Lagoon', color: '#3fc9c1', rarity: 'rare' },
  { id: 'ember', name: 'Ember', color: '#ff7043', rarity: 'epic' },
  { id: 'gold', name: 'Solid Gold', color: '#ffc21a', rarity: 'epic' },
] as const;

const RARITY_WEIGHT = { common: 6, rare: 3, epic: 1 };

export const CHEST_STARS = 18;
/** The bar starts part-filled: people push harder toward a goal already under way. */
const ENDOWED_STARS = 6;
const HINTS_PER_CHEST = 3;
export const STAR_SLACK = 2;
const MERCY_THRESHOLD = 2;
const STARTING_HINTS = 3;
const MAX_HINTS = 9;
const RECENT_MEMORY = 20;
/** Difficulty rises in waves: every so often a planned easy level, before anyone feels stuck. */
const BREATHER_EVERY = 4;
const BREATHER_DROP = 3;
/** Relief only helps people under pressure: a run of perfect clears earns no easy level. */
const NO_BREATHER_STREAK = 3;

export interface Progress {
  best: Record<string, { stars: number; moves: number }>;
  zone: number;
  clearedInZone: number;
  /** Rolling difficulty the player is ready for, within the current zone's sorted levels. */
  skill: number;
  struggles: number;
  perfectStreak: number;
  bestStreak: number;
  chestStars: number;
  hints: number;
  skipped: string[];
  recent: string[];
  skins: string[];
  skin: string;
  seenTips: number[];
  daily: { lastDay: string | null; streak: number };
}

export const newProgress = (): Progress => ({
  best: {},
  zone: 0,
  clearedInZone: 0,
  skill: 0,
  struggles: 0,
  perfectStreak: 0,
  bestStreak: 0,
  chestStars: ENDOWED_STARS,
  hints: STARTING_HINTS,
  skipped: [],
  recent: [],
  skins: ['classic'],
  skin: 'classic',
  seenTips: [],
  daily: { lastDay: null, streak: 0 },
});

export const starsFor = (moves: number, par: number, hinted = false) => {
  if (moves <= par && !hinted) return 3;
  return moves <= par + STAR_SLACK ? 2 : 1;
};

export const totalStars = (progress: Progress) =>
  Object.values(progress.best).reduce((sum, { stars }) => sum + stars, 0);

export interface Attempt {
  moves: number;
  falls: number;
  restarts: number;
  hinted: boolean;
}

export interface Rewards {
  stars: number;
  previousBest: number;
  /** Non-null when the player finished within reach of a better score. */
  nearMiss: { movesOff: number } | null;
  perfectStreak: number;
  newBestStreak: boolean;
  chest: (typeof SKINS)[number] | 'bonus' | null;
  zoneUnlocked: number | null;
}

const remember = (recent: readonly string[], id: string) => [...recent, id].slice(-RECENT_MEMORY);

function openChest(owned: readonly string[], random: () => number) {
  const locked = SKINS.filter((skin) => !owned.includes(skin.id));
  if (!locked.length) return 'bonus' as const;
  const total = locked.reduce((sum, skin) => sum + RARITY_WEIGHT[skin.rarity], 0);
  let roll = random() * total;
  return locked.find((skin) => (roll -= RARITY_WEIGHT[skin.rarity]) < 0) ?? locked[0];
}

export function completeLevel(
  progress: Progress,
  level: LevelData,
  attempt: Attempt,
  random: () => number,
): { progress: Progress; rewards: Rewards } {
  const stars = starsFor(attempt.moves, level.par, attempt.hinted);
  const previous = progress.best[level.id];
  const previousBest = previous?.stars ?? 0;
  const isCurrentZone = level.zone === progress.zone;
  const isNewClear = !previous && isCurrentZone;

  const earned = Math.max(0, stars - previousBest);
  const filled = progress.chestStars + earned;
  const chest = filled >= CHEST_STARS ? openChest(progress.skins, random) : null;

  const perfectStreak = stars === 3 ? progress.perfectStreak + 1 : 0;
  const clearedInZone = progress.clearedInZone + (isNewClear ? 1 : 0);
  const advance = clearedInZone >= ZONES[progress.zone].quota;

  const struggled = attempt.falls >= 3 || attempt.restarts >= 2 || attempt.hinted;
  const skillDelta = stars === 3 && attempt.falls === 0 ? 1 : struggled ? -1 : 0;

  const next: Progress = {
    ...progress,
    best: {
      ...progress.best,
      [level.id]: {
        stars: Math.max(stars, previousBest),
        moves: Math.min(attempt.moves, previous?.moves ?? Infinity),
      },
    },
    zone: advance ? progress.zone + 1 : progress.zone,
    clearedInZone: advance ? 0 : clearedInZone,
    skill: advance ? 0 : Math.max(0, progress.skill + skillDelta),
    struggles: struggled ? progress.struggles + 1 : 0,
    perfectStreak,
    bestStreak: Math.max(progress.bestStreak, perfectStreak),
    chestStars: chest ? filled - CHEST_STARS : filled,
    hints: chest ? Math.min(MAX_HINTS, progress.hints + HINTS_PER_CHEST) : progress.hints,
    skipped: progress.skipped.filter((id) => id !== level.id),
    recent: remember(progress.recent, level.id),
    skins: chest && chest !== 'bonus' ? [...progress.skins, chest.id] : progress.skins,
  };

  const movesOff = attempt.moves - level.par;
  return {
    progress: next,
    rewards: {
      stars,
      previousBest,
      nearMiss: stars < 3 && !attempt.hinted && movesOff <= STAR_SLACK + 1 ? { movesOff } : null,
      perfectStreak,
      newBestStreak: perfectStreak > progress.bestStreak && perfectStreak > 1,
      chest,
      zoneUnlocked: advance ? next.zone : null,
    },
  };
}

/**
 * Flow-channel level selection: walk the zone's difficulty-sorted levels at the player's own pace,
 * in waves, dropping back further after struggles.
 */
export function pickNextLevel(progress: Progress, levels: readonly LevelData[] = LEVELS): LevelData {
  const zoneLevels = [...levelsInZone(progress.zone, levels)].sort((a, b) => a.difficulty - b.difficulty);
  const unplayed = zoneLevels.filter((level) => !progress.best[level.id]);
  const fresh = unplayed.filter((level) => !progress.skipped.includes(level.id));
  const unperfected = zoneLevels.filter((level) => progress.best[level.id]?.stars < 3);
  const candidates = fresh.length ? fresh : unplayed.length ? unplayed : unperfected.length ? unperfected : zoneLevels;
  // Once content runs out, replays rotate: the same level must never come straight back.
  const rested = candidates.filter((level) => !progress.recent.includes(level.id));
  const pool = rested.length ? rested : zoneLevels.filter((level) => level.id !== progress.recent.at(-1));

  // A zone only asks for `quota` clears, so each clear walks a proportional stretch of its whole curve.
  const { quota } = ZONES[progress.zone];
  const stride = Number.isFinite(quota) ? zoneLevels.length / quota : 1;
  const breather =
    progress.clearedInZone % BREATHER_EVERY === BREATHER_EVERY - 1 && progress.perfectStreak < NO_BREATHER_STREAK;
  const steps =
    progress.clearedInZone +
    progress.skill -
    (progress.struggles >= MERCY_THRESHOLD ? 2 : 0) -
    (breather ? BREATHER_DROP : 0);
  const target = Math.round(steps * stride);
  const reference = zoneLevels[Math.max(0, Math.min(target, zoneLevels.length - 1))].difficulty;
  return pool.reduce((closest, level) =>
    Math.abs(level.difficulty - reference) < Math.abs(closest.difficulty - reference) ? level : closest,
  );
}

export const spendHint = (progress: Progress): Progress => ({ ...progress, hints: progress.hints - 1 });

/** The escape valve for a level that has beaten someone: no reward, and easier levels come next. */
export const skipLevel = (progress: Progress, level: LevelData): Progress => ({
  ...progress,
  skipped: [...progress.skipped, level.id],
  recent: remember(progress.recent, level.id),
  skill: Math.max(0, progress.skill - 1),
  struggles: progress.struggles + 1,
  perfectStreak: 0,
});

const dayBefore = (day: string) => {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
};

export const dailyLevel = (day: string, levels: readonly LevelData[] = LEVELS) => {
  const hash = [...day].reduce((sum, char) => (sum * 31 + char.charCodeAt(0)) >>> 0, 7);
  const pool = levelsInZone(ZONES.length - 1, levels);
  return pool[hash % pool.length];
};

export function completeDaily(progress: Progress, day: string): Progress {
  if (progress.daily.lastDay === day) return progress;
  const streak = progress.daily.lastDay === dayBefore(day) ? progress.daily.streak + 1 : 1;
  return { ...progress, daily: { lastDay: day, streak } };
}
