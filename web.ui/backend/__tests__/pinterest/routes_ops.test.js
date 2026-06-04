/**
 * Tests for the ops routes added in Task 6:
 *   POST /api/pinterest/boards/sync  — calls ensureBoards() and returns {map}
 *   POST /api/pinterest/post-now     — force-post one pending/paused row
 *
 * Pattern mirrors routes.test.js exactly:
 *   - supertest against an express app built via installPinterestModule()
 *   - temp ROOSTER_DB_PATH + temp PINTEREST_BOARDS_MAP_PATH per test
 *   - fake apiClient injected via makeAppWithApi()
 *   - _resetForTests() / _resetSubscribersForTests() in beforeEach/afterEach
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openDb, _resetForTests } from '../../db.js';

let tmpRoot;
let _resetSubscribersForTests;

async function makeAppWithApi(api) {
  const events = await import('../../events.js');
  _resetSubscribersForTests = events._resetSubscribersForTests;
  const { installPinterestModule } = await import('../../pinterest/index.js');
  const a = express();
  a.use(express.json());
  installPinterestModule(a, { apiClient: api });
  return a;
}

async function makeApp() {
  const events = await import('../../events.js');
  _resetSubscribersForTests = events._resetSubscribersForTests;
  const { installPinterestModule } = await import('../../pinterest/index.js');
  const a = express();
  a.use(express.json());
  installPinterestModule(a);
  return a;
}

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pin-ops-'));
  process.env.ROOSTER_DB_PATH = path.join(tmpRoot, 'dashboard.db');
  _resetForTests();
});

afterEach(() => {
  _resetForTests();
  if (_resetSubscribersForTests) _resetSubscribersForTests();
  vi.resetModules();
  delete process.env.ROOSTER_DB_PATH;
  delete process.env.PINTEREST_BOARDS_MAP_PATH;
  try {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  } catch (_e) {
    // best-effort — Windows holds DB locks briefly after close
  }
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Seed a pinterest_queue row. Returns the inserted row id.
 * image_path points to a real temp file so the route can read it.
 */
function seedRow(status = 'pending', boardId = 'board-001') {
  const imgFile = path.join(tmpRoot, 'test-image.png');
  if (!fs.existsSync(imgFile)) {
    fs.writeFileSync(imgFile, Buffer.alloc(16)); // minimal placeholder
  }
  const db = openDb();
  const info = db
    .prepare(
      `INSERT INTO pinterest_queue
         (kdp_book_id, pin_type, image_path, title, description, link_url,
          board_id, status, scheduled_for)
       VALUES (NULL, 'cover_hero', ?, 'T', 'D', 'http://x', ?, ?, ?)`,
    )
    .run(
      imgFile,
      boardId,
      status,
      new Date(Date.now() + 60_000).toISOString(),
    );
  return Number(info.lastInsertRowid);
}

// ---------------------------------------------------------------------------
// POST /api/pinterest/boards/sync
// ---------------------------------------------------------------------------

describe('POST /api/pinterest/boards/sync', () => {
  it('returns 503 when apiClient is null', async () => {
    const app = await makeApp();
    const res = await request(app).post('/api/pinterest/boards/sync').send({});
    expect(res.status).toBe(503);
    expect(res.body.error).toBe('api_client_unavailable');
  });

  it('calls ensureBoards and returns {map} with the expected niche key', async () => {
    // Use a temp path so ensureBoards does not write to data/pinterest_boards.json
    const mapFile = path.join(tmpRoot, 'boards_map.json');
    process.env.PINTEREST_BOARDS_MAP_PATH = mapFile;

    const api = {
      listBoards: vi.fn(async () => []),
      createBoard: vi.fn(async (name) => ({ id: `id-${name}`, name })),
      getUserAccount: vi.fn(),
      getTokenStatus: vi.fn(),
      getLiveStatus: vi.fn(),
      createPin: vi.fn(),
      _forceRefresh: vi.fn(),
    };

    const app = await makeAppWithApi(api);
    const res = await request(app).post('/api/pinterest/boards/sync').send({});
    expect(res.status).toBe(200);
    expect(res.body.map).toBeDefined();
    // 'hobbyist-birds' niche should map to the board whose name is 'Birding & Nature'
    expect(res.body.map['hobbyist-birds']).toBe('id-Birding & Nature');
    // The map file should have been written to our temp path
    expect(fs.existsSync(mapFile)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// POST /api/pinterest/post-now?queue_id=N
// ---------------------------------------------------------------------------

describe('POST /api/pinterest/post-now', () => {
  it('returns 503 when apiClient is null', async () => {
    const app = await makeApp();
    const res = await request(app).post('/api/pinterest/post-now?queue_id=1').send({});
    expect(res.status).toBe(503);
    expect(res.body.error).toBe('api_client_unavailable');
  });

  it('returns 400 when queue_id is missing', async () => {
    const api = { createPin: vi.fn() };
    const app = await makeAppWithApi(api);
    const res = await request(app).post('/api/pinterest/post-now').send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });

  it('returns 400 when queue_id is not a positive integer', async () => {
    const api = { createPin: vi.fn() };
    const app = await makeAppWithApi(api);
    const res = await request(app).post('/api/pinterest/post-now?queue_id=abc').send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });

  it('returns 404 when the row does not exist', async () => {
    const api = { createPin: vi.fn() };
    const app = await makeAppWithApi(api);
    const res = await request(app).post('/api/pinterest/post-now?queue_id=9999').send({});
    expect(res.status).toBe(404);
    expect(res.body.error).toBeDefined();
  });

  it('returns 409 when the row status is not pending/paused', async () => {
    const id = seedRow('posted');
    const api = { createPin: vi.fn() };
    const app = await makeAppWithApi(api);
    const res = await request(app).post(`/api/pinterest/post-now?queue_id=${id}`).send({});
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/posted/);
  });

  it('posts a pending row, returns 200 with pinterest_pin_id, and marks it posted', async () => {
    const id = seedRow('pending');
    const api = {
      createPin: vi.fn(async () => ({ id: 'PIN-9' })),
      getUserAccount: vi.fn(),
      getTokenStatus: vi.fn(),
      getLiveStatus: vi.fn(),
      listBoards: vi.fn(),
      _forceRefresh: vi.fn(),
    };

    const app = await makeAppWithApi(api);
    const res = await request(app).post(`/api/pinterest/post-now?queue_id=${id}`).send({});
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.pinterest_pin_id).toBe('PIN-9');

    // Row should now be 'posted' in the DB
    const row = openDb().prepare('SELECT status FROM pinterest_queue WHERE id=?').get(id);
    expect(row.status).toBe('posted');
  });

  it('posts a paused row successfully', async () => {
    const id = seedRow('paused');
    const api = {
      createPin: vi.fn(async () => ({ id: 'PIN-7' })),
    };
    const app = await makeAppWithApi(api);
    const res = await request(app).post(`/api/pinterest/post-now?queue_id=${id}`).send({});
    expect(res.status).toBe(200);
    expect(res.body.pinterest_pin_id).toBe('PIN-7');
  });

  it('returns 502 and marks row failed when apiClient.createPin throws', async () => {
    const id = seedRow('pending');
    const api = {
      createPin: vi.fn(async () => {
        throw new Error('Pinterest API 429 rate-limited');
      }),
    };
    const app = await makeAppWithApi(api);
    const res = await request(app).post(`/api/pinterest/post-now?queue_id=${id}`).send({});
    expect(res.status).toBe(502);
    expect(res.body.error).toMatch(/429 rate-limited/);

    // Row should now be 'failed'
    const row = openDb().prepare('SELECT status FROM pinterest_queue WHERE id=?').get(id);
    expect(row.status).toBe('failed');
  });
});
