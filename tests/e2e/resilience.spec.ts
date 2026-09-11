import { test, expect } from './fixtures.js';
import type { Page } from '@playwright/test';

async function addSummaryComment(page: Page, body: string) {
  await page.getByTestId('comment-summary-button').click();
  const composer = page.getByTestId('summary-comments').getByTestId('comment-composer');
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
    await addSummaryComment(page, 'first');
    await expect(page.getByTestId('sync-error')).toBeVisible();
    await expect(page.getByTestId('summary-comments').getByTestId('comment-card')).toHaveCount(1);

    fail = false;
    await addSummaryComment(page, 'second');
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
