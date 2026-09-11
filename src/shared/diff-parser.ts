import type { DiffLine, FileChange, FileStatus, Hunk, Side } from './types.js';

const HUNK_HEADER = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(.*)$/;

interface Draft {
  startIndex: number;
  headerLine?: string;
  minusPath?: string;
  plusPath?: string;
  renameFrom?: string;
  renameTo?: string;
  status?: FileStatus;
  binary: boolean;
  skipPayload: boolean;
  hunks: Hunk[];
  additions: number;
  deletions: number;
}

/**
 * Parses a unified diff (git or plain `diff -u`) into one FileChange per file.
 * Each FileChange carries its own raw patch text; joining all patches gives the input back.
 */
export function parseUnifiedDiff(text: string): FileChange[] {
  const lines = text.split('\n');
  let trailingNewline = false;
  if (lines[lines.length - 1] === '') {
    lines.pop();
    trailingNewline = true;
  }

  const files: FileChange[] = [];
  let draft: Draft | undefined;
  let hunk: Hunk | undefined;
  let oldRemaining = 0;
  let newRemaining = 0;
  let oldLine = 0;
  let newLine = 0;

  const sliceText = (start: number, end: number): string =>
    lines.slice(start, end).join('\n') + (end < lines.length || trailingNewline ? '\n' : '');

  const finish = (endIndex: number): void => {
    if (!draft) return;
    files.push(buildFile(draft, sliceText(draft.startIndex, endIndex)));
    draft = undefined;
    hunk = undefined;
    oldRemaining = 0;
    newRemaining = 0;
  };

  const startFile = (index: number, headerLine?: string): void => {
    finish(index);
    draft = {
      startIndex: index,
      binary: false,
      skipPayload: false,
      hunks: [],
      additions: 0,
      deletions: 0,
    };
    if (headerLine !== undefined) draft.headerLine = headerLine;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;

    if (line.startsWith('diff --git ')) {
      startFile(i, line);
      continue;
    }

    if (draft?.skipPayload) continue;

    if (hunk && (oldRemaining > 0 || newRemaining > 0)) {
      if (line.startsWith('\\')) continue; // "\ No newline at end of file"
      const marker = line[0];
      const body = line.slice(1);
      if (marker === '+') {
        hunk.lines.push({ type: 'add', newLine: newLine++, text: body });
        newRemaining--;
        draft!.additions++;
      } else if (marker === '-') {
        hunk.lines.push({ type: 'del', oldLine: oldLine++, text: body });
        oldRemaining--;
        draft!.deletions++;
      } else {
        const textBody = marker === ' ' ? body : line;
        hunk.lines.push({ type: 'context', oldLine: oldLine++, newLine: newLine++, text: textBody });
        oldRemaining--;
        newRemaining--;
      }
      continue;
    }

    if (line.startsWith('\\')) continue;

    const hunkMatch = HUNK_HEADER.exec(line);
    if (hunkMatch && draft) {
      const oldStart = Number(hunkMatch[1]);
      const oldLines = hunkMatch[2] === undefined ? 1 : Number(hunkMatch[2]);
      const newStart = Number(hunkMatch[3]);
      const newLines = hunkMatch[4] === undefined ? 1 : Number(hunkMatch[4]);
      hunk = { oldStart, oldLines, newStart, newLines, header: line, lines: [] };
      draft.hunks.push(hunk);
      oldRemaining = oldLines;
      newRemaining = newLines;
      oldLine = oldStart;
      newLine = newStart;
      continue;
    }

    if (line.startsWith('--- ') && lines[i + 1]?.startsWith('+++ ')) {
      if (!draft || draft.minusPath !== undefined || draft.hunks.length > 0) {
        startFile(i);
      }
      draft!.minusPath = parseFileHeaderPath(line.slice(4));
      draft!.plusPath = parseFileHeaderPath(lines[i + 1]!.slice(4));
      i++;
      continue;
    }

    if (!draft) continue;

    if (line.startsWith('new file mode') || line.startsWith('new file')) {
      draft.status = 'added';
    } else if (line.startsWith('deleted file mode') || line.startsWith('deleted file')) {
      draft.status = 'deleted';
    } else if (line.startsWith('rename from ')) {
      draft.renameFrom = unquotePath(line.slice('rename from '.length));
      draft.status = 'renamed';
    } else if (line.startsWith('rename to ')) {
      draft.renameTo = unquotePath(line.slice('rename to '.length));
      draft.status = 'renamed';
    } else if (line.startsWith('copy to ')) {
      draft.renameTo = unquotePath(line.slice('copy to '.length));
      draft.status = 'added';
    } else if (line.startsWith('Binary files ') && line.endsWith(' differ')) {
      draft.binary = true;
    } else if (line === 'GIT binary patch') {
      draft.binary = true;
      draft.skipPayload = true;
    }
  }

  finish(lines.length);
  return files;
}

function buildFile(draft: Draft, patch: string): FileChange {
  const gitPaths = draft.headerLine ? parseDiffGitLine(draft.headerLine) : undefined;
  const minus = normalizeHeaderPath(draft.minusPath);
  const plus = normalizeHeaderPath(draft.plusPath);

  let status: FileStatus = draft.status ?? 'modified';
  if (status === 'modified') {
    if (minus === null && plus !== null && draft.minusPath !== undefined) status = 'added';
    if (plus === null && minus !== null && draft.plusPath !== undefined) status = 'deleted';
  }

  let path: string;
  let oldPath: string | undefined;
  if (status === 'renamed' && draft.renameTo !== undefined) {
    path = draft.renameTo;
    oldPath = draft.renameFrom ?? gitPaths?.old;
  } else if (status === 'deleted') {
    path = minus ?? gitPaths?.old ?? plus ?? '';
  } else {
    path = plus ?? draft.renameTo ?? gitPaths?.new ?? minus ?? '';
  }

  const file: FileChange = {
    path,
    status,
    binary: draft.binary,
    additions: draft.additions,
    deletions: draft.deletions,
    hunks: draft.hunks,
    patch,
  };
  if (oldPath !== undefined) file.oldPath = oldPath;
  return file;
}

/** Path from a `---`/`+++` header value: strips a/ b/ prefixes, handles quoting and tab-separated timestamps. */
function parseFileHeaderPath(value: string): string {
  if (value.startsWith('"')) return unquotePath(value);
  const tab = value.indexOf('\t');
  return tab === -1 ? value : value.slice(0, tab);
}

/** Returns null for /dev/null, undefined when the header was absent. */
function normalizeHeaderPath(value: string | undefined): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === '/dev/null') return null;
  return stripPrefix(value);
}

function stripPrefix(path: string): string {
  return path.startsWith('a/') || path.startsWith('b/') ? path.slice(2) : path;
}

function parseDiffGitLine(line: string): { old: string; new: string } | undefined {
  const rest = line.slice('diff --git '.length);
  if (rest.startsWith('"')) {
    const first = readQuoted(rest);
    if (!first) return undefined;
    const second = rest.slice(first.length).trim();
    return { old: stripPrefix(unquotePath(first)), new: stripPrefix(unquotePath(second)) };
  }
  for (let i = rest.indexOf(' '); i !== -1; i = rest.indexOf(' ', i + 1)) {
    const left = rest.slice(0, i);
    const right = rest.slice(i + 1);
    if (left.startsWith('a/') && right.startsWith('b/') && left.slice(2) === right.slice(2)) {
      return { old: left.slice(2), new: right.slice(2) };
    }
  }
  const split = rest.lastIndexOf(' b/');
  if (split !== -1) {
    return { old: stripPrefix(rest.slice(0, split)), new: rest.slice(split + 3) };
  }
  return undefined;
}

function readQuoted(value: string): string | undefined {
  if (!value.startsWith('"')) return undefined;
  for (let i = 1; i < value.length; i++) {
    if (value[i] === '\\') {
      i++;
    } else if (value[i] === '"') {
      return value.slice(0, i + 1);
    }
  }
  return undefined;
}

const SIMPLE_ESCAPES: Record<string, number> = {
  a: 0x07,
  b: 0x08,
  f: 0x0c,
  n: 0x0a,
  r: 0x0d,
  t: 0x09,
  v: 0x0b,
  '\\': 0x5c,
  '"': 0x22,
};

/** Decodes a git-quoted path ("..." with C escapes and octal bytes). Unquoted input is returned as is. */
export function unquotePath(value: string): string {
  if (!value.startsWith('"') || !value.endsWith('"') || value.length < 2) return value;
  const inner = value.slice(1, -1);
  const bytes: number[] = [];
  const encoder = new TextEncoder();
  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i]!;
    if (ch !== '\\') {
      bytes.push(...encoder.encode(ch));
      continue;
    }
    const next = inner[i + 1];
    if (next === undefined) break;
    if (/[0-7]/.test(next)) {
      const octal = /^[0-7]{1,3}/.exec(inner.slice(i + 1))![0];
      bytes.push(parseInt(octal, 8));
      i += octal.length;
    } else {
      bytes.push(SIMPLE_ESCAPES[next] ?? next.charCodeAt(0));
      i++;
    }
  }
  return new TextDecoder().decode(new Uint8Array(bytes));
}

export function findLine(file: FileChange, side: Side, lineNumber: number): DiffLine | undefined {
  for (const hunk of file.hunks) {
    for (const line of hunk.lines) {
      if (side === 'new' ? line.newLine === lineNumber : line.oldLine === lineNumber) return line;
    }
  }
  return undefined;
}

export function linesInRange(file: FileChange, side: Side, start: number, end: number): DiffLine[] {
  const result: DiffLine[] = [];
  for (const hunk of file.hunks) {
    for (const line of hunk.lines) {
      const n = side === 'new' ? line.newLine : line.oldLine;
      if (n !== undefined && n >= start && n <= end) result.push(line);
    }
  }
  return result;
}
