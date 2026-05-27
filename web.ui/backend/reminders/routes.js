/**
 * Reminder action routes — user-facing CRUD over the reminders table.
 *
 *   POST /api/reminders/:id/dismiss
 *     → 200 { ok: true }
 *     → 400 if id is non-numeric
 *     → 404 if no such row
 *   POST /api/reminders/:id/snooze   { hours: <positive number> }
 *     → 200 { ok: true, due_at: <new ISO datetime> }
 *     → 400 if id is non-numeric or hours is missing / non-positive
 *     → 404 if no such row
 *
 * Reminder *firing* (the background scheduler that flips status pending→fired
 * and emits a toast) is owned by Plan D. This file ships ahead of the
 * scheduler because the Calendar drawer (Plan C Task 13) is the first
 * consumer of snooze + dismiss.
 *
 * @module reminders/routes
 */

/**
 * @typedef {Object} MountArgs
 * @property {import('better-sqlite3').Database} db
 */

/**
 * Mount reminder action routes on the given Express app.
 *
 * @param {import('express').Express} app
 * @param {MountArgs} args
 */
export function mountReminderActionRoutes(app, { db }) {
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
