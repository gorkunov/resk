import type { Comment, Side } from '../../shared/types.js';

export type Theme = 'system' | 'light' | 'dark';
export type DiffStyle = 'unified' | 'split';

export interface Range {
  side: Side;
  start: number;
  end: number;
}

export interface Focus extends Range {
  nonce: number;
}

export interface PanelState {
  path: string;
  diffStyle: DiffStyle;
  focus?: Focus;
}

/** What the reviewer has looked at: opened file paths and clicked highlight anchors. */
export interface Viewed {
  paths: string[];
  anchors: string[];
}

export interface AppState {
  /** Open panels, always in diff order. */
  panels: PanelState[];
  /**
   * True once a panel has been opened. The summary-only layout never comes back, so closing the
   * last panel does not move the summary around under the reviewer.
   */
  splitLayout: boolean;
  viewed: Viewed;
  /** Panel the diff column should scroll to; the nonce changes on every request. */
  scrollTarget?: { path: string; nonce: number };
  theme: Theme;
  comments: Comment[];
}

export type Action =
  | { type: 'openPanel'; path: string; range?: Range; anchorKey?: string }
  | { type: 'hydrateViewed'; viewed: Viewed }
  | { type: 'closePanel'; path: string }
  | { type: 'setDiffStyle'; path: string; diffStyle: DiffStyle }
  | { type: 'cycleTheme' }
  | { type: 'setTheme'; theme: Theme }
  | { type: 'setComments'; comments: Comment[] }
  | { type: 'addComment'; comment: Comment }
  | { type: 'updateComment'; id: string; body: string; updatedAt: string }
  | { type: 'deleteComment'; id: string };

export const initialState: AppState = {
  panels: [],
  splitLayout: false,
  viewed: { paths: [], anchors: [] },
  theme: 'system',
  comments: [],
};

const THEME_CYCLE: Theme[] = ['system', 'light', 'dark'];

export function nextTheme(theme: Theme): Theme {
  return THEME_CYCLE[(THEME_CYCLE.indexOf(theme) + 1) % THEME_CYCLE.length]!;
}

function rank(path: string, order: string[]): number {
  const index = order.indexOf(path);
  return index === -1 ? Number.MAX_SAFE_INTEGER : index;
}

function addUnique(list: string[], value: string | undefined): string[] {
  return value === undefined || list.includes(value) ? list : [...list, value];
}

function markViewed(viewed: Viewed, path: string, anchorKey: string | undefined): Viewed {
  const paths = addUnique(viewed.paths, path);
  const anchors = addUnique(viewed.anchors, anchorKey);
  return paths === viewed.paths && anchors === viewed.anchors ? viewed : { paths, anchors };
}

function sortPanels(panels: PanelState[], order: string[]): PanelState[] {
  return [...panels].sort((a, b) => rank(a.path, order) - rank(b.path, order));
}

/** Pure state transition. `order` is the list of display paths in diff order. */
export function reduce(state: AppState, action: Action, order: string[]): AppState {
  switch (action.type) {
    case 'openPanel': {
      const nonce = (state.scrollTarget?.nonce ?? 0) + 1;
      const existing = state.panels.find((p) => p.path === action.path);
      let panels: PanelState[];
      if (existing) {
        const updated: PanelState = action.range
          ? { ...existing, focus: { ...action.range, nonce } }
          : existing;
        panels = state.panels.map((p) => (p === existing ? updated : p));
      } else {
        const created: PanelState = { path: action.path, diffStyle: 'unified' };
        if (action.range) created.focus = { ...action.range, nonce };
        panels = sortPanels([...state.panels, created], order);
      }
      return {
        ...state,
        panels,
        splitLayout: true,
        scrollTarget: { path: action.path, nonce },
        viewed: markViewed(state.viewed, action.path, action.anchorKey),
      };
    }
    case 'hydrateViewed':
      return { ...state, viewed: action.viewed };
    case 'closePanel': {
      if (!state.panels.some((p) => p.path === action.path)) return state;
      return { ...state, panels: state.panels.filter((p) => p.path !== action.path) };
    }
    case 'setDiffStyle':
      return {
        ...state,
        panels: state.panels.map((p) =>
          p.path === action.path ? { ...p, diffStyle: action.diffStyle } : p,
        ),
      };
    case 'cycleTheme':
      return { ...state, theme: nextTheme(state.theme) };
    case 'setTheme':
      return { ...state, theme: action.theme };
    case 'setComments':
      return { ...state, comments: action.comments };
    case 'addComment':
      return { ...state, comments: [...state.comments, action.comment] };
    case 'updateComment':
      return {
        ...state,
        comments: state.comments.map((c) =>
          c.id === action.id ? { ...c, body: action.body, updatedAt: action.updatedAt } : c,
        ),
      };
    case 'deleteComment':
      return { ...state, comments: state.comments.filter((c) => c.id !== action.id) };
  }
}
