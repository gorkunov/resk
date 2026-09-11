import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import type { Comment } from '../shared/types.js';
import { validateComments } from '../shared/comments.js';

/** A finished round as kept on disk: what the agent showed and what the reviewer answered. */
export interface StoredRound {
  number: number;
  summary: string;
  finishedAt: string;
  comments: Comment[];
}

export interface StoredSession {
  key: string;
  rounds: StoredRound[];
}

export class SessionStoreError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SessionStoreError';
  }
}

/** Directory holding resk's state: `$RESK_HOME`, or `~/.resk`. */
export function sessionRoot(env: NodeJS.ProcessEnv = process.env): string {
  const home = env.RESK_HOME?.trim();
  return home ? home : join(homedir(), '.resk');
}

/** File-name-safe form of a session key: never empty, hidden, or containing path separators. */
export function sessionSlug(key: string): string {
  const slug = key.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^[-.]+|[-.]+$/g, '');
  return slug === '' ? 'session' : slug;
}

function isStoredRound(value: unknown): value is StoredRound {
  if (typeof value !== 'object' || value === null) return false;
  const round = value as Record<string, unknown>;
  return (
    typeof round.number === 'number' &&
    typeof round.summary === 'string' &&
    typeof round.finishedAt === 'string' &&
    validateComments(round.comments) !== undefined
  );
}

function isStoredSession(value: unknown): value is StoredSession {
  if (typeof value !== 'object' || value === null) return false;
  const session = value as Record<string, unknown>;
  return (
    typeof session.key === 'string' &&
    Array.isArray(session.rounds) &&
    session.rounds.every(isStoredRound)
  );
}

/** Finished review rounds per session key, one JSON file each under `<root>/sessions/`. */
export class SessionStore {
  readonly #root: string;

  constructor(root: string) {
    this.#root = root;
  }

  pathFor(key: string): string {
    return join(this.#root, 'sessions', `${sessionSlug(key)}.json`);
  }

  /** The stored session, or an empty one when no round has finished yet. */
  async load(key: string): Promise<StoredSession> {
    const path = this.pathFor(key);
    let raw: string;
    try {
      raw = await readFile(path, 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { key, rounds: [] };
      throw new SessionStoreError(
        `cannot read session file "${path}": ${(error as Error).message}`,
      );
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new SessionStoreError(`session file "${path}" is not valid JSON`);
    }
    if (!isStoredSession(parsed)) {
      throw new SessionStoreError(`session file "${path}" has an unexpected shape`);
    }
    return parsed;
  }

  /** Appends a finished round, numbering it after the stored ones, and writes the file. */
  async appendRound(key: string, round: Omit<StoredRound, 'number'>): Promise<StoredRound> {
    const session = await this.load(key);
    const stored: StoredRound = { number: session.rounds.length + 1, ...round };
    session.rounds.push(stored);
    const path = this.pathFor(key);
    await mkdir(dirname(path), { recursive: true });
    const tmp = `${path}.${process.pid}.tmp`;
    await writeFile(tmp, JSON.stringify(session, null, 2) + '\n', 'utf8');
    await rename(tmp, path);
    return stored;
  }
}
