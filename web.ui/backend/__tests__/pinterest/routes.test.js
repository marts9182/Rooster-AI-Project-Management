/**
 * Tests for pinterest/routes.js — Express REST routes for queue, history,
 * pause/resume, edit, cancel, and the API-backed whoami/boards/token-status/
 * refresh endpoints.
 *
 * No real Pinterest API calls fire: the whoami/boards/token-status/refresh
 * tests pass a fake apiClient via installPinterestModule(app, {apiClient}).
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

async function makeAppWithApi(api) {
  const events = await import('../../events.js');
  subscribe = events.subscribe;
  _resetSubscribersForTests = events._resetSubscribersForTests;
  const { installPinterestModule } = await import('../../pinterest/index.js');
  const a = express();
  a.use(express.json());
  installPinterestModule(a, { apiClient: api });
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

// --- API-backed routes (whoami / boards / token-status / refresh) ---------

describe('GET /api/pinterest/whoami', () => {
  it('returns the user account from apiClient.getUserAccount', async () => {
    const api = {
      getUserAccount: vi.fn(async () => ({
        username: 'prp',
        business_name: 'Pocket Rooster Press',
      })),
      listBoards: vi.fn(),
      getTokenStatus: vi.fn(),
      createPin: vi.fn(),
      _forceRefresh: vi.fn(),
    };
    const a2 = await makeAppWithApi(api);
    const res = await request(a2).get('/api/pinterest/whoami');
    expect(res.status).toBe(200);
    expect(res.body.username).toBe('prp');
    expect(res.body.business_name).toBe('Pocket Rooster Press');
    expect(api.getUserAccount).toHaveBeenCalled();
  });

  it('returns 500 with the api error message on failure', async () => {
    const api = {
      getUserAccount: vi.fn(async () => {
        throw new Error('upstream 401');
      }),
      listBoards: vi.fn(),
      getTokenStatus: vi.fn(),
      createPin: vi.fn(),
      _forceRefresh: vi.fn(),
    };
    const a2 = await makeAppWithApi(api);
    const res = await request(a2).get('/api/pinterest/whoami');
    expect(res.status).toBe(500);
    expect(res.body.error).toMatch(/upstream 401/);
  });

  it('returns 503 when no apiClient is configured', async () => {
    const res = await request(app).get('/api/pinterest/whoami');
    expect(res.status).toBe(503);
    expect(res.body.error).toBe('api_client_unavailable');
  });
});

describe('GET /api/pinterest/boards', () => {
  it('returns boards array from apiClient.listBoards', async () => {
    const api = {
      listBoards: vi.fn(async () => [
        { id: 'B1', name: 'Coloring' },
        { id: 'B2', name: 'Sudoku' },
      ]),
      getUserAccount: vi.fn(),
      getTokenStatus: vi.fn(),
      createPin: vi.fn(),
      _forceRefresh: vi.fn(),
    };
    const a2 = await makeAppWithApi(api);
    const res = await request(a2).get('/api/pinterest/boards');
    expect(res.status).toBe(200);
    expect(res.body.boards).toHaveLength(2);
    expect(res.body.boards[0].id).toBe('B1');
  });

  it('returns 500 with the api error message on failure', async () => {
    const api = {
      listBoards: vi.fn(async () => {
        throw new Error('boards fetch failed');
      }),
      getUserAccount: vi.fn(),
      getTokenStatus: vi.fn(),
      createPin: vi.fn(),
      _forceRefresh: vi.fn(),
    };
    const a2 = await makeAppWithApi(api);
    const res = await request(a2).get('/api/pinterest/boards');
    expect(res.status).toBe(500);
    expect(res.body.error).toMatch(/boards fetch failed/);
  });
});

describe('GET /api/pinterest/token-status', () => {
  it('returns connected/expires_at envelope from apiClient.getLiveStatus', async () => {
    const api = {
      getLiveStatus: vi.fn(async () => ({
        connected: true,
        expires_at: '2026-06-26T18:32:00.000Z',
      })),
      getTokenStatus: vi.fn(),
      listBoards: vi.fn(),
      getUserAccount: vi.fn(),
      createPin: vi.fn(),
      _forceRefresh: vi.fn(),
    };
    const a2 = await makeAppWithApi(api);
    const res = await request(a2).get('/api/pinterest/token-status');
    expect(res.status).toBe(200);
    expect(res.body.connected).toBe(true);
    expect(res.body.expires_at).toBe('2026-06-26T18:32:00.000Z');
  });

  it('returns 500 with the api error message on failure', async () => {
    const api = {
      getLiveStatus: vi.fn(async () => {
        throw new Error('disk read failed');
      }),
      getTokenStatus: vi.fn(),
      listBoards: vi.fn(),
      getUserAccount: vi.fn(),
      createPin: vi.fn(),
      _forceRefresh: vi.fn(),
    };
    const a2 = await makeAppWithApi(api);
    const res = await request(a2).get('/api/pinterest/token-status');
    expect(res.status).toBe(500);
    expect(res.body.error).toMatch(/disk read failed/);
  });
});

describe('POST /api/pinterest/refresh', () => {
  it('calls apiClient._forceRefresh then returns getTokenStatus()', async () => {
    const api = {
      _forceRefresh: vi.fn(async () => {}),
      getTokenStatus: vi.fn(async () => ({
        connected: true,
        expires_at: '2026-07-26T18:32:00.000Z',
      })),
      listBoards: vi.fn(),
      getUserAccount: vi.fn(),
      createPin: vi.fn(),
    };
    const a2 = await makeAppWithApi(api);
    const res = await request(a2).post('/api/pinterest/refresh').send({});
    expect(res.status).toBe(200);
    expect(res.body.connected).toBe(true);
    expect(api._forceRefresh).toHaveBeenCalled();
    expect(api.getTokenStatus).toHaveBeenCalled();
  });

  it('surfaces a 401 when the refresh-token is expired', async () => {
    const err = new Error('Pinterest refresh token expired — re-auth required');
    /** @type {any} */ (err).status = 401;
    const api = {
      _forceRefresh: vi.fn(async () => {
        throw err;
      }),
      getTokenStatus: vi.fn(),
      listBoards: vi.fn(),
      getUserAccount: vi.fn(),
      createPin: vi.fn(),
    };
    const a2 = await makeAppWithApi(api);
    const res = await request(a2).post('/api/pinterest/refresh').send({});
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/re-auth/i);
  });

  it('returns 500 on a non-401 refresh failure', async () => {
    const api = {
      _forceRefresh: vi.fn(async () => {
        throw new Error('network error: ECONNRESET');
      }),
      getTokenStatus: vi.fn(),
      listBoards: vi.fn(),
      getUserAccount: vi.fn(),
      createPin: vi.fn(),
    };
    const a2 = await makeAppWithApi(api);
    const res = await request(a2).post('/api/pinterest/refresh').send({});
    expect(res.status).toBe(500);
    expect(res.body.error).toMatch(/ECONNRESET/);
  });
});

describe('GET /api/pinterest/cadence', () => {
  it('returns 30 buckets by default', async () => {
    const resp = await request(app).get('/api/pinterest/cadence');
    expect(resp.status).toBe(200);
    expect(resp.body.buckets.length).toBe(30);
    expect(resp.body.target_per_day).toBe(4);
  });

  it('honors the days query param', async () => {
    const resp = await request(app).get('/api/pinterest/cadence?days=7');
    expect(resp.body.buckets.length).toBe(7);
  });
});

describe('GET /api/pinterest/engagement', () => {
  it('returns the expected shape', async () => {
    const resp = await request(app).get('/api/pinterest/engagement');
    expect(resp.status).toBe(200);
    expect(Array.isArray(resp.body.rows)).toBe(true);
    expect(typeof resp.body.engagement_disabled).toBe('boolean');
  });
});
