import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { parseBoard } from '../../src/domain/board';
import { dash, DIRECTIONS, initialState, type Direction } from '../../src/domain/game';
import { solve } from '../../src/domain/solver';

const levels = JSON.parse(readFileSync('src/data/levels.json', 'utf8'));
const ARROWS: Record<string, string> = { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight' };
const shots = 'reports/screenshots';

const progress = (page: Page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem('sky-skid/progress/v1') ?? '{}'));

async function open(page: Page) {
  await page.goto('/');
  await page.waitForSelector('[data-testid=play]');
}

const seed = (page: Page, saved: object) =>
  page.addInitScript((value) => {
    if (!localStorage.getItem('sky-skid/progress/v1')) localStorage.setItem('sky-skid/progress/v1', value);
  }, JSON.stringify(saved));

async function winCurrentLevel(page: Page, levelId: string) {
  for (const move of levels.find((l: { id: string }) => l.id === levelId).witness) {
    await page.keyboard.press(ARROWS[move]);
    await page.waitForTimeout(450);
  }
  await page.waitForSelector('[data-testid=clear-dialog], [data-testid=chest]');
  if (await page.getByTestId('chest').isVisible()) await page.keyboard.press('Enter');
  await page.waitForSelector('[data-testid=clear-dialog]');
}

test('boots with no errors, renders 3D, plays levels by keyboard', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

  await open(page);
  console.log('Render backend:', await page.evaluate(() => document.body.dataset.backend));
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${shots}/title.png` });

  await page.click('[data-testid=play]');
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${shots}/level-start.png` });

  for (let i = 0; i < 6; i++) {
    const level = (await page.getByTestId('moves').getAttribute('data-level'))!;
    await winCurrentLevel(page, level);
    if (i === 0) await page.screenshot({ path: `${shots}/clear.png` });
    await page.keyboard.press('Enter');
    await page.waitForTimeout(600);
  }

  const saved = await progress(page);
  expect(Object.values(saved.best).every((b) => (b as { stars: number }).stars === 3)).toBe(true);
  await page.screenshot({ path: `${shots}/later-level.png` });
  expect(errors).toEqual([]);
});

test('instant restart resets the move counter', async ({ page }) => {
  await open(page);
  await page.click('[data-testid=play]');
  await page.waitForTimeout(500);
  await page.keyboard.press('r');
  await expect(page.getByTestId('moves')).toContainText('0');
});

test('phone-sized viewport fits and can be played', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 780 });
  await open(page);
  await page.click('[data-testid=play]');
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${shots}/phone.png` });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
  expect(overflow).toBe(false);
});

test('late-game board renders every mechanic', async ({ page }) => {
  await page.addInitScript(() => {
    if (localStorage.getItem('sky-skid/progress/v1')) return;
    localStorage.setItem('sky-skid/progress/v1', JSON.stringify({ zone: 5, seenTips: [0, 1, 2, 3, 4, 5], skin: 'mint', skins: ['classic', 'mint'] }));
  });
  await open(page);
  await page.click('[data-testid=play]');
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${shots}/high-sky.png` });
});

test('a swipe dashes the robot and clears the first level', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 780 });
  await open(page);
  await page.click('[data-testid=play]');
  await page.waitForTimeout(600);
  await page.mouse.move(100, 450);
  await page.mouse.down();
  await page.mouse.move(180, 450, { steps: 2 });
  await page.mouse.move(280, 450, { steps: 2 });
  await page.mouse.up();
  await page.waitForSelector('[data-testid=clear-dialog]');
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${shots}/phone-clear.png` });
});

test('falling starts the level over', async ({ page }) => {
  await seed(page, { zone: 1, seenTips: [0, 1] });
  await open(page);
  await page.click('[data-testid=play]');
  await page.waitForTimeout(600);
  const id = await page.getByTestId('moves').getAttribute('data-level');
  const level = levels.find((l: { id: string }) => l.id === id);
  const board = parseBoard(level.rows);

  // Walk the winning line until a lethal dash is available (Z3 proves one exists within par).
  let state = initialState(board);
  let lethal: Direction | undefined;
  for (const move of level.witness as Direction[]) {
    lethal = DIRECTIONS.find((d) => dash(board, state, d).outcome === 'fell');
    if (lethal) break;
    state = dash(board, state, move).state;
    await page.keyboard.press(ARROWS[move]);
    await page.waitForTimeout(500);
  }
  expect(lethal).toBeDefined();
  await page.keyboard.press(ARROWS[lethal!]);
  await page.waitForTimeout(1000);
  await expect(page.getByTestId('moves')).toContainText(/^\s*0/);
});

test('Esc and the Menu button open the menu and resume the level', async ({ page }) => {
  await seed(page, { zone: 5, seenTips: [0, 1, 2, 3, 4, 5] });
  await open(page);
  await page.click('[data-testid=play]');
  await page.waitForTimeout(500);
  const id = await page.getByTestId('moves').getAttribute('data-level');
  await page.keyboard.press(ARROWS[levels.find((l: { id: string }) => l.id === id).witness[0]]);
  await page.waitForTimeout(600);
  const moves = await page.getByTestId('moves').textContent();
  expect(moves).toMatch(/^\s*1/);

  await page.keyboard.press('Escape');
  await page.click('[data-testid=play]');
  await expect(page.getByTestId('moves')).toHaveText(moves!);

  await page.click('[data-testid=menu]');
  await expect(page.getByTestId('play')).toBeVisible();
});

async function winCurrentLevelWithoutClosingChest(page: Page, levelId: string) {
  for (const move of levels.find((l: { id: string }) => l.id === levelId).witness) {
    await page.keyboard.press(ARROWS[move]);
    await page.waitForTimeout(1000);
  }
  await page.waitForSelector('[data-testid=chest]');
}

const openChest = async (page: Page) => {
  await seed(page, { chestStars: 17, seenTips: [0] });
  await open(page);
  await page.click('[data-testid=play]');
  await page.waitForTimeout(500);
  await page.keyboard.press('ArrowRight');
  await page.waitForSelector('[data-testid=chest]');
};

test('a chest reveal lets the player wear the prize', async ({ page }) => {
  await openChest(page);
  for (const [name, wait] of [['drop', 300], ['arrived', 800], ['rattle', 300], ['settled', 2000]] as const) {
    await page.waitForTimeout(wait);
    await page.screenshot({ path: `${shots}/chest-${name}.png` });
  }
  await page.keyboard.press('Enter');
  await page.waitForSelector('[data-testid=clear-dialog]');
  expect((await progress(page)).skin).not.toBe('classic');
});

test('a chest reveal lets the player keep their current skin', async ({ page }) => {
  await openChest(page);
  await page.waitForTimeout(2600);
  await page.click('[data-testid=chest-keep]');
  await page.waitForSelector('[data-testid=clear-dialog]');
  const saved = await progress(page);
  expect(saved.skin).toBe('classic');
  expect(saved.skins.length).toBe(2);
});

test('the skins screen previews the robot and equips owned skins', async ({ page }) => {
  await seed(page, { skins: ['classic', 'mint', 'gold'], seenTips: [0] });
  await open(page);
  await page.click('[data-testid=skins]');
  await page.waitForSelector('[data-testid=skins-dialog]');
  await page.getByRole('button', { name: 'Solid Gold' }).click();
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${shots}/skins.png` });
  expect((await progress(page)).skin).toBe('gold');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('play')).toBeVisible();
});

test('a hint spends one charge and shows the arrow', async ({ page }) => {
  await seed(page, { zone: 1, seenTips: [0, 1], hints: 3 });
  await open(page);
  await page.click('[data-testid=play]');
  await page.waitForTimeout(700);
  await page.keyboard.press('h');
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${shots}/hint-arrow.png` });
  await page.keyboard.press('h');
  expect((await progress(page)).hints).toBe(2);
});

test('chest and skins screens fit a phone', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 780 });
  await seed(page, { chestStars: 17, seenTips: [0] });
  await open(page);
  await page.click('[data-testid=skins]');
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${shots}/phone-skins.png` });
  await page.keyboard.press('Escape');
  await page.click('[data-testid=play]');
  await page.waitForTimeout(500);
  await page.mouse.move(100, 450);
  await page.mouse.down();
  await page.mouse.move(280, 450, { steps: 4 });
  await page.mouse.up();
  await page.waitForSelector('[data-testid=chest]');
  await page.waitForTimeout(3000);
  await page.screenshot({ path: `${shots}/phone-chest.png` });
});

/** Shortest dash sequence that leaves the level unwinnable, if there is one. */
function findDeadEnd(board: ReturnType<typeof parseBoard>) {
  let frontier = [{ state: initialState(board), moves: [] as Direction[] }];
  for (let depth = 0; depth < 6; depth++) {
    const next: typeof frontier = [];
    for (const { state, moves } of frontier) {
      for (const direction of DIRECTIONS) {
        const result = dash(board, state, direction);
        if (result.outcome !== 'moved' && result.outcome !== 'warped') continue;
        const line = [...moves, direction];
        if (!solve(board, { from: result.state })) return line;
        next.push({ state: result.state, moves: line });
      }
    }
    frontier = next;
  }
  return null;
}

test('hint rescues an unwinnable position: restarts and shows the route', async ({ page }) => {
  const zone = levels.filter((l: { zone: number }) => l.zone === 3);
  const target = zone.find((l: { rows: string[] }) => findDeadEnd(parseBoard(l.rows)));
  const best = Object.fromEntries(
    zone.filter((l: { id: string }) => l.id !== target.id).map((l: { id: string }) => [l.id, { stars: 1, moves: 99 }]),
  );
  await seed(page, { zone: 3, seenTips: [0, 1, 2, 3], hints: 3, best });
  await open(page);
  await page.click('[data-testid=play]');
  await page.waitForTimeout(600);
  await expect(page.getByTestId('moves')).toHaveAttribute('data-level', target.id);

  for (const move of findDeadEnd(parseBoard(target.rows))!) {
    await page.keyboard.press(ARROWS[move]);
    await page.waitForTimeout(600);
  }
  await expect(page.getByText(/no way/i)).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Hint/ })).toHaveClass(/nudge/);

  await page.keyboard.press('h');
  await page.waitForTimeout(600);
  await expect(page.getByTestId('moves')).toContainText(/^\s*0/);
  expect((await progress(page)).hints).toBe(2);
  await page.screenshot({ path: `${shots}/stuck-hint.png` });
});

test('the chest cloud floats clear of a crowded board', async ({ page }) => {
  await seed(page, { zone: 5, chestStars: 17, seenTips: [0, 1, 2, 3, 4, 5] });
  await open(page);
  await page.click('[data-testid=play]');
  await page.waitForTimeout(600);
  const id = await page.getByTestId('moves').getAttribute('data-level');
  await winCurrentLevelWithoutClosingChest(page, id!);
  await page.waitForTimeout(3200);
  await page.screenshot({ path: `${shots}/chest-crowded.png` });
});
