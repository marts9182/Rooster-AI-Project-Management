/**
 * Etsy sync orchestrator.
 *
 * `runSyncPass` does one full sync: pull the active listings from Etsy,
 * upsert each into `etsy_listings`, emit events for new listings and
 * status transitions, and create Day-30/60/90 reminders for any
 * newly-active listing. The 30-min loop lives in `worker.js`.
 *
 * @module etsy/syncer
 */

import { upsertListing, listingByEtsyId } from './repo.js';

/**
 * @typedef {import('./client.js').EtsyListing} EtsyListing
 */

/**
 * Convert an Etsy v3 listing payload to our row shape.
 *
 * @param {EtsyListing} l
 * @returns {import('./repo.js').EtsyListingRow}
 */
function toRow(l) {
  /** @type {number | undefined} */
  let priceUsd;
  if (
    l.price &&
    typeof l.price.amount === 'number' &&
    typeof l.price.divisor === 'number' &&
    l.price.divisor !== 0
  ) {
    priceUsd = l.price.amount / l.price.divisor;
  }
  /** @type {string | undefined} */
  let listedAt;
  if (typeof l.original_creation_timestamp === 'number') {
    listedAt = new Date(l.original_creation_timestamp * 1000).toISOString();
  }
  return {
    etsy_listing_id: l.listing_id,
    title: l.title,
    status: l.state,
    section: l.shop_section_id != null ? String(l.shop_section_id) : undefined,
    price_usd: priceUsd,
    favorites: l.num_favorers ?? 0,
    views: l.views ?? 0,
    listed_at: listedAt,
    listing_url: l.url,
  };
}

/**
 * Insert Day-30/60/90 reminders rooted at `listedAtIso` for an Etsy listing.
 *
 * @param {import('better-sqlite3').Database} db
 * @param {{etsyListingId: number, title: string, listedAtIso: string}} args
 */
function insertGateReminders(db, { etsyListingId, title, listedAtIso }) {
  const base = new Date(listedAtIso).getTime();
  const offsets = [30, 60, 90];
  const insert = db.prepare(
    `INSERT INTO reminders (title, body, due_at, channel, status, source_kind, source_id, payload_json)
     VALUES (@title, @body, @due_at, 'both', 'pending', 'etsy.listing', @source_id, @payload)`,
  );
  for (const days of offsets) {
    const due = new Date(base + days * 24 * 60 * 60 * 1000).toISOString();
    insert.run({
      title: `Etsy Day-${days} revenue check: ${title}`,
      body: `Check favorites/views/sales for Etsy listing "${title}".`,
      due_at: due,
      source_id: etsyListingId,
      payload: JSON.stringify({ days_since_listed: days }),
    });
  }
}

/**
 * @typedef {Object} SyncPassArgs
 * @property {import('better-sqlite3').Database} db
 * @property {{listAllListings: (opts?: any) => Promise<EtsyListing[]>}} client
 * @property {(channel: string, payload: unknown) => void} emit
 * @property {() => Date} [now]
 */

/**
 * Run one Etsy sync pass: list, upsert, diff, emit, and create
 * Day-30/60/90 reminders for newly-active listings.
 *
 * Pure orchestration; no timers. The 30-min loop lives in worker.js.
 *
 * @param {SyncPassArgs} args
 * @returns {Promise<{inserted: number, updated: number, statusChanged: number}>}
 */
export async function runSyncPass({ db, client, emit, now = () => new Date() }) {
  const listings = await client.listAllListings({ state: 'active' });
  let inserted = 0;
  let updated = 0;
  let statusChanged = 0;

  const tx = db.transaction(() => {
    for (const listing of listings) {
      const row = toRow(listing);
      const existing = listingByEtsyId(db, row.etsy_listing_id);
      const result = upsertListing(db, row);

      if (result.inserted) {
        inserted += 1;
        emit('etsy:new-listing', {
          etsy_listing_id: row.etsy_listing_id,
          title: row.title,
          status: row.status,
        });
        if (row.status === 'active' && row.listed_at) {
          insertGateReminders(db, {
            etsyListingId: row.etsy_listing_id,
            title: row.title,
            listedAtIso: row.listed_at,
          });
        }
      } else {
        updated += 1;
        if (result.diffs.status) {
          statusChanged += 1;
          emit('etsy:status-changed', {
            etsy_listing_id: row.etsy_listing_id,
            title: row.title,
            from: result.diffs.status.from,
            to: result.diffs.status.to,
          });
        }
        // If a listing was previously non-active and is now active for the
        // first time, also emit gate reminders (idempotent — checks first
        // that no reminders already exist for this listing).
        if (
          existing &&
          existing.status !== 'active' &&
          row.status === 'active' &&
          row.listed_at
        ) {
          const haveRow = /** @type {{c: number} | undefined} */ (
            db
              .prepare(
                "SELECT COUNT(*) AS c FROM reminders WHERE source_kind='etsy.listing' AND source_id=?",
              )
              .get(row.etsy_listing_id)
          );
          if ((haveRow?.c ?? 0) === 0) {
            insertGateReminders(db, {
              etsyListingId: row.etsy_listing_id,
              title: row.title,
              listedAtIso: row.listed_at,
            });
          }
        }
      }
    }
  });
  tx();

  emit('etsy:synced', {
    at: now().toISOString(),
    inserted,
    updated,
    statusChanged,
  });
  return { inserted, updated, statusChanged };
}
