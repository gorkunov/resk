import type { Comment, CommentTarget } from './types.js';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isPositiveInt(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1;
}

function validateTarget(value: unknown): CommentTarget | undefined {
  if (!isRecord(value)) return undefined;
  switch (value.kind) {
    case 'summary':
      return { kind: 'summary' };
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
    if (c.target.kind === 'summary') summary++;
    else files.add(c.target.path);
  }
  return { total: comments.length, files: files.size, summary };
}

export function commentsForPath(comments: Comment[], path: string): Comment[] {
  return comments.filter((c) => c.target.kind !== 'summary' && c.target.path === path);
}
