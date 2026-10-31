import { init, type Bool, type Context } from 'z3-solver';
import type { Board } from '../src/domain/board';
import { DIRECTIONS, landing, traceDash, type Direction } from '../src/domain/game';

type Ctx = Context<'main'>;

const WON = -1;

/** One way a dash can play out from a position, with the guards that make it possible. */
interface Transition {
  from: number;
  direction: number;
  to: number;
  coins: number; // coins gained
  coinsAtFlag: number; // coins gained by the moment the dash reaches the flag
  crumbles: number; // crumbles crossed
  /** Coins held at the flag must (win) or must not (pass through) equal all coins. */
  flag: 'absent' | 'wins' | 'passes';
  touched: readonly number[];
}

const maskOf = (bits: ReadonlyMap<number, number>, cells: readonly number[]) =>
  cells.reduce((mask, cell) => (bits.has(cell) ? mask + 2 ** bits.get(cell)! : mask), 0);

/** Enumerates dash outcomes over the statically reachable positions, so the encoding stays small. */
function transitionsOf(board: Board) {
  const transitions: Transition[] = [];
  const lethal = new Set<number>();
  const visited = new Set<number>();
  const queue = [board.start];

  while (queue.length) {
    const from = queue.pop()!;
    if (visited.has(from)) continue;
    visited.add(from);

    DIRECTIONS.forEach((direction, index) => {
      const trace = traceDash(board, from, direction);
      if (trace.end === 'blocked') return;

      const base = { from, direction: index };
      const flagAt = trace.cells.indexOf(board.flag);
      const before = trace.cells.slice(0, flagAt + 1);
      const coinsAtFlag = maskOf(board.coinBit, before);
      if (flagAt >= 0) {
        transitions.push({
          ...base,
          to: WON,
          coins: coinsAtFlag,
          coinsAtFlag,
          crumbles: maskOf(board.crumbleBit, before),
          flag: 'wins',
          touched: before,
        });
      }
      if (trace.end === 'fall') {
        lethal.add(from);
        return;
      }

      const to = landing(board, from, trace);
      queue.push(to);
      transitions.push({
        ...base,
        to,
        coins: maskOf(board.coinBit, trace.cells),
        coinsAtFlag,
        crumbles: maskOf(board.crumbleBit, trace.cells),
        flag: flagAt >= 0 ? 'passes' : 'absent',
        touched: trace.cells,
      });
    });
  }
  return { transitions, lethal };
}

/** Bounded model of the game rules: an unrolled path of `at`, `coins` and `cracked` over dashes. */
class BoardModel {
  readonly solver;
  private unrolled = 0;
  private readonly coinWidth;
  private readonly crumbleWidth;

  constructor(
    private readonly ctx: Ctx,
    private readonly board: Board,
    private readonly transitions: readonly Transition[],
  ) {
    this.solver = new ctx.Solver();
    this.coinWidth = Math.max(1, board.coinBit.size);
    this.crumbleWidth = Math.max(1, board.crumbleBit.size);
    this.solver.add(this.at(0).eq(board.start), this.coins(0).eq(ctx.BitVec.val(0, this.coinWidth)), this.cracked(0).eq(ctx.BitVec.val(0, this.crumbleWidth)));
  }

  at = (t: number) => this.ctx.Int.const(`at_${t}`);
  coins = (t: number) => this.ctx.BitVec.const(`coins_${t}`, this.coinWidth);
  cracked = (t: number) => this.ctx.BitVec.const(`cracked_${t}`, this.crumbleWidth);
  move = (t: number) => this.ctx.Int.const(`move_${t}`);

  private step(t: number) {
    const { ctx, board, coinWidth, crumbleWidth } = this;
    const allCoins = ctx.BitVec.val(board.allCoins, coinWidth);

    return ctx.Or(
      ...this.transitions.map((transition) => {
        const crossed = ctx.BitVec.val(transition.crumbles, crumbleWidth);
        const coinsAfter = this.coins(t).or(ctx.BitVec.val(transition.coins, coinWidth));
        const flagOpen = this.coins(t).or(ctx.BitVec.val(transition.coinsAtFlag, coinWidth)).eq(allCoins);
        const flagGuard =
          transition.flag === 'wins'
            ? flagOpen
            : transition.flag === 'passes'
              ? ctx.Not(flagOpen)
              : ctx.Bool.val(true);
        return ctx.And(
          this.at(t).eq(transition.from),
          this.move(t).eq(transition.direction),
          this.cracked(t).and(crossed).eq(ctx.BitVec.val(0, crumbleWidth)), // re-crossing a cracked crumble is a fall
          flagGuard,
          this.coins(t + 1).eq(coinsAfter),
          this.cracked(t + 1).eq(this.cracked(t).or(crossed)),
          this.at(t + 1).eq(transition.to),
        );
      }),
    );
  }

  unrollTo(moves: number) {
    for (; this.unrolled < moves; this.unrolled++) this.solver.add(this.step(this.unrolled));
  }

  /** Is `goal` satisfiable once exactly `moves` dashes are unrolled? */
  async check(moves: number, goal: Bool<'main'>) {
    this.unrollTo(moves);
    this.solver.push();
    this.solver.add(goal);
    const verdict = await this.solver.check();
    const witness = verdict === 'sat' ? this.readMoves(moves) : null;
    this.solver.pop();
    if (verdict === 'unknown') throw new Error('Z3 returned unknown');
    return witness;
  }

  private readMoves(moves: number) {
    const model = this.solver.model();
    return Array.from({ length: moves }, (_, t) =>
      DIRECTIONS[Number(model.eval(this.move(t), true).toString())],
    );
  }

  won = (t: number) => this.at(t).eq(WON);
  atAny = (t: number, cells: Iterable<number>) =>
    this.ctx.Or(...[...cells].map((cell) => this.at(t).eq(cell)));
}

export interface LevelProof {
  /** P1: a concrete winning line exists. */
  witness: Direction[];
  /** P2: UNSAT for every shorter length, so `par` is the true minimum. */
  par: number;
  /** P3: per featured tile, no win avoids it within `requiredBound` dashes (UNSAT). */
  required: Record<string, boolean>;
  requiredBound: number;
  /** P4: a lethal dash is reachable within par moves, so gaps are real threats, not scenery. */
  hazardReachable: boolean | null;
}

export class LevelProver {
  private constructor(private readonly ctx: Ctx) {}

  static async create() {
    const { Context } = await init();
    return new LevelProver(Context('main'));
  }

  /** Length-ascending search: the first SAT length is minimal because all shorter ones were UNSAT. */
  private async shortestWin(board: Board, transitions: readonly Transition[], maxMoves: number) {
    if (!transitions.length) return null;
    const model = new BoardModel(this.ctx, board, transitions);
    for (let moves = 1; moves <= maxMoves; moves++) {
      const witness = await model.check(moves, model.won(moves));
      if (witness) return witness;
    }
    return null;
  }

  async prove(board: Board, featured: readonly string[], maxMoves = 40): Promise<LevelProof | null> {
    const { transitions, lethal } = transitionsOf(board);
    const witness = await this.shortestWin(board, transitions, maxMoves);
    if (!witness) return null;

    const par = witness.length;
    const requiredBound = par + 8;
    const required: Record<string, boolean> = {};
    for (const tile of featured) {
      if (tile === 'gap') continue;
      const allowed = transitions.filter((transition) =>
        transition.touched.every((cell) => board.tiles[cell] !== tile),
      );
      required[tile] = (await this.shortestWin(board, allowed, requiredBound)) === null;
    }

    let hazardReachable: boolean | null = null;
    if (featured.includes('gap')) {
      hazardReachable = false;
      if (lethal.size) {
        const model = new BoardModel(this.ctx, board, transitions);
        for (let moves = 0; moves <= par && !hazardReachable; moves++) {
          hazardReachable = (await model.check(moves, model.atAny(moves, lethal))) !== null;
        }
      }
    }

    return { witness, par, required, requiredBound, hazardReachable };
  }
}
