import { test, expect } from './fixtures.js';
import type { Page } from '@playwright/test';

function highlight(page: Page, text: string) {
  return page.getByTestId('highlight').filter({ hasText: text });
}

function fileRow(page: Page, path: string) {
  return page.locator(`[data-testid="file-row"][data-path="${path}"]`);
}

test.describe('reviewed state', () => {
  test('a clicked highlight turns green, stays green after the panel closes, and other highlights into the same file do not', async ({
    page,
    resk,
  }) => {
    await page.goto(resk.url);
    const user = highlight(page, 'UserService');
    const remove = highlight(page, 'remove()');
    await expect(user).toHaveAttribute('data-state', 'default');
    await expect(user).toHaveAttribute('data-reviewed', 'false');

    await user.click();
    await expect(user).toHaveAttribute('data-state', 'open');
    await expect(user).toHaveAttribute('data-reviewed', 'true');
    await expect(remove).toHaveAttribute('data-state', 'open');
    await expect(remove).toHaveAttribute('data-reviewed', 'false');

    await page
      .locator('[data-testid="panel"][data-path="src/services/user.ts"]')
      .getByTestId('panel-close')
      .click();
    await expect(user).toHaveAttribute('data-state', 'reviewed');
    await expect(user).toHaveAttribute('data-reviewed', 'true');
    await expect(remove).toHaveAttribute('data-state', 'default');
  });

  test('opening a file marks its row as reviewed and a whole-file highlight follows the row', async ({
    page,
    resk,
  }) => {
    await page.goto(resk.url);
    const row = fileRow(page, 'src/utils/clock.ts');
    const wholeFile = highlight(page, 'utils/time.ts');
    await expect(row).toHaveAttribute('data-reviewed', 'false');
    await expect(row.getByTestId('reviewed-check')).toHaveCount(0);

    await row.click();
    await expect(row).toHaveAttribute('data-reviewed', 'true');
    await expect(row.getByTestId('reviewed-check')).toBeVisible();
    await expect(wholeFile).toHaveAttribute('data-reviewed', 'true');

    await highlight(page, 'UserService').click();
    await expect(fileRow(page, 'src/services/user.ts')).toHaveAttribute('data-reviewed', 'true');
    await expect(fileRow(page, 'README.md')).toHaveAttribute('data-reviewed', 'false');
  });

  test('reviewed marks survive a page reload', async ({ page, resk }) => {
    await page.goto(resk.url);
    await highlight(page, 'UserService').click();
    await fileRow(page, 'README.md').click();
    await expect(highlight(page, 'UserService')).toHaveAttribute('data-reviewed', 'true');

    await page.reload();
    await expect(highlight(page, 'UserService')).toHaveAttribute('data-state', 'reviewed');
    await expect(fileRow(page, 'README.md')).toHaveAttribute('data-reviewed', 'true');
    await expect(highlight(page, 'remove()')).toHaveAttribute('data-state', 'default');
  });
});

test.describe('typography', () => {
  test('the diff view and code paths use JetBrains Mono', async ({ page, resk }) => {
    await page.goto(resk.url);
    await highlight(page, 'UserService').click();
    const panel = page.locator('[data-testid="panel"][data-path="src/services/user.ts"]');
    const line = panel.locator('[data-line-type]').first();
    await expect(line).toBeVisible();
    await expect
      .poll(() => page.evaluate(() => document.fonts.check('12px "JetBrains Mono Variable"')))
      .toBe(true);
    const family = await line.evaluate((el) => getComputedStyle(el).fontFamily);
    expect(family).toContain('JetBrains Mono');
    const rowFamily = await fileRow(page, 'README.md')
      .locator('span.font-mono')
      .first()
      .evaluate((el) => getComputedStyle(el).fontFamily);
    expect(rowFamily).toContain('JetBrains Mono');
  });
});
