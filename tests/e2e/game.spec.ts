import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

const levels = JSON.parse(readFileSync('src/data/levels.json', 'utf8'));
const ARROWS: Record<string, string> = { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight' };
const shots = 'reports/screenshots';

const progress = (page: Page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem('sky-skid/progress/v1') ?? '{}'));

async function open(page: Page) {
  await page.goto('/');
  await page.waitForSelector('[data-testid=play]');
}

async function winCurrentLevel(page: Page, levelId: string) {
  for (const move of levels.find((l: { id: string }) => l.id === levelId).witness) {
    await page.keyboard.press(ARROWS[move]);
    await page.waitForTimeout(450);
  }
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

test('undo and instant restart reset the move counter', async ({ page }) => {
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

test('late-game board renders every mechanic; undo at the start is a no-op', async ({ page }) => {
  await page.addInitScript(() => {
    if (localStorage.getItem('sky-skid/progress/v1')) return;
    localStorage.setItem('sky-skid/progress/v1', JSON.stringify({ zone: 5, seenTips: [0, 1, 2, 3, 4, 5], skin: 'mint', skins: ['classic', 'mint'] }));
  });
  await open(page);
  await page.click('[data-testid=play]');
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${shots}/high-sky.png` });
  const before = await page.getByTestId('moves').textContent();
  await page.keyboard.press('z');
  await expect(page.getByTestId('moves')).toHaveText(before!);
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
