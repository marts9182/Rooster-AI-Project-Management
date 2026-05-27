/**
 * Reminder routes — CRUD + actions over the reminders table.
 *
 *   GET  /api/reminders?status=pending&limit=20&order=due_at_asc
 *     → 200 { reminders: ReminderRow[] }
 *     → 400 if status not in pending|fired|dismissed|failed
 *     Defaults: status=pending, limit=20, order=due_at_asc.
 *
 *   POST /api/reminders            { title, body?, due_at, channel }
 *     → 201 { reminder: ReminderRow }
 *     → 400 if any of title/due_at/channel missing or channel invalid
 *     Manual reminders get source_kind='manual'.
 *
 *   POST /api/reminders/:id/dismiss
 *     → 200 { ok: true }
 *     → 400 if id non-numeric
 *     → 404 if no such row
 *
 *   POST /api/reminders/:id/snooze   { hours: <positive number> }
 *     → 200 { ok: true, due_at: <new ISO datetime> }
 *     → 400 if id non-numeric or hours missing / non-positive
 *     → 404 if no such row
 *
 * Reminder *firing* (the background scheduler that flips pending→fired and
 * emits a toast/email) lives in `reminders/scheduler.js`. The GET endpoint
 * is the read side that powers the bell-badge popover.
 *
 * @module reminders/routes
 */

import { insertReminder, listByStatus, getById } from './repo.js';

/** @typedef {'pending'|'fired'|'dismissed'|'failed'} ReminderStatus */
/** @type {ReadonlyArray<ReminderStatus>} */
const VALID_STATUS = ['pending', 'fired', 'dismissed', 'failed'];

/** @type {ReadonlyArray<'toast'|'email'|'both'>} */
const VALID_CHANNEL = ['toast', 'email', 'both'];

/** Default page size for GET /api/reminders. */
const DEFAULT_LIMIT = 20;

/** Hard cap so a runaway client can't ask for 1M rows. */
const MAX_LIMIT = 200;

/**
 * @typedef {Object} MountArgs
 * @property {import('better-sqlite3').Database} db
 */

/**
 * Mount reminder routes on the given Express app.
 *
 * @param {import('express').Express} app
 * @param {MountArgs} args
 */
export function mountReminderActionRoutes(app, { db }) {
  // ── GET /api/reminders ──────────────────────────────────────────────────
  app.get('/api/reminders', (req, res) => {
    const status = /** @type {string} */ (req.query.status ?? 'pending');
    if (!VALID_STATUS.includes(/** @type {ReminderStatus} */ (status))) {
      res.status(400).json({ error: `invalid status: ${String(status)}` });
      return;
    }
    let limit = DEFAULT_LIMIT;
    if (req.query.limit !== undefined) {
      const parsed = Number.parseInt(String(req.query.limit), 10);
      if (!Number.isFinite(parsed) || parsed <= 0) {
        res.status(400).json({ error: 'limit must be a positive integer' });
        return;
      }
      limit = Math.min(parsed, MAX_LIMIT);
    }
    const reminders = listByStatus(
      db,
      /** @type {ReminderStatus} */ (status),
    ).slice(0, limit);
    res.json({ reminders });
  });

  // ── POST /api/reminders ─────────────────────────────────────────────────
  app.post('/api/reminders', (req, res) => {
    const body = req.body ?? {};
    const { title, body: text, due_at, channel } = body;
    if (!title || typeof title !== 'string') {
      res.status(400).json({ error: 'title is required' });
      return;
    }
    if (!due_at || typeof due_at !== 'string') {
      res.status(400).json({ error: 'due_at is required' });
      return;
    }
    if (!channel || !VALID_CHANNEL.includes(channel)) {
      res
        .status(400)
        .json({ error: `channel must be one of: ${VALID_CHANNEL.join(', ')}` });
      return;
    }
    const id = insertReminder(db, {
      title,
      body: text ?? null,
      due_at,
      channel,
      source_kind: 'manual',
    });
    const reminder = getById(db, id);
    res.status(201).json({ reminder });
  });

  // ── POST /api/reminders/:id/dismiss ─────────────────────────────────────
  app.post('/api/reminders/:id/dismiss', (req, res) => {
    const id = Number.parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) {
      res.status(400).json({ error: 'id must be numeric' });
      return;
    }
    const row = db.prepare('SELECT id FROM reminders WHERE id=?').get(id);
    if (!row) {
      res.status(404).json({ error: `reminder ${id} not found` });
      return;
    }
    db.prepare("UPDATE reminders SET status='dismissed' WHERE id=?").run(id);
    res.json({ ok: true });
  });

  // ── POST /api/reminders/:id/snooze ──────────────────────────────────────
  app.post('/api/reminders/:id/snooze', (req, res) => {
    const id = Number.parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) {
      res.status(400).json({ error: 'id must be numeric' });
      return;
    }
    const hoursRaw = req.body?.hours;
    const hours = Number(hoursRaw);
    if (!Number.isFinite(hours) || hours <= 0) {
      res.status(400).json({ error: 'hours must be a positive number' });
      return;
    }
    const row = /** @type {{due_at: string} | undefined} */ (
      db.prepare('SELECT due_at FROM reminders WHERE id=?').get(id)
    );
    if (!row) {
      res.status(404).json({ error: `reminder ${id} not found` });
      return;
    }
    const next = new Date(
      new Date(row.due_at).getTime() + hours * 3600 * 1000,
    ).toISOString();
    db.prepare('UPDATE reminders SET due_at=? WHERE id=?').run(next, id);
    res.json({ ok: true, due_at: next });
  });
}
