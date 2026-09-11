import { useEffect, useRef, useState, type KeyboardEvent } from 'react';

interface CommentComposerProps {
  /** Label of the target, exposed as data-target for tests and styling. */
  target: string;
  initialBody?: string;
  submitLabel?: string;
  onSubmit: (body: string) => void;
  onCancel: () => void;
}

export function CommentComposer({
  target,
  initialBody = '',
  submitLabel = 'Add comment',
  onSubmit,
  onCancel,
}: CommentComposerProps) {
  const [body, setBody] = useState(initialBody);
  const ref = useRef<HTMLTextAreaElement>(null);
  const trimmed = body.trim();

  useEffect(() => {
    ref.current?.focus();
  }, []);

  const submit = (): void => {
    if (trimmed === '') return;
    onSubmit(trimmed);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (event.key === 'Escape') {
      event.preventDefault();
      onCancel();
    } else if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      submit();
    }
  };

  return (
    <form
      data-testid="comment-composer"
      data-target={target}
      className="my-1 flex flex-col gap-2 rounded-md border border-sky-200 bg-white p-2 text-sm shadow-sm dark:border-sky-900 dark:bg-neutral-900"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <textarea
        ref={ref}
        value={body}
        onChange={(event) => setBody(event.target.value)}
        onKeyDown={onKeyDown}
        rows={3}
        placeholder="Leave a comment… (⌘/Ctrl+Enter to submit, Esc to cancel)"
        className="w-full resize-y rounded border border-neutral-200 bg-white px-2 py-1.5 font-sans text-sm leading-5 outline-none focus:border-sky-400 dark:border-neutral-700 dark:bg-neutral-950"
      />
      <div className="flex justify-end gap-2">
        <button
          type="button"
          data-testid="composer-cancel"
          onClick={onCancel}
          className="rounded px-2.5 py-1 text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800"
        >
          Cancel
        </button>
        <button
          type="submit"
          data-testid="composer-submit"
          disabled={trimmed === ''}
          className="rounded bg-sky-600 px-2.5 py-1 font-medium text-white hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitLabel}
        </button>
      </div>
    </form>
  );
}
