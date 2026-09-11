import { test, expect } from './fixtures.js';
import { DEFAULT_ARGS, launchResk } from './launch.js';
import type { Page } from '@playwright/test';

async function addLineComment(page: Page, body: string) {
  await page.getByTestId('highlight').filter({ hasText: 'UserService' }).click();
  const panel = page.locator('[data-testid="panel"][data-path="src/services/user.ts"]');
  await panel.locator('[data-column-number="18"]').first().click();
  await panel.getByTestId('comment-composer').getByRole('textbox').fill(body);
  await panel.getByTestId('composer-submit').click();
  await expect(panel.getByTestId('comment-card')).toHaveCount(1);
}

async function addSummaryComment(page: Page, body: string) {
  await page.getByTestId('comment-summary-button').click();
  const composer = page.getByTestId('summary-comments').getByTestId('comment-composer');
  await composer.getByRole('textbox').fill(body);
  await composer.getByTestId('composer-submit').click();
}

test.describe('finish review', () => {
  test('the confirmation lists the comment counts and can be dismissed', async ({ page, resk }) => {
    await page.goto(resk.url);
    await addLineComment(page, 'Why is the timeout hardcoded?');
    await addSummaryComment(page, 'Split this into two PRs.');

    await page.getByTestId('finish-button').click();
    const dialog = page.getByTestId('finish-dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('2 comments in 1 file, 1 on summary');
    await dialog.getByTestId('finish-cancel').click();
    await expect(dialog).toHaveCount(0);

    await page.getByTestId('finish-button').click();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('finish-dialog')).toHaveCount(0);
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

    await page.getByTestId('finish-button').click();
    await page.getByTestId('finish-confirm').click();
    await expect(page.getByTestId('finished')).toBeVisible();
    await expect(page.getByTestId('finished')).toContainText('Review finished');

    expect(await resk.exit).toBe(0);
    expect(resk.stdout()).toBe(
      [
        '# Review comments (2)',
        '',
        '## Summary',
        '- Split this into two PRs.',
        '',
        '## src/services/user.ts',
        '- L18 (new): Why is the timeout hardcoded?',
        '  > +    const timeout = 3000;',
        '',
      ].join('\n'),
    );
  });

  test('finishing without comments says so in the dialog and on stdout', async ({ page }) => {
    const resk = await launchResk(DEFAULT_ARGS);
    await page.goto(resk.url);
    await page.getByTestId('finish-button').click();
    await expect(page.getByTestId('finish-dialog')).toContainText('No comments yet');
    await page.getByTestId('finish-confirm').click();
    await expect(page.getByTestId('finished')).toBeVisible();
    expect(await resk.exit).toBe(0);
    expect(resk.stdout()).toBe('No review comments.\n');
  });

  test('--json output is produced when finishing from the browser', async ({ page }) => {
    const resk = await launchResk([...DEFAULT_ARGS, '--json']);
    await page.goto(resk.url);
    await addSummaryComment(page, 'overall');
    await expect
      .poll(async () => (await (await fetch(`${resk.url}/api/comments`)).json()).length)
      .toBe(1);
    await page.getByTestId('finish-button').click();
    await page.getByTestId('finish-confirm').click();
    expect(await resk.exit).toBe(0);
    const parsed = JSON.parse(resk.stdout());
    expect(parsed.comments[0]).toMatchObject({ target: { kind: 'summary' }, body: 'overall' });
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
