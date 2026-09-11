import type { Comment, DiffLine, FileChange } from './types.js';
import { linesInRange } from './diff-parser.js';

const MARKERS: Record<DiffLine['type'], string> = { add: '+', del: '-', context: ' ' };

function byCreated(a: Comment, b: Comment): number {
  return a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id);
}

function lineKey(c: Comment): [number, number, number] {
  if (c.target.kind !== 'lines') return [0, 0, 0];
  return [c.target.start, c.target.side === 'new' ? 0 : 1, c.target.end];
}

/** Summary comments first, then files in diff order (unknown paths last, alphabetically). */
export function orderComments(comments: Comment[], files: FileChange[]): Comment[] {
  const summary = comments.filter((c) => c.target.kind === 'summary').sort(byCreated);
  const selections = comments
    .filter((c) => c.target.kind === 'summary-selection')
    .sort((a, b) => {
      const ta = a.target as { start: number; end: number };
      const tb = b.target as { start: number; end: number };
      return ta.start - tb.start || ta.end - tb.end || byCreated(a, b);
    });
  const paths = new Set<string>();
  for (const c of comments) {
    if (c.target.kind === 'file' || c.target.kind === 'lines') paths.add(c.target.path);
  }
  const known = files.map((f) => f.path).filter((p) => paths.has(p));
  const unknown = [...paths].filter((p) => !known.includes(p)).sort();

  const ordered: Comment[] = [...summary, ...selections];
  for (const path of [...known, ...unknown]) {
    const fileComments = comments
      .filter((c) => c.target.kind === 'file' && c.target.path === path)
      .sort(byCreated);
    const lineComments = comments
      .filter((c) => c.target.kind === 'lines' && c.target.path === path)
      .sort((a, b) => {
        const [as, aside, ae] = lineKey(a);
        const [bs, bside, be] = lineKey(b);
        return as - bs || aside - bside || ae - be || byCreated(a, b);
      });
    ordered.push(...fileComments, ...lineComments);
  }
  return ordered;
}

/** Diff lines covered by a line comment, with their +/-/space marker. Undefined for other targets. */
export function excerptFor(comment: Comment, files: FileChange[]): string[] | undefined {
  if (comment.target.kind !== 'lines') return undefined;
  const { path, side, start, end } = comment.target;
  const file = files.find((f) => f.path === path);
  if (!file) return [];
  return linesInRange(file, side, start, end).map((l) => MARKERS[l.type] + l.text);
}

function lineLabel(c: Comment): string {
  if (c.target.kind !== 'lines') return '';
  const { start, end, side } = c.target;
  const range = start === end ? `L${start}` : `L${start}-L${end}`;
  return `${range} (${side})`;
}

function bullet(prefix: string, body: string): string[] {
  const [first = '', ...rest] = body.split('\n');
  return [`- ${prefix}${first}`, ...rest.map((l) => `  ${l}`)];
}

export function formatReviewMarkdown(comments: Comment[], files: FileChange[]): string {
  if (comments.length === 0) return 'No review comments.\n';
  const ordered = orderComments(comments, files);
  const lines: string[] = [`# Review comments (${ordered.length})`];

  let section: string | undefined;
  for (const c of ordered) {
    const heading =
      c.target.kind === 'summary' || c.target.kind === 'summary-selection'
        ? 'Summary'
        : c.target.path;
    if (heading !== section) {
      section = heading;
      lines.push('', `## ${heading}`);
    }
    if (c.target.kind === 'summary') {
      lines.push(...bullet('', c.body));
    } else if (c.target.kind === 'summary-selection') {
      const quote = c.target.quote.replace(/\s*\n\s*/g, ' ').trim();
      lines.push(...bullet(`On "${quote}": `, c.body));
    } else if (c.target.kind === 'file') {
      lines.push(...bullet('(file) ', c.body));
    } else {
      lines.push(...bullet(`${lineLabel(c)}: `, c.body));
      for (const excerpt of excerptFor(c, files) ?? []) lines.push(`  > ${excerpt}`);
    }
  }
  return lines.join('\n') + '\n';
}

export function formatReviewJson(title: string, comments: Comment[], files: FileChange[]): string {
  const ordered = orderComments(comments, files).map((c) => {
    const excerpt = excerptFor(c, files);
    return excerpt === undefined ? c : { ...c, excerpt };
  });
  return JSON.stringify({ title, comments: ordered }, null, 2) + '\n';
}
