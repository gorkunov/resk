import type { FileChange } from '../../shared/types.js';
import { commentsForPath } from '../../shared/comments.js';
import { useStore } from '../state/store.jsx';
import { CommentDot } from './CommentDot.jsx';

const STATUS_LABEL: Record<FileChange['status'], string> = {
  added: 'A',
  modified: 'M',
  deleted: 'D',
  renamed: 'R',
};

const STATUS_TONE: Record<FileChange['status'], string> = {
  added: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-300',
  modified: 'bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-300',
  deleted: 'bg-rose-100 text-rose-800 dark:bg-rose-900/60 dark:text-rose-300',
  renamed: 'bg-violet-100 text-violet-800 dark:bg-violet-900/60 dark:text-violet-300',
};

export function StatusBadge({ file }: { file: FileChange }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span
        className={`inline-grid h-5 w-5 place-items-center rounded text-[11px] font-bold ${STATUS_TONE[file.status]}`}
        title={file.status}
      >
        {STATUS_LABEL[file.status]}
      </span>
      {file.binary && (
        <span className="rounded bg-neutral-200 px-1 text-[10px] font-medium uppercase text-neutral-700 dark:bg-neutral-700 dark:text-neutral-200">
          binary
        </span>
      )}
    </span>
  );
}

export function Stats({ file }: { file: FileChange }) {
  return (
    <span className="font-mono text-xs tabular-nums">
      <span className="text-emerald-600 dark:text-emerald-400">+{file.additions}</span>{' '}
      <span className="text-rose-600 dark:text-rose-400">−{file.deletions}</span>
    </span>
  );
}

export function ChangedFiles() {
  const { review, state, dispatch } = useStore();
  return (
    <section className="mt-10 border-t border-neutral-200 pt-6 dark:border-neutral-800">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-neutral-500">
        Changed files ({review.files.length})
      </h2>
      {review.files.length === 0 && <p className="text-sm text-neutral-500">No changes.</p>}
      <ul className="flex flex-col gap-1">
        {review.files.map((file) => {
          const isOpen = state.panels.some((p) => p.path === file.path);
          const hasComments = commentsForPath(state.comments, file.path).length > 0;
          const reviewed = state.viewed.paths.includes(file.path);
          return (
            <li key={file.path}>
              <button
                type="button"
                data-testid="file-row"
                data-path={file.path}
                data-open={isOpen ? 'true' : 'false'}
                data-reviewed={reviewed ? 'true' : 'false'}
                onClick={() => dispatch({ type: 'openPanel', path: file.path })}
                className={`relative flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-left text-sm hover:bg-neutral-100 dark:hover:bg-neutral-800 ${
                  isOpen ? 'bg-sky-50 ring-1 ring-sky-200 dark:bg-sky-950/40 dark:ring-sky-900' : ''
                }`}
              >
                <StatusBadge file={file} />
                <span className="min-w-0 flex-1 truncate font-mono text-[13px]">
                  {file.path}
                  {file.oldPath && <span className="ml-2 text-neutral-500">← {file.oldPath}</span>}
                </span>
                {reviewed && (
                  <span
                    data-testid="reviewed-check"
                    title="Reviewed"
                    aria-label="reviewed"
                    className="text-xs font-bold text-emerald-600 dark:text-emerald-400"
                  >
                    ✓
                  </span>
                )}
                <Stats file={file} />
                {hasComments && <CommentDot className="static ml-1 ring-0" />}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
