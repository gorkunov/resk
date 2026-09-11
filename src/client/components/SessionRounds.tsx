import type { SessionRound } from '../../shared/types.js';
import { roundDate, roundLabel } from '../round-label.js';
import { useStore } from '../state/store.jsx';
import { Markdown } from './Markdown.jsx';

interface RoundSectionProps {
  round: number;
  summary: string;
  meta: string;
  current: boolean;
  first: boolean;
}

function RoundSection({ round, summary, meta, current, first }: RoundSectionProps) {
  return (
    <section
      data-testid="round-section"
      data-round={round}
      data-current={current ? 'true' : undefined}
      className={first ? '' : 'mt-12 border-t border-neutral-200 pt-10 dark:border-neutral-800'}
    >
      <header className="mb-6">
        <h1 data-testid="round-title" className="text-2xl font-semibold tracking-tight">
          {roundLabel(round)}
        </h1>
        <p data-testid="round-meta" className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
          {meta}
        </p>
      </header>
      <Markdown source={summary} />
    </section>
  );
}

function reviewedMeta(round: SessionRound): string {
  const comments = `${round.commentCount} comment${round.commentCount === 1 ? '' : 's'}`;
  return `Reviewed ${roundDate(round.finishedAt)} · ${comments}`;
}

/**
 * The summary text of this review. In a session's follow-up rounds the current round comes
 * first, then the finished rounds newest first, down to the initial round.
 */
export function SessionRounds() {
  const { review } = useStore();
  const session = review.session;
  if (!session || session.previous.length === 0) return <Markdown source={review.summary} />;

  const finished = [...session.previous].sort((a, b) => b.number - a.number);
  return (
    <>
      <RoundSection
        round={session.round}
        summary={review.summary}
        meta={`Current round · started ${roundDate(session.startedAt)}`}
        current
        first
      />
      {finished.map((round) => (
        <RoundSection
          key={round.number}
          round={round.number}
          summary={round.summary}
          meta={reviewedMeta(round)}
          current={false}
          first={false}
        />
      ))}
    </>
  );
}
