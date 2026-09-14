// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import {
  findLineElement,
  focusRowElements,
  nearestLineElement,
  renderedLines,
} from '../../src/client/focus-scroll.js';

function line(type: string, lineNo: number, alt?: number, text = ''): string {
  const altAttr = alt === undefined ? '' : ` data-alt-line="${alt}"`;
  return `<div data-line-type="${type}" data-line="${lineNo}"${altAttr}>${text}</div>`;
}

function indexed(type: string, lineNo: number, alt: number | undefined, index: string): string {
  const altAttr = alt === undefined ? '' : ` data-alt-line="${alt}"`;
  return `<div data-line-type="${type}" data-line="${lineNo}"${altAttr} data-line-index="${index}"></div>`;
}

function gutterIndexed(lineNo: number, index: string): string {
  return `<div data-line-type="context" data-column-number="${lineNo}" data-line-index="${index}"></div>`;
}

function gutter(lineNo: number): string {
  return `<div data-line-type="context" data-column-number="${lineNo}"></div>`;
}

let panel: HTMLElement;

function mount(shadowHtml: string): void {
  document.body.innerHTML = '<article id="panel"><diffs-container></diffs-container></article>';
  panel = document.getElementById('panel')!;
  const host = panel.querySelector('diffs-container')!;
  host.attachShadow({ mode: 'open' }).innerHTML = shadowHtml;
}

describe('unified view', () => {
  beforeEach(() => {
    // new 1 deleted/added, context old2/new2, old 4 deleted, new 4-7 added, context old5/new8, old 20 <-> new 25
    mount(
      `<pre><div data-code="">${gutter(1)}${line('change-deletion', 1)}${line('change-addition', 1)}${line('context', 2, 2)}${line('change-deletion', 4)}${line('change-addition', 4)}${line('change-addition', 5)}${line('context', 8, 5)}${line('context', 25, 20, 'far')}</div></pre>`,
    );
  });

  it('extracts old and new numbers per line and skips gutter items', () => {
    const lines = renderedLines(panel);
    expect(lines.map((l) => [l.old, l.new])).toEqual([
      [1, undefined],
      [undefined, 1],
      [2, 2],
      [4, undefined],
      [undefined, 4],
      [undefined, 5],
      [5, 8],
      [20, 25],
    ]);
  });

  it('finds exact lines on each side without confusing old and new numbers', () => {
    expect(findLineElement(panel, 'new', 8)?.dataset.line).toBe('8');
    expect(findLineElement(panel, 'old', 5)?.dataset.altLine).toBe('5');
    expect(findLineElement(panel, 'old', 8)).toBeUndefined();
    expect(findLineElement(panel, 'new', 20)).toBeUndefined();
    expect(findLineElement(panel, 'old', 20)?.textContent).toBe('far');
  });

  it('falls back to the nearest rendered line on that side', () => {
    expect(nearestLineElement(panel, 'new', 6, 6)?.dataset.line).toBe('5');
    expect(nearestLineElement(panel, 'new', 12, 14)?.dataset.line).toBe('8');
    expect(nearestLineElement(panel, 'new', 2, 9)?.dataset.line).toBe('2');
    expect(nearestLineElement(panel, 'old', 10, 10)?.dataset.altLine).toBe('5');
    expect(nearestLineElement(panel, 'old', 3, 6)?.dataset.line).toBe('4');
  });

  it('returns undefined when nothing is rendered', () => {
    mount('<pre></pre>');
    expect(nearestLineElement(panel, 'new', 1, 1)).toBeUndefined();
  });
});

describe('split view', () => {
  beforeEach(() => {
    mount(
      `<pre><div data-code="">${line('change-deletion', 1)}${line('context', 2, 2)}${line('context', 5, 8)}</div><div data-code="">${line('change-addition', 1)}${line('context', 2, 2)}${line('context', 8, 5)}</div></pre>`,
    );
  });

  it('reads deletions from the left column and additions from the right', () => {
    const lines = renderedLines(panel);
    expect(lines.map((l) => [l.old, l.new])).toEqual([
      [1, undefined],
      [2, 2],
      [5, 8],
      [undefined, 1],
      [2, 2],
      [5, 8],
    ]);
    // The same row exists in both columns; either element is an acceptable scroll target.
    const oldFive = findLineElement(panel, 'old', 5)!;
    expect([oldFive.dataset.line, oldFive.dataset.altLine]).toContain('5');
    const newEight = findLineElement(panel, 'new', 8)!;
    expect([newEight.dataset.line, newEight.dataset.altLine]).toContain('8');
    expect(findLineElement(panel, 'new', 5)).toBeUndefined();
  });
});

describe('focus rows', () => {
  beforeEach(() => {
    mount(
      `<pre><code data-code="">
        <div data-gutter="">${gutterIndexed(1, '0,0')}${gutterIndexed(2, '1,1')}${gutterIndexed(3, '2,2')}</div>
        <div data-content="">${indexed('context', 1, undefined, '0,0')}${indexed('change-addition', 2, undefined, '1,1')}${indexed('change-addition', 3, undefined, '2,2')}</div>
      </code></pre>`,
    );
  });

  it('collects each focused code line together with its gutter number', () => {
    const rows = focusRowElements(panel, 'new', 2, 3);
    expect(rows.map((el) => el.dataset.lineIndex)).toEqual(['1,1', '1,1', '2,2', '2,2']);
    expect(rows.filter((el) => el.hasAttribute('data-column-number'))).toHaveLength(2);
  });

  it('is empty when the focused lines are not rendered', () => {
    expect(focusRowElements(panel, 'new', 90, 95)).toEqual([]);
    expect(focusRowElements(panel, 'old', 1, 3)).toEqual([]);
  });
});
