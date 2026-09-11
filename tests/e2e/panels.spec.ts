import { test, expect } from './fixtures.js';
import type { Page } from '@playwright/test';

function highlight(page: Page, text: string) {
  return page.getByTestId('highlight').filter({ hasText: text });
}

function panels(page: Page) {
  return page.getByTestId('panel');
}

function panelFor(page: Page, path: string) {
  return page.locator(`[data-testid="panel"][data-path="${path}"]`);
}

test.describe('diff panels', () => {
  test('a range highlight opens its file panel, shifts the layout and focuses the range', async ({
    page,
    resk,
  }) => {
    await page.goto(resk.url);
    await highlight(page, 'UserService').click();

    await expect(page.getByTestId('layout')).toHaveAttribute('data-panels', '1');
    await expect(page.getByTestId('diff-column')).toBeVisible();
    const panel = panelFor(page, 'src/services/user.ts');
    await expect(panel).toBeVisible();
    await expect(panel.getByTestId('panel-header')).toContainText('src/services/user.ts');
    await expect(panel.getByTestId('panel-header')).toContainText('+9');
    await expect(panel.getByTestId('panel-header')).toContainText('−3');
    await expect(panel).toHaveAttribute('data-focus', 'new:13-19');
    await expect(highlight(page, 'UserService')).toHaveAttribute('data-state', 'open');
    await expect(highlight(page, 'UserService')).toHaveAttribute('aria-pressed', 'true');
    await expect(
      panel.locator('[data-line-type]').filter({ hasText: 'async refreshSession' }),
    ).toBeInViewport();
  });

  test('panels stack in diff order regardless of click order', async ({ page, resk }) => {
    await page.goto(resk.url);
    await highlight(page, 'utils/time.ts').click();
    await highlight(page, 'README').click();
    await expect(panels(page)).toHaveCount(2);
    await expect(panels(page).nth(0)).toHaveAttribute('data-path', 'README.md');
    await expect(panels(page).nth(1)).toHaveAttribute('data-path', 'src/utils/clock.ts');
    await expect(page.getByTestId('layout')).toHaveAttribute('data-panels', '2');
  });

  test('a second highlight into the same file reuses the panel and moves the focus', async ({
    page,
    resk,
  }) => {
    await page.goto(resk.url);
    await highlight(page, 'UserService').click();
    await highlight(page, 'remove()').click();
    await expect(panels(page)).toHaveCount(1);
    const panel = panelFor(page, 'src/services/user.ts');
    await expect(panel).toHaveAttribute('data-focus', 'new:28-28');
    await expect(
      panel.locator('[data-line-type]').filter({ hasText: 'revokeAll' }),
    ).toBeInViewport();
  });

  test('an old-side highlight focuses deleted lines', async ({ page, resk }) => {
    await page.goto(resk.url);
    await highlight(page, 'auth/token.ts').click();
    const panel = panelFor(page, 'src/auth/token.ts');
    await expect(panel).toHaveAttribute('data-focus', 'old:6-12');
    await expect(
      panel.locator('[data-line-type]').filter({ hasText: 'refreshOnClient' }),
    ).toBeInViewport();
  });

  test('closing panels removes them and closing the last one re-centers the summary', async ({
    page,
    resk,
  }) => {
    await page.goto(resk.url);
    await highlight(page, 'UserService').click();
    await highlight(page, 'README').click();
    await expect(panels(page)).toHaveCount(2);

    await panelFor(page, 'README.md').getByTestId('panel-close').click();
    await expect(panels(page)).toHaveCount(1);
    await expect(highlight(page, 'README')).toHaveAttribute('data-state', 'reviewed');

    await panelFor(page, 'src/services/user.ts').getByTestId('panel-close').click();
    await expect(panels(page)).toHaveCount(0);
    await expect(page.getByTestId('diff-column')).toHaveCount(0);
    await expect(page.getByTestId('layout')).toHaveAttribute('data-panels', '0');
    await expect(highlight(page, 'UserService')).toHaveAttribute('data-state', 'reviewed');
  });

  test('file rows open panels and reflect the open state', async ({ page, resk }) => {
    await page.goto(resk.url);
    const row = page.locator('[data-testid="file-row"][data-path="src/routes/auth.ts"]');
    await expect(row).toHaveAttribute('data-open', 'false');
    await row.click();
    await expect(panelFor(page, 'src/routes/auth.ts')).toBeVisible();
    await expect(row).toHaveAttribute('data-open', 'true');
    await expect(highlight(page, 'POST /auth/refresh')).toHaveAttribute('data-state', 'open');
  });

  test('toggles between unified and split rendering per panel', async ({ page, resk }) => {
    await page.goto(resk.url);
    await highlight(page, 'UserService').click();
    await highlight(page, 'README').click();
    const user = panelFor(page, 'src/services/user.ts');
    await expect(user).toHaveAttribute('data-diff-style', 'unified');
    await user.getByTestId('diff-style-toggle').click();
    await expect(user).toHaveAttribute('data-diff-style', 'split');
    await expect(user.locator('[data-diff-type="split"]').first()).toBeAttached();
    await expect(panelFor(page, 'README.md')).toHaveAttribute('data-diff-style', 'unified');
  });

  test('binary files get a placeholder body', async ({ page, resk }) => {
    await page.goto(resk.url);
    await page.locator('[data-testid="file-row"][data-path="assets/logo.png"]').click();
    const panel = panelFor(page, 'assets/logo.png');
    await expect(panel).toContainText('Binary file not shown');
    await expect(panel.getByTestId('panel-header')).toContainText('binary');
  });

  test('renamed files show both paths in the header', async ({ page, resk }) => {
    await page.goto(resk.url);
    await highlight(page, 'utils/time.ts').click();
    const header = panelFor(page, 'src/utils/clock.ts').getByTestId('panel-header');
    await expect(header).toContainText('src/utils/clock.ts');
    await expect(header).toContainText('src/utils/time.ts');
  });
});
