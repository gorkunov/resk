import { test, expect, type Page } from '@playwright/test';
import { launchResk, type Launched } from './launch.js';

let resk: Launched | undefined;

test.beforeEach(async () => {
  resk = await launchResk([
    '--summary',
    'exotic-summary.md',
    '--diff',
    'exotic.patch',
    '--keep-alive',
  ]);
});
test.afterEach(async () => {
  await resk?.kill();
  resk = undefined;
});

function open(page: Page, text: string) {
  return page.getByTestId('highlight').filter({ hasText: text }).click();
}

/** Distinct text colours on one line, which only syntax highlighting produces. */
function tokenColours(page: Page, path: string, needle: string) {
  return page
    .locator(`[data-testid="panel"][data-path="${path}"] [data-line]`)
    .filter({ hasText: needle })
    .first()
    .evaluate((line) =>
      [...line.querySelectorAll('span')]
        .map((span) => getComputedStyle(span).color)
        .filter((colour) => colour !== ''),
    );
}

test.describe('syntax highlighting', () => {
  test('a bundled language is highlighted', async ({ page }) => {
    await page.goto(resk!.url);
    await open(page, 'src/app.ts');
    const panel = page.locator('[data-testid="panel"][data-path="src/app.ts"]');
    await expect(panel.locator('[data-line]').first()).toBeVisible();
    await expect(panel).toContainText('export const greeting');

    const colours = await tokenColours(page, 'src/app.ts', 'greeting');
    expect(new Set(colours).size).toBeGreaterThan(1);
  });

  test('a language outside the bundle still renders as plain text', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(resk!.url);
    await open(page, 'tools/macros.el');

    const panel = page.locator('[data-testid="panel"][data-path="tools/macros.el"]');
    await expect(panel.locator('[data-line]')).toHaveCount(3);
    await expect(panel).toContainText('(defun resk-greet (name)');
    await expect(panel).toContainText('(message "hello %s" name)');

    // One colour for the whole line: rendered, just not highlighted.
    const colours = await tokenColours(page, 'tools/macros.el', 'defun');
    expect(new Set(colours).size).toBe(1);
    expect(errors).toEqual([]);
  });
});
