/**
 * Tests for pinterest/queue.js — enqueuePinsForBook + dequeueNext + mark*
 * + pause/resume + list/update/cancel.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { openDb, _resetForTests } from '../../db.js';
import {
  enqueuePinsForBook,
  dequeueNext,
  markPosted,
  markFailed,
  pauseQueue,
  resumeQueue,
  listQueue,
  listHistory,
  updateQueueRow,
  cancelQueueRow,
} from '../../pinterest/queue.js';

let tmpRoot;

async function fakePng(file, w, h) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  await sharp({
    create: { width: w, height: h, channels: 3, background: { r: 220, g: 220, b: 220 } },
  })
    .png()
    .toFile(file);
}

async function seedBook(slug, title) {
  const outDir = path.join(tmpRoot, 'kdp-ready', slug);
  await fakePng(path.join(outDir, 'cover_preview.png'), 800, 1200);
  for (let i = 1; i <= 5; i++) {
    await fakePng(path.join(outDir, `interior_${i}.png`), 600, 800);
  }
  const db = openDb();
  const info = db
    .prepare(`
      INSERT INTO kdp_books (slug, title, status, output_dir, cover_path, asin, blurb)
      VALUES (?, ?, 'published', ?, ?, 'B0TESTASIN', 'A short blurb about the book.')
    `)
    .run(slug, title, outDir, path.join(outDir, 'cover_preview.png'));
  return info.lastInsertRowid;
}

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pin-queue-'));
  process.env.ROOSTER_DB_PATH = path.join(tmpRoot, 'dashboard.db');
  process.env.PINTEREST_OUTPUT_ROOT = path.join(tmpRoot, 'output', 'pinterest');
  _resetForTests();
});

afterEach(() => {
  _resetForTests();
  fs.rmSync(tmpRoot, { recursive: true, force: true });
  delete process.env.ROOSTER_DB_PATH;
  delete process.env.PINTEREST_OUTPUT_ROOT;
});

describe('enqueuePinsForBook', () => {
  it('creates exactly 6 rows (1 cover_hero + 5 interior_preview) with PNG files written', async () => {
    const bookId = await seedBook('kakuro-quiet-minds', 'Kakuro for Quiet Minds');
    const rows = await enqueuePinsForBook(bookId);
    expect(rows).toHaveLength(6);
    expect(rows.filter((r) => r.pin_type === 'cover_hero')).toHaveLength(1);
    expect(rows.filter((r) => r.pin_type === 'interior_preview')).toHaveLength(5);
    for (const r of rows) {
      expect(fs.existsSync(r.image_path)).toBe(true);
      expect(r.link_url).toBe('https://www.amazon.com/dp/B0TESTASIN');
    }
  });

  it('throws if the book is missing', async () => {
    await expect(enqueuePinsForBook(9999)).rejects.toThrow(/not found/);
  });

  it('skips generation gracefully when source PNGs are missing', async () => {
    const db = openDb();
    const info = db
      .prepare(`
        INSERT INTO kdp_books (slug, title, status, output_dir, asin)
        VALUES ('no-art', 'No Art', 'published', '/does/not/exist', 'B0NOART000')
      `)
      .run();
    const rows = await enqueuePinsForBook(info.lastInsertRowid);
    // Only rows with valid source images are produced; cover & interiors missing → 0.
    expect(rows).toHaveLength(0);
  });
});

describe('dequeue + mark', () => {
  it('dequeueNext returns the oldest pending row whose scheduled_for is in the past', async () => {
    const db = openDb();
    const past = new Date(Date.now() - 60_000).toISOString();
    const future = new Date(Date.now() + 60 * 60_000).toISOString();
    db.prepare(`
      INSERT INTO pinterest_queue (kdp_book_id, pin_type, image_path, title, description, link_url, status, scheduled_for)
      VALUES (NULL, 'cover_hero', '/x.png', 'Past',   'desc', 'http://x', 'pending', ?),
             (NULL, 'cover_hero', '/y.png', 'Future', 'desc', 'http://y', 'pending', ?)
    `).run(past, future);

    const next = dequeueNext();
    expect(next).toBeTruthy();
    expect(next.title).toBe('Past');
  });

  it('markPosted writes a pinterest_history row and flips queue status', async () => {
    const db = openDb();
    const info = db.prepare(`
      INSERT INTO pinterest_queue (kdp_book_id, pin_type, image_path, title, description, link_url, status, scheduled_for)
      VALUES (NULL, 'cover_hero', '/x.png', 'T', 'D', 'http://x', 'posting', ?)
    `).run(new Date().toISOString());
    const id = Number(info.lastInsertRowid);
    markPosted(id, 'pin_abc123');
    const q = db.prepare('SELECT status FROM pinterest_queue WHERE id = ?').get(id);
    const h = db.prepare('SELECT pinterest_pin_id, success FROM pinterest_history WHERE queue_id = ?').get(id);
    expect(q.status).toBe('posted');
    expect(h.pinterest_pin_id).toBe('pin_abc123');
    expect(h.success).toBe(1);
  });

  it('markFailed increments attempts and stores last_error', async () => {
    const db = openDb();
    const info = db.prepare(`
      INSERT INTO pinterest_queue (kdp_book_id, pin_type, image_path, title, description, link_url, status, scheduled_for)
      VALUES (NULL, 'cover_hero', '/x.png', 'T', 'D', 'http://x', 'posting', ?)
    `).run(new Date().toISOString());
    const id = Number(info.lastInsertRowid);
    markFailed(id, 'network down');
    const row = db.prepare('SELECT status, attempts, last_error FROM pinterest_queue WHERE id = ?').get(id);
    expect(row.status).toBe('failed');
    expect(row.attempts).toBe(1);
    expect(row.last_error).toBe('network down');
  });
});

describe('pause + resume', () => {
  it('pauseQueue flips all pending rows to paused, resumeQueue flips them back', async () => {
    const db = openDb();
    const t = new Date().toISOString();
    for (let i = 0; i < 3; i++) {
      db.prepare(`
        INSERT INTO pinterest_queue (kdp_book_id, pin_type, image_path, title, description, link_url, status, scheduled_for)
        VALUES (NULL, 'cover_hero', '/x.png', ?, 'D', 'http://x', 'pending', ?)
      `).run(`T${i}`, t);
    }
    const paused = pauseQueue();
    expect(paused).toBe(3);
    let still = db.prepare("SELECT COUNT(*) AS n FROM pinterest_queue WHERE status='pending'").get().n;
    expect(still).toBe(0);
    const resumed = resumeQueue();
    expect(resumed).toBe(3);
    still = db.prepare("SELECT COUNT(*) AS n FROM pinterest_queue WHERE status='pending'").get().n;
    expect(still).toBe(3);
  });
});

describe('listQueue + listHistory', () => {
  it('listQueue returns pending+posting+paused, newest scheduled first', async () => {
    const db = openDb();
    const t = new Date().toISOString();
    db.prepare(`
      INSERT INTO pinterest_queue (kdp_book_id, pin_type, image_path, title, description, link_url, status, scheduled_for)
      VALUES (NULL, 'cover_hero', '/x.png', 'A', 'D', 'http://x', 'pending',  ?),
             (NULL, 'cover_hero', '/x.png', 'B', 'D', 'http://x', 'posted',   ?),
             (NULL, 'cover_hero', '/x.png', 'C', 'D', 'http://x', 'paused',   ?)
    `).run(t, t, t);
    const q = listQueue();
    expect(q.map((r) => r.title).sort()).toEqual(['A', 'C']);
  });

  it('listHistory returns last 100 rows with success/fail decoded', async () => {
    const db = openDb();
    const t = new Date().toISOString();
    const info = db.prepare(`
      INSERT INTO pinterest_queue (kdp_book_id, pin_type, image_path, title, description, link_url, status, scheduled_for)
      VALUES (NULL, 'cover_hero', '/x.png', 'T', 'D', 'http://x', 'posted', ?)
    `).run(t);
    const qid = Number(info.lastInsertRowid);
    db.prepare(`
      INSERT INTO pinterest_history (queue_id, pinterest_pin_id, posted_at, success, error_message)
      VALUES (?, 'pin1', ?, 1, NULL)
    `).run(qid, t);
    const h = listHistory(100);
    expect(h).toHaveLength(1);
    expect(h[0].success).toBe(true);
    expect(h[0].pinterest_pin_id).toBe('pin1');
  });
});

describe('updateQueueRow + cancelQueueRow', () => {
  it('updates title, description, scheduled_for of a pending row', async () => {
    const db = openDb();
    const info = db.prepare(`
      INSERT INTO pinterest_queue (kdp_book_id, pin_type, image_path, title, description, link_url, status, scheduled_for)
      VALUES (NULL, 'cover_hero', '/x.png', 'Old', 'old', 'http://x', 'pending', ?)
    `).run(new Date().toISOString());
    const id = Number(info.lastInsertRowid);
    const newTs = new Date(Date.now() + 60 * 60_000).toISOString();
    updateQueueRow(id, { title: 'New', description: 'new', scheduled_for: newTs });
    const row = db.prepare('SELECT title, description, scheduled_for FROM pinterest_queue WHERE id=?').get(id);
    expect(row.title).toBe('New');
    expect(row.description).toBe('new');
    expect(row.scheduled_for).toBe(newTs);
  });

  it('cancelQueueRow deletes a pending row', async () => {
    const db = openDb();
    const info = db.prepare(`
      INSERT INTO pinterest_queue (kdp_book_id, pin_type, image_path, title, description, link_url, status, scheduled_for)
      VALUES (NULL, 'cover_hero', '/x.png', 'A', 'D', 'http://x', 'pending', ?)
    `).run(new Date().toISOString());
    const id = Number(info.lastInsertRowid);
    cancelQueueRow(id);
    const row = db.prepare('SELECT * FROM pinterest_queue WHERE id=?').get(id);
    expect(row).toBeUndefined();
  });
});
