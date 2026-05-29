import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { cadenceBuckets, engagementRows } from '../../pinterest/analytics.js';

function freshDb() {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = OFF');
  db.exec(`
    CREATE TABLE kdp_books (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT NOT NULL UNIQUE, title TEXT NOT NULL,
      status TEXT NOT NULL, output_dir TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE pinterest_queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      kdp_book_id INTEGER REFERENCES kdp_books(id),
      title TEXT
    );
    CREATE TABLE pinterest_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      queue_id INTEGER NOT NULL REFERENCES pinterest_queue(id),
      status TEXT NOT NULL, pinterest_pin_id TEXT, pinterest_url TEXT,
      posted_at TEXT NOT NULL, image_path TEXT,
      saves INTEGER, clicks INTEGER, impressions INTEGER,
      engagement_fetched_at TEXT
    );
  `);
  return db;
}

describe('cadenceBuckets', () => {
  /** @type {import('better-sqlite3').Database} */
  let db;
  beforeEach(() => { db = freshDb(); });

  it('returns N buckets when called with days=N', () => {
    const out = cadenceBuckets(db, { days: 30, target: 4, now: new Date('2026-05-30T12:00:00Z') });
    expect(out.buckets.length).toBe(30);
    expect(out.target_per_day).toBe(4);
  });

  it('counts posted vs failed per day', () => {
    db.prepare(`INSERT INTO pinterest_queue (title) VALUES ('t')`).run();
    db.prepare(`INSERT INTO pinterest_history (queue_id, status, posted_at) VALUES (1, 'posted', '2026-05-29T10:00:00Z')`).run();
    db.prepare(`INSERT INTO pinterest_history (queue_id, status, posted_at) VALUES (1, 'posted', '2026-05-29T15:00:00Z')`).run();
    db.prepare(`INSERT INTO pinterest_history (queue_id, status, posted_at) VALUES (1, 'failed', '2026-05-29T11:00:00Z')`).run();
    const out = cadenceBuckets(db, { days: 30, target: 4, now: new Date('2026-05-30T12:00:00Z') });
    const may29 = out.buckets.find((b) => b.date === '2026-05-29');
    expect(may29).toEqual({ date: '2026-05-29', posted: 2, failed: 1 });
  });

  it('summary aggregates totals + success rate + avg per day', () => {
    db.prepare(`INSERT INTO pinterest_queue (title) VALUES ('t')`).run();
    const insert = db.prepare(`INSERT INTO pinterest_history (queue_id, status, posted_at) VALUES (1, ?, ?)`);
    for (let i = 0; i < 9; i++) insert.run('posted', `2026-05-${20 + (i % 5)}T10:00:00Z`);
    insert.run('failed', '2026-05-20T10:00:00Z');
    const out = cadenceBuckets(db, { days: 30, target: 4, now: new Date('2026-05-30T12:00:00Z') });
    expect(out.summary.posted).toBe(9);
    expect(out.summary.failed).toBe(1);
    expect(out.summary.success_rate).toBeCloseTo(0.9, 5);
    expect(out.summary.avg_per_day).toBeCloseTo(9 / 30, 5);
  });
});

describe('engagementRows', () => {
  /** @type {import('better-sqlite3').Database} */
  let db;
  beforeEach(() => { db = freshDb(); });

  it('returns rows joined with book slug', () => {
    const bid = db.prepare(`INSERT INTO kdp_books (slug, title, status) VALUES ('a', 'Book A', 'published')`).run().lastInsertRowid;
    const qid = db.prepare(`INSERT INTO pinterest_queue (kdp_book_id, title) VALUES (?, 't')`).run(bid).lastInsertRowid;
    db.prepare(`INSERT INTO pinterest_history
        (queue_id, status, pinterest_pin_id, pinterest_url, posted_at, image_path, saves, clicks, impressions)
       VALUES (?, 'posted', 'pin-1', 'https://pin/1', '2026-05-29T10:00:00Z', '/p/x.png', 12, 3, 287)`,
    ).run(qid);
    const out = engagementRows(db, { limit: 50 });
    expect(out.rows.length).toBe(1);
    expect(out.rows[0]).toEqual({
      history_id: 1, image_path: '/p/x.png',
      book_slug: 'a', posted_at: '2026-05-29T10:00:00Z',
      saves: 12, clicks: 3, impressions: 287,
      pinterest_url: 'https://pin/1', engagement_available: true,
    });
  });

  it('engagement_available=false when saves is null', () => {
    const bid = db.prepare(`INSERT INTO kdp_books (slug, title, status) VALUES ('a', 'Book A', 'published')`).run().lastInsertRowid;
    const qid = db.prepare(`INSERT INTO pinterest_queue (kdp_book_id, title) VALUES (?, 't')`).run(bid).lastInsertRowid;
    db.prepare(`INSERT INTO pinterest_history
        (queue_id, status, pinterest_pin_id, posted_at)
       VALUES (?, 'posted', 'pin-1', '2026-05-29T10:00:00Z')`,
    ).run(qid);
    const out = engagementRows(db, { limit: 50 });
    expect(out.rows[0].engagement_available).toBe(false);
    expect(out.rows[0].saves).toBeNull();
  });
});
