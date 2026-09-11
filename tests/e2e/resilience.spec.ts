import { test, expect } from './fixtures.js';
import type { Page } from '@playwright/test';

async function addLineComment(page: Page, line: number, body: string) {
  const panel = page.locator('[data-testid="panel"][data-path="src/services/user.ts"]');
  await panel.locator(`[data-column-number="${line}"]`).first().click();
  const composer = panel.getByTestId('comment-composer');
  await composer.getByRole('textbox').fill(body);
  await composer.getByTestId('composer-submit').click();
}

test.describe('resilience', () => {
  test('a failed comment sync shows a toast and the next change retries', async ({
    page,
    resk,
  }) => {
    let fail = true;
    await page.route('**/api/comments', async (route) => {
      if (route.request().method() === 'PUT' && fail)
        return route.fulfill({ status: 500, body: 'boom' });
      return route.continue();
    });
    await page.goto(resk.url);
    await page.getByTestId('highlight').filter({ hasText: 'UserService' }).click();
    const panel = page.locator('[data-testid="panel"][data-path="src/services/user.ts"]');
    await expect(panel.locator('[data-column-number="18"]').first()).toBeVisible();
    await addLineComment(page, 18, 'first');
    await expect(page.getByTestId('sync-error')).toBeVisible();
    await expect(panel.getByTestId('comment-card')).toHaveCount(1);

    fail = false;
    await addLineComment(page, 19, 'second');
    await expect(page.getByTestId('sync-error')).toHaveCount(0);
    await expect
      .poll(async () => (await (await fetch(`${resk.url}/api/comments`)).json()).length)
      .toBe(2);
  });

  test('a failed review load shows an error with a working retry', async ({ page, resk }) => {
    let fail = true;
    await page.route('**/api/review', (route) =>
      fail ? route.fulfill({ status: 500, body: 'boom' }) : route.continue(),
    );
    await page.goto(resk.url);
    await expect(page.getByTestId('load-error')).toBeVisible();
    fail = false;
    await page.getByRole('button', { name: 'Retry' }).click();
    await expect(page.getByTestId('summary')).toBeVisible();
    await expect(page.getByTestId('review-title')).toHaveText('sample.patch');
  });
});
