import { useEffect } from 'react';
import { countComments } from '../../shared/comments.js';
import { useStore } from '../state/store.jsx';

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? '' : 's'}`;
}

export function describeCounts(counts: ReturnType<typeof countComments>): string {
  if (counts.total === 0) return 'No comments yet';
  let text = plural(counts.total, 'comment');
  if (counts.files > 0) text += ` in ${plural(counts.files, 'file')}`;
  if (counts.summary > 0) text += `, ${counts.summary} on summary`;
  return text;
}

interface FinishDialogProps {
  onCancel: () => void;
  onConfirm: () => void;
  busy: boolean;
}

export function FinishDialog({ onCancel, onConfirm, busy }: FinishDialogProps) {
  const { state } = useStore();
  const counts = countComments(state.comments);

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/30 p-4"
      onClick={onCancel}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="finish-title"
        data-testid="finish-dialog"
        onClick={(event) => event.stopPropagation()}
        className="w-full max-w-sm rounded-lg border border-neutral-200 bg-white p-5 shadow-xl dark:border-neutral-700 dark:bg-neutral-900"
      >
        <h2 id="finish-title" className="text-base font-semibold">
          Finish review?
        </h2>
        <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-300">
          {describeCounts(counts)}
        </p>
        <p className="mt-1 text-xs text-neutral-500">
          The comments are handed back to the agent and this server shuts down.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            data-testid="finish-cancel"
            onClick={onCancel}
            className="rounded-md px-3 py-1.5 text-sm hover:bg-neutral-100 dark:hover:bg-neutral-800"
          >
            Cancel
          </button>
          <button
            type="button"
            data-testid="finish-confirm"
            onClick={onConfirm}
            disabled={busy}
            autoFocus
            className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-60 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-white"
          >
            {busy ? 'Finishing…' : 'Finish review'}
          </button>
        </div>
      </div>
    </div>
  );
}
