import type { Comment } from '../shared/types.js';

export interface ReviewSessionOptions {
  onFinish: (comments: Comment[]) => void;
  /** How long to wait after the last client disconnects before finishing. */
  graceMs: number;
  /** When true, never finish because of disconnects. */
  keepAlive: boolean;
}

/** In-memory review state plus the "exit when the browser goes away" logic. */
export class ReviewSession {
  #comments: Comment[] = [];
  #clients = 0;
  #timer: ReturnType<typeof setTimeout> | undefined;
  #finished = false;
  readonly #options: ReviewSessionOptions;

  constructor(options: ReviewSessionOptions) {
    this.#options = options;
  }

  get comments(): Comment[] {
    return this.#comments;
  }

  setComments(comments: Comment[]): void {
    this.#comments = comments;
  }

  get finished(): boolean {
    return this.#finished;
  }

  get clientCount(): number {
    return this.#clients;
  }

  /** Registers a connected client; the returned function unregisters it (idempotent). */
  clientConnected(): () => void {
    this.#clients++;
    this.#cancelTimer();
    let done = false;
    return () => {
      if (done) return;
      done = true;
      this.#clients--;
      if (this.#clients === 0 && !this.#options.keepAlive && !this.#finished) {
        this.#timer = setTimeout(() => this.finish(), this.#options.graceMs);
      }
    };
  }

  finish(): void {
    if (this.#finished) return;
    this.#finished = true;
    this.#cancelTimer();
    this.#options.onFinish(this.#comments);
  }

  #cancelTimer(): void {
    if (this.#timer !== undefined) {
      clearTimeout(this.#timer);
      this.#timer = undefined;
    }
  }
}
