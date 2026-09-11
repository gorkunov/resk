import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';
import type { Comment } from '../../shared/types.js';
import { summarySelectionsAt } from '../../shared/comments.js';
import { newComment } from '../comment-utils.js';
import {
  caretOffsetFromPoint,
  offsetsFromRange,
  rangeFromOffsets,
  textBetween,
} from '../text-offsets.js';
import { useStore } from '../state/store.jsx';
import { Markdown } from './Markdown.jsx';
import { ChangedFiles } from './ChangedFiles.jsx';
import { SummaryComments } from './SummaryComments.jsx';
import { CommentCard } from './CommentCard.jsx';
import { CommentComposer } from './CommentComposer.jsx';

interface SummaryPaneProps {
  composerOpen: boolean;
  onCloseComposer: () => void;
}

/** A rectangle relative to the pane wrapper, so it stays put while the column scrolls. */
interface Box {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

interface PendingSelection {
  start: number;
  end: number;
  quote: string;
  box: Box;
  buttonLeft: number;
}

type Popover =
  | { kind: 'compose'; selection: PendingSelection; left: number }
  | { kind: 'view'; ids: string[]; box: Box; left: number };

const HIGHLIGHT_NAME = 'resk-comment';
const POPOVER_WIDTH = 360;
const BUTTON_WIDTH = 96;

function relativeBox(rect: DOMRect, wrapper: HTMLElement): Box {
  const base = wrapper.getBoundingClientRect();
  return {
    top: rect.top - base.top,
    bottom: rect.bottom - base.top,
    left: rect.left - base.left,
    right: rect.right - base.left,
  };
}

function clampLeft(left: number, width: number, wrapper: HTMLElement): number {
  return Math.max(0, Math.min(left, wrapper.clientWidth - width));
}

export function SummaryPane({ composerOpen, onCloseComposer }: SummaryPaneProps) {
  const { review, state, dispatch } = useStore();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const markdownRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [pending, setPending] = useState<PendingSelection | undefined>(undefined);
  const [popover, setPopover] = useState<Popover | undefined>(undefined);
  const composing = popover?.kind === 'compose';

  // Track text selections inside the rendered summary.
  useEffect(() => {
    if (composing) return;
    const onSelectionChange = (): void => {
      const selection = document.getSelection();
      const container = markdownRef.current;
      const wrapper = wrapperRef.current;
      if (!selection || selection.rangeCount === 0 || !container || !wrapper) {
        setPending(undefined);
        return;
      }
      const range = selection.getRangeAt(0);
      const offsets = offsetsFromRange(container, range);
      if (!offsets) {
        setPending(undefined);
        return;
      }
      const box = relativeBox(range.getBoundingClientRect(), wrapper);
      setPending({
        ...offsets,
        quote: textBetween(container, offsets.start, offsets.end),
        box,
        buttonLeft: clampLeft(box.right - BUTTON_WIDTH / 2, BUTTON_WIDTH, wrapper),
      });
    };
    document.addEventListener('selectionchange', onSelectionChange);
    return () => document.removeEventListener('selectionchange', onSelectionChange);
  }, [composing]);

  // Underline every commented selection. Runs after each render so ranges follow DOM updates.
  useEffect(() => {
    const container = markdownRef.current;
    const registry = (CSS as unknown as { highlights?: Map<string, Highlight> }).highlights;
    if (!container || !registry || typeof Highlight === 'undefined') return;
    const ranges: Range[] = [];
    for (const comment of state.comments) {
      if (comment.target.kind !== 'summary-selection') continue;
      const range = rangeFromOffsets(container, comment.target.start, comment.target.end);
      if (range) ranges.push(range);
    }
    registry.set(HIGHLIGHT_NAME, new Highlight(...ranges));
    return () => {
      registry.delete(HIGHLIGHT_NAME);
    };
  });

  // Close the popover on Escape or on clicks outside of it.
  useEffect(() => {
    if (!popover) return;
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setPopover(undefined);
    };
    const onPointerDown = (event: PointerEvent): void => {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        setPopover(undefined);
      }
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [popover]);

  const startCompose = (): void => {
    const wrapper = wrapperRef.current;
    if (!pending || !wrapper) return;
    setPopover({
      kind: 'compose',
      selection: pending,
      left: clampLeft(pending.box.left, POPOVER_WIDTH, wrapper),
    });
  };

  const submitSelectionComment = (body: string): void => {
    if (popover?.kind !== 'compose') return;
    const { start, end, quote } = popover.selection;
    dispatch({
      type: 'addComment',
      comment: newComment({ kind: 'summary-selection', quote, start, end }, body),
    });
    document.getSelection()?.removeAllRanges();
    setPopover(undefined);
    setPending(undefined);
  };

  const onMarkdownClick = (event: ReactMouseEvent<HTMLDivElement>): void => {
    const target = event.target as Element;
    if (target.closest('button, a')) return;
    const selection = document.getSelection();
    if (selection && !selection.isCollapsed) return;
    const container = markdownRef.current;
    const wrapper = wrapperRef.current;
    if (!container || !wrapper) return;
    const offset = caretOffsetFromPoint(container, event.clientX, event.clientY);
    if (offset === undefined) return;
    const hits = summarySelectionsAt(state.comments, offset);
    if (hits.length === 0) return;
    const first = hits[0]!.target as { start: number; end: number };
    const range = rangeFromOffsets(container, first.start, first.end);
    const box = relativeBox(
      range ? range.getBoundingClientRect() : new DOMRect(event.clientX, event.clientY, 0, 0),
      wrapper,
    );
    setPopover({
      kind: 'view',
      ids: hits.map((c) => c.id),
      box,
      left: clampLeft(box.left, POPOVER_WIDTH, wrapper),
    });
  };

  const viewedComments: Comment[] =
    popover?.kind === 'view' ? state.comments.filter((c) => popover.ids.includes(c.id)) : [];
  const showPopover = popover && (popover.kind === 'compose' || viewedComments.length > 0);
  const popoverBox = popover?.kind === 'compose' ? popover.selection.box : popover?.box;

  return (
    <section data-testid="summary" ref={wrapperRef} className="relative">
      <SummaryComments composerOpen={composerOpen} onCloseComposer={onCloseComposer} />
      <div ref={markdownRef} data-testid="summary-markdown" onClick={onMarkdownClick}>
        <Markdown source={review.summary} />
      </div>
      <ChangedFiles />

      {pending && !popover && (
        <button
          type="button"
          data-testid="selection-comment-button"
          title="Comment on this selection"
          onMouseDown={(event) => event.preventDefault()}
          onClick={startCompose}
          style={{ top: pending.box.top - 36, left: pending.buttonLeft, width: BUTTON_WIDTH }}
          className="absolute z-20 flex items-center justify-center gap-1 rounded-md bg-neutral-900 px-2 py-1 text-xs font-medium text-white shadow-lg hover:bg-neutral-700 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-white"
        >
          <span aria-hidden="true">💬</span> Comment
        </button>
      )}

      {showPopover && popover && popoverBox && (
        <div
          ref={popoverRef}
          data-testid="selection-popover"
          role="dialog"
          style={{
            top: popoverBox.bottom + 8,
            left: popover.left,
            width: POPOVER_WIDTH,
            maxWidth: '100%',
          }}
          className="absolute z-30 rounded-lg border border-neutral-200 bg-white p-2 shadow-xl dark:border-neutral-700 dark:bg-neutral-900"
        >
          {popover.kind === 'compose' ? (
            <>
              <p
                data-testid="selection-quote"
                className="mb-2 line-clamp-3 border-l-2 border-amber-400 pl-2 text-xs italic text-neutral-600 dark:text-neutral-400"
              >
                {popover.selection.quote}
              </p>
              <CommentComposer
                target="summary-selection"
                onSubmit={submitSelectionComment}
                onCancel={() => setPopover(undefined)}
              />
            </>
          ) : (
            viewedComments.map((comment) => <CommentCard key={comment.id} comment={comment} />)
          )}
        </div>
      )}
    </section>
  );
}
