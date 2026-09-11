import { describe, expect, it } from 'vitest';
import { parseCliArgs, CliUsageError } from '../../src/cli/options.js';

describe('parseCliArgs', () => {
  it('applies defaults', () => {
    expect(parseCliArgs(['--summary', 's.md'])).toEqual({
      summary: 's.md',
      untracked: true,
      port: 4989,
      host: '127.0.0.1',
      open: true,
      keepAlive: false,
      json: false,
    });
  });

  it('reads target and compare-with positionals', () => {
    expect(parseCliArgs(['--summary', 's.md', '@', 'main'])).toMatchObject({
      target: '@',
      compareWith: 'main',
    });
    expect(parseCliArgs(['--summary', 's.md', '.'])).toMatchObject({ target: '.' });
  });

  it('parses every option', () => {
    expect(
      parseCliArgs([
        '--summary',
        's.md',
        '--diff',
        'x.patch',
        '--title',
        'My review',
        '--no-untracked',
        '--context',
        '5',
        '--port',
        '0',
        '--host',
        '0.0.0.0',
        '--no-open',
        '--keep-alive',
        '--json',
      ]),
    ).toEqual({
      summary: 's.md',
      diff: 'x.patch',
      title: 'My review',
      untracked: false,
      context: 5,
      port: 0,
      host: '0.0.0.0',
      open: false,
      keepAlive: true,
      json: true,
    });
  });

  it('requires --summary', () => {
    expect(() => parseCliArgs([])).toThrow(CliUsageError);
    expect(() => parseCliArgs(['.'])).toThrow(/--summary/);
  });

  it('reads the --session key', () => {
    expect(parseCliArgs(['--summary', 's.md', '--session', 'feat/refresh'])).toMatchObject({
      session: 'feat/refresh',
    });
    expect(parseCliArgs(['--summary', 's.md'])).not.toHaveProperty('session');
  });

  it('rejects a blank --session key', () => {
    expect(() => parseCliArgs(['--summary', 's.md', '--session', '  '])).toThrow(/--session/);
  });

  it('rejects positionals together with --diff', () => {
    expect(() => parseCliArgs(['--summary', 's.md', '--diff', 'x.patch', '.'])).toThrow(/--diff/);
  });

  it('rejects reading both summary and diff from stdin', () => {
    expect(() => parseCliArgs(['--summary', '-', '--diff', '-'])).toThrow(/stdin/);
  });

  it('rejects malformed numbers', () => {
    expect(() => parseCliArgs(['--summary', 's.md', '--port', 'abc'])).toThrow(/--port/);
    expect(() => parseCliArgs(['--summary', 's.md', '--context', '-1'])).toThrow(/--context/);
    expect(() => parseCliArgs(['--summary', 's.md', '--context', '1.5'])).toThrow(/--context/);
  });

  it('rejects more than two positionals and unknown options', () => {
    expect(() => parseCliArgs(['--summary', 's.md', 'a', 'b', 'c'])).toThrow(CliUsageError);
    expect(() => parseCliArgs(['--summary', 's.md', '--bogus'])).toThrow(CliUsageError);
  });
});
