/**
 * Typed fetch wrappers for the /api/reminders/* backend routes.
 *
 *   listReminders(params)      → GET   /api/reminders?status=&limit=&order=
 *   createReminder(body)       → POST  /api/reminders
 *   snoozeReminder(id, hours)  → POST  /api/reminders/:id/snooze   { hours }
 *   dismissReminder(id)        → POST  /api/reminders/:id/dismiss
 *
 * All functions throw an `ApiError` (re-exported from ./kdp) with `.status`
 * and `.body` on non-2xx. The backend wraps list/single replies in
 * `{reminders: [...]}` / `{reminder: {...}}`; the action endpoints return
 * `{ok: true, due_at?}`. The wrappers below unwrap the list/single envelopes
 * so callers get the bare row(s).
 */

import { ApiError } from './kdp';

export type ReminderStatus = 'pending' | 'fired' | 'dismissed' | 'failed';
export type ReminderChannel = 'toast' | 'email' | 'both';

export interface Reminder {
  id: number;
  title: string;
  body: string | null;
  due_at: string;
  channel: ReminderChannel;
  status: ReminderStatus;
  source_kind: string | null;
  source_id: number | null;
  fired_at: string | null;
  created_at: string;
}

export interface ReminderActionResult {
  ok: true;
  /** Present on snooze responses — the new due_at after applying +hours. */
  due_at?: string;
}

export interface ListRemindersParams {
  status?: ReminderStatus;
  limit?: number;
  order?: string;
}

export interface CreateReminderInput {
  title: string;
  body?: string;
  due_at: string;
  channel: ReminderChannel;
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

export async function listReminders(
  params: ListRemindersParams = {},
): Promise<Reminder[]> {
  const qs = new URLSearchParams();
  if (params.status) qs.set('status', params.status);
  if (params.limit !== undefined) qs.set('limit', String(params.limit));
  if (params.order) qs.set('order', params.order);
  const url = qs.toString()
    ? `/api/reminders?${qs.toString()}`
    : '/api/reminders';
  const r = await fetch(url);
  if (!r.ok) await throwForStatus(r, 'listReminders');
  const data = (await r.json()) as { reminders: Reminder[] };
  return data.reminders;
}

export async function createReminder(
  body: CreateReminderInput,
): Promise<Reminder> {
  const r = await fetch('/api/reminders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) await throwForStatus(r, 'createReminder');
  const data = (await r.json()) as { reminder: Reminder };
  return data.reminder;
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
