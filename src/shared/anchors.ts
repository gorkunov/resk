import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import { visit } from 'unist-util-visit';
import type { Anchor, FileChange, ResolvedAnchor } from './types.js';
import { findLine } from './diff-parser.js';

export const DIFF_SCHEME = 'diff:';

const FRAGMENT = /^(?:(old):)?L(\d+)(?:-L(\d+))?$/;

export function isDiffUrl(url: string): boolean {
  return url.startsWith(DIFF_SCHEME);
}

/** Parses `diff:<path>[#L<n>[-L<m>]]` and `diff:<path>#old:L<n>[-L<m>]`. Returns undefined when invalid. */
export function parseAnchorUrl(url: string): Anchor | undefined {
  if (!isDiffUrl(url)) return undefined;
  const rest = url.slice(DIFF_SCHEME.length);
  const hashAt = rest.indexOf('#');
  const rawPath = hashAt === -1 ? rest : rest.slice(0, hashAt);
  if (rawPath === '') return undefined;

  let path: string;
  try {
    path = decodeURIComponent(rawPath);
  } catch {
    return undefined;
  }
  if (hashAt === -1) return { path };

  const match = FRAGMENT.exec(rest.slice(hashAt + 1));
  if (!match) return undefined;
  let start = Number(match[2]);
  let end = match[3] === undefined ? start : Number(match[3]);
  if (start < 1 || end < 1) return undefined;
  if (end < start) [start, end] = [end, start];
  return { path, side: match[1] === 'old' ? 'old' : 'new', start, end };
}

type PathMatch = { file: FileChange } | { candidates: string[] } | undefined;

function matchPath(path: string, files: FileChange[]): PathMatch {
  const exact = files.find((f) => f.path === path);
  if (exact) return { file: exact };
  const renamed = files.find((f) => f.oldPath === path);
  if (renamed) return { file: renamed };
  const suffix = '/' + path;
  const candidates = files.filter((f) => f.path.endsWith(suffix));
  if (candidates.length === 1) return { file: candidates[0]! };
  if (candidates.length > 1) return { candidates: candidates.map((f) => f.path) };
  return undefined;
}

export function resolveAnchor(raw: string, files: FileChange[]): ResolvedAnchor {
  const anchor = parseAnchorUrl(raw);
  if (!anchor) return { status: 'invalid', raw };
  const match = matchPath(anchor.path, files);
  if (!match) return { status: 'unresolved', raw };
  if ('candidates' in match) return { status: 'ambiguous', raw, candidates: match.candidates };
  return { status: 'ok', anchor, file: match.file, raw };
}

/** A warning when a resolved anchor's range cannot be shown, or undefined. */
export function rangeWarning(resolved: ResolvedAnchor): string | undefined {
  if (resolved.status !== 'ok') return undefined;
  const { anchor, file, raw } = resolved;
  if (anchor.side === undefined || anchor.start === undefined) return undefined;
  if (file.binary) return `anchor "${raw}" points into a binary file`;
  if (!findLine(file, anchor.side, anchor.start)) {
    return `anchor "${raw}": line L${anchor.start} (${anchor.side} side) is not part of the diff`;
  }
  return undefined;
}

/** Human-readable reason an anchor could not be used, or undefined when it resolved. */
export function describeAnchorProblem(resolved: ResolvedAnchor): string | undefined {
  switch (resolved.status) {
    case 'ok':
      return undefined;
    case 'unresolved':
      return 'does not match any changed file';
    case 'invalid':
      return 'is not a valid diff: anchor';
    case 'ambiguous':
      return `is ambiguous: ${(resolved.candidates ?? []).join(', ')}`;
  }
}

/** All `diff:` link URLs in a Markdown document, in document order (code is ignored). */
export function extractAnchorUrls(markdown: string): string[] {
  const tree = unified().use(remarkParse).use(remarkGfm).parse(markdown);
  const urls: string[] = [];
  visit(tree, 'link', (node) => {
    if (isDiffUrl(node.url)) urls.push(node.url);
  });
  return urls;
}

/** The file a bare code span refers to, using exact display-path or rename-source matching only. */
export function autoHighlightFile(text: string, files: FileChange[]): FileChange | undefined {
  return files.find((f) => f.path === text) ?? files.find((f) => f.oldPath === text);
}
