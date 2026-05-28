import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import {
  computeIngestPreview,
  applyIngestCommit,
  _normalizeTitle,
} from '../../kdp/ingest.js';

function freshDb() {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE kdp_books (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      slug            TEXT NOT NULL UNIQUE,
      title           TEXT NOT NULL,
      subtitle        TEXT,
      asin            TEXT,
      status          TEXT NOT NULL,
      release_date    TEXT,
      listing_url     TEXT,
      page_count      INTEGER,
      trim_size       TEXT,
      price_usd       REAL,
      blurb           TEXT,
      cover_path      TEXT,
      output_dir      TEXT NOT NULL DEFAULT '',
      notes           TEXT,
      kdp_status_raw  TEXT,
      last_scraped_at TEXT,
      created_at      TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
  return db;
}

function seed(db, rows) {
  const insert = db.prepare(
    `INSERT INTO kdp_books (slug, title, asin, status, output_dir)
     VALUES (@slug, @title, @asin, @status, '')`,
  );
  for (const r of rows) insert.run({ asin: null, status: 'built', ...r });
}

describe('_normalizeTitle', () => {
  it('lowercases and trims', () => {
    expect(_normalizeTitle('  Hello World  ')).toBe('hello-world');
  });

  it('treats Vol. N, Vol N, Volume N identically', () => {
    expect(_normalizeTitle('Travel Sudoku, Vol. 1')).toBe(_normalizeTitle('Travel Sudoku, Volume 1'));
    expect(_normalizeTitle('Travel Sudoku, Vol 1')).toBe(_normalizeTitle('Travel Sudoku, Vol. 1'));
  });

  it('strips subtitle after the first colon', () => {
    expect(_normalizeTitle('Travel Sudoku: 200 Easy Puzzles'))
      .toBe(_normalizeTitle('Travel Sudoku: 100 Hard Puzzles'));
  });

  it('collapses whitespace and punctuation', () => {
    expect(_normalizeTitle('Travel  Sudoku!!  ')).toBe('travel-sudoku');
  });
});

describe('computeIngestPreview', () => {
  /** @type {import('better-sqlite3').Database} */
  let db;
  beforeEach(() => {
    db = freshDb();
  });

  it('MATCHED_BY_ASIN when an existing book has the same ASIN', () => {
    seed(db, [{ slug: 'travel-sudoku-v1', title: 'Travel Sudoku', asin: 'B0CXXXXXXX' }]);
    const preview = computeIngestPreview({
      db,
      scraped: [
        { asin: 'B0CXXXXXXX', kdp_title: 'Different Title', kdp_status: 'Live', format: 'Paperback' },
      ],
    });
    expect(preview.matches).toHaveLength(1);
    expect(preview.matches[0].kind).toBe('MATCHED_BY_ASIN');
    expect(preview.matches[0].dashboard_slug).toBe('travel-sudoku-v1');
    expect(preview.matches[0].title_will_change).toBe(true);
    expect(preview.matches[0].new_dashboard_status).toBe('published');
    expect(preview.ambiguous).toHaveLength(0);
    expect(preview.orphans).toHaveLength(0);
  });

  it('MATCHED_BY_TITLE when no ASIN match but normalized title matches', () => {
    seed(db, [{ slug: 'travel-sudoku-v1', title: 'Travel Sudoku, Vol. 1: 200 Easy Puzzles' }]);
    const preview = computeIngestPreview({
      db,
      scraped: [
        { asin: 'B0CXXXXXXX', kdp_title: 'Travel Sudoku, Volume 1: Different Subtitle', kdp_status: 'Live' },
      ],
    });
    expect(preview.matches).toHaveLength(1);
    expect(preview.matches[0].kind).toBe('MATCHED_BY_TITLE');
    expect(preview.matches[0].dashboard_slug).toBe('travel-sudoku-v1');
  });

  it('AMBIGUOUS when two dashboard rows normalize to the same title', () => {
    seed(db, [
      { slug: 'travel-sudoku-v1', title: 'Travel Sudoku' },
      { slug: 'travel-sudoku-v2', title: 'Travel Sudoku' },
    ]);
    const preview = computeIngestPreview({
      db,
      scraped: [{ asin: 'B0CXXXXXXX', kdp_title: 'Travel Sudoku', kdp_status: 'Live' }],
    });
    expect(preview.matches).toHaveLength(0);
    expect(preview.ambiguous).toHaveLength(1);
    expect(preview.ambiguous[0].candidate_slugs.sort()).toEqual([
      'travel-sudoku-v1',
      'travel-sudoku-v2',
    ]);
  });

  it('ORPHAN when no candidates match', () => {
    seed(db, [{ slug: 'other', title: 'Something Else' }]);
    const preview = computeIngestPreview({
      db,
      scraped: [{ asin: 'B0CXXXXXXX', kdp_title: 'Brand New Book', kdp_status: 'Live' }],
    });
    expect(preview.matches).toHaveLength(0);
    expect(preview.orphans).toHaveLength(1);
    expect(preview.orphans[0].scraped.asin).toBe('B0CXXXXXXX');
  });

  it('missing_from_kdp lists dashboard rows not in the scrape', () => {
    seed(db, [
      { slug: 'a', title: 'Book A' },
      { slug: 'b', title: 'Book B' },
    ]);
    const preview = computeIngestPreview({
      db,
      scraped: [{ asin: 'B0CXXXXXXX', kdp_title: 'Book A', kdp_status: 'Live' }],
    });
    expect(preview.matches.map((m) => m.dashboard_slug)).toEqual(['a']);
    expect(preview.missing_from_kdp.map((m) => m.dashboard_slug)).toEqual(['b']);
  });

  it('status_ambiguous flag set when KDP status maps to unknown', () => {
    seed(db, [{ slug: 'a', title: 'Book A', asin: 'B0CAAAAAAA' }]);
    const preview = computeIngestPreview({
      db,
      scraped: [{ asin: 'B0CAAAAAAA', kdp_title: 'Book A', kdp_status: 'Pending Approval' }],
    });
    expect(preview.matches[0].status_ambiguous).toBe(true);
  });

  it('sets preview_id and created_at on the result', () => {
    seed(db, []);
    const preview = computeIngestPreview({ db, scraped: [] });
    expect(typeof preview.preview_id).toBe('string');
    expect(preview.preview_id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
    expect(typeof preview.created_at).toBe('string');
  });
});

describe('applyIngestCommit', () => {
  /** @type {import('better-sqlite3').Database} */
  let db;
  beforeEach(() => {
    db = freshDb();
  });

  it('applies MATCHED_BY_ASIN rows: updates asin, status, raw, title, last_scraped_at', () => {
    seed(db, [{ slug: 'travel-sudoku-v1', title: 'Old Title', asin: 'B0CXXXXXXX' }]);
    const preview = computeIngestPreview({
      db,
      scraped: [
        { asin: 'B0CXXXXXXX', kdp_title: 'New KDP Title', kdp_status: 'Live' },
      ],
    });
    const result = applyIngestCommit({
      db,
      preview,
      confirmedOrphans: [],
      ambiguousResolutions: {},
    });
    expect(result.applied).toBe(1);
    expect(result.created).toBe(0);
    expect(result.skipped).toBe(0);
    const row = db.prepare('SELECT * FROM kdp_books WHERE slug=?').get('travel-sudoku-v1');
    expect(row.title).toBe('New KDP Title');
    expect(row.asin).toBe('B0CXXXXXXX');
    expect(row.status).toBe('published');
    expect(row.kdp_status_raw).toBe('Live');
    expect(typeof row.last_scraped_at).toBe('string');
  });

  it('creates a new row only for ASINs listed in confirmedOrphans', () => {
    seed(db, []);
    const preview = computeIngestPreview({
      db,
      scraped: [
        { asin: 'B0CCONFIRMD', kdp_title: 'Confirmed Orphan', kdp_status: 'Live' },
        { asin: 'B0CSKIPPED1', kdp_title: 'Skipped Orphan', kdp_status: 'Live' },
      ],
    });
    const result = applyIngestCommit({
      db,
      preview,
      confirmedOrphans: ['B0CCONFIRMD'],
      ambiguousResolutions: {},
    });
    expect(result.applied).toBe(0);
    expect(result.created).toBe(1);
    expect(result.skipped).toBe(1);
    const created = db.prepare('SELECT * FROM kdp_books WHERE asin=?').get('B0CCONFIRMD');
    expect(created.title).toBe('Confirmed Orphan');
    expect(created.status).toBe('published');
    expect(created.slug).toBe('confirmed-orphan');
    const notCreated = db.prepare('SELECT * FROM kdp_books WHERE asin=?').get('B0CSKIPPED1');
    expect(notCreated).toBeUndefined();
  });

  it('ambiguous with non-null slug behaves like MATCHED_BY_TITLE', () => {
    seed(db, [
      { slug: 'travel-sudoku-v1', title: 'Travel Sudoku' },
      { slug: 'travel-sudoku-v2', title: 'Travel Sudoku' },
    ]);
    const preview = computeIngestPreview({
      db,
      scraped: [{ asin: 'B0CAAAAAAA', kdp_title: 'Travel Sudoku, Vol. 1', kdp_status: 'Live' }],
    });
    const result = applyIngestCommit({
      db,
      preview,
      confirmedOrphans: [],
      ambiguousResolutions: { B0CAAAAAAA: 'travel-sudoku-v1' },
    });
    expect(result.applied).toBe(1);
    expect(result.skipped).toBe(0);
    const row = db.prepare('SELECT * FROM kdp_books WHERE slug=?').get('travel-sudoku-v1');
    expect(row.asin).toBe('B0CAAAAAAA');
    expect(row.title).toBe('Travel Sudoku, Vol. 1');
  });

  it('ambiguous with null slug is skipped', () => {
    seed(db, [
      { slug: 'a', title: 'Travel Sudoku' },
      { slug: 'b', title: 'Travel Sudoku' },
    ]);
    const preview = computeIngestPreview({
      db,
      scraped: [{ asin: 'B0CAAAAAAA', kdp_title: 'Travel Sudoku', kdp_status: 'Live' }],
    });
    const result = applyIngestCommit({
      db,
      preview,
      confirmedOrphans: [],
      ambiguousResolutions: { B0CAAAAAAA: null },
    });
    expect(result.applied).toBe(0);
    expect(result.skipped).toBe(1);
  });

  it('surfaces a unique-constraint error in result.errors without aborting other rows', () => {
    seed(db, [
      { slug: 'good', title: 'Good Title', asin: 'B0CGOODGOOD' },
      { slug: 'orphan-clash', title: 'Orphan Clash', asin: 'B0CEXISTING' },
    ]);
    const preview = computeIngestPreview({
      db,
      scraped: [
        { asin: 'B0CGOODGOOD', kdp_title: 'Good Updated', kdp_status: 'Live' },
        { asin: 'B0CCLASH001', kdp_title: 'Orphan Clash', kdp_status: 'Live' }, // slugifies to same slug
      ],
    });
    const result = applyIngestCommit({
      db,
      preview,
      confirmedOrphans: ['B0CCLASH001'],
      ambiguousResolutions: {},
    });
    expect(result.applied).toBe(1);
    expect(result.errors.length).toBe(1);
    expect(result.errors[0]).toMatch(/UNIQUE|already exists/i);
  });
});
