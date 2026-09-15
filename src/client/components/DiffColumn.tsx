import { useEffect, useRef } from 'react';
import { useStore } from '../state/store.jsx';
import { scrollPanelIntoFocus } from '../focus-scroll.js';
import { pulseFocus } from '../pulse.js';
import { DiffPanel } from './DiffPanel.jsx';

export function DiffColumn() {
  const { review, state, dispatch } = useStore();
  const contentRef = useRef<HTMLDivElement>(null);
  const target = state.scrollTarget;

  // Follow the panel the reviewer scrolls to: the next file they open lands right below it.
  useEffect(() => {
    const content = contentRef.current;
    const scroller = content?.closest<HTMLElement>('[data-testid="diff-column"]');
    if (!content || !scroller) return;
    let frame = 0;
    const update = (): void => {
      frame = 0;
      // Nothing to scroll: every panel is on screen, so the one just opened is still the subject.
      if (scroller.scrollHeight <= scroller.clientHeight + 1) return;
      const view = scroller.getBoundingClientRect();
      let best: string | undefined;
      let bestHeight = 0;
      for (const el of content.querySelectorAll<HTMLElement>('[data-testid="panel"]')) {
        const rect = el.getBoundingClientRect();
        const height = Math.min(rect.bottom, view.bottom) - Math.max(rect.top, view.top);
        if (height > bestHeight) {
          bestHeight = height;
          best = el.dataset.path;
        }
      }
      dispatch({ type: 'setVisiblePanel', path: best });
    };
    const onScroll = (): void => {
      if (frame === 0) frame = requestAnimationFrame(update);
    };
    scroller.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      scroller.removeEventListener('scroll', onScroll);
      if (frame !== 0) cancelAnimationFrame(frame);
    };
  }, [dispatch]);

  useEffect(() => {
    const content = contentRef.current;
    if (!target || !content) return;
    const panel = content.querySelector<HTMLElement>(
      `[data-testid="panel"][data-path="${cssEscape(target.path)}"]`,
    );
    if (!panel) return;
    const scroller = content.closest<HTMLElement>('[data-testid="diff-column"]') ?? content;
    const focus = state.panels.find((p) => p.path === target.path)?.focus;
    const stopScroll = scrollPanelIntoFocus(scroller, content, panel, focus);
    const stopPulse = focus ? pulseFocus(panel, focus) : undefined;
    return () => {
      stopScroll();
      stopPulse?.();
    };
    // Only re-run when a new scroll is requested (nonce changes).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target?.nonce]);

  if (state.panels.length === 0) {
    return (
      <div
        data-testid="diff-column-empty"
        className="grid h-full place-items-center p-8 text-center text-sm text-neutral-500"
      >
        No files open. Click a highlight in the summary to open one.
      </div>
    );
  }

  return (
    <div ref={contentRef} className="flex flex-col gap-4 p-4">
      {state.panels.map((panel) => {
        const file = review.files.find((f) => f.path === panel.path);
        return file ? <DiffPanel key={panel.path} file={file} panel={panel} /> : null;
      })}
    </div>
  );
}

function cssEscape(value: string): string {
  return typeof CSS !== 'undefined' && 'escape' in CSS
    ? CSS.escape(value)
    : value.replace(/"/g, '\\"');
}
