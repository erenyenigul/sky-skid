import type { Board } from '../src/domain/board';
import { dash, DIRECTIONS, type Direction, type GameState } from '../src/domain/game';
import { solve } from '../src/domain/solver';

export type Random = () => number;

export interface Persona {
  name: string;
  /** Plies of lookahead. 0 = blind, Infinity = perfect play. */
  lookahead: number;
  /** Chance of ignoring its own plan on any move. */
  slip: number;
  secondsPerMove: number;
  /** Moves tried per attempt, as a multiple of par, before restarting. */
  attemptBudget: number;
  /** Failed attempts before reaching for the hint button. */
  hintAfter: number;
  /** Replays a level for a better score this many times at most. */
  replays: number;
  /** Difficulty this player finds perfectly engaging. */
  flowDifficulty: number;
  frustrationPerFall: number;
  boredomPerEasyLevel: number;
}

export const PERSONAS: Persona[] = [
  { name: 'Naive', lookahead: 0, slip: 0, secondsPerMove: 1.2, attemptBudget: 3, hintAfter: 2, replays: 0, flowDifficulty: 5, frustrationPerFall: 1.5, boredomPerEasyLevel: 0 },
  { name: 'Casual', lookahead: 1, slip: 0.25, secondsPerMove: 2, attemptBudget: 3, hintAfter: 3, replays: 0, flowDifficulty: 8, frustrationPerFall: 2.5, boredomPerEasyLevel: 2 },
  { name: 'Decent', lookahead: 4, slip: 0.08, secondsPerMove: 2.5, attemptBudget: 3, hintAfter: 4, replays: 1, flowDifficulty: 12, frustrationPerFall: 2, boredomPerEasyLevel: 4 },
  { name: 'Pro', lookahead: 8, slip: 0.02, secondsPerMove: 2, attemptBudget: 2, hintAfter: 8, replays: 3, flowDifficulty: 17, frustrationPerFall: 1.5, boredomPerEasyLevel: 7 },
  { name: 'Oracle', lookahead: Infinity, slip: 0, secondsPerMove: 1, attemptBudget: 2, hintAfter: Infinity, replays: 0, flowDifficulty: 22, frustrationPerFall: 0, boredomPerEasyLevel: 9 },
];

const coinCount = (coins: number) => {
  let count = 0;
  for (let mask = coins; mask > 0; mask = Math.floor(mask / 2)) count += mask % 2;
  return count;
};

/** Best score reachable within `depth` dashes: coins now, faster wins worth more. */
function lookaheadValue(board: Board, state: GameState, depth: number): number {
  let best = coinCount(state.coins);
  if (depth === 0) return best;
  for (const direction of DIRECTIONS) {
    const result = dash(board, state, direction);
    if (result.outcome === 'won') return 1000 + depth;
    if (result.outcome === 'moved' || result.outcome === 'warped') {
      best = Math.max(best, lookaheadValue(board, result.state, depth - 1));
    }
  }
  return best;
}

const pick = <T,>(items: readonly T[], random: Random) => items[Math.floor(random() * items.length)];

/** Chooses the next dash the way this persona would; `seen` is the attempt's visited states. */
export function chooseMove(
  persona: Persona,
  board: Board,
  state: GameState,
  seen: ReadonlySet<string>,
  random: Random,
): Direction {
  const legal = DIRECTIONS.filter((direction) => dash(board, state, direction).outcome !== 'blocked');
  if (persona.lookahead === 0 || random() < persona.slip) return pick(legal, random);

  if (persona.lookahead === Infinity) return solve(board, { from: state })?.[0] ?? pick(legal, random);

  let best: Direction[] = [];
  let bestScore = -Infinity;
  for (const direction of legal) {
    const result = dash(board, state, direction);
    let score: number;
    if (result.outcome === 'won') score = 10_000;
    else if (result.outcome === 'fell') score = -10_000;
    else {
      score = lookaheadValue(board, result.state, persona.lookahead - 1);
      // Going in circles is the one thing every human notices.
      if (seen.has(`${result.state.at}:${result.state.coins}:${result.state.cracked}`)) score -= 0.5;
    }
    if (score > bestScore) [best, bestScore] = [[direction], score];
    else if (score === bestScore) best.push(direction);
  }
  return pick(best, random);
}
