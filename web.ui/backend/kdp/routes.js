/**
 * KDP HTTP routes:
 *   GET    /books                            — list (optional ?status=)
 *   GET    /books/:slug                      — detail + 8 cached previews
 *   POST   /books/:slug/mark-in-review       — built → in_review + 3-day reminder
 *   POST   /books/:slug/mark-published       — sets ASIN + listing_url, fans out
 *                                              into pinterest_queue (6 rows) and
 *                                              a Day-30 reminder.
 *
 * The Pinterest planner and preview renderer are injected via a factory
 * function so unit tests can stub them out without touching module mocking.
 *
 * @module kdp/routes
 */
import express from 'express';
import { openDb } from '../db.js';
import { recordEvent } from '../events.js';
import { enqueuePinsForBook } from '../pinterest/queue.js';
import { renderPreviewsForBook } from './preview_renderer.js';

/** Amazon ASIN format: 'B0' followed by 8 uppercase alphanumerics. */
const ASIN_RE = /^B0[A-Z0-9]{8}$/;

/** ISO date-only: yyyy-mm-dd. */
const RELEASE_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * @typedef {Object} KdpRouterOptions
 * @property {(bookId: number) => Promise<Array<object>>} [enqueuePinsForBookFn]
 *   Replaces the Plan E enqueue function. Defaults to `enqueuePinsForBook`.
 *   Tests inject a stub so they don't have to render real PNGs.
 * @property {(book: object) => Promise<string[]>} [previewRendererFactory]
 *   Replaces the preview renderer. Defaults to `renderPreviewsForBook`.
 */

/**
 * Look up a book by slug. Returns `null` rather than `undefined` so callers
 * can use `if (!book) return res.status(404)`.
 *
 * @param {import('better-sqlite3').Database} db
 * @param {string} slug
 * @returns {object|null}
 */
function getBySlug(db, slug) {
  return db.prepare('SELECT * FROM kdp_books WHERE slug = ?').get(slug) ?? null;
}

/**
 * Build a new Express Router wired to the KDP endpoints. Inject factories
 * for the Pinterest planner and preview renderer to make the routes
 * unit-testable without module mocking.
 *
 * @param {KdpRouterOptions} [opts]
 * @returns {import('express').Router}
 */
export function createKdpRouter(opts = {}) {
  const enqueuePinsForBookFn = opts.enqueuePinsForBookFn ?? enqueuePinsForBook;
  const previewRendererFactory = opts.previewRendererFactory ?? renderPreviewsForBook;

  const router = express.Router();

  // ── List ─────────────────────────────────────────────────────────────────
  router.get('/books', (req, res) => {
    const db = openDb();
    const statusFilter = typeof req.query.status === 'string' ? req.query.status : null;
    const books = statusFilter
      ? db
          .prepare(
            `SELECT * FROM kdp_books WHERE status = ? ORDER BY updated_at DESC`,
          )
          .all(statusFilter)
      : db
          .prepare(`SELECT * FROM kdp_books ORDER BY updated_at DESC`)
          .all();
    res.json({ books });
  });

  // ── Detail (+ previews) ─────────────────────────────────────────────────
  router.get('/books/:slug', async (req, res) => {
    const db = openDb();
    const book = getBySlug(db, req.params.slug);
    if (!book) {
      return res.status(404).json({ error: 'not_found' });
    }

    /** @type {string[]} */
    let previews = [];
    if (book.output_dir) {
      try {
        previews = await previewRendererFactory(book);
      } catch (_err) {
        previews = [];
      }
    }
    res.json({ book, previews });
  });

  // ── Mark in-review ──────────────────────────────────────────────────────
  router.post('/books/:slug/mark-in-review', (req, res) => {
    const db = openDb();
    const book = getBySlug(db, req.params.slug);
    if (!book) {
      return res.status(404).json({ error: 'not_found' });
    }
    if (book.status !== 'built') {
      return res
        .status(409)
        .json({ error: 'invalid_state', current: book.status });
    }

    db.prepare(
      `UPDATE kdp_books SET status='in_review', updated_at=datetime('now') WHERE id=?`,
    ).run(book.id);

    const due = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
    db.prepare(
      `INSERT INTO reminders (title, body, due_at, channel, status, source_kind, source_id)
       VALUES (?, ?, ?, 'both', 'pending', 'kdp.book', ?)`,
    ).run(
      `Check KDP review status: ${book.title}`,
      `It has been 3 days since you submitted ${book.title} to KDP. Has it gone live?`,
      due,
      book.id,
    );

    recordEvent('kdp:status-changed', {
      slug: book.slug,
      from: 'built',
      to: 'in_review',
    });

    const updated = getBySlug(db, req.params.slug);
    res.json({ book: updated });
  });

  // ── Mark published ──────────────────────────────────────────────────────
  router.post('/books/:slug/mark-published', async (req, res) => {
    const db = openDb();
    const book = getBySlug(db, req.params.slug);
    if (!book) {
      return res.status(404).json({ error: 'not_found' });
    }

    const body = req.body ?? {};
    const asin = typeof body.asin === 'string' ? body.asin.trim() : '';
    const releaseDate =
      typeof body.release_date === 'string' ? body.release_date.trim() : '';

    if (!asin) {
      return res.status(400).json({ error: 'asin_required' });
    }
    if (!ASIN_RE.test(asin)) {
      return res
        .status(400)
        .json({ error: 'asin_invalid', expected: ASIN_RE.source });
    }
    if (!releaseDate || !RELEASE_DATE_RE.test(releaseDate)) {
      return res
        .status(400)
        .json({ error: 'release_date_invalid', expected: 'yyyy-mm-dd' });
    }

    const listingUrl = `https://www.amazon.com/dp/${asin}`;

    db.prepare(
      `UPDATE kdp_books
          SET status='published', asin=?, release_date=?, listing_url=?,
              updated_at=datetime('now')
        WHERE id=?`,
    ).run(asin, releaseDate, listingUrl, book.id);

    const updated = getBySlug(db, req.params.slug);

    // Day-30 reminder
    const day30 = new Date(`${releaseDate}T12:00:00Z`);
    day30.setUTCDate(day30.getUTCDate() + 30);
    db.prepare(
      `INSERT INTO reminders (title, body, due_at, channel, status, source_kind, source_id)
       VALUES (?, ?, ?, 'both', 'pending', 'kdp.book', ?)`,
    ).run(
      `KDP Day-30 sales check: ${updated.title}`,
      `Pull 30-day sales for ${updated.title} (ASIN ${asin}).`,
      day30.toISOString(),
      updated.id,
    );

    // Plan E — materialise PNG pins + insert pinterest_queue rows.
    // Failures here MUST NOT fail the mark-published response; users can
    // re-queue manually from the /pinterest page.
    let pinsQueued = 0;
    try {
      const rows = await enqueuePinsForBookFn(updated.id);
      pinsQueued = Array.isArray(rows) ? rows.length : 0;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn(`enqueuePinsForBook(${updated.id}) failed: ${err?.message || err}`);
    }

    recordEvent('kdp:published', {
      slug: updated.slug,
      asin,
      release_date: releaseDate,
    });

    res.json({ book: updated, pins_queued: pinsQueued });
  });

  return router;
}

/** Default router instance used by server.js. */
export const router = createKdpRouter();

export default router;
