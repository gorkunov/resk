import { test, expect, type Page } from '@playwright/test';
import { launchResk, type Launched } from './launch.js';

let resk: Launched | undefined;

test.beforeEach(async () => {
  resk = await launchResk([
    '--summary',
    'longpath-summary.md',
    '--diff',
    'longpath.patch',
    '--keep-alive',
  ]);
});
test.afterEach(async () => {
  await resk?.kill();
  resk = undefined;
});

function overflow(page: Page, testId: string) {
  return page.getByTestId(testId).evaluate((el) => el.scrollWidth - el.clientWidth);
}

/** The column animates its width; measure only once it has settled. */
async function settledColumn(page: Page) {
  await expect
    .poll(() => page.getByTestId('summary-column').evaluate((el) => el.clientWidth))
    .toBe(511);
}

test.describe('long paths in the summary', () => {
  test('a path too long for the column wraps instead of scrolling sideways', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(resk!.url);
    const chip = page.getByTestId('highlight').first();
    await expect(chip).toBeVisible();

    // Centred layout first, then the narrow sidebar the panel view uses.
    expect(await overflow(page, 'summary')).toBe(0);
    await chip.click();
    await settledColumn(page);
    expect(await overflow(page, 'summary-column')).toBe(0);
    expect(await overflow(page, 'summary')).toBe(0);

    // The chip itself stays inside the column and takes more than one line.
    const box = (await chip.boundingBox())!;
    const column = (await page.getByTestId('summary-column').boundingBox())!;
    expect(box.x + box.width).toBeLessThanOrEqual(column.x + column.width);
    const lineHeight = await chip.evaluate((el) =>
      parseFloat(getComputedStyle(el.closest('p') ?? el).lineHeight),
    );
    expect(box.height).toBeGreaterThan(lineHeight);
  });

  test('a long path in a plain code span wraps too', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(resk!.url);
    await page.getByTestId('highlight').first().click();
    await settledColumn(page);
    const span = page
      .locator('.summary-markdown code')
      .filter({ hasText: 'add_ens_expert_status' })
      .last();
    const box = (await span.boundingBox())!;
    const column = (await page.getByTestId('summary-column').boundingBox())!;
    expect(box.x + box.width).toBeLessThanOrEqual(column.x + column.width);
    expect(await overflow(page, 'summary-column')).toBe(0);
  });
});
