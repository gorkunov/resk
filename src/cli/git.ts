import { execFile } from 'node:child_process';
import type { GitPlan } from './git-plan.js';

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
