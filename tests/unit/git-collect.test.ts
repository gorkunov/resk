import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { collectDiff, findRepoRoot, readContent } from '../../src/cli/git.js';
import { buildGitPlan } from '../../src/cli/git-plan.js';
import { parseUnifiedDiff } from '../../src/shared/diff-parser.js';

let repo: string;

function git(...args: string[]): string {
  return execFileSync('git', args, { cwd: repo, encoding: 'utf8' });
}

beforeAll(() => {
  repo = mkdtempSync(join(tmpdir(), 'resk-git-'));
  git('init', '-q', '-b', 'main');
  git('config', 'user.email', 't@example.com');
  git('config', 'user.name', 't');
  git('config', 'commit.gpgsign', 'false');
  writeFileSync(join(repo, 'a.txt'), 'one\ntwo\n');
  git('add', '-A');
  git('commit', '-q', '-m', 'root');
  writeFileSync(join(repo, 'a.txt'), 'one\n2\n');
  git('commit', '-q', '-am', 'second');
  git('checkout', '-q', '-b', 'feature');
  writeFileSync(join(repo, 'a.txt'), 'one\n2\nthree\n');
  git('commit', '-q', '-am', 'feature work');
  // working tree state: staged change, unstaged change, untracked text file, untracked binary
  writeFileSync(join(repo, 'a.txt'), 'one\n2\nthree\nfour\n');
  git('add', 'a.txt');
  writeFileSync(join(repo, 'a.txt'), 'one\n2\nthree\nfour\nfive\n');
  mkdirSync(join(repo, 'new'));
  writeFileSync(join(repo, 'new', 'fresh.txt'), 'hello\n');
  writeFileSync(join(repo, 'blob.bin'), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x01, 0x02]));
  writeFileSync(join(repo, '.gitignore'), 'ignored.txt\n');
  writeFileSync(join(repo, 'ignored.txt'), 'nope\n');
});

afterAll(() => {
  rmSync(repo, { recursive: true, force: true });
});

describe('findRepoRoot', () => {
  it('returns the top level from a nested directory', async () => {
    expect(await findRepoRoot(join(repo, 'new'))).toBe(await findRepoRoot(repo));
  });

  it('returns undefined outside a repository', async () => {
    const outside = mkdtempSync(join(tmpdir(), 'resk-nogit-'));
    try {
      expect(await findRepoRoot(outside)).toBeUndefined();
    } finally {
      rmSync(outside, { recursive: true, force: true });
    }
  });
});

describe('collectDiff', () => {
  it('collects working tree changes against HEAD plus untracked files, skipping ignored ones', async () => {
    const diff = await collectDiff(buildGitPlan('.', undefined, { untracked: true }), repo);
    const files = parseUnifiedDiff(diff);
    expect(files.map((f) => [f.path, f.status, f.binary])).toEqual([
      ['a.txt', 'modified', false],
      ['.gitignore', 'added', false],
      ['blob.bin', 'added', true],
      ['new/fresh.txt', 'added', false],
    ]);
    expect(files[0]!.additions).toBe(2);
    expect(files[3]!.hunks[0]!.lines[0]).toEqual({ type: 'add', newLine: 1, text: 'hello' });
  });

  it('excludes untracked files when asked', async () => {
    const diff = await collectDiff(buildGitPlan('.', undefined, { untracked: false }), repo);
    expect(parseUnifiedDiff(diff).map((f) => f.path)).toEqual(['a.txt']);
  });

  it('collects staged changes only', async () => {
    const diff = await collectDiff(buildGitPlan('staged', undefined, { untracked: true }), repo);
    const [file] = parseUnifiedDiff(diff);
    expect(file!.additions).toBe(1);
    expect(file!.hunks[0]!.lines.at(-1)).toEqual({ type: 'add', newLine: 4, text: 'four' });
  });

  it('shows a single commit, including the root commit', async () => {
    const root = git('rev-list', '--max-parents=0', 'HEAD').trim();
    const files = parseUnifiedDiff(
      await collectDiff(buildGitPlan(root, undefined, { untracked: true }), repo),
    );
    expect(files.map((f) => [f.path, f.status])).toEqual([['a.txt', 'added']]);
    const head = parseUnifiedDiff(
      await collectDiff(buildGitPlan('@', undefined, { untracked: true }), repo),
    );
    expect(head[0]!.hunks[0]!.lines.at(-1)).toEqual({ type: 'add', newLine: 3, text: 'three' });
  });

  it('compares two refs', async () => {
    const files = parseUnifiedDiff(
      await collectDiff(buildGitPlan('feature', 'main', { untracked: true }), repo),
    );
    expect(files[0]!.additions).toBe(1);
    expect(files[0]!.deletions).toBe(0);
  });

  it('propagates git errors', async () => {
    await expect(
      collectDiff(buildGitPlan('does-not-exist', undefined, { untracked: true }), repo),
    ).rejects.toThrow(/does-not-exist/);
  });
});

describe('readContent', () => {
  it('reads a tracked file from a revision, the index and the work tree', async () => {
    const worktree = await readContent({ kind: 'worktree' }, 'a.txt', repo);
    expect(worktree).toBe('one\n2\nthree\nfour\nfive\n');
    expect(await readContent({ kind: 'index' }, 'a.txt', repo)).toBe('one\n2\nthree\nfour\n');
    expect(await readContent({ kind: 'rev', rev: 'HEAD' }, 'a.txt', repo)).toBe('one\n2\nthree\n');
    expect(await readContent({ kind: 'rev', rev: 'main' }, 'a.txt', repo)).toBe('one\n2\n');
  });

  it('returns undefined when the file is absent from that source', async () => {
    expect(await readContent({ kind: 'worktree' }, 'nope.txt', repo)).toBeUndefined();
    expect(await readContent({ kind: 'rev', rev: 'HEAD' }, 'new/fresh.txt', repo)).toBeUndefined();
    expect(await readContent({ kind: 'rev', rev: 'nosuchref' }, 'a.txt', repo)).toBeUndefined();
  });

  it('returns undefined for binary content', async () => {
    expect(await readContent({ kind: 'worktree' }, 'blob.bin', repo)).toBeUndefined();
  });

  it('never escapes the repository', async () => {
    expect(await readContent({ kind: 'worktree' }, '../outside.txt', repo)).toBeUndefined();
  });
});
