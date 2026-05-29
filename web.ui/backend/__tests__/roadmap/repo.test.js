import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import {
  insertRoadmapRow,
  listRoadmapRows,
  getRoadmapRowById,
  updateRoadmapRow,
  deleteRoadmapRow,
  advanceRoadmapBySlug,
  _fileLockDateFor,
} from '../../roadmap/repo.js';

function freshDb() {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = OFF');
  db.exec(`
    CREATE TABLE kdp_books (
      id INTEGER PRIMARY KEY AUTOINCREMENT, slug TEXT UNIQUE NOT NULL,
      title TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'built',
      output_dir TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE etsy_listings (
      id INTEGER PRIMARY KEY AUTOINCREMENT, etsy_listing_id INTEGER UNIQUE NOT NULL,
      title TEXT NOT NULL, status TEXT NOT NULL
    );
    CREATE TABLE publishing_roadmap (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      kind TEXT NOT NULL CHECK(kind IN ('kdp','etsy')),
      slug TEXT NOT NULL,
      title TEXT NOT NULL,
      target_release_date TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('planned','building','built','scheduled','published','skipped')),
      source TEXT NOT NULL CHECK(source IN ('reuse','build')),
      niche TEXT, rationale TEXT, file_lock_date TEXT,
      kdp_book_id INTEGER REFERENCES kdp_books(id),
      etsy_listing_id INTEGER REFERENCES etsy_listings(id),
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(kind, slug, target_release_date)
    );
  `);
  return db;
}

const baseRow = {
  kind: 'kdp',
  slug: 'foo',
  title: 'Foo',
  target_release_date: '2026-08-15',
  status: 'planned',
  source: 'reuse',
};

describe('_fileLockDateFor', () => {
  it('subtracts 15 calendar days from the release date', () => {
    expect(_fileLockDateFor('2026-08-15')).toBe('2026-07-31');
    expect(_fileLockDateFor('2026-03-10')).toBe('2026-02-23');
  });
  it('handles year boundaries', () => {
    expect(_fileLockDateFor('2027-01-10')).toBe('2026-12-26');
  });
});

describe('insertRoadmapRow', () => {
  /** @type {import('better-sqlite3').Database} */
  let db;
  beforeEach(() => { db = freshDb(); });

  it('inserts and auto-computes file_lock_date', () => {
    const id = insertRoadmapRow(db, baseRow);
    expect(id).toBeGreaterThan(0);
    const row = getRoadmapRowById(db, id);
    expect(row.kind).toBe('kdp');
    expect(row.slug).toBe('foo');
    expect(row.file_lock_date).toBe('2026-07-31');
  });

  it('throws on UNIQUE collision (kind, slug, target_release_date)', () => {
    insertRoadmapRow(db, baseRow);
    expect(() => insertRoadmapRow(db, baseRow)).toThrow(/UNIQUE/i);
  });
});

describe('listRoadmapRows', () => {
  /** @type {import('better-sqlite3').Database} */
  let db;
  beforeEach(() => {
    db = freshDb();
    insertRoadmapRow(db, { ...baseRow, slug: 'a', target_release_date: '2026-08-01' });
    insertRoadmapRow(db, { ...baseRow, slug: 'b', target_release_date: '2026-09-01', status: 'building' });
    insertRoadmapRow(db, { ...baseRow, kind: 'etsy', slug: 'c', target_release_date: '2026-10-01' });
    insertRoadmapRow(db, { ...baseRow, slug: 'd', target_release_date: '2026-11-01', status: 'skipped' });
  });

  it('returns all rows by default, ordered by target_release_date ASC', () => {
    const rows = listRoadmapRows(db, {});
    expect(rows.map((r) => r.slug)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('filters by kind', () => {
    expect(listRoadmapRows(db, { kind: 'etsy' }).map((r) => r.slug)).toEqual(['c']);
  });

  it('filters by status (comma list)', () => {
    expect(listRoadmapRows(db, { status: 'planned,building' }).map((r) => r.slug))
      .toEqual(['a', 'b', 'c']);
  });

  it('filters by date window [from, to)', () => {
    expect(listRoadmapRows(db, { from: '2026-09-01', to: '2026-10-15' }).map((r) => r.slug))
      .toEqual(['b', 'c']);
  });
});

describe('updateRoadmapRow', () => {
  /** @type {import('better-sqlite3').Database} */
  let db;
  beforeEach(() => { db = freshDb(); });

  it('updates allowed fields and bumps updated_at', () => {
    const id = insertRoadmapRow(db, baseRow);
    const before = getRoadmapRowById(db, id);
    const ok = updateRoadmapRow(db, id, { status: 'building', notes: 'started' });
    expect(ok).toBe(true);
    const after = getRoadmapRowById(db, id);
    expect(after.status).toBe('building');
    expect(after.notes).toBe('started');
    expect(after.updated_at >= before.updated_at).toBe(true);
  });

  it('recomputes file_lock_date when target_release_date changes', () => {
    const id = insertRoadmapRow(db, baseRow);
    updateRoadmapRow(db, id, { target_release_date: '2026-12-01' });
    const row = getRoadmapRowById(db, id);
    expect(row.target_release_date).toBe('2026-12-01');
    expect(row.file_lock_date).toBe('2026-11-16');
  });

  it('returns false when id does not exist', () => {
    expect(updateRoadmapRow(db, 9999, { status: 'building' })).toBe(false);
  });
});

describe('deleteRoadmapRow', () => {
  it('deletes by id', () => {
    const db = freshDb();
    const id = insertRoadmapRow(db, baseRow);
    expect(deleteRoadmapRow(db, id)).toBe(true);
    expect(getRoadmapRowById(db, id)).toBeNull();
    expect(deleteRoadmapRow(db, id)).toBe(false);
  });
});

describe('advanceRoadmapBySlug', () => {
  /** @type {import('better-sqlite3').Database} */
  let db;
  beforeEach(() => { db = freshDb(); });

  it('advances any non-terminal matching row to published and back-fills kdp_book_id', () => {
    const id = insertRoadmapRow(db, baseRow);
    const bookId = db.prepare(
      `INSERT INTO kdp_books (slug, title, output_dir) VALUES ('foo', 'Foo', 'x')`,
    ).run().lastInsertRowid;
    const n = advanceRoadmapBySlug(db, {
      kind: 'kdp', slug: 'foo', toStatus: 'published', linkId: bookId,
    });
    expect(n).toBe(1);
    const row = getRoadmapRowById(db, id);
    expect(row.status).toBe('published');
    expect(row.kdp_book_id).toBe(bookId);
  });

  it('does not advance terminal-status rows (published or skipped)', () => {
    insertRoadmapRow(db, { ...baseRow, status: 'published', target_release_date: '2026-09-01' });
    insertRoadmapRow(db, { ...baseRow, status: 'skipped', target_release_date: '2026-10-01' });
    const n = advanceRoadmapBySlug(db, {
      kind: 'kdp', slug: 'foo', toStatus: 'published', linkId: 7,
    });
    expect(n).toBe(0);
  });

  it('etsy variant back-fills etsy_listing_id', () => {
    const id = insertRoadmapRow(db, {
      ...baseRow, kind: 'etsy', slug: 'bar',
    });
    const n = advanceRoadmapBySlug(db, {
      kind: 'etsy', slug: 'bar', toStatus: 'published', linkId: 4242,
    });
    expect(n).toBe(1);
    const row = getRoadmapRowById(db, id);
    expect(row.etsy_listing_id).toBe(4242);
    expect(row.kdp_book_id).toBeNull();
  });
});
