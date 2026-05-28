/**
 * Etsy 30-minute sync worker.
 *
 * `startEtsyWorker` is a thin, dependency-injected loop — easy to fake
 * in tests. `startEtsyWorkerDefault` wires the production deps (DB,
 * config, OAuth, EtsyClient, workerStatus) and is what `server.js`
 * calls at boot.
 *
 * @module etsy/worker
 */

import { etsyConfig } from './config.js';
import { ensureFreshToken } from './oauth.js';
import { EtsyClient } from './client.js';
import { runSyncPass } from './syncer.js';
import { setWorkerHeartbeat, setWorkerError } from '../workerStatus.js';

/** Canonical worker name reported via workerStatus. Exported so the
 *  status reader and the manual-sync route can read/write the same slot. */
export const WORKER_NAME = 'etsy.syncer';

/** Default cadence: 30 minutes. */
const DEFAULT_INTERVAL_MS = 30 * 60 * 1000;

/**
 * @typedef {Object} StartArgs
 * @property {number} intervalMs
 * @property {() => Promise<{inserted: number, updated: number, statusChanged: number}>} runPass
 * @property {() => void} onHeartbeat
 *   Called on every successful pass (production wires this to setWorkerHeartbeat).
 * @property {(message: string) => void} onError
 *   Called with the error message on failure (production wires this to setWorkerError).
 */

/**
 * Drive `runPass` on an interval. Errors do not kill the loop — every
 * tick schedules the next one in `finally`.
 *
 * @param {StartArgs} args
 * @returns {() => void}   stop function
 */
export function startEtsyWorker({ intervalMs, runPass, onHeartbeat, onError }) {
  let cancelled = false;
  /** @type {NodeJS.Timeout | null} */
  let timer = null;

  const tick = async () => {
    if (cancelled) return;
    try {
      await runPass();
      if (!cancelled) onHeartbeat();
    } catch (err) {
      if (!cancelled) onError(err instanceof Error ? err.message : String(err));
    } finally {
      if (!cancelled) {
        timer = setTimeout(tick, intervalMs);
        if (typeof timer?.unref === 'function') timer.unref();
      }
    }
  };
  // Schedule the first tick as a microtask so callers can `await
  // vi.advanceTimersByTimeAsync(0)` to drive it deterministically.
  void tick();

  return () => {
    cancelled = true;
    if (timer) clearTimeout(timer);
  };
}

/**
 * Wire defaults from env + DB. Exported for `server.js` to call once at
 * boot. Uses the canonical procedural worker-status API (no factory
 * handle).
 *
 * @param {{db: import('better-sqlite3').Database, emit: (c: string, p: unknown) => void, intervalMs?: number}} deps
 * @returns {() => void}
 */
export function startEtsyWorkerDefault({ db, emit, intervalMs }) {
  const cfg = etsyConfig();
  const client = new EtsyClient({
    keystring: cfg.keystring,
    sharedSecret: cfg.sharedSecret,
    shopId: cfg.shopId,
    getAccessToken: () => ensureFreshToken({ cfg }),
  });
  return startEtsyWorker({
    intervalMs: intervalMs ?? DEFAULT_INTERVAL_MS,
    runPass: () => runSyncPass({ db, client, emit }),
    onHeartbeat: () => setWorkerHeartbeat(WORKER_NAME),
    onError: (msg) => setWorkerError(WORKER_NAME, msg),
  });
}
