/**
 * Migration 0002 verification: after migration applies, kdp_books has the
 * three new columns and they accept the values from spec §4. Idempotency
 * is exercised by re-opening the DB (db.js skips already-applied migrations).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { openDb, _resetForTests } from '../db.js';

let tmpRoot;
let tmpDb;

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mig0002-'));
  tmpDb = path.join(tmpRoot, 'test.db');
  process.env.ROOSTER_DB_PATH = tmpDb;
  _resetForTests();
});

afterEach(() => {
  _resetForTests();
  try {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  } catch (_e) {
    // best-effort
  }
  delete process.env.ROOSTER_DB_PATH;
});

describe('migration 0002_puzzle_audit', () => {
  it('adds puzzle_audit_status, puzzle_audit_at, puzzle_audit_summary_json columns', () => {
    const db = openDb();
    const cols = db.prepare('PRAGMA table_info(kdp_books)').all().map((c) => c.name);
    expect(cols).toContain('puzzle_audit_status');
    expect(cols).toContain('puzzle_audit_at');
    expect(cols).toContain('puzzle_audit_summary_json');
  });

  it('accepts the three valid status values and NULL', () => {
    const db = openDb();
    const ins = db.prepare(`
      INSERT INTO kdp_books (slug, title, status, output_dir, puzzle_audit_status)
      VALUES (?, ?, 'built', ?, ?)
    `);
    expect(() => ins.run('a', 'A', '/tmp/a', 'unchecked')).not.toThrow();
    expect(() => ins.run('b', 'B', '/tmp/b', 'passed')).not.toThrow();
    expect(() => ins.run('c', 'C', '/tmp/c', 'failed')).not.toThrow();
    expect(() => ins.run('d', 'D', '/tmp/d', null)).not.toThrow();
  });

  it('rejects invalid status values via CHECK constraint', () => {
    const db = openDb();
    expect(() => {
      db.prepare(`
        INSERT INTO kdp_books (slug, title, status, output_dir, puzzle_audit_status)
        VALUES ('bad', 'Bad', 'built', '/tmp/bad', 'totally-invalid')
      `).run();
    }).toThrow(/CHECK constraint failed/);
  });

  it('is idempotent across re-opens', () => {
    openDb();
    _resetForTests();
    openDb(); // would crash if the migration re-ran ALTER TABLE
    expect(true).toBe(true);
  });
});
