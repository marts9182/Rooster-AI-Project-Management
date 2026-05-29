/**
 * Queue helpers — DB-facing operations on pinterest_queue and pinterest_history.
 *
 * Public API used by Plan B (mark-published flow): enqueuePinsForBook(bookId).
 * Public API used by Plan E poster + routes: dequeueNext / markPosted /
 * markFailed / pauseQueue / resumeQueue / listQueue / listHistory /
 * updateQueueRow / cancelQueueRow.
 *
 * @module pinterest/queue
 */

import fs from 'node:fs';
import path from 'node:path';
import { openDb } from '../db.js';
import { recordEvent } from '../events.js';
import { generatePinImage } from './generator.js';
import { assignSlots } from './scheduler.js';

/**
 * @typedef {Object} QueueRow
 * @property {number} id
 * @property {number|null} kdp_book_id
 * @property {'cover_hero'|'interior_preview'} pin_type
 * @property {string} image_path
 * @property {string} title
 * @property {string} description
 * @property {string} link_url
 * @property {string} status
 * @property {string} scheduled_for
 * @property {number} attempts
 * @property {string|null} last_error
 */

/**
 * @returns {{timeZone: string, perDayMin: number, perDayMax: number, windowStartHour: number, windowEndHour: number}}
 */
function loadScheduleConfig() {
  const db = openDb();
  const prof = db.prepare('SELECT time_zone FROM profile WHERE id=1').get();
  return {
    timeZone: prof?.time_zone ?? 'America/Los_Angeles',
    perDayMin: 3,
    perDayMax: 5,
    windowStartHour: 9,
    windowEndHour: 21,
  };
}

/**
 * Generate up to 6 pin PNGs for a published book and insert pinterest_queue
 * rows with jittered scheduled_for timestamps. Skips any pin whose source
 * PNG is absent (gracefully degrades to fewer rows).
 *
 * @param {number} bookId
 * @returns {Promise<QueueRow[]>}
 */
export async function enqueuePinsForBook(bookId) {
  const db = openDb();
  const book = db.prepare(`
    SELECT id, slug, title, subtitle, asin, blurb, cover_path, output_dir
      FROM kdp_books WHERE id = ?
  `).get(bookId);
  if (!book) throw new Error(`kdp_book ${bookId} not found`);
  if (!book.asin) throw new Error(`kdp_book ${bookId} has no ASIN — cannot build link_url`);

  // Six pin specs: 1 cover_hero + 5 interior_preview.
  const linkUrl = `https://www.amazon.com/dp/${book.asin}`;
  const baseDesc = book.blurb
    ? String(book.blurb).replace(/<[^>]+>/g, '').slice(0, 480)
    : `${book.title} — available now on Amazon.`;

  const candidates = [
    {
      pinType: 'cover_hero',
      sourcePath: book.cover_path,
      title: book.title,
      subtitle: book.subtitle ?? undefined,
    },
    ...[1, 2, 3, 4, 5].map((i) => ({
      pinType: /** @type {const} */ ('interior_preview'),
      sourcePath: book.output_dir
        ? path.join(book.output_dir, `interior_${i}.png`)
        : null,
      title: interiorTitle(book.title, i),
      subtitle: book.subtitle ?? undefined,
    })),
  ];

  // Filter to only those whose source PNG exists on disk; re-index 0-based
  // among the survivors.
  /** @type {{pinType: 'cover_hero'|'interior_preview', sourcePath: string, title: string, subtitle?: string, index: number}[]} */
  const valid = [];
  let idx = 0;
  for (const c of candidates) {
    if (c.sourcePath && fs.existsSync(c.sourcePath)) {
      valid.push({ ...c, sourcePath: c.sourcePath, index: idx });
      idx++;
    }
  }
  if (valid.length === 0) return [];

  // Render each pin to PNG.
  /** @type {{path: string, pinType: 'cover_hero'|'interior_preview', title: string, description: string}[]} */
  const rendered = [];
  for (const v of valid) {
    const out = await generatePinImage({
      slug: book.slug,
      pinType: v.pinType,
      index: v.index,
      sourcePngPath: v.sourcePath,
      title: v.title,
      subtitle: v.subtitle,
    });
    rendered.push({
      path: out,
      pinType: v.pinType,
      title: v.title,
      description: baseDesc,
    });
  }

  // Assign jittered slots based on the live queue.
  const existing = db.prepare(`
    SELECT scheduled_for FROM pinterest_queue
     WHERE status IN ('pending','posting','paused')
  `).all();
  const slots = assignSlots({
    count: rendered.length,
    existingQueue: existing,
    now: new Date(),
    config: loadScheduleConfig(),
  });

  // Insert rows.
  const insert = db.prepare(`
    INSERT INTO pinterest_queue
      (kdp_book_id, pin_type, image_path, title, description, link_url, status, scheduled_for)
    VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)
  `);
  /** @type {QueueRow[]} */
  const inserted = [];
  const txn = db.transaction(() => {
    for (let i = 0; i < rendered.length; i++) {
      const r = rendered[i];
      const info = insert.run(
        book.id,
        r.pinType,
        r.path,
        r.title,
        r.description,
        linkUrl,
        slots[i],
      );
      const row = /** @type {QueueRow} */ (
        db.prepare('SELECT * FROM pinterest_queue WHERE id=?').get(Number(info.lastInsertRowid))
      );
      inserted.push(row);
    }
  });
  txn();

  for (const row of inserted) {
    recordEvent('pinterest:pin-scheduled', {
      queue_id: row.id,
      kdp_book_id: row.kdp_book_id,
      scheduled_for: row.scheduled_for,
      pin_type: row.pin_type,
    });
  }

  return inserted;
}

/**
 * @param {string} bookTitle
 * @param {number} i  1-based
 * @returns {string}
 */
function interiorTitle(bookTitle, i) {
  const variants = [
    `Inside ${bookTitle}: a peek`,
    `${bookTitle} — sample pages`,
    `${bookTitle} — large-print layout`,
    `${bookTitle} — what's inside`,
    `${bookTitle} — bonus pages`,
  ];
  return variants[i - 1] ?? variants[0];
}

/**
 * Pull the next pin whose scheduled_for is in the past and status='pending'.
 * Flips it to 'posting' atomically.
 *
 * @returns {QueueRow|null}
 */
export function dequeueNext() {
  const db = openDb();
  const now = new Date().toISOString();
  const txn = db.transaction(() => {
    const row = db.prepare(`
      SELECT * FROM pinterest_queue
       WHERE status='pending' AND scheduled_for <= ?
       ORDER BY scheduled_for ASC
       LIMIT 1
    `).get(now);
    if (!row) return null;
    db.prepare(`UPDATE pinterest_queue SET status='posting' WHERE id=?`).run(row.id);
    return /** @type {QueueRow} */ ({ ...row, status: 'posting' });
  });
  return txn();
}

/**
 * Mark a posting row as posted; insert a pinterest_history row.
 *
 * @param {number} id
 * @param {string} pinterestPinId
 */
export function markPosted(id, pinterestPinId) {
  const db = openDb();
  const now = new Date().toISOString();
  const txn = db.transaction(() => {
    const row = db.prepare('SELECT image_path FROM pinterest_queue WHERE id=?').get(id);
    db.prepare(`UPDATE pinterest_queue SET status='posted' WHERE id=?`).run(id);
    const pinterestUrl = pinterestPinId
      ? `https://www.pinterest.com/pin/${pinterestPinId}/`
      : null;
    db.prepare(`
      INSERT INTO pinterest_history
        (queue_id, pinterest_pin_id, posted_at, success, error_message,
         status, image_path, pinterest_url)
      VALUES (?, ?, ?, 1, NULL, 'posted', ?, ?)
    `).run(id, pinterestPinId, now, row?.image_path ?? null, pinterestUrl);
  });
  txn();
  recordEvent('pinterest:pin-posted', { queue_id: id, pinterest_pin_id: pinterestPinId });
}

/**
 * Mark a posting row as failed; insert a pinterest_history failure row.
 *
 * @param {number} id
 * @param {string} errorMessage
 */
export function markFailed(id, errorMessage) {
  const db = openDb();
  const now = new Date().toISOString();
  const txn = db.transaction(() => {
    const row = db.prepare('SELECT image_path FROM pinterest_queue WHERE id=?').get(id);
    db.prepare(`
      UPDATE pinterest_queue
         SET status='failed', attempts = attempts + 1, last_error = ?
       WHERE id=?
    `).run(errorMessage, id);
    db.prepare(`
      INSERT INTO pinterest_history
        (queue_id, pinterest_pin_id, posted_at, success, error_message,
         status, image_path)
      VALUES (?, NULL, ?, 0, ?, 'failed', ?)
    `).run(id, now, errorMessage, row?.image_path ?? null);
  });
  txn();
  recordEvent('pinterest:pin-failed', { queue_id: id, error: errorMessage });
}

/**
 * Flip every pending row to paused.
 *
 * @returns {number}  rows affected
 */
export function pauseQueue() {
  const db = openDb();
  const info = db.prepare(`UPDATE pinterest_queue SET status='paused' WHERE status='pending'`).run();
  if (info.changes > 0) {
    recordEvent('pinterest:login-required', { reason: 'queue paused', affected: info.changes });
  }
  return info.changes;
}

/**
 * Flip every paused row back to pending.
 *
 * @returns {number}  rows affected
 */
export function resumeQueue() {
  const db = openDb();
  const info = db.prepare(`UPDATE pinterest_queue SET status='pending' WHERE status='paused'`).run();
  return info.changes;
}

/**
 * @returns {QueueRow[]}  pending+posting+paused, ascending by scheduled_for.
 */
export function listQueue() {
  const db = openDb();
  return db.prepare(
    `SELECT q.*, b.slug AS book_slug
       FROM pinterest_queue q
       LEFT JOIN kdp_books b ON b.id = q.kdp_book_id
      WHERE q.status IN ('pending', 'posting', 'paused')
      ORDER BY q.scheduled_for ASC`,
  ).all();
}

/**
 * @param {number} limit
 * @returns {Array<{
 *   id: number,
 *   queue_id: number,
 *   pinterest_pin_id: string|null,
 *   posted_at: string,
 *   success: boolean,
 *   error_message: string|null,
 *   title: string,
 *   image_path: string,
 * }>}
 */
export function listHistory(limit) {
  const db = openDb();
  const rows = db.prepare(`
    SELECT h.id, h.queue_id, h.pinterest_pin_id, h.posted_at, h.success, h.error_message,
           q.title, q.image_path
      FROM pinterest_history h
      JOIN pinterest_queue q ON q.id = h.queue_id
     ORDER BY h.posted_at DESC
     LIMIT ?
  `).all(limit);
  return rows.map((r) => ({ ...r, success: r.success === 1 }));
}

/**
 * @param {number} id
 * @param {{title?: string, description?: string, scheduled_for?: string}} patch
 */
export function updateQueueRow(id, patch) {
  const db = openDb();
  const sets = [];
  const args = [];
  if (typeof patch.title === 'string') { sets.push('title = ?'); args.push(patch.title); }
  if (typeof patch.description === 'string') { sets.push('description = ?'); args.push(patch.description); }
  if (typeof patch.scheduled_for === 'string') { sets.push('scheduled_for = ?'); args.push(patch.scheduled_for); }
  if (sets.length === 0) return;
  args.push(id);
  db.prepare(`UPDATE pinterest_queue SET ${sets.join(', ')} WHERE id=? AND status IN ('pending','paused')`).run(...args);
}

/**
 * @param {number} id
 */
export function cancelQueueRow(id) {
  const db = openDb();
  db.prepare(`DELETE FROM pinterest_queue WHERE id=? AND status IN ('pending','paused')`).run(id);
}
