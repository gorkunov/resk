import { useStore } from '../state/store.jsx';
import { Markdown } from './Markdown.jsx';
import { ChangedFiles } from './ChangedFiles.jsx';
import { SummaryComments } from './SummaryComments.jsx';

interface SummaryPaneProps {
  composerOpen: boolean;
  onCloseComposer: () => void;
}

export function SummaryPane({ composerOpen, onCloseComposer }: SummaryPaneProps) {
  const { review } = useStore();
  return (
    <section data-testid="summary">
      <SummaryComments composerOpen={composerOpen} onCloseComposer={onCloseComposer} />
      <Markdown source={review.summary} />
      <ChangedFiles />
    </section>
  );
}
