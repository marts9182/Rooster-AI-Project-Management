/**
 * Pinterest engagement fetcher worker.
 *
 * Polls each posted history row for saves/clicks/impressions via the
 * Pinterest v5 analytics endpoint. Fast-exits and self-disables on the
 * first 401/403 response (analytics access is gated separately from
 * basic posting; trial-mode apps may not have it).
 *
 * @module pinterest/engagement
 */

import { openDb } from '../db.js';
import { setWorkerHeartbeat, setWorkerError } from '../workerStatus.js';

export const WORKER_NAME = 'pinterest.engagement';
const DEFAULT_INTERVAL_MS = 12 * 60 * 60 * 1000;
const FETCH_WINDOW_MS = 12 * 60 * 60 * 1000;
const LOOKBACK_MS = 30 * 24 * 60 * 60 * 1000;
const BATCH_LIMIT = 200;

let engagementDisabled = false;

/** @internal — test only. */
export function _resetForTests() {
  engagementDisabled = false;
}

/**
 * @param {{
 *   db: import('better-sqlite3').Database,
 *   apiClient: {getPinAnalytics: (pinId: string) => Promise<{saves: number, clicks: number, impressions: number}>},
 *   now?: () => Date,
 * }} args
 * @returns {Promise<{updated:number, disabled:boolean, errors:string[]}>}
 */
export async function runOnce({ db, apiClient, now = () => new Date() }) {
  if (engagementDisabled) {
    return { updated: 0, disabled: true, errors: [] };
  }

  const cutoffLookback = new Date(now().getTime() - LOOKBACK_MS).toISOString();
  const cutoffFetched = new Date(now().getTime() - FETCH_WINDOW_MS).toISOString();
  const rows = db.prepare(
    `SELECT id, pinterest_pin_id FROM pinterest_history
       WHERE pinterest_pin_id IS NOT NULL
         AND posted_at >= ?
         AND (engagement_fetched_at IS NULL OR engagement_fetched_at < ?)
       LIMIT ?`,
  ).all(cutoffLookback, cutoffFetched, BATCH_LIMIT);

  const update = db.prepare(
    `UPDATE pinterest_history
        SET saves = ?, clicks = ?, impressions = ?, engagement_fetched_at = ?
      WHERE id = ?`,
  );
  const markSkipped = db.prepare(
    `UPDATE pinterest_history SET engagement_fetched_at = ? WHERE id = ?`,
  );

  let updated = 0;
  const errors = [];
  const stamp = now().toISOString();
  for (const r of rows) {
    try {
      const a = await apiClient.getPinAnalytics(r.pinterest_pin_id);
      update.run(a.saves ?? null, a.clicks ?? null, a.impressions ?? null, stamp, r.id);
      updated += 1;
    } catch (err) {
      const status = err && typeof err === 'object' && 'status' in err ? Number(err.status) : null;
      if (status === 401 || status === 403) {
        engagementDisabled = true;
        markSkipped.run(stamp, r.id);
        return { updated, disabled: true, errors };
      }
      errors.push(`pin ${r.pinterest_pin_id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return { updated, disabled: false, errors };
}

/**
 * @param {{db?: import('better-sqlite3').Database, intervalMs?: number, apiClientFactory: () => object}} args
 * @returns {() => void}
 */
export function startEngagementWorkerDefault({ db, intervalMs = DEFAULT_INTERVAL_MS, apiClientFactory }) {
  let cancelled = false;
  let timer = null;
  async function tick() {
    if (cancelled) return;
    try {
      const realDb = db ?? openDb();
      const apiClient = apiClientFactory();
      await runOnce({ db: realDb, apiClient });
      setWorkerHeartbeat(WORKER_NAME);
    } catch (err) {
      setWorkerError(WORKER_NAME, err instanceof Error ? err.message : String(err));
    } finally {
      if (!cancelled) {
        timer = setTimeout(tick, intervalMs);
        if (typeof timer?.unref === 'function') timer.unref();
      }
    }
  }
  void tick();
  return () => { cancelled = true; if (timer) clearTimeout(timer); };
}
