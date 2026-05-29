/**
 * Typed fetch wrappers for the /api/pinterest/* backend routes.
 *
 *   listQueue()                  → GET    /api/pinterest/queue
 *   listHistory(limit?)          → GET    /api/pinterest/history?limit=N
 *   pauseQueue()                 → POST   /api/pinterest/pause
 *   resumeQueue()                → POST   /api/pinterest/resume
 *   cancelQueueRow(id)           → POST   /api/pinterest/queue/:id/cancel
 *   updateQueueRow(id, patch)    → PUT    /api/pinterest/queue/:id
 *   getWhoami()                  → GET    /api/pinterest/whoami
 *   listBoards()                 → GET    /api/pinterest/boards
 *   getTokenStatus()             → GET    /api/pinterest/token-status
 *   refreshToken()               → POST   /api/pinterest/refresh
 *
 * All functions throw an `ApiError` (re-exported from ./kdp) with `.status`
 * and `.body` on non-2xx. The backend wraps list responses in `{queue: [...]}`
 * / `{history: [...]}` / `{boards: [...]}` envelopes — those are unwrapped
 * here so callers see plain arrays.
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
  attempts?: number;
  last_error?: string | null;
  created_at?: string;
  /** Joined from kdp_books for calendar grouping; null when not joined. */
  book_slug?: string | null;
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

export interface PinterestUser {
  username: string;
  business_name?: string;
  id?: string;
}

export interface PinterestBoard {
  id: string;
  name: string;
  description?: string;
  pin_count?: number;
  privacy?: string;
}

export interface PinterestTokenStatus {
  connected: boolean;
  /** ISO timestamp, or null when the token has never been bootstrapped. */
  expires_at: string | null;
  last_refresh_at: string | null;
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

export async function getWhoami(): Promise<PinterestUser> {
  const r = await fetch('/api/pinterest/whoami');
  if (!r.ok) await throwForStatus(r, 'getWhoami');
  return (await r.json()) as PinterestUser;
}

export async function listBoards(): Promise<PinterestBoard[]> {
  const r = await fetch('/api/pinterest/boards');
  if (!r.ok) await throwForStatus(r, 'listBoards');
  const data = (await r.json()) as { boards: PinterestBoard[] };
  return data.boards;
}

export async function getTokenStatus(): Promise<PinterestTokenStatus> {
  const r = await fetch('/api/pinterest/token-status');
  if (!r.ok) await throwForStatus(r, 'getTokenStatus');
  return (await r.json()) as PinterestTokenStatus;
}

export async function refreshToken(): Promise<void> {
  const r = await fetch('/api/pinterest/refresh', { method: 'POST' });
  if (!r.ok) await throwForStatus(r, 'refreshToken');
}

export interface CadenceBucket {
  date: string;
  posted: number;
  failed: number;
}

export interface CadenceResponse {
  days: number;
  target_per_day: number;
  buckets: CadenceBucket[];
  summary: {
    posted: number;
    failed: number;
    success_rate: number;
    avg_per_day: number;
  };
}

export interface EngagementRow {
  history_id: number;
  image_path: string | null;
  book_slug: string | null;
  posted_at: string;
  saves: number | null;
  clicks: number | null;
  impressions: number | null;
  pinterest_url: string | null;
  engagement_available: boolean;
}

export interface EngagementResponse {
  rows: EngagementRow[];
  engagement_disabled: boolean;
}

export async function getCadence(days = 30): Promise<CadenceResponse> {
  const r = await fetch(`/api/pinterest/cadence?days=${days}`);
  if (!r.ok) await throwForStatus(r, 'getCadence');
  return (await r.json()) as CadenceResponse;
}

export async function getEngagement(limit = 50): Promise<EngagementResponse> {
  const r = await fetch(`/api/pinterest/engagement?limit=${limit}`);
  if (!r.ok) await throwForStatus(r, 'getEngagement');
  return (await r.json()) as EngagementResponse;
}

export interface PinterestTopupStatus {
  topup_days_runway: number;
  topup_last_run: string | null;
  topup_next_run: string | null;
}

export async function getTopupStatus(): Promise<PinterestTopupStatus> {
  const r = await fetch('/api/pinterest/topup-status');
  if (!r.ok) await throwForStatus(r, 'getTopupStatus');
  return (await r.json()) as PinterestTopupStatus;
}

export { ApiError };
