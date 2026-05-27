/**
 * Fetch a help article's raw markdown body from /api/help/:field.
 *
 * The backend returns `Content-Type: text/markdown; charset=utf-8` with the
 * file body as plain text — no JSON envelope. Callers feed the returned
 * string to `react-markdown` for rendering.
 *
 * Throws `ApiError` on non-2xx so the drawer can show a meaningful banner.
 */

import { ApiError } from './kdp';

export async function getHelpMarkdown(field: string): Promise<string> {
  const r = await fetch(`/api/help/${encodeURIComponent(field)}`);
  if (!r.ok) {
    let body: unknown = null;
    try {
      body = await r.json();
    } catch {
      // body wasn't JSON; ignore.
    }
    const detail =
      body && typeof body === 'object' && 'error' in body
        ? String((body as { error: unknown }).error)
        : '';
    const message = detail
      ? `getHelpMarkdown: ${r.status} ${detail}`
      : `getHelpMarkdown: ${r.status}`;
    throw new ApiError(message, r.status, body);
  }
  return r.text();
}
