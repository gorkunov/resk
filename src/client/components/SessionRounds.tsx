import { useEffect, useRef } from 'react';
import type { SessionRound } from '../../shared/types.js';
import { useStore } from '../state/store.jsx';
import { Markdown } from './Markdown.jsx';

/** Fixed format so the header text, which selection offsets index, is stable across reloads. */
function reviewedOn(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

interface UpdateSectionProps {
  number: number;
  summary: string;
  current: boolean;
  finished?: Pick<SessionRound, 'finishedAt' | 'commentCount'>;
}

function UpdateSection({ number, summary, current, finished }: UpdateSectionProps) {
  const ref = useRef<HTMLElement>(null);

  // A follow-up round opens on its own update; the earlier rounds stay above for reference.
  useEffect(() => {
    if (current) ref.current?.scrollIntoView({ block: 'start' });
  }, [current]);

  const note = finished
    ? `reviewed ${reviewedOn(finished.finishedAt)} · ${finished.commentCount} comment${
        finished.commentCount === 1 ? '' : 's'
      }`
    : 'this round';
  return (
    <section
      ref={ref}
      data-testid="update-section"
      data-update={number}
      data-current={current ? 'true' : undefined}
      className="mt-10 scroll-mt-4"
    >
      <div className="mb-4 flex items-center gap-3">
        <span
          data-testid="update-label"
          className={
            current
              ? 'rounded-full bg-sky-600 px-2.5 py-0.5 text-xs font-semibold text-white'
              : 'rounded-full bg-neutral-200 px-2.5 py-0.5 text-xs font-semibold text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300'
          }
        >
          Update {number}
        </span>
        <span className="text-xs text-neutral-500 dark:text-neutral-400">{note}</span>
        <hr className="flex-1 border-neutral-200 dark:border-neutral-800" />
      </div>
      <Markdown source={summary} />
    </section>
  );
}

/**
 * The summary text of this review: in a session's follow-up rounds the original summary comes
 * first, then every finished update, then the current update.
 */
export function SessionRounds() {
  const { review } = useStore();
  const previous = review.session?.previous ?? [];
  if (previous.length === 0) return <Markdown source={review.summary} />;

  const [original, ...updates] = previous as [SessionRound, ...SessionRound[]];
  return (
    <>
      <Markdown source={original.summary} />
      {updates.map((round) => (
        <UpdateSection
          key={round.number}
          number={round.number - 1}
          summary={round.summary}
          current={false}
          finished={round}
        />
      ))}
      <UpdateSection number={previous.length} summary={review.summary} current />
    </>
  );
}
