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

test.describe('sticky panel header', () => {
  test('the file header stays visible while scrolling a tall diff and can still close the panel', async ({
    page,
    resk,
  }) => {
    await page.setViewportSize({ width: 1280, height: 420 });
    await page.goto(resk.url);
    await highlight(page, 'UserService').click();
    const panel = panelFor(page, 'src/services/user.ts');
    const header = panel.getByTestId('panel-header');
    const column = page.getByTestId('diff-column');
    await expect(panel.locator('[data-line-type]').first()).toBeVisible();

    const panelHeight = (await panel.boundingBox())!.height;
    const columnBox = (await column.boundingBox())!;
    expect(panelHeight).toBeGreaterThan(columnBox.height);

    await column.evaluate((el) => {
      el.scrollTop = 250;
    });
    await expect.poll(() => column.evaluate((el) => el.scrollTop)).toBe(250);

    const headerBox = (await header.boundingBox())!;
    expect(headerBox.y).toBeGreaterThanOrEqual(columnBox.y - 1);
    expect(headerBox.y).toBeLessThanOrEqual(columnBox.y + 1);
    await expect(header).toBeInViewport();
    await expect(header).toContainText('src/services/user.ts');

    await panel.getByTestId('panel-close').click();
    await expect(panels(page)).toHaveCount(0);
  });
});

test.describe('focus scrolling', () => {
  test('the range ends up in view even when the pane-opening animation is slow', async ({
    page,
    resk,
  }) => {
    // Slow every CSS animation 10x so the summary column takes ~2 s to shrink; the diff reflows
    // during that time, which used to leave a one-shot scroll pointing at the wrong place.
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Animation.enable');
    await cdp.send('Animation.setPlaybackRate', { playbackRate: 0.1 });
    await page.setViewportSize({ width: 1280, height: 600 });
    await page.goto(resk.url);
    await highlight(page, 'remove()').click();
    const line = panelFor(page, 'src/services/user.ts')
      .locator('[data-line-type]')
      .filter({ hasText: 'revokeAll' });
    await expect(line).toBeInViewport({ timeout: 8_000 });
    await page.waitForTimeout(2_500);
    await expect(line).toBeInViewport();
  });

  test('the range stays in view when content above it grows shortly after opening', async ({
    page,
    resk,
  }) => {
    await page.setViewportSize({ width: 1280, height: 420 });
    await page.goto(resk.url);
    await highlight(page, 'README').click();
    await highlight(page, 'remove()').click();
    const line = panelFor(page, 'src/services/user.ts')
      .locator('[data-line-type]')
      .filter({ hasText: 'revokeAll' });
    await expect(line).toBeInViewport();

    // Simulate late layout work above the target (fonts, async highlighting, other panels).
    await page.locator('[data-testid="panel"][data-path="README.md"]').evaluate((panel) => {
      const spacer = document.createElement('div');
      spacer.style.height = '500px';
      spacer.dataset.testid = 'late-spacer';
      panel.appendChild(spacer);
    });
    await expect(page.getByTestId('late-spacer')).toBeAttached();
    await expect(line).toBeInViewport();
  });

  test('a range whose lines are not in the diff scrolls to the nearest rendered line', async ({
    page,
  }) => {
    const { launchResk } = await import('./launch.js');
    const resk = await launchResk([
      '--summary',
      'gap-summary.md',
      '--diff',
      'gap.patch',
      '--keep-alive',
    ]);
    try {
      await page.setViewportSize({ width: 1280, height: 420 });
      await page.goto(resk.url);
      await highlight(page, 'gap').click();
      const panel = panelFor(page, 'src/gap.ts');
      await expect(panel).toHaveAttribute('data-focus', 'new:300-300');
      // New line 300 lies between the hunks; the closest rendered new-side line is 203.
      await expect(
        panel.locator('[data-line="203"][data-line-type^="context"]').first(),
      ).toBeInViewport();
    } finally {
      await resk.kill();
    }
  });

  test('a focused range pulses instead of staying selected', async ({ page, resk }) => {
    await page.goto(resk.url);
    await highlight(page, 'UserService').click();
    const panel = panelFor(page, 'src/services/user.ts');

    await expect
      .poll(() =>
        panel
          .locator('[data-line][data-resk-pulse]')
          .first()
          .evaluate((el) => el.getAnimations().length)
          .catch(() => 0),
      )
      .toBeGreaterThan(0);
    // The gutter number pulses with its line.
    await expect(panel.locator('[data-column-number][data-resk-pulse]').first()).toBeAttached();

    await expect(panel.locator('[data-resk-pulse]')).toHaveCount(0, { timeout: 5000 });
    await expect(panel.locator('[data-selected-line]')).toHaveCount(0);
    await expect(panel).toHaveAttribute('data-focus', 'new:13-19');
  });

  test('hovering the code highlights the whole line, not just the number', async ({
    page,
    resk,
  }) => {
    await page.goto(resk.url);
    await highlight(page, 'UserService').click();
    const panel = panelFor(page, 'src/services/user.ts');
    const line = panel.locator('[data-line]').filter({ hasText: 'async refreshSession' }).first();
    await line.hover();
    await expect(line).toHaveAttribute('data-hovered', '');
    await panel.getByTestId('panel-header').hover();
    await expect(line).not.toHaveAttribute('data-hovered', '');
  });

  test('split view focuses the right side of the diff', async ({ page, resk }) => {
    await page.setViewportSize({ width: 1280, height: 420 });
    await page.goto(resk.url);
    await highlight(page, 'UserService').click();
    const panel = panelFor(page, 'src/services/user.ts');
    await panel.getByTestId('diff-style-toggle').click();
    await expect(panel).toHaveAttribute('data-diff-style', 'split');
    await highlight(page, 'remove()').click();
    await expect(
      panel.locator('[data-line-type]').filter({ hasText: 'revokeAll' }).first(),
    ).toBeInViewport();
    await highlight(page, 'auth/token.ts').click();
    const token = panelFor(page, 'src/auth/token.ts');
    await token.getByTestId('diff-style-toggle').click();
    await highlight(page, 'auth/token.ts').click();
    await expect(
      token.locator('[data-line-type]').filter({ hasText: 'refreshOnClient' }).first(),
    ).toBeInViewport();
  });

  test('the first click on a highlight scrolls a freshly opened panel to the linked range', async ({
    page,
    resk,
  }) => {
    await page.setViewportSize({ width: 1280, height: 420 });
    await page.goto(resk.url);
    await highlight(page, 'remove()').click();
    const panel = panelFor(page, 'src/services/user.ts');
    await expect(panel).toHaveAttribute('data-focus', 'new:28-28');
    const line = panel.locator('[data-line-type]').filter({ hasText: 'revokeAll' });
    await expect(line).toBeInViewport();
  });

  test('a highlight into a file whose panel is open but scrolled away brings the range into view', async ({
    page,
    resk,
  }) => {
    await page.setViewportSize({ width: 1280, height: 420 });
    await page.goto(resk.url);
    await highlight(page, 'auth/token.ts').click();
    await highlight(page, 'README').click();
    await expect(panels(page)).toHaveCount(2);
    const column = page.getByTestId('diff-column');
    await column.evaluate((el) => {
      el.scrollTop = el.scrollHeight;
    });
    await highlight(page, 'auth/token.ts').click();
    const line = panelFor(page, 'src/auth/token.ts')
      .locator('[data-line-type]')
      .filter({ hasText: 'refreshOnClient' });
    await expect(line).toBeInViewport();
  });
});
