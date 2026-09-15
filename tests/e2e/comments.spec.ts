import { test, expect } from './fixtures.js';
import type { Page } from '@playwright/test';

function highlight(page: Page, text: string) {
  return page.getByTestId('highlight').filter({ hasText: text });
}

function panelFor(page: Page, path: string) {
  return page.locator(`[data-testid="panel"][data-path="${path}"]`);
}

function fileRow(page: Page, path: string) {
  return page.locator(`[data-testid="file-row"][data-path="${path}"]`);
}

async function openUserPanel(page: Page) {
  await highlight(page, 'UserService').click();
  const panel = panelFor(page, 'src/services/user.ts');
  await expect(panel.locator('[data-column-number="18"]').first()).toBeVisible();
  return panel;
}

test.describe('comments', () => {
  test('clicking a line number opens a composer and submitting creates a line comment with dots', async ({
    page,
    resk,
  }) => {
    await page.goto(resk.url);
    const panel = await openUserPanel(page);
    await panel.locator('[data-column-number="18"]').first().click();
    const composer = panel.getByTestId('comment-composer');
    await expect(composer).toBeVisible();
    await expect(composer.getByTestId('composer-submit')).toBeDisabled();
    await composer.getByRole('textbox').fill('Why is the timeout hardcoded?');
    await composer.getByTestId('composer-submit').click();

    const card = panel.getByTestId('comment-card');
    await expect(card).toHaveCount(1);
    await expect(card).toContainText('Why is the timeout hardcoded?');
    await expect(card).toHaveAttribute('data-target', 'new:18-18');
    await expect(panel.getByTestId('comment-composer')).toHaveCount(0);

    await expect(highlight(page, 'UserService').getByTestId('comment-dot')).toBeVisible();
    await expect(highlight(page, 'remove()').getByTestId('comment-dot')).toBeVisible();
    await expect(highlight(page, 'README').getByTestId('comment-dot')).toHaveCount(0);
    await expect(fileRow(page, 'src/services/user.ts').getByTestId('comment-dot')).toBeVisible();
    await expect(panel.getByTestId('panel-comment-count')).toHaveText('1');
  });

  test('dragging across line numbers creates a range comment', async ({ page, resk }) => {
    await page.goto(resk.url);
    const panel = await openUserPanel(page);
    const from = panel.locator('[data-column-number="18"]').first();
    const to = panel.locator('[data-column-number="19"]').first();
    await from.hover();
    await page.mouse.down();
    await to.hover();
    await page.mouse.up();

    const composer = panel.getByTestId('comment-composer');
    await expect(composer).toBeVisible();
    await expect(composer).toHaveAttribute('data-target', 'new:18-19');
    await composer.getByRole('textbox').fill('Both of these');
    await composer.getByTestId('composer-submit').click();
    await expect(panel.getByTestId('comment-card')).toHaveAttribute('data-target', 'new:18-19');
  });

  test('old-side lines of a deleted file can be commented', async ({ page, resk }) => {
    await page.goto(resk.url);
    await highlight(page, 'auth/token.ts').click();
    const panel = panelFor(page, 'src/auth/token.ts');
    await panel.locator('[data-column-number="7"]').first().click();
    const composer = panel.getByTestId('comment-composer');
    await expect(composer).toHaveAttribute('data-target', 'old:7-7');
    await composer.getByRole('textbox').fill('Was this dead code?');
    await composer.getByRole('textbox').press('ControlOrMeta+Enter');
    await expect(panel.getByTestId('comment-card')).toHaveAttribute('data-target', 'old:7-7');
  });

  test('file comments live above the diff and mark the file', async ({ page, resk }) => {
    await page.goto(resk.url);
    const panel = await openUserPanel(page);
    await panel.getByTestId('comment-file-button').click();
    const composer = panel.getByTestId('file-comments').getByTestId('comment-composer');
    await expect(composer).toBeVisible();
    await composer.getByRole('textbox').fill('Please add a unit test for the retry path.');
    await composer.getByTestId('composer-submit').click();
    const card = panel.getByTestId('file-comments').getByTestId('comment-card');
    await expect(card).toHaveAttribute('data-target', 'file');
    await expect(card).toContainText('Please add a unit test');
    await expect(fileRow(page, 'src/services/user.ts').getByTestId('comment-dot')).toBeVisible();
  });

  test('comments can be edited and deleted, and dots disappear with the last comment', async ({
    page,
    resk,
  }) => {
    await page.goto(resk.url);
    const panel = await openUserPanel(page);
    await panel.locator('[data-column-number="18"]').first().click();
    await panel.getByTestId('comment-composer').getByRole('textbox').fill('first');
    await panel.getByTestId('composer-submit').click();

    const card = panel.getByTestId('comment-card');
    await card.getByTestId('comment-edit').click();
    const editor = panel.getByTestId('comment-composer');
    await expect(editor.getByRole('textbox')).toHaveValue('first');
    await editor.getByRole('textbox').fill('second');
    await editor.getByTestId('composer-submit').click();
    await expect(card).toContainText('second');
    await expect(card).not.toContainText('first');

    await card.getByTestId('comment-delete').click();
    await expect(panel.getByTestId('comment-card')).toHaveCount(0);
    await expect(highlight(page, 'UserService').getByTestId('comment-dot')).toHaveCount(0);
    await expect(fileRow(page, 'src/services/user.ts').getByTestId('comment-dot')).toHaveCount(0);
  });

  test('the composer can be cancelled with the button or Escape', async ({ page, resk }) => {
    await page.goto(resk.url);
    const panel = await openUserPanel(page);
    await panel.locator('[data-column-number="18"]').first().click();
    await panel.getByTestId('composer-cancel').click();
    await expect(panel.getByTestId('comment-composer')).toHaveCount(0);
    await panel.locator('[data-column-number="18"]').first().click();
    await panel.getByTestId('comment-composer').getByRole('textbox').press('Escape');
    await expect(panel.getByTestId('comment-composer')).toHaveCount(0);
    await expect(panel.getByTestId('comment-card')).toHaveCount(0);
  });

  test('comments survive a page reload', async ({ page, resk }) => {
    await page.goto(resk.url);
    const panel = await openUserPanel(page);
    await panel.locator('[data-column-number="18"]').first().click();
    await panel.getByTestId('comment-composer').getByRole('textbox').fill('persist me');
    await panel.getByTestId('composer-submit').click();
    await expect
      .poll(async () => (await (await fetch(`${resk.url}/api/comments`)).json()).length)
      .toBe(1);

    await page.reload();
    await expect(fileRow(page, 'src/services/user.ts').getByTestId('comment-dot')).toBeVisible();
    await highlight(page, 'UserService').click();
    await expect(panelFor(page, 'src/services/user.ts').getByTestId('comment-card')).toContainText(
      'persist me',
    );
  });
});
