import { test, expect, type Page } from '@playwright/test';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FIXTURES, launchResk, type Launched } from './launch.js';
import { selectText } from './select-text.js';

const KEY = 'demo/session';
const ROUND_ONE = readFileSync(join(FIXTURES, 'summary.md'), 'utf8');
const UPDATE = readFileSync(join(FIXTURES, 'update.md'), 'utf8');
const FILLER = Array.from({ length: 40 }, (_, i) => `Paragraph ${i + 1} of the original summary.`);
const LONG_ROUND_ONE = `${ROUND_ONE}\n\n${FILLER.join('\n\n')}\n`;

interface StoredRound {
  number: number;
  summary: string;
  finishedAt: string;
  comments: unknown[];
}

let home: string;
let launched: Launched[] = [];

test.beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'resk-home-'));
});
test.afterEach(async () => {
  await Promise.all(launched.map((l) => l.kill()));
  launched = [];
  rmSync(home, { recursive: true, force: true });
});

function sessionFile(): string {
  return join(home, 'sessions', 'demo-session.json');
}

function seed(rounds: Array<{ summary: string; comments?: unknown[] }>): void {
  mkdirSync(join(home, 'sessions'), { recursive: true });
  const stored: StoredRound[] = rounds.map((r, i) => ({
    number: i + 1,
    summary: r.summary,
    finishedAt: `2026-09-11T1${i}:00:00.000Z`,
    comments: r.comments ?? [],
  }));
  writeFileSync(sessionFile(), JSON.stringify({ key: KEY, rounds: stored }));
}

function readStored(): { key: string; rounds: StoredRound[] } {
  return JSON.parse(readFileSync(sessionFile(), 'utf8'));
}

async function launch(summary: string, extra: string[] = []): Promise<Launched> {
  const l = await launchResk(
    ['--summary', summary, '--diff', 'sample.patch', '--session', KEY, '--keep-alive', ...extra],
    { env: { RESK_HOME: home } },
  );
  launched.push(l);
  return l;
}

const comment = {
  id: 'c1',
  target: { kind: 'lines', path: 'src/services/user.ts', side: 'new', start: 18, end: 19 },
  body: 'Why is the timeout hardcoded?',
  createdAt: '2026-09-11T10:00:00.000Z',
  updatedAt: '2026-09-11T10:00:00.000Z',
};

function updates(page: Page) {
  return page.getByTestId('update-section');
}

test.describe('review sessions: process', () => {
  test('the first round announces the session, titles the review after it and stores the result', async () => {
    const resk = await launch('summary.md');
    const review = await (await fetch(`${resk.url}/api/review`)).json();
    expect(review.title).toBe(KEY);
    expect(review.session).toEqual({ key: KEY, round: 1, previous: [] });
    expect(resk.stderr()).toContain(`resk: session "${KEY}": round 1`);

    await fetch(`${resk.url}/api/comments`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify([comment]),
    });
    await fetch(`${resk.url}/api/finish`, { method: 'POST' });
    expect(await resk.exit).toBe(0);
    expect(resk.stdout()).toContain('# Review comments (1)');

    const stored = readStored();
    expect(stored.key).toBe(KEY);
    expect(stored.rounds).toHaveLength(1);
    expect(stored.rounds[0]).toMatchObject({ number: 1, summary: ROUND_ONE, comments: [comment] });
    expect(Date.parse(stored.rounds[0]!.finishedAt)).not.toBeNaN();
  });

  test('a later round sees the finished rounds and is appended on finish', async () => {
    seed([{ summary: ROUND_ONE, comments: [comment] }]);
    const resk = await launch('update.md');
    const review = await (await fetch(`${resk.url}/api/review`)).json();
    expect(review.summary).toBe(UPDATE);
    expect(review.session.round).toBe(2);
    expect(review.session.previous).toEqual([
      { number: 1, summary: ROUND_ONE, finishedAt: '2026-09-11T10:00:00.000Z', commentCount: 1 },
    ]);
    expect(resk.stderr()).toContain(`resk: session "${KEY}": round 2 (1 finished round)`);

    await fetch(`${resk.url}/api/finish`, { method: 'POST' });
    expect(await resk.exit).toBe(0);
    expect(readStored().rounds.map((r) => [r.number, r.summary])).toEqual([
      [1, ROUND_ONE],
      [2, UPDATE],
    ]);
  });

  test('--title still wins over the session key', async () => {
    const resk = await launch('summary.md', ['--title', 'Custom']);
    const review = await (await fetch(`${resk.url}/api/review`)).json();
    expect(review.title).toBe('Custom');
  });

  test('a corrupt session file is a startup error', async () => {
    mkdirSync(join(home, 'sessions'), { recursive: true });
    writeFileSync(sessionFile(), '{oops');
    const resk = await launchResk(
      ['--summary', 'summary.md', '--diff', 'sample.patch', '--session', KEY],
      { env: { RESK_HOME: home }, expectUrl: false },
    );
    expect(await resk.exit).toBe(2);
    expect(resk.stderr()).toMatch(/session file .*demo-session\.json.* is not valid JSON/);
  });

  test('a run that is not finished is not recorded', async () => {
    const resk = await launchResk(
      ['--summary', 'summary.md', '--diff', 'sample.patch', '--session', KEY],
      { env: { RESK_HOME: home, RESK_EXIT_GRACE_MS: '50' } },
    );
    launched.push(resk);
    resk.proc.kill('SIGKILL');
    await resk.exit;
    expect(() => readStored()).toThrow();
  });
});

test.describe('review sessions: page', () => {
  test('round 1 looks like a plain review with a round badge', async ({ page }) => {
    const resk = await launch('summary.md');
    await page.goto(resk.url);
    await expect(page.getByTestId('session-round')).toHaveText('Round 1');
    await expect(updates(page)).toHaveCount(0);
    await expect(page).toHaveTitle(`${KEY} - Resk`);
  });

  test('a follow-up shows the original summary, then the update as the current section', async ({
    page,
  }) => {
    seed([{ summary: LONG_ROUND_ONE, comments: [comment] }]);
    const resk = await launch('update.md');
    await page.goto(resk.url);

    await expect(page.getByTestId('session-round')).toHaveText('Update 1');
    const markdown = page.getByTestId('summary-markdown');
    await expect(markdown).toContainText('Token refresh moved from the client');
    await expect(updates(page)).toHaveCount(1);
    const update = updates(page).first();
    await expect(update).toHaveAttribute('data-current', 'true');
    await expect(update.getByTestId('update-label')).toHaveText('Update 1');
    await expect(update).toContainText('Addressed the round 1 comments.');

    // The original summary sits above the update in reading order.
    const original = markdown.getByRole('heading', { name: 'Critical' });
    const originalBox = (await original.boundingBox())!;
    const updateBox = (await update.boundingBox())!;
    expect(originalBox.y).toBeLessThan(updateBox.y);
  });

  test('the page opens scrolled to the current update', async ({ page }) => {
    seed([{ summary: LONG_ROUND_ONE }]);
    const resk = await launch('update.md');
    await page.goto(resk.url);
    const update = updates(page).first();
    await expect(update.getByTestId('update-label')).toBeInViewport();
    await expect(
      page.getByTestId('summary-markdown').getByRole('heading', { name: 'Critical' }),
    ).not.toBeInViewport();
  });

  test('earlier updates are listed before the current one with their review date', async ({
    page,
  }) => {
    seed([{ summary: ROUND_ONE, comments: [comment] }, { summary: 'First update text.' }]);
    const resk = await launch('update.md');
    await page.goto(resk.url);
    await expect(page.getByTestId('session-round')).toHaveText('Update 2');
    await expect(updates(page)).toHaveCount(2);
    const first = updates(page).nth(0);
    await expect(first.getByTestId('update-label')).toHaveText('Update 1');
    await expect(first).not.toHaveAttribute('data-current', 'true');
    await expect(first).toContainText('First update text.');
    await expect(first).toContainText('reviewed');
    const second = updates(page).nth(1);
    await expect(second.getByTestId('update-label')).toHaveText('Update 2');
    await expect(second).toHaveAttribute('data-current', 'true');
    await expect(second).toContainText('Addressed the round 1 comments.');
  });

  test('highlights inside the update open panels against the current diff', async ({ page }) => {
    seed([{ summary: ROUND_ONE }]);
    const resk = await launch('update.md');
    await page.goto(resk.url);
    const update = updates(page).first();
    await update.getByTestId('highlight').filter({ hasText: 'POST /auth/refresh' }).click();
    await expect(page.getByTestId('layout')).toHaveAttribute('data-panels', '1');
    const panel = page.locator('[data-testid="panel"][data-path="src/routes/auth.ts"]');
    await expect(panel).toHaveAttribute('data-focus', 'new:6-9');
  });

  test('a selection comment inside the update is reported with its quote', async ({ page }) => {
    seed([{ summary: ROUND_ONE }]);
    const resk = await launch('update.md');
    await page.goto(resk.url);
    await selectText(page, 'the migration stays in this change');
    await page.getByTestId('selection-comment-button').click();
    const composer = page.getByTestId('selection-popover').getByTestId('comment-composer');
    await composer.getByRole('textbox').fill('Please split it out after all.');
    await composer.getByTestId('composer-submit').click();
    await expect(page.getByTestId('selection-popover')).toHaveCount(0);
    await expect
      .poll(async () => (await (await fetch(`${resk.url}/api/comments`)).json()).length)
      .toBe(1);

    await page.getByTestId('finish-button').click();
    expect(await resk.exit).toBe(0);
    expect(resk.stdout()).toContain(
      '- On "the migration stays in this change": Please split it out after all.',
    );
    expect(readStored().rounds[1]!.comments).toHaveLength(1);
  });
});
