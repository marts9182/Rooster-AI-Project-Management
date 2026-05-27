/**
 * End-to-end smoke for the Pinterest pipeline — API edition.
 *
 * Seeds a kdp_books row with on-disk cover + 5 interior PNGs, enqueues the
 * full 6-pin bundle via enqueuePinsForBook, then drives runOnce() six times
 * with a stubbed apiClient. Verifies:
 *
 *   - Rows transition pending -> posting -> posted (one per runOnce call).
 *   - pinterest_history rows are inserted on success.
 *   - SSE-style events (pinterest:pin-scheduled, pinterest:pin-posted) fire.
 *   - No real Pinterest API call is made (the fake apiClient's mocks are
 *     the only thing invoked).
 *   - apiClient.createPin received the right args for every call.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { openDb, _resetForTests } from '../../db.js';
import { subscribe, _resetSubscribersForTests } from '../../events.js';
import { _resetWorkerStatus } from '../../workerStatus.js';
import { enqueuePinsForBook } from '../../pinterest/queue.js';
import {
  runOnce,
  _resetPosterStateForTests,
} from '../../pinterest/poster.js';

let tmpRoot;

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pin-e2e-'));
  process.env.ROOSTER_DB_PATH = path.join(tmpRoot, 'dashboard.db');
  process.env.PINTEREST_OUTPUT_ROOT = path.join(tmpRoot, 'output', 'pinterest');
  process.env.PINTEREST_DEFAULT_BOARD_ID = 'BOARD_E2E';
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
    // best-effort — Windows may briefly hold the DB file open.
  }
  delete process.env.ROOSTER_DB_PATH;
  delete process.env.PINTEREST_OUTPUT_ROOT;
  delete process.env.PINTEREST_DEFAULT_BOARD_ID;
});

async function seedBookWithArt() {
  const slug = 'e2e-book';
  const outDir = path.join(tmpRoot, 'kdp-ready', slug);
  fs.mkdirSync(outDir, { recursive: true });
  const png = async (file, w, h) =>
    sharp({
      create: {
        width: w,
        height: h,
        channels: 3,
        background: { r: 220, g: 220, b: 220 },
      },
    })
      .png()
      .toFile(file);
  await png(path.join(outDir, 'cover_preview.png'), 800, 1200);
  for (let i = 1; i <= 5; i++) {
    await png(path.join(outDir, `interior_${i}.png`), 600, 800);
  }
  const db = openDb();
  const info = db
    .prepare(
      `
      INSERT INTO kdp_books (slug, title, status, output_dir, cover_path, asin, blurb)
      VALUES (?, 'E2E Book', 'published', ?, ?, 'B0E2E00000', 'Test blurb.')
    `,
    )
    .run(slug, outDir, path.join(outDir, 'cover_preview.png'));
  return Number(info.lastInsertRowid);
}

describe('end-to-end with fake apiClient', () => {
  it('enqueues 6 pins, posts them one by one via apiClient.createPin, ends with empty pending queue', async () => {
    // Capture every event fired during the run so we can assert on
    // pinterest:pin-scheduled / pinterest:pin-posted transitions.
    const events = [];
    const unsubscribe = subscribe((evt) => events.push(evt));

    try {
      const bookId = await seedBookWithArt();
      const inserted = await enqueuePinsForBook(bookId);
      expect(inserted).toHaveLength(6);

      // After enqueue, exactly 6 pinterest:pin-scheduled events should have fired.
      const scheduledEvents = events.filter(
        (e) => e.kind === 'pinterest:pin-scheduled',
      );
      expect(scheduledEvents).toHaveLength(6);

      // Backdate every pending row so dequeueNext picks each up.
      const db = openDb();
      db.prepare(
        `UPDATE pinterest_queue SET scheduled_for = ? WHERE status='pending'`,
      ).run(new Date(Date.now() - 60_000).toISOString());

      let pinCounter = 0;
      const fakeApi = {
        createPin: vi.fn(async () => ({ id: `pin_${++pinCounter}` })),
        listBoards: vi.fn(async () => [{ id: 'BOARD_E2E', name: 'e2e' }]),
        getUserAccount: vi.fn(async () => ({ username: 'u' })),
        getTokenStatus: vi.fn(async () => ({
          connected: true,
          expires_at: 'x',
        })),
        _forceRefresh: vi.fn(async () => {}),
      };

      for (let i = 0; i < 6; i++) {
        const result = await runOnce({ apiClient: fakeApi });
        expect(result.action).toBe('posted');
      }

      // Verify exactly 6 createPin calls — no real API.
      expect(fakeApi.createPin).toHaveBeenCalledTimes(6);
      // listBoards is short-circuited by PINTEREST_DEFAULT_BOARD_ID env, so
      // it should not be called.
      expect(fakeApi.listBoards).not.toHaveBeenCalled();

      const finalPending = db
        .prepare(
          `SELECT COUNT(*) AS n FROM pinterest_queue WHERE status='pending'`,
        )
        .get().n;
      expect(finalPending).toBe(0);
      const posted = db
        .prepare(
          `SELECT COUNT(*) AS n FROM pinterest_queue WHERE status='posted'`,
        )
        .get().n;
      expect(posted).toBe(6);
      const history = db
        .prepare(
          `SELECT COUNT(*) AS n FROM pinterest_history WHERE success = 1`,
        )
        .get().n;
      expect(history).toBe(6);

      // 6 pinterest:pin-posted events fired during the run loop.
      const postedEvents = events.filter(
        (e) => e.kind === 'pinterest:pin-posted',
      );
      expect(postedEvents).toHaveLength(6);
      for (const evt of postedEvents) {
        expect(evt.payload.queue_id).toEqual(expect.any(Number));
        expect(evt.payload.pinterest_pin_id).toMatch(/^pin_\d+$/);
      }

      // Every createPin call carried the right board_id, the row's title,
      // description, link, and an imagePath that exists on disk.
      for (const call of fakeApi.createPin.mock.calls) {
        const args = call[0];
        expect(args.board_id).toBe('BOARD_E2E');
        expect(args.title).toEqual(expect.any(String));
        expect(args.description).toEqual(expect.any(String));
        expect(args.link).toEqual(expect.stringContaining('amazon.com/dp/'));
        expect(fs.existsSync(args.imagePath)).toBe(true);
      }
    } finally {
      unsubscribe();
    }
  }, 60_000);
});
