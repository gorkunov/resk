import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../../src/server/app.js';
import { ReviewSession } from '../../src/server/session.js';
import type { ReviewPayload } from '../../src/shared/types.js';

const review: ReviewPayload = { title: 'T', summary: '# S', files: [] };
const comment = {
  id: 'c1',
  target: { kind: 'summary' as const },
  body: 'hello',
  createdAt: '2026-09-11T10:00:00.000Z',
  updatedAt: '2026-09-11T10:00:00.000Z',
};

let clientDir: string;

beforeAll(() => {
  clientDir = mkdtempSync(join(tmpdir(), 'resk-client-'));
  writeFileSync(join(clientDir, 'index.html'), '<!doctype html><title>resk</title>');
  mkdirSync(join(clientDir, 'assets'));
  writeFileSync(join(clientDir, 'assets', 'app.js'), 'console.log(1)');
  writeFileSync(join(clientDir, 'assets', 'app.css'), 'body{}');
});

afterAll(() => rmSync(clientDir, { recursive: true, force: true }));

function build() {
  const session = new ReviewSession({ onFinish: () => {}, graceMs: 5000, keepAlive: true });
  const app = createApp({ review, session, clientDir });
  return { app, session };
}

describe('api', () => {
  it('serves the review payload', async () => {
    const { app } = build();
    const res = await app.request('/api/review');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(review);
  });

  it('round-trips comments', async () => {
    const { app, session } = build();
    expect(await (await app.request('/api/comments')).json()).toEqual([]);
    const put = await app.request('/api/comments', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify([comment]),
    });
    expect(put.status).toBe(200);
    expect(session.comments).toEqual([comment]);
    expect(await (await app.request('/api/comments')).json()).toEqual([comment]);
  });

  it('rejects invalid comment payloads and keeps the previous state', async () => {
    const { app, session } = build();
    session.setComments([comment]);
    const res = await app.request('/api/comments', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify([{ id: 'x' }]),
    });
    expect(res.status).toBe(400);
    expect(session.comments).toEqual([comment]);
    const notJson = await app.request('/api/comments', { method: 'PUT', body: 'nope' });
    expect(notJson.status).toBe(400);
  });

  it('finishes the session', async () => {
    const { app, session } = build();
    const res = await app.request('/api/finish', { method: 'POST' });
    expect(await res.json()).toEqual({ ok: true });
    expect(session.finished).toBe(true);
  });

  it('opens an event stream that counts as a connected client', async () => {
    const { app, session } = build();
    const res = await app.request('/api/events');
    expect(res.headers.get('content-type')).toMatch(/text\/event-stream/);
    const reader = res.body!.getReader();
    const { value } = await reader.read();
    expect(new TextDecoder().decode(value)).toContain('event: ready');
    expect(session.clientCount).toBe(1);
    await reader.cancel();
  });
});

describe('static files', () => {
  it('serves index.html at the root and as SPA fallback', async () => {
    const { app } = build();
    for (const path of ['/', '/some/client/route']) {
      const res = await app.request(path);
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toMatch(/text\/html/);
      expect(await res.text()).toContain('<title>resk</title>');
    }
  });

  it('serves assets with their content types', async () => {
    const { app } = build();
    const js = await app.request('/assets/app.js');
    expect(js.status).toBe(200);
    expect(js.headers.get('content-type')).toMatch(/javascript/);
    expect(await js.text()).toBe('console.log(1)');
    const css = await app.request('/assets/app.css');
    expect(css.headers.get('content-type')).toMatch(/text\/css/);
  });

  it('does not escape the client directory', async () => {
    const { app } = build();
    const res = await app.request('/assets/../../etc/passwd');
    expect(res.status).not.toBe(500);
    expect((await res.text()).includes('root:')).toBe(false);
  });
});
