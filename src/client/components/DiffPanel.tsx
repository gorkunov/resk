import { PatchDiff, type SelectedLineRange } from '@pierre/diffs/react';
import type { FileChange, Side } from '../../shared/types.js';
import { useStore } from '../state/store.jsx';
import type { Focus, PanelState } from '../state/reducer.js';
import { StatusBadge, Stats } from './ChangedFiles.jsx';

const THEMES = { light: 'github-light', dark: 'github-dark' } as const;

function toSelectionSide(side: Side): 'additions' | 'deletions' {
  return side === 'new' ? 'additions' : 'deletions';
}

export function focusLabel(focus: Focus | undefined): string | undefined {
  return focus ? `${focus.side}:${focus.start}-${focus.end}` : undefined;
}

interface DiffPanelProps {
  file: FileChange;
  panel: PanelState;
}

export function DiffPanel({ file, panel }: DiffPanelProps) {
  const { state, dispatch } = useStore();
  const focus = panel.focus;
  const selectedLines: SelectedLineRange | null = focus
    ? {
        start: focus.start,
        end: focus.end,
        side: toSelectionSide(focus.side),
        endSide: toSelectionSide(focus.side),
      }
    : null;

  return (
    <article
      data-testid="panel"
      data-path={file.path}
      data-diff-style={panel.diffStyle}
      data-focus={focusLabel(focus)}
      className="overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-950"
    >
      <header
        data-testid="panel-header"
        className="sticky top-0 z-10 flex items-center gap-3 border-b border-neutral-200 bg-white/95 px-3 py-2 backdrop-blur dark:border-neutral-800 dark:bg-neutral-950/95"
      >
        <StatusBadge file={file} />
        <span className="min-w-0 flex-1 truncate font-mono text-[13px]" dir="rtl" title={file.path}>
          <span dir="ltr">
            {file.path}
            {file.oldPath && <span className="ml-2 text-neutral-500">← {file.oldPath}</span>}
          </span>
        </span>
        <Stats file={file} />
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
      {file.binary ? (
        <div className="px-4 py-8 text-center text-sm text-neutral-500">Binary file not shown</div>
      ) : (
        <PatchDiff
          patch={file.patch}
          disableWorkerPool
          selectedLines={selectedLines}
          options={{
            diffStyle: panel.diffStyle,
            theme: THEMES,
            themeType: state.theme,
            disableFileHeader: true,
            lineDiffType: 'word',
            hunkSeparators: 'line-info',
            overflow: 'scroll',
          }}
        />
      )}
    </article>
  );
}

/** Finds the rendered line element for a side/number inside a panel's diff. */
export function findLineElement(
  panel: HTMLElement,
  side: Side,
  lineNumber: number,
): HTMLElement | undefined {
  const host = panel.querySelector('diffs-container');
  const root = host?.shadowRoot ?? host;
  if (!root) return undefined;
  const wanted = String(lineNumber);
  for (const el of root.querySelectorAll<HTMLElement>('[data-line-type]')) {
    const type = el.dataset.lineType ?? '';
    const line = el.dataset.line;
    const alt = el.dataset.altLine;
    if (side === 'new') {
      if (line === wanted && type !== 'change-deletion') return el;
      if (alt === wanted && type.startsWith('context')) return el;
    } else {
      if (line === wanted && type !== 'change-addition') return el;
      if (alt === wanted && type.startsWith('context')) return el;
    }
  }
  return undefined;
}

/**
 * Scrolls the focused range into view once the diff has rendered its lines.
 * Returns a cleanup function that stops waiting.
 */
export function scrollPanelToFocus(panel: HTMLElement, focus: Focus): () => void {
  let cancelled = false;
  const started = performance.now();
  const attempt = (): void => {
    if (cancelled) return;
    const el = findLineElement(panel, focus.side, focus.start);
    if (el) {
      el.scrollIntoView({ block: 'center' });
      return;
    }
    if (performance.now() - started < 3000) setTimeout(attempt, 50);
  };
  attempt();
  return () => {
    cancelled = true;
  };
}
