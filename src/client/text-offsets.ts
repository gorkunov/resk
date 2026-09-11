/**
 * Maps DOM selections inside a container to offsets in the container's flattened text content and
 * back. Offsets are stable for a given rendered summary, so they can be stored with a comment and
 * turned into highlight ranges again after a reload.
 */

export interface TextOffsets {
  start: number;
  end: number;
}

function offsetOfBoundary(container: Node, node: Node, offset: number): number {
  const range = document.createRange();
  range.setStart(container, 0);
  range.setEnd(node, offset);
  return range.toString().length;
}

/** Offsets of a selection range inside `container`, trimmed of surrounding whitespace. */
export function offsetsFromRange(container: Node, range: Range): TextOffsets | undefined {
  if (range.collapsed) return undefined;
  if (!container.contains(range.startContainer) || !container.contains(range.endContainer)) {
    return undefined;
  }
  const text = container.textContent ?? '';
  let start = offsetOfBoundary(container, range.startContainer, range.startOffset);
  let end = offsetOfBoundary(container, range.endContainer, range.endOffset);
  while (start < end && /\s/.test(text[start] ?? '')) start++;
  while (end > start && /\s/.test(text[end - 1] ?? '')) end--;
  if (start >= end) return undefined;
  return { start, end };
}

/** Rebuilds a DOM range for text offsets, or undefined when they fall outside the text. */
export function rangeFromOffsets(container: Node, start: number, end: number): Range | undefined {
  if (start < 0 || end <= start) return undefined;
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  const range = document.createRange();
  let position = 0;
  let startSet = false;
  let node = walker.nextNode() as Text | null;
  while (node) {
    const next = position + node.data.length;
    if (!startSet && start < next) {
      range.setStart(node, start - position);
      startSet = true;
    }
    if (startSet && end <= next) {
      range.setEnd(node, end - position);
      return range;
    }
    position = next;
    node = walker.nextNode() as Text | null;
  }
  return undefined;
}

export function textBetween(container: Node, start: number, end: number): string {
  return (container.textContent ?? '').slice(start, end);
}

/** Text offset of the caret position under a viewport point, when it lies inside `container`. */
export function caretOffsetFromPoint(container: Node, x: number, y: number): number | undefined {
  let node: Node | undefined;
  let offset = 0;
  if (typeof document.caretPositionFromPoint === 'function') {
    const position = document.caretPositionFromPoint(x, y);
    if (!position) return undefined;
    node = position.offsetNode;
    offset = position.offset;
  } else if (typeof document.caretRangeFromPoint === 'function') {
    const range = document.caretRangeFromPoint(x, y);
    if (!range) return undefined;
    node = range.startContainer;
    offset = range.startOffset;
  }
  if (!node || !container.contains(node)) return undefined;
  return offsetOfBoundary(container, node, offset);
}
