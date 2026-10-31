import { readFileSync, writeFileSync } from 'node:fs';
import seedrandom from 'seedrandom';
import { boardOf, type LevelData } from '../src/application/catalog';
import { LevelSession } from '../src/application/session';
import { chooseMove, PERSONAS } from './bots';

const RUNS = 24;
const MAX_ATTEMPTS = 10;
const levels: LevelData[] = JSON.parse(readFileSync('src/data/levels.json', 'utf8'));
const random = seedrandom('calibrate');
const testers = PERSONAS.filter(({ name }) => name === 'Casual' || name === 'Decent');

/** Attempts a persona needs without hints, capped: measured difficulty beats any formula. */
function attemptsToWin(persona: (typeof PERSONAS)[number], level: LevelData) {
  const board = boardOf(level);
  const session = new LevelSession(board);
  const budget = Math.ceil(level.par * persona.attemptBudget) + 2;
  let seen = new Set<string>();
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    while (session.moves < budget && !session.isStuck) {
      session.dash(chooseMove(persona, board, session.state, seen, random));
      if (session.won) return attempt;
      seen.add(`${session.state.at}:${session.state.coins}:${session.state.cracked}`);
    }
    session.restart();
    seen = new Set();
  }
  return MAX_ATTEMPTS + 1;
}

for (const level of levels) {
  let total = 0;
  for (const persona of testers) {
    for (let run = 0; run < RUNS; run++) total += attemptsToWin(persona, level);
  }
  level.difficulty = +(level.par * 0.5 + total / (RUNS * testers.length)).toFixed(2);
}

writeFileSync('src/data/levels.json', `${JSON.stringify(levels, null, 1)}\n`);
const scores = levels.map((level) => level.difficulty).sort((a, b) => a - b);
console.log(`Calibrated ${levels.length} levels; difficulty ${scores[0]} to ${scores.at(-1)}, median ${scores[levels.length >> 1]}`);
