import { writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import seedrandom from 'seedrandom';
import { LEVELS, ZONES } from '../src/application/catalog';
import { PERSONAS } from './bots';
import { simulatePlayer, type LevelStat } from './simulation';

const { values } = parseArgs({
  options: { players: { type: 'string', default: '200' }, days: { type: 'string', default: '7' }, seed: { type: 'string', default: 'playtest' } },
});
const players = Number(values.players);
const days = Number(values.days);

const mean = (numbers: number[]) => numbers.reduce((a, b) => a + b, 0) / Math.max(1, numbers.length);
const round = (value: number, digits = 1) => +value.toFixed(digits);
const percent = (part: number, whole: number) => `${Math.round((100 * part) / Math.max(1, whole))}%`;

const levelById = new Map(LEVELS.map((level) => [level.id, level]));
const rows = [];
const zoneReach = [];
const hardest = [];

for (const persona of PERSONAS) {
  const random = seedrandom(`${values.seed}/${persona.name}`);
  const results = Array.from({ length: players }, () => simulatePlayer(persona, days, random));
  const sessions = results.flatMap((result) => result.sessions);
  const played: LevelStat[] = sessions.flatMap((session) => session.levels);
  const cleared = played.filter((level) => !level.gaveUp);
  const quits = (reason: string) => sessions.filter((session) => session.quit === reason).length;

  rows.push({
    bot: persona.name,
    'lvls/session': round(mean(sessions.map((s) => s.levels.length))),
    'min/session': round(mean(sessions.map((s) => s.minutes))),
    'days of 7': round(mean(results.map((r) => r.daysActive))),
    '3-star': percent(cleared.filter((l) => l.stars === 3).length, cleared.length),
    'falls/lvl': round(mean(played.map((l) => l.falls))),
    'hint use': percent(played.filter((l) => l.hinted).length, played.length),
    'gave up': percent(played.filter((l) => l.gaveUp).length, played.length),
    'quit:bored': percent(quits('boredom'), sessions.length),
    'quit:frust': percent(quits('frustration'), sessions.length),
    'quit:time': percent(quits('time-up'), sessions.length),
  });

  const finalZones = results.map((result) => result.sessions.at(-1)!.progress.zone);
  zoneReach.push({
    bot: persona.name,
    ...Object.fromEntries(
      ZONES.map((zone, index) => [zone.name, percent(finalZones.filter((z) => z >= index).length, players)]),
    ),
  });

  const byLevel = new Map<string, LevelStat[]>();
  for (const level of played) byLevel.set(level.id, [...(byLevel.get(level.id) ?? []), level]);
  for (const [id, stats] of byLevel) {
    if (stats.length < 20) continue;
    hardest.push({
      bot: persona.name,
      level: id,
      par: levelById.get(id)!.par,
      plays: stats.length,
      gaveUp: round(stats.filter((s) => s.gaveUp).length / stats.length, 2),
      hint: round(stats.filter((s) => s.hinted).length / stats.length, 2),
      falls: round(mean(stats.map((s) => s.falls))),
    });
  }
}

const spikes = hardest
  .filter((level) => level.bot === 'Casual' || level.bot === 'Decent')
  .sort((a, b) => b.gaveUp + b.hint - (a.gaveUp + a.hint))
  .slice(0, 8);

console.log(`\n${players} players per bot, up to ${days} daily sessions. Engagement model is assumed, not measured.\n`);
console.table(rows);
console.log('Furthest zone reached:');
console.table(zoneReach);
console.log('Hardest levels for mid-skill bots:');
console.table(spikes);

writeFileSync('reports/playtest.json', `${JSON.stringify({ players, days, seed: values.seed, rows, zoneReach, spikes }, null, 1)}\n`);
