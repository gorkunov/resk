import { createRequire } from 'node:module';
import { Command, CommanderError, InvalidArgumentError } from 'commander';

const { version: VERSION } = createRequire(import.meta.url)('../../package.json') as {
  version: string;
};

export interface CliOptions {
  summary: string;
  diff?: string;
  title?: string;
  /** Review session key; runs with the same key build on each other. */
  session?: string;
  untracked: boolean;
  context?: number;
  port: number;
  host: string;
  open: boolean;
  keepAlive: boolean;
  json: boolean;
  target?: string;
  compareWith?: string;
}

export class CliUsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CliUsageError';
  }
}

/** Thrown for --help and --version: `text` is what should be printed before exiting 0. */
export class CliInfoRequest extends Error {
  constructor(readonly text: string) {
    super('informational output requested');
    this.name = 'CliInfoRequest';
  }
}

function nonNegativeInt(value: string): number {
  if (!/^\d+$/.test(value)) throw new InvalidArgumentError('expected a non-negative integer');
  return Number(value);
}

export function buildProgram(): Command {
  return new Command()
    .name('resk')
    .description('Summary-first local code review for AI coding agents')
    .version(VERSION, '--version', 'print the version')
    .argument('[target]', '"." (working tree), "staged", "working", a ref, or "@" for HEAD')
    .argument('[compare-with]', 'ref to compare the target against')
    .requiredOption('--summary <path>', 'Markdown summary file ("-" reads stdin)')
    .option(
      '--diff <path>',
      'read a unified diff from a file ("-" reads stdin) instead of running git',
    )
    .option('--title <text>', 'review title shown in the top bar')
    .option(
      '--session <key>',
      'review session key; a later run with the same key is shown as an update to the earlier summary',
    )
    .option('--no-untracked', 'exclude untracked files (only affects "." and "working")')
    .option('--context <n>', 'context lines per hunk passed to git', nonNegativeInt)
    .option('--port <n>', 'preferred port; 0 picks a free one', nonNegativeInt, 4989)
    .option('--host <addr>', 'address to bind', '127.0.0.1')
    .option('--no-open', 'do not open the browser')
    .option('--keep-alive', 'do not exit when the last browser tab disconnects')
    .option('--json', 'print review output as JSON')
    .allowExcessArguments(false);
}

/**
 * Parses user arguments (without node/script). Throws CliUsageError with a readable message, or
 * CliInfoRequest for --help and --version.
 */
export function parseCliArgs(argv: string[]): CliOptions {
  let output = '';
  const program = buildProgram()
    .exitOverride()
    .configureOutput({
      writeErr: () => {},
      writeOut: (text) => {
        output += text;
      },
    });

  try {
    program.parse(argv, { from: 'user' });
  } catch (error) {
    if (error instanceof CommanderError) {
      if (error.code === 'commander.helpDisplayed' || error.code === 'commander.version') {
        throw new CliInfoRequest(output);
      }
      throw new CliUsageError(error.message.replace(/^error: /, ''));
    }
    throw error;
  }

  const raw = program.opts<{
    summary: string;
    diff?: string;
    title?: string;
    session?: string;
    untracked: boolean;
    context?: number;
    port: number;
    host: string;
    open: boolean;
    keepAlive?: boolean;
    json?: boolean;
  }>();
  const [target, compareWith] = program.args as [string?, string?];

  if (raw.diff !== undefined && (target !== undefined || compareWith !== undefined)) {
    throw new CliUsageError('positional targets cannot be combined with --diff');
  }
  if (raw.summary === '-' && raw.diff === '-') {
    throw new CliUsageError('only one of --summary and --diff can read from stdin');
  }
  if (raw.session !== undefined && raw.session.trim() === '') {
    throw new CliUsageError('--session needs a non-empty key');
  }

  const options: CliOptions = {
    summary: raw.summary,
    untracked: raw.untracked,
    port: raw.port,
    host: raw.host,
    open: raw.open,
    keepAlive: raw.keepAlive ?? false,
    json: raw.json ?? false,
  };
  if (raw.diff !== undefined) options.diff = raw.diff;
  if (raw.title !== undefined) options.title = raw.title;
  if (raw.session !== undefined) options.session = raw.session.trim();
  if (raw.context !== undefined) options.context = raw.context;
  if (target !== undefined) options.target = target;
  if (compareWith !== undefined) options.compareWith = compareWith;
  return options;
}
