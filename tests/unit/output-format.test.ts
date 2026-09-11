import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseUnifiedDiff } from '../../src/shared/diff-parser.js';
import {
  formatReviewMarkdown,
  formatReviewJson,
  orderComments,
} from '../../src/shared/output-format.js';
import type { Comment } from '../../src/shared/types.js';

const fixture = readFileSync(new URL('../fixtures/sample.patch', import.meta.url), 'utf8');
const files = parseUnifiedDiff(fixture);

let counter = 0;
function comment(target: Comment['target'], body: string): Comment {
  counter++;
  const ts = `2026-09-11T10:00:${String(counter).padStart(2, '0')}.000Z`;
  return { id: `c${counter}`, target, body, createdAt: ts, updatedAt: ts };
}

describe('formatReviewMarkdown', () => {
  it('prints a single line when there are no comments', () => {
    expect(formatReviewMarkdown([], files)).toBe('No review comments.\n');
  });

  it('groups comments by summary and file in diff order with excerpts', () => {
    const comments = [
      comment(
        { kind: 'lines', path: 'src/utils/clock.ts', side: 'new', start: 6, end: 6 },
        'Prefer 3600.',
      ),
      comment(
        { kind: 'lines', path: 'src/services/user.ts', side: 'new', start: 18, end: 19 },
        'Why is the timeout hardcoded?',
      ),
      comment(
        { kind: 'file', path: 'src/services/user.ts' },
        'Please add a unit test for the retry path.',
      ),
      comment({ kind: 'summary' }, 'Split this into two PRs;\nthe migration should ship first.'),
      comment(
        { kind: 'lines', path: 'src/services/user.ts', side: 'old', start: 10, end: 10 },
        'Was this used elsewhere?',
      ),
      comment(
        { kind: 'lines', path: 'src/services/user.ts', side: 'new', start: 1, end: 1 },
        'Import path changed.',
      ),
    ];
    expect(formatReviewMarkdown(comments, files)).toBe(
      [
        '# Review comments (6)',
        '',
        '## Summary',
        '- Split this into two PRs;',
        '  the migration should ship first.',
        '',
        '## src/services/user.ts',
        '- (file) Please add a unit test for the retry path.',
        '- L1 (new): Import path changed.',
        "  > +import { RefreshToken } from '../auth/refresh';",
        '- L10 (old): Was this used elsewhere?',
        '  > -  async refresh(token: Token): Promise<Session> {',
        '- L18-L19 (new): Why is the timeout hardcoded?',
        '  > +    const timeout = 3000;',
        '  > +    await refresh(token, timeout);',
        '',
        '## src/utils/clock.ts',
        '- L6 (new): Prefer 3600.',
        '  > +  return ts + hours * 3_600;',
        '',
      ].join('\n'),
    );
  });

  it('orders line comments with the same start line new before old', () => {
    const comments = [
      comment(
        { kind: 'lines', path: 'src/services/user.ts', side: 'old', start: 4, end: 4 },
        'old four',
      ),
      comment(
        { kind: 'lines', path: 'src/services/user.ts', side: 'new', start: 4, end: 7 },
        'new four',
      ),
    ];
    expect(orderComments(comments, files).map((c) => c.body)).toEqual(['new four', 'old four']);
  });

  it('skips excerpt lines that are not part of the diff and keeps the marker', () => {
    const comments = [
      comment(
        { kind: 'lines', path: 'src/services/user.ts', side: 'new', start: 22, end: 25 },
        'gap',
      ),
    ];
    expect(formatReviewMarkdown(comments, files)).toContain(
      ['- L22-L25 (new): gap', '  >  ', '  >    }', ''].join('\n'),
    );
  });

  it('lists files with comments even if the path is unknown to the diff', () => {
    const comments = [comment({ kind: 'file', path: 'ghost.ts' }, 'orphan')];
    expect(formatReviewMarkdown(comments, files)).toContain('## ghost.ts\n- (file) orphan\n');
  });
});

describe('formatReviewJson', () => {
  it('emits title, ordered comments and excerpts for line comments only', () => {
    const comments = [
      comment(
        { kind: 'lines', path: 'src/services/user.ts', side: 'new', start: 18, end: 19 },
        'timeout',
      ),
      comment({ kind: 'summary' }, 'overall'),
    ];
    const parsed = JSON.parse(formatReviewJson('feature vs main', comments, files));
    expect(parsed.title).toBe('feature vs main');
    expect(parsed.comments.map((c: { body: string }) => c.body)).toEqual(['overall', 'timeout']);
    expect(parsed.comments[0]).not.toHaveProperty('excerpt');
    expect(parsed.comments[1].excerpt).toEqual([
      '+    const timeout = 3000;',
      '+    await refresh(token, timeout);',
    ]);
    expect(parsed.comments[1]).toMatchObject({
      id: expect.any(String),
      target: { kind: 'lines', side: 'new' },
    });
  });

  it('emits an empty comments array when there are none', () => {
    expect(JSON.parse(formatReviewJson('t', [], files))).toEqual({ title: 't', comments: [] });
  });
});
