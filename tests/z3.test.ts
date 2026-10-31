import { beforeAll, describe, expect, it } from 'vitest';
import { LEVELS } from '../src/application/catalog';
import { parseBoard } from '../src/domain/board';
import { solve } from '../src/domain/solver';
import { LevelProver } from '../tools/z3Encoding';

let prover: LevelProver;
beforeAll(async () => {
  prover = await LevelProver.create();
}, 60_000);

describe('Z3 encoding', () => {
  it('rejects impossible boards', async () => {
    expect(await prover.prove(parseBoard(['S#F']), [], 6)).toBeNull();
    expect(await prover.prove(parseBoard(['So#F']), [], 6)).toBeNull();
  });

  it('understands that a cracked crumble cannot be crossed twice', async () => {
    // The only way to the flag re-crosses the crumble, so the coin makes this unwinnable.
    const rows = ['#o#', 'SxF'];
    expect(solve(parseBoard(rows))).toBeNull();
    expect(await prover.prove(parseBoard(rows), [], 8)).toBeNull();
  });

  it('proves a tile essential only when it is', async () => {
    const needed = await prover.prove(parseBoard(['Sg', '#F']), ['grass']);
    expect(needed?.required.grass).toBe(true);
    const optional = await prover.prove(parseBoard(['Sg.', '..F']), ['grass']);
    expect(optional?.required.grass).toBe(false);
  });

  it('detects whether gaps are a reachable threat', async () => {
    expect((await prover.prove(parseBoard(['S.F', '~##']), ['gap']))?.hazardReachable).toBe(true);
    expect((await prover.prove(parseBoard(['S.F', '###', '~..']), ['gap']))?.hazardReachable).toBe(false);
  });

  it('agrees with the independent BFS on a sample of shipped levels', async () => {
    for (const level of LEVELS.filter((_, index) => index % 12 === 0)) {
      const board = parseBoard(level.rows);
      const proof = await prover.prove(board, []);
      expect(proof?.par, level.id).toBe(solve(board)?.length);
    }
  }, 120_000);
});
