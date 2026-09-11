import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { Comment, ReviewPayload } from '../../shared/types.js';
import { putComments } from '../api.js';
import { applyTheme, loadTheme, saveTheme } from '../theme.js';
import { initialState, reduce, type Action, type AppState } from './reducer.js';

interface Store {
  review: ReviewPayload;
  state: AppState;
  dispatch: (action: Action) => void;
  /** Error from the last failed comment sync, if any. */
  syncError: string | undefined;
}

const StoreContext = createContext<Store | null>(null);

interface StoreProviderProps {
  review: ReviewPayload;
  initialComments: Comment[];
  children: ReactNode;
}

export function StoreProvider({ review, initialComments, children }: StoreProviderProps) {
  const order = useMemo(() => review.files.map((f) => f.path), [review.files]);
  const reducer = useCallback(
    (state: AppState, action: Action) => reduce(state, action, order),
    [order],
  );
  const [state, dispatch] = useReducer(reducer, undefined, () => ({
    ...initialState,
    theme: loadTheme(),
    comments: initialComments,
  }));
  const [syncError, setSyncError] = useState<string | undefined>(undefined);

  useEffect(() => {
    applyTheme(state.theme);
    saveTheme(state.theme);
  }, [state.theme]);

  useEffect(() => {
    if (state.theme !== 'system' || typeof matchMedia !== 'function') return;
    const media = matchMedia('(prefers-color-scheme: dark)');
    const onChange = (): void => applyTheme('system');
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, [state.theme]);

  const lastSynced = useRef<Comment[]>(initialComments);
  useEffect(() => {
    if (state.comments === lastSynced.current) return;
    const timer = setTimeout(() => {
      const snapshot = state.comments;
      putComments(snapshot)
        .then(() => {
          lastSynced.current = snapshot;
          setSyncError(undefined);
        })
        .catch((error: Error) => setSyncError(error.message));
    }, 150);
    return () => clearTimeout(timer);
  }, [state.comments]);

  const value = useMemo<Store>(
    () => ({ review, state, dispatch, syncError }),
    [review, state, syncError],
  );
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): Store {
  const store = useContext(StoreContext);
  if (!store) throw new Error('useStore must be used inside StoreProvider');
  return store;
}
