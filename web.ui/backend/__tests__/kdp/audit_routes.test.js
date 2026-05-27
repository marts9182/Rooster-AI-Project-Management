/**
 * Tests for POST /api/kdp/books/:slug/audit-puzzles.
 *
 * Injects a fake pythonRunner so the test never spawns python. The fake
 * receives the slug and returns canned audit-JSON stdout.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { openDb, _resetForTests } from '../../db.js';
import { _resetSubscribersForTests, subscribe } from '../../events.js';
import { createAuditRouter } from '../../kdp/audit_routes.js';

let tmpRoot;
let tmpDb;
let runnerCalls;
let runnerImpl;
let app;
let events;

function buildApp() {
  const a = express();
  a.use(express.json());
  a.use(
    '/api/kdp',
    createAuditRouter({
      pythonRunner: async (...args) => {
        runnerCalls.push(args);
        return runnerImpl(...args);
      },
    }),
  );
  return a;
}

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'audit-routes-'));
  tmpDb = path.join(tmpRoot, 'test.db');
  process.env.ROOSTER_DB_PATH = tmpDb;
  _resetForTests();
  _resetSubscribersForTests();
  events = [];
  subscribe((e) => events.push(e));
  runnerCalls = [];
  runnerImpl = async () => ({
    code: 0,
    stdout: JSON.stringify({
      puzzles: [
        {
          index: 1,
          difficulty: 'easy',
          clue_count: 42,
          is_unique: true,
          symmetric_180: true,
          technique_tier: 'naked_singles',
          match_difficulty: true,
        },
      ],
      totals: {
        checked: 1,
        passed: 1,
        failed: 0,
        uniqueness_failures: 0,
        symmetry_failures: 0,
        tier_mismatches: 0,
      },
    }),
    stderr: '',
  });
  app = buildApp();
  const db = openDb();
  db.prepare(`
    INSERT INTO kdp_books (slug, title, status, output_dir)
    VALUES ('book-a', 'Book A', 'built', ?)
  `).run(path.join(tmpRoot, 'book-a'));
});

afterEach(() => {
  _resetForTests();
  _resetSubscribersForTests();
  try { fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch (_e) {
    // best-effort
  }
  delete process.env.ROOSTER_DB_PATH;
});

describe('POST /api/kdp/books/:slug/audit-puzzles', () => {
  it('writes passed/at/json on a clean audit', async () => {
    const res = await request(app)
      .post('/api/kdp/books/book-a/audit-puzzles')
      .send();
    expect(res.status).toBe(200);
    expect(res.body.book.puzzle_audit_status).toBe('passed');
    expect(res.body.book.puzzle_audit_at).toBeTruthy();
    const summary = JSON.parse(res.body.book.puzzle_audit_summary_json);
    expect(summary.totals.checked).toBe(1);
  });

  it('emits kdp:audit-started then kdp:audit-complete events', async () => {
    await request(app).post('/api/kdp/books/book-a/audit-puzzles').send();
    const kinds = events.map((e) => e.kind);
    expect(kinds).toContain('kdp:audit-started');
    expect(kinds).toContain('kdp:audit-complete');
  });

  it('writes failed when any puzzle does not pass', async () => {
    runnerImpl = async () => ({
      code: 0,
      stdout: JSON.stringify({
        puzzles: [{ index: 1, difficulty: 'easy', clue_count: 42, is_unique: false, symmetric_180: true, technique_tier: 'naked_singles', match_difficulty: true }],
        totals: { checked: 1, passed: 0, failed: 1, uniqueness_failures: 1, symmetry_failures: 0, tier_mismatches: 0 },
      }),
      stderr: '',
    });
    const res = await request(app).post('/api/kdp/books/book-a/audit-puzzles').send();
    expect(res.status).toBe(200);
    expect(res.body.book.puzzle_audit_status).toBe('failed');
  });

  it('rejects slugs that do not match ^[a-z0-9][a-z0-9-]*$', async () => {
    const res = await request(app).post('/api/kdp/books/Bad_Slug/audit-puzzles').send();
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid_slug');
    expect(runnerCalls.length).toBe(0);
  });

  it('returns 404 for unknown book', async () => {
    const res = await request(app).post('/api/kdp/books/no-such-book/audit-puzzles').send();
    expect(res.status).toBe(404);
  });

  it('records failed + error on non-zero subprocess exit', async () => {
    runnerImpl = async () => ({ code: 2, stdout: '', stderr: 'boom from python' });
    const res = await request(app).post('/api/kdp/books/book-a/audit-puzzles').send();
    expect(res.status).toBe(500);
    expect(res.body.book.puzzle_audit_status).toBe('failed');
    const summary = JSON.parse(res.body.book.puzzle_audit_summary_json);
    expect(summary.error).toMatch(/boom/);
  });

  it('records failed + audit_timeout on runner timeout', async () => {
    runnerImpl = async () => ({ code: null, stdout: '', stderr: '', timedOut: true });
    const res = await request(app).post('/api/kdp/books/book-a/audit-puzzles').send();
    expect(res.status).toBe(500);
    const summary = JSON.parse(res.body.book.puzzle_audit_summary_json);
    expect(summary.error).toBe('audit_timeout');
  });
});
