import { describe, expect, it } from 'vitest';
import { buildGitPlan } from '../../src/cli/git-plan.js';

const COMMON = ['-c', 'core.quotepath=false'];
const DIFF_FLAGS = ['--no-color', '--no-ext-diff', '-M'];

describe('buildGitPlan', () => {
  it('defaults to the working tree against HEAD, including untracked files', () => {
    expect(buildGitPlan(undefined, undefined, { untracked: true })).toEqual({
      args: [...COMMON, 'diff', ...DIFF_FLAGS, 'HEAD'],
      includeUntracked: true,
      title: 'Working tree vs HEAD',
    });
    expect(buildGitPlan('.', undefined, { untracked: true }).args).toEqual([
      ...COMMON,
      'diff',
      ...DIFF_FLAGS,
      'HEAD',
    ]);
  });

  it('honours --no-untracked', () => {
    expect(buildGitPlan('.', undefined, { untracked: false }).includeUntracked).toBe(false);
  });

  it('handles staged and working keywords', () => {
    expect(buildGitPlan('staged', undefined, { untracked: true })).toEqual({
      args: [...COMMON, 'diff', ...DIFF_FLAGS, '--cached'],
      includeUntracked: false,
      title: 'Staged changes',
    });
    expect(buildGitPlan('working', undefined, { untracked: true })).toEqual({
      args: [...COMMON, 'diff', ...DIFF_FLAGS],
      includeUntracked: true,
      title: 'Unstaged changes',
    });
  });

  it('shows a single commit with diff-tree so root commits work', () => {
    expect(buildGitPlan('6f4a9b7', undefined, { untracked: true })).toEqual({
      args: [...COMMON, 'diff-tree', '--root', '-p', '--no-commit-id', ...DIFF_FLAGS, '6f4a9b7'],
      includeUntracked: false,
      title: 'Commit 6f4a9b7',
    });
    expect(buildGitPlan('@', undefined, { untracked: true }).args.at(-1)).toBe('HEAD');
    expect(buildGitPlan('@', undefined, { untracked: true }).title).toBe('Commit HEAD');
  });

  it('compares against a base', () => {
    expect(buildGitPlan('.', 'main', { untracked: true })).toEqual({
      args: [...COMMON, 'diff', ...DIFF_FLAGS, 'main'],
      includeUntracked: true,
      title: 'Working tree vs main',
    });
    expect(buildGitPlan('staged', 'main', { untracked: true })).toEqual({
      args: [...COMMON, 'diff', ...DIFF_FLAGS, '--cached', 'main'],
      includeUntracked: false,
      title: 'Staged changes vs main',
    });
    expect(buildGitPlan('feature', 'main', { untracked: true })).toEqual({
      args: [...COMMON, 'diff', ...DIFF_FLAGS, 'main', 'feature'],
      includeUntracked: false,
      title: 'feature vs main',
    });
    expect(buildGitPlan('@', '@~1', { untracked: true })).toEqual({
      args: [...COMMON, 'diff', ...DIFF_FLAGS, 'HEAD~1', 'HEAD'],
      includeUntracked: false,
      title: 'HEAD vs HEAD~1',
    });
  });

  it('rejects comparing the working keyword with a ref', () => {
    expect(() => buildGitPlan('working', 'main', { untracked: true })).toThrow(/working/);
  });

  it('passes the context size through as --unified', () => {
    expect(buildGitPlan('.', undefined, { untracked: true, context: 5 }).args).toContain(
      '--unified=5',
    );
    expect(buildGitPlan('abc', undefined, { untracked: true, context: 0 }).args).toContain(
      '--unified=0',
    );
  });
});
