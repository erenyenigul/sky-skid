import { describe, expect, it } from 'vitest';
import { LEVELS, ZONES } from '../src/application/catalog';
import { completeDaily, completeLevel, dailyLevel, newProgress, pickNextLevel, skipLevel, starsFor } from '../src/application/progress';

const random = () => 0.5;
const perfect = (par: number) => ({ moves: par, falls: 0, hinted: false });

describe('stars', () => {
  it('rewards par with three, slack with two, hints cap at two', () => {
    expect(starsFor(5, 5)).toBe(3);
    expect(starsFor(7, 5)).toBe(2);
    expect(starsFor(8, 5)).toBe(1);
    expect(starsFor(5, 5, true)).toBe(2);
  });
});

describe('progression', () => {
  it('flags near misses so the retry prompt can fire', () => {
    const level = LEVELS[0];
    const { rewards } = completeLevel(newProgress(), level, { moves: level.par + 1, falls: 0, hinted: false }, random);
    expect(rewards.nearMiss).toEqual({ movesOff: 1 });
  });

  it('never lowers a best score', () => {
    const level = LEVELS[0];
    const first = completeLevel(newProgress(), level, perfect(level.par), random).progress;
    const second = completeLevel(first, level, { moves: level.par + 9, falls: 0, hinted: false }, random).progress;
    expect(second.best[level.id].stars).toBe(3);
  });

  it('opens a chest after enough stars and grants a new skin', () => {
    let progress = newProgress();
    let chests = 0;
    for (const level of LEVELS.slice(0, 2)) {
      const result = completeLevel(progress, level, perfect(level.par), random);
      progress = result.progress;
      if (result.rewards.chest) chests++;
    }
    expect(chests).toBe(1);
    expect(progress.skins.length).toBe(2);
  });

  it('walks a perfect player through every zone without repeating levels', () => {
    let progress = newProgress();
    const seen = new Set<string>();
    for (let played = 0; progress.zone < ZONES.length - 1; played++) {
      expect(played).toBeLessThan(200);
      const level = pickNextLevel(progress);
      expect(seen.has(level.id)).toBe(false);
      seen.add(level.id);
      progress = completeLevel(progress, level, perfect(level.par), random).progress;
    }
  });

  it('never runs out of levels in the endless zone', () => {
    let progress = { ...newProgress(), zone: ZONES.length - 1 };
    for (let played = 0; played < 200; played++) {
      const level = pickNextLevel(progress);
      progress = completeLevel(progress, level, perfect(level.par), random).progress;
    }
  });

  it('never repeats a level back to back once the endless zone is used up', () => {
    let progress = { ...newProgress(), zone: ZONES.length - 1 };
    for (let played = 0; played < 300; played++) {
      const level = pickNextLevel(progress);
      expect(progress.recent.at(-1)).not.toBe(level.id);
      const moves = played % 2 ? level.par : level.par + 1;
      progress = completeLevel(progress, level, { moves, falls: 0, hinted: false }, random).progress;
    }
  });

  it('never serves a skipped level while fresh ones remain', () => {
    const progress = newProgress();
    const level = pickNextLevel(progress);
    expect(pickNextLevel(skipLevel(progress, level)).id).not.toBe(level.id);
  });

  it('serves easier levels after repeated struggles', () => {
    const steady = { ...newProgress(), zone: 3, clearedInZone: 5 };
    const struggling = { ...steady, struggles: 3 };
    expect(pickNextLevel(struggling).difficulty).toBeLessThan(pickNextLevel(steady).difficulty);
  });
});

describe('daily', () => {
  it('extends the streak on consecutive days only', () => {
    let progress = completeDaily(newProgress(), '2026-03-01');
    progress = completeDaily(progress, '2026-03-02');
    progress = completeDaily(progress, '2026-03-02');
    expect(progress.daily.streak).toBe(2);
    expect(completeDaily(progress, '2026-03-09').daily.streak).toBe(1);
  });

  it('is deterministic per day', () => {
    expect(dailyLevel('2026-03-01').id).toBe(dailyLevel('2026-03-01').id);
  });
});
