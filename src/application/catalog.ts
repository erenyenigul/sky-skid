import { parseBoard, type Board } from '../domain/board';
import rawLevels from '../data/levels.json';

export interface LevelData {
  id: string;
  zone: number;
  rows: string[];
  /** Fewest dashes that can win; proven minimal by Z3 at build time. */
  par: number;
  difficulty: number;
  witness: string[];
}

export interface Zone {
  name: string;
  tip: string;
  /** Levels a player clears here before the next mechanic is introduced. */
  quota: number;
}

export const ZONES: readonly Zone[] = [
  { name: 'First Sparks', tip: 'Swipe or use arrows. You dash until something stops you. Grab every coin, then reach the flag.', quota: 7 },
  { name: 'Windy Gaps', tip: 'New: gaps! Dash over the edge and you drop. No harm done, you rewind one move.', quota: 8 },
  { name: 'Tall Grass', tip: 'New: tall grass stops you dead. Use it to brake exactly where you need to.', quota: 8 },
  { name: 'Crumble Ridge', tip: 'New: crumbling platforms hold once. Cross one twice and down you go.', quota: 8 },
  { name: 'Cloud Hop', tip: 'New: clouds come in pairs. Touch one and you pop out of the other.', quota: 8 },
  { name: 'The High Sky', tip: 'Everything at once. No more new rules. How far can you climb?', quota: Infinity },
];

export const LEVELS = rawLevels as LevelData[];

const boards = new Map<string, Board>();

export function boardOf(level: LevelData): Board {
  let board = boards.get(level.id);
  if (!board) boards.set(level.id, (board = parseBoard(level.rows)));
  return board;
}

export const levelsInZone = (zone: number, levels: readonly LevelData[] = LEVELS) =>
  levels.filter((level) => level.zone === zone);
