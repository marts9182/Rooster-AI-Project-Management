/**
 * Typed fetch wrappers for the /api/reminders/* backend routes.
 *
 *   snoozeReminder(id, hours)  → POST  /api/reminders/:id/snooze   { hours }
 *   dismissReminder(id)        → POST  /api/reminders/:id/dismiss
 *
 * Both functions throw an `ApiError` (re-exported from ./kdp) with `.status`
 * and `.body` on non-2xx. The backend responds with `{ok: true, due_at?}`;
 * we surface the parsed JSON so callers can inspect the new due_at if needed.
 */

import { ApiError } from './kdp';

export interface ReminderActionResult {
  ok: true;
  /** Present on snooze responses — the new due_at after applying +hours. */
  due_at?: string;
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

export async function snoozeReminder(
  id: number,
  hours: number,
): Promise<ReminderActionResult> {
  const r = await fetch(`/api/reminders/${id}/snooze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ hours }),
  });
  if (!r.ok) await throwForStatus(r, 'snoozeReminder');
  return (await r.json()) as ReminderActionResult;
}

export async function dismissReminder(
  id: number,
): Promise<ReminderActionResult> {
  const r = await fetch(`/api/reminders/${id}/dismiss`, {
    method: 'POST',
  });
  if (!r.ok) await throwForStatus(r, 'dismissReminder');
  return (await r.json()) as ReminderActionResult;
}

export { ApiError };
