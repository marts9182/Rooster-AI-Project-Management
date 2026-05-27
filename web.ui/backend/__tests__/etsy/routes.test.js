import { describe, it, expect, beforeEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import Database from 'better-sqlite3';
import { mountEtsyRoutes } from '../../etsy/routes.js';

function freshDb() {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE etsy_listings (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      etsy_listing_id INTEGER NOT NULL UNIQUE,
      sku_id TEXT, title TEXT NOT NULL, status TEXT NOT NULL,
      section TEXT, niche TEXT, price_usd REAL,
      favorites INTEGER DEFAULT 0, views INTEGER DEFAULT 0,
      listed_at TEXT,
      last_synced_at TEXT NOT NULL DEFAULT (datetime('now')),
      listing_url TEXT
    );
  `);
  db.prepare(
    `INSERT INTO etsy_listings (etsy_listing_id, title, status, section, niche, price_usd, listed_at, listing_url)
     VALUES
       (1, 'A', 'active', 'Coloring', 'mandala', 4.99, '2026-05-01T00:00:00Z', 'https://etsy.com/listing/1'),
       (2, 'B', 'inactive', 'Coloring', 'cottagecore', 5.99, '2026-04-01T00:00:00Z', 'https://etsy.com/listing/2'),
       (3, 'C', 'active', 'SVG', 'mandala', 2.99, '2026-05-15T00:00:00Z', 'https://etsy.com/listing/3')`,
  ).run();
  return db;
}

function makeApp(db, runSyncPass) {
  const app = express();
  app.use(express.json());
  mountEtsyRoutes(app, { db, runSyncPass });
  return app;
}

describe('GET /api/etsy/listings', () => {
  /** @type {import('better-sqlite3').Database} */
  let db;
  beforeEach(() => {
    db = freshDb();
  });

  it('returns all listings sorted by listed_at desc', async () => {
    const resp = await request(makeApp(db, vi.fn())).get('/api/etsy/listings');
    expect(resp.status).toBe(200);
    expect(resp.body.listings.map((l) => l.etsy_listing_id)).toEqual([3, 1, 2]);
  });

  it('filters by status', async () => {
    const resp = await request(makeApp(db, vi.fn())).get(
      '/api/etsy/listings?status=active',
    );
    expect(resp.status).toBe(200);
    expect(resp.body.listings.map((l) => l.etsy_listing_id)).toEqual([3, 1]);
  });

  it('filters by section and niche together', async () => {
    const resp = await request(makeApp(db, vi.fn())).get(
      '/api/etsy/listings?section=Coloring&niche=mandala',
    );
    expect(resp.status).toBe(200);
    expect(resp.body.listings.map((l) => l.etsy_listing_id)).toEqual([1]);
  });
});

describe('GET /api/etsy/listings/:listingId', () => {
  /** @type {import('better-sqlite3').Database} */
  let db;
  beforeEach(() => {
    db = freshDb();
  });

  it('returns one listing by etsy_listing_id', async () => {
    const resp = await request(makeApp(db, vi.fn())).get(
      '/api/etsy/listings/1',
    );
    expect(resp.status).toBe(200);
    expect(resp.body.title).toBe('A');
  });

  it('404s for unknown id', async () => {
    const resp = await request(makeApp(db, vi.fn())).get(
      '/api/etsy/listings/9999',
    );
    expect(resp.status).toBe(404);
  });
});

describe('POST /api/etsy/sync-now', () => {
  it('invokes runSyncPass and returns its result', async () => {
    const runSyncPass = vi
      .fn()
      .mockResolvedValue({ inserted: 2, updated: 1, statusChanged: 0 });
    const resp = await request(makeApp(freshDb(), runSyncPass)).post(
      '/api/etsy/sync-now',
    );
    expect(resp.status).toBe(200);
    expect(resp.body).toEqual({ inserted: 2, updated: 1, statusChanged: 0 });
    expect(runSyncPass).toHaveBeenCalledTimes(1);
  });

  it('returns 500 with message when runSyncPass throws', async () => {
    const runSyncPass = vi.fn().mockRejectedValue(new Error('etsy 401'));
    const resp = await request(makeApp(freshDb(), runSyncPass)).post(
      '/api/etsy/sync-now',
    );
    expect(resp.status).toBe(500);
    expect(resp.body.error).toMatch(/etsy 401/);
  });
});
