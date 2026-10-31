import { boardOf, type LevelData } from '../src/application/catalog';
import { completeLevel, newProgress, pickNextLevel, skipLevel, spendHint, type Attempt, type Progress } from '../src/application/progress';
import { LevelSession } from '../src/application/session';
import { chooseMove, type Persona, type Random } from './bots';

export type QuitReason = 'frustration' | 'boredom' | 'time-up';

/**
 * ASSUMED player model, not measured data. Engagement is a budget: rewards refill it, falls and
 * flat stretches drain it, and the player leaves at zero. Useful for comparing builds and finding
 * difficulty spikes; it cannot prove real people find the game fun.
 */
const MODEL = {
  startingEngagement: 40,
  maxEngagement: 100,
  drainPerMove: 0.12,
  clearReward: 3,
  rewardPerStar: 1,
  chestReward: 6,
  newZoneReward: 12,
  flowBandwidth: 4,
  flowBonus: 3,
  restartPenalty: 2,
  hintPenalty: 3,
  skipPenalty: 8,
  sessionMinutesCap: 30,
};

export interface LevelStat {
  id: string;
  stars: number;
  falls: number;
  restarts: number;
  hinted: boolean;
  gaveUp: boolean;
}

interface Played {
  attempt: Attempt;
  restarts: number;
  seconds: number;
  gaveUp: boolean;
  frustration: number;
}

function playLevel(persona: Persona, level: LevelData, hintsLeft: number, random: Random): Played {
  const board = boardOf(level);
  const session = new LevelSession(board);
  const budget = Math.ceil(level.par * persona.attemptBudget) + 2;
  let seconds = 0;
  let seen = new Set<string>();

  while (!session.won) {
    if (session.moves >= budget || session.isStuck) {
      session.restart();
      seen = new Set();
    }
    const failures = session.restarts + session.falls; // a fall also ends the attempt
    if (failures >= persona.hintAfter + 4 || (failures >= persona.hintAfter && hintsLeft === 0)) {
      return { attempt: session.attempt, restarts: session.restarts, seconds, gaveUp: true, frustration: session.falls * persona.frustrationPerFall };
    }
    const usingHint = failures >= persona.hintAfter;
    const direction = usingHint
      ? session.hint()!
      : chooseMove(persona, board, session.state, seen, random);
    if (session.dash(direction).outcome === 'fell') seen = new Set();
    seen.add(`${session.state.at}:${session.state.coins}:${session.state.cracked}`);
    seconds += persona.secondsPerMove;
  }
  return { attempt: session.attempt, restarts: session.restarts, seconds, gaveUp: false, frustration: session.falls * persona.frustrationPerFall };
}

export interface SessionResult {
  progress: Progress;
  levels: LevelStat[];
  minutes: number;
  quit: QuitReason;
  engagementAtEnd: number;
}

export function playSession(persona: Persona, start: Progress, random: Random): SessionResult {
  let progress = start;
  let engagement = MODEL.startingEngagement;
  let seconds = 0;
  let frustration = 0;
  let boredom = 0;
  const levels: LevelStat[] = [];

  const drainTo = (amount: number, bucket: 'frustration' | 'boredom') => {
    engagement -= amount;
    if (bucket === 'frustration') frustration += amount;
    else boredom += amount;
  };

  for (;;) {
    const level = pickNextLevel(progress);
    const played = playLevel(persona, level, progress.hints, random);
    seconds += played.seconds;

    drainTo(played.frustration, 'frustration');
    drainTo(played.restarts * MODEL.restartPenalty, 'frustration');
    drainTo(played.attempt.moves * MODEL.drainPerMove, 'boredom');

    if (played.gaveUp) {
      levels.push({ id: level.id, stars: 0, falls: played.attempt.falls, restarts: played.restarts, hinted: played.attempt.hinted, gaveUp: true });
      progress = skipLevel(progress, level);
      drainTo(MODEL.skipPenalty, 'frustration');
      if (engagement <= 0) {
        return { progress, levels, minutes: seconds / 60, quit: 'frustration', engagementAtEnd: engagement };
      }
      continue;
    }

    if (played.attempt.hinted) progress = spendHint(progress);
    const { progress: next, rewards } = completeLevel(progress, level, played.attempt, random);
    progress = next;
    levels.push({ id: level.id, stars: rewards.stars, falls: played.attempt.falls, restarts: played.restarts, hinted: played.attempt.hinted, gaveUp: false });

    if (played.attempt.hinted) drainTo(MODEL.hintPenalty, 'frustration');
    engagement += MODEL.clearReward + rewards.stars * MODEL.rewardPerStar;
    if (rewards.chest) engagement += MODEL.chestReward;
    if (rewards.zoneUnlocked !== null) engagement += MODEL.newZoneReward;

    const distance = level.difficulty - persona.flowDifficulty;
    if (Math.abs(distance) <= MODEL.flowBandwidth) engagement += MODEL.flowBonus;
    else if (distance < 0) drainTo(persona.boredomPerEasyLevel, 'boredom');
    engagement = Math.min(engagement, MODEL.maxEngagement);

    if (engagement <= 0) {
      return { progress, levels, minutes: seconds / 60, quit: frustration >= boredom ? 'frustration' : 'boredom', engagementAtEnd: engagement };
    }
    if (seconds / 60 >= MODEL.sessionMinutesCap) {
      return { progress, levels, minutes: seconds / 60, quit: 'time-up', engagementAtEnd: engagement };
    }
  }
}

/** ASSUMED: leaving because life called brings people back more than leaving annoyed. */
export const RETURN_CHANCE: Record<QuitReason, number> = { 'time-up': 0.85, boredom: 0.35, frustration: 0.3 };

export interface PlayerResult {
  sessions: SessionResult[];
  daysActive: number;
}

export function simulatePlayer(persona: Persona, days: number, random: Random): PlayerResult {
  const sessions: SessionResult[] = [];
  let progress = newProgress();
  let daysActive = 0;
  for (let day = 0; day < days; day++) {
    const session = playSession(persona, progress, random);
    sessions.push(session);
    progress = session.progress;
    daysActive++;
    if (random() > RETURN_CHANCE[session.quit]) break;
  }
  return { sessions, daysActive };
}
