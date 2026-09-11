import { createServer, type Server } from 'node:http';
import { getRequestListener } from '@hono/node-server';
import type { Hono } from 'hono';

export interface StartOptions {
  host: string;
  /** Preferred port; 0 lets the OS choose. */
  port: number;
  /** How many consecutive ports to try when the preferred one is busy. */
  attempts?: number;
}

export interface RunningServer {
  port: number;
  url: string;
  close(): Promise<void>;
}

function listen(app: Hono, host: string, port: number): Promise<Server> {
  return new Promise((resolve, reject) => {
    const server = createServer(getRequestListener(app.fetch));
    server.once('error', reject);
    server.listen(port, host, () => {
      server.off('error', reject);
      resolve(server);
    });
  });
}

function displayHost(host: string): string {
  return host === '0.0.0.0' || host === '::' ? 'localhost' : host;
}

export async function startServer(app: Hono, options: StartOptions): Promise<RunningServer> {
  const attempts = options.port === 0 ? 1 : Math.max(1, options.attempts ?? 20);
  for (let i = 0; i < attempts; i++) {
    const port = options.port === 0 ? 0 : options.port + i;
    try {
      const server = await listen(app, options.host, port);
      const address = server.address();
      const actualPort = typeof address === 'object' && address ? address.port : port;
      return {
        port: actualPort,
        url: `http://${displayHost(options.host)}:${actualPort}`,
        close: () =>
          new Promise<void>((resolve, reject) => {
            server.closeAllConnections();
            server.close((error) => (error ? reject(error) : resolve()));
          }),
      };
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== 'EADDRINUSE') throw error;
    }
  }
  const last = options.port + attempts - 1;
  const range = attempts === 1 ? `port ${options.port}` : `ports ${options.port}-${last}`;
  throw new Error(`${range} already in use`);
}
