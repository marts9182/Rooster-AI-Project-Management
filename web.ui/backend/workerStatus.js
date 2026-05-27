/**
 * In-memory per-worker status. Used by /api/status (read) and by each
 * background worker (write). The tray-icon color is derived from the
 * aggregate of these states.
 *
 * Plans B-E register their workers by calling setWorkerHeartbeat /
 * setWorkerError with the canonical worker name (e.g. 'kdp', 'etsy',
 * 'pinterest', 'reminders'). There is no separate `registerWorker`
 * factory — workers appear in the map the first time they report.
 */

/**
 * @typedef {Object} WorkerStatus
 * @property {string|null} last_success_at      ISO datetime of last heartbeat.
 * @property {string|null} last_error_at        ISO datetime of last error.
 * @property {string|null} last_error_message
 */

/**
 * Internal record. Includes monotonic ordering tokens so we can compare
 * heartbeat-vs-error reliably when both land in the same millisecond.
 *
 * @typedef {WorkerStatus & {
 *   _success_seq: number,
 *   _error_seq: number,
 * }} InternalStatus
 */

/** @type {Map<string, InternalStatus>} */
const statuses = new Map();

/** Monotonic sequence so two writes in the same ms still have an order. */
let seq = 0;

/** Threshold beyond which a worker is considered stale → tray turns yellow. */
const STALE_AFTER_MS = 5 * 60 * 1000;

/**
 * Mark a successful heartbeat for the given worker. Creates the entry on
 * first call.
 *
 * @param {string} worker
 */
export function setWorkerHeartbeat(worker) {
  const prev = statuses.get(worker) ?? blank();
  prev.last_success_at = new Date().toISOString();
  prev._success_seq = ++seq;
  statuses.set(worker, prev);
}

/**
 * Mark a failure for the given worker.
 *
 * @param {string} worker
 * @param {string} message
 */
export function setWorkerError(worker, message) {
  const prev = statuses.get(worker) ?? blank();
  prev.last_error_at = new Date().toISOString();
  prev.last_error_message = message;
  prev._error_seq = ++seq;
  statuses.set(worker, prev);
}

/**
 * Return a snapshot of every registered worker, keyed by name.
 *
 * @returns {Record<string, WorkerStatus>}
 */
export function getAllStatuses() {
  return Object.fromEntries(
    [...statuses.entries()].map(([name, s]) => [
      name,
      {
        last_success_at: s.last_success_at,
        last_error_at: s.last_error_at,
        last_error_message: s.last_error_message,
      },
    ]),
  );
}

/**
 * Aggregate tray-icon color.
 *
 *   red    — any worker has last_error_at newer than its last_success_at
 *   yellow — no worker has heartbeated in the last 5 minutes
 *   green  — otherwise
 *
 * @returns {'green'|'yellow'|'red'}
 */
export function trayColor() {
  if (statuses.size === 0) return 'green';

  for (const s of statuses.values()) {
    // Compare write order rather than wall-clock so two writes inside
    // the same millisecond still resolve deterministically.
    if (s._error_seq > s._success_seq) return 'red';
  }

  const now = Date.now();
  let anyRecentHeartbeat = false;
  for (const s of statuses.values()) {
    if (s.last_success_at) {
      const okAt = Date.parse(s.last_success_at);
      if (now - okAt <= STALE_AFTER_MS) {
        anyRecentHeartbeat = true;
        break;
      }
    }
  }
  if (!anyRecentHeartbeat) return 'yellow';

  return 'green';
}

/** @returns {InternalStatus} */
function blank() {
  return {
    last_success_at: null,
    last_error_at: null,
    last_error_message: null,
    _success_seq: 0,
    _error_seq: 0,
  };
}

/** Test helper — clears the in-memory map. */
export function _resetWorkerStatus() {
  statuses.clear();
  seq = 0;
}
