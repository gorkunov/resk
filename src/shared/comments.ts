import type { Comment, CommentTarget } from './types.js';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isPositiveInt(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1;
}

function isNonNegativeInt(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

/** True for comments on the summary as a whole or on a selection in it. */
export function isSummaryTarget(target: CommentTarget): boolean {
  return target.kind === 'summary' || target.kind === 'summary-selection';
}

function validateTarget(value: unknown): CommentTarget | undefined {
  if (!isRecord(value)) return undefined;
  switch (value.kind) {
    case 'summary':
      return { kind: 'summary' };
    case 'summary-selection': {
      const { quote, start, end } = value;
      if (typeof quote !== 'string') return undefined;
      if (!isNonNegativeInt(start) || !isNonNegativeInt(end) || end <= start) return undefined;
      return { kind: 'summary-selection', quote, start, end };
    }
    case 'file':
      return typeof value.path === 'string' ? { kind: 'file', path: value.path } : undefined;
    case 'lines': {
      const { path, side, start, end } = value;
      if (typeof path !== 'string') return undefined;
      if (side !== 'old' && side !== 'new') return undefined;
      if (!isPositiveInt(start) || !isPositiveInt(end) || end < start) return undefined;
      return { kind: 'lines', path, side, start, end };
    }
    default:
      return undefined;
  }
}

function validateComment(value: unknown): Comment | undefined {
  if (!isRecord(value)) return undefined;
  const { id, body, createdAt, updatedAt } = value;
  if (typeof id !== 'string' || typeof body !== 'string') return undefined;
  if (typeof createdAt !== 'string' || typeof updatedAt !== 'string') return undefined;
  const target = validateTarget(value.target);
  if (!target) return undefined;
  return { id, target, body, createdAt, updatedAt };
}

/** Returns a clean copy of the comment list, or undefined if anything is malformed. */
export function validateComments(value: unknown): Comment[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const result: Comment[] = [];
  for (const item of value) {
    const comment = validateComment(item);
    if (!comment) return undefined;
    result.push(comment);
  }
  return result;
}

export function countComments(comments: Comment[]): {
  total: number;
  files: number;
  summary: number;
} {
  const files = new Set<string>();
  let summary = 0;
  for (const c of comments) {
    if (c.target.kind === 'summary' || c.target.kind === 'summary-selection') summary++;
    else files.add(c.target.path);
  }
  return { total: comments.length, files: files.size, summary };
}

export function commentsForPath(comments: Comment[], path: string): Comment[] {
  return comments.filter(
    (c) => (c.target.kind === 'file' || c.target.kind === 'lines') && c.target.path === path,
  );
}

/** Selection comments whose range covers the given offset in the rendered summary text. */
export function summarySelectionsAt(comments: Comment[], offset: number): Comment[] {
  return comments.filter(
    (c) =>
      c.target.kind === 'summary-selection' && c.target.start <= offset && offset < c.target.end,
  );
}
