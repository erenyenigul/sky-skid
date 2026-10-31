import type { Board } from '../domain/board';
import { dash, initialState, type DashResult, type Direction, type GameState } from '../domain/game';
import { solve } from '../domain/solver';
import type { Attempt } from './progress';

/** One player's run at one level. Shared by the real game and the playtest bots. */
export class LevelSession {
  private history: GameState[] = [];
  state: GameState;
  falls = 0;
  restarts = 0;
  hinted = false;
  won = false;

  constructor(readonly board: Board) {
    this.state = initialState(board);
  }

  get moves() {
    return this.history.length;
  }

  get attempt(): Attempt {
    return { moves: this.moves, falls: this.falls, hinted: this.hinted };
  }

  dash(direction: Direction): DashResult {
    const result = dash(this.board, this.state, direction);
    // A fall leaves state untouched: the dash is rewound, only the fall is remembered.
    if (result.outcome === 'fell') this.falls++;
    else if (result.outcome !== 'blocked') {
      this.history.push(this.state);
      this.state = result.state;
      this.won = result.outcome === 'won';
    }
    return result;
  }

  undo() {
    const previous = this.history.pop();
    if (previous) this.state = previous;
    return !!previous;
  }

  restart() {
    this.history = [];
    this.state = initialState(this.board);
    this.won = false;
    this.restarts++;
  }

  /** True when no sequence of dashes can win from here (a crumble burned the only way through). */
  get isStuck() {
    return !this.won && solve(this.board, { from: this.state }) === null;
  }

  /** Next dash on a shortest route. Taking one caps the level at two stars. */
  hint(): Direction | null {
    this.hinted = true;
    return solve(this.board, { from: this.state })?.[0] ?? null;
  }
}
