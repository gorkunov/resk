import { test, expect } from './fixtures.js';
import { DEFAULT_ARGS, launchResk } from './launch.js';
import type { Page } from '@playwright/test';
import { selectText } from './select-text.js';
import { gotoAsFreshTab } from './fresh-tab.js';

async function addLineComment(page: Page, body: string) {
  await page.getByTestId('highlight').filter({ hasText: 'UserService' }).click();
  const panel = page.locator('[data-testid="panel"][data-path="src/services/user.ts"]');
  await panel.locator('[data-column-number="18"]').first().click();
  await panel.getByTestId('comment-composer').getByRole('textbox').fill(body);
  await panel.getByTestId('composer-submit').click();
  await expect(panel.getByTestId('comment-card')).toHaveCount(1);
}

async function addSummaryComment(page: Page, body: string) {
  await selectText(page, 'Token refresh moved');
  await page.getByTestId('selection-comment-button').click();
  const composer = page.getByTestId('selection-popover').getByTestId('comment-composer');
  await composer.getByRole('textbox').fill(body);
  await composer.getByTestId('composer-submit').click();
  await expect(page.getByTestId('selection-popover')).toHaveCount(0);
}

test.describe('finish review', () => {
  test('there is no confirmation step and the tab closes itself', async ({ page, resk }) => {
    await gotoAsFreshTab(page, resk.url);
    await expect(page.getByTestId('finish-button')).toBeVisible();
    await expect(page.getByTestId('finish-dialog')).toHaveCount(0);
    const closed = page.waitForEvent('close', { timeout: 5_000 }).then(() => true);
    await page.getByTestId('finish-button').click();
    expect(await closed).toBe(true);
  });

  test('confirming prints the review to stdout, exits 0 and shows the finished screen', async ({
    page,
  }) => {
    const resk = await launchResk(DEFAULT_ARGS);
    await page.goto(resk.url);
    await addLineComment(page, 'Why is the timeout hardcoded?');
    await addSummaryComment(page, 'Split this into two PRs.');
    await expect
      .poll(async () => (await (await fetch(`${resk.url}/api/comments`)).json()).length)
      .toBe(2);

    const closed = page
      .waitForEvent('close', { timeout: 5_000 })
      .then(() => true)
      .catch(() => false);
    await page.getByTestId('finish-button').click();

    expect(await resk.exit).toBe(0);
    // This page was opened with page.goto, so it has two history entries and the browser refuses
    // window.close(); the finished screen is the fallback in that case.
    expect(await closed).toBe(false);
    await expect(page.getByTestId('finished')).toContainText('Review finished');
    expect(resk.stdout()).toBe(
      [
        '# Review comments (2)',
        '',
        '## Summary',
        '- On "Token refresh moved": Split this into two PRs.',
        '',
        '## src/services/user.ts',
        '- L18 (new): Why is the timeout hardcoded?',
        '  > +    const timeout = 3000;',
        '',
      ].join('\n'),
    );
  });

  test('finishing without comments prints the empty result and closes the tab', async ({
    page,
  }) => {
    const resk = await launchResk(DEFAULT_ARGS);
    await gotoAsFreshTab(page, resk.url);
    const closed = page.waitForEvent('close', { timeout: 5_000 }).then(() => true);
    await page.getByTestId('finish-button').click();
    expect(await resk.exit).toBe(0);
    expect(resk.stdout()).toBe('No review comments.\n');
    expect(await closed).toBe(true);
  });

  test('--json output is produced when finishing from the browser', async ({ page }) => {
    const resk = await launchResk([...DEFAULT_ARGS, '--json']);
    await page.goto(resk.url);
    await addSummaryComment(page, 'overall');
    await expect
      .poll(async () => (await (await fetch(`${resk.url}/api/comments`)).json()).length)
      .toBe(1);
    await page.getByTestId('finish-button').click();
    expect(await resk.exit).toBe(0);
    const parsed = JSON.parse(resk.stdout());
    expect(parsed.comments[0]).toMatchObject({
      target: { kind: 'summary-selection', quote: 'Token refresh moved' },
      body: 'overall',
    });
  });
});

test.describe('theme', () => {
  test('the toggle cycles system, light, dark, applies the dark class and persists', async ({
    page,
    resk,
  }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto(resk.url);
    const toggle = page.getByTestId('theme-toggle');
    const html = page.locator('html');
    await expect(toggle).toHaveAttribute('data-theme', 'system');
    await expect(html).not.toHaveClass(/dark/);

    await toggle.click();
    await expect(toggle).toHaveAttribute('data-theme', 'light');
    await expect(html).not.toHaveClass(/dark/);

    await toggle.click();
    await expect(toggle).toHaveAttribute('data-theme', 'dark');
    await expect(html).toHaveClass(/dark/);

    await page.getByTestId('highlight').filter({ hasText: 'README' }).click();
    const panel = page.locator('[data-testid="panel"][data-path="README.md"]');
    await expect(panel.locator('[data-line-type]').first()).toBeVisible();
    const scheme = await panel
      .locator('diffs-container')
      .first()
      .evaluate((el) => getComputedStyle(el).colorScheme);
    expect(scheme).toContain('dark');

    await page.reload();
    await expect(page.getByTestId('theme-toggle')).toHaveAttribute('data-theme', 'dark');
    await expect(html).toHaveClass(/dark/);

    await page.getByTestId('theme-toggle').click();
    await expect(page.getByTestId('theme-toggle')).toHaveAttribute('data-theme', 'system');
    await expect(html).not.toHaveClass(/dark/);
  });
});
