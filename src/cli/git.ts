import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { isAbsolute, relative, resolve } from 'node:path';
import type { ContentSource, GitPlan } from './git-plan.js';

const MAX_BUFFER = 1024 * 1024 * 512;

interface ExecResult {
  code: number;
  stdout: string;
  stderr: string;
}

function runGit(args: string[], cwd: string): Promise<ExecResult> {
  return new Promise((resolve) => {
    execFile(
      'git',
      args,
      { cwd, encoding: 'utf8', maxBuffer: MAX_BUFFER },
      (error, stdout, stderr) => {
        const code =
          error && typeof (error as NodeJS.ErrnoException & { code?: unknown }).code === 'number'
            ? (error as { code: number }).code
            : error
              ? 128
              : 0;
        resolve({ code, stdout, stderr });
      },
    );
  });
}

export class GitError extends Error {
  constructor(args: string[], stderr: string) {
    super(`git ${args.join(' ')} failed: ${stderr.trim()}`);
    this.name = 'GitError';
  }
}

/** Repository top level for a directory, or undefined when it is not inside a git work tree. */
export async function findRepoRoot(cwd: string): Promise<string | undefined> {
  const result = await runGit(['rev-parse', '--show-toplevel'], cwd);
  if (result.code !== 0) return undefined;
  const root = result.stdout.trim();
  return root === '' ? undefined : root;
}

async function listUntracked(repoRoot: string): Promise<string[]> {
  const result = await runGit(['ls-files', '--others', '--exclude-standard', '-z'], repoRoot);
  if (result.code !== 0) throw new GitError(['ls-files'], result.stderr);
  return result.stdout.split('\0').filter((f) => f !== '');
}

async function untrackedPatch(
  file: string,
  context: number | undefined,
  repoRoot: string,
): Promise<string> {
  const args = ['-c', 'core.quotepath=false', 'diff', '--no-index', '--no-color', '--no-ext-diff'];
  if (context !== undefined) args.push(`--unified=${context}`);
  args.push('--', '/dev/null', file);
  const result = await runGit(args, repoRoot);
  // --no-index exits 1 when the files differ, which is the expected case.
  if (result.code > 1) throw new GitError(args, result.stderr);
  return result.stdout;
}

function isBinary(text: string): boolean {
  return text.includes('\0');
}

/**
 * Full text of one version of a file, for expanding unmodified context in the browser. Undefined
 * when that version does not exist (added or deleted files), is binary, or cannot be read.
 */
export async function readContent(
  source: ContentSource,
  path: string,
  repoRoot: string,
): Promise<string | undefined> {
  if (source.kind === 'worktree') {
    const full = resolve(repoRoot, path);
    const inside = relative(repoRoot, full);
    if (inside.startsWith('..') || isAbsolute(inside)) return undefined;
    try {
      const text = await readFile(full, 'utf8');
      return isBinary(text) ? undefined : text;
    } catch {
      return undefined;
    }
  }
  const spec = source.kind === 'index' ? `:${path}` : `${source.rev}:${path}`;
  const result = await runGit(['-c', 'core.quotepath=false', 'show', spec], repoRoot);
  if (result.code !== 0) return undefined;
  return isBinary(result.stdout) ? undefined : result.stdout;
}

/** Runs the plan from the repository root and returns the complete unified diff. */
export async function collectDiff(plan: GitPlan, repoRoot: string): Promise<string> {
  const main = await runGit(plan.args, repoRoot);
  if (main.code !== 0) throw new GitError(plan.args, main.stderr);
  let diff = main.stdout;
  if (plan.includeUntracked) {
    for (const file of await listUntracked(repoRoot)) {
      diff += await untrackedPatch(file, plan.context, repoRoot);
    }
  }
  return diff;
}
