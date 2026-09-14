import type { Side } from '../shared/types.js';
import type { Focus } from './state/reducer.js';

/** A rendered diff line with the numbers it has on each side. */
export interface RenderedLine {
  el: HTMLElement;
  old?: number;
  new?: number;
}

type Column = 'unified' | 'deletions' | 'additions';

function num(value: string | undefined): number | undefined {
  if (value === undefined || value === '') return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function numbersFor(el: HTMLElement, column: Column): Pick<RenderedLine, 'old' | 'new'> {
  const type = el.dataset.lineType ?? '';
  const line = num(el.dataset.line);
  const alt = num(el.dataset.altLine);
  const result: Pick<RenderedLine, 'old' | 'new'> = {};
  if (type === 'change-addition') {
    if (line !== undefined) result.new = line;
  } else if (type === 'change-deletion') {
    if (line !== undefined) result.old = line;
  } else if (column === 'deletions') {
    // Split view, left column: `data-line` is the old number, `data-alt-line` the new one.
    if (line !== undefined) result.old = line;
    if (alt !== undefined) result.new = alt;
  } else {
    // Unified view and the right split column: `data-line` is the new number.
    if (line !== undefined) result.new = line;
    if (alt !== undefined) result.old = alt;
  }
  return result;
}

/** Every rendered diff line inside a panel, in document order. */
export function renderedLines(panel: HTMLElement): RenderedLine[] {
  const host = panel.querySelector('diffs-container');
  const root = host?.shadowRoot ?? host;
  if (!root) return [];
  const containers = [...root.querySelectorAll('[data-code]')];
  const lines: RenderedLine[] = [];
  for (const el of root.querySelectorAll<HTMLElement>('[data-line-type]')) {
    if (el.hasAttribute('data-column-number')) continue; // gutter items
    const container = el.closest('[data-code]');
    const index = container ? containers.indexOf(container) : -1;
    const column: Column =
      containers.length > 1 ? (index === 0 ? 'deletions' : 'additions') : 'unified';
    lines.push({ el, ...numbersFor(el, column) });
  }
  return lines;
}

function sideNumber(line: RenderedLine, side: Side): number | undefined {
  return side === 'new' ? line.new : line.old;
}

export function findLineElement(
  panel: HTMLElement,
  side: Side,
  lineNumber: number,
): HTMLElement | undefined {
  return renderedLines(panel).find((l) => sideNumber(l, side) === lineNumber)?.el;
}

/**
 * The element for `start`, else for `end`, else the rendered line closest to the range. Anchors
 * often point at context between hunks that the diff does not contain.
 */
export function nearestLineElement(
  panel: HTMLElement,
  side: Side,
  start: number,
  end: number,
): HTMLElement | undefined {
  const lines = renderedLines(panel).filter((l) => sideNumber(l, side) !== undefined);
  if (lines.length === 0) return undefined;
  const exact = (n: number) => lines.find((l) => sideNumber(l, side) === n)?.el;
  const found = exact(start) ?? exact(end);
  if (found) return found;
  const inRange = lines.find((l) => {
    const n = sideNumber(l, side)!;
    return n >= start && n <= end;
  });
  if (inRange) return inRange.el;
  let best = lines[0]!;
  let bestDistance = Math.abs(sideNumber(best, side)! - start);
  for (const l of lines) {
    const distance = Math.abs(sideNumber(l, side)! - start);
    if (distance < bestDistance) {
      best = l;
      bestDistance = distance;
    }
  }
  return best.el;
}

/**
 * Gutter number element that belongs to a rendered code line. Both carry the same
 * `data-line-index` ("<row>,<line>"), and each column holds its own gutter, so the search stays
 * inside the line's own `[data-code]` container.
 */
function gutterFor(line: HTMLElement): HTMLElement | undefined {
  const index = line.dataset.lineIndex;
  if (index === undefined || !/^[\d,]+$/.test(index)) return undefined;
  const column = line.closest('[data-code]');
  const gutter = column?.querySelector<HTMLElement>(
    `[data-column-number][data-line-index="${index}"]`,
  );
  return gutter ?? undefined;
}

/**
 * The elements that make up the rows of a focused range: each rendered code line preceded by its
 * gutter number. Empty when the range is not rendered (a range between hunks, for example).
 */
export function focusRowElements(
  panel: HTMLElement,
  side: Side,
  start: number,
  end: number,
): HTMLElement[] {
  const rows: HTMLElement[] = [];
  for (const line of renderedLines(panel)) {
    const number = sideNumber(line, side);
    if (number === undefined || number < start || number > end) continue;
    const gutter = gutterFor(line.el);
    if (gutter) rows.push(gutter);
    rows.push(line.el);
  }
  return rows;
}

const SETTLE_MS = 2500;
const MAX_WAIT_MS = 8000;

/**
 * Brings a panel (and, when given, its focused range) into view and keeps it there while the
 * layout settles: the column animating open, fonts swapping in, other panels rendering. Stops as
 * soon as the user scrolls or clicks inside the column. Returns a cleanup function.
 */
export function scrollPanelIntoFocus(
  scroller: HTMLElement,
  content: HTMLElement,
  panel: HTMLElement,
  focus: Focus | undefined,
): () => void {
  const started = performance.now();
  let cancelled = false;
  let located = false;
  /** Scroll offset right after our last scroll; a scroll event elsewhere means the user took over. */
  let expectedTop: number | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const scrollBy = (action: () => void): void => {
    action();
    expectedTop = scroller.scrollTop;
  };

  const scrollNow = (): boolean => {
    if (!focus) {
      scrollBy(() => panel.scrollIntoView({ block: 'start' }));
      return true;
    }
    const el = nearestLineElement(panel, focus.side, focus.start, focus.end);
    if (!el) return false;
    scrollBy(() => el.scrollIntoView({ block: 'center' }));
    return true;
  };

  const attempt = (): void => {
    if (cancelled) return;
    if (scrollNow()) {
      located = true;
    } else if (performance.now() - started < MAX_WAIT_MS) {
      timer = setTimeout(attempt, 50);
    }
  };

  const observer =
    typeof ResizeObserver === 'undefined'
      ? undefined
      : new ResizeObserver(() => {
          if (cancelled) return;
          if (performance.now() - started > SETTLE_MS) {
            observer?.disconnect();
            return;
          }
          if (located) scrollNow();
        });
  observer?.observe(content);

  // Any scroll that lands somewhere we did not put it means the user took over.
  const onScroll = (): void => {
    if (expectedTop === undefined || Math.abs(scroller.scrollTop - expectedTop) > 1) stop();
  };
  const stop = (): void => {
    cancelled = true;
    if (timer !== undefined) clearTimeout(timer);
    observer?.disconnect();
    scroller.removeEventListener('scroll', onScroll);
    scroller.removeEventListener('pointerdown', stop);
  };
  scroller.addEventListener('scroll', onScroll, { passive: true });
  scroller.addEventListener('pointerdown', stop, { passive: true });

  if (typeof document !== 'undefined' && 'fonts' in document) {
    void document.fonts.ready.then(() => {
      if (!cancelled && located && performance.now() - started <= SETTLE_MS) scrollNow();
    });
  }

  scrollBy(() => panel.scrollIntoView({ block: 'start' }));
  attempt();
  return stop;
}
