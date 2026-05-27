/**
 * Append-only audit log + in-process pub/sub.
 *
 * Every state transition in the dashboard goes through recordEvent().
 * Both the events table (persistent audit log) and connected SSE clients
 * (via subscribe) receive the event synchronously.
 */

import { openDb } from './db.js';

/**
 * @typedef {Object} DashboardEvent
 * @property {string} kind          Channel name, e.g. 'kdp:published'.
 * @property {object} payload       Arbitrary JSON-serializable data.
 * @property {string} occurred_at   ISO datetime.
 */

/** @type {Set<(evt: DashboardEvent) => void>} */
const subscribers = new Set();

/**
 * Append an event to the persistent log and fan-out to subscribers.
 *
 * @param {string} kind
 * @param {object} [payload]
 * @returns {DashboardEvent}
 */
export function recordEvent(kind, payload = {}) {
  const db = openDb();
  const occurred_at = new Date().toISOString();
  db.prepare(
    'INSERT INTO events(kind, payload_json, occurred_at) VALUES (?, ?, ?)',
  ).run(kind, JSON.stringify(payload), occurred_at);
  const evt = { kind, payload, occurred_at };
  for (const fn of subscribers) {
    try {
      fn(evt);
    } catch (err) {
      // A bad subscriber must not poison the broadcast loop.
      // eslint-disable-next-line no-console
      console.error('events subscriber threw:', err);
    }
  }
  return evt;
}

/**
 * Subscribe to all events. Returns an unsubscribe thunk.
 *
 * @param {(evt: DashboardEvent) => void} fn
 * @returns {() => void}
 */
export function subscribe(fn) {
  subscribers.add(fn);
  return () => subscribers.delete(fn);
}

/**
 * Return the most recent `limit` events, oldest-first (so SSE on-connect
 * replay arrives in chronological order).
 *
 * @param {number} [limit]
 * @returns {DashboardEvent[]}
 */
export function replayRecent(limit = 50) {
  const rows = openDb()
    .prepare(
      'SELECT kind, payload_json, occurred_at FROM events ORDER BY id DESC LIMIT ?',
    )
    .all(limit);
  return rows
    .map((r) => ({
      kind: r.kind,
      payload: JSON.parse(r.payload_json),
      occurred_at: r.occurred_at,
    }))
    .reverse();
}

/** Test helper — clears the in-memory subscriber set. */
export function _resetSubscribersForTests() {
  subscribers.clear();
}
