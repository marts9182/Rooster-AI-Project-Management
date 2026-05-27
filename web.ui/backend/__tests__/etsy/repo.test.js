import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import {
  upsertListing,
  allListings,
  listingByEtsyId,
} from '../../etsy/repo.js';

/** Minimal schema mirror of migration 0001 for tests. */
function freshDb() {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE etsy_listings (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      etsy_listing_id INTEGER NOT NULL UNIQUE,
      sku_id          TEXT,
      title           TEXT NOT NULL,
      status          TEXT NOT NULL,
      section         TEXT,
      niche           TEXT,
      price_usd       REAL,
      favorites       INTEGER DEFAULT 0,
      views           INTEGER DEFAULT 0,
      listed_at       TEXT,
      last_synced_at  TEXT NOT NULL DEFAULT (datetime('now')),
      listing_url     TEXT
    );
  `);
  return db;
}

describe('etsy/repo', () => {
  /** @type {import('better-sqlite3').Database} */
  let db;
  beforeEach(() => {
    db = freshDb();
  });

  it('inserts a new row and returns {inserted:true}', () => {
    const result = upsertListing(db, {
      etsy_listing_id: 111,
      title: 'Mandala #1',
      status: 'active',
      section: 'Coloring',
      niche: 'mandala',
      price_usd: 4.99,
      favorites: 3,
      views: 50,
      listed_at: '2026-05-01T00:00:00Z',
      listing_url: 'https://etsy.com/listing/111',
    });
    expect(result.inserted).toBe(true);
    expect(result.diffs).toEqual({});
    const all = allListings(db);
    expect(all).toHaveLength(1);
    expect(all[0].title).toBe('Mandala #1');
    expect(all[0].section).toBe('Coloring');
    expect(all[0].niche).toBe('mandala');
    expect(all[0].price_usd).toBeCloseTo(4.99);
  });

  it('updates an existing row and reports only changed fields', () => {
    upsertListing(db, {
      etsy_listing_id: 222,
      title: 'Old',
      status: 'active',
      favorites: 1,
      views: 10,
    });
    const result = upsertListing(db, {
      etsy_listing_id: 222,
      title: 'Old',
      status: 'inactive',
      favorites: 5,
      views: 10,
    });
    expect(result.inserted).toBe(false);
    expect(result.diffs).toEqual({
      status: { from: 'active', to: 'inactive' },
      favorites: { from: 1, to: 5 },
    });
  });

  it('listingByEtsyId returns null when missing', () => {
    expect(listingByEtsyId(db, 9999)).toBeNull();
  });

  it('listingByEtsyId returns the row after insert', () => {
    upsertListing(db, {
      etsy_listing_id: 333,
      title: 'X',
      status: 'active',
    });
    const row = listingByEtsyId(db, 333);
    expect(row).not.toBeNull();
    expect(row.etsy_listing_id).toBe(333);
    expect(row.title).toBe('X');
  });

  it('repeated upsert with no changes returns empty diffs and inserted:false', () => {
    upsertListing(db, {
      etsy_listing_id: 444,
      title: 'Same',
      status: 'active',
      favorites: 2,
      views: 20,
      price_usd: 3.5,
    });
    const result = upsertListing(db, {
      etsy_listing_id: 444,
      title: 'Same',
      status: 'active',
      favorites: 2,
      views: 20,
      price_usd: 3.5,
    });
    expect(result.inserted).toBe(false);
    expect(result.diffs).toEqual({});
  });

  it('allListings filters by status and section', () => {
    upsertListing(db, { etsy_listing_id: 1, title: 'A', status: 'active', section: 'Color' });
    upsertListing(db, { etsy_listing_id: 2, title: 'B', status: 'inactive', section: 'Color' });
    upsertListing(db, { etsy_listing_id: 3, title: 'C', status: 'active', section: 'Puzzle' });

    expect(allListings(db, { status: 'active' }).map((r) => r.title).sort()).toEqual(['A', 'C']);
    expect(allListings(db, { section: 'Color' }).map((r) => r.title).sort()).toEqual(['A', 'B']);
    expect(
      allListings(db, { status: 'active', section: 'Color' }).map((r) => r.title),
    ).toEqual(['A']);
  });

  it('detects status transition diff', () => {
    upsertListing(db, { etsy_listing_id: 555, title: 'T', status: 'draft' });
    const r = upsertListing(db, { etsy_listing_id: 555, title: 'T', status: 'active' });
    expect(r.inserted).toBe(false);
    expect(r.diffs).toEqual({ status: { from: 'draft', to: 'active' } });
  });
});
