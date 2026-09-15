import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, resolve, sep } from 'node:path';
import type { FileChange, ReviewPayload } from '../shared/types.js';
import { validateComments } from '../shared/comments.js';
import type { ReviewSession } from './session.js';

/** Reads both versions of a changed file. Absent when the review came from a patch file. */
export type ContentsProvider = (file: FileChange) => Promise<{ old?: string; new?: string }>;

export interface AppOptions {
  review: ReviewPayload;
  contents?: ContentsProvider;
  session: ReviewSession;
  /** Directory holding the built client (index.html and assets). */
  clientDir: string;
  /** Heartbeat interval for the presence stream. */
  heartbeatMs?: number;
}

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.wasm': 'application/wasm',
};

export function createApp({
  review,
  session,
  clientDir,
  contents,
  heartbeatMs = 15_000,
}: AppOptions): Hono {
  const app = new Hono();
  const root = resolve(clientDir);

  app.get('/api/review', (c) => c.json(review));

  app.get('/api/contents', async (c) => {
    const path = c.req.query('path');
    const file = review.files.find((f) => f.path === path);
    if (!contents || !file) return c.json({ error: 'no contents for this path' }, 404);
    const text = await contents(file);
    return c.json({ path: file.path, old: text.old ?? null, new: text.new ?? null });
  });

  app.get('/api/comments', (c) => c.json(session.comments));

  app.put('/api/comments', async (c) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: 'body must be JSON' }, 400);
    }
    const comments = validateComments(body);
    if (!comments) return c.json({ error: 'invalid comment list' }, 400);
    session.setComments(comments);
    return c.json({ ok: true });
  });

  app.post('/api/finish', (c) => {
    session.finish();
    return c.json({ ok: true });
  });

  app.get('/api/events', (c) =>
    streamSSE(c, async (stream) => {
      const disconnect = session.clientConnected();
      let open = true;
      const close = (): void => {
        open = false;
        disconnect();
      };
      stream.onAbort(close);
      try {
        await stream.writeSSE({ event: 'ready', data: 'ok' });
        while (open) {
          await stream.sleep(heartbeatMs);
          if (!open) break;
          await stream.writeSSE({ event: 'ping', data: '' });
        }
      } catch {
        // client went away
      } finally {
        close();
      }
    }),
  );

  app.get('/*', async (c) => {
    const pathname = decodeSafely(new URL(c.req.url).pathname);
    const candidate = resolve(join(root, pathname));
    const inside = candidate === root || candidate.startsWith(root + sep);
    const file = inside ? await fileIfExists(candidate) : undefined;
    if (file) {
      const type = CONTENT_TYPES[extname(candidate)] ?? 'application/octet-stream';
      const cache = pathname.startsWith('/assets/')
        ? 'public, max-age=31536000, immutable'
        : 'no-cache';
      return new Response(new Uint8Array(file), {
        headers: { 'content-type': type, 'cache-control': cache },
      });
    }
    const index = await fileIfExists(join(root, 'index.html'));
    if (!index) return c.text('client build not found', 500);
    return new Response(new Uint8Array(index), {
      headers: { 'content-type': CONTENT_TYPES['.html']!, 'cache-control': 'no-cache' },
    });
  });

  return app;
}

function decodeSafely(pathname: string): string {
  try {
    return decodeURIComponent(pathname);
  } catch {
    return pathname;
  }
}

async function fileIfExists(path: string): Promise<Buffer | undefined> {
  try {
    const info = await stat(path);
    if (!info.isFile()) return undefined;
    return await readFile(path);
  } catch {
    return undefined;
  }
}
