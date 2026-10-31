import { readFileSync, writeFileSync } from 'node:fs';
import seedrandom from 'seedrandom';
import type { LevelData } from '../src/application/catalog';
import { measureDifficulty } from './difficulty';

const RUNS = 24;
const levels: LevelData[] = JSON.parse(readFileSync('src/data/levels.json', 'utf8'));
const random = seedrandom('calibrate');

for (const level of levels) level.difficulty = measureDifficulty(level, RUNS, random);

writeFileSync('src/data/levels.json', `${JSON.stringify(levels, null, 1)}\n`);
const scores = levels.map((level) => level.difficulty).sort((a, b) => a - b);
console.log(`Calibrated ${levels.length} levels; difficulty ${scores[0]} to ${scores.at(-1)}, median ${scores[levels.length >> 1]}`);
