import { describe, it, expect, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import Database from 'better-sqlite3';
import { mountCalendarRoutes } from '../../calendar/routes.js';

function freshDb() {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE kdp_books (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT NOT NULL UNIQUE, title TEXT NOT NULL,
      subtitle TEXT, asin TEXT, status TEXT NOT NULL,
      release_date TEXT, listing_url TEXT,
      page_count INTEGER, trim_size TEXT, price_usd REAL,
      blurb TEXT, cover_path TEXT, output_dir TEXT NOT NULL,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE etsy_listings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      etsy_listing_id INTEGER NOT NULL UNIQUE,
      sku_id TEXT, title TEXT NOT NULL, status TEXT NOT NULL,
      section TEXT, niche TEXT, price_usd REAL,
      favorites INTEGER DEFAULT 0, views INTEGER DEFAULT 0,
      listed_at TEXT,
      last_synced_at TEXT NOT NULL DEFAULT (datetime('now')),
      listing_url TEXT
    );
    CREATE TABLE reminders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL, body TEXT, due_at TEXT NOT NULL,
      channel TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('pending','fired','dismissed','failed')),
      source_kind TEXT, source_id INTEGER, payload_json TEXT,
      fired_at TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE pinterest_queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      kdp_book_id INTEGER, pin_type TEXT NOT NULL,
      image_path TEXT NOT NULL, title TEXT NOT NULL,
      description TEXT NOT NULL, link_url TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('pending','posting','posted','failed','paused')),
      scheduled_for TEXT NOT NULL,
      attempts INTEGER DEFAULT 0, last_error TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
  db.prepare(
    `INSERT INTO kdp_books (slug, title, status, release_date, output_dir)
     VALUES ('foo', 'Foo', 'published', '2026-05-15', '/tmp/foo')`,
  ).run();
  return db;
}

function makeApp(db) {
  const app = express();
  mountCalendarRoutes(app, { db });
  return app;
}

describe('GET /api/calendar/events', () => {
  /** @type {import('better-sqlite3').Database} */
  let db;
  beforeEach(() => {
    db = freshDb();
  });

  it('returns events in the [from,to) window', async () => {
    const resp = await request(makeApp(db))
      .get('/api/calendar/events?from=2026-05-01&to=2026-06-01');
    expect(resp.status).toBe(200);
    expect(resp.body.events).toHaveLength(1);
    expect(resp.body.events[0]).toMatchObject({
      kind: 'kdp.release',
      date: '2026-05-15',
    });
  });

  it('400s on missing from or to', async () => {
    const resp = await request(makeApp(db)).get('/api/calendar/events');
    expect(resp.status).toBe(400);
  });

  it('400s on invalid date strings', async () => {
    const resp = await request(makeApp(db))
      .get('/api/calendar/events?from=garbage&to=2026-06-01');
    expect(resp.status).toBe(400);
  });
});
