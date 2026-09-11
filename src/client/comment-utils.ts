import type { Comment, CommentTarget } from '../shared/types.js';

export function targetLabel(target: CommentTarget): string {
  switch (target.kind) {
    case 'summary':
      return 'summary';
    case 'file':
      return 'file';
    case 'lines':
      return `${target.side}:${target.start}-${target.end}`;
  }
}

export function newComment(target: CommentTarget, body: string): Comment {
  const now = new Date().toISOString();
  return { id: newId(), target, body, createdAt: now, updatedAt: now };
}

function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `c-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function relativeTime(iso: string, now = Date.now()): string {
  const seconds = Math.round((now - new Date(iso).getTime()) / 1000);
  if (seconds < 45) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return new Date(iso).toLocaleString();
}
