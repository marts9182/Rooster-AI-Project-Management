/**
 * Typed fetch wrappers for the /api/pinterest/* backend routes.
 *
 *   listQueue()                  → GET    /api/pinterest/queue
 *   listHistory(limit?)          → GET    /api/pinterest/history?limit=N
 *   pauseQueue()                 → POST   /api/pinterest/pause
 *   resumeQueue()                → POST   /api/pinterest/resume
 *   cancelQueueRow(id)           → POST   /api/pinterest/queue/:id/cancel
 *   updateQueueRow(id, patch)    → PUT    /api/pinterest/queue/:id
 *   startLogin()                 → POST   /api/pinterest/login
 *
 * All functions throw an `ApiError` (re-exported from ./kdp) with `.status`
 * and `.body` on non-2xx. The backend wraps list responses in `{queue: [...]}`
 * / `{history: [...]}` envelopes — those are unwrapped here so callers see
 * plain arrays.
 *
 * Tests stub `globalThis.fetch`.
 */

import { ApiError } from './kdp';

export type PinType = 'cover_hero' | 'interior_preview';
export type QueueStatus =
  | 'pending'
  | 'posting'
  | 'posted'
  | 'failed'
  | 'paused'
  | 'cancelled';

export interface PinterestQueueRow {
  id: number;
  kdp_book_id: number | null;
  pin_type: PinType;
  /** Filesystem path; preview UI converts this to a /files URL. */
  image_path: string;
  title: string;
  description: string;
  link_url: string;
  status: QueueStatus;
  scheduled_for: string;
  attempts: number;
  last_error: string | null;
  created_at: string;
}

export interface PinterestHistoryRow {
  id: number;
  queue_id: number;
  pinterest_pin_id: string | null;
  posted_at: string;
  /** Backend coerces SQLite 1/0 to boolean before serialising. */
  success: boolean;
  error_message: string | null;
  /** Joined from pinterest_queue for convenience. */
  title?: string;
  image_path?: string;
}

export interface UpdateQueuePatch {
  title?: string;
  description?: string;
  scheduled_for?: string;
}

async function throwForStatus(r: Response, label: string): Promise<never> {
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
    ? `${label}: ${r.status} ${detail}`
    : `${label}: ${r.status}`;
  throw new ApiError(message, r.status, body);
}

export async function listQueue(): Promise<PinterestQueueRow[]> {
  const r = await fetch('/api/pinterest/queue');
  if (!r.ok) await throwForStatus(r, 'listQueue');
  const data = (await r.json()) as { queue: PinterestQueueRow[] };
  return data.queue;
}

export async function listHistory(
  limit = 100,
): Promise<PinterestHistoryRow[]> {
  const r = await fetch(`/api/pinterest/history?limit=${encodeURIComponent(limit)}`);
  if (!r.ok) await throwForStatus(r, 'listHistory');
  const data = (await r.json()) as { history: PinterestHistoryRow[] };
  return data.history;
}

export async function pauseQueue(): Promise<{ paused: number }> {
  const r = await fetch('/api/pinterest/pause', { method: 'POST' });
  if (!r.ok) await throwForStatus(r, 'pauseQueue');
  return (await r.json()) as { paused: number };
}

export async function resumeQueue(): Promise<{ resumed: number }> {
  const r = await fetch('/api/pinterest/resume', { method: 'POST' });
  if (!r.ok) await throwForStatus(r, 'resumeQueue');
  return (await r.json()) as { resumed: number };
}

export async function cancelQueueRow(id: number): Promise<{ ok: true }> {
  const r = await fetch(`/api/pinterest/queue/${id}/cancel`, { method: 'POST' });
  if (!r.ok) await throwForStatus(r, 'cancelQueueRow');
  return (await r.json()) as { ok: true };
}

export async function updateQueueRow(
  id: number,
  patch: UpdateQueuePatch,
): Promise<{ ok: true }> {
  const r = await fetch(`/api/pinterest/queue/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
  if (!r.ok) await throwForStatus(r, 'updateQueueRow');
  return (await r.json()) as { ok: true };
}

export async function startLogin(): Promise<{ ok: true; launched: boolean }> {
  const r = await fetch('/api/pinterest/login', { method: 'POST' });
  if (!r.ok) await throwForStatus(r, 'startLogin');
  return (await r.json()) as { ok: true; launched: boolean };
}

export { ApiError };
