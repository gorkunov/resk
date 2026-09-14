import { focusRowElements } from './focus-scroll.js';
import type { Focus } from './state/reducer.js';

/** Marks rows while they pulse, so the animation is observable from the DOM. */
export const PULSE_ATTRIBUTE = 'data-resk-pulse';

const PULSE_MS = 1300;
const MAX_WAIT_MS = 8000;
const TINT = 'rgba(56, 189, 248, 0.55)';

/**
 * Flashes the focused rows twice and leaves them exactly as they were, so the linked code draws
 * the eye without staying highlighted while the reviewer reads. Waits for the diff to render;
 * returns a cleanup that cancels an unfinished pulse.
 */
export function pulseFocus(panel: HTMLElement, focus: Focus): () => void {
  const started = performance.now();
  let cancelled = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const running: Animation[] = [];
  const marked: HTMLElement[] = [];

  const pulse = (el: HTMLElement): void => {
    // Start and end on the row's own background so it does not flash when the animation is over.
    const base = getComputedStyle(el).backgroundColor;
    el.setAttribute(PULSE_ATTRIBUTE, '');
    marked.push(el);
    const animation = el.animate(
      [
        { backgroundColor: base },
        { backgroundColor: TINT },
        { backgroundColor: base },
        { backgroundColor: TINT },
        { backgroundColor: base },
      ],
      { duration: PULSE_MS, easing: 'ease-in-out' },
    );
    running.push(animation);
    animation.finished.then(
      () => el.removeAttribute(PULSE_ATTRIBUTE),
      () => undefined, // cancelled
    );
  };

  const attempt = (): void => {
    if (cancelled) return;
    const rows = focusRowElements(panel, focus.side, focus.start, focus.end);
    if (rows.length === 0) {
      if (performance.now() - started < MAX_WAIT_MS) timer = setTimeout(attempt, 50);
      return;
    }
    for (const el of rows) {
      if (typeof el.animate === 'function') pulse(el);
    }
  };

  attempt();

  return () => {
    cancelled = true;
    if (timer !== undefined) clearTimeout(timer);
    for (const animation of running) animation.cancel();
    for (const el of marked) el.removeAttribute(PULSE_ATTRIBUTE);
  };
}
