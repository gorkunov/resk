// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { offsetsFromRange, rangeFromOffsets, textBetween } from '../../src/client/text-offsets.js';

let container: HTMLElement;

beforeEach(() => {
  document.body.innerHTML = `
    <div id="root">
      <div id="outside">Changed files</div>
      <div id="summary"><h2>Critical</h2><p>Token <button>refresh</button> moved <em>to</em> the server.</p><p>Second paragraph.</p></div>
    </div>`;
  container = document.getElementById('summary')!;
});

function textNode(parent: Element, index = 0): Text {
  const walker = document.createTreeWalker(parent, NodeFilter.SHOW_TEXT);
  let node: Node | null = null;
  for (let i = 0; i <= index; i++) node = walker.nextNode();
  return node as Text;
}

describe('offsetsFromRange', () => {
  it('maps a range inside the container to offsets in its flattened text', () => {
    const range = document.createRange();
    const p = container.querySelector('p')!;
    range.setStart(textNode(p, 0), 0); // "Token "
    range.setEnd(textNode(p, 2), 6); // " moved" -> after "moved"
    expect(offsetsFromRange(container, range)).toEqual({ start: 8, end: 27 });
    expect(container.textContent!.slice(8, 27)).toBe('Token refresh moved');
  });

  it('returns undefined for collapsed ranges and ranges that leave the container', () => {
    const collapsed = document.createRange();
    collapsed.setStart(textNode(container.querySelector('p')!, 0), 2);
    collapsed.collapse(true);
    expect(offsetsFromRange(container, collapsed)).toBeUndefined();

    const outside = document.createRange();
    outside.setStart(textNode(document.getElementById('outside')!), 0);
    outside.setEnd(textNode(container.querySelector('p')!, 0), 3);
    expect(offsetsFromRange(container, outside)).toBeUndefined();
  });

  it('trims surrounding whitespace from the offsets', () => {
    const range = document.createRange();
    const p = container.querySelector('p')!;
    range.setStart(textNode(p, 0), 5); // " " before refresh
    range.setEnd(textNode(p, 2), 6);
    expect(offsetsFromRange(container, range)).toEqual({ start: 14, end: 27 });
  });
});

describe('rangeFromOffsets', () => {
  it('rebuilds a range across element boundaries', () => {
    const range = rangeFromOffsets(container, 8, 27)!;
    expect(range.toString()).toBe('Token refresh moved');
    expect(textBetween(container, 8, 27)).toBe('Token refresh moved');
  });

  it('returns undefined when the offsets exceed the text', () => {
    expect(rangeFromOffsets(container, 0, 10_000)).toBeUndefined();
    expect(rangeFromOffsets(container, 5, 5)).toBeUndefined();
  });
});
