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

let tmpRoot;
let tmpDb;
let app;
let planCalls;
let previewCalls;

function buildApp() {
  const planSixPinsFactory = (book, fromDate) => {
    planCalls.push({ slug: book.slug, asin: book.asin });
    const rows = [];
    // Stub: 1 cover_hero + 5 interior_preview
    rows.push({
      kdp_book_id: book.id,
      pin_type: 'cover_hero',
      image_path: `output/pinterest/${book.slug}/cover-hero.png`,
      title: book.title,
      description: 'desc',
      link_url: `https://www.amazon.com/dp/${book.asin}`,
      scheduled_for: new Date(fromDate.getTime() + 86_400_000).toISOString(),
    });
    for (let i = 1; i <= 5; i++) {
      rows.push({
        kdp_book_id: book.id,
        pin_type: 'interior_preview',
        image_path: `output/pinterest/${book.slug}/interior-0${i}.png`,
        title: `${book.title} - inside ${i}`,
        description: 'desc',
        link_url: `https://www.amazon.com/dp/${book.asin}`,
        scheduled_for: new Date(fromDate.getTime() + (i + 1) * 86_400_000).toISOString(),
      });
    }
    return rows;
  };

  const previewRendererFactory = async (book) => {
    previewCalls.push(book.slug);
    return [path.join(tmpRoot, 'previews', book.slug, 'interior-01.png')];
  };

  const a = express();
  a.use(express.json());
  a.use('/api/kdp', createKdpRouter({ planSixPinsFactory, previewRendererFactory }));
  return a;
}

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kdp-routes-'));
  tmpDb = path.join(tmpRoot, 'test.db');
  process.env.ROOSTER_DB_PATH = tmpDb;
  _resetForTests();
  _resetSubscribersForTests();
  planCalls = [];
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

    // The planner factory was called with the updated book
    expect(planCalls).toContainEqual({ slug: 'book-a', asin: 'B0NEWBOOK1' });
  });

  it('404 on unknown slug', async () => {
    const res = await request(app)
      .post('/api/kdp/books/nonesuch/mark-published')
      .send({ asin: 'B0NEWBOOK1', release_date: '2026-05-26' });
    expect(res.status).toBe(404);
  });
});
