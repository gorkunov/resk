import { test, expect } from './fixtures.js';
import type { Page } from '@playwright/test';

function highlight(page: Page, text: string) {
  return page.getByTestId('highlight').filter({ hasText: text });
}

async function summaryWidth(page: Page): Promise<number> {
  const box = await page.getByTestId('summary-column').boundingBox();
  return Math.round(box!.width);
}

test.describe('layout', () => {
  test('the switch to the summary-plus-code layout happens once and is not undone', async ({
    page,
    resk,
  }) => {
    await page.goto(resk.url);
    const layout = page.getByTestId('layout');
    await expect(layout).toHaveAttribute('data-layout', 'summary');
    await expect(page.getByTestId('diff-column')).toHaveCount(0);

    await highlight(page, 'UserService').click();
    await expect(layout).toHaveAttribute('data-layout', 'split');

    await page.locator('[data-testid="panel"] [data-testid="panel-close"]').click();
    await expect(page.getByTestId('panel')).toHaveCount(0);
    await expect(layout).toHaveAttribute('data-layout', 'split');
    await expect(layout).toHaveAttribute('data-panels', '0');
    await expect(page.getByTestId('diff-column')).toBeVisible();
    await expect(page.getByTestId('diff-column-empty')).toBeVisible();

    // Opening another file reuses the same layout.
    await highlight(page, 'README').click();
    await expect(page.getByTestId('panel')).toHaveCount(1);
    await expect(page.getByTestId('diff-column-empty')).toHaveCount(0);
  });

  test('the summary column grows with the window and stops at 600px', async ({ page, resk }) => {
    await page.setViewportSize({ width: 900, height: 800 });
    await page.goto(resk.url);
    await highlight(page, 'UserService').click();
    await expect(page.getByTestId('diff-column')).toBeVisible();
    await expect.poll(() => summaryWidth(page)).toBe(420);

    await page.setViewportSize({ width: 1200, height: 800 });
    await expect.poll(() => summaryWidth(page)).toBe(480);

    await page.setViewportSize({ width: 1800, height: 800 });
    await expect.poll(() => summaryWidth(page)).toBe(600);

    // The diff column keeps the rest of the width.
    const column = (await page.getByTestId('diff-column').boundingBox())!;
    expect(Math.round(column.width)).toBe(1200);
  });
});
