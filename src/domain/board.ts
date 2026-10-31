export type Tile = 'floor' | 'wall' | 'gap' | 'coin' | 'grass' | 'crumble' | 'cloud' | 'flag' | 'start';

const TILE_BY_GLYPH: Record<string, Tile> = {
  '.': 'floor',
  '#': 'wall',
  '~': 'gap',
  o: 'coin',
  g: 'grass',
  x: 'crumble',
  c: 'cloud',
  F: 'flag',
  S: 'start',
};

export interface Board {
  readonly width: number;
  readonly height: number;
  readonly tiles: readonly Tile[];
  readonly start: number;
  readonly flag: number;
  /** Cell index → bit position in the coin / cracked masks. */
  readonly coinBit: ReadonlyMap<number, number>;
  readonly crumbleBit: ReadonlyMap<number, number>;
  readonly allCoins: number;
  /** Cloud cell → its twin. */
  readonly twin: ReadonlyMap<number, number>;
}

const indexBits = (cells: number[]) => new Map(cells.map((cell, bit) => [cell, bit]));

const cellsOf = (tiles: Tile[], tile: Tile) =>
  tiles.flatMap((candidate, cell) => (candidate === tile ? [cell] : []));

export function parseBoard(rows: readonly string[]): Board {
  const width = rows[0].length;
  if (rows.some((row) => row.length !== width)) throw new Error('Board rows differ in length');

  const tiles = rows.flatMap((row) =>
    [...row].map((glyph) => {
      const tile = TILE_BY_GLYPH[glyph];
      if (!tile) throw new Error(`Unknown tile glyph "${glyph}"`);
      return tile;
    }),
  );

  const [start, ...extraStarts] = cellsOf(tiles, 'start');
  const [flag, ...extraFlags] = cellsOf(tiles, 'flag');
  if (start === undefined || extraStarts.length) throw new Error('Board needs exactly one start');
  if (flag === undefined || extraFlags.length) throw new Error('Board needs exactly one flag');

  const clouds = cellsOf(tiles, 'cloud');
  if (clouds.length !== 0 && clouds.length !== 2) throw new Error('Clouds come in a single pair');

  const coins = cellsOf(tiles, 'coin');
  return {
    width,
    height: rows.length,
    tiles,
    start,
    flag,
    coinBit: indexBits(coins),
    crumbleBit: indexBits(cellsOf(tiles, 'crumble')),
    allCoins: 2 ** coins.length - 1,
    twin: new Map(clouds.length ? [[clouds[0], clouds[1]], [clouds[1], clouds[0]]] : []),
  };
}
