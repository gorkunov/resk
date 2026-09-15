import type { Comment, FileContents, ReviewPayload } from '../shared/types.js';

async function expectOk(response: Response): Promise<Response> {
  if (!response.ok) throw new Error(`${response.url} responded ${response.status}`);
  return response;
}

export async function fetchReview(): Promise<ReviewPayload> {
  return (await expectOk(await fetch('/api/review'))).json() as Promise<ReviewPayload>;
}

export async function fetchComments(): Promise<Comment[]> {
  return (await expectOk(await fetch('/api/comments'))).json() as Promise<Comment[]>;
}

export async function fetchFileContents(path: string): Promise<FileContents> {
  const url = `/api/contents?path=${encodeURIComponent(path)}`;
  return (await expectOk(await fetch(url))).json() as Promise<FileContents>;
}

export async function putComments(comments: Comment[]): Promise<void> {
  await expectOk(
    await fetch('/api/comments', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(comments),
    }),
  );
}

export async function postFinish(): Promise<void> {
  await expectOk(await fetch('/api/finish', { method: 'POST' }));
}

/** Keeps a presence connection open so the server knows a tab is alive. Returns a disposer. */
export function connectEvents(): () => void {
  const source = new EventSource('/api/events');
  return () => source.close();
}
