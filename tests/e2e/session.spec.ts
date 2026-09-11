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

function rounds(page: Page) {
  return page.getByTestId('round-section');
}

test.describe('review sessions: process', () => {
  test('the first round announces the session, titles the review after it and stores the result', async () => {
    const resk = await launch('summary.md');
    const review = await (await fetch(`${resk.url}/api/review`)).json();
    expect(review.title).toBe(KEY);
    expect(review.session).toMatchObject({ key: KEY, round: 1, previous: [] });
    expect(Date.parse(review.session.startedAt)).not.toBeNaN();
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
  test('the initial round looks like a plain review with a round badge', async ({ page }) => {
    const resk = await launch('summary.md');
    await page.goto(resk.url);
    await expect(page.getByTestId('session-round')).toHaveText('Initial Round');
    await expect(rounds(page)).toHaveCount(0);
    await expect(page).toHaveTitle(`${KEY} - Resk`);
  });

  test('a follow-up puts the current round on top and the initial round below it', async ({
    page,
  }) => {
    seed([{ summary: LONG_ROUND_ONE, comments: [comment] }]);
    const resk = await launch('update.md');
    await page.goto(resk.url);

    await expect(page.getByTestId('session-round')).toHaveText('Round 2');
    await expect(rounds(page)).toHaveCount(2);

    const current = rounds(page).nth(0);
    await expect(current).toHaveAttribute('data-current', 'true');
    await expect(current.getByRole('heading', { name: 'Round 2' })).toBeVisible();
    await expect(current.getByTestId('round-meta')).toContainText('Current round');
    await expect(current).toContainText('Addressed the round 1 comments.');
    await expect(current.getByTestId('round-title')).toBeInViewport();

    const initial = rounds(page).nth(1);
    await expect(initial).not.toHaveAttribute('data-current', 'true');
    await expect(initial.getByRole('heading', { name: 'Initial Round' })).toBeVisible();
    await expect(initial.getByTestId('round-meta')).toContainText('Reviewed');
    await expect(initial.getByTestId('round-meta')).toContainText('1 comment');
    await expect(initial).toContainText('Token refresh moved from the client');

    const currentBox = (await current.boundingBox())!;
    const initialBox = (await initial.boundingBox())!;
    expect(currentBox.y).toBeLessThan(initialBox.y);
  });

  test('the round title is a plain heading with the date on a second line, not a badge', async ({
    page,
  }) => {
    seed([{ summary: ROUND_ONE }]);
    const resk = await launch('update.md');
    await page.goto(resk.url);
    const title = rounds(page).nth(1).getByTestId('round-title');
    const meta = rounds(page).nth(1).getByTestId('round-meta');
    await expect(title).toHaveText('Initial Round');
    await expect(meta).toContainText(/Reviewed .*\d/);
    const titleBox = (await title.boundingBox())!;
    const metaBox = (await meta.boundingBox())!;
    expect(metaBox.y).toBeGreaterThanOrEqual(titleBox.y + titleBox.height - 1);
    expect(Math.abs(metaBox.x - titleBox.x)).toBeLessThan(2);
    const titleStyle = await title.evaluate((el) => {
      const style = getComputedStyle(el);
      return { fontSize: parseFloat(style.fontSize), radius: style.borderRadius };
    });
    expect(titleStyle.fontSize).toBeGreaterThanOrEqual(20);
    expect(titleStyle.radius).toBe('0px');
  });

  test('rounds are listed newest first down to the initial round', async ({ page }) => {
    seed([{ summary: ROUND_ONE, comments: [comment] }, { summary: 'Second round text.' }]);
    const resk = await launch('update.md');
    await page.goto(resk.url);
    await expect(page.getByTestId('session-round')).toHaveText('Round 3');
    await expect(rounds(page)).toHaveCount(3);
    await expect(rounds(page).locator('[data-testid="round-title"]')).toHaveText([
      'Round 3',
      'Round 2',
      'Initial Round',
    ]);
    await expect(rounds(page).nth(0)).toHaveAttribute('data-current', 'true');
    await expect(rounds(page).nth(0)).toContainText('Addressed the round 1 comments.');
    await expect(rounds(page).nth(1)).not.toHaveAttribute('data-current', 'true');
    await expect(rounds(page).nth(1)).toContainText('Second round text.');
    await expect(rounds(page).nth(1).getByTestId('round-meta')).toContainText('0 comments');
    await expect(rounds(page).nth(2)).toContainText('Token refresh moved');
  });

  test('highlights inside the current round open panels against the current diff', async ({
    page,
  }) => {
    seed([{ summary: ROUND_ONE }]);
    const resk = await launch('update.md');
    await page.goto(resk.url);
    const current = rounds(page).first();
    await current.getByTestId('highlight').filter({ hasText: 'POST /auth/refresh' }).click();
    await expect(page.getByTestId('layout')).toHaveAttribute('data-panels', '1');
    const panel = page.locator('[data-testid="panel"][data-path="src/routes/auth.ts"]');
    await expect(panel).toHaveAttribute('data-focus', 'new:6-9');
  });

  test('a selection comment inside the current round is reported with its quote', async ({
    page,
  }) => {
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
