/**
 * KDP filesystem scanner.
 *
 * Walks `<kdp-ready-root>/<slug>/`, parses each book's metadata.json +
 * listing.md, and upserts a row into the `kdp_books` table. On first
 * insert it emits a `kdp:new-book` event so the dashboard can offer the
 * "Cover Refinement" workflow before the user marks the book in review.
 *
 * Status preservation rule (critical): when a row already exists, ONLY
 * update the metadata fields (title, subtitle, page_count, trim_size,
 * price_usd, blurb, cover_path, output_dir). Never overwrite
 * `asin`, `status`, `release_date`, `listing_url`, or `notes` — those
 * are user-managed via the dashboard's mark-in-review / mark-published
 * flows and hand-edited notes.
 *
 * @module kdp/scanner
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from '../db.js';
import { recordEvent } from '../events.js';
import { setWorkerHeartbeat, setWorkerError } from '../workerStatus.js';
import {
  parseListingMd,
  parseMetadataJson,
  mergeBookFields,
} from './parser.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** Default scan cadence: 10 minutes. */
const SCAN_INTERVAL_MS = 10 * 60 * 1000;

/** Canonical worker name reported via workerStatus. */
const WORKER_NAME = 'kdp.scanner';

/**
 * Resolve the kdp-ready root directory.
 *   1. `ROOSTER_KDP_READY_DIR` env wins (used by tests).
 *   2. Otherwise: <repo-root>/projects/kdp-puzzle-press/output/kdp-ready/.
 *
 * @returns {string}
 */
function defaultKdpReadyDir() {
  if (process.env.ROOSTER_KDP_READY_DIR) {
    return path.resolve(process.env.ROOSTER_KDP_READY_DIR);
  }
  // __dirname = .../web.ui/backend/kdp ; repo root is three levels up.
  return path.resolve(
    __dirname,
    '..',
    '..',
    '..',
    'projects',
    'kdp-puzzle-press',
    'output',
    'kdp-ready',
  );
}

/**
 * One-shot scan: read each subdir of `rootDir`, upsert into kdp_books,
 * and emit `kdp:new-book` for newly-inserted rows.
 *
 * @param {string} [rootDir] - Override for the kdp-ready root. Defaults to
 *   `process.env.ROOSTER_KDP_READY_DIR` or the project's standard location.
 * @returns {Promise<{inserted:number, updated:number, skipped:number}>}
 */
export async function scanOnce(rootDir) {
  const root = rootDir ?? defaultKdpReadyDir();
  let inserted = 0;
  let updated = 0;
  let skipped = 0;

  if (!fs.existsSync(root)) {
    return { inserted, updated, skipped };
  }

  const db = openDb();
  const entries = fs
    .readdirSync(root, { withFileTypes: true })
    .filter((e) => e.isDirectory());

  for (const entry of entries) {
    const dirAbs = path.join(root, entry.name);
    const metaPath = path.join(dirAbs, 'metadata.json');
    const listingPath = path.join(dirAbs, 'listing.md');
    const coverPath = path.join(dirAbs, 'cover.pdf');

    if (!fs.existsSync(metaPath)) {
      skipped++;
      continue;
    }

    /** @type {ReturnType<typeof parseMetadataJson>} */
    let meta;
    try {
      meta = parseMetadataJson(fs.readFileSync(metaPath, 'utf8'));
    } catch (_err) {
      skipped++;
      continue;
    }

    /** @type {ReturnType<typeof parseListingMd>} */
    let listing;
    try {
      listing = fs.existsSync(listingPath)
        ? parseListingMd(fs.readFileSync(listingPath, 'utf8'))
        : { title: null, subtitle: null, blurb: null };
    } catch (_err) {
      listing = { title: null, subtitle: null, blurb: null };
    }

    const merged = mergeBookFields(meta, listing);
    const slug = merged.slug ?? entry.name;
    // Title is NOT NULL in the schema — fall back to the slug if we somehow
    // failed to extract anything readable.
    const title = merged.title ?? slug;
    const coverRel = fs.existsSync(coverPath)
      ? path.relative(process.cwd(), coverPath)
      : null;

    const existing = db
      .prepare('SELECT id FROM kdp_books WHERE slug = ?')
      .get(slug);

    if (!existing) {
      db.prepare(
        `INSERT INTO kdp_books
           (slug, title, subtitle, status, page_count, trim_size,
            price_usd, blurb, cover_path, output_dir)
         VALUES (?, ?, ?, 'built', ?, ?, ?, ?, ?, ?)`,
      ).run(
        slug,
        title,
        merged.subtitle,
        merged.page_count,
        merged.trim_size,
        merged.price_usd,
        merged.blurb,
        coverRel,
        dirAbs,
      );
      inserted++;
      recordEvent('kdp:new-book', { slug, title });
    } else {
      // Status / asin / release_date / listing_url / notes are explicitly
      // omitted from this UPDATE — those belong to the user.
      db.prepare(
        `UPDATE kdp_books
            SET title       = ?,
                subtitle    = ?,
                page_count  = ?,
                trim_size   = ?,
                price_usd   = ?,
                blurb       = ?,
                cover_path  = ?,
                output_dir  = ?,
                updated_at  = datetime('now')
          WHERE slug = ?`,
      ).run(
        title,
        merged.subtitle,
        merged.page_count,
        merged.trim_size,
        merged.price_usd,
        merged.blurb,
        coverRel,
        dirAbs,
        slug,
      );
      updated++;
    }
  }

  return { inserted, updated, skipped };
}

/**
 * Boot the scanner as a recurring worker. Runs once immediately, then
 * every `intervalMs` (default 10 minutes). On success calls
 * `setWorkerHeartbeat('kdp.scanner')`; on failure calls
 * `setWorkerError('kdp.scanner', message)`.
 *
 * @param {{rootDir?: string, intervalMs?: number}} [opts]
 * @returns {{stop: () => void}}
 */
export function startScanner(opts = {}) {
  const intervalMs = opts.intervalMs ?? SCAN_INTERVAL_MS;
  const rootDir = opts.rootDir;
  let timer = null;
  let stopped = false;

  async function tick() {
    try {
      await scanOnce(rootDir);
      setWorkerHeartbeat(WORKER_NAME);
    } catch (err) {
      setWorkerError(WORKER_NAME, err?.message ?? String(err));
    }
    if (!stopped) {
      timer = setTimeout(tick, intervalMs);
      // Don't keep the event loop alive solely for the next scan.
      if (typeof timer?.unref === 'function') timer.unref();
    }
  }

  // Fire-and-forget kickoff. Errors are swallowed by tick() itself.
  void tick();

  return {
    stop() {
      stopped = true;
      if (timer) clearTimeout(timer);
    },
  };
}
