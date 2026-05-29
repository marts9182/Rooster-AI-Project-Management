/**
 * @typedef {Object} EtsyListingRow
 * @property {number} etsy_listing_id
 * @property {string} title
 * @property {string} status
 * @property {string|null} [sku_id]
 * @property {string|null} [section]
 * @property {string|null} [niche]
 * @property {number|null} [price_usd]
 * @property {number} [favorites]
 * @property {number} [views]
 * @property {string|null} [listed_at]
 * @property {string|null} [listing_url]
 */

/**
 * @typedef {Object} UpsertResult
 * @property {boolean} inserted   true if this was an insert; false if update
 * @property {Record<string, {from: unknown, to: unknown}>} diffs   keys whose value changed
 * @property {number} localId     the local `etsy_listings.id` PK of the row
 */

const TRACKED_FIELDS = /** @type {const} */ ([
  'title',
  'status',
  'sku_id',
  'section',
  'niche',
  'price_usd',
  'favorites',
  'views',
  'listed_at',
  'listing_url',
]);

/**
 * Insert or update a listing. Tracks per-field diffs vs. the existing row
 * and always bumps `last_synced_at` to `datetime('now')`. On insert, diffs
 * is `{}`. On a no-change update, diffs is also `{}` (still touches
 * last_synced_at).
 *
 * Pass `db` explicitly — this module does not call openDb so tests can
 * use `new Database(':memory:')` directly.
 *
 * @param {import('better-sqlite3').Database} db
 * @param {EtsyListingRow} row
 * @returns {UpsertResult}
 */
export function upsertListing(db, row) {
  const existing = listingByEtsyId(db, row.etsy_listing_id);
  /** @type {Record<string, {from: unknown, to: unknown}>} */
  const diffs = {};
  if (existing) {
    for (const field of TRACKED_FIELDS) {
      const incoming = row[field];
      if (incoming === undefined) continue;
      const before = existing[field];
      if (before !== incoming) {
        diffs[field] = { from: before, to: incoming };
      }
    }
  }
  const runResult = db.prepare(
    `INSERT INTO etsy_listings
       (etsy_listing_id, sku_id, title, status, section, niche, price_usd,
        favorites, views, listed_at, listing_url, last_synced_at)
     VALUES (@etsy_listing_id, @sku_id, @title, @status, @section, @niche, @price_usd,
             @favorites, @views, @listed_at, @listing_url, datetime('now'))
     ON CONFLICT(etsy_listing_id) DO UPDATE SET
       sku_id         = COALESCE(excluded.sku_id, etsy_listings.sku_id),
       title          = excluded.title,
       status         = excluded.status,
       section        = excluded.section,
       niche          = excluded.niche,
       price_usd      = excluded.price_usd,
       favorites      = excluded.favorites,
       views          = excluded.views,
       listed_at      = COALESCE(excluded.listed_at, etsy_listings.listed_at),
       listing_url    = excluded.listing_url,
       last_synced_at = datetime('now')`,
  ).run({
    etsy_listing_id: row.etsy_listing_id,
    sku_id: row.sku_id ?? null,
    title: row.title,
    status: row.status,
    section: row.section ?? null,
    niche: row.niche ?? null,
    price_usd: row.price_usd ?? null,
    favorites: row.favorites ?? 0,
    views: row.views ?? 0,
    listed_at: row.listed_at ?? null,
    listing_url: row.listing_url ?? null,
  });

  // Resolve the local PK. On INSERT we can use lastInsertRowid; on UPSERT
  // (UPDATE branch) lastInsertRowid is 0 so we follow up with a SELECT.
  const inserted = !existing;
  let localId;
  if (inserted) {
    localId = Number(runResult.lastInsertRowid);
  } else {
    const pkRow = /** @type {{id: number} | undefined} */ (
      db.prepare('SELECT id FROM etsy_listings WHERE etsy_listing_id = ?').get(row.etsy_listing_id)
    );
    localId = pkRow ? pkRow.id : 0;
  }

  return { inserted, diffs, localId };
}

/**
 * Fetch a listing row by its Etsy listing_id, or null.
 *
 * @param {import('better-sqlite3').Database} db
 * @param {number} etsyListingId
 * @returns {Record<string, unknown> | null}
 */
export function listingByEtsyId(db, etsyListingId) {
  const row = /** @type {Record<string, unknown> | undefined} */ (
    db.prepare('SELECT * FROM etsy_listings WHERE etsy_listing_id = ?').get(etsyListingId)
  );
  return row ?? null;
}

/**
 * @param {import('better-sqlite3').Database} db
 * @param {{status?: string, section?: string, niche?: string}} [filters]
 * @returns {Record<string, unknown>[]}
 */
export function allListings(db, filters = {}) {
  const where = [];
  /** @type {Record<string, string>} */
  const params = {};
  if (filters.status) {
    where.push('status = @status');
    params.status = filters.status;
  }
  if (filters.section) {
    where.push('section = @section');
    params.section = filters.section;
  }
  if (filters.niche) {
    where.push('niche = @niche');
    params.niche = filters.niche;
  }
  const sql = `SELECT * FROM etsy_listings ${
    where.length ? 'WHERE ' + where.join(' AND ') : ''
  } ORDER BY listed_at DESC, etsy_listing_id DESC`;
  return /** @type {Record<string, unknown>[]} */ (db.prepare(sql).all(params));
}

// ── Aliases matching the Plan-C task prompt naming so downstream callers
// (syncer/routes) can pick whichever feels more natural at the call site.
export const listAll = allListings;
export const getByListingId = listingByEtsyId;
