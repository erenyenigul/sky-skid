import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import seedrandom from 'seedrandom';
import type { LevelData } from '../src/application/catalog';
import { parseBoard } from '../src/domain/board';
import { solve } from '../src/domain/solver';
import { TUTORIAL_LEVELS, ZONE_SPECS, type ZoneSpec } from './levelSpecs';
import { measureDifficulty } from './difficulty';
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

const PATH = 'src/data/levels.json';
/** Quick measurements while searching; `npm run calibrate` re-measures everything afterwards. */
const SEARCH_RUNS = 8;
const MAX_MEASURED = 1500;

const prover = await LevelProver.create();
const random = seedrandom('sky-skid-2');
// Existing levels are kept, so ids and saved progress stay valid.
const levels: LevelData[] = existsSync(PATH) ? JSON.parse(readFileSync(PATH, 'utf8')) : [];

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
    difficulty: measureDifficulty({ id, rows, par: proof.par }, SEARCH_RUNS, random),
    witness: proof.witness,
  });
  return true;
}

const largestGap = (sorted: number[]) => Math.max(0, ...sorted.slice(1).map((value, i) => value - sorted[i]));

/** A level earns its place by landing well inside a gap in the zone's difficulty curve. */
function fillsGap(sorted: number[], difficulty: number) {
  if (sorted.length < 2) return true;
  if (difficulty < sorted[0] || difficulty > sorted.at(-1)!) return false;
  const nearest = Math.min(...sorted.map((value) => Math.abs(value - difficulty)));
  return nearest >= largestGap(sorted) / 3;
}

for (const [index, rows] of TUTORIAL_LEVELS.entries()) {
  const id = `t${index + 1}`;
  if (!levels.some((level) => level.id === id)) await admit(rows, 0, id, []);
}

for (const spec of ZONE_SPECS) {
  const inZone = () => levels.filter((level) => level.zone === spec.zone);
  const curve = () => inZone().map((level) => level.difficulty).sort((a, b) => a - b);
  const seen = new Set(inZone().map((level) => level.rows.join('/')));
  const before = largestGap(curve());
  let nextId = levels.filter((level) => level.id.startsWith(`z${spec.zone}-`)).length + 1;
  let measured = 0;

  for (let tried = 0; inZone().length < spec.count && measured < MAX_MEASURED; tried++) {
    if (tried > 3_000_000) throw new Error(`Zone ${spec.zone} starved at ${inZone().length}/${spec.count}`);
    const rows = randomRows(spec, random);
    const key = rows.join('/');
    if (seen.has(key)) continue;
    seen.add(key);
    const candidate = isCandidate(rows, spec);
    if (!candidate) continue;
    measured++;
    const id = `z${spec.zone}-${nextId}`;
    const difficulty = measureDifficulty({ id: key, rows, par: candidate.solution.length }, SEARCH_RUNS, random);
    if (fillsGap(curve(), difficulty) && (await admit(rows, spec.zone, id, spec.featured))) nextId++;
  }
  console.log(`zone ${spec.zone}: ${inZone().length}/${spec.count} levels, largest gap ${before.toFixed(2)} -> ${largestGap(curve()).toFixed(2)}`);
  writeFileSync(PATH, `${JSON.stringify(levels, null, 1)}\n`);
}

console.log(`Wrote ${levels.length} proven levels`);
process.exit(0);
