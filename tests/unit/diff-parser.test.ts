import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseUnifiedDiff, findLine, linesInRange } from '../../src/shared/diff-parser.js';

const fixture = readFileSync(new URL('../fixtures/sample.patch', import.meta.url), 'utf8');

describe('parseUnifiedDiff', () => {
  const files = parseUnifiedDiff(fixture);

  it('returns every file in diff order with display paths', () => {
    expect(files.map((f) => f.path)).toEqual([
      'README.md',
      'assets/logo.png',
      'src/auth/token.ts',
      'src/routes/auth.ts',
      'src/services/user.ts',
      'src/utils/clock.ts',
    ]);
  });

  it('detects status for modified, added, deleted and renamed files', () => {
    expect(files.map((f) => f.status)).toEqual([
      'modified',
      'added',
      'deleted',
      'added',
      'modified',
      'renamed',
    ]);
  });

  it('records the old path only for renames', () => {
    const renamed = files.find((f) => f.path === 'src/utils/clock.ts');
    expect(renamed?.oldPath).toBe('src/utils/time.ts');
    expect(files.filter((f) => f.path !== 'src/utils/clock.ts').every((f) => f.oldPath === undefined)).toBe(true);
  });

  it('marks binary files and gives them zero stats and no hunks', () => {
    const png = files.find((f) => f.path === 'assets/logo.png');
    expect(png).toMatchObject({ binary: true, additions: 0, deletions: 0, hunks: [] });
    expect(files.filter((f) => f.binary)).toHaveLength(1);
  });

  it('counts additions and deletions per file', () => {
    const stats = Object.fromEntries(files.map((f) => [f.path, [f.additions, f.deletions]]));
    expect(stats).toEqual({
      'README.md': [1, 1],
      'assets/logo.png': [0, 0],
      'src/auth/token.ts': [0, 12],
      'src/routes/auth.ts': [9, 0],
      'src/services/user.ts': [9, 3],
      'src/utils/clock.ts': [1, 1],
    });
  });

  it('parses hunk headers including the trailing function context', () => {
    const user = files.find((f) => f.path === 'src/services/user.ts')!;
    expect(user.hunks.map((h) => [h.oldStart, h.oldLines, h.newStart, h.newLines])).toEqual([
      [1, 17, 1, 22],
      [20, 6, 25, 7],
    ]);
    expect(user.hunks[1]!.header).toBe('@@ -20,6 +25,7 @@ export class UserService {');
  });

  it('numbers lines on both sides and strips the marker from the text', () => {
    const user = files.find((f) => f.path === 'src/services/user.ts')!;
    const lines = user.hunks[0]!.lines;
    expect(lines[0]).toEqual({ type: 'del', oldLine: 1, text: "import { Token } from '../auth/token';" });
    expect(lines[1]).toEqual({ type: 'add', newLine: 1, text: "import { RefreshToken } from '../auth/refresh';" });
    expect(lines[2]).toEqual({ type: 'context', oldLine: 2, newLine: 2, text: '' });
    expect(lines[20]).toEqual({ type: 'add', newLine: 18, text: '    const timeout = 3000;' });
    expect(lines[24]).toEqual({ type: 'context', oldLine: 17, newLine: 22, text: '' });
  });

  it('does not treat the "no newline" marker as a line', () => {
    const readme = files.find((f) => f.path === 'README.md')!;
    expect(readme.hunks[0]!.lines.map((l) => l.type)).toEqual(['context', 'context', 'del', 'add']);
    expect(readme.hunks[0]!.lines[2]!.text).toBe('A demo project.');
  });

  it('slices each file its own raw patch text', () => {
    expect(files[0]!.patch.startsWith('diff --git a/README.md b/README.md\n')).toBe(true);
    expect(files[0]!.patch.endsWith('+A demo project with server-side token refresh.\n')).toBe(true);
    expect(files[5]!.patch.startsWith('diff --git a/src/utils/time.ts b/src/utils/clock.ts\n')).toBe(true);
    expect(files.map((f) => f.patch).join('')).toBe(fixture);
  });

  it('returns an empty list for empty input', () => {
    expect(parseUnifiedDiff('')).toEqual([]);
    expect(parseUnifiedDiff('\n')).toEqual([]);
  });

  it('defaults hunk line counts to 1 when omitted', () => {
    const patch = ['diff --git a/x.txt b/x.txt', '--- a/x.txt', '+++ b/x.txt', '@@ -1 +1 @@', '-a', '+b', ''].join('\n');
    const [file] = parseUnifiedDiff(patch);
    expect(file!.hunks[0]).toMatchObject({ oldStart: 1, oldLines: 1, newStart: 1, newLines: 1 });
    expect(file!.hunks[0]!.lines).toEqual([
      { type: 'del', oldLine: 1, text: 'a' },
      { type: 'add', newLine: 1, text: 'b' },
    ]);
  });

  it('handles paths with spaces and quoted paths with escapes', () => {
    const patch = [
      'diff --git a/my file.txt b/my file.txt',
      'index 1..2 100644',
      '--- a/my file.txt',
      '+++ b/my file.txt',
      '@@ -1 +1 @@',
      '-a',
      '+b',
      'diff --git "a/tab\\there.txt" "b/tab\\there.txt"',
      'index 1..2 100644',
      '--- "a/tab\\there.txt"',
      '+++ "b/tab\\there.txt"',
      '@@ -1 +1 @@',
      '-a',
      '+b',
      '',
    ].join('\n');
    expect(parseUnifiedDiff(patch).map((f) => f.path)).toEqual(['my file.txt', 'tab\there.txt']);
  });

  it('treats a "GIT binary patch" section as binary and skips its payload', () => {
    const patch = [
      'diff --git a/img.png b/img.png',
      'new file mode 100644',
      'index 0000000..b437676',
      'GIT binary patch',
      'literal 20',
      'hcmV?d00001',
      '',
      'diff --git a/a.txt b/a.txt',
      '--- a/a.txt',
      '+++ b/a.txt',
      '@@ -1 +1 @@',
      '-a',
      '+b',
      '',
    ].join('\n');
    const files = parseUnifiedDiff(patch);
    expect(files.map((f) => [f.path, f.binary, f.status])).toEqual([
      ['img.png', true, 'added'],
      ['a.txt', false, 'modified'],
    ]);
  });

  it('reports a mode-only change as modified with no hunks', () => {
    const patch = ['diff --git a/run.sh b/run.sh', 'old mode 100644', 'new mode 100755', ''].join('\n');
    expect(parseUnifiedDiff(patch)[0]).toMatchObject({
      path: 'run.sh',
      status: 'modified',
      binary: false,
      hunks: [],
    });
  });
});

describe('findLine', () => {
  const files = parseUnifiedDiff(fixture);
  const user = files.find((f) => f.path === 'src/services/user.ts')!;

  it('finds a line by side and number across hunks', () => {
    expect(findLine(user, 'new', 28)?.text).toBe('    await this.db.sessions.revokeAll(id);');
    expect(findLine(user, 'old', 10)?.text).toBe('  async refresh(token: Token): Promise<Session> {');
  });

  it('returns undefined for lines outside every hunk', () => {
    expect(findLine(user, 'new', 23)).toBeUndefined();
    expect(findLine(user, 'old', 999)).toBeUndefined();
  });
});

describe('linesInRange', () => {
  const files = parseUnifiedDiff(fixture);
  const user = files.find((f) => f.path === 'src/services/user.ts')!;

  it('returns the lines that exist on that side within the inclusive range', () => {
    expect(linesInRange(user, 'new', 18, 20).map((l) => l.text)).toEqual([
      '    const timeout = 3000;',
      '    await refresh(token, timeout);',
      '    return session;',
    ]);
  });

  it('skips numbers that are not part of the diff', () => {
    expect(linesInRange(user, 'new', 22, 25).map((l) => l.newLine)).toEqual([22, 25]);
  });
});
