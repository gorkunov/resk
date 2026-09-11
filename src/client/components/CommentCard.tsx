import { useState } from 'react';
import type { Comment } from '../../shared/types.js';
import { relativeTime, targetLabel } from '../comment-utils.js';
import { useStore } from '../state/store.jsx';
import { CommentComposer } from './CommentComposer.jsx';

export function CommentCard({ comment }: { comment: Comment }) {
  const { dispatch } = useStore();
  const [editing, setEditing] = useState(false);
  const label = targetLabel(comment.target);

  return (
    <div
      data-testid="comment-card"
      data-target={label}
      data-comment-id={comment.id}
      className="my-1 rounded-md border border-amber-200 bg-amber-50/70 p-2 text-sm dark:border-amber-900/60 dark:bg-amber-950/30"
    >
      {editing ? (
        <CommentComposer
          target={label}
          initialBody={comment.body}
          submitLabel="Save"
          onSubmit={(body) => {
            dispatch({
              type: 'updateComment',
              id: comment.id,
              body,
              updatedAt: new Date().toISOString(),
            });
            setEditing(false);
          }}
          onCancel={() => setEditing(false)}
        />
      ) : (
        <>
          <div className="mb-1 flex items-center gap-2 text-xs text-neutral-500">
            <span className="font-medium text-neutral-700 dark:text-neutral-300">you</span>
            <span title={comment.updatedAt}>{relativeTime(comment.updatedAt)}</span>
            <span className="ml-auto flex gap-1">
              <button
                type="button"
                data-testid="comment-edit"
                onClick={() => setEditing(true)}
                className="rounded px-1.5 py-0.5 hover:bg-amber-100 dark:hover:bg-amber-900/50"
              >
                Edit
              </button>
              <button
                type="button"
                data-testid="comment-delete"
                onClick={() => dispatch({ type: 'deleteComment', id: comment.id })}
                className="rounded px-1.5 py-0.5 hover:bg-amber-100 dark:hover:bg-amber-900/50"
              >
                Delete
              </button>
            </span>
          </div>
          <p className="whitespace-pre-wrap font-sans leading-5">{comment.body}</p>
        </>
      )}
    </div>
  );
}
