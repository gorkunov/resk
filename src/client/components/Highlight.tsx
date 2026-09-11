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
  'relative inline rounded px-1 py-0.5 align-baseline text-left font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400';

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
  const isOpen = state.panels.some((p) => p.path === path);
  const hasComments = commentsForPath(state.comments, path).length > 0;
  const { anchor } = resolved;

  const open = (): void => {
    if (anchor.side !== undefined && anchor.start !== undefined && anchor.end !== undefined) {
      dispatch({
        type: 'openPanel',
        path,
        range: { side: anchor.side, start: anchor.start, end: anchor.end },
      });
    } else {
      dispatch({ type: 'openPanel', path });
    }
  };

  const tone = isOpen
    ? 'bg-sky-600 text-white hover:bg-sky-700 dark:bg-sky-500 dark:text-neutral-950 dark:hover:bg-sky-400'
    : 'bg-sky-50 text-sky-800 underline decoration-dotted decoration-sky-400 underline-offset-4 hover:bg-sky-100 dark:bg-sky-950/60 dark:text-sky-300 dark:hover:bg-sky-900';

  return (
    <button
      type="button"
      data-testid="highlight"
      data-state={isOpen ? 'open' : 'default'}
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
