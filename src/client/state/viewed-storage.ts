import type { ReviewPayload } from '../../shared/types.js';
import type { Viewed } from './reducer.js';

function hash(text: string): string {
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

/** Storage key that identifies this review by its title, session round, and changed files. */
export function viewedStorageKey(review: ReviewPayload): string {
  const round = review.session ? `round ${review.session.round}` : '';
  const parts = [review.title, round, ...review.files.map((f) => f.path)];
  return `resk.viewed:${hash(parts.join('\n'))}`;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === 'string');
}

export function loadViewed(review: ReviewPayload): Viewed | undefined {
  try {
    const raw = localStorage.getItem(viewedStorageKey(review));
    if (!raw) return undefined;
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      isStringArray((parsed as { paths?: unknown }).paths) &&
      isStringArray((parsed as { anchors?: unknown }).anchors)
    ) {
      return parsed as Viewed;
    }
  } catch {
    // storage unavailable or corrupt
  }
  return undefined;
}

export function saveViewed(review: ReviewPayload, viewed: Viewed): void {
  try {
    localStorage.setItem(viewedStorageKey(review), JSON.stringify(viewed));
  } catch {
    // storage unavailable
  }
}
