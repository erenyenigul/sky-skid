import type { Board } from './board';
import { dash, DIRECTIONS, initialState, type Direction, type GameState } from './game';

const keyOf = ({ at, coins, cracked }: GameState) => `${at}:${coins}:${cracked}`;

export interface SolveOptions {
  from?: GameState;
  /** Cells the solution may not touch. */
  avoid?: ReadonlySet<number>;
}

/** Breadth-first search: returns a shortest winning dash sequence, or null if there is none. */
export function solve(board: Board, { from, avoid }: SolveOptions = {}): Direction[] | null {
  const origin = from ?? initialState(board);
  const seen = new Set([keyOf(origin)]);
  let frontier: { state: GameState; moves: Direction[] }[] = [{ state: origin, moves: [] }];

  while (frontier.length) {
    const next: typeof frontier = [];
    for (const { state, moves } of frontier) {
      for (const direction of DIRECTIONS) {
        const result = dash(board, state, direction);
        if (result.outcome === 'blocked' || result.outcome === 'fell') continue;
        if (avoid && result.path.some((cell) => avoid.has(cell))) continue;
        const nextMoves = [...moves, direction];
        if (result.outcome === 'won') return nextMoves;
        const key = keyOf(result.state);
        if (!seen.has(key)) {
          seen.add(key);
          next.push({ state: result.state, moves: nextMoves });
        }
      }
    }
    frontier = next;
  }
  return null;
}
