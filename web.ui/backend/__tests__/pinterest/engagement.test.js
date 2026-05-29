import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { runOnce, _resetForTests } from '../../pinterest/engagement.js';

function freshDb() {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = OFF');
  db.exec(`
    CREATE TABLE pinterest_queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT, image_path TEXT
    );
    CREATE TABLE pinterest_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      queue_id INTEGER NOT NULL,
      status TEXT NOT NULL, pinterest_pin_id TEXT, pinterest_url TEXT,
      error TEXT, image_path TEXT,
      posted_at TEXT NOT NULL,
      saves INTEGER, clicks INTEGER, impressions INTEGER,
      engagement_fetched_at TEXT, uniqueness_hash TEXT
    );
  `);
  return db;
}

function seedRecentPosted(db, count, { pinIdPrefix = 'pin' } = {}) {
  db.prepare(`INSERT INTO pinterest_queue (title) VALUES ('t')`).run();
  const qid = 1;
  const insert = db.prepare(
    `INSERT INTO pinterest_history
      (queue_id, status, pinterest_pin_id, pinterest_url, posted_at)
     VALUES (?, 'posted', ?, ?, ?)`,
  );
  const now = Date.now();
  for (let i = 0; i < count; i++) {
    insert.run(qid, `${pinIdPrefix}-${i}`, `https://pinterest/pin/${i}`,
      new Date(now - i * 60_000).toISOString());
  }
}

describe('engagement.runOnce', () => {
  /** @type {import('better-sqlite3').Database} */
  let db;
  beforeEach(() => { db = freshDb(); _resetForTests(); });
  afterEach(() => { _resetForTests(); });

  it('populates saves/clicks/impressions on 2xx response', async () => {
    seedRecentPosted(db, 3);
    const apiClient = {
      getPinAnalytics: vi.fn(async (pinId) => ({
        saves: 10, clicks: 2, impressions: 100,
      })),
    };
    const result = await runOnce({ db, apiClient });
    expect(result.updated).toBe(3);
    expect(result.disabled).toBe(false);
    const rows = db.prepare('SELECT * FROM pinterest_history').all();
    for (const r of rows) {
      expect(r.saves).toBe(10);
      expect(r.clicks).toBe(2);
      expect(r.impressions).toBe(100);
      expect(r.engagement_fetched_at).toBeTruthy();
    }
  });

  it('sets disabled on 401, fast-exits, and marks the row engagement_fetched_at', async () => {
    seedRecentPosted(db, 3);
    const err = Object.assign(new Error('401'), { status: 401 });
    const apiClient = {
      getPinAnalytics: vi.fn(async () => { throw err; }),
    };
    const result = await runOnce({ db, apiClient });
    expect(result.disabled).toBe(true);
    expect(result.updated).toBe(0);
    expect(apiClient.getPinAnalytics).toHaveBeenCalledTimes(1);
    const row = db.prepare('SELECT engagement_fetched_at FROM pinterest_history WHERE id=1').get();
    expect(row.engagement_fetched_at).toBeTruthy();
  });

  it('subsequent runOnce after disable short-circuits without API calls', async () => {
    seedRecentPosted(db, 3);
    const err401 = Object.assign(new Error('403'), { status: 403 });
    const failingClient = { getPinAnalytics: vi.fn(async () => { throw err401; }) };
    await runOnce({ db, apiClient: failingClient });
    const replacement = { getPinAnalytics: vi.fn() };
    const result = await runOnce({ db, apiClient: replacement });
    expect(replacement.getPinAnalytics).not.toHaveBeenCalled();
    expect(result.disabled).toBe(true);
  });

  it('one row 500 does not abort the batch', async () => {
    seedRecentPosted(db, 3);
    let calls = 0;
    const apiClient = {
      getPinAnalytics: vi.fn(async () => {
        calls += 1;
        if (calls === 2) throw new Error('500 transient');
        return { saves: 1, clicks: 0, impressions: 5 };
      }),
    };
    const result = await runOnce({ db, apiClient });
    expect(result.updated).toBe(2);
    expect(result.errors.length).toBe(1);
  });

  it('skips rows fetched within the last 12 hours', async () => {
    seedRecentPosted(db, 2);
    db.prepare(
      `UPDATE pinterest_history SET engagement_fetched_at = ? WHERE id=1`,
    ).run(new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString());
    const apiClient = { getPinAnalytics: vi.fn(async () => ({ saves: 1, clicks: 0, impressions: 1 })) };
    await runOnce({ db, apiClient });
    expect(apiClient.getPinAnalytics).toHaveBeenCalledTimes(1);
  });
});
