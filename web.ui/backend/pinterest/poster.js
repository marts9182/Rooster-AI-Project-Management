/**
 * Pinterest poster worker.
 *
 * One iteration (`runOnce`) pulls the next due pending row, asks the
 * injected driver to (a) verify login, (b) post the pin. On success,
 * marks the row posted + records pinterest_history. On login-out, pauses
 * the queue, fires a "Re-login required" reminder, and sets the worker
 * status to error (red tray). On other errors, marks the row failed with
 * the error message.
 *
 * The driver interface is intentionally tiny so tests can pass a fake.
 * The real Playwright-backed driver is `playwrightDriver` below; it is
 * built only when not injected. Tests never import `playwright`.
 *
 * Sleep-until-next strategy (`startPosterWorker`):
 *   - Compute msUntilNext from the earliest pending scheduled_for.
 *   - If nothing pending, sleep 5 minutes and re-check.
 *   - On consecutive failures, back off: 1m -> 5m -> 30m -> pauseQueue().
 *
 * Pinterest DOM selectors used by `playwrightDriver` are best-effort
 * guesses — Pinterest's pin builder UI changes frequently. The selectors
 * are kept in one place here so they're easy to update once the manual
 * live-test script (Task 20) shakes them out.
 *
 * @module pinterest/poster
 */

import fs from 'node:fs';
import { openDb } from '../db.js';
import { recordEvent } from '../events.js';
import { setWorkerHeartbeat, setWorkerError } from '../workerStatus.js';
import { dequeueNext, markPosted, markFailed, pauseQueue } from './queue.js';
import { defaultProfileDir } from './login.js';

const WORKER_NAME = 'pinterest';

/**
 * @typedef {Object} PinterestDriver
 * @property {() => Promise<boolean>} isLoggedIn
 * @property {(args: {imagePath: string, title: string, description: string, link: string}) => Promise<{pinId: string}>} postPin
 * @property {() => Promise<void>} [close]
 */

/**
 * @typedef {Object} RunOnceInput
 * @property {() => PinterestDriver | Promise<PinterestDriver>} [driverFactory]
 */

/**
 * @typedef {Object} RunOnceResult
 * @property {'idle'|'posted'|'failed'|'paused_login_required'} action
 * @property {number|null} [queueId]
 * @property {string} [pinId]
 * @property {string} [error]
 */

/**
 * Process at most one pending pin. Pure of timers — the supervisor loop
 * (`startPosterWorker`) handles cadence.
 *
 * @param {RunOnceInput} [input]
 * @returns {Promise<RunOnceResult>}
 */
export async function runOnce(input = {}) {
  const driverFactory = input.driverFactory ?? (() => playwrightDriver());
  const row = dequeueNext();
  if (!row) {
    setWorkerHeartbeat(WORKER_NAME);
    return { action: 'idle' };
  }

  let driver;
  try {
    driver = await driverFactory();
  } catch (err) {
    const msg = err?.message || String(err);
    markFailed(row.id, `driver failed to start: ${msg}`);
    setWorkerError(WORKER_NAME, msg);
    return { action: 'failed', queueId: row.id, error: `driver failed to start: ${msg}` };
  }

  try {
    const loggedIn = await driver.isLoggedIn();
    if (!loggedIn) {
      // Re-mark this row pending so it doesn't get lost mid-flight.
      const db = openDb();
      db.prepare(`UPDATE pinterest_queue SET status='pending' WHERE id=?`).run(row.id);
      const affected = pauseQueue();
      // Insert a reminder so the user notices.
      const dueAt = new Date(Date.now() + 60 * 1000).toISOString();
      db.prepare(`
        INSERT INTO reminders (title, body, due_at, channel, status, source_kind, source_id)
        VALUES ('Pinterest re-login required',
                'The dashboard could not post a pin because the Pinterest session expired. Open /pinterest and click "Sign in to Pinterest".',
                ?, 'both', 'pending', 'pinterest.queue', ?)
      `).run(dueAt, row.id);
      setWorkerError(WORKER_NAME, 'login required');
      recordEvent('pinterest:login-required', { queue_id: row.id, paused: affected });
      return { action: 'paused_login_required', queueId: row.id };
    }

    if (!fs.existsSync(row.image_path)) {
      const msg = `image_path missing: ${row.image_path}`;
      markFailed(row.id, msg);
      setWorkerError(WORKER_NAME, 'image missing');
      return { action: 'failed', queueId: row.id, error: msg };
    }

    const result = await driver.postPin({
      imagePath: row.image_path,
      title: row.title,
      description: row.description,
      link: row.link_url,
    });
    markPosted(row.id, result.pinId);
    setWorkerHeartbeat(WORKER_NAME);
    return { action: 'posted', queueId: row.id, pinId: result.pinId };
  } catch (err) {
    const msg = err?.message || String(err);
    markFailed(row.id, msg);
    setWorkerError(WORKER_NAME, msg);
    return { action: 'failed', queueId: row.id, error: msg };
  } finally {
    if (driver?.close) {
      try { await driver.close(); } catch { /* ignore */ }
    }
  }
}

/**
 * Compute the milliseconds until the next pending row is due. Returns null
 * if no pending rows exist.
 *
 * @returns {number|null}
 */
export function msUntilNextPending() {
  const db = openDb();
  const row = db.prepare(`
    SELECT scheduled_for FROM pinterest_queue
     WHERE status='pending'
     ORDER BY scheduled_for ASC
     LIMIT 1
  `).get();
  if (!row) return null;
  return new Date(row.scheduled_for).getTime() - Date.now();
}

// --- Supervisor loop -------------------------------------------------------

/** Module-state backoff tracker. Resets on success or queue-pause. */
let consecutiveFailures = 0;
const BACKOFF_MS = [60_000, 5 * 60_000, 30 * 60_000];

/** @type {ReturnType<typeof setTimeout>|null} */
let currentTimer = null;
let workerCancelled = false;

/**
 * Sleep-until-next supervisor loop. Idempotent: calling twice is a no-op
 * on the second call until `stopPosterWorker` runs.
 *
 * @param {{
 *   db?: import('better-sqlite3').Database,
 *   driverFactory?: () => PinterestDriver | Promise<PinterestDriver>,
 *   intervalMs?: number,
 *   idleCheckMs?: number,
 * }} [opts]
 * @returns {() => void}  cancel function (same as stopPosterWorker)
 */
export function startPosterWorker(opts = {}) {
  if (currentTimer) {
    // Already running.
    return stopPosterWorker;
  }
  const idleCheckMs = opts.idleCheckMs ?? opts.intervalMs ?? 5 * 60 * 1000;
  workerCancelled = false;
  consecutiveFailures = 0;

  async function loop() {
    if (workerCancelled) return;
    let result;
    try {
      result = await runOnce({ driverFactory: opts.driverFactory });
    } catch (err) {
      const msg = err?.message || String(err);
      setWorkerError(WORKER_NAME, msg);
      result = { action: 'failed', error: msg };
    }

    // Backoff bookkeeping.
    if (result.action === 'posted' || result.action === 'idle') {
      consecutiveFailures = 0;
    } else if (result.action === 'failed') {
      consecutiveFailures += 1;
      if (consecutiveFailures > BACKOFF_MS.length) {
        // Exhausted the backoff ladder — pause the queue so the user sees
        // the red tray and intervenes.
        try { pauseQueue(); } catch { /* ignore */ }
        setWorkerError(WORKER_NAME, 'paused after repeated failures');
        consecutiveFailures = 0;
      }
    } else if (result.action === 'paused_login_required') {
      consecutiveFailures = 0;
    }

    if (workerCancelled) return;
    let delay;
    if (result.action === 'failed' && consecutiveFailures > 0) {
      delay = BACKOFF_MS[Math.min(consecutiveFailures - 1, BACKOFF_MS.length - 1)];
    } else {
      const ms = msUntilNextPending();
      delay = ms === null
        ? idleCheckMs
        : Math.max(5_000, Math.min(idleCheckMs, ms));
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

// --- Real Playwright-backed driver ----------------------------------------

/**
 * Real Playwright-backed driver. Built lazily so tests never load
 * `playwright`. Pinterest's pin-builder DOM selectors are best-effort and
 * will likely need adjusting once Task 20 runs the live smoke test.
 *
 * @returns {Promise<PinterestDriver>}
 */
async function playwrightDriver() {
  const { chromium } = await import('playwright');
  const profileDir = defaultProfileDir();
  fs.mkdirSync(profileDir, { recursive: true });
  const context = await chromium.launchPersistentContext(profileDir, {
    headless: true,
    viewport: { width: 1280, height: 800 },
  });
  const page = context.pages()[0] ?? (await context.newPage());

  return {
    async isLoggedIn() {
      await page.goto('https://www.pinterest.com/', { waitUntil: 'domcontentloaded' });
      // Pinterest redirects logged-out users to /login.
      if (/\/login\b/.test(page.url())) return false;
      // Belt-and-braces: presence of the profile-header avatar.
      try {
        await page.waitForSelector('[data-test-id="header-profile"]', { timeout: 5000 });
        return true;
      } catch {
        return !/\/login\b/.test(page.url());
      }
    },
    async postPin({ imagePath, title, description, link }) {
      await page.goto('https://www.pinterest.com/pin-builder/', { waitUntil: 'domcontentloaded' });
      // 1) Upload image.
      const fileInput = await page.waitForSelector('input[type="file"]', { timeout: 30_000 });
      await fileInput.setInputFiles(imagePath);
      // 2) Title.
      const titleEl = await page.waitForSelector(
        'input[placeholder*="Add a title" i], [data-test-id="pin-draft-title"] input',
        { timeout: 30_000 },
      );
      await titleEl.fill(title);
      // 3) Description.
      const descEl = await page.waitForSelector(
        'textarea[placeholder*="Tell everyone what your Pin is about" i], [data-test-id="pin-draft-description"] textarea',
        { timeout: 30_000 },
      );
      await descEl.fill(description);
      // 4) Destination link.
      const linkEl = await page.waitForSelector(
        'input[placeholder*="Add a destination link" i], [data-test-id="pin-draft-link"] input',
        { timeout: 30_000 },
      );
      await linkEl.fill(link);
      // 5) Publish (selector list is intentionally broad; live smoke test
      // will narrow it down).
      const publishBtn = await page.waitForSelector(
        'button[data-test-id="board-dropdown-save-button"], button:has-text("Publish"), button:has-text("Save")',
        { timeout: 30_000 },
      );
      await publishBtn.click();
      // 6) Wait for the post-success redirect (/pin/<id>/).
      await page.waitForURL(/pinterest\.com\/pin\/\d+\/?/, { timeout: 5 * 60_000 });
      const m = /pinterest\.com\/pin\/(\d+)\//.exec(page.url());
      return { pinId: m ? m[1] : page.url() };
    },
    async close() {
      await context.close();
    },
  };
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
