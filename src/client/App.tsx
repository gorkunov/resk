import { useCallback, useEffect, useState } from 'react';
import type { Comment, ReviewPayload } from '../shared/types.js';
import { connectEvents, fetchComments, fetchReview } from './api.js';
import { StoreProvider } from './state/store.jsx';
import { Layout } from './components/Layout.jsx';

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; review: ReviewPayload; comments: Comment[] };

export function App() {
  const [load, setLoad] = useState<LoadState>({ status: 'loading' });

  const start = useCallback(() => {
    setLoad({ status: 'loading' });
    Promise.all([fetchReview(), fetchComments()])
      .then(([review, comments]) => setLoad({ status: 'ready', review, comments }))
      .catch((error: Error) => setLoad({ status: 'error', message: error.message }));
  }, []);

  useEffect(start, [start]);
  useEffect(() => connectEvents(), []);

  if (load.status === 'loading') {
    return <div className="grid h-full place-items-center text-neutral-500">Loading review…</div>;
  }
  if (load.status === 'error') {
    return (
      <div className="grid h-full place-items-center">
        <div className="text-center" data-testid="load-error">
          <p className="mb-3 text-neutral-700 dark:text-neutral-300">
            Could not load the review: {load.message}
          </p>
          <button
            type="button"
            onClick={start}
            className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm text-white dark:bg-neutral-100 dark:text-neutral-900"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }
  return (
    <StoreProvider review={load.review} initialComments={load.comments}>
      <Layout />
    </StoreProvider>
  );
}
