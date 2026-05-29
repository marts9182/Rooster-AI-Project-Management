/**
 * Typed fetch wrapper for the /api/calendar/* backend routes.
 *
 *   listEvents({from, to})  → GET  /api/calendar/events?from=&to=
 *
 * Throws an `ApiError` (re-exported from ./kdp) with `.status` and `.body`
 * on non-2xx. Tests stub `globalThis.fetch`.
 */

import { ApiError } from './kdp';

export type CalendarEventKind =
  | 'kdp.release'
  | 'etsy.listed'
  | 'pinterest.post'
  | 'reminder'
  | 'roadmap.release'
  | 'roadmap.lock';

export interface CalendarEvent {
  /** ISO yyyy-mm-dd */
  date: string;
  kind: CalendarEventKind;
  title: string;
  source_kind: string;
  source_id: number | string;
  url?: string;
}

export interface ListEventsParams {
  /** ISO yyyy-mm-dd (inclusive) */
  from: string;
  /** ISO yyyy-mm-dd (exclusive) */
  to: string;
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

/**
 * Fetch calendar events in the window [from, to). The backend currently
 * returns `{events: [...]}`; we unwrap to a plain array for callers.
 */
export async function listEvents(
  params: ListEventsParams,
): Promise<CalendarEvent[]> {
  const qs = new URLSearchParams();
  qs.set('from', params.from);
  qs.set('to', params.to);
  const r = await fetch(`/api/calendar/events?${qs.toString()}`);
  if (!r.ok) await throwForStatus(r, 'listEvents');
  const data = (await r.json()) as { events: CalendarEvent[] };
  return data.events;
}

export { ApiError };
