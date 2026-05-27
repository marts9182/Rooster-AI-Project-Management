/**
 * Tests for the KDP filesystem scanner: walks <kdp-ready-root>/<slug>/,
 * parses metadata.json + listing.md, and upserts into kdp_books.
 *
 * Uses a temp directory for both the SQLite DB and the kdp-ready root.
 */
import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
} from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { openDb, _resetForTests } from '../../db.js';
import { _resetSubscribersForTests, subscribe } from '../../events.js';
import { scanOnce } from '../../kdp/scanner.js';

let tmpRoot;
let tmpDb;
let kdpReady;

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kdp-scan-'));
  tmpDb = path.join(tmpRoot, 'test.db');
  kdpReady = path.join(tmpRoot, 'kdp-ready');
  fs.mkdirSync(kdpReady, { recursive: true });
  process.env.ROOSTER_DB_PATH = tmpDb;
  process.env.ROOSTER_KDP_READY_DIR = kdpReady;
  _resetForTests();
  _resetSubscribersForTests();
});

afterEach(() => {
  _resetForTests();
  _resetSubscribersForTests();
  // Windows + better-sqlite3 WAL can briefly hold sidecar files (-wal/-shm)
  // even after close(); tolerate EPERM so the test still cleans up later.
  try {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  } catch (_err) {
    // best-effort
  }
  delete process.env.ROOSTER_DB_PATH;
  delete process.env.ROOSTER_KDP_READY_DIR;
});

function seedBook(slug, title) {
  const dir = path.join(kdpReady, slug);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'metadata.json'),
    JSON.stringify({
      book_id: slug,
      title,
      subtitle: 'Sub',
      trim_size: '8.5x11',
      page_count_target: 120,
      pricing: { list_prices: { amazon_com_USD: 9.99 } },
    }),
  );
  fs.writeFileSync(
    path.join(dir, 'listing.md'),
    `# ${title}\n\n## 5. Description (HTML, <= 4000 chars)\n\n\`\`\`html\n<p>The blurb for ${title}.</p>\n\`\`\`\n`,
  );
}

describe('scanOnce', () => {
  it('inserts new built rows for each subdir with metadata.json', async () => {
    seedBook('book-a', 'Book A');
    seedBook('book-b', 'Book B');

    const db = openDb();
    const result = await scanOnce();

    expect(result.inserted).toBe(2);
    expect(result.updated).toBe(0);

    const rows = db
      .prepare('SELECT slug, title, status FROM kdp_books ORDER BY slug')
      .all();
    expect(rows).toEqual([
      { slug: 'book-a', title: 'Book A', status: 'built' },
      { slug: 'book-b', title: 'Book B', status: 'built' },
    ]);
  });

  it('updates title when listing.md changes, but does not overwrite status', async () => {
    seedBook('book-a', 'Book A');
    const db = openDb();

    await scanOnce();
    db.prepare("UPDATE kdp_books SET status='in_review' WHERE slug='book-a'").run();

    seedBook('book-a', 'Book A v2');
    const result = await scanOnce();

    expect(result.updated).toBe(1);
    const row = db
      .prepare('SELECT title, status FROM kdp_books WHERE slug=?')
      .get('book-a');
    expect(row.title).toBe('Book A v2');
    expect(row.status).toBe('in_review');
  });

  it('preserves asin / release_date / listing_url / notes across updates', async () => {
    seedBook('book-a', 'Book A');
    const db = openDb();

    await scanOnce();
    db.prepare(`
      UPDATE kdp_books
         SET asin='B0XXXXX', release_date='2026-06-01',
             listing_url='https://amazon.com/dp/B0XXXXX',
             notes='hand-edited note'
       WHERE slug='book-a'
    `).run();

    seedBook('book-a', 'Book A v2');
    await scanOnce();

    const row = db.prepare('SELECT * FROM kdp_books WHERE slug=?').get('book-a');
    expect(row.title).toBe('Book A v2');
    expect(row.asin).toBe('B0XXXXX');
    expect(row.release_date).toBe('2026-06-01');
    expect(row.listing_url).toBe('https://amazon.com/dp/B0XXXXX');
    expect(row.notes).toBe('hand-edited note');
  });

  it('skips subdirs without metadata.json silently', async () => {
    fs.mkdirSync(path.join(kdpReady, 'incomplete'), { recursive: true });
    const result = await scanOnce();
    expect(result.inserted).toBe(0);
    expect(result.skipped).toBe(1);
  });

  it('returns zero counts when the root directory does not exist', async () => {
    fs.rmSync(kdpReady, { recursive: true, force: true });
    const result = await scanOnce();
    expect(result).toEqual({ inserted: 0, updated: 0, skipped: 0 });
  });

  it('handles a book with no listing.md (parses metadata-only)', async () => {
    const dir = path.join(kdpReady, 'meta-only');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, 'metadata.json'),
      JSON.stringify({ book_id: 'meta-only', title: 'Meta Only' }),
    );
    const result = await scanOnce();
    expect(result.inserted).toBe(1);
    const db = openDb();
    const row = db
      .prepare('SELECT slug, title, blurb, page_count FROM kdp_books WHERE slug=?')
      .get('meta-only');
    expect(row).toEqual({
      slug: 'meta-only',
      title: 'Meta Only',
      blurb: null,
      page_count: null,
    });
  });

  it('emits kdp:new-book event for each inserted book', async () => {
    seedBook('book-x', 'Book X');
    const received = [];
    subscribe((evt) => received.push(evt));
    await scanOnce();
    const newBookEvents = received.filter((e) => e.kind === 'kdp:new-book');
    expect(newBookEvents).toHaveLength(1);
    expect(newBookEvents[0].payload).toMatchObject({
      slug: 'book-x',
      title: 'Book X',
    });
  });
});
