import { useCallback, useState } from 'react';
import { postFinish } from '../api.js';
import { useStore } from '../state/store.jsx';
import { TopBar } from './TopBar.jsx';
import { SummaryPane } from './SummaryPane.jsx';
import { DiffColumn } from './DiffColumn.jsx';
import { FinishDialog } from './FinishDialog.jsx';

export function Layout({ onFinished }: { onFinished: () => void }) {
  const { state, syncError } = useStore();
  const [summaryComposerOpen, setSummaryComposerOpen] = useState(false);
  const [finishOpen, setFinishOpen] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [finishError, setFinishError] = useState<string | undefined>(undefined);

  const closeFinish = useCallback(() => setFinishOpen(false), []);
  const confirmFinish = useCallback(() => {
    setFinishing(true);
    postFinish()
      .then(onFinished)
      .catch((error: Error) => {
        setFinishing(false);
        setFinishError(error.message);
      });
  }, [onFinished]);
  const panelCount = state.panels.length;
  const hasPanels = panelCount > 0;

  return (
    <div className="flex h-full flex-col" data-testid="layout" data-panels={panelCount}>
      <TopBar
        onCommentSummary={() => setSummaryComposerOpen(true)}
        onFinish={() => {
          setFinishError(undefined);
          setFinishOpen(true);
        }}
      />
      {syncError && (
        <div
          role="alert"
          data-testid="sync-error"
          className="bg-amber-50 px-4 py-2 text-sm text-amber-900 dark:bg-amber-950/50 dark:text-amber-200"
        >
          Comments could not be saved ({syncError}). They will be retried on your next change.
        </div>
      )}
      {finishError && (
        <div
          role="alert"
          className="bg-rose-50 px-4 py-2 text-sm text-rose-800 dark:bg-rose-950/50 dark:text-rose-300"
        >
          Could not finish the review: {finishError}
        </div>
      )}
      <div className="flex min-h-0 flex-1">
        <div
          className={
            hasPanels
              ? 'w-[440px] shrink-0 overflow-y-auto border-r border-neutral-200 transition-[width] duration-200 dark:border-neutral-800'
              : 'w-full overflow-y-auto transition-[width] duration-200'
          }
        >
          <div className={hasPanels ? 'px-6 py-6' : 'mx-auto max-w-3xl px-6 py-10'}>
            <SummaryPane
              composerOpen={summaryComposerOpen}
              onCloseComposer={() => setSummaryComposerOpen(false)}
            />
          </div>
        </div>
        {hasPanels && (
          <div
            className="min-w-0 flex-1 overflow-y-auto bg-neutral-50 dark:bg-neutral-900/40"
            data-testid="diff-column"
          >
            <DiffColumn />
          </div>
        )}
      </div>
      {finishOpen && (
        <FinishDialog onCancel={closeFinish} onConfirm={confirmFinish} busy={finishing} />
      )}
    </div>
  );
}
