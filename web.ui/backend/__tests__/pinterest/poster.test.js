/**
 * Tests for pinterest/poster.js — runOnce() with an injected fake apiClient.
 *
 * No real Pinterest API calls fire; tests pass an `apiClient` stub that
 * resolves/rejects createPin() synchronously.
 *
 * Board-id source is `PINTEREST_DEFAULT_BOARD_ID` (env var). When the env
 * var is missing AND no row's board_id is persisted, runOnce returns
 * `no_default_board` WITHOUT dequeuing — safer than guessing.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { openDb, _resetForTests } from '../../db.js';
import { subscribe, _resetSubscribersForTests } from '../../events.js';
import {
  _resetWorkerStatus,
  getAllStatuses,
} from '../../workerStatus.js';
import {
  runOnce,
  msUntilNextPending,
  startPosterWorker,
  stopPosterWorker,
  _resetPosterStateForTests,
} from '../../pinterest/poster.js';

const TEST_BOARD = 'BOARD_DEFAULT';

let tmpRoot;

async function fakeImage(file) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  await sharp({
    create: {
      width: 1000,
      height: 1500,
      channels: 3,
      background: { r: 251, g: 243, b: 226 },
    },
  })
    .png()
    .toFile(file);
}

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pin-poster-'));
  process.env.ROOSTER_DB_PATH = path.join(tmpRoot, 'dashboard.db');
  process.env.PINTEREST_DEFAULT_BOARD_ID = TEST_BOARD;
  _resetForTests();
  _resetSubscribersForTests();
  _resetWorkerStatus();
  _resetPosterStateForTests();
});

afterEach(() => {
  _resetPosterStateForTests();
  _resetForTests();
  _resetSubscribersForTests();
  _resetWorkerStatus();
  try {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  } catch {
    // Windows may briefly hold the DB file open after close.
  }
  delete process.env.ROOSTER_DB_PATH;
  delete process.env.PINTEREST_DEFAULT_BOARD_ID;
});

function makePendingRow(image_path) {
  const db = openDb();
  const past = new Date(Date.now() - 60_000).toISOString();
  const info = db
    .prepare(
      `INSERT INTO pinterest_queue
        (kdp_book_id, pin_type, image_path, title, description, link_url, status, scheduled_for)
       VALUES (NULL, 'cover_hero', ?, 'T', 'D', 'http://amazon.com/dp/X', 'pending', ?)`,
    )
    .run(image_path, past);
  return Number(info.lastInsertRowid);
}

function fakeApiClient(overrides = {}) {
  return {
    createPin: vi.fn(async () => ({ id: 'PIN_abc' })),
    listBoards: vi.fn(async () => [{ id: TEST_BOARD, name: 'default' }]),
    getUserAccount: vi.fn(async () => ({ username: 'u' })),
    getTokenStatus: vi.fn(async () => ({ connected: true, expires_at: 'x' })),
    ...overrides,
  };
}

describe('runOnce — happy path', () => {
  it('calls apiClient.createPin with the row payload, marks posted, and emits SSE pinterest:pin-posted', async () => {
    const img = path.join(tmpRoot, 'pin.png');
    await fakeImage(img);
    const id = makePendingRow(img);
    const api = fakeApiClient({
      createPin: vi.fn(async () => ({ id: 'PIN_OK' })),
    });
    const seen = [];
    const off = subscribe((evt) => seen.push(evt));

    const result = await runOnce({ apiClient: api });

    expect(result.action).toBe('posted');
    expect(result.posted).toBe(true);
    expect(result.queueId).toBe(id);
    expect(result.pinId).toBe('PIN_OK');
    expect(api.createPin).toHaveBeenCalledWith({
      board_id: TEST_BOARD,
      title: 'T',
      description: 'D',
      link: 'http://amazon.com/dp/X',
      imagePath: img,
    });
    const db = openDb();
    const row = db
      .prepare('SELECT status FROM pinterest_queue WHERE id=?')
      .get(id);
    expect(row.status).toBe('posted');
    const hist = db
      .prepare('SELECT pinterest_pin_id FROM pinterest_history WHERE queue_id=?')
      .get(id);
    expect(hist.pinterest_pin_id).toBe('PIN_OK');
    const statuses = getAllStatuses();
    expect(statuses.pinterest?.last_success_at).toBeTruthy();

    off();
    const postedEvents = seen.filter((e) => e.kind === 'pinterest:pin-posted');
    expect(postedEvents).toHaveLength(1);
    expect(postedEvents[0].payload.queue_id).toBe(id);
    expect(postedEvents[0].payload.pinterest_pin_id).toBe('PIN_OK');
  });
});

describe('runOnce — error paths', () => {
  it('marks the row failed when image_path is missing', async () => {
    const id = makePendingRow(path.join(tmpRoot, 'missing.png'));
    const api = fakeApiClient();
    const result = await runOnce({ apiClient: api });
    expect(result.action).toBe('failed');
    expect(result.posted).toBe(false);
    expect(api.createPin).not.toHaveBeenCalled();
    const db = openDb();
    const row = db
      .prepare('SELECT status, last_error FROM pinterest_queue WHERE id=?')
      .get(id);
    expect(row.status).toBe('failed');
    expect(row.last_error).toMatch(/image_path missing/);
  });

  it('marks the row failed and emits pinterest:pin-failed when createPin throws a network error', async () => {
    const img = path.join(tmpRoot, 'pin.png');
    await fakeImage(img);
    const id = makePendingRow(img);
    const api = fakeApiClient({
      createPin: vi.fn(async () => {
        throw new Error('ECONNRESET');
      }),
    });
    const seen = [];
    const off = subscribe((evt) => seen.push(evt));
    const result = await runOnce({ apiClient: api });
    off();
    expect(result.action).toBe('failed');
    const db = openDb();
    const row = db
      .prepare('SELECT status, last_error FROM pinterest_queue WHERE id=?')
      .get(id);
    expect(row.status).toBe('failed');
    expect(row.last_error).toMatch(/ECONNRESET/);
    const hist = db
      .prepare('SELECT success, error_message FROM pinterest_history WHERE queue_id=?')
      .get(id);
    expect(hist.success).toBe(0);
    const failedEvents = seen.filter((e) => e.kind === 'pinterest:pin-failed');
    expect(failedEvents).toHaveLength(1);
  });

  it('on auth-failure-after-refresh (status=401): markFailed with "auth failed after refresh"', async () => {
    const img = path.join(tmpRoot, 'pin.png');
    await fakeImage(img);
    const id = makePendingRow(img);
    const api = fakeApiClient({
      createPin: vi.fn(async () => {
        const err = new Error('Pinterest POST /v5/pins 401: unauth');
        err.status = 401;
        throw err;
      }),
    });
    const result = await runOnce({ apiClient: api });
    expect(result.action).toBe('failed');
    const db = openDb();
    const row = db
      .prepare('SELECT last_error FROM pinterest_queue WHERE id=?')
      .get(id);
    expect(row.last_error).toBe('auth failed after refresh');
  });
});

describe('runOnce — nothing due', () => {
  it('returns idle with no api calls when no rows are due', async () => {
    const api = fakeApiClient();
    const result = await runOnce({ apiClient: api });
    expect(result.action).toBe('idle');
    expect(api.createPin).not.toHaveBeenCalled();
  });

  it('does not pick a row whose scheduled_for is in the future', async () => {
    const img = path.join(tmpRoot, 'pin.png');
    await fakeImage(img);
    const db = openDb();
    const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    db.prepare(`
      INSERT INTO pinterest_queue
        (kdp_book_id, pin_type, image_path, title, description, link_url, status, scheduled_for)
      VALUES (NULL, 'cover_hero', ?, 'T', 'D', 'http://x', 'pending', ?)
    `).run(img, future);
    const api = fakeApiClient();
    const result = await runOnce({ apiClient: api });
    expect(result.action).toBe('idle');
    expect(api.createPin).not.toHaveBeenCalled();
  });
});

describe('runOnce — no_default_board', () => {
  it('returns {posted: false, reason: "no_default_board"} when PINTEREST_DEFAULT_BOARD_ID is missing — does NOT dequeue or fail the row', async () => {
    delete process.env.PINTEREST_DEFAULT_BOARD_ID;
    const img = path.join(tmpRoot, 'pin.png');
    await fakeImage(img);
    const id = makePendingRow(img);
    const api = fakeApiClient();
    const result = await runOnce({ apiClient: api });
    expect(result.action).toBe('no_default_board');
    expect(result.posted).toBe(false);
    expect(result.reason).toBe('no_default_board');
    expect(api.createPin).not.toHaveBeenCalled();
    const db = openDb();
    const row = db
      .prepare('SELECT status FROM pinterest_queue WHERE id=?')
      .get(id);
    expect(row.status).toBe('pending'); // unchanged
    const statuses = getAllStatuses();
    expect(statuses.pinterest?.last_error_message).toMatch(/no_default_board/);
  });

  it('also short-circuits when env var is empty string', async () => {
    process.env.PINTEREST_DEFAULT_BOARD_ID = '';
    const img = path.join(tmpRoot, 'pin.png');
    await fakeImage(img);
    makePendingRow(img);
    const api = fakeApiClient();
    const result = await runOnce({ apiClient: api });
    expect(result.action).toBe('no_default_board');
    expect(api.createPin).not.toHaveBeenCalled();
  });
});

describe('msUntilNextPending', () => {
  it('returns null when no pending rows exist', () => {
    expect(msUntilNextPending()).toBeNull();
  });

  it('returns ms-until-scheduled for the soonest pending row', async () => {
    const img = path.join(tmpRoot, 'pin.png');
    await fakeImage(img);
    const db = openDb();
    const t = new Date(Date.now() + 90_000).toISOString();
    db.prepare(`
      INSERT INTO pinterest_queue
        (kdp_book_id, pin_type, image_path, title, description, link_url, status, scheduled_for)
      VALUES (NULL, 'cover_hero', ?, 'T', 'D', 'http://x', 'pending', ?)
    `).run(img, t);
    const ms = msUntilNextPending();
    expect(ms).toBeGreaterThan(0);
    expect(ms).toBeLessThanOrEqual(90_000);
  });
});

describe('startPosterWorker', () => {
  it('does NOT start the interval when PINTEREST_DEFAULT_BOARD_ID is missing (sets worker error instead)', async () => {
    delete process.env.PINTEREST_DEFAULT_BOARD_ID;
    const apiFactory = vi.fn(() => fakeApiClient());
    const stop = startPosterWorker({ apiClientFactory: apiFactory, intervalMs: 100 });
    // Give the (non-)interval a moment in case it accidentally fired.
    await new Promise((r) => setTimeout(r, 50));
    expect(apiFactory).not.toHaveBeenCalled();
    const statuses = getAllStatuses();
    expect(statuses.pinterest?.last_error_message).toMatch(/no_default_board/);
    stop();
  });

  it('is idempotent — calling twice does not start two intervals', async () => {
    const apiFactory = vi.fn(() => fakeApiClient());
    const stop1 = startPosterWorker({ apiClientFactory: apiFactory, intervalMs: 60_000 });
    const stop2 = startPosterWorker({ apiClientFactory: apiFactory, intervalMs: 60_000 });
    expect(stop1).toBe(stop2);
    stopPosterWorker();
  });
});
