import { useMemo, type ReactNode } from 'react';
import { describeAnchorProblem, resolveAnchor } from '../../shared/anchors.js';
import { commentsForPath } from '../../shared/comments.js';
import { useStore } from '../state/store.jsx';
import { CommentDot } from './CommentDot.jsx';

interface HighlightProps {
  /** The full `diff:` URL. */
  raw: string;
  children?: ReactNode;
}

const BASE =
  'relative inline-block rounded px-1 py-0 align-baseline text-left font-medium leading-6 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400';

export function Highlight({ raw, children }: HighlightProps) {
  const { review, state, dispatch } = useStore();
  const resolved = useMemo(() => resolveAnchor(raw, review.files), [raw, review.files]);

  if (resolved.status !== 'ok') {
    return (
      <button
        type="button"
        disabled
        data-testid="highlight"
        data-state="broken"
        title={`${raw} ${describeAnchorProblem(resolved)}`}
        className={`${BASE} cursor-not-allowed text-neutral-500 underline decoration-dashed decoration-neutral-400 underline-offset-4`}
      >
        {children}
      </button>
    );
  }

  const path = resolved.file.path;
  const { anchor } = resolved;
  const isWholeFile =
    anchor.side === undefined || anchor.start === undefined || anchor.end === undefined;
  const anchorKey = isWholeFile ? path : `${path}#${anchor.side}:${anchor.start}-${anchor.end}`;
  const isOpen = state.panels.some((p) => p.path === path);
  const reviewed = isWholeFile
    ? state.viewed.paths.includes(path)
    : state.viewed.anchors.includes(anchorKey);
  const hasComments = commentsForPath(state.comments, path).length > 0;

  const open = (): void => {
    if (!isWholeFile) {
      dispatch({
        type: 'openPanel',
        path,
        range: { side: anchor.side!, start: anchor.start!, end: anchor.end! },
        anchorKey,
      });
    } else {
      dispatch({ type: 'openPanel', path, anchorKey });
    }
  };

  const tone = isOpen
    ? reviewed
      ? 'bg-emerald-600 text-white hover:bg-emerald-700 dark:bg-emerald-500 dark:text-neutral-950 dark:hover:bg-emerald-400'
      : 'bg-sky-600 text-white hover:bg-sky-700 dark:bg-sky-500 dark:text-neutral-950 dark:hover:bg-sky-400'
    : reviewed
      ? 'bg-emerald-50 text-emerald-800 underline decoration-dotted decoration-emerald-400 underline-offset-4 hover:bg-emerald-100 dark:bg-emerald-950/60 dark:text-emerald-300 dark:hover:bg-emerald-900'
      : 'bg-sky-50 text-sky-800 underline decoration-dotted decoration-sky-400 underline-offset-4 hover:bg-sky-100 dark:bg-sky-950/60 dark:text-sky-300 dark:hover:bg-sky-900';

  return (
    <button
      type="button"
      data-testid="highlight"
      data-state={isOpen ? 'open' : reviewed ? 'reviewed' : 'default'}
      data-reviewed={reviewed ? 'true' : 'false'}
      data-path={path}
      data-has-comments={hasComments ? 'true' : undefined}
      aria-pressed={isOpen}
      title={
        anchor.start === undefined
          ? path
          : `${path} ${anchor.side === 'old' ? 'old ' : ''}L${anchor.start}${anchor.end !== anchor.start ? `-L${anchor.end}` : ''}`
      }
      onClick={open}
      className={`${BASE} ${tone}`}
    >
      {children}
      {hasComments && <CommentDot />}
    </button>
  );
}
