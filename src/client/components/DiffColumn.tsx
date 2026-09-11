import { useEffect, useRef } from 'react';
import { useStore } from '../state/store.jsx';
import { scrollPanelIntoFocus } from '../focus-scroll.js';
import { DiffPanel } from './DiffPanel.jsx';

export function DiffColumn() {
  const { review, state } = useStore();
  const contentRef = useRef<HTMLDivElement>(null);
  const target = state.scrollTarget;

  useEffect(() => {
    const content = contentRef.current;
    if (!target || !content) return;
    const panel = content.querySelector<HTMLElement>(
      `[data-testid="panel"][data-path="${cssEscape(target.path)}"]`,
    );
    if (!panel) return;
    const scroller = content.closest<HTMLElement>('[data-testid="diff-column"]') ?? content;
    const focus = state.panels.find((p) => p.path === target.path)?.focus;
    return scrollPanelIntoFocus(scroller, content, panel, focus);
    // Only re-run when a new scroll is requested (nonce changes).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target?.nonce]);

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
