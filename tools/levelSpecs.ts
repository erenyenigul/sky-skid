export interface ZoneSpec {
  zone: number;
  count: number;
  size: [number, number];
  coins: [number, number];
  walls: [number, number];
  gaps: [number, number];
  grass: [number, number];
  crumbles: [number, number];
  clouds: boolean;
  par: [number, number];
  /** Tiles every level in this zone must prove essential. */
  featured: string[];
}

const none: [number, number] = [0, 0];

export const ZONE_SPECS: ZoneSpec[] = [
  { zone: 0, count: 24, size: [5, 6], coins: [1, 3], walls: [2, 6], gaps: none, grass: none, crumbles: none, clouds: false, par: [2, 5], featured: [] },
  { zone: 1, count: 36, size: [5, 7], coins: [1, 4], walls: [3, 7], gaps: [3, 7], grass: none, crumbles: none, clouds: false, par: [3, 7], featured: ['gap'] },
  { zone: 2, count: 36, size: [6, 7], coins: [2, 4], walls: [2, 6], gaps: [2, 6], grass: [1, 3], crumbles: none, clouds: false, par: [3, 8], featured: ['grass'] },
  { zone: 3, count: 36, size: [6, 7], coins: [2, 4], walls: [3, 7], gaps: [1, 5], grass: [0, 2], crumbles: [2, 5], clouds: false, par: [4, 9], featured: ['crumble'] },
  { zone: 4, count: 36, size: [6, 7], coins: [2, 4], walls: [3, 7], gaps: [1, 5], grass: [0, 2], crumbles: [0, 2], clouds: true, par: [4, 9], featured: ['cloud'] },
  { zone: 5, count: 100, size: [7, 8], coins: [3, 6], walls: [4, 9], gaps: [3, 8], grass: [1, 3], crumbles: [2, 5], clouds: true, par: [6, 14], featured: ['cloud', 'crumble'] },
];

/** Hand-made opening: one dash, then one rule at a time. */
export const TUTORIAL_LEVELS = [
  ['S....F'],
  ['S.o.oF'],
  ['S..o', '#...', '#..F'],
];
