import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { parseCliArgs, CliInfoRequest } from '../../src/cli/options.js';

const pkg = createRequire(import.meta.url)('../../package.json') as { version: string };

function infoText(argv: string[]): string {
  try {
    parseCliArgs(argv);
  } catch (error) {
    if (error instanceof CliInfoRequest) return error.text;
    throw error;
  }
  throw new Error('expected CliInfoRequest');
}

describe('informational flags', () => {
  it('--help carries the usage text', () => {
    expect(() => parseCliArgs(['--help'])).toThrow(CliInfoRequest);
    const text = infoText(['--help']);
    expect(text).toMatch(/Usage: resk/);
    expect(text).toContain('--summary <path>');
  });

  it('--version reports the package version', () => {
    expect(infoText(['--version']).trim()).toBe(pkg.version);
  });
});
