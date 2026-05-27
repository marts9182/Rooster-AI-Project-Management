/**
 * @file Small SQL helper layer for the `reminders` table.
 * Pure functions that take a better-sqlite3 Database handle. No I/O beyond SQL.
 */

/**
 * @typedef {Object} ReminderRow
 * @property {number} id
 * @property {string} title
 * @property {string|null} body
 * @property {string} due_at      ISO datetime
 * @property {'toast'|'email'|'both'} channel
 * @property {'pending'|'fired'|'dismissed'|'failed'} status
 * @property {string|null} source_kind
 * @property {number|null} source_id
 * @property {string|null} payload_json
 * @property {string|null} fired_at
 * @property {string} created_at
 */

/**
 * @typedef {Object} NewReminder
 * @property {string} title
 * @property {string} [body]
 * @property {string} due_at
 * @property {'toast'|'email'|'both'} channel
 * @property {string} [source_kind]
 * @property {number} [source_id]
 * @property {string} [payload_json]
 */

/**
 * Insert a new pending reminder. Returns the new row id.
 * @param {import('better-sqlite3').Database} db
 * @param {NewReminder} input
 * @returns {number}
 */
export function insertReminder(db, input) {
  const stmt = db.prepare(`
    INSERT INTO reminders (title, body, due_at, channel, status, source_kind, source_id, payload_json)
    VALUES (@title, @body, @due_at, @channel, 'pending', @source_kind, @source_id, @payload_json)
  `);
  const info = stmt.run({
    title: input.title,
    body: input.body ?? null,
    due_at: input.due_at,
    channel: input.channel,
    source_kind: input.source_kind ?? null,
    source_id: input.source_id ?? null,
    payload_json: input.payload_json ?? null,
  });
  return Number(info.lastInsertRowid);
}

/**
 * Pending reminders whose due_at is <= the given ISO timestamp.
 * Ordered by due_at ASC for stable fire order.
 * @param {import('better-sqlite3').Database} db
 * @param {string} nowIso
 * @returns {ReminderRow[]}
 */
export function listPending(db, nowIso) {
  return /** @type {ReminderRow[]} */ (
    db
      .prepare(
        `SELECT * FROM reminders WHERE status = 'pending' AND due_at <= ? ORDER BY due_at ASC`,
      )
      .all(nowIso)
  );
}

/**
 * All reminders matching the status, ordered by due_at ASC.
 * @param {import('better-sqlite3').Database} db
 * @param {'pending'|'fired'|'dismissed'|'failed'} status
 * @returns {ReminderRow[]}
 */
export function listByStatus(db, status) {
  return /** @type {ReminderRow[]} */ (
    db.prepare(`SELECT * FROM reminders WHERE status = ? ORDER BY due_at ASC`).all(status)
  );
}

/**
 * @param {import('better-sqlite3').Database} db
 * @param {number} id
 * @returns {ReminderRow|undefined}
 */
export function getById(db, id) {
  return /** @type {ReminderRow|undefined} */ (
    db.prepare(`SELECT * FROM reminders WHERE id = ?`).get(id)
  );
}

/**
 * @param {import('better-sqlite3').Database} db
 * @param {number} id
 */
export function markFired(db, id) {
  db.prepare(`UPDATE reminders SET status='fired', fired_at=datetime('now') WHERE id = ?`).run(id);
}

/**
 * @param {import('better-sqlite3').Database} db
 * @param {number} id
 */
export function markFailed(db, id) {
  db.prepare(`UPDATE reminders SET status='failed' WHERE id = ?`).run(id);
}

/**
 * @param {import('better-sqlite3').Database} db
 * @param {number} id
 */
export function dismiss(db, id) {
  db.prepare(`UPDATE reminders SET status='dismissed' WHERE id = ?`).run(id);
}

/**
 * Set a new due_at and (re)set status to pending.
 * @param {import('better-sqlite3').Database} db
 * @param {number} id
 * @param {string} newDueIso
 */
export function snooze(db, id, newDueIso) {
  db.prepare(`UPDATE reminders SET due_at = ?, status = 'pending' WHERE id = ?`).run(newDueIso, id);
}

/**
 * @param {import('better-sqlite3').Database} db
 * @returns {number}
 */
export function countPending(db) {
  const row = /** @type {{n: number}} */ (
    db.prepare(`SELECT COUNT(*) AS n FROM reminders WHERE status = 'pending'`).get()
  );
  return row.n;
}
