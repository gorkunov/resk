import { test, expect } from '@playwright/test';
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { DEFAULT_ARGS, FIXTURES, launchResk } from './launch.js';

const comment = {
  id: 'c1',
  target: { kind: 'lines', path: 'src/services/user.ts', side: 'new', start: 18, end: 19 },
  body: 'Why is the timeout hardcoded?',
  createdAt: '2026-09-11T10:00:00.000Z',
  updatedAt: '2026-09-11T10:00:00.000Z',
};

async function putComments(url: string, comments: unknown[]): Promise<void> {
  const res = await fetch(`${url}/api/comments`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(comments),
  });
  expect(res.status).toBe(200);
}

test.describe('resk process', () => {
  test('serves the review payload built from --summary and --diff', async () => {
    const resk = await launchResk(DEFAULT_ARGS);
    try {
      const review = await (await fetch(`${resk.url}/api/review`)).json();
      expect(review.title).toBe('sample.patch');
      expect(review.summary).toContain('## Critical');
      expect(review.files.map((f: { path: string }) => f.path)).toEqual([
        'README.md',
        'assets/logo.png',
        'src/auth/token.ts',
        'src/routes/auth.ts',
        'src/services/user.ts',
        'src/utils/clock.ts',
      ]);
    } finally {
      await resk.kill();
    }
  });

  test('warns on stderr about anchors that do not resolve', async () => {
    const resk = await launchResk(DEFAULT_ARGS);
    try {
      expect(resk.stderr()).toContain(
        'resk: warning: anchor "diff:src/missing/file.ts" does not match any changed file',
      );
    } finally {
      await resk.kill();
    }
  });

  test('prints "No review comments." and exits 0 when finished without comments', async () => {
    const resk = await launchResk(DEFAULT_ARGS);
    await fetch(`${resk.url}/api/finish`, { method: 'POST' });
    expect(await resk.exit).toBe(0);
    expect(resk.stdout()).toBe('No review comments.\n');
  });

  test('prints Markdown review output on finish', async () => {
    const resk = await launchResk(DEFAULT_ARGS);
    await putComments(resk.url, [comment]);
    await fetch(`${resk.url}/api/finish`, { method: 'POST' });
    expect(await resk.exit).toBe(0);
    expect(resk.stdout()).toBe(
      [
        '# Review comments (1)',
        '',
        '## src/services/user.ts',
        '- L18-L19 (new): Why is the timeout hardcoded?',
        '  > +    const timeout = 3000;',
        '  > +    await refresh(token, timeout);',
        '',
      ].join('\n'),
    );
  });

  test('prints JSON with --json', async () => {
    const resk = await launchResk([...DEFAULT_ARGS, '--json', '--title', 'Custom title']);
    await putComments(resk.url, [comment]);
    await fetch(`${resk.url}/api/finish`, { method: 'POST' });
    expect(await resk.exit).toBe(0);
    const parsed = JSON.parse(resk.stdout());
    expect(parsed.title).toBe('Custom title');
    expect(parsed.comments).toHaveLength(1);
    expect(parsed.comments[0].excerpt).toEqual([
      '+    const timeout = 3000;',
      '+    await refresh(token, timeout);',
    ]);
  });

  test('SIGINT prints the collected comments and exits 0', async () => {
    const resk = await launchResk(DEFAULT_ARGS);
    await putComments(resk.url, [comment]);
    resk.proc.kill('SIGINT');
    expect(await resk.exit).toBe(0);
    expect(resk.stdout()).toContain('# Review comments (1)');
  });

  test('exits after the grace period once the last browser connection drops', async () => {
    const resk = await launchResk(['--summary', 'summary.md', '--diff', 'sample.patch'], {
      env: { RESK_EXIT_GRACE_MS: '300' },
    });
    const controller = new AbortController();
    const res = await fetch(`${resk.url}/api/events`, { signal: controller.signal });
    const reader = res.body!.getReader();
    await reader.read();
    controller.abort();
    expect(await resk.exit).toBe(0);
    expect(resk.stdout()).toBe('No review comments.\n');
  });

  test('reads the diff from stdin with --diff -', async () => {
    const patch = readFileSync(join(FIXTURES, 'sample.patch'), 'utf8');
    const resk = await launchResk(['--summary', 'summary.md', '--diff', '-', '--keep-alive'], {
      stdin: patch,
    });
    try {
      const review = await (await fetch(`${resk.url}/api/review`)).json();
      expect(review.files).toHaveLength(6);
      expect(review.title).toBe('Piped diff');
    } finally {
      await resk.kill();
    }
  });

  test('still opens with an empty diff but warns', async () => {
    const resk = await launchResk(['--summary', 'summary.md', '--diff', '-', '--keep-alive'], {
      stdin: '',
    });
    try {
      const review = await (await fetch(`${resk.url}/api/review`)).json();
      expect(review.files).toEqual([]);
      expect(resk.stderr()).toContain('resk: warning: the diff is empty');
    } finally {
      await resk.kill();
    }
  });

  test('reviews a git working tree when given a target instead of --diff', async () => {
    const repo = mkdtempSync(join(tmpdir(), 'resk-repo-'));
    const git = (...args: string[]) => execFileSync('git', args, { cwd: repo, encoding: 'utf8' });
    try {
      git('init', '-q', '-b', 'main');
      git('config', 'user.email', 't@example.com');
      git('config', 'user.name', 't');
      git('config', 'commit.gpgsign', 'false');
      writeFileSync(join(repo, 'app.ts'), 'export const a = 1;\n');
      git('add', '-A');
      git('commit', '-q', '-m', 'init');
      writeFileSync(join(repo, 'app.ts'), 'export const a = 2;\n');
      writeFileSync(join(repo, 'new.ts'), 'export const b = 1;\n');
      const summary = join(mkdtempSync(join(tmpdir(), 'resk-summary-')), 'summary.md');
      writeFileSync(summary, 'Bumped [a](diff:app.ts#L1) and added `new.ts`.\n');

      const resk = await launchResk(['--summary', summary, '--keep-alive'], { cwd: repo });
      try {
        const review = await (await fetch(`${resk.url}/api/review`)).json();
        expect(review.title).toBe(`${basename(repo)}: Working tree vs HEAD`);
        expect(
          review.files.map((f: { path: string; status: string }) => [f.path, f.status]),
        ).toEqual([
          ['app.ts', 'modified'],
          ['new.ts', 'added'],
        ]);
        expect(resk.stderr()).not.toContain('warning');
      } finally {
        await resk.kill();
      }
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  test('exits 2 for a missing summary file', async () => {
    const resk = await launchResk(['--summary', 'nope.md', '--diff', 'sample.patch'], {
      expectUrl: false,
    });
    expect(await resk.exit).toBe(2);
    expect(resk.stderr()).toContain('nope.md');
  });

  test('exits 2 with usage help when --summary is missing', async () => {
    const resk = await launchResk(['.'], { expectUrl: false });
    expect(await resk.exit).toBe(2);
    expect(resk.stderr()).toMatch(/--summary/);
  });

  test('exits 2 outside a git repository when no --diff is given', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'resk-nogit-'));
    try {
      const resk = await launchResk(['--summary', join(FIXTURES, 'summary.md')], {
        cwd: dir,
        expectUrl: false,
      });
      expect(await resk.exit).toBe(2);
      expect(resk.stderr()).toMatch(/not (inside )?a git repository/i);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
