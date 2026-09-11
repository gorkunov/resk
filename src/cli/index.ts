#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import open from 'open';
import {
  buildProgram,
  CliInfoRequest,
  CliUsageError,
  parseCliArgs,
  type CliOptions,
} from './options.js';
import { buildGitPlan } from './git-plan.js';
import { collectDiff, findRepoRoot, GitError } from './git.js';
import { anchorWarnings } from './warnings.js';
import { parseUnifiedDiff } from '../shared/diff-parser.js';
import { formatReviewJson, formatReviewMarkdown } from '../shared/output-format.js';
import { ReviewSession } from '../server/session.js';
import { createApp } from '../server/app.js';
import { startServer, type RunningServer } from '../server/start.js';

const DEFAULT_GRACE_MS = 5000;

function log(message: string): void {
  process.stderr.write(`resk: ${message}\n`);
}

class ExitError extends Error {
  constructor(
    message: string,
    readonly code: number,
    readonly showHelp = false,
  ) {
    super(message);
  }
}

function readStdin(): Promise<string> {
  return new Promise((resolvePromise, reject) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk: string) => (data += chunk));
    process.stdin.on('end', () => resolvePromise(data));
    process.stdin.on('error', reject);
  });
}

async function readInput(path: string, what: string): Promise<string> {
  if (path === '-') return readStdin();
  try {
    return await readFile(resolve(path), 'utf8');
  } catch (error) {
    throw new ExitError(`cannot read ${what} "${path}": ${(error as Error).message}`, 2);
  }
}

async function loadDiff(options: CliOptions): Promise<{ diff: string; title: string }> {
  if (options.diff !== undefined) {
    const diff = await readInput(options.diff, 'diff file');
    return { diff, title: options.diff === '-' ? 'Piped diff' : basename(options.diff) };
  }
  const root = await findRepoRoot(process.cwd());
  if (!root)
    throw new ExitError('not inside a git repository (use --diff to review a patch file)', 2);
  let plan;
  try {
    plan = buildGitPlan(options.target, options.compareWith, {
      untracked: options.untracked,
      ...(options.context !== undefined ? { context: options.context } : {}),
    });
  } catch (error) {
    throw new ExitError((error as Error).message, 2, true);
  }
  try {
    return { diff: await collectDiff(plan, root), title: plan.title };
  } catch (error) {
    if (error instanceof GitError) throw new ExitError(error.message, 2);
    throw error;
  }
}

async function run(argv: string[]): Promise<void> {
  let options: CliOptions;
  try {
    options = parseCliArgs(argv);
  } catch (error) {
    if (error instanceof CliInfoRequest) {
      process.stdout.write(error.text);
      return;
    }
    if (error instanceof CliUsageError) throw new ExitError(error.message, 2, true);
    throw error;
  }

  const summary = await readInput(options.summary, 'summary file');
  const { diff, title: defaultTitle } = await loadDiff(options);
  const title = options.title ?? defaultTitle;
  const files = parseUnifiedDiff(diff);
  if (files.length === 0) log('warning: the diff is empty');
  for (const warning of anchorWarnings(summary, files)) log(`warning: ${warning}`);

  const graceMs = Number(process.env.RESK_EXIT_GRACE_MS ?? DEFAULT_GRACE_MS);
  let server: RunningServer | undefined;
  const session = new ReviewSession({
    graceMs,
    keepAlive: options.keepAlive,
    onFinish: (comments) => {
      const output = options.json
        ? formatReviewJson(title, comments, files)
        : formatReviewMarkdown(comments, files);
      process.stdout.write(output, () => {
        // Give the /api/finish response a moment to reach the browser before exiting.
        setTimeout(() => {
          const closing = server ? server.close().catch(() => undefined) : Promise.resolve();
          void closing.then(() => process.exit(0));
        }, 50);
      });
    },
  });

  const clientDir = resolve(dirname(fileURLToPath(import.meta.url)), '../client');
  const app = createApp({ review: { title, summary, files }, session, clientDir });
  try {
    server = await startServer(app, { host: options.host, port: options.port });
  } catch (error) {
    throw new ExitError((error as Error).message, 2);
  }
  log(server.url);

  if (options.open) {
    open(server.url).catch((error: Error) => {
      log(`warning: could not open the browser (${error.message}); open ${server!.url} manually`);
    });
  }

  const finish = (): void => session.finish();
  process.on('SIGINT', finish);
  process.on('SIGTERM', finish);
}

run(process.argv.slice(2)).catch((error: unknown) => {
  if (error instanceof ExitError) {
    log(error.message);
    if (error.showHelp) process.stderr.write(buildProgram().helpInformation());
    process.exit(error.code);
  }
  log(error instanceof Error ? (error.stack ?? error.message) : String(error));
  process.exit(2);
});
