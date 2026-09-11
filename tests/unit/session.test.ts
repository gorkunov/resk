import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ReviewSession } from '../../src/server/session.js';
import type { Comment } from '../../src/shared/types.js';

const c1: Comment = {
  id: 'c1',
  target: { kind: 'summary' },
  body: 'x',
  createdAt: '2026-09-11T10:00:00.000Z',
  updatedAt: '2026-09-11T10:00:00.000Z',
};

describe('ReviewSession', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('stores comments', () => {
    const session = new ReviewSession({ onFinish: () => {}, graceMs: 5000, keepAlive: false });
    expect(session.comments).toEqual([]);
    session.setComments([c1]);
    expect(session.comments).toEqual([c1]);
  });

  it('finishes once with the collected comments', () => {
    const onFinish = vi.fn();
    const session = new ReviewSession({ onFinish, graceMs: 5000, keepAlive: false });
    session.setComments([c1]);
    session.finish();
    session.finish();
    expect(onFinish).toHaveBeenCalledTimes(1);
    expect(onFinish).toHaveBeenCalledWith([c1]);
    expect(session.finished).toBe(true);
  });

  it('finishes after the grace period once the last client disconnects', () => {
    const onFinish = vi.fn();
    const session = new ReviewSession({ onFinish, graceMs: 5000, keepAlive: false });
    const disconnectA = session.clientConnected();
    const disconnectB = session.clientConnected();
    expect(session.clientCount).toBe(2);
    disconnectA();
    vi.advanceTimersByTime(10_000);
    expect(onFinish).not.toHaveBeenCalled();
    disconnectB();
    vi.advanceTimersByTime(4_999);
    expect(onFinish).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onFinish).toHaveBeenCalledTimes(1);
  });

  it('cancels the pending exit when a client reconnects in time', () => {
    const onFinish = vi.fn();
    const session = new ReviewSession({ onFinish, graceMs: 5000, keepAlive: false });
    session.clientConnected()();
    vi.advanceTimersByTime(3_000);
    const disconnect = session.clientConnected();
    vi.advanceTimersByTime(10_000);
    expect(onFinish).not.toHaveBeenCalled();
    disconnect();
    vi.advanceTimersByTime(5_000);
    expect(onFinish).toHaveBeenCalledTimes(1);
  });

  it('never auto-finishes with keepAlive', () => {
    const onFinish = vi.fn();
    const session = new ReviewSession({ onFinish, graceMs: 5000, keepAlive: true });
    session.clientConnected()();
    vi.advanceTimersByTime(60_000);
    expect(onFinish).not.toHaveBeenCalled();
    session.finish();
    expect(onFinish).toHaveBeenCalledTimes(1);
  });

  it('does not start a timer before any client has connected', () => {
    const onFinish = vi.fn();
    new ReviewSession({ onFinish, graceMs: 5000, keepAlive: false });
    vi.advanceTimersByTime(60_000);
    expect(onFinish).not.toHaveBeenCalled();
  });

  it('ignores disconnects called twice', () => {
    const onFinish = vi.fn();
    const session = new ReviewSession({ onFinish, graceMs: 5000, keepAlive: false });
    const a = session.clientConnected();
    const b = session.clientConnected();
    a();
    a();
    expect(session.clientCount).toBe(1);
    vi.advanceTimersByTime(10_000);
    expect(onFinish).not.toHaveBeenCalled();
    b();
    vi.advanceTimersByTime(5_000);
    expect(onFinish).toHaveBeenCalledTimes(1);
  });
});
