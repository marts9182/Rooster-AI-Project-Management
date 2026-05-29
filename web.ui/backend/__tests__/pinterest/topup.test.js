import { describe, it, expect, beforeEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import { runOnce, _uniquenessHash } from '../../pinterest/topup.js';

function freshDb() {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = OFF');
  db.exec(`
    CREATE TABLE kdp_books (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT NOT NULL UNIQUE, title TEXT NOT NULL,
      asin TEXT, status TEXT NOT NULL, output_dir TEXT NOT NULL DEFAULT '',
      release_date TEXT, listing_url TEXT, notes TEXT,
      page_count INTEGER, trim_size TEXT, price_usd REAL, blurb TEXT,
      cover_path TEXT, kdp_status_raw TEXT, last_scraped_at TEXT,
      subtitle TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE pinterest_queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      kdp_book_id INTEGER REFERENCES kdp_books(id),
      pin_type TEXT NOT NULL,
      image_path TEXT NOT NULL,
      title TEXT NOT NULL, description TEXT NOT NULL, link_url TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      scheduled_for TEXT, uniqueness_hash TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE pinterest_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      queue_id INTEGER NOT NULL REFERENCES pinterest_queue(id),
      posted_at TEXT NOT NULL DEFAULT (datetime('now')),
      status TEXT NOT NULL, pinterest_pin_id TEXT, pinterest_url TEXT,
      error TEXT, image_path TEXT,
      saves INTEGER, clicks INTEGER, impressions INTEGER,
      engagement_fetched_at TEXT, uniqueness_hash TEXT
    );
  `);
  return db;
}

function seedBook(db, { slug, status = 'published', asin = 'B0CFAKE0000' }) {
  return db.prepare(
    `INSERT INTO kdp_books (slug, title, asin, status, output_dir)
     VALUES (?, ?, ?, ?, 'x')`,
  ).run(slug, `Title ${slug}`, asin, status).lastInsertRowid;
}

function fakeGenerator() {
  let i = 0;
  return vi.fn(async ({ slug, pin_type, variant, palette_seed, tagline_idx }) => ({
    imagePath: `/fake/${slug}/${pin_type}-${i++}.png`,
    title: `T:${slug}`,
    description: `D:${slug}:${variant}:${palette_seed}:${tagline_idx}`,
    linkUrl: `https://amazon.com/dp/B0CFAKE`,
  }));
}

function fakeScheduler(count) {
  const out = [];
  const base = new Date('2026-06-01T09:00:00Z').getTime();
  for (let i = 0; i < count; i++) out.push(new Date(base + i * 3600_000).toISOString());
  return vi.fn(() => out);
}

describe('topup.runOnce', () => {
  /** @type {import('better-sqlite3').Database} */
  let db;
  beforeEach(() => { db = freshDb(); });

  it('skips books that are not published', async () => {
    seedBook(db, { slug: 'a', status: 'built' });
    const result = await runOnce({
      db, emit: vi.fn(),
      generatorFn: fakeGenerator(),
      schedulerFn: fakeScheduler(15),
      target: 15,
    });
    expect(result.books_topped_up).toBe(0);
    expect(result.pins_generated).toBe(0);
  });

  it('skips published books already at target', async () => {
    const id = seedBook(db, { slug: 'a' });
    const insert = db.prepare(
      `INSERT INTO pinterest_queue
        (kdp_book_id, pin_type, image_path, title, description, link_url, status, uniqueness_hash)
       VALUES (?, 'cover_hero', '/x.png', 't', 'd', 'http://x', 'pending', ?)`,
    );
    for (let i = 0; i < 15; i++) insert.run(id, `seed-${i}`);
    const result = await runOnce({
      db, emit: vi.fn(),
      generatorFn: fakeGenerator(),
      schedulerFn: fakeScheduler(0),
      target: 15,
    });
    expect(result.books_topped_up).toBe(0);
    expect(result.pins_generated).toBe(0);
  });

  it('generates exactly (target - existing) rows for under-target books', async () => {
    const id = seedBook(db, { slug: 'a' });
    const insert = db.prepare(
      `INSERT INTO pinterest_queue
        (kdp_book_id, pin_type, image_path, title, description, link_url, status, uniqueness_hash)
       VALUES (?, 'cover_hero', '/x.png', 't', 'd', 'http://x', 'pending', ?)`,
    );
    for (let i = 0; i < 5; i++) insert.run(id, `seed-${i}`);
    const result = await runOnce({
      db, emit: vi.fn(),
      generatorFn: fakeGenerator(),
      schedulerFn: fakeScheduler(10),
      target: 15,
    });
    expect(result.books_topped_up).toBe(1);
    expect(result.pins_generated).toBe(10);
    const rows = db.prepare('SELECT * FROM pinterest_queue WHERE kdp_book_id=? AND title LIKE ?').all(id, 'T:a');
    expect(rows.length).toBe(10);
    for (const r of rows) {
      expect(r.status).toBe('pending');
      expect(r.uniqueness_hash).toBeTruthy();
      expect(r.scheduled_for).toBeTruthy();
      expect(r.image_path).toMatch(/^\/fake\/a\//);
    }
  });

  it('counts paused and posting as non-empty toward the pending count', async () => {
    const id = seedBook(db, { slug: 'a' });
    const insert = db.prepare(
      `INSERT INTO pinterest_queue
        (kdp_book_id, pin_type, image_path, title, description, link_url, status, uniqueness_hash)
       VALUES (?, 'cover_hero', '/x.png', 't', 'd', 'http://x', ?, ?)`,
    );
    for (let i = 0; i < 8; i++) insert.run(id, 'pending', `p-${i}`);
    for (let i = 0; i < 7; i++) insert.run(id, 'paused', `pa-${i}`);
    const result = await runOnce({
      db, emit: vi.fn(),
      generatorFn: fakeGenerator(),
      schedulerFn: fakeScheduler(0),
      target: 15,
    });
    expect(result.pins_generated).toBe(0);
  });

  it('uniqueness hash check skips colliding remixes', async () => {
    const id = seedBook(db, { slug: 'a' });
    const collidingHash = _uniquenessHash(id, 'cover_hero', 0, 0, 0);
    const queueRow = db.prepare(
      `INSERT INTO pinterest_queue
        (kdp_book_id, pin_type, image_path, title, description, link_url, status)
       VALUES (?, 'cover_hero', '/x.png', 't', 'd', 'http://x', 'posted')`,
    ).run(id);
    db.prepare(
      `INSERT INTO pinterest_history (queue_id, status, uniqueness_hash, image_path, posted_at)
       VALUES (?, 'posted', ?, '/x.png', datetime('now'))`,
    ).run(queueRow.lastInsertRowid, collidingHash);
    const seen = [];
    const generatorFn = vi.fn(async (spec) => {
      seen.push(`${spec.pin_type}|${spec.variant}|${spec.palette_seed}|${spec.tagline_idx}`);
      return { imagePath: '/g/x.png', title: 't', description: 'd', linkUrl: 'http://x' };
    });
    await runOnce({
      db, emit: vi.fn(),
      generatorFn,
      schedulerFn: fakeScheduler(15),
      target: 1,
    });
    expect(seen[0]).not.toBe('cover_hero|0|0|0');
  });

  it('emits pinterest:topup-tick with counts', async () => {
    seedBook(db, { slug: 'a' });
    const emit = vi.fn();
    await runOnce({
      db, emit,
      generatorFn: fakeGenerator(),
      schedulerFn: fakeScheduler(15),
      target: 15,
    });
    expect(emit).toHaveBeenCalledWith('pinterest:topup-tick', expect.objectContaining({
      books_topped_up: 1,
      pins_generated: 15,
    }));
  });

  it('one book failing does not abort the batch', async () => {
    seedBook(db, { slug: 'a' });
    seedBook(db, { slug: 'b' });
    let calls = 0;
    const generatorFn = vi.fn(async ({ slug }) => {
      calls++;
      if (slug === 'a' && calls <= 1) throw new Error('boom');
      return { imagePath: '/g/x.png', title: 't', description: 'd', linkUrl: 'http://x' };
    });
    const result = await runOnce({
      db, emit: vi.fn(),
      generatorFn,
      schedulerFn: fakeScheduler(15),
      target: 1,
    });
    expect(result.pins_generated).toBeGreaterThanOrEqual(1);
    expect(result.errors.length).toBeGreaterThanOrEqual(1);
  });
});

describe('_uniquenessHash', () => {
  it('is deterministic and 16 chars', () => {
    const h = _uniquenessHash(7, 'cover_hero', 0, 0, 0);
    expect(h).toBe(_uniquenessHash(7, 'cover_hero', 0, 0, 0));
    expect(h.length).toBe(16);
  });
  it('changes when any input changes', () => {
    const base = _uniquenessHash(1, 'cover_hero', 0, 0, 0);
    expect(_uniquenessHash(2, 'cover_hero', 0, 0, 0)).not.toBe(base);
    expect(_uniquenessHash(1, 'interior_preview', 0, 0, 0)).not.toBe(base);
    expect(_uniquenessHash(1, 'cover_hero', 1, 0, 0)).not.toBe(base);
  });
});
