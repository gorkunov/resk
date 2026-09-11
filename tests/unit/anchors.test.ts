import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseUnifiedDiff } from '../../src/shared/diff-parser.js';
import {
  parseAnchorUrl,
  isDiffUrl,
  resolveAnchor,
  rangeWarning,
  extractAnchorUrls,
  autoHighlightFile,
  describeAnchorProblem,
} from '../../src/shared/anchors.js';
import type { FileChange } from '../../src/shared/types.js';

const fixture = readFileSync(new URL('../fixtures/sample.patch', import.meta.url), 'utf8');
const files = parseUnifiedDiff(fixture);

function fakeFile(path: string, oldPath?: string): FileChange {
  const file: FileChange = {
    path,
    status: oldPath ? 'renamed' : 'modified',
    binary: false,
    additions: 0,
    deletions: 0,
    hunks: [],
    patch: '',
  };
  if (oldPath) file.oldPath = oldPath;
  return file;
}

describe('isDiffUrl', () => {
  it('recognises the diff: scheme only', () => {
    expect(isDiffUrl('diff:src/a.ts')).toBe(true);
    expect(isDiffUrl('https://example.com')).toBe(false);
    expect(isDiffUrl('difference.md')).toBe(false);
  });
});

describe('parseAnchorUrl', () => {
  it('parses a whole-file anchor', () => {
    expect(parseAnchorUrl('diff:src/services/user.ts')).toEqual({ path: 'src/services/user.ts' });
  });

  it('parses a single new-side line', () => {
    expect(parseAnchorUrl('diff:src/a.ts#L40')).toEqual({ path: 'src/a.ts', side: 'new', start: 40, end: 40 });
  });

  it('parses a new-side range', () => {
    expect(parseAnchorUrl('diff:src/a.ts#L40-L58')).toEqual({ path: 'src/a.ts', side: 'new', start: 40, end: 58 });
  });

  it('parses old-side anchors', () => {
    expect(parseAnchorUrl('diff:src/a.ts#old:L12')).toEqual({ path: 'src/a.ts', side: 'old', start: 12, end: 12 });
    expect(parseAnchorUrl('diff:src/a.ts#old:L12-L20')).toEqual({ path: 'src/a.ts', side: 'old', start: 12, end: 20 });
  });

  it('swaps a reversed range', () => {
    expect(parseAnchorUrl('diff:src/a.ts#L58-L40')).toEqual({ path: 'src/a.ts', side: 'new', start: 40, end: 58 });
  });

  it('URL-decodes the path', () => {
    expect(parseAnchorUrl('diff:docs/my%20file.md')).toEqual({ path: 'docs/my file.md' });
  });

  it('returns undefined for invalid fragments and non-diff URLs', () => {
    for (const url of ['diff:a.ts#L', 'diff:a.ts#foo', 'diff:a.ts#L1-', 'diff:a.ts#new:L1', 'diff:a.ts#L0', 'diff:', 'diff:#L1', 'https://x']) {
      expect(parseAnchorUrl(url), url).toBeUndefined();
    }
  });
});

describe('resolveAnchor', () => {
  it('resolves an exact display path', () => {
    const r = resolveAnchor('diff:src/services/user.ts#L18-L19', files);
    expect(r.status).toBe('ok');
    if (r.status === 'ok') {
      expect(r.file.path).toBe('src/services/user.ts');
      expect(r.anchor).toEqual({ path: 'src/services/user.ts', side: 'new', start: 18, end: 19 });
      expect(r.raw).toBe('diff:src/services/user.ts#L18-L19');
    }
  });

  it('resolves the old path of a renamed file', () => {
    const r = resolveAnchor('diff:src/utils/time.ts', files);
    expect(r.status === 'ok' && r.file.path).toBe('src/utils/clock.ts');
  });

  it('resolves a unique suffix', () => {
    const r = resolveAnchor('diff:user.ts', files);
    expect(r.status === 'ok' && r.file.path).toBe('src/services/user.ts');
    const nested = resolveAnchor('diff:routes/auth.ts', files);
    expect(nested.status === 'ok' && nested.file.path).toBe('src/routes/auth.ts');
  });

  it('does not match a suffix that is not on a path boundary', () => {
    expect(resolveAnchor('diff:ervices/user.ts', files).status).toBe('unresolved');
  });

  it('reports ambiguous suffixes with the candidates', () => {
    const many = [fakeFile('a/index.ts'), fakeFile('b/index.ts'), fakeFile('c/other.ts')];
    const r = resolveAnchor('diff:index.ts', many);
    expect(r).toEqual({ status: 'ambiguous', raw: 'diff:index.ts', candidates: ['a/index.ts', 'b/index.ts'] });
  });

  it('reports unresolved and invalid anchors', () => {
    expect(resolveAnchor('diff:nope.ts', files)).toEqual({ status: 'unresolved', raw: 'diff:nope.ts' });
    expect(resolveAnchor('diff:src/services/user.ts#bad', files)).toEqual({
      status: 'invalid',
      raw: 'diff:src/services/user.ts#bad',
    });
  });
});

describe('rangeWarning', () => {
  it('is undefined for whole-file anchors and ranges that start inside a hunk', () => {
    expect(rangeWarning(resolveAnchor('diff:src/services/user.ts', files))).toBeUndefined();
    expect(rangeWarning(resolveAnchor('diff:src/services/user.ts#L18', files))).toBeUndefined();
    expect(rangeWarning(resolveAnchor('diff:src/services/user.ts#old:L10-L14', files))).toBeUndefined();
    expect(rangeWarning(resolveAnchor('diff:src/services/user.ts#L22-L25', files))).toBeUndefined();
  });

  it('warns when the start line is not part of the diff on that side', () => {
    expect(rangeWarning(resolveAnchor('diff:src/services/user.ts#L23', files))).toMatch(/L23.*not (in|part of) the diff/);
    expect(rangeWarning(resolveAnchor('diff:src/routes/auth.ts#old:L1', files))).toMatch(/old/);
    expect(rangeWarning(resolveAnchor('diff:assets/logo.png#L1', files))).toMatch(/binary/i);
  });

  it('is undefined for anchors that did not resolve', () => {
    expect(rangeWarning(resolveAnchor('diff:nope.ts#L1', files))).toBeUndefined();
  });
});

describe('describeAnchorProblem', () => {
  it('explains each failure status', () => {
    expect(describeAnchorProblem(resolveAnchor('diff:nope.ts', files))).toBe('does not match any changed file');
    expect(describeAnchorProblem(resolveAnchor('diff:a.ts#zzz', files))).toBe('is not a valid diff: anchor');
    const many = [fakeFile('a/index.ts'), fakeFile('b/index.ts')];
    expect(describeAnchorProblem(resolveAnchor('diff:index.ts', many))).toBe('is ambiguous: a/index.ts, b/index.ts');
    expect(describeAnchorProblem(resolveAnchor('diff:src/services/user.ts', files))).toBeUndefined();
  });
});

describe('extractAnchorUrls', () => {
  it('returns diff: link URLs in document order, ignoring other links and code', () => {
    const md = [
      '## Critical',
      'Moved into [UserService](diff:src/services/user.ts#L40-L58) and [docs](https://example.com).',
      '',
      '- see [token](diff:src/auth/token.ts#old:L12-L20)',
      '- not this `[x](diff:inline/code.ts)` nor',
      '',
      '```',
      '[y](diff:fenced/code.ts)',
      '```',
      '',
      'Autolink <diff:src/routes/auth.ts> and again [UserService](diff:src/services/user.ts#L40-L58).',
    ].join('\n');
    expect(extractAnchorUrls(md)).toEqual([
      'diff:src/services/user.ts#L40-L58',
      'diff:src/auth/token.ts#old:L12-L20',
      'diff:src/routes/auth.ts',
      'diff:src/services/user.ts#L40-L58',
    ]);
  });

  it('returns an empty list when there are no anchors', () => {
    expect(extractAnchorUrls('# Nothing here\n\nPlain text.')).toEqual([]);
  });
});

describe('autoHighlightFile', () => {
  it('matches a code span that equals a display path or a rename source', () => {
    expect(autoHighlightFile('src/routes/auth.ts', files)?.path).toBe('src/routes/auth.ts');
    expect(autoHighlightFile('src/utils/time.ts', files)?.path).toBe('src/utils/clock.ts');
  });

  it('does not use suffix matching', () => {
    expect(autoHighlightFile('user.ts', files)).toBeUndefined();
    expect(autoHighlightFile('nope.ts', files)).toBeUndefined();
  });
});
