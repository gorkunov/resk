import { spawn, type ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const CLI = fileURLToPath(new URL('../../dist/cli/index.js', import.meta.url));
export const FIXTURES = fileURLToPath(new URL('../fixtures/', import.meta.url));

export interface Launched {
  url: string;
  proc: ChildProcess;
  stdout: () => string;
  stderr: () => string;
  /** Resolves with the exit code once the process ends. */
  exit: Promise<number | null>;
  kill(): Promise<void>;
}

export interface LaunchOptions {
  cwd?: string;
  stdin?: string;
  env?: Record<string, string>;
  /** When false, resolve as soon as the process exits instead of waiting for the URL. */
  expectUrl?: boolean;
}

/** Starts the built CLI with `--no-open --port 0` and resolves once it prints its URL. */
export function launchResk(args: string[], options: LaunchOptions = {}): Promise<Launched> {
  const proc = spawn('node', [CLI, ...args, '--no-open', '--port', '0'], {
    cwd: options.cwd ?? FIXTURES,
    env: { ...process.env, ...options.env },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  let out = '';
  let err = '';
  proc.stdout!.setEncoding('utf8').on('data', (chunk: string) => (out += chunk));
  proc.stderr!.setEncoding('utf8').on('data', (chunk: string) => (err += chunk));
  if (options.stdin !== undefined) proc.stdin!.end(options.stdin);
  else proc.stdin!.end();

  const exit = new Promise<number | null>((resolve) => proc.once('exit', (code) => resolve(code)));
  const launched: Launched = {
    url: '',
    proc,
    stdout: () => out,
    stderr: () => err,
    exit,
    kill: async () => {
      if (proc.exitCode === null && !proc.killed) proc.kill('SIGTERM');
      await exit;
    },
  };

  if (options.expectUrl === false) return exit.then(() => launched);

  return new Promise((resolve, reject) => {
    const check = (): void => {
      const match = /^resk: (http:\/\/\S+)$/m.exec(err);
      if (match) {
        launched.url = match[1]!;
        resolve(launched);
      }
    };
    proc.stderr!.on('data', check);
    exit.then((code) =>
      reject(new Error(`resk exited with ${code} before printing a URL\n${err}`)),
    );
    check();
  });
}

export const DEFAULT_ARGS = ['--summary', 'summary.md', '--diff', 'sample.patch', '--keep-alive'];
