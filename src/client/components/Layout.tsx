import { useState } from 'react';
import { useStore } from '../state/store.jsx';
import { TopBar } from './TopBar.jsx';
import { SummaryPane } from './SummaryPane.jsx';
import { DiffColumn } from './DiffColumn.jsx';

export function Layout() {
  const { state } = useStore();
  const [summaryComposerOpen, setSummaryComposerOpen] = useState(false);
  const panelCount = state.panels.length;
  const hasPanels = panelCount > 0;

  return (
    <div className="flex h-full flex-col" data-testid="layout" data-panels={panelCount}>
      <TopBar onCommentSummary={() => setSummaryComposerOpen(true)} />
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
    </div>
  );
}
