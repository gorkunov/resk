import { describe, expect, it } from 'vitest';
import { initialState, nextTheme, reduce, type AppState } from '../../src/client/state/reducer.js';
import type { Comment } from '../../src/shared/types.js';

function open(
  state: AppState,
  path: string,
  range?: { side: 'old' | 'new'; start: number; end: number },
) {
  return reduce(state, range ? { type: 'openPanel', path, range } : { type: 'openPanel', path });
}

const comment: Comment = {
  id: 'c1',
  target: { kind: 'file', path: 'a.ts' },
  body: 'hi',
  createdAt: '2026-09-11T10:00:00.000Z',
  updatedAt: '2026-09-11T10:00:00.000Z',
};

describe('panels', () => {
  it('starts with no panels', () => {
    expect(initialState.panels).toEqual([]);
    expect(initialState.scrollTarget).toBeUndefined();
  });

  it('switches to the split layout on the first panel and never switches back', () => {
    expect(initialState.splitLayout).toBe(false);
    let state = open(initialState, 'a.ts');
    expect(state.splitLayout).toBe(true);
    state = reduce(state, { type: 'closePanel', path: 'a.ts' });
    expect(state.panels).toEqual([]);
    expect(state.splitLayout).toBe(true);
  });

  it('opens a new panel right below the one the reviewer is looking at', () => {
    let state = open(initialState, 'c.ts');
    expect(state.visiblePath).toBe('c.ts');
    state = open(state, 'a.ts');
    expect(state.panels.map((p) => p.path)).toEqual(['c.ts', 'a.ts']);

    state = reduce(state, { type: 'setVisiblePanel', path: 'c.ts' });
    state = open(state, 'b.ts');
    expect(state.panels.map((p) => p.path)).toEqual(['c.ts', 'b.ts', 'a.ts']);
  });

  it('appends when nothing is visible or the visible panel is gone', () => {
    let state = open(open(initialState, 'a.ts'), 'b.ts');
    state = reduce(state, { type: 'setVisiblePanel', path: undefined });
    state = open(state, 'c.ts');
    expect(state.panels.map((p) => p.path)).toEqual(['a.ts', 'b.ts', 'c.ts']);

    state = reduce(state, { type: 'setVisiblePanel', path: 'gone.ts' });
    state = open(state, 'd.ts');
    expect(state.panels.map((p) => p.path)).toEqual(['a.ts', 'b.ts', 'c.ts', 'd.ts']);
  });

  it('reopening a panel leaves the order alone', () => {
    let state = open(open(initialState, 'a.ts'), 'b.ts');
    state = open(state, 'a.ts', { side: 'new', start: 1, end: 2 });
    expect(state.panels.map((p) => p.path)).toEqual(['a.ts', 'b.ts']);
  });

  it('ignores a repeated visible panel so scrolling does not churn state', () => {
    const state = reduce(open(initialState, 'a.ts'), { type: 'setVisiblePanel', path: 'a.ts' });
    expect(reduce(state, { type: 'setVisiblePanel', path: 'a.ts' })).toBe(state);
  });

  it('requests a scroll to the panel that was just opened', () => {
    let state = open(initialState, 'c.ts');
    expect(state.scrollTarget).toEqual({ path: 'c.ts', nonce: 1 });
    state = open(state, 'a.ts');
    expect(state.scrollTarget).toEqual({ path: 'a.ts', nonce: 2 });
  });

  it('reuses an open panel and bumps the scroll nonce', () => {
    let state = open(initialState, 'a.ts');
    state = open(state, 'a.ts');
    expect(state.panels).toHaveLength(1);
    expect(state.scrollTarget).toEqual({ path: 'a.ts', nonce: 2 });
  });

  it('stores the focused range on the panel with a nonce', () => {
    let state = open(initialState, 'a.ts', { side: 'new', start: 3, end: 5 });
    expect(state.panels[0]!.focus).toEqual({ side: 'new', start: 3, end: 5, nonce: 1 });
    state = open(state, 'a.ts', { side: 'old', start: 1, end: 1 });
    expect(state.panels[0]!.focus).toEqual({ side: 'old', start: 1, end: 1, nonce: 2 });
  });

  it('leaves the focused range alone for whole-file opens', () => {
    let state = open(initialState, 'a.ts', { side: 'new', start: 3, end: 5 });
    state = open(state, 'a.ts');
    expect(state.panels[0]!.focus).toEqual({ side: 'new', start: 3, end: 5, nonce: 1 });
  });

  it('closes panels and ignores unknown paths', () => {
    let state = open(open(initialState, 'a.ts'), 'b.ts');
    state = reduce(state, { type: 'closePanel', path: 'a.ts' });
    expect(state.panels.map((p) => p.path)).toEqual(['b.ts']);
    expect(reduce(state, { type: 'closePanel', path: 'nope' })).toBe(state);
  });

  it('defaults to unified and toggles the diff style per panel', () => {
    let state = open(open(initialState, 'a.ts'), 'b.ts');
    expect(state.panels.map((p) => p.diffStyle)).toEqual(['unified', 'unified']);
    state = reduce(state, { type: 'setDiffStyle', path: 'a.ts', diffStyle: 'split' });
    expect(state.panels.map((p) => p.diffStyle)).toEqual(['split', 'unified']);
  });
});

describe('theme', () => {
  it('cycles system, light, dark', () => {
    expect(nextTheme('system')).toBe('light');
    expect(nextTheme('light')).toBe('dark');
    expect(nextTheme('dark')).toBe('system');
    const state = reduce({ ...initialState, theme: 'dark' }, { type: 'cycleTheme' });
    expect(state.theme).toBe('system');
  });
});

describe('comments', () => {
  it('replaces, adds, updates and deletes comments', () => {
    let state = reduce(initialState, { type: 'setComments', comments: [comment] });
    expect(state.comments).toEqual([comment]);
    const second = { ...comment, id: 'c2', target: { kind: 'summary' as const } };
    state = reduce(state, { type: 'addComment', comment: second });
    expect(state.comments.map((c) => c.id)).toEqual(['c1', 'c2']);
    state = reduce(state, {
      type: 'updateComment',
      id: 'c1',
      body: 'edited',
      updatedAt: '2026-09-11T11:00:00.000Z',
    });
    expect(state.comments[0]).toMatchObject({
      body: 'edited',
      updatedAt: '2026-09-11T11:00:00.000Z',
    });
    expect(state.comments[0]!.createdAt).toBe(comment.createdAt);
    state = reduce(state, { type: 'deleteComment', id: 'c1' });
    expect(state.comments.map((c) => c.id)).toEqual(['c2']);
  });
});

describe('viewed state', () => {
  it('starts empty', () => {
    expect(initialState.viewed).toEqual({ paths: [], anchors: [] });
  });

  it('records the path of every opened panel once', () => {
    let state = open(initialState, 'b.ts');
    state = open(state, 'b.ts');
    state = open(state, 'a.ts', { side: 'new', start: 1, end: 2 });
    expect(state.viewed.paths).toEqual(['b.ts', 'a.ts']);
  });

  it('records the anchor key when an open comes from a highlight', () => {
    let state = reduce(initialState, {
      type: 'openPanel',
      path: 'a.ts',
      range: { side: 'new', start: 1, end: 2 },
      anchorKey: 'a.ts#new:1-2',
    });
    state = reduce(state, { type: 'openPanel', path: 'a.ts', anchorKey: 'a.ts#new:1-2' });
    state = reduce(state, { type: 'openPanel', path: 'a.ts' });
    expect(state.viewed.anchors).toEqual(['a.ts#new:1-2']);
  });

  it('keeps viewed state when panels close', () => {
    let state = open(initialState, 'a.ts');
    state = reduce(state, { type: 'closePanel', path: 'a.ts' });
    expect(state.viewed.paths).toEqual(['a.ts']);
  });

  it('can be hydrated from a saved snapshot', () => {
    const state = reduce(initialState, {
      type: 'hydrateViewed',
      viewed: { paths: ['a.ts'], anchors: ['a.ts#new:1-2'] },
    });
    expect(state.viewed).toEqual({ paths: ['a.ts'], anchors: ['a.ts#new:1-2'] });
  });
});
