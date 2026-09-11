import { afterEach, describe, expect, it } from 'vitest';
import { Hono } from 'hono';
import { startServer } from '../../src/server/start.js';

const app = new Hono().get('/ping', (c) => c.text('pong'));
const running: Array<{ close: () => Promise<void> }> = [];

afterEach(async () => {
  await Promise.all(running.splice(0).map((s) => s.close()));
});

describe('startServer', () => {
  it('listens on an OS-assigned port when asked for port 0 and serves the app', async () => {
    const server = await startServer(app, { host: '127.0.0.1', port: 0 });
    running.push(server);
    expect(server.port).toBeGreaterThan(0);
    expect(server.url).toBe(`http://127.0.0.1:${server.port}`);
    const res = await fetch(`${server.url}/ping`);
    expect(await res.text()).toBe('pong');
  });

  it('falls back to the next port when the preferred one is busy', async () => {
    const first = await startServer(app, { host: '127.0.0.1', port: 0 });
    running.push(first);
    const second = await startServer(app, { host: '127.0.0.1', port: first.port });
    running.push(second);
    expect(second.port).toBe(first.port + 1);
  });

  it('gives up after the configured number of attempts', async () => {
    const first = await startServer(app, { host: '127.0.0.1', port: 0 });
    running.push(first);
    await expect(
      startServer(app, { host: '127.0.0.1', port: first.port, attempts: 1 }),
    ).rejects.toThrow(/in use/);
  });
});
