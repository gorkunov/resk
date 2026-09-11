import { useStore } from '../state/store.jsx';
import type { Theme } from '../state/reducer.js';

const THEME_ICON: Record<Theme, string> = { system: '◐', light: '☀', dark: '☾' };

interface TopBarProps {
  onFinish: () => void;
  finishing: boolean;
}

export function TopBar({ onFinish, finishing }: TopBarProps) {
  const { review, state, dispatch } = useStore();

  return (
    <header className="flex h-12 shrink-0 items-center gap-4 border-b border-neutral-200 bg-white px-4 dark:border-neutral-800 dark:bg-neutral-950">
      <span className="flex items-center gap-2 font-semibold tracking-tight">
        <img
          data-testid="app-icon"
          src="/icon-64.png"
          alt=""
          width={20}
          height={20}
          className="h-5 w-5"
        />
        resk
      </span>
      <span
        className="truncate text-sm text-neutral-600 dark:text-neutral-400"
        data-testid="review-title"
      >
        {review.title}
      </span>
      <div className="ml-auto flex items-center gap-2">
        <button
          type="button"
          data-testid="theme-toggle"
          data-theme={state.theme}
          aria-label={`Theme: ${state.theme}`}
          title={`Theme: ${state.theme}`}
          onClick={() => dispatch({ type: 'cycleTheme' })}
          className="grid h-8 w-8 place-items-center rounded-md text-base hover:bg-neutral-100 dark:hover:bg-neutral-800"
        >
          {THEME_ICON[state.theme]}
        </button>
        <button
          type="button"
          data-testid="finish-button"
          onClick={onFinish}
          disabled={finishing}
          className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-700 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-white"
        >
          {finishing ? 'Finishing…' : 'Finish review'}
        </button>
      </div>
    </header>
  );
}
