import { describe, it, expect, beforeEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import { runSyncPass } from '../../etsy/syncer.js';

function freshDb() {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE etsy_listings (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      etsy_listing_id INTEGER NOT NULL UNIQUE,
      sku_id          TEXT, title TEXT NOT NULL, status TEXT NOT NULL,
      section TEXT, niche TEXT, price_usd REAL,
      favorites INTEGER DEFAULT 0, views INTEGER DEFAULT 0,
      listed_at TEXT, last_synced_at TEXT NOT NULL DEFAULT (datetime('now')),
      listing_url TEXT
    );
    CREATE TABLE reminders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL, body TEXT, due_at TEXT NOT NULL,
      channel TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('pending','fired','dismissed','failed')),
      source_kind TEXT, source_id INTEGER, payload_json TEXT,
      fired_at TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      kind TEXT NOT NULL, payload_json TEXT NOT NULL,
      occurred_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
  return db;
}

function rowFromEtsy(overrides = {}) {
  return {
    listing_id: 1001,
    title: 'Mandala A',
    state: 'active',
    price: { amount: 499, divisor: 100, currency_code: 'USD' },
    url: 'https://etsy.com/listing/1001',
    num_favorers: 0,
    views: 0,
    original_creation_timestamp: 1716163200, // 2024-05-20T00:00:00Z
    shop_section_id: 'Coloring',
    ...overrides,
  };
}

describe('runSyncPass', () => {
  /** @type {import('better-sqlite3').Database} */
  let db;
  /** @type {ReturnType<typeof vi.fn>} */
  let emit;

  beforeEach(() => {
    db = freshDb();
    emit = vi.fn();
  });

  it('inserts new listings and emits etsy:new-listing', async () => {
    const client = {
      listAllListings: vi.fn().mockResolvedValue([rowFromEtsy()]),
    };
    const result = await runSyncPass({
      db,
      client,
      emit,
      now: () => new Date('2026-05-26T12:00:00Z'),
    });
    expect(result.inserted).toBe(1);
    expect(result.updated).toBe(0);
    expect(emit).toHaveBeenCalledWith(
      'etsy:new-listing',
      expect.objectContaining({ etsy_listing_id: 1001 }),
    );
  });

  it('inserts Day-30/60/90 reminders on newly-active listing', async () => {
    const client = {
      listAllListings: vi
        .fn()
        .mockResolvedValue([rowFromEtsy({ original_creation_timestamp: 1748736000 })]),
    }; // 2025-06-01
    await runSyncPass({
      db,
      client,
      emit,
      now: () => new Date('2026-05-26T12:00:00Z'),
    });
    const reminders = db
      .prepare('SELECT due_at, title FROM reminders ORDER BY due_at')
      .all();
    expect(reminders).toHaveLength(3);
    expect(reminders[0].due_at).toBe('2025-07-01T00:00:00.000Z');
    expect(reminders[1].due_at).toBe('2025-07-31T00:00:00.000Z');
    expect(reminders[2].due_at).toBe('2025-08-30T00:00:00.000Z');
    expect(reminders[0].title).toMatch(/Day-30/);
    expect(reminders[2].title).toMatch(/Day-90/);
  });

  it('emits etsy:status-changed on transition active→inactive', async () => {
    // seed an existing active row
    const client1 = {
      listAllListings: vi.fn().mockResolvedValue([rowFromEtsy()]),
    };
    await runSyncPass({
      db,
      client: client1,
      emit,
      now: () => new Date('2026-05-26T12:00:00Z'),
    });
    emit.mockClear();

    const client2 = {
      listAllListings: vi
        .fn()
        .mockResolvedValue([rowFromEtsy({ state: 'inactive' })]),
    };
    const result = await runSyncPass({
      db,
      client: client2,
      emit,
      now: () => new Date('2026-05-26T12:30:00Z'),
    });

    expect(result.statusChanged).toBe(1);
    expect(emit).toHaveBeenCalledWith(
      'etsy:status-changed',
      expect.objectContaining({
        etsy_listing_id: 1001,
        from: 'active',
        to: 'inactive',
      }),
    );
  });

  it('does NOT re-insert reminders for an already-known active listing', async () => {
    const client = {
      listAllListings: vi.fn().mockResolvedValue([rowFromEtsy()]),
    };
    await runSyncPass({
      db,
      client,
      emit,
      now: () => new Date('2026-05-26T12:00:00Z'),
    });
    await runSyncPass({
      db,
      client,
      emit,
      now: () => new Date('2026-05-26T12:30:00Z'),
    });
    const count = db.prepare('SELECT COUNT(*) AS c FROM reminders').get().c;
    expect(count).toBe(3);
  });

  it('emits etsy:synced with totals on every pass', async () => {
    const client = {
      listAllListings: vi.fn().mockResolvedValue([rowFromEtsy()]),
    };
    await runSyncPass({
      db,
      client,
      emit,
      now: () => new Date('2026-05-26T12:00:00Z'),
    });
    expect(emit).toHaveBeenCalledWith(
      'etsy:synced',
      expect.objectContaining({ inserted: 1, updated: 0, statusChanged: 0 }),
    );
  });

  it('returns zeros for an empty shop', async () => {
    const client = { listAllListings: vi.fn().mockResolvedValue([]) };
    const result = await runSyncPass({
      db,
      client,
      emit,
      now: () => new Date('2026-05-26T12:00:00Z'),
    });
    expect(result).toEqual({ inserted: 0, updated: 0, statusChanged: 0 });
  });

  it('runSyncPass advances roadmap row to published when listing first goes active', async () => {
    // Ensure publishing_roadmap exists.
    db.exec(`
      CREATE TABLE IF NOT EXISTS publishing_roadmap (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        kind TEXT NOT NULL, slug TEXT NOT NULL, title TEXT NOT NULL,
        target_release_date TEXT NOT NULL, status TEXT NOT NULL, source TEXT NOT NULL,
        niche TEXT, rationale TEXT, file_lock_date TEXT,
        kdp_book_id INTEGER, etsy_listing_id INTEGER, notes TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        UNIQUE(kind, slug, target_release_date)
      );
    `);
    db.prepare(
      `INSERT INTO publishing_roadmap
         (kind, slug, title, target_release_date, status, source, file_lock_date)
       VALUES ('etsy', 'cottagecore-halloween-pack', 'Halloween Pack', '2026-09-15', 'scheduled', 'build', '2026-08-31')`,
    ).run();

    const client = {
      listAllListings: async () => [{
        listing_id: 99001,
        title: 'Halloween Pack',
        state: 'active',
        sku_id: 'cottagecore-halloween-pack',
        original_creation_timestamp: 1758937600,
      }],
    };
    await runSyncPass({ db, client, emit: () => {} });

    const row = db.prepare(
      `SELECT status, etsy_listing_id FROM publishing_roadmap WHERE slug='cottagecore-halloween-pack'`,
    ).get();
    expect(row.status).toBe('published');
    expect(row.etsy_listing_id).toBe(99001);
  });
});
