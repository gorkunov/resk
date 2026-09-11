import { useStore } from '../state/store.jsx';
import { Markdown } from './Markdown.jsx';
import { ChangedFiles } from './ChangedFiles.jsx';

export function SummaryPane() {
  const { review } = useStore();
  return (
    <section data-testid="summary">
      <Markdown source={review.summary} />
      <ChangedFiles />
    </section>
  );
}
