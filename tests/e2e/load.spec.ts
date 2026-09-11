import { test, expect } from './fixtures.js';

test.describe('initial load', () => {
  test('shows the centered summary with headings and no diff column', async ({ page, resk }) => {
    await page.goto(resk.url);
    await expect(page.getByTestId('summary')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Critical' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Minor' })).toBeVisible();
    await expect(page.getByTestId('diff-column')).toHaveCount(0);
    await expect(page.getByTestId('layout')).toHaveAttribute('data-panels', '0');
  });

  test('shows the review title and the changed files list with counts', async ({ page, resk }) => {
    await page.goto(resk.url);
    await expect(page.getByTestId('review-title')).toHaveText('sample.patch');
    await expect(page.getByTestId('comment-summary-button')).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Changed files (6)' })).toBeVisible();
    const rows = page.getByTestId('file-row');
    await expect(rows).toHaveCount(6);
    await expect(rows.nth(4)).toContainText('src/services/user.ts');
    await expect(rows.nth(4)).toContainText('+9');
    await expect(rows.nth(4)).toContainText('−3');
    await expect(rows.nth(5)).toContainText('src/utils/clock.ts');
    await expect(rows.nth(5)).toContainText('src/utils/time.ts');
    await expect(rows.nth(1)).toContainText('binary');
  });

  test('renders highlights for anchors and for code spans that name changed files', async ({
    page,
    resk,
  }) => {
    await page.goto(resk.url);
    const highlights = page.getByTestId('highlight');
    await expect(highlights).toHaveCount(8);
    await expect(highlights.filter({ hasText: 'UserService' })).toHaveAttribute(
      'data-state',
      'default',
    );
    await expect(highlights.filter({ hasText: 'assets/logo.png' })).toHaveAttribute(
      'data-path',
      'assets/logo.png',
    );
    const broken = highlights.filter({ hasText: 'missing' });
    await expect(broken).toHaveAttribute('data-state', 'broken');
    await expect(broken).toBeDisabled();
    await expect(broken).toHaveAttribute('title', /does not match any changed file/);
  });
});

test.describe('branding', () => {
  test('the tab title names the session and the app, and the favicon is served', async ({
    page,
    resk,
  }) => {
    await page.goto(resk.url);
    await expect(page).toHaveTitle('sample.patch - Resk');
    const icons = page.locator('link[rel="icon"]');
    await expect(icons.first()).toHaveAttribute('href', /favicon\.ico|icon-\d+\.png/);
    const href = (await icons.first().getAttribute('href'))!;
    const res = await fetch(new URL(href, resk.url));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/image\//);
    await expect(page.getByTestId('app-icon')).toBeVisible();
    await expect(page.getByTestId('app-icon')).toHaveAttribute('src', /icon-\d+\.png/);
  });

  test('a custom title is used as the session name', async ({ page }) => {
    const { launchResk, DEFAULT_ARGS } = await import('./launch.js');
    const resk = await launchResk([...DEFAULT_ARGS, '--title', 'Auth refresh']);
    try {
      await page.goto(resk.url);
      await expect(page).toHaveTitle('Auth refresh - Resk');
    } finally {
      await resk.kill();
    }
  });
});
