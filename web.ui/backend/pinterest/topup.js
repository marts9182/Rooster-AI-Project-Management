/**
 * Pinterest backlog top-up worker.
 *
 * runOnce() walks published books, computes their queued-but-not-posted count,
 * and generates enough new specs to refill each up to the runway target.
 * Variants are remixed across (palette_seed, tagline_idx, variant) with a
 * uniqueness hash check against the last 60 days of queue + history rows.
 *
 * @module pinterest/topup
 */

import crypto from 'node:crypto';
import { openDb } from '../db.js';
import { setWorkerHeartbeat, setWorkerError } from '../workerStatus.js';

export const WORKER_NAME = 'pinterest.topup';
const DEFAULT_INTERVAL_MS = 6 * 60 * 60 * 1000;

const PIN_TYPES = ['cover_hero', 'interior_preview'];
const VARIANTS = [0, 1, 2, 3];
const PALETTE_SEEDS = [0, 1, 2, 3, 4, 5, 6];
const TAGLINE_COUNT = 8;

/**
 * Compute the variant-uniqueness key: first 16 hex chars of sha256.
 * @param {number} bookId
 * @param {string} pinType
 * @param {number} variant
 * @param {number} paletteSeed
 * @param {number} taglineIdx
 * @returns {string}
 */
export function _uniquenessHash(bookId, pinType, variant, paletteSeed, taglineIdx) {
  const key = `${bookId}|${pinType}|${variant}|${paletteSeed}|${taglineIdx}`;
  return crypto.createHash('sha256').update(key).digest('hex').slice(0, 16);
}

function* candidateSpecs(bookId) {
  for (const pinType of PIN_TYPES) {
    for (const variant of VARIANTS) {
      for (const paletteSeed of PALETTE_SEEDS) {
        for (let taglineIdx = 0; taglineIdx < TAGLINE_COUNT; taglineIdx++) {
          yield {
            pin_type: pinType,
            variant,
            palette_seed: paletteSeed,
            tagline_idx: taglineIdx,
            hash: _uniquenessHash(bookId, pinType, variant, paletteSeed, taglineIdx),
          };
        }
      }
    }
  }
}

function recentHashes(db, bookId) {
  const cutoff = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();
  const rows = db.prepare(
    `SELECT uniqueness_hash FROM pinterest_queue
       WHERE kdp_book_id=? AND uniqueness_hash IS NOT NULL
     UNION
     SELECT h.uniqueness_hash FROM pinterest_history h
       JOIN pinterest_queue q ON q.id = h.queue_id
       WHERE q.kdp_book_id=? AND h.posted_at >= ? AND h.uniqueness_hash IS NOT NULL`,
  ).all(bookId, bookId, cutoff);
  return new Set(rows.map((r) => r.uniqueness_hash));
}

/**
 * @param {{
 *   db: import('better-sqlite3').Database,
 *   emit: (channel: string, payload: unknown) => void,
 *   generatorFn: (spec: object) => Promise<{imagePath:string,title:string,description:string,linkUrl:string}>,
 *   schedulerFn: (count: number) => string[],
 *   target?: number,
 *   now?: () => Date,
 * }} args
 * @returns {Promise<{books_topped_up:number, pins_generated:number, errors:string[]}>}
 */
export async function runOnce({
  db,
  emit,
  generatorFn,
  schedulerFn,
  target = Math.ceil(
    Number(process.env.PINTEREST_TOPUP_DAYS_RUNWAY ?? 30) *
      Number(process.env.PINTEREST_TOPUP_PER_DAY_PER_BOOK ?? 0.5),
  ),
}) {
  const books = db.prepare(
    `SELECT b.id, b.slug, b.title, b.asin,
            COUNT(q.id) FILTER (WHERE q.status IN ('pending','paused','posting')) AS pending_count
       FROM kdp_books b
       LEFT JOIN pinterest_queue q ON q.kdp_book_id = b.id
       WHERE b.status='published'
       GROUP BY b.id`,
  ).all();

  let booksTouched = 0;
  let pinsGenerated = 0;
  const errors = [];

  for (const book of books) {
    if (book.pending_count >= target) continue;
    const need = target - book.pending_count;
    const skip = recentHashes(db, book.id);

    const specs = [];
    for (const cand of candidateSpecs(book.id)) {
      if (specs.length >= need) break;
      if (skip.has(cand.hash)) continue;
      specs.push(cand);
      skip.add(cand.hash);
    }
    if (specs.length === 0) continue;

    let bookErrored = false;
    const generated = [];
    for (const spec of specs) {
      try {
        const gen = await generatorFn({
          bookId: book.id, slug: book.slug, title: book.title, asin: book.asin,
          pin_type: spec.pin_type, variant: spec.variant,
          palette_seed: spec.palette_seed, tagline_idx: spec.tagline_idx,
        });
        generated.push({ spec, gen });
      } catch (err) {
        errors.push(`book ${book.slug}: ${err instanceof Error ? err.message : String(err)}`);
        bookErrored = true;
      }
    }
    if (generated.length === 0) continue;

    const slots = schedulerFn(generated.length);
    const insert = db.prepare(
      `INSERT INTO pinterest_queue
         (kdp_book_id, pin_type, image_path, title, description, link_url,
          status, scheduled_for, uniqueness_hash)
       VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?)`,
    );
    const tx = db.transaction(() => {
      for (let i = 0; i < generated.length; i++) {
        const { spec, gen } = generated[i];
        insert.run(
          book.id, spec.pin_type, gen.imagePath, gen.title, gen.description,
          gen.linkUrl, slots[i] ?? null, spec.hash,
        );
        pinsGenerated += 1;
      }
    });
    tx();
    if (!bookErrored || generated.length > 0) booksTouched += 1;
  }

  emit('pinterest:topup-tick', { books_topped_up: booksTouched, pins_generated: pinsGenerated });
  return { books_topped_up: booksTouched, pins_generated: pinsGenerated, errors };
}

/**
 * Production wiring: real generator + scheduler + DB.
 * @param {{db?: import('better-sqlite3').Database, emit: (c:string,p:unknown)=>void, intervalMs?: number}} args
 * @returns {() => void} stop function
 */
export function startTopupWorkerDefault({ db, emit, intervalMs = DEFAULT_INTERVAL_MS }) {
  let cancelled = false;
  let timer = null;

  async function tick() {
    if (cancelled) return;
    try {
      const { generatePin } = await import('./generator.js');
      const { assignSlots } = await import('./scheduler.js');
      const realDb = db ?? openDb();
      const schedulerCfg = {
        timeZone: process.env.PINTEREST_TZ ?? 'America/Los_Angeles',
        perDayMin: 3, perDayMax: 5, windowStartHour: 9, windowEndHour: 21,
      };
      const generatorFn = async (s) => {
        const out = await generatePin({
          slug: s.slug, pinType: s.pin_type, index: s.variant,
          sourcePngPath: '',
          title: s.title,
        });
        return {
          imagePath: out.imagePath ?? out,
          title: s.title,
          description: `${s.title} — fresh on Pocket Rooster Press`,
          linkUrl: s.asin ? `https://amazon.com/dp/${s.asin}` : 'https://amazon.com',
        };
      };
      const schedulerFn = (count) => {
        const existing = realDb.prepare(
          `SELECT scheduled_for FROM pinterest_queue
             WHERE status='pending' AND scheduled_for IS NOT NULL`,
        ).all();
        return assignSlots({
          count, existingQueue: existing, now: new Date(), config: schedulerCfg,
        });
      };
      await runOnce({ db: realDb, emit, generatorFn, schedulerFn });
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
  return () => {
    cancelled = true;
    if (timer) clearTimeout(timer);
  };
}
