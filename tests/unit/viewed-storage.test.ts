import { describe, expect, it } from 'vitest';
import { viewedStorageKey } from '../../src/client/state/viewed-storage.js';
import type { ReviewPayload } from '../../src/shared/types.js';

const base: ReviewPayload = { title: 'demo', summary: '# S', files: [], expandable: false };

describe('viewedStorageKey', () => {
  it('is stable for the same review', () => {
    expect(viewedStorageKey(base)).toBe(viewedStorageKey({ ...base }));
  });

  it('differs between rounds of the same session', () => {
    const round1 = { ...base, session: { key: 'demo', round: 1, startedAt: 't', previous: [] } };
    const round2 = {
      ...base,
      session: {
        key: 'demo',
        round: 2,
        startedAt: 't',
        previous: [{ number: 1, summary: '# S', finishedAt: 't', commentCount: 0 }],
      },
    };
    expect(viewedStorageKey(round1)).not.toBe(viewedStorageKey(round2));
  });
});
