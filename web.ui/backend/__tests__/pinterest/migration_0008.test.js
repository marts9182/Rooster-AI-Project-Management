import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openDb, _resetForTests } from '../../db.js';

let tmpDir;
beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pin-mig-'));
  process.env.ROOSTER_DB_PATH = path.join(tmpDir, 'dashboard.db');
  _resetForTests();
});
afterEach(() => {
  _resetForTests();
  delete process.env.ROOSTER_DB_PATH;
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function cols(db, table) {
  return new Set(db.prepare(`PRAGMA table_info(${table})`).all().map((r) => r.name));
}

describe('migration 0008', () => {
  it('adds source/source_id/board_id to pinterest_queue and pinterest_history', () => {
    const db = openDb(); // runs all migrations including 0008
    const q = cols(db, 'pinterest_queue');
    const h = cols(db, 'pinterest_history');
    for (const c of ['source', 'source_id', 'board_id']) {
      expect(q.has(c), `queue.${c}`).toBe(true);
    }
    for (const c of ['source', 'source_id']) {
      expect(h.has(c), `history.${c}`).toBe(true);
    }
  });

  it('backfills source_id from kdp_book_id for existing rows', () => {
    const db = openDb();
    db.prepare(
      `INSERT INTO kdp_books (slug,title,status,output_dir) VALUES ('x','X','published','')`,
    ).run();
    const bookId = db.prepare('SELECT id FROM kdp_books').get().id;
    db.prepare(
      `INSERT INTO pinterest_queue
         (kdp_book_id,pin_type,image_path,title,description,link_url,status,scheduled_for,source,source_id)
       VALUES (?,'cover_hero','/i.png','t','d','u','pending','2026-06-04T12:00:00Z','kdp',NULL)`,
    ).run(bookId);
    db.prepare(`UPDATE pinterest_queue SET source_id = CAST(kdp_book_id AS TEXT) WHERE source_id IS NULL`).run();
    const row = db.prepare('SELECT source, source_id FROM pinterest_queue').get();
    expect(row.source).toBe('kdp');
    expect(row.source_id).toBe(String(bookId));
  });
});
