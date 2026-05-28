/**
 * KDP bookshelf ingest — match scraped books to dashboard rows, then commit.
 *
 * No HTTP layer here; the routes module wraps these functions.
 *
 * @module kdp/ingest
 */
import { randomUUID } from 'node:crypto';
import { kdpToDashboardStatus } from './status_map.js';

/**
 * @typedef {{asin: string, kdp_title: string, kdp_status: string, format?: string}} IngestedBook
 *
 * @typedef {Object} Preview
 * @property {string} preview_id
 * @property {string} created_at
 * @property {Match[]} matches
 * @property {Ambiguous[]} ambiguous
 * @property {Orphan[]} orphans
 * @property {{dashboard_slug: string, dashboard_title: string}[]} missing_from_kdp
 *
 * @typedef {Object} Match
 * @property {'MATCHED_BY_ASIN'|'MATCHED_BY_TITLE'} kind
 * @property {string} dashboard_slug
 * @property {string} dashboard_title_before
 * @property {IngestedBook} scraped
 * @property {string|null} new_dashboard_status
 * @property {boolean} title_will_change
 * @property {boolean} status_ambiguous
 *
 * @typedef {Object} Ambiguous
 * @property {IngestedBook} scraped
 * @property {string[]} candidate_slugs
 *
 * @typedef {Object} Orphan
 * @property {IngestedBook} scraped
 */

/**
 * Normalize a title for fuzzy matching:
 *  - lowercase
 *  - drop everything after the first colon (subtitle)
 *  - drop "Vol. N" / "Vol N" / "Volume N" volume markers entirely so all
 *    volumes of the same series collapse together (ambiguity is resolved
 *    later via the multi-candidate path)
 *  - replace non-alphanumeric runs with hyphens
 *  - trim leading/trailing hyphens
 *
 * Pure; exported under an underscore name for unit testing.
 *
 * @param {string} raw
 * @returns {string}
 */
export function _normalizeTitle(raw) {
  let s = String(raw ?? '').toLowerCase();
  const colonIdx = s.indexOf(':');
  if (colonIdx !== -1) s = s.slice(0, colonIdx);
  s = s.replace(/\b(vol\.?|volume)\s+\d+\b/g, '');
  s = s.replace(/[^a-z0-9]+/g, '-');
  s = s.replace(/^-+|-+$/g, '');
  return s;
}

/** Slugify a KDP title for orphan-row creation. Preserves the volume number. */
function _slugify(title) {
  return String(title ?? '')
    .toLowerCase()
    .replace(/\b(vol\.?|volume)\s+(\d+)\b/g, 'vol-$2')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * @param {{db: import('better-sqlite3').Database, scraped: IngestedBook[]}} args
 * @returns {Preview}
 */
export function computeIngestPreview({ db, scraped }) {
  const rows = db
    .prepare('SELECT slug, title, asin FROM kdp_books')
    .all();

  const byAsin = new Map();
  /** @type {Map<string, Array<{slug: string, title: string, asin: string|null}>>} */
  const byNormalizedTitle = new Map();
  for (const r of rows) {
    if (r.asin) byAsin.set(r.asin, r);
    const norm = _normalizeTitle(r.title);
    const list = byNormalizedTitle.get(norm) ?? [];
    list.push({ slug: r.slug, title: r.title, asin: r.asin ?? null });
    byNormalizedTitle.set(norm, list);
  }

  /** @type {Match[]} */
  const matches = [];
  /** @type {Ambiguous[]} */
  const ambiguous = [];
  /** @type {Orphan[]} */
  const orphans = [];
  const matchedSlugs = new Set();

  for (const s of scraped) {
    const mapped = kdpToDashboardStatus(s.kdp_status);
    const statusAmbiguous = 'ambiguous' in mapped;
    const newStatus = statusAmbiguous ? null : mapped.status;

    const byAsinHit = byAsin.get(s.asin);
    if (byAsinHit) {
      matches.push({
        kind: 'MATCHED_BY_ASIN',
        dashboard_slug: byAsinHit.slug,
        dashboard_title_before: byAsinHit.title,
        scraped: s,
        new_dashboard_status: newStatus,
        title_will_change: byAsinHit.title !== s.kdp_title,
        status_ambiguous: statusAmbiguous,
      });
      matchedSlugs.add(byAsinHit.slug);
      continue;
    }

    const norm = _normalizeTitle(s.kdp_title);
    const allCandidates = byNormalizedTitle.get(norm) ?? [];
    // A dashboard row whose ASIN is already set to something *other* than the
    // scraped book's ASIN is a different physical listing — don't title-match
    // those, even if the normalized titles collide. Rows with no ASIN, or with
    // the same ASIN as the scrape, are still valid candidates.
    const candidates = allCandidates.filter(
      (c) => !c.asin || c.asin === s.asin,
    );
    if (candidates.length === 1) {
      matches.push({
        kind: 'MATCHED_BY_TITLE',
        dashboard_slug: candidates[0].slug,
        dashboard_title_before: candidates[0].title,
        scraped: s,
        new_dashboard_status: newStatus,
        title_will_change: candidates[0].title !== s.kdp_title,
        status_ambiguous: statusAmbiguous,
      });
      matchedSlugs.add(candidates[0].slug);
    } else if (candidates.length > 1) {
      ambiguous.push({
        scraped: s,
        candidate_slugs: candidates.map((c) => c.slug),
      });
    } else {
      orphans.push({ scraped: s });
    }
  }

  /** @type {{dashboard_slug: string, dashboard_title: string}[]} */
  const missing_from_kdp = [];
  for (const r of rows) {
    if (!matchedSlugs.has(r.slug)) {
      missing_from_kdp.push({ dashboard_slug: r.slug, dashboard_title: r.title });
    }
  }

  return {
    preview_id: randomUUID(),
    created_at: new Date().toISOString(),
    matches,
    ambiguous,
    orphans,
    missing_from_kdp,
  };
}

/**
 * Apply a preview commit. Updates matched rows, creates confirmed orphans,
 * applies ambiguous resolutions. Returns a summary; per-row errors are
 * captured in `errors` without aborting the rest.
 *
 * @param {{
 *   db: import('better-sqlite3').Database,
 *   preview: Preview,
 *   confirmedOrphans: string[],
 *   ambiguousResolutions: Record<string, string | null>,
 * }} args
 * @returns {{applied: number, created: number, skipped: number, errors: string[]}}
 */
export function applyIngestCommit({
  db,
  preview,
  confirmedOrphans,
  ambiguousResolutions,
}) {
  const now = new Date().toISOString();
  let applied = 0;
  let created = 0;
  let skipped = 0;
  /** @type {string[]} */
  const errors = [];

  const updateBySlug = db.prepare(
    `UPDATE kdp_books
        SET title=@title, asin=@asin, status=@status,
            kdp_status_raw=@kdp_status_raw, last_scraped_at=@last_scraped_at,
            updated_at=datetime('now')
      WHERE slug=@slug`,
  );

  const insertOrphan = db.prepare(
    `INSERT INTO kdp_books (slug, title, asin, status, kdp_status_raw, last_scraped_at, output_dir)
     VALUES (@slug, @title, @asin, @status, @kdp_status_raw, @last_scraped_at, '')`,
  );

  function mappedStatus(kdpStatus) {
    const mapped = kdpToDashboardStatus(kdpStatus);
    if ('ambiguous' in mapped) return null;
    return mapped.status;
  }

  // Matches (ASIN + title).
  for (const m of preview.matches) {
    const status = mappedStatus(m.scraped.kdp_status);
    if (!status) {
      skipped += 1;
      continue;
    }
    try {
      updateBySlug.run({
        slug: m.dashboard_slug,
        title: m.scraped.kdp_title,
        asin: m.scraped.asin,
        status,
        kdp_status_raw: m.scraped.kdp_status,
        last_scraped_at: now,
      });
      applied += 1;
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
    }
  }

  // Ambiguous resolutions.
  for (const a of preview.ambiguous) {
    const slug = ambiguousResolutions[a.scraped.asin];
    if (!slug) {
      skipped += 1;
      continue;
    }
    const status = mappedStatus(a.scraped.kdp_status);
    if (!status) {
      skipped += 1;
      continue;
    }
    try {
      updateBySlug.run({
        slug,
        title: a.scraped.kdp_title,
        asin: a.scraped.asin,
        status,
        kdp_status_raw: a.scraped.kdp_status,
        last_scraped_at: now,
      });
      applied += 1;
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
    }
  }

  // Orphans (only confirmed ones).
  const confirmedSet = new Set(confirmedOrphans);
  for (const o of preview.orphans) {
    if (!confirmedSet.has(o.scraped.asin)) {
      skipped += 1;
      continue;
    }
    const status = mappedStatus(o.scraped.kdp_status);
    if (!status) {
      skipped += 1;
      continue;
    }
    try {
      insertOrphan.run({
        slug: _slugify(o.scraped.kdp_title),
        title: o.scraped.kdp_title,
        asin: o.scraped.asin,
        status,
        kdp_status_raw: o.scraped.kdp_status,
        last_scraped_at: now,
      });
      created += 1;
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
    }
  }

  return { applied, created, skipped, errors };
}
