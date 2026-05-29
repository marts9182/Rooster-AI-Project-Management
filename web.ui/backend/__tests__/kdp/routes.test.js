/**
 * Tests for the KDP routes module: list / detail / mark-in-review /
 * mark-published.
 *
 * Uses supertest against an isolated Express app + temp SQLite DB. The
 * Pinterest planner and preview renderer are injected via factories so
 * the tests don't touch real Pinterest planning logic or gm.
 */
import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
} from 'vitest';
import express from 'express';
import request from 'supertest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { openDb, _resetForTests } from '../../db.js';
import { _resetSubscribersForTests, subscribe } from '../../events.js';
import { createKdpRouter } from '../../kdp/routes.js';
import { _resetForTests as _resetPreviewStore } from '../../kdp/preview_store.js';

let tmpRoot;
let tmpDb;
let app;
let enqueueCalls;
let previewCalls;

function buildApp() {
  // Stub the Plan E enqueue function so the test doesn't render real PNGs.
  // It inserts six rows directly into pinterest_queue (mirroring what the
  // real enqueuePinsForBook does after generating the PNGs) and returns them.
  const enqueuePinsForBookFn = async (bookId) => {
    const db = openDb();
    const book = db.prepare('SELECT * FROM kdp_books WHERE id=?').get(bookId);
    enqueueCalls.push({ bookId, slug: book?.slug, asin: book?.asin });
    if (!book || !book.asin) return [];
    const linkUrl = `https://www.amazon.com/dp/${book.asin}`;
    const now = new Date();
    const insert = db.prepare(`
      INSERT INTO pinterest_queue
        (kdp_book_id, pin_type, image_path, title, description, link_url, status, scheduled_for)
      VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)
    `);
    const rows = [];
    const specs = [
      { type: 'cover_hero', file: 'cover_hero-0.png', title: book.title },
      ...[1, 2, 3, 4, 5].map((i) => ({
        type: 'interior_preview',
        file: `interior_preview-${i}.png`,
        title: `${book.title} - inside ${i}`,
      })),
    ];
    for (let i = 0; i < specs.length; i++) {
      const s = specs[i];
      const scheduledFor = new Date(now.getTime() + (i + 1) * 3600_000).toISOString();
      const info = insert.run(
        book.id,
        s.type,
        `output/pinterest/${book.slug}/${s.file}`,
        s.title,
        'desc',
        linkUrl,
        scheduledFor,
      );
      rows.push(db.prepare('SELECT * FROM pinterest_queue WHERE id=?').get(Number(info.lastInsertRowid)));
    }
    return rows;
  };

  const previewRendererFactory = async (book) => {
    previewCalls.push(book.slug);
    return [path.join(tmpRoot, 'previews', book.slug, 'interior-01.png')];
  };

  const a = express();
  a.use(express.json());
  a.use('/api/kdp', createKdpRouter({ enqueuePinsForBookFn, previewRendererFactory }));
  return a;
}

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kdp-routes-'));
  tmpDb = path.join(tmpRoot, 'test.db');
  process.env.ROOSTER_DB_PATH = tmpDb;
  _resetForTests();
  _resetSubscribersForTests();
  enqueueCalls = [];
  previewCalls = [];
  app = buildApp();

  const db = openDb();
  db.prepare(`
    INSERT INTO kdp_books (slug, title, status, output_dir, page_count, blurb)
    VALUES ('book-a', 'Book A', 'built', ?, 120, 'A blurb for Book A')
  `).run(path.join(tmpRoot, 'book-a'));
  db.prepare(`
    INSERT INTO kdp_books (slug, title, status, output_dir, asin, release_date, listing_url)
    VALUES ('book-b', 'Book B', 'published', ?, 'B0XYZ12345', '2026-05-01', 'https://www.amazon.com/dp/B0XYZ12345')
  `).run(path.join(tmpRoot, 'book-b'));
});

afterEach(() => {
  _resetForTests();
  _resetSubscribersForTests();
  try {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  } catch (_err) {
    // best-effort
  }
  delete process.env.ROOSTER_DB_PATH;
});

describe('GET /api/kdp/books', () => {
  it('returns all rows', async () => {
    const res = await request(app).get('/api/kdp/books');
    expect(res.status).toBe(200);
    expect(res.body.books).toHaveLength(2);
    const slugs = res.body.books.map((b) => b.slug).sort();
    expect(slugs).toEqual(['book-a', 'book-b']);
  });

  it('filters by status when ?status=published', async () => {
    const res = await request(app).get('/api/kdp/books?status=published');
    expect(res.status).toBe(200);
    expect(res.body.books).toHaveLength(1);
    expect(res.body.books[0].slug).toBe('book-b');
  });
});

describe('GET /api/kdp/books/:slug', () => {
  it('returns the book + preview image list', async () => {
    const res = await request(app).get('/api/kdp/books/book-a');
    expect(res.status).toBe(200);
    expect(res.body.book.slug).toBe('book-a');
    expect(res.body.previews).toBeInstanceOf(Array);
    expect(res.body.previews.length).toBe(1);
    expect(previewCalls).toContain('book-a');
  });

  it('404s on unknown slug', async () => {
    const res = await request(app).get('/api/kdp/books/nonesuch');
    expect(res.status).toBe(404);
    expect(res.body.error).toBeDefined();
  });
});

describe('POST /api/kdp/books/:slug/mark-in-review', () => {
  it('transitions built->in_review and inserts a 3-day reminder', async () => {
    const received = [];
    subscribe((evt) => received.push(evt));

    const res = await request(app).post('/api/kdp/books/book-a/mark-in-review');
    expect(res.status).toBe(200);
    expect(res.body.book.status).toBe('in_review');

    const db = openDb();
    const rem = db.prepare(`
      SELECT title FROM reminders WHERE source_kind='kdp.book' AND status='pending'
    `).all();
    expect(rem.length).toBe(1);
    expect(rem[0].title).toMatch(/Check KDP review status/);

    const statusEvents = received.filter((e) => e.kind === 'kdp:status-changed');
    expect(statusEvents.length).toBe(1);
  });

  it('rejects with 409 when status is not built', async () => {
    const res = await request(app).post('/api/kdp/books/book-b/mark-in-review');
    expect(res.status).toBe(409);
  });

  it('404 on unknown slug', async () => {
    const res = await request(app).post('/api/kdp/books/nonesuch/mark-in-review');
    expect(res.status).toBe(404);
  });
});

describe('POST /api/kdp/books/:slug/mark-published', () => {
  it('400 when ASIN missing', async () => {
    const res = await request(app)
      .post('/api/kdp/books/book-a/mark-published')
      .send({ release_date: '2026-05-26' });
    expect(res.status).toBe(400);
  });

  it('400 when ASIN format invalid', async () => {
    const res = await request(app)
      .post('/api/kdp/books/book-a/mark-published')
      .send({ asin: 'XYZ', release_date: '2026-05-26' });
    expect(res.status).toBe(400);
  });

  it('400 when release_date format invalid', async () => {
    const res = await request(app)
      .post('/api/kdp/books/book-a/mark-published')
      .send({ asin: 'B0NEWBOOK1', release_date: '05/26/2026' });
    expect(res.status).toBe(400);
  });

  it('updates row, inserts day-30 reminder, queues 6 pinterest rows, emits event', async () => {
    const received = [];
    subscribe((evt) => received.push(evt));

    const res = await request(app)
      .post('/api/kdp/books/book-a/mark-published')
      .send({ asin: 'B0NEWBOOK1', release_date: '2026-05-26' });

    expect(res.status).toBe(200);
    expect(res.body.book.status).toBe('published');
    expect(res.body.book.asin).toBe('B0NEWBOOK1');
    expect(res.body.book.listing_url).toBe('https://www.amazon.com/dp/B0NEWBOOK1');
    expect(res.body.pins_queued).toBe(6);

    const db = openDb();
    const rem = db.prepare(`
      SELECT title FROM reminders WHERE source_kind='kdp.book' AND title LIKE 'KDP Day-30%'
    `).all();
    expect(rem.length).toBe(1);

    const pins = db.prepare(
      `SELECT pin_type FROM pinterest_queue WHERE kdp_book_id =
         (SELECT id FROM kdp_books WHERE slug='book-a')`
    ).all();
    expect(pins.length).toBe(6);
    expect(pins.filter((p) => p.pin_type === 'cover_hero').length).toBe(1);
    expect(pins.filter((p) => p.pin_type === 'interior_preview').length).toBe(5);

    const pubEvents = received.filter((e) => e.kind === 'kdp:published');
    expect(pubEvents.length).toBe(1);
    expect(pubEvents[0].payload).toMatchObject({ slug: 'book-a', asin: 'B0NEWBOOK1' });

    // Day-30 reminder due_at should be release_date + 30 days
    const due = db.prepare(
      `SELECT due_at FROM reminders WHERE source_kind='kdp.book' AND title LIKE 'KDP Day-30%'`
    ).get();
    const dueDate = new Date(due.due_at);
    const release = new Date('2026-05-26T12:00:00Z');
    const diffDays = Math.round((dueDate.getTime() - release.getTime()) / 86_400_000);
    expect(diffDays).toBe(30);

    // The enqueue function was called with the updated book
    expect(enqueueCalls).toContainEqual(
      expect.objectContaining({ slug: 'book-a', asin: 'B0NEWBOOK1' }),
    );
  });

  it('404 on unknown slug', async () => {
    const res = await request(app)
      .post('/api/kdp/books/nonesuch/mark-published')
      .send({ asin: 'B0NEWBOOK1', release_date: '2026-05-26' });
    expect(res.status).toBe(404);
  });

  it('mark-published advances any matching roadmap row to published', async () => {
    const db = openDb();
    // Ensure the publishing_roadmap table exists in the test DB.
    // (Migration 0007 should have run when openDb() was first called; if
    // your test rebuilds schema by hand, add it here.)
    db.exec(`
      CREATE TABLE IF NOT EXISTS publishing_roadmap (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        kind TEXT NOT NULL, slug TEXT NOT NULL, title TEXT NOT NULL,
        target_release_date TEXT NOT NULL, status TEXT NOT NULL, source TEXT NOT NULL,
        niche TEXT, rationale TEXT, file_lock_date TEXT,
        kdp_book_id INTEGER, etsy_listing_id INTEGER, notes TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        UNIQUE(kind, slug, target_release_date)
      );
    `);

    // Seed a kdp_books row + a roadmap row with the same slug.
    db.prepare(
      `INSERT INTO kdp_books (slug, title, status, output_dir)
       VALUES ('roadmap-foo', 'Roadmap Foo', 'built', ?)`,
    ).run(tmpRoot);
    db.prepare(
      `INSERT INTO publishing_roadmap
         (kind, slug, title, target_release_date, status, source, file_lock_date)
       VALUES ('kdp', 'roadmap-foo', 'Roadmap Foo', '2026-09-15', 'scheduled', 'reuse', '2026-08-31')`,
    ).run();

    await request(app)
      .post('/api/kdp/books/roadmap-foo/mark-published')
      .send({ asin: 'B0CROAD000', release_date: '2026-09-15' });

    const row = db.prepare(
      `SELECT status, kdp_book_id FROM publishing_roadmap WHERE slug='roadmap-foo'`,
    ).get();
    expect(row.status).toBe('published');
    expect(row.kdp_book_id).toBeGreaterThan(0);

    // Cleanup so subsequent tests are not affected by the seeded roadmap row.
    db.prepare(`DELETE FROM publishing_roadmap WHERE slug='roadmap-foo'`).run();
  });
});

describe('Ingest routes', () => {
  beforeEach(() => {
    _resetPreviewStore();
  });

  it('POST /ingest-bookshelf returns a preview', async () => {
    const db = openDb();
    db.prepare(
      `INSERT INTO kdp_books (slug, title, status, output_dir)
       VALUES ('foo', 'Foo Book', 'built', ?)`,
    ).run(tmpRoot);

    const resp = await request(app)
      .post('/api/kdp/ingest-bookshelf')
      .send({
        books: [
          { asin: 'B0CFOOFOOFO', kdp_title: 'Foo Book', kdp_status: 'Live' },
        ],
      });

    expect(resp.status).toBe(200);
    expect(typeof resp.body.preview_id).toBe('string');
    expect(resp.body.matches).toHaveLength(1);
    expect(resp.body.matches[0].dashboard_slug).toBe('foo');
  });

  it('POST /ingest-bookshelf with invalid body returns 400', async () => {
    const resp = await request(app)
      .post('/api/kdp/ingest-bookshelf')
      .send({ books: [{ kdp_title: 'no asin' }] });
    expect(resp.status).toBe(400);
    expect(resp.body.error).toBeTruthy();
  });

  it('GET /ingest-bookshelf/pending returns null when no preview', async () => {
    const resp = await request(app).get('/api/kdp/ingest-bookshelf/pending');
    expect(resp.status).toBe(200);
    expect(resp.body).toEqual({ preview: null });
  });

  it('GET /ingest-bookshelf/pending returns the latest preview after a POST', async () => {
    await request(app)
      .post('/api/kdp/ingest-bookshelf')
      .send({
        books: [
          { asin: 'B0CFOOFOOFO', kdp_title: 'Foo Book', kdp_status: 'Live' },
        ],
      });
    const resp = await request(app).get('/api/kdp/ingest-bookshelf/pending');
    expect(resp.status).toBe(200);
    expect(resp.body.preview).not.toBeNull();
    expect(typeof resp.body.preview.preview_id).toBe('string');
  });

  it('POST /ingest-bookshelf/commit applies the preview and clears it', async () => {
    const db = openDb();
    db.prepare(
      `INSERT INTO kdp_books (slug, title, status, output_dir, asin)
       VALUES ('foo', 'Foo Book', 'built', ?, 'B0CFOOFOOFO')`,
    ).run(tmpRoot);

    const previewResp = await request(app)
      .post('/api/kdp/ingest-bookshelf')
      .send({
        books: [
          { asin: 'B0CFOOFOOFO', kdp_title: 'Foo Book Updated', kdp_status: 'Live' },
        ],
      });
    const previewId = previewResp.body.preview_id;

    const commitResp = await request(app)
      .post('/api/kdp/ingest-bookshelf/commit')
      .send({
        preview_id: previewId,
        confirmed_orphans: [],
        ambiguous_resolutions: {},
      });
    expect(commitResp.status).toBe(200);
    expect(commitResp.body.applied).toBe(1);

    const row = db.prepare('SELECT * FROM kdp_books WHERE slug=?').get('foo');
    expect(row.title).toBe('Foo Book Updated');
    expect(row.asin).toBe('B0CFOOFOOFO');
    expect(row.status).toBe('published');

    const after = await request(app).get('/api/kdp/ingest-bookshelf/pending');
    expect(after.body).toEqual({ preview: null });
  });

  it('POST /ingest-bookshelf/commit returns 404 for unknown preview_id', async () => {
    const resp = await request(app)
      .post('/api/kdp/ingest-bookshelf/commit')
      .send({
        preview_id: '00000000-0000-0000-0000-000000000000',
        confirmed_orphans: [],
        ambiguous_resolutions: {},
      });
    expect(resp.status).toBe(404);
  });
});
