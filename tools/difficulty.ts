import type { Random } from './bots';
import { chooseMove, PERSONAS } from './bots';
import { boardOf, type LevelData } from '../src/application/catalog';
import { LevelSession } from '../src/application/session';

const MAX_ATTEMPTS = 10;
const testers = PERSONAS.filter(({ name }) => name === 'Casual' || name === 'Decent');

/** Attempts a persona needs without hints, capped: measured difficulty beats any formula. */
function attemptsToWin(persona: (typeof PERSONAS)[number], level: Pick<LevelData, 'id' | 'rows' | 'par'>, random: Random) {
  const board = boardOf(level as LevelData);
  const session = new LevelSession(board);
  const budget = Math.ceil(level.par * persona.attemptBudget) + 2;
  let seen = new Set<string>();
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    while (session.moves < budget && !session.isStuck) {
      const { outcome } = session.dash(chooseMove(persona, board, session.state, seen, random));
      if (session.won) return attempt;
      if (outcome === 'fell') break;
      seen.add(`${session.state.at}:${session.state.coins}:${session.state.cracked}`);
    }
    session.restart();
    seen = new Set();
  }
  return MAX_ATTEMPTS + 1;
}

export function measureDifficulty(level: Pick<LevelData, 'id' | 'rows' | 'par'>, runs: number, random: Random) {
  let total = 0;
  for (const persona of testers) {
    for (let run = 0; run < runs; run++) total += attemptsToWin(persona, level, random);
  }
  return +(level.par * 0.5 + total / (runs * testers.length)).toFixed(2);
}
