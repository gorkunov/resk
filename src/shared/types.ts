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
  | { kind: 'file'; path: string }
  | { kind: 'lines'; path: string; side: Side; start: number; end: number };

export interface Comment {
  id: string;
  target: CommentTarget;
  body: string;
  createdAt: string;
  updatedAt: string;
}

export interface ReviewPayload {
  title: string;
  summary: string;
  files: FileChange[];
}
