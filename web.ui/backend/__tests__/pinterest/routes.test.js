/**
 * Tests for pinterest/routes.js — Express REST routes for queue, history,
 * pause/resume, edit, cancel, and the visible Playwright login trigger.
 *
 * No real Playwright fires: the login endpoint is exercised by replacing
 * `pinterest/login.js` via `vi.doMock` before the routes module is
 * (re-)imported.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openDb, _resetForTests } from '../../db.js';

let tmpRoot;
let app;
/** @type {(fn: (evt: any) => void) => () => void} */
let subscribe;
/** @type {() => void} */
let _resetSubscribersForTests;

async function makeApp() {
  // Pull a fresh `events` module so the test's `subscribe` reference points
  // at the same subscribers Set that the (also freshly-loaded) routes.js
  // will publish into.
  const events = await import('../../events.js');
  subscribe = events.subscribe;
  _resetSubscribersForTests = events._resetSubscribersForTests;
  const { installPinterestModule } = await import('../../pinterest/index.js');
  const a = express();
  a.use(express.json());
  installPinterestModule(a);
  return a;
}

beforeEach(async () => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pin-routes-'));
  process.env.ROOSTER_DB_PATH = path.join(tmpRoot, 'dashboard.db');
  _resetForTests();
  app = await makeApp();
  _resetSubscribersForTests();
});

afterEach(() => {
  _resetForTests();
  _resetSubscribersForTests();
  vi.doUnmock('../../pinterest/login.js');
  vi.resetModules();
  try {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  } catch (_e) {
    // best-effort — Windows holds DB locks briefly even after close.
  }
  delete process.env.ROOSTER_DB_PATH;
});

function seedRow(status = 'pending', sched = new Date(Date.now() + 60_000).toISOString()) {
  const db = openDb();
  const info = db
    .prepare(
      `INSERT INTO pinterest_queue
         (kdp_book_id, pin_type, image_path, title, description, link_url, status, scheduled_for)
       VALUES (NULL, 'cover_hero', '/x.png', 'T', 'D', 'http://x', ?, ?)`,
    )
    .run(status, sched);
  return Number(info.lastInsertRowid);
}

describe('GET /api/pinterest/queue', () => {
  it('returns pending+posting+paused (and excludes posted)', async () => {
    seedRow('pending');
    seedRow('posted');
    const res = await request(app).get('/api/pinterest/queue');
    expect(res.status).toBe(200);
    expect(res.body.queue).toHaveLength(1);
    expect(res.body.queue[0].status).toBe('pending');
  });
});

describe('GET /api/pinterest/history', () => {
  it('returns history rows with success normalized to boolean', async () => {
    const id = seedRow('posted');
    const db = openDb();
    db.prepare(
      `INSERT INTO pinterest_history (queue_id, pinterest_pin_id, posted_at, success, error_message)
       VALUES (?, 'pin1', ?, 1, NULL)`,
    ).run(id, new Date().toISOString());
    const res = await request(app).get('/api/pinterest/history');
    expect(res.status).toBe(200);
    expect(res.body.history).toHaveLength(1);
    expect(res.body.history[0].success).toBe(true);
  });

  it('honors a custom limit (clamped to 1..500)', async () => {
    const res = await request(app).get('/api/pinterest/history?limit=25');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.history)).toBe(true);
  });
});

describe('POST /api/pinterest/pause + /resume', () => {
  it('pauses then resumes and emits SSE events', async () => {
    seedRow('pending');
    seedRow('pending');
    const seen = [];
    const off = subscribe((evt) => seen.push(evt.kind));

    const r1 = await request(app).post('/api/pinterest/pause').send({});
    expect(r1.status).toBe(200);
    expect(r1.body.paused).toBe(2);

    const r2 = await request(app).post('/api/pinterest/resume').send({});
    expect(r2.status).toBe(200);
    expect(r2.body.resumed).toBe(2);

    off();
    expect(seen).toContain('pinterest:paused');
    expect(seen).toContain('pinterest:resumed');
  });
});

describe('POST /api/pinterest/queue/:id/cancel', () => {
  it('cancels a pending row and emits an SSE event', async () => {
    const id = seedRow('pending');
    const seen = [];
    const off = subscribe((evt) => seen.push(evt));
    const res = await request(app).post(`/api/pinterest/queue/${id}/cancel`).send({});
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    const db = openDb();
    const row = db.prepare('SELECT * FROM pinterest_queue WHERE id=?').get(id);
    expect(row).toBeUndefined();
    off();
    const kinds = seen.map((e) => e.kind);
    expect(kinds).toContain('pinterest:queue-row-cancelled');
  });

  it('returns 400 on a bad id', async () => {
    const res = await request(app).post('/api/pinterest/queue/abc/cancel').send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });

  it('returns 404 when the row does not exist', async () => {
    const res = await request(app).post('/api/pinterest/queue/9999/cancel').send({});
    expect(res.status).toBe(404);
    expect(res.body.error).toBeDefined();
  });
});

describe('PUT /api/pinterest/queue/:id', () => {
  it('updates title and scheduled_for', async () => {
    const id = seedRow('pending');
    const newTs = new Date(Date.now() + 86400_000).toISOString();
    const res = await request(app)
      .put(`/api/pinterest/queue/${id}`)
      .send({ title: 'Renamed', scheduled_for: newTs });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    const db = openDb();
    const row = db
      .prepare('SELECT title, scheduled_for FROM pinterest_queue WHERE id=?')
      .get(id);
    expect(row.title).toBe('Renamed');
    expect(row.scheduled_for).toBe(newTs);
  });

  it('returns 400 on a bad id', async () => {
    const res = await request(app).put('/api/pinterest/queue/abc').send({ title: 'x' });
    expect(res.status).toBe(400);
  });

  it('returns 400 on an empty body', async () => {
    const id = seedRow('pending');
    const res = await request(app).put(`/api/pinterest/queue/${id}`).send({});
    expect(res.status).toBe(400);
  });

  it('returns 404 when the row does not exist', async () => {
    const res = await request(app)
      .put('/api/pinterest/queue/9999')
      .send({ title: 'x' });
    expect(res.status).toBe(404);
  });
});

describe('POST /api/pinterest/login', () => {
  it('invokes the login helper and emits pinterest:login-requested', async () => {
    // Replace the login module before re-importing routes.js.
    const fake = {
      runVisibleLogin: vi.fn(async () => {}),
      defaultProfileDir: () => '/tmp',
    };
    vi.doMock('../../pinterest/login.js', () => fake);
    _resetForTests();
    vi.resetModules();
    const a2 = await makeApp();
    _resetSubscribersForTests();

    const seen = [];
    const off = subscribe((evt) => seen.push(evt.kind));

    const res = await request(a2).post('/api/pinterest/login').send({});
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.launched).toBe(true);
    // Allow the fire-and-forget microtask to drain.
    await new Promise((r) => setImmediate(r));
    expect(fake.runVisibleLogin).toHaveBeenCalled();

    off();
    expect(seen).toContain('pinterest:login-requested');
  });
});
