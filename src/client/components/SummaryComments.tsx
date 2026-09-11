import { newComment } from '../comment-utils.js';
import { useStore } from '../state/store.jsx';
import { CommentCard } from './CommentCard.jsx';
import { CommentComposer } from './CommentComposer.jsx';

interface SummaryCommentsProps {
  composerOpen: boolean;
  onCloseComposer: () => void;
}

export function SummaryComments({ composerOpen, onCloseComposer }: SummaryCommentsProps) {
  const { state, dispatch } = useStore();
  const comments = state.comments.filter(
    (c) => c.target.kind === 'summary' || c.target.kind === 'summary-selection',
  );
  if (comments.length === 0 && !composerOpen) return null;

  return (
    <section data-testid="summary-comments" className="mb-6">
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">
        Summary comments
      </h2>
      {comments.map((comment) => (
        <CommentCard key={comment.id} comment={comment} />
      ))}
      {composerOpen && (
        <CommentComposer
          target="summary"
          onSubmit={(body) => {
            dispatch({ type: 'addComment', comment: newComment({ kind: 'summary' }, body) });
            onCloseComposer();
          }}
          onCancel={onCloseComposer}
        />
      )}
    </section>
  );
}
