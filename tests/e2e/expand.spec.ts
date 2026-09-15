import { test, expect, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { launchResk, type Launched } from './launch.js';

const TOTAL_LINES = 80;

let repo: string;
let launched: Launched | undefined;

function body(changed: number[]): string {
  return (
    Array.from({ length: TOTAL_LINES }, (_, i) =>
      changed.includes(i + 1)
        ? `const line${i + 1} = 'changed';`
        : `const line${i + 1} = ${i + 1};`,
    ).join('\n') + '\n'
  );
}

test.beforeEach(() => {
  repo = mkdtempSync(join(tmpdir(), 'resk-expand-'));
  const git = (...args: string[]) => execFileSync('git', args, { cwd: repo, encoding: 'utf8' });
  git('init', '-q', '-b', 'main');
  git('config', 'user.email', 't@example.com');
  git('config', 'user.name', 't');
  git('config', 'commit.gpgsign', 'false');
  writeFileSync(join(repo, 'app.ts'), body([]));
  git('add', '-A');
  git('commit', '-q', '-m', 'init');
  writeFileSync(join(repo, 'app.ts'), body([10, 70]));
  writeFileSync(join(repo, 'summary.md'), 'Two edits in [app.ts](diff:app.ts#L5).\n');
});

test.afterEach(async () => {
  await launched?.kill();
  launched = undefined;
  rmSync(repo, { recursive: true, force: true });
});

async function open(page: Page) {
  launched = await launchResk(['--summary', 'summary.md', '--keep-alive'], { cwd: repo });
  await page.goto(launched.url);
  await page.getByTestId('highlight').filter({ hasText: 'app.ts' }).first().click();
  const panel = page.locator('[data-testid="panel"][data-path="app.ts"]');
  await expect(panel.locator('[data-line]').first()).toBeVisible();
  return panel;
}

function lineCount(panel: ReturnType<Page['locator']>) {
  return panel.locator('[data-line]').count();
}

test.describe('expanding unmodified context', () => {
  test('the gap between hunks expands one block at a time', async ({ page }) => {
    const panel = await open(page);
    const before = await lineCount(panel);
    // Two changes, each with three lines of context around it.
    expect(before).toBeLessThan(20);

    const gap = panel.locator('[data-separator][data-expand-index="1"]');
    await expect(gap.first()).toContainText('53 unmodified lines');

    const expandDown = gap.locator('[data-expand-button][data-expand-down]:visible').first();
    await expandDown.click();
    await expect.poll(() => lineCount(panel)).toBe(before + 20);
    await expect(gap.first()).toContainText('33 unmodified lines');

    await expandDown.click();
    await expect.poll(() => lineCount(panel)).toBe(before + 40);
    await expect(gap.first()).toContainText('13 unmodified lines');

    // The last, smaller block finishes the gap; the other gaps stay collapsed.
    await gap.locator('[data-expand-button]:visible').first().click();
    await expect.poll(() => lineCount(panel)).toBe(before + 53);
    expect(await lineCount(panel)).toBeLessThan(TOTAL_LINES);
  });

  test('context above the first hunk expands too', async ({ page }) => {
    const panel = await open(page);
    const before = await lineCount(panel);
    const top = panel.locator('[data-separator][data-expand-index="0"]');
    await expect(top.first()).toContainText('unmodified lines');
    await top.locator('[data-expand-button]:visible').first().click();
    await expect.poll(() => lineCount(panel)).toBe(before + 6);
  });

  test('a review served from a patch file has no expand controls', async ({ page }) => {
    launched = await launchResk([
      '--summary',
      'summary.md',
      '--diff',
      'sample.patch',
      '--keep-alive',
    ]);
    await page.goto(launched.url);
    const review = await (await fetch(`${launched.url}/api/review`)).json();
    expect(review.expandable).toBe(false);
    await page.getByTestId('highlight').filter({ hasText: 'UserService' }).click();
    const panel = page.locator('[data-testid="panel"][data-path="src/services/user.ts"]');
    await expect(panel.locator('[data-line]').first()).toBeVisible();
    await expect(panel.locator('[data-expand-button]')).toHaveCount(0);
  });
});
