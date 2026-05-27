import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openDb, _resetForTests } from '../db.js';

let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rooster-db-'));
  process.env.ROOSTER_DB_PATH = path.join(tmpDir, 'dashboard.db');
  _resetForTests();
});

afterEach(() => {
  _resetForTests();
  fs.rmSync(tmpDir, { recursive: true, force: true });
  delete process.env.ROOSTER_DB_PATH;
});

describe('db.js', () => {
  it('creates and migrates all 7 tables on first open', () => {
    const db = openDb();
    const names = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all()
      .map((r) => r.name);
    expect(names).toEqual(
      expect.arrayContaining([
        'kdp_books',
        'etsy_listings',
        'reminders',
        'pinterest_queue',
        'pinterest_history',
        'events',
        'profile',
      ]),
    );
  });

  it('runs in WAL mode', () => {
    const db = openDb();
    const mode = db.prepare('PRAGMA journal_mode').get().journal_mode;
    expect(mode).toBe('wal');
  });

  it('seeds profile with id=1 row', () => {
    const db = openDb();
    const row = db.prepare('SELECT id FROM profile WHERE id=1').get();
    expect(row).toEqual({ id: 1 });
  });

  it('is idempotent across re-opens', () => {
    openDb().close();
    const db = openDb();
    const count = db
      .prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table'")
      .get().n;
    expect(count).toBeGreaterThanOrEqual(7);
  });
});
