export type Side = 'old' | 'new';

export interface DiffLine {
  type: 'context' | 'add' | 'del';
  oldLine?: number;
  newLine?: number;
  text: string;
}

export interface Hunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  header: string;
  lines: DiffLine[];
}

export type FileStatus = 'added' | 'deleted' | 'modified' | 'renamed';

export interface FileChange {
  /** Display path: the new path, or the old path for deleted files. */
  path: string;
  /** Set only for renames. */
  oldPath?: string;
  status: FileStatus;
  binary: boolean;
  additions: number;
  deletions: number;
  hunks: Hunk[];
  /** This file's raw patch text, fed to the diff renderer. */
  patch: string;
}

export interface Anchor {
  path: string;
  side?: Side;
  start?: number;
  end?: number;
}

export type ResolvedAnchor =
  | { status: 'ok'; anchor: Anchor; file: FileChange; raw: string }
  | { status: 'unresolved' | 'ambiguous' | 'invalid'; raw: string; candidates?: string[] };

export type CommentTarget =
  | { kind: 'summary' }
  /** A comment on a text selection in the summary; offsets index the rendered summary text. */
  | { kind: 'summary-selection'; quote: string; start: number; end: number }
  | { kind: 'file'; path: string }
  | { kind: 'lines'; path: string; side: Side; start: number; end: number };

export interface Comment {
  id: string;
  target: CommentTarget;
  body: string;
  createdAt: string;
  updatedAt: string;
}

/** A finished round of a review session, as shown to the reviewer. */
export interface SessionRound {
  number: number;
  summary: string;
  finishedAt: string;
  commentCount: number;
}

export interface SessionInfo {
  key: string;
  /** 1-based number of the round being reviewed now; earlier rounds are in `previous`. */
  round: number;
  /** When this run started; shown as the current round's date and stable across reloads. */
  startedAt: string;
  previous: SessionRound[];
}

export interface ReviewPayload {
  title: string;
  /** The current round's Markdown: the whole summary in round 1, an update afterwards. */
  summary: string;
  files: FileChange[];
  session?: SessionInfo;
  /** True when the server can serve full file contents, so unmodified context can be expanded. */
  expandable: boolean;
}

/** Both versions of a changed file, as far as they exist. */
export interface FileContents {
  path: string;
  old: string | null;
  new: string | null;
}
