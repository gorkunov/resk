import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { PatchDiff, type DiffLineAnnotation, type SelectedLineRange } from '@pierre/diffs/react';
import type { Comment, FileChange, Side } from '../../shared/types.js';
import { commentsForPath } from '../../shared/comments.js';
import { newComment, targetLabel } from '../comment-utils.js';
import { useStore } from '../state/store.jsx';
import type { Focus, PanelState, Range } from '../state/reducer.js';
import { StatusBadge, Stats } from './ChangedFiles.jsx';
import { CommentCard } from './CommentCard.jsx';
import { CommentComposer } from './CommentComposer.jsx';

const THEMES = { light: 'github-light', dark: 'github-dark' } as const;

type AnnotationSide = 'additions' | 'deletions';

type Annotation = { kind: 'comments'; comments: Comment[] } | { kind: 'composer'; range: Range };

function toSelectionSide(side: Side): AnnotationSide {
  return side === 'new' ? 'additions' : 'deletions';
}

function fromSelectionSide(side: AnnotationSide | undefined): Side {
  return side === 'deletions' ? 'old' : 'new';
}

export function focusLabel(focus: Focus | undefined): string | undefined {
  return focus ? `${focus.side}:${focus.start}-${focus.end}` : undefined;
}

function toSelectedLines(range: Range | undefined): SelectedLineRange | null {
  if (!range) return null;
  const side = toSelectionSide(range.side);
  return { start: range.start, end: range.end, side, endSide: side };
}

interface DiffPanelProps {
  file: FileChange;
  panel: PanelState;
}

export function DiffPanel({ file, panel }: DiffPanelProps) {
  const { state, dispatch } = useStore();
  const [draft, setDraft] = useState<Range | undefined>(undefined);
  const [fileComposerOpen, setFileComposerOpen] = useState(false);

  const comments = commentsForPath(state.comments, file.path);
  const fileComments = comments.filter((c) => c.target.kind === 'file');

  const lineAnnotations = useMemo<DiffLineAnnotation<Annotation>[]>(() => {
    const groups = new Map<
      string,
      { side: AnnotationSide; lineNumber: number; comments: Comment[] }
    >();
    for (const comment of state.comments) {
      if (comment.target.kind !== 'lines' || comment.target.path !== file.path) continue;
      const side = toSelectionSide(comment.target.side);
      const key = `${side}:${comment.target.end}`;
      const group = groups.get(key) ?? { side, lineNumber: comment.target.end, comments: [] };
      groups.set(key, { ...group, comments: [...group.comments, comment] });
    }
    const list: DiffLineAnnotation<Annotation>[] = [...groups.values()].map((group) => ({
      side: group.side,
      lineNumber: group.lineNumber,
      metadata: { kind: 'comments', comments: group.comments },
    }));
    if (draft) {
      list.push({
        side: toSelectionSide(draft.side),
        lineNumber: draft.end,
        metadata: { kind: 'composer', range: draft },
      });
    }
    return list;
  }, [state.comments, file.path, draft]);

  const renderAnnotation = useCallback(
    (annotation: DiffLineAnnotation<Annotation>): ReactNode => {
      const meta = annotation.metadata;
      if (meta.kind === 'comments') {
        return (
          <AnnotationShell>
            {meta.comments.map((comment) => (
              <CommentCard key={comment.id} comment={comment} />
            ))}
          </AnnotationShell>
        );
      }
      const target = { kind: 'lines' as const, path: file.path, ...meta.range };
      return (
        <AnnotationShell>
          <CommentComposer
            target={targetLabel(target)}
            onSubmit={(body) => {
              dispatch({ type: 'addComment', comment: newComment(target, body) });
              setDraft(undefined);
            }}
            onCancel={() => setDraft(undefined)}
          />
        </AnnotationShell>
      );
    },
    [dispatch, file.path],
  );

  const startDraft = useCallback((side: Side, start: number, end: number) => {
    setDraft({ side, start: Math.min(start, end), end: Math.max(start, end) });
  }, []);

  const options = useMemo(
    () => ({
      diffStyle: panel.diffStyle,
      theme: THEMES,
      themeType: state.theme,
      disableFileHeader: true,
      lineDiffType: 'word' as const,
      hunkSeparators: 'line-info' as const,
      overflow: 'scroll' as const,
      lineHoverHighlight: 'both' as const,
      enableLineSelection: true,
      onLineNumberClick: (props: { lineNumber: number; annotationSide: AnnotationSide }) => {
        startDraft(fromSelectionSide(props.annotationSide), props.lineNumber, props.lineNumber);
      },
      // `onLineSelected` also fires for selections applied through `selectedLines`; the End
      // callback only fires when the user finishes a pointer-driven selection.
      onLineSelectionEnd: (range: SelectedLineRange | null) => {
        if (!range) return;
        startDraft(fromSelectionSide(range.side), range.start, range.end);
      },
    }),
    [panel.diffStyle, state.theme, startDraft],
  );

  // Only a comment draft keeps lines selected; a focused range pulses instead (see pulse.ts).
  const selectedLines = toSelectedLines(draft);

  return (
    <article
      data-testid="panel"
      data-path={file.path}
      data-diff-style={panel.diffStyle}
      data-focus={focusLabel(panel.focus)}
      className="overflow-clip rounded-lg border border-neutral-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-950"
    >
      <header
        data-testid="panel-header"
        className="sticky top-0 z-10 flex items-center gap-3 border-b border-neutral-200 bg-white/95 px-3 py-2 backdrop-blur dark:border-neutral-800 dark:bg-neutral-950/95"
      >
        <StatusBadge file={file} />
        <span className="min-w-0 flex-1 truncate font-mono text-[13px]" title={file.path}>
          {file.path}
          {file.oldPath && <span className="ml-2 text-neutral-500">← {file.oldPath}</span>}
        </span>
        <Stats file={file} />
        {comments.length > 0 && (
          <span
            data-testid="panel-comment-count"
            title={`${comments.length} comment${comments.length === 1 ? '' : 's'}`}
            className="rounded-full bg-amber-500 px-1.5 text-[11px] font-semibold text-white"
          >
            {comments.length}
          </span>
        )}
        <button
          type="button"
          data-testid="comment-file-button"
          title="Comment on this file"
          onClick={() => setFileComposerOpen(true)}
          className="rounded border border-neutral-300 px-2 py-0.5 text-xs hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
        >
          Comment
        </button>
        {!file.binary && (
          <button
            type="button"
            data-testid="diff-style-toggle"
            title={
              panel.diffStyle === 'unified' ? 'Switch to split view' : 'Switch to unified view'
            }
            onClick={() =>
              dispatch({
                type: 'setDiffStyle',
                path: file.path,
                diffStyle: panel.diffStyle === 'unified' ? 'split' : 'unified',
              })
            }
            className="rounded border border-neutral-300 px-2 py-0.5 text-xs hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
          >
            {panel.diffStyle === 'unified' ? 'Unified' : 'Split'}
          </button>
        )}
        <button
          type="button"
          data-testid="panel-close"
          aria-label={`Close ${file.path}`}
          title="Close panel"
          onClick={() => dispatch({ type: 'closePanel', path: file.path })}
          className="grid h-7 w-7 place-items-center rounded text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900 dark:hover:bg-neutral-800 dark:hover:text-neutral-100"
        >
          ×
        </button>
      </header>
      {(fileComments.length > 0 || fileComposerOpen) && (
        <div
          data-testid="file-comments"
          className="border-b border-neutral-200 bg-neutral-50 px-3 py-2 dark:border-neutral-800 dark:bg-neutral-900/60"
        >
          {fileComments.map((comment) => (
            <CommentCard key={comment.id} comment={comment} />
          ))}
          {fileComposerOpen && (
            <CommentComposer
              target="file"
              onSubmit={(body) => {
                dispatch({
                  type: 'addComment',
                  comment: newComment({ kind: 'file', path: file.path }, body),
                });
                setFileComposerOpen(false);
              }}
              onCancel={() => setFileComposerOpen(false)}
            />
          )}
        </div>
      )}
      {file.binary ? (
        <div className="px-4 py-8 text-center text-sm text-neutral-500">Binary file not shown</div>
      ) : (
        <PatchDiff<Annotation>
          patch={file.patch}
          disableWorkerPool
          selectedLines={selectedLines}
          lineAnnotations={lineAnnotations}
          renderAnnotation={renderAnnotation}
          options={options}
        />
      )}
    </article>
  );
}

const POINTER_EVENTS = ['pointerdown', 'pointerup', 'pointermove', 'mousedown', 'mouseup'];

/**
 * Wraps slotted annotation content. Pointer events are stopped here so the diff renderer does not
 * treat clicks inside comment cards and composers as line selections. `click` still bubbles, so
 * React button handlers keep working.
 */
function AnnotationShell({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const stop = (event: Event): void => event.stopPropagation();
    for (const type of POINTER_EVENTS) el.addEventListener(type, stop);
    return () => {
      for (const type of POINTER_EVENTS) el.removeEventListener(type, stop);
    };
  }, []);
  return (
    <div ref={ref} className="px-3 py-1 font-sans">
      {children}
    </div>
  );
}
