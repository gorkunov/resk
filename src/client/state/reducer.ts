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

/** What the reviewer has looked at: the files whose panel has been opened. */
export interface Viewed {
  paths: string[];
}

export interface AppState {
  /** Open panels, always in diff order. */
  panels: PanelState[];
  /**
   * True once a panel has been opened. The summary-only layout never comes back, so closing the
   * last panel does not move the summary around under the reviewer.
   */
  splitLayout: boolean;
  /** Panel the reviewer is looking at; a newly opened file lands right below it. */
  visiblePath?: string;
  viewed: Viewed;
  /** Panel the diff column should scroll to; the nonce changes on every request. */
  scrollTarget?: { path: string; nonce: number };
  theme: Theme;
  comments: Comment[];
}

export type Action =
  | { type: 'openPanel'; path: string; range?: Range }
  | { type: 'setVisiblePanel'; path: string | undefined }
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
  viewed: { paths: [] },
  theme: 'system',
  comments: [],
};

const THEME_CYCLE: Theme[] = ['system', 'light', 'dark'];

export function nextTheme(theme: Theme): Theme {
  return THEME_CYCLE[(THEME_CYCLE.indexOf(theme) + 1) % THEME_CYCLE.length]!;
}

function addUnique(list: string[], value: string | undefined): string[] {
  return value === undefined || list.includes(value) ? list : [...list, value];
}

function markViewed(viewed: Viewed, path: string): Viewed {
  const paths = addUnique(viewed.paths, path);
  return paths === viewed.paths ? viewed : { paths };
}

/**
 * A new panel goes directly below the one in view, so the file you just opened is the next thing
 * you read. With nothing in view it goes to the bottom.
 */
function insertPanel(
  panels: PanelState[],
  panel: PanelState,
  visiblePath: string | undefined,
): PanelState[] {
  const index = visiblePath === undefined ? -1 : panels.findIndex((p) => p.path === visiblePath);
  if (index === -1) return [...panels, panel];
  return [...panels.slice(0, index + 1), panel, ...panels.slice(index + 1)];
}

/** Pure state transition. */
export function reduce(state: AppState, action: Action): AppState {
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
        panels = insertPanel(state.panels, created, state.visiblePath);
      }
      return {
        ...state,
        panels,
        splitLayout: true,
        visiblePath: action.path,
        scrollTarget: { path: action.path, nonce },
        viewed: markViewed(state.viewed, action.path),
      };
    }
    case 'setVisiblePanel': {
      if (state.visiblePath === action.path) return state;
      const next = { ...state };
      if (action.path === undefined) delete next.visiblePath;
      else next.visiblePath = action.path;
      return next;
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
