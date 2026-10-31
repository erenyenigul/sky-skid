import type { Board } from './board';

export type Direction = 'up' | 'down' | 'left' | 'right';
export const DIRECTIONS: readonly Direction[] = ['up', 'down', 'left', 'right'];

const DELTA: Record<Direction, [number, number]> = {
  up: [0, -1],
  down: [0, 1],
  left: [-1, 0],
  right: [1, 0],
};

export interface GameState {
  readonly at: number;
  readonly coins: number;
  readonly cracked: number;
}

export const initialState = (board: Board): GameState => ({ at: board.start, coins: 0, cracked: 0 });

export type TraceEnd = 'blocked' | 'stop' | 'fall' | 'warp';

/** The state-independent line a dash follows. Cracks and the flag can only cut it short. */
export interface Trace {
  readonly cells: readonly number[];
  readonly end: TraceEnd;
}

export function traceDash(board: Board, from: number, direction: Direction): Trace {
  const [dx, dy] = DELTA[direction];
  const cells: number[] = [];
  let x = from % board.width;
  let y = Math.floor(from / board.width);

  for (;;) {
    x += dx;
    y += dy;
    if (x < 0 || y < 0 || x >= board.width || y >= board.height) break;
    const cell = y * board.width + x;
    const tile = board.tiles[cell];
    if (tile === 'wall') break;
    cells.push(cell);
    if (tile === 'gap') return { cells, end: 'fall' };
    if (tile === 'cloud') return { cells, end: 'warp' };
    if (tile === 'grass') return { cells, end: 'stop' };
  }
  return { cells, end: cells.length ? 'stop' : 'blocked' };
}

/** Where a dash that runs to the end of its trace comes to rest. */
export const landing = (board: Board, from: number, trace: Trace): number => {
  const last = trace.cells.at(-1) ?? from;
  return trace.end === 'warp' ? board.twin.get(last)! : last;
};

export type Outcome = 'blocked' | 'moved' | 'warped' | 'fell' | 'won';

export interface DashResult {
  readonly state: GameState;
  readonly outcome: Outcome;
  /** Cells the player actually crossed, in order. */
  readonly path: readonly number[];
  readonly collected: readonly number[];
}

const bit = (mask: number, index: number) => Math.floor(mask / 2 ** index) % 2 === 1;
const withBit = (mask: number, index: number) => (bit(mask, index) ? mask : mask + 2 ** index);

export const hasCoin = (state: GameState, board: Board, cell: number) =>
  bit(state.coins, board.coinBit.get(cell)!);

export const isCracked = (state: GameState, board: Board, cell: number) => {
  const index = board.crumbleBit.get(cell);
  return index !== undefined && bit(state.cracked, index);
};

export function dash(board: Board, state: GameState, direction: Direction): DashResult {
  const trace = traceDash(board, state.at, direction);
  if (trace.end === 'blocked') return { state, outcome: 'blocked', path: [], collected: [] };

  let { coins, cracked } = state;
  const path: number[] = [];
  const collected: number[] = [];

  for (const cell of trace.cells) {
    path.push(cell);

    const crumble = board.crumbleBit.get(cell);
    if (crumble !== undefined) {
      if (bit(cracked, crumble)) return { state, outcome: 'fell', path, collected };
      cracked = withBit(cracked, crumble);
    }

    const coin = board.coinBit.get(cell);
    if (coin !== undefined && !bit(coins, coin)) {
      coins = withBit(coins, coin);
      collected.push(cell);
    }

    if (cell === board.flag && coins === board.allCoins) {
      return { state: { at: cell, coins, cracked }, outcome: 'won', path, collected };
    }
  }

  if (trace.end === 'fall') return { state, outcome: 'fell', path, collected };
  const at = landing(board, state.at, trace);
  return {
    state: { at, coins, cracked },
    outcome: trace.end === 'warp' ? 'warped' : 'moved',
    path,
    collected,
  };
}
