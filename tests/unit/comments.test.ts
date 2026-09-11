import { describe, expect, it } from 'vitest';
import { validateComments, countComments, commentsForPath } from '../../src/shared/comments.js';
import type { Comment } from '../../src/shared/types.js';

const base = {
  id: 'c1',
  body: 'hi',
  createdAt: '2026-09-11T10:00:00.000Z',
  updatedAt: '2026-09-11T10:00:00.000Z',
};

describe('validateComments', () => {
  it('accepts every target kind', () => {
    const list = [
      { ...base, target: { kind: 'summary' } },
      {
        ...base,
        id: 'c0',
        target: { kind: 'summary-selection', quote: 'Token refresh', start: 0, end: 13 },
      },
      { ...base, id: 'c2', target: { kind: 'file', path: 'a.ts' } },
      { ...base, id: 'c3', target: { kind: 'lines', path: 'a.ts', side: 'new', start: 1, end: 3 } },
    ];
    expect(validateComments(list)).toEqual(list);
  });

  it('rejects non-arrays, missing fields, bad kinds, bad sides and non-positive lines', () => {
    expect(validateComments(null)).toBeUndefined();
    expect(validateComments({})).toBeUndefined();
    expect(validateComments([{ ...base }])).toBeUndefined();
    expect(validateComments([{ ...base, target: { kind: 'nope' } }])).toBeUndefined();
    expect(validateComments([{ ...base, target: { kind: 'file' } }])).toBeUndefined();
    expect(
      validateComments([
        { ...base, target: { kind: 'lines', path: 'a', side: 'left', start: 1, end: 1 } },
      ]),
    ).toBeUndefined();
    expect(
      validateComments([
        { ...base, target: { kind: 'lines', path: 'a', side: 'new', start: 0, end: 1 } },
      ]),
    ).toBeUndefined();
    expect(
      validateComments([
        { ...base, target: { kind: 'lines', path: 'a', side: 'new', start: 3, end: 1 } },
      ]),
    ).toBeUndefined();
    expect(validateComments([{ ...base, body: 7, target: { kind: 'summary' } }])).toBeUndefined();
  });

  it('rejects malformed summary selections', () => {
    const bad = [
      { kind: 'summary-selection', quote: 'x', start: 5, end: 5 },
      { kind: 'summary-selection', quote: 'x', start: -1, end: 3 },
      { kind: 'summary-selection', quote: 7, start: 0, end: 3 },
      { kind: 'summary-selection', start: 0, end: 3 },
    ];
    for (const target of bad) {
      expect(validateComments([{ ...base, target }]), JSON.stringify(target)).toBeUndefined();
    }
    expect(
      validateComments([
        { ...base, target: { kind: 'summary-selection', quote: 'x', start: 0, end: 1 } },
      ]),
    ).toHaveLength(1);
  });

  it('strips unknown properties', () => {
    const list = [{ ...base, extra: true, target: { kind: 'summary', junk: 1 } }];
    expect(validateComments(list)).toEqual([{ ...base, target: { kind: 'summary' } }]);
  });
});

describe('countComments', () => {
  it('counts totals, distinct files and summary comments', () => {
    const list: Comment[] = [
      { ...base, target: { kind: 'summary' } },
      { ...base, id: 'c0', target: { kind: 'summary-selection', quote: 'q', start: 0, end: 1 } },
      { ...base, id: 'c2', target: { kind: 'file', path: 'a.ts' } },
      { ...base, id: 'c3', target: { kind: 'lines', path: 'a.ts', side: 'new', start: 1, end: 3 } },
      { ...base, id: 'c4', target: { kind: 'lines', path: 'b.ts', side: 'old', start: 1, end: 1 } },
    ];
    expect(countComments(list)).toEqual({ total: 5, files: 2, summary: 2 });
    expect(countComments([])).toEqual({ total: 0, files: 0, summary: 0 });
  });
});

describe('commentsForPath', () => {
  it('returns file and line comments for one path', () => {
    const list: Comment[] = [
      { ...base, target: { kind: 'summary' } },
      { ...base, id: 'c2', target: { kind: 'file', path: 'a.ts' } },
      { ...base, id: 'c3', target: { kind: 'lines', path: 'b.ts', side: 'new', start: 1, end: 3 } },
    ];
    expect(commentsForPath(list, 'a.ts').map((c) => c.id)).toEqual(['c2']);
    expect(commentsForPath(list, 'b.ts').map((c) => c.id)).toEqual(['c3']);
    expect(commentsForPath(list, 'c.ts')).toEqual([]);
  });
});

describe('summarySelectionsAt', () => {
  it('returns selection comments whose range covers an offset', async () => {
    const { summarySelectionsAt } = await import('../../src/shared/comments.js');
    const list: Comment[] = [
      { ...base, id: 'a', target: { kind: 'summary-selection', quote: 'ab', start: 0, end: 2 } },
      { ...base, id: 'b', target: { kind: 'summary-selection', quote: 'bcd', start: 1, end: 4 } },
      { ...base, id: 'c', target: { kind: 'summary' } },
    ];
    expect(summarySelectionsAt(list, 0).map((c) => c.id)).toEqual(['a']);
    expect(summarySelectionsAt(list, 1).map((c) => c.id)).toEqual(['a', 'b']);
    expect(summarySelectionsAt(list, 3).map((c) => c.id)).toEqual(['b']);
    expect(summarySelectionsAt(list, 4)).toEqual([]);
  });
});
