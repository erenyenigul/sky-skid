import type { Board } from '../domain/board';
import { dash, initialState, type DashResult, type Direction, type GameState } from '../domain/game';
import { solve } from '../domain/solver';
import type { Attempt } from './progress';

/** One player's run at one level. Shared by the real game and the playtest bots. */
export class LevelSession {
  state: GameState;
  moves = 0;
  falls = 0;
  restarts = 0;
  hinted = false;
  won = false;

  constructor(readonly board: Board) {
    this.state = initialState(board);
  }

  get attempt(): Attempt {
    return { moves: this.moves, falls: this.falls, restarts: this.restarts, hinted: this.hinted };
  }

  dash(direction: Direction): DashResult {
    const result = dash(this.board, this.state, direction);
    if (result.outcome === 'fell') {
      this.falls++;
      this.reset();
    } else if (result.outcome !== 'blocked') {
      this.moves++;
      this.state = result.state;
      this.won = result.outcome === 'won';
    }
    return result;
  }

  restart() {
    this.reset();
    this.restarts++;
  }

  private reset() {
    this.moves = 0;
    this.state = initialState(this.board);
    this.won = false;
  }

  /** True when no sequence of dashes can win from here (a crumble burned the only way through). */
  get isStuck() {
    return !this.won && solve(this.board, { from: this.state }) === null;
  }

  /** Next dash on a shortest route. Taking one caps the level at two stars. */
  hint(): Direction | null {
    this.hinted = true;
    if (this.won) return null;
    return solve(this.board, { from: this.state })?.[0] ?? null;
  }
}
