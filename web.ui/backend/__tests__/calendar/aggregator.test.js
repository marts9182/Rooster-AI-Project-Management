import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { aggregateCalendarEvents } from '../../calendar/aggregator.js';

function freshDb() {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE kdp_books (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      subtitle TEXT,
      asin TEXT,
      status TEXT NOT NULL,
      release_date TEXT,
      listing_url TEXT,
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
  return db;
}

describe('aggregateCalendarEvents', () => {
  /** @type {import('better-sqlite3').Database} */
  let db;
  beforeEach(() => {
    db = freshDb();
  });

  it('returns empty array for empty DB', () => {
    expect(aggregateCalendarEvents(db, '2026-05-01', '2026-06-01')).toEqual([]);
  });

  it('emits KDP releases for published books with release_date in range', () => {
    db.prepare(
      `INSERT INTO kdp_books (slug, title, status, release_date, asin, output_dir)
       VALUES ('foo', 'Foo', 'published', '2026-05-15', 'B0XYZ', '/tmp/foo')`,
    ).run();
    const events = aggregateCalendarEvents(db, '2026-05-01', '2026-06-01');
    expect(events).toEqual([
      expect.objectContaining({
        kind: 'kdp.release',
        date: '2026-05-15',
        title: expect.stringContaining('Foo'),
        source_kind: 'kdp.book',
        url: '/kdp/foo',
      }),
    ]);
  });

  it('excludes events outside the [from,to) window', () => {
    db.prepare(
      `INSERT INTO kdp_books (slug, title, status, release_date, output_dir)
       VALUES ('old', 'Old', 'published', '2026-04-15', '/tmp/old'),
              ('new', 'New', 'published', '2026-07-15', '/tmp/new')`,
    ).run();
    const events = aggregateCalendarEvents(db, '2026-05-01', '2026-06-01');
    expect(events).toEqual([]);
  });

  it('emits etsy listings as etsy.listed and reminders as reminder.<channel>', () => {
    db.prepare(
      `INSERT INTO etsy_listings (etsy_listing_id, title, status, listed_at)
       VALUES (111, 'Mandala', 'active', '2026-05-10T00:00:00Z')`,
    ).run();
    db.prepare(
      `INSERT INTO reminders (title, due_at, channel, status, source_kind, source_id)
       VALUES ('Day-30 check', '2026-05-20T15:00:00Z', 'both', 'pending', 'etsy.listing', 111)`,
    ).run();
    const events = aggregateCalendarEvents(db, '2026-05-01', '2026-06-01');
    expect(events.find((e) => e.kind === 'etsy.listed')).toEqual(
      expect.objectContaining({ date: '2026-05-10', source_id: 111, url: '/etsy/111' }),
    );
    expect(events.find((e) => e.kind === 'reminder')).toEqual(
      expect.objectContaining({ date: '2026-05-20', title: 'Day-30 check' }),
    );
  });

  it('emits pinterest_queue scheduled_for as pinterest.scheduled', () => {
    db.prepare(
      `INSERT INTO pinterest_queue (kdp_book_id, pin_type, image_path, title, description, link_url, status, scheduled_for)
       VALUES (1, 'cover_hero', '/x.png', 'Pin A', 'desc', 'https://amazon.com/dp/B0', 'pending', '2026-05-12T10:00:00Z')`,
    ).run();
    const events = aggregateCalendarEvents(db, '2026-05-01', '2026-06-01');
    expect(events).toEqual([
      expect.objectContaining({ kind: 'pinterest.scheduled', date: '2026-05-12', title: 'Pin A' }),
    ]);
  });

  it('omits dismissed/fired reminders', () => {
    db.prepare(
      `INSERT INTO reminders (title, due_at, channel, status)
       VALUES ('done', '2026-05-15T00:00:00Z', 'toast', 'dismissed'),
              ('also', '2026-05-15T00:00:00Z', 'toast', 'fired'),
              ('show', '2026-05-15T00:00:00Z', 'toast', 'pending')`,
    ).run();
    const events = aggregateCalendarEvents(db, '2026-05-01', '2026-06-01');
    const titles = events.map((e) => e.title);
    expect(titles).toEqual(['show']);
  });
});
