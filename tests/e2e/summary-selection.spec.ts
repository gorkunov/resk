import { test, expect } from './fixtures.js';
import { DEFAULT_ARGS, launchResk } from './launch.js';
import { selectText } from './select-text.js';
import type { Page } from '@playwright/test';

function highlightedTexts(page: Page) {
  return page.evaluate(() => {
    const registry = (CSS as unknown as { highlights?: Map<string, Iterable<Range>> }).highlights;
    const highlight = registry?.get('resk-comment');
    return highlight ? [...highlight].map((range) => range.toString()) : [];
  });
}

async function clickHighlightedText(page: Page, text: string) {
  const point = await page.evaluate((needle) => {
    const root = document.querySelector('[data-testid="summary-markdown"]')!;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let node = walker.nextNode() as Text | null;
    while (node) {
      const index = node.data.indexOf(needle);
      if (index !== -1) {
        const range = document.createRange();
        range.setStart(node, index);
        range.setEnd(node, index + needle.length);
        const rect = range.getBoundingClientRect();
        return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
      }
      node = walker.nextNode() as Text | null;
    }
    throw new Error(`text not found: ${needle}`);
  }, text);
  await page.mouse.click(point.x, point.y);
}

async function commentOnSelection(page: Page, text: string, body: string) {
  await selectText(page, text);
  await page.getByTestId('selection-comment-button').click();
  const composer = page.getByTestId('selection-popover').getByTestId('comment-composer');
  await expect(composer).toBeVisible();
  await composer.getByRole('textbox').fill(body);
  await composer.getByTestId('composer-submit').click();
  await expect(page.getByTestId('selection-popover')).toHaveCount(0);
}

test.describe('summary selection comments', () => {
  test('selecting text shows a comment button; the comment is anchored, underlined and viewable in place', async ({
    page,
    resk,
  }) => {
    await page.goto(resk.url);
    await expect(page.getByTestId('selection-comment-button')).toHaveCount(0);

    await selectText(page, 'Token refresh moved');
    const button = page.getByTestId('selection-comment-button');
    await expect(button).toBeVisible();
    await button.click();

    const popover = page.getByTestId('selection-popover');
    await expect(popover.getByTestId('selection-quote')).toContainText('Token refresh moved');
    await popover.getByRole('textbox').fill('Where did the client code go?');
    await popover.getByTestId('composer-submit').click();

    await expect(popover).toHaveCount(0);
    await expect(page.getByTestId('selection-comment-button')).toHaveCount(0);
    await expect(page.getByTestId('summary-comments')).toHaveCount(0);
    await expect.poll(() => highlightedTexts(page)).toEqual(['Token refresh moved']);

    await clickHighlightedText(page, 'Token refresh moved');
    const card = page.getByTestId('selection-popover').getByTestId('comment-card');
    await expect(card).toHaveAttribute('data-target', 'summary-selection');
    await expect(card).toContainText('Token refresh moved');
    await expect(card).toContainText('Where did the client code go?');
  });

  test('the popover spans the full width of the summary text', async ({ page, resk }) => {
    await page.goto(resk.url);
    await selectText(page, 'Renamed helpers');
    await page.getByTestId('selection-comment-button').click();
    const popover = (await page.getByTestId('selection-popover').boundingBox())!;
    const summary = (await page.getByTestId('summary-markdown').boundingBox())!;
    expect(Math.abs(popover.x - summary.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(popover.width - summary.width)).toBeLessThanOrEqual(1);
    expect(popover.width).toBeGreaterThan(500);
  });

  test('multiple selections are underlined independently and clicking one opens its comment', async ({
    page,
    resk,
  }) => {
    await page.goto(resk.url);
    await commentOnSelection(page, 'Token refresh moved', 'first');
    await commentOnSelection(page, 'Renamed helpers', 'second');
    await expect
      .poll(() => highlightedTexts(page))
      .toEqual(['Token refresh moved', 'Renamed helpers']);

    await clickHighlightedText(page, 'Renamed helpers');
    const popover = page.getByTestId('selection-popover');
    await expect(popover).toBeVisible();
    await expect(popover.getByTestId('comment-card')).toHaveCount(1);
    await expect(popover.getByTestId('comment-card')).toContainText('second');

    await popover.getByTestId('comment-delete').click();
    await expect(page.getByTestId('selection-popover')).toHaveCount(0);
    await expect.poll(() => highlightedTexts(page)).toEqual(['Token refresh moved']);
  });

  test('the button does not appear for selections outside the summary text', async ({
    page,
    resk,
  }) => {
    await page.goto(resk.url);
    const row = page.locator('[data-testid="file-row"][data-path="README.md"]');
    const box = (await row.boundingBox())!;
    await page.mouse.move(box.x + 60, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + 140, box.y + box.height / 2, { steps: 5 });
    await page.mouse.up();
    await page.waitForTimeout(200);
    await expect(page.getByTestId('selection-comment-button')).toHaveCount(0);
  });

  test('the composer can be dismissed and a collapsed selection hides the button', async ({
    page,
    resk,
  }) => {
    await page.goto(resk.url);
    await selectText(page, 'Token refresh moved');
    await page.getByTestId('selection-comment-button').click();
    await page.getByTestId('selection-popover').getByRole('textbox').press('Escape');
    await expect(page.getByTestId('selection-popover')).toHaveCount(0);
    expect(await highlightedTexts(page)).toEqual([]);

    await selectText(page, 'Token refresh moved');
    await expect(page.getByTestId('selection-comment-button')).toBeVisible();
    await page.getByRole('heading', { name: 'Minor' }).click();
    await expect(page.getByTestId('selection-comment-button')).toHaveCount(0);
  });

  test('underlines and comments survive a reload', async ({ page, resk }) => {
    await page.goto(resk.url);
    await commentOnSelection(page, 'Token refresh moved', 'persist');
    await expect
      .poll(async () => (await (await fetch(`${resk.url}/api/comments`)).json()).length)
      .toBe(1);
    await page.reload();
    await expect.poll(() => highlightedTexts(page)).toEqual(['Token refresh moved']);
    await clickHighlightedText(page, 'Token refresh moved');
    await expect(page.getByTestId('selection-popover').getByTestId('comment-card')).toContainText(
      'persist',
    );
  });

  test('the review output quotes the selected text', async ({ page }) => {
    const resk = await launchResk(DEFAULT_ARGS);
    await page.goto(resk.url);
    await commentOnSelection(page, 'Token refresh moved', 'Where did the client code go?');
    await expect
      .poll(async () => (await (await fetch(`${resk.url}/api/comments`)).json()).length)
      .toBe(1);
    await page.getByTestId('finish-button').click();
    expect(await resk.exit).toBe(0);
    expect(resk.stdout()).toBe(
      [
        '# Review comments (1)',
        '',
        '## Summary',
        '- On "Token refresh moved": Where did the client code go?',
        '',
      ].join('\n'),
    );
  });
});
