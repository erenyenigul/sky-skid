import { signal } from '@preact/signals';
import type { LevelData } from '../application/catalog';
import type { Progress, Rewards } from '../application/progress';
import type { Direction } from '../domain/game';

export type Screen = 'title' | 'play' | 'clear' | 'skins';

export const screen = signal<Screen>('title');
export const progress = signal<Progress | null>(null);
export const level = signal<LevelData | null>(null);
export const moves = signal(0);
export const falls = signal(0);
export const restarts = signal(0);
export const stuck = signal(false);
export const hintDirection = signal<Direction | null>(null);
export const isDaily = signal(false);
export const rewards = signal<Rewards | null>(null);
export const toast = signal<string | null>(null);
export const levelNumber = signal(1);
