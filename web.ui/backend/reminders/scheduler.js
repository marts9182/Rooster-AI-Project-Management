/**
 * @file Reminder scheduler — node-cron tick fires due reminders every 60s.
 *
 * Wiring: `startScheduler(db, options)` registers a cron job (`* * * * *`)
 * that on each tick selects pending reminders due now, delivers them on the
 * configured channels, marks them fired/failed, and broadcasts events via
 * the injected `recordEvent` (which handles both the audit-log INSERT and
 * SSE fan-out in a single call).
 *
 * The pure `tick(db, deps)` function is the testable unit. The cron wrapper
 * exists only to call it every minute and pump worker heartbeats.
 *
 * @module reminders/scheduler
 */

import cron from 'node-cron';
import { listPending, markFired, markFailed } from './repo.js';
import { sendToast as defaultSendToast } from './toast.js';
import { sendEmail as defaultSendEmail } from './email.js';

/**
 * @typedef {import('./repo.js').ReminderRow} ReminderRow
 *
 * @typedef {Object} TickDeps
 * @property {(input: { title: string, body?: string }) => Promise<{ok: true}>} sendToast
 * @property {(input: { to: string, from?: string, subject: string, text: string }) => Promise<{ok: true, messageId: string}>} sendEmail
 * @property {(kind: string, payload: object) => void} recordEvent
 *   Plan A's `recordEvent` — writes the audit-log row AND fans out to SSE
 *   subscribers in a single call.
 * @property {() => { gmail_address: string|null }} [profileFor]
 *   Returns the profile row used for email delivery. Optional in tests
 *   when no email reminders are exercised.
 * @property {() => Date} [now]
 */

/** Module-level counter so consecutive failures are tracked across ticks. */
let consecutiveFailureTicks = 0;

/** Test helper — reset cross-tick failure counter. */
export function _resetConsecutiveFailures() {
  consecutiveFailureTicks = 0;
}

/**
 * One scheduler tick. Pure with respect to deps; database mutations happen
 * via repo.js.
 *
 * Behavior:
 *   - `listPending(db, now)` → rows due now (status='pending', due_at<=now)
 *   - Each row delivered on its `channel` (toast / email / both)
 *   - All-deliveries-succeed → markFired + recordEvent('reminder:fired')
 *   - Any delivery-fails → markFailed + recordEvent('reminder:failed')
 *   - If the current tick had any failed reminder AND the previous tick
 *     also had any failed reminder, broadcast
 *     `system:reminder-delivery-degraded`. A clean tick resets the streak.
 *
 * @param {import('better-sqlite3').Database} db
 * @param {TickDeps} deps
 * @returns {Promise<{fired: number, failed: number}>}
 */
export async function tick(db, deps) {
  const now = (deps.now ?? (() => new Date()))();
  const nowIso = now.toISOString();
  const rows = listPending(db, nowIso);
  if (rows.length === 0) {
    // An empty tick is "clean" — it resets the consecutive-failure streak so
    // a single quiet minute clears the degraded flag.
    consecutiveFailureTicks = 0;
    return { fired: 0, failed: 0 };
  }
  const profile = (deps.profileFor ?? (() => ({ gmail_address: null })))();
  let fired = 0;
  let failed = 0;
  let lastError = null;

  for (const row of rows) {
    try {
      await deliver(row, profile, deps);
      markFired(db, row.id);
      deps.recordEvent('reminder:fired', {
        id: row.id,
        title: row.title,
        body: row.body,
        channel: row.channel,
      });
      fired += 1;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      lastError = message;
      markFailed(db, row.id);
      deps.recordEvent('reminder:failed', {
        id: row.id,
        title: row.title,
        error: message,
      });
      failed += 1;
    }
  }

  if (failed > 0) {
    consecutiveFailureTicks += 1;
    if (consecutiveFailureTicks >= 2) {
      deps.recordEvent('system:reminder-delivery-degraded', {
        consecutiveFailureTicks,
        lastError,
      });
    }
  } else {
    consecutiveFailureTicks = 0;
  }

  return { fired, failed };
}

/**
 * Deliver one reminder on the channels it specifies. Throws on any channel
 * error so the caller can flip the row to `failed`.
 *
 * @param {ReminderRow} row
 * @param {{ gmail_address: string|null }} profile
 * @param {TickDeps} deps
 */
async function deliver(row, profile, deps) {
  /** @type {Error[]} */
  const errors = [];
  if (row.channel === 'toast' || row.channel === 'both') {
    try {
      await deps.sendToast({ title: row.title, body: row.body ?? '' });
    } catch (err) {
      errors.push(err instanceof Error ? err : new Error(String(err)));
    }
  }
  if (row.channel === 'email' || row.channel === 'both') {
    if (!profile.gmail_address) {
      errors.push(
        new Error(
          'profile.gmail_address not set; cannot send email reminder',
        ),
      );
    } else {
      try {
        await deps.sendEmail({
          to: profile.gmail_address,
          from: profile.gmail_address,
          subject: row.title,
          text: row.body ?? '(no body)',
        });
      } catch (err) {
        errors.push(err instanceof Error ? err : new Error(String(err)));
      }
    }
  }
  if (errors.length > 0) {
    throw errors[0];
  }
}

/**
 * @typedef {Object} StartSchedulerOverrides
 * @property {TickDeps['sendToast']}    [sendToast]
 * @property {TickDeps['sendEmail']}    [sendEmail]
 * @property {TickDeps['recordEvent']}  [recordEvent]
 * @property {TickDeps['profileFor']}   [profileFor]
 * @property {TickDeps['now']}          [now]
 * @property {string}                   [cronExpression]
 *   Defaults to `'* * * * *'` (every minute). Override in tests.
 * @property {() => void}               [onTick]
 *   Fired before each tick begins; production wires this to
 *   `setWorkerHeartbeat('reminders')`.
 * @property {(message: string) => void} [onError]
 *   Fired with the tick error message when a tick throws; production
 *   wires this to `setWorkerError('reminders', msg)`.
 */

/**
 * Start the cron job. Returns a stop() function for shutdown.
 *
 * The cron wrapper is intentionally tiny: it pumps the heartbeat, runs one
 * `tick`, and reports any uncaught error via `onError`. Per-reminder
 * failures are routed through `markFailed` + `recordEvent` inside `tick`
 * and never surface here.
 *
 * @param {import('better-sqlite3').Database} db
 * @param {StartSchedulerOverrides} [overrides]
 * @returns {() => void}
 */
export function startScheduler(db, overrides = {}) {
  /** @type {TickDeps} */
  const deps = {
    sendToast: overrides.sendToast ?? defaultSendToast,
    sendEmail: overrides.sendEmail ?? defaultSendEmail,
    recordEvent: overrides.recordEvent ?? (() => {}),
    profileFor:
      overrides.profileFor ??
      (() => {
        const row = /** @type {{gmail_address: string|null}|undefined} */ (
          db.prepare(`SELECT gmail_address FROM profile WHERE id = 1`).get()
        );
        return row ?? { gmail_address: null };
      }),
    now: overrides.now,
  };
  const expression = overrides.cronExpression ?? '* * * * *';
  const task = cron.schedule(expression, () => {
    try {
      overrides.onTick?.();
    } catch {
      // Heartbeat is best-effort; never let it kill the tick.
    }
    tick(db, deps).catch((err) => {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[reminders.scheduler] tick crashed:', msg);
      try {
        overrides.onError?.(msg);
      } catch {
        /* ignore */
      }
    });
  });
  return () => task.stop();
}
