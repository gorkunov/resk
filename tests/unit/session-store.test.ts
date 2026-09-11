import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  SessionStore,
  SessionStoreError,
  sessionRoot,
  sessionSlug,
} from '../../src/cli/session-store.js';
import type { Comment } from '../../src/shared/types.js';

const comment: Comment = {
  id: 'c1',
  target: { kind: 'summary-selection', quote: 'rate limit', start: 3, end: 13 },
  body: 'Which limit applies?',
  createdAt: '2026-09-11T10:00:00.000Z',
  updatedAt: '2026-09-11T10:00:00.000Z',
};

describe('sessionRoot', () => {
  it('defaults to ~/.resk', () => {
    expect(sessionRoot({})).toBe(join(homedir(), '.resk'));
  });

  it('honours RESK_HOME', () => {
    expect(sessionRoot({ RESK_HOME: '/tmp/resk-home' })).toBe('/tmp/resk-home');
    expect(sessionRoot({ RESK_HOME: '   ' })).toBe(join(homedir(), '.resk'));
  });
});

describe('sessionSlug', () => {
  it('keeps safe characters and replaces the rest', () => {
    expect(sessionSlug('feat/refresh tokens')).toBe('feat-refresh-tokens');
    expect(sessionSlug('auth.v2_final-1')).toBe('auth.v2_final-1');
  });

  it('never yields a hidden or empty file name', () => {
    expect(sessionSlug('../../etc')).toBe('etc');
    expect(sessionSlug('///')).toBe('session');
  });
});

describe('SessionStore', () => {
  let root: string;
  let store: SessionStore;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'resk-store-'));
    store = new SessionStore(root);
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('loads an empty session when nothing was stored', async () => {
    await expect(store.load('demo')).resolves.toEqual({ key: 'demo', rounds: [] });
  });

  it('numbers appended rounds and persists them as JSON', async () => {
    const first = await store.appendRound('demo', {
      summary: '# Round one',
      comments: [comment],
      finishedAt: '2026-09-11T10:05:00.000Z',
    });
    expect(first.number).toBe(1);
    const second = await store.appendRound('demo', {
      summary: 'Update',
      comments: [],
      finishedAt: '2026-09-11T11:00:00.000Z',
    });
    expect(second.number).toBe(2);

    const loaded = await store.load('demo');
    expect(loaded.rounds.map((r) => [r.number, r.summary, r.comments.length])).toEqual([
      [1, '# Round one', 1],
      [2, 'Update', 0],
    ]);
    const onDisk = JSON.parse(readFileSync(join(root, 'sessions', 'demo.json'), 'utf8'));
    expect(onDisk.key).toBe('demo');
    expect(onDisk.rounds[0].comments[0]).toEqual(comment);
  });

  it('stores each key in its own file named after the slug', async () => {
    await store.appendRound('feat/one', { summary: 'a', comments: [], finishedAt: 't' });
    await store.appendRound('feat/two', { summary: 'b', comments: [], finishedAt: 't' });
    expect(store.pathFor('feat/one')).toBe(join(root, 'sessions', 'feat-one.json'));
    expect((await store.load('feat/one')).rounds).toHaveLength(1);
    expect((await store.load('feat/two')).rounds[0]!.summary).toBe('b');
  });

  it('rejects a corrupt session file with a readable error', async () => {
    mkdirSync(join(root, 'sessions'), { recursive: true });
    writeFileSync(join(root, 'sessions', 'demo.json'), '{not json');
    await expect(store.load('demo')).rejects.toBeInstanceOf(SessionStoreError);
    await expect(store.load('demo')).rejects.toThrow(/demo\.json/);

    writeFileSync(join(root, 'sessions', 'demo.json'), JSON.stringify({ rounds: 'nope' }));
    await expect(store.load('demo')).rejects.toThrow(/unexpected shape/);
  });
});
