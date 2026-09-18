import { beforeEach, describe, expect, it } from 'vitest';
import { loadViewed, viewedStorageKey } from '../../src/client/state/viewed-storage.js';
import type { ReviewPayload } from '../../src/shared/types.js';

const base: ReviewPayload = { title: 'demo', summary: '# S', files: [], expandable: false };

// Node 26 shadows jsdom's localStorage with an unavailable built-in, so stub the global directly.
const store = new Map<string, string>();
const storage = {
  getItem: (key: string) => store.get(key) ?? null,
  setItem: (key: string, value: string) => void store.set(key, value),
  removeItem: (key: string) => void store.delete(key),
  clear: () => store.clear(),
  key: (index: number) => [...store.keys()][index] ?? null,
  get length() {
    return store.size;
  },
};
Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true });

beforeEach(() => store.clear());

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

describe('loadViewed', () => {
  it('reads the stored file list', () => {
    storage.setItem(viewedStorageKey(base), JSON.stringify({ paths: ['a.ts'] }));
    expect(loadViewed(base)).toEqual({ paths: ['a.ts'] });
  });

  it('accepts an entry written before reviewed state became file-level', () => {
    const stored = { paths: ['a.ts'], anchors: ['a.ts#new:1-2'] };
    storage.setItem(viewedStorageKey(base), JSON.stringify(stored));
    expect(loadViewed(base)).toEqual({ paths: ['a.ts'] });
  });

  it('ignores anything else', () => {
    storage.setItem(viewedStorageKey(base), 'not json');
    expect(loadViewed(base)).toBeUndefined();
    storage.setItem(viewedStorageKey(base), JSON.stringify({ paths: [1] }));
    expect(loadViewed(base)).toBeUndefined();
  });
});
