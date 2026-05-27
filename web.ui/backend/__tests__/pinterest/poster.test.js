/**
 * Tests for pinterest/poster.js — runOnce() with an injected fake driver.
 *
 * No real Playwright runs here; tests pass a `driverFactory` that returns
 * a minimal {isLoggedIn, postPin} object.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { openDb, _resetForTests } from '../../db.js';
import { _resetSubscribersForTests } from '../../events.js';
import { _resetWorkerStatus, getAllStatuses } from '../../workerStatus.js';
import { runOnce, msUntilNextPending } from '../../pinterest/poster.js';

let tmpRoot;

async function fakeImage(file) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  await sharp({
    create: { width: 1000, height: 1500, channels: 3, background: { r: 251, g: 243, b: 226 } },
  })
    .png()
    .toFile(file);
}

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pin-poster-'));
  process.env.ROOSTER_DB_PATH = path.join(tmpRoot, 'dashboard.db');
  _resetForTests();
  _resetSubscribersForTests();
  _resetWorkerStatus();
});

afterEach(() => {
  _resetForTests();
  _resetSubscribersForTests();
  _resetWorkerStatus();
  fs.rmSync(tmpRoot, { recursive: true, force: true });
  delete process.env.ROOSTER_DB_PATH;
});

function makePendingRow(image_path) {
  const db = openDb();
  const past = new Date(Date.now() - 60_000).toISOString();
  const info = db.prepare(`
    INSERT INTO pinterest_queue
      (kdp_book_id, pin_type, image_path, title, description, link_url, status, scheduled_for)
    VALUES (NULL, 'cover_hero', ?, 'T', 'D', 'http://amazon.com/dp/X', 'pending', ?)
  `).run(image_path, past);
  return Number(info.lastInsertRowid);
}

describe('runOnce — happy path', () => {
  it('posts via the fake driver and marks the row posted', async () => {
    const img = path.join(tmpRoot, 'pin.png');
    await fakeImage(img);
    const id = makePendingRow(img);
    const fakeDriver = {
      isLoggedIn: vi.fn(async () => true),
      postPin: vi.fn(async () => ({ pinId: 'pin_abc123' })),
    };
    const result = await runOnce({ driverFactory: () => fakeDriver });
    expect(result.action).toBe('posted');
    expect(result.queueId).toBe(id);
    expect(result.pinId).toBe('pin_abc123');
    const db = openDb();
    const row = db.prepare('SELECT status FROM pinterest_queue WHERE id=?').get(id);
    expect(row.status).toBe('posted');
    const hist = db.prepare('SELECT pinterest_pin_id FROM pinterest_history WHERE queue_id=?').get(id);
    expect(hist.pinterest_pin_id).toBe('pin_abc123');
    // postPin was called with the row's fields.
    expect(fakeDriver.postPin).toHaveBeenCalledWith({
      imagePath: img,
      title: 'T',
      description: 'D',
      link: 'http://amazon.com/dp/X',
    });
    // Worker heartbeat fired.
    const statuses = getAllStatuses();
    expect(statuses.pinterest?.last_success_at).toBeTruthy();
  });
});

describe('runOnce — logged out', () => {
  it('pauses the queue and fires a reminder when isLoggedIn=false', async () => {
    const img = path.join(tmpRoot, 'pin.png');
    await fakeImage(img);
    makePendingRow(img);
    const fakeDriver = {
      isLoggedIn: vi.fn(async () => false),
      postPin: vi.fn(),
    };
    const result = await runOnce({ driverFactory: () => fakeDriver });
    expect(result.action).toBe('paused_login_required');
    const db = openDb();
    const paused = db.prepare("SELECT COUNT(*) AS n FROM pinterest_queue WHERE status='paused'").get().n;
    expect(paused).toBeGreaterThan(0);
    const reminders = db.prepare("SELECT title FROM reminders WHERE source_kind='pinterest.queue'").all();
    expect(reminders.some((r) => /re-?login/i.test(r.title))).toBe(true);
    // postPin must NOT have been called.
    expect(fakeDriver.postPin).not.toHaveBeenCalled();
    // Tray should go red.
    const statuses = getAllStatuses();
    expect(statuses.pinterest?.last_error_message).toMatch(/login/i);
  });
});

describe('runOnce — error path', () => {
  it('records pinterest_history failure and marks queue row failed', async () => {
    const img = path.join(tmpRoot, 'pin.png');
    await fakeImage(img);
    const id = makePendingRow(img);
    const fakeDriver = {
      isLoggedIn: vi.fn(async () => true),
      postPin: vi.fn(async () => { throw new Error('network down'); }),
    };
    const result = await runOnce({ driverFactory: () => fakeDriver });
    expect(result.action).toBe('failed');
    expect(result.error).toMatch(/network down/);
    const db = openDb();
    const row = db.prepare('SELECT status, last_error FROM pinterest_queue WHERE id=?').get(id);
    expect(row.status).toBe('failed');
    expect(row.last_error).toBe('network down');
    const hist = db.prepare('SELECT success, error_message FROM pinterest_history WHERE queue_id=?').get(id);
    expect(hist.success).toBe(0);
    expect(hist.error_message).toBe('network down');
  });

  it('marks the row failed if image_path is missing on disk', async () => {
    const id = makePendingRow(path.join(tmpRoot, 'missing.png'));
    const fakeDriver = {
      isLoggedIn: vi.fn(async () => true),
      postPin: vi.fn(),
    };
    const result = await runOnce({ driverFactory: () => fakeDriver });
    expect(result.action).toBe('failed');
    expect(fakeDriver.postPin).not.toHaveBeenCalled();
    const db = openDb();
    const row = db.prepare('SELECT status, last_error FROM pinterest_queue WHERE id=?').get(id);
    expect(row.status).toBe('failed');
    expect(row.last_error).toMatch(/image_path missing/);
  });

  it('marks the row failed if the driverFactory throws', async () => {
    const img = path.join(tmpRoot, 'pin.png');
    await fakeImage(img);
    const id = makePendingRow(img);
    const result = await runOnce({
      driverFactory: () => { throw new Error('chromium not found'); },
    });
    expect(result.action).toBe('failed');
    const db = openDb();
    const row = db.prepare('SELECT status, last_error FROM pinterest_queue WHERE id=?').get(id);
    expect(row.status).toBe('failed');
    expect(row.last_error).toMatch(/driver failed to start/);
  });
});

describe('runOnce — nothing due', () => {
  it('returns idle when no rows are due', async () => {
    const result = await runOnce({
      driverFactory: () => ({ isLoggedIn: vi.fn(), postPin: vi.fn() }),
    });
    expect(result.action).toBe('idle');
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
    const result = await runOnce({
      driverFactory: () => ({ isLoggedIn: vi.fn(), postPin: vi.fn() }),
    });
    expect(result.action).toBe('idle');
  });
});

describe('runOnce — driver cleanup', () => {
  it('calls driver.close() after a successful post', async () => {
    const img = path.join(tmpRoot, 'pin.png');
    await fakeImage(img);
    makePendingRow(img);
    const closeSpy = vi.fn(async () => {});
    const fakeDriver = {
      isLoggedIn: vi.fn(async () => true),
      postPin: vi.fn(async () => ({ pinId: 'p1' })),
      close: closeSpy,
    };
    await runOnce({ driverFactory: () => fakeDriver });
    expect(closeSpy).toHaveBeenCalled();
  });

  it('still calls driver.close() after a failed post', async () => {
    const img = path.join(tmpRoot, 'pin.png');
    await fakeImage(img);
    makePendingRow(img);
    const closeSpy = vi.fn(async () => {});
    const fakeDriver = {
      isLoggedIn: vi.fn(async () => true),
      postPin: vi.fn(async () => { throw new Error('boom'); }),
      close: closeSpy,
    };
    await runOnce({ driverFactory: () => fakeDriver });
    expect(closeSpy).toHaveBeenCalled();
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
