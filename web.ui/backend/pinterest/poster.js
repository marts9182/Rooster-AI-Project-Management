/**
 * Pinterest poster worker — API edition.
 *
 * `runOnce({apiClient})` dequeues one due pending row, reads its PNG path,
 * and calls `apiClient.createPin(...)`. On success → markPosted + history
 * row (which also fires the `pinterest:pin-posted` SSE event). On failure
 * → markFailed + history row (`pinterest:pin-failed`). On no resolvable
 * board id → return early WITHOUT dequeuing, so the row stays pending.
 *
 * `startPosterWorker({apiClientFactory, intervalMs})` is a sleep-until-next
 * supervisor loop. If no default board is configured at startup time, the
 * worker sets a worker-status error and returns early instead of starting
 * the interval — safer than picking the wrong board.
 *
 * No Playwright. No browser. The api_oauth + api_client layer handles auth.
 *
 * @module pinterest/poster
 */

import fs from 'node:fs';
import path from 'node:path';
import { openDb } from '../db.js';
import { setWorkerHeartbeat, setWorkerError } from '../workerStatus.js';
import { dequeueNext, markPosted, markFailed, pauseQueue } from './queue.js';
import { createPinterestApiClient } from './api_client.js';

const WORKER_NAME = 'pinterest';

/**
 * @typedef {Object} ApiClientLike
 * @property {(args: {board_id: string, title: string, description: string, link: string, imagePath: string}) => Promise<{id: string}>} createPin
 * @property {() => Promise<Array<{id: string, name: string}>>} [listBoards]
 * @property {() => Promise<{username: string, business_name?: string}>} [getUserAccount]
 * @property {() => Promise<{connected: boolean, expires_at: string|null}>} [getTokenStatus]
 */

/**
 * @typedef {Object} RunOnceInput
 * @property {ApiClientLike} [apiClient]
 */

/**
 * @typedef {Object} RunOnceResult
 * @property {'idle'|'posted'|'failed'|'no_default_board'} action
 * @property {boolean} [posted]
 * @property {string} [reason]
 * @property {number} [queueId]
 * @property {string} [pinId]
 * @property {string} [error]
 */

/**
 * Resolve the default Pinterest board id from env. Returns null if the env
 * var is missing or empty. Per the implementation override, we do NOT fall
 * back to listBoards()[0] — picking the wrong board is worse than not
 * posting at all.
 *
 * @returns {string|null}
 */
function resolveBoardId() {
  const id = process.env.PINTEREST_DEFAULT_BOARD_ID;
  if (!id || !id.trim()) return null;
  return id.trim();
}

/**
 * Process at most one pending pin.
 *
 * @param {RunOnceInput} [input]
 * @returns {Promise<RunOnceResult>}
 */
export async function runOnce(input = {}) {
  // 1) Board-id gate — if no board is resolvable from env, do NOT dequeue or
  //    fail any row. The row stays pending until the user configures one.
  //    (Per-row board_id can override the env value after dequeue, but rows
  //    without a board_id of their own still need the env default.)
  const boardId = resolveBoardId();
  if (!boardId) {
    setWorkerError(WORKER_NAME, 'no_default_board');
    return { action: 'no_default_board', posted: false, reason: 'no_default_board' };
  }

  const apiClient = input.apiClient ?? defaultApiClient();

  // 2) Dequeue one due row.
  const row = dequeueNext();
  if (!row) {
    setWorkerHeartbeat(WORKER_NAME);
    return { action: 'idle', posted: false, reason: 'no_due_row' };
  }

  // 2b) Per-row board_id takes precedence; env default is the fallback.
  const resolvedBoardId = (row.board_id && String(row.board_id).trim())
    ? String(row.board_id).trim()
    : boardId;

  // 3) Pre-flight: image must exist on disk.
  if (!fs.existsSync(row.image_path)) {
    const msg = `image_path missing: ${row.image_path}`;
    markFailed(row.id, msg);
    setWorkerError(WORKER_NAME, 'image missing');
    return { action: 'failed', posted: false, queueId: row.id, error: msg };
  }

  // 4) Call the API.
  try {
    const result = await apiClient.createPin({
      board_id: resolvedBoardId,
      title: row.title,
      description: row.description,
      link: row.link_url,
      imagePath: row.image_path,
    });
    markPosted(row.id, result.id);
    setWorkerHeartbeat(WORKER_NAME);
    return { action: 'posted', posted: true, queueId: row.id, pinId: result.id };
  } catch (err) {
    const status = err && typeof err === 'object' && 'status' in err ? err.status : undefined;
    const msg =
      status === 401
        ? 'auth failed after refresh'
        : err?.message || String(err);
    markFailed(row.id, msg);
    setWorkerError(WORKER_NAME, msg);
    return { action: 'failed', posted: false, queueId: row.id, error: msg };
  }
}

/**
 * Compute the milliseconds until the next pending row is due.
 *
 * @returns {number|null}
 */
export function msUntilNextPending() {
  const db = openDb();
  const row = /** @type {{scheduled_for: string} | undefined} */ (
    db.prepare(`
      SELECT scheduled_for FROM pinterest_queue
       WHERE status='pending'
       ORDER BY scheduled_for ASC
       LIMIT 1
    `).get()
  );
  if (!row) return null;
  return new Date(row.scheduled_for).getTime() - Date.now();
}

// --- Supervisor loop -------------------------------------------------------

let consecutiveFailures = 0;
const BACKOFF_MS = [60_000, 5 * 60_000, 30 * 60_000];

/** @type {ReturnType<typeof setTimeout>|null} */
let currentTimer = null;
let workerCancelled = false;

/**
 * Sleep-until-next supervisor loop. Idempotent: calling twice is a no-op
 * on the second call until `stopPosterWorker` runs.
 *
 * If PINTEREST_DEFAULT_BOARD_ID is missing at startup the worker DOES NOT
 * start the interval — it flips the worker-status to error and returns.
 * The user must configure a board (env var) and restart for posting to
 * resume.
 *
 * @param {{
 *   apiClient?: ApiClientLike,
 *   apiClientFactory?: () => ApiClientLike,
 *   intervalMs?: number,
 *   idleCheckMs?: number,
 * }} [opts]
 * @returns {() => void}  cancel function (same as stopPosterWorker)
 */
export function startPosterWorker(opts = {}) {
  if (currentTimer) {
    // Already running — idempotent.
    return stopPosterWorker;
  }

  // Board-id gate at startup: bail out instead of spinning a worker that
  // would short-circuit every tick anyway.
  if (resolveBoardId() === null) {
    setWorkerError(WORKER_NAME, 'no_default_board');
    return stopPosterWorker;
  }

  const idleCheckMs = opts.idleCheckMs ?? opts.intervalMs ?? 5 * 60 * 1000;
  workerCancelled = false;
  consecutiveFailures = 0;

  async function loop() {
    if (workerCancelled) return;
    let result;
    try {
      const apiClient = opts.apiClient
        ?? (opts.apiClientFactory ? opts.apiClientFactory() : undefined);
      result = await runOnce({ apiClient });
    } catch (err) {
      const msg = err?.message || String(err);
      setWorkerError(WORKER_NAME, msg);
      result = { action: 'failed', posted: false, error: msg };
    }

    // Backoff bookkeeping.
    if (result.action === 'posted' || result.action === 'idle') {
      consecutiveFailures = 0;
    } else if (result.action === 'failed') {
      consecutiveFailures += 1;
      if (consecutiveFailures > BACKOFF_MS.length) {
        try { pauseQueue(); } catch { /* ignore */ }
        setWorkerError(WORKER_NAME, 'paused after repeated failures');
        consecutiveFailures = 0;
      }
    }

    if (workerCancelled) return;
    let delay;
    if (result.action === 'failed' && consecutiveFailures > 0) {
      delay = BACKOFF_MS[Math.min(consecutiveFailures - 1, BACKOFF_MS.length - 1)];
    } else {
      const ms = msUntilNextPending();
      delay = ms === null ? idleCheckMs : Math.max(5_000, Math.min(idleCheckMs, ms));
    }
    currentTimer = setTimeout(loop, delay);
  }

  setWorkerHeartbeat(WORKER_NAME);
  currentTimer = setTimeout(loop, 1000);
  return stopPosterWorker;
}

/**
 * Cancel the supervisor loop. Safe to call multiple times.
 */
export function stopPosterWorker() {
  workerCancelled = true;
  if (currentTimer) {
    clearTimeout(currentTimer);
    currentTimer = null;
  }
  consecutiveFailures = 0;
}

/**
 * Build a real PinterestApiClient from env. Used when no apiClient is
 * injected. Tests always inject a fake so this path is exercised only by
 * production callers.
 *
 * @returns {import('./api_client.js').PinterestApiClient}
 */
function defaultApiClient() {
  const tokenStorePath = path.resolve(
    process.env.ROOSTER_PINTEREST_TOKEN_PATH || 'data/pinterest_token.json',
  );
  const appId = process.env.PINTEREST_APP_ID || '1572111';
  const appSecret = process.env.PINTEREST_APP_SECRET;
  if (!appSecret) {
    throw new Error('PINTEREST_APP_SECRET env var is required');
  }
  return createPinterestApiClient({ tokenStorePath, appId, appSecret });
}

/** Test-only: clear module-level backoff state. */
export function _resetPosterStateForTests() {
  consecutiveFailures = 0;
  workerCancelled = false;
  if (currentTimer) {
    clearTimeout(currentTimer);
    currentTimer = null;
  }
}
