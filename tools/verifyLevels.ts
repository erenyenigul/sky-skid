import { readFileSync, writeFileSync } from 'node:fs';
import type { LevelData } from '../src/application/catalog';
import { parseBoard } from '../src/domain/board';
import { dash, initialState, type Direction } from '../src/domain/game';
import { solve } from '../src/domain/solver';
import { ZONE_SPECS } from './levelSpecs';
import { LevelProver } from './z3Encoding';

const levels: LevelData[] = JSON.parse(readFileSync('src/data/levels.json', 'utf8'));
const prover = await LevelProver.create();
const failures: string[] = [];
const report = [];
const startedAt = Date.now();

for (const level of levels) {
  const board = parseBoard(level.rows);
  const featured = level.id.startsWith('t') ? [] : ZONE_SPECS[level.zone].featured;
  const proof = await prover.prove(board, featured);
  const fail = (why: string) => failures.push(`${level.id}: ${why}`);

  if (!proof) {
    fail('P1 no winning line found');
    continue;
  }
  if (proof.par !== level.par) fail(`P2 proved par ${proof.par}, catalog says ${level.par}`);
  if (solve(board)?.length !== proof.par) fail('P2 BFS disagrees with Z3 on par');
  for (const [tile, required] of Object.entries(proof.required)) {
    if (!required) fail(`P3 winnable without ${tile}`);
  }
  if (proof.hazardReachable === false) fail('P4 gaps are decorative');

  // The witness must also win under the real game engine, not just the encoding.
  let state = initialState(board);
  const outcomes = proof.witness.map((move: Direction) => {
    const result = dash(board, state, move);
    state = result.state;
    return result.outcome;
  });
  if (outcomes.at(-1) !== 'won' || outcomes.slice(0, -1).some((o) => o === 'won' || o === 'fell' || o === 'blocked')) {
    fail(`P1 Z3 witness does not replay in the engine: ${outcomes.join(',')}`);
  }

  report.push({ id: level.id, zone: level.zone, par: proof.par, witness: proof.witness.join(' '), required: proof.required, requiredBound: proof.requiredBound, hazardReachable: proof.hazardReachable });
}

writeFileSync('reports/verification.json', `${JSON.stringify({ levels: report.length, failures, report }, null, 1)}\n`);
console.log(`Z3 checked ${levels.length} levels in ${((Date.now() - startedAt) / 1000).toFixed(1)}s`);
if (failures.length) {
  console.error(`${failures.length} FAILED:\n${failures.join('\n')}`);
  process.exit(1);
}
console.log('All passed: P1 completable, P2 par minimal, P3 mechanics essential, P4 hazards real.');
process.exit(0);
