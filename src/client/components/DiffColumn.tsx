import { useEffect, useRef } from 'react';
import { useStore } from '../state/store.jsx';
import { DiffPanel, scrollPanelToFocus } from './DiffPanel.jsx';

export function DiffColumn() {
  const { review, state } = useStore();
  const columnRef = useRef<HTMLDivElement>(null);
  const target = state.scrollTarget;

  useEffect(() => {
    if (!target || !columnRef.current) return;
    const panel = columnRef.current.querySelector<HTMLElement>(
      `[data-testid="panel"][data-path="${cssEscape(target.path)}"]`,
    );
    if (!panel) return;
    panel.scrollIntoView({ block: 'start' });
    const focus = state.panels.find((p) => p.path === target.path)?.focus;
    if (focus) return scrollPanelToFocus(panel, focus);
    return undefined;
    // Only re-run when a new scroll is requested (nonce changes).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target?.nonce]);

  return (
    <div ref={columnRef} className="flex flex-col gap-4 p-4">
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
