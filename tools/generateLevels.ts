import { writeFileSync } from 'node:fs';
import seedrandom from 'seedrandom';
import type { LevelData } from '../src/application/catalog';
import { parseBoard, type Board } from '../src/domain/board';
import { dash, DIRECTIONS, initialState, type GameState } from '../src/domain/game';
import { solve } from '../src/domain/solver';
import { TUTORIAL_LEVELS, ZONE_SPECS, type ZoneSpec } from './levelSpecs';
import { LevelProver } from './z3Encoding';

type Random = () => number;

const between = (random: Random, [low, high]: [number, number]) =>
  low + Math.floor(random() * (high - low + 1));

function randomRows(spec: ZoneSpec, random: Random): string[] {
  const size = between(random, spec.size);
  const glyphs = [
    'S',
    'F',
    ...'o'.repeat(between(random, spec.coins)),
    ...'#'.repeat(between(random, spec.walls)),
    ...'~'.repeat(between(random, spec.gaps)),
    ...'g'.repeat(between(random, spec.grass)),
    ...'x'.repeat(between(random, spec.crumbles)),
    ...(spec.clouds ? 'cc' : ''),
  ];
  const cells = Array.from({ length: size * size }, (_, i) => glyphs[i] ?? '.');
  for (let i = cells.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [cells[i], cells[j]] = [cells[j], cells[i]];
  }
  return Array.from({ length: size }, (_, row) => cells.slice(row * size, (row + 1) * size).join(''));
}

/** How often someone mashing random moves wins: the empirical base of the difficulty score. */
function randomWalkWinRate(board: Board, random: Random, par: number, trials = 200) {
  let wins = 0;
  for (let trial = 0; trial < trials; trial++) {
    let state: GameState = initialState(board);
    for (let move = 0; move < par * 3; move++) {
      const result = dash(board, state, DIRECTIONS[Math.floor(random() * 4)]);
      if (result.outcome === 'won') wins++;
      if (result.outcome === 'won' || result.outcome === 'fell') break;
      state = result.state;
    }
  }
  return wins / trials;
}

const difficultyOf = (par: number, winRate: number) =>
  +(par + 2 * -Math.log10(Math.max(winRate, 1 / 400))).toFixed(2);

/** Fast filter with BFS; Z3 then proves whatever survives, so a disagreement is a hard error. */
function isCandidate(rows: string[], spec: ZoneSpec) {
  const board = parseBoard(rows);
  const solution = solve(board);
  if (!solution || solution.length < spec.par[0] || solution.length > spec.par[1]) return null;
  for (const tile of spec.featured) {
    if (tile === 'gap') continue;
    const avoid = new Set(board.tiles.flatMap((candidate, cell) => (candidate === tile ? [cell] : [])));
    if (solve(board, { avoid })) return null;
  }
  return { board, solution };
}

const prover = await LevelProver.create();
const random = seedrandom('sky-skid-1');
const levels: LevelData[] = [];

async function admit(rows: string[], zone: number, id: string, featured: string[]) {
  const board = parseBoard(rows);
  const proof = await prover.prove(board, featured);
  if (!proof) throw new Error(`Z3 could not solve ${id}:\n${rows.join('\n')}`);
  const bfs = solve(board)!;
  if (proof.par !== bfs.length) throw new Error(`Z3 par ${proof.par} != BFS par ${bfs.length} on ${id}`);
  if (Object.values(proof.required).includes(false) || proof.hazardReachable === false) return false;
  levels.push({
    id,
    zone,
    rows,
    par: proof.par,
    difficulty: difficultyOf(proof.par, randomWalkWinRate(board, random, proof.par)),
    witness: proof.witness,
  });
  return true;
}

for (const [index, rows] of TUTORIAL_LEVELS.entries()) {
  await admit(rows, 0, `t${index + 1}`, []);
}

for (const spec of ZONE_SPECS) {
  const seen = new Set<string>();
  const perPar = Math.ceil(spec.count / (spec.par[1] - spec.par[0] + 1)) + 1;
  const parCount = new Map<number, number>();
  let admitted = 0;
  for (let attempt = 0; admitted < spec.count; attempt++) {
    if (attempt > 3_000_000) throw new Error(`Zone ${spec.zone} starved at ${admitted}/${spec.count}`);
    const rows = randomRows(spec, random);
    const key = rows.join('/');
    if (seen.has(key)) continue;
    seen.add(key);
    const candidate = isCandidate(rows, spec);
    if (!candidate) continue;
    // Keep the par spread even, otherwise short levels crowd out the long ones.
    const par = candidate.solution.length;
    if ((parCount.get(par) ?? 0) >= perPar) continue;
    if (await admit(rows, spec.zone, `z${spec.zone}-${admitted + 1}`, spec.featured)) {
      parCount.set(par, (parCount.get(par) ?? 0) + 1);
      admitted++;
    }
  }
  console.log(`zone ${spec.zone}: ${admitted} levels, par spread`, Object.fromEntries(parCount));
}

writeFileSync('src/data/levels.json', `${JSON.stringify(levels, null, 1)}\n`);
console.log(`Wrote ${levels.length} proven levels`);
process.exit(0);
