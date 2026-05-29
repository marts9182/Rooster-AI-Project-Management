# Pinterest Autonomous Feature Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the dashboard's Pinterest feature autonomously keep ~30 days of pending pins queued per published book, show the upcoming schedule as a calendar grid, and surface cadence + engagement analytics on the History view.

**Architecture:** Two new background workers (`topup.js` + `engagement.js`) using the same `runOnce + supervisor` pattern as the existing poster. One migration adds engagement columns + a uniqueness-hash column on both queue and history. Two new HTTP endpoints (`/cadence` + `/engagement`) feed three new React components (calendar grid + cadence chart + engagement table). The existing Queue and History sections gain a view-mode toggle and a tab strip respectively; both fall back to the existing table views.

**Tech Stack:** Express + better-sqlite3 + vitest + supertest (backend); React 19 + Vite + TypeScript + vitest + React Testing Library (frontend); inline SVG for the cadence chart (no chart library).

**Spec:** [`docs/superpowers/specs/2026-05-29-pinterest-autonomous-feature-design.md`](../specs/2026-05-29-pinterest-autonomous-feature-design.md)

---

## File Structure

**Created (backend):**
- `web.ui/backend/migrations/0005_pinterest_engagement_uniqueness.sql` — schema extension.
- `web.ui/backend/pinterest/topup.js` — `runOnce()` + `startTopupWorkerDefault()`.
- `web.ui/backend/pinterest/engagement.js` — `runOnce()` + `startEngagementWorkerDefault()`.
- `web.ui/backend/pinterest/analytics.js` — pure functions: `cadenceBuckets(rows, days, target)` + `engagementRows(db, limit)`.
- `web.ui/backend/__tests__/pinterest/topup.test.js`
- `web.ui/backend/__tests__/pinterest/engagement.test.js`
- `web.ui/backend/__tests__/pinterest/analytics.test.js`

**Modified (backend):**
- `web.ui/backend/pinterest/routes.js` — two new endpoints.
- `web.ui/backend/pinterest/api_client.js` — add `getPinAnalytics(pin_id)` method.
- `web.ui/backend/__tests__/pinterest/routes.test.js` — endpoint tests.
- `web.ui/backend/server.js` — boot the two new workers.

**Created (frontend):**
- `web.ui/frontend-react/src/lib/bookColor.ts` — pure helper, hash → HSL.
- `web.ui/frontend-react/src/components/PinterestCalendar.tsx`
- `web.ui/frontend-react/src/components/PinterestCalendarChip.tsx`
- `web.ui/frontend-react/src/components/PinterestViewToggle.tsx`
- `web.ui/frontend-react/src/components/PinterestCadenceChart.tsx`
- `web.ui/frontend-react/src/components/PinterestEngagementTable.tsx`
- `web.ui/frontend-react/src/components/PinterestHistoryTabs.tsx`
- Test files for each above under `__tests__/`.

**Modified (frontend):**
- `web.ui/frontend-react/src/api/pinterest.ts` — `getCadence()`, `getEngagement()`, types.
- `web.ui/frontend-react/src/pages/Pinterest.tsx` — mount toggle + tab strip; conditionally render calendar instead of table.
- `web.ui/frontend-react/src/styles/shell.css` — calendar grid + chip rules.

---

## Task 1: Migration 0005 — engagement + uniqueness_hash columns

**Files:**
- Create: `web.ui/backend/migrations/0005_pinterest_engagement_uniqueness.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Migration 0005 — engagement metrics + variant-uniqueness hash for Pinterest pins.
-- Spec: docs/superpowers/specs/2026-05-29-pinterest-autonomous-feature-design.md §§1, 3

ALTER TABLE pinterest_history ADD COLUMN saves INTEGER;
ALTER TABLE pinterest_history ADD COLUMN clicks INTEGER;
ALTER TABLE pinterest_history ADD COLUMN impressions INTEGER;
ALTER TABLE pinterest_history ADD COLUMN engagement_fetched_at TEXT;

ALTER TABLE pinterest_queue   ADD COLUMN uniqueness_hash TEXT;
ALTER TABLE pinterest_history ADD COLUMN uniqueness_hash TEXT;
CREATE INDEX IF NOT EXISTS idx_pinterest_queue_uniqueness   ON pinterest_queue(uniqueness_hash);
CREATE INDEX IF NOT EXISTS idx_pinterest_history_uniqueness ON pinterest_history(uniqueness_hash);
```

- [ ] **Step 2: Verify the migration applies cleanly**

Run: `cd web.ui/backend && npm test`
Expected: all existing tests still pass; `openDb()` applies the new migration on first call in each test.

- [ ] **Step 3: Commit**

```bash
git add web.ui/backend/migrations/0005_pinterest_engagement_uniqueness.sql
git commit -m "feat(pinterest): migration 0005 — engagement + uniqueness columns"
```

---

## Task 2: `topup.js` module — `runOnce` algorithm + tests

**Files:**
- Create: `web.ui/backend/pinterest/topup.js`
- Test: `web.ui/backend/__tests__/pinterest/topup.test.js`

`runOnce({db, emit, generatorFn?, schedulerFn?, now?})` walks published books, computes their queued-but-not-posted count, and generates enough new specs to refill each up to the runway target. Variants are remixed across `(palette_seed, tagline_idx, variant)` with a uniqueness hash check against the last 60 days. Pure-ish (DB + injected generator); no HTTP.

The existing `mark-published` route at `web.ui/backend/kdp/routes.js` defines the per-book pin specs as one `cover_hero` (index 0) + five `interior_preview` (indices 1–5). The topup uses the same shape — the variation is over `(palette_seed, tagline_idx, variant)`, not new pin types.

- [ ] **Step 1: Write the failing test**

Create `web.ui/backend/__tests__/pinterest/topup.test.js`:

```js
import { describe, it, expect, beforeEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import { runOnce, _uniquenessHash } from '../../pinterest/topup.js';

function freshDb() {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE kdp_books (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT NOT NULL UNIQUE, title TEXT NOT NULL,
      asin TEXT, status TEXT NOT NULL, output_dir TEXT NOT NULL DEFAULT '',
      release_date TEXT, listing_url TEXT, notes TEXT,
      page_count INTEGER, trim_size TEXT, price_usd REAL, blurb TEXT,
      cover_path TEXT, kdp_status_raw TEXT, last_scraped_at TEXT,
      subtitle TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE pinterest_queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      kdp_book_id INTEGER REFERENCES kdp_books(id),
      pin_type TEXT NOT NULL,
      image_path TEXT NOT NULL,
      title TEXT NOT NULL, description TEXT NOT NULL, link_url TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      scheduled_for TEXT, uniqueness_hash TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE pinterest_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      queue_id INTEGER NOT NULL REFERENCES pinterest_queue(id),
      posted_at TEXT NOT NULL DEFAULT (datetime('now')),
      status TEXT NOT NULL, pinterest_pin_id TEXT, pinterest_url TEXT,
      error TEXT, image_path TEXT,
      saves INTEGER, clicks INTEGER, impressions INTEGER,
      engagement_fetched_at TEXT, uniqueness_hash TEXT
    );
  `);
  return db;
}

function seedBook(db, { slug, status = 'published', asin = 'B0CFAKE0000' }) {
  return db.prepare(
    `INSERT INTO kdp_books (slug, title, asin, status, output_dir)
     VALUES (?, ?, ?, ?, 'x')`,
  ).run(slug, `Title ${slug}`, asin, status).lastInsertRowid;
}

function fakeGenerator() {
  let i = 0;
  return vi.fn(async ({ slug, pin_type, variant, palette_seed, tagline_idx }) => ({
    imagePath: `/fake/${slug}/${pin_type}-${i++}.png`,
    title: `T:${slug}`,
    description: `D:${slug}:${variant}:${palette_seed}:${tagline_idx}`,
    linkUrl: `https://amazon.com/dp/B0CFAKE`,
  }));
}

function fakeScheduler(count) {
  // Returns `count` ISO timestamps spaced 1h apart starting tomorrow at 09:00Z.
  const out = [];
  const base = new Date('2026-06-01T09:00:00Z').getTime();
  for (let i = 0; i < count; i++) out.push(new Date(base + i * 3600_000).toISOString());
  return vi.fn(() => out);
}

describe('topup.runOnce', () => {
  /** @type {import('better-sqlite3').Database} */
  let db;
  beforeEach(() => { db = freshDb(); });

  it('skips books that are not published', async () => {
    seedBook(db, { slug: 'a', status: 'built' });
    const result = await runOnce({
      db, emit: vi.fn(),
      generatorFn: fakeGenerator(),
      schedulerFn: fakeScheduler(15),
      target: 15,
    });
    expect(result.books_topped_up).toBe(0);
    expect(result.pins_generated).toBe(0);
  });

  it('skips published books already at target', async () => {
    const id = seedBook(db, { slug: 'a' });
    const insert = db.prepare(
      `INSERT INTO pinterest_queue
        (kdp_book_id, pin_type, image_path, title, description, link_url, status, uniqueness_hash)
       VALUES (?, 'cover_hero', '/x.png', 't', 'd', 'http://x', 'pending', ?)`,
    );
    for (let i = 0; i < 15; i++) insert.run(id, `seed-${i}`);
    const result = await runOnce({
      db, emit: vi.fn(),
      generatorFn: fakeGenerator(),
      schedulerFn: fakeScheduler(0),
      target: 15,
    });
    expect(result.books_topped_up).toBe(0);
    expect(result.pins_generated).toBe(0);
  });

  it('generates exactly (target - existing) rows for under-target books', async () => {
    const id = seedBook(db, { slug: 'a' });
    // Seed 5 existing pending; need 10 more.
    const insert = db.prepare(
      `INSERT INTO pinterest_queue
        (kdp_book_id, pin_type, image_path, title, description, link_url, status, uniqueness_hash)
       VALUES (?, 'cover_hero', '/x.png', 't', 'd', 'http://x', 'pending', ?)`,
    );
    for (let i = 0; i < 5; i++) insert.run(id, `seed-${i}`);
    const result = await runOnce({
      db, emit: vi.fn(),
      generatorFn: fakeGenerator(),
      schedulerFn: fakeScheduler(10),
      target: 15,
    });
    expect(result.books_topped_up).toBe(1);
    expect(result.pins_generated).toBe(10);
    const rows = db.prepare('SELECT * FROM pinterest_queue WHERE kdp_book_id=? AND title LIKE ?').all(id, 'T:a');
    expect(rows.length).toBe(10);
    for (const r of rows) {
      expect(r.status).toBe('pending');
      expect(r.uniqueness_hash).toBeTruthy();
      expect(r.scheduled_for).toBeTruthy();
      expect(r.image_path).toMatch(/^\/fake\/a\//);
    }
  });

  it('counts paused and posting as non-empty toward the pending count', async () => {
    const id = seedBook(db, { slug: 'a' });
    const insert = db.prepare(
      `INSERT INTO pinterest_queue
        (kdp_book_id, pin_type, image_path, title, description, link_url, status, uniqueness_hash)
       VALUES (?, 'cover_hero', '/x.png', 't', 'd', 'http://x', ?, ?)`,
    );
    for (let i = 0; i < 8; i++) insert.run(id, 'pending', `p-${i}`);
    for (let i = 0; i < 7; i++) insert.run(id, 'paused', `pa-${i}`);
    // 8 pending + 7 paused = 15 = target → no top-up.
    const result = await runOnce({
      db, emit: vi.fn(),
      generatorFn: fakeGenerator(),
      schedulerFn: fakeScheduler(0),
      target: 15,
    });
    expect(result.pins_generated).toBe(0);
  });

  it('uniqueness hash check skips colliding remixes', async () => {
    const id = seedBook(db, { slug: 'a' });
    // Seed history with a hash that the next generation would otherwise produce.
    const collidingHash = _uniquenessHash(id, 'cover_hero', 0, 0, 0);
    db.prepare(
      `INSERT INTO pinterest_history (queue_id, status, uniqueness_hash, image_path, posted_at)
       VALUES (1, 'posted', ?, '/x.png', datetime('now'))`,
    ).run(collidingHash);
    // Inject a generator that records the parameters it was called with.
    const seen = [];
    const generatorFn = vi.fn(async (spec) => {
      seen.push(`${spec.pin_type}|${spec.variant}|${spec.palette_seed}|${spec.tagline_idx}`);
      return { imagePath: '/g/x.png', title: 't', description: 'd', linkUrl: 'http://x' };
    });
    await runOnce({
      db, emit: vi.fn(),
      generatorFn,
      schedulerFn: fakeScheduler(15),
      target: 1,
    });
    // The first call should NOT have been (cover_hero, 0, 0, 0) since that collides.
    expect(seen[0]).not.toBe('cover_hero|0|0|0');
  });

  it('emits pinterest:topup-tick with counts', async () => {
    seedBook(db, { slug: 'a' });
    const emit = vi.fn();
    await runOnce({
      db, emit,
      generatorFn: fakeGenerator(),
      schedulerFn: fakeScheduler(15),
      target: 15,
    });
    expect(emit).toHaveBeenCalledWith('pinterest:topup-tick', expect.objectContaining({
      books_topped_up: 1,
      pins_generated: 15,
    }));
  });

  it('one book failing does not abort the batch', async () => {
    seedBook(db, { slug: 'a' });
    seedBook(db, { slug: 'b' });
    let calls = 0;
    const generatorFn = vi.fn(async ({ slug }) => {
      calls++;
      if (slug === 'a' && calls <= 1) throw new Error('boom');
      return { imagePath: '/g/x.png', title: 't', description: 'd', linkUrl: 'http://x' };
    });
    const result = await runOnce({
      db, emit: vi.fn(),
      generatorFn,
      schedulerFn: fakeScheduler(15),
      target: 1,
    });
    expect(result.pins_generated).toBeGreaterThanOrEqual(1);
    expect(result.errors.length).toBeGreaterThanOrEqual(1);
  });
});

describe('_uniquenessHash', () => {
  it('is deterministic and 16 chars', () => {
    const h = _uniquenessHash(7, 'cover_hero', 0, 0, 0);
    expect(h).toBe(_uniquenessHash(7, 'cover_hero', 0, 0, 0));
    expect(h.length).toBe(16);
  });
  it('changes when any input changes', () => {
    const base = _uniquenessHash(1, 'cover_hero', 0, 0, 0);
    expect(_uniquenessHash(2, 'cover_hero', 0, 0, 0)).not.toBe(base);
    expect(_uniquenessHash(1, 'interior_preview', 0, 0, 0)).not.toBe(base);
    expect(_uniquenessHash(1, 'cover_hero', 1, 0, 0)).not.toBe(base);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web.ui/backend && npm test -- --run __tests__/pinterest/topup.test.js`
Expected: FAIL — `Cannot find module '../../pinterest/topup.js'`.

- [ ] **Step 3: Implement the module**

Create `web.ui/backend/pinterest/topup.js`:

```js
/**
 * Pinterest backlog top-up worker.
 *
 * runOnce() walks published books, computes their queued-but-not-posted count,
 * and generates enough new specs to refill each up to the runway target.
 * Variants are remixed across (palette_seed, tagline_idx, variant) with a
 * uniqueness hash check against the last 60 days of queue + history rows.
 *
 * @module pinterest/topup
 */

import crypto from 'node:crypto';
import { openDb } from '../db.js';
import { setWorkerHeartbeat, setWorkerError } from '../workerStatus.js';

export const WORKER_NAME = 'pinterest.topup';
const DEFAULT_INTERVAL_MS = 6 * 60 * 60 * 1000;

const PIN_TYPES = ['cover_hero', 'interior_preview'];
const VARIANTS = [0, 1, 2, 3];
const PALETTE_SEEDS = [0, 1, 2, 3, 4, 5, 6];
const TAGLINE_COUNT = 8;

/**
 * Compute the variant-uniqueness key: first 16 hex chars of sha256.
 * @param {number} bookId
 * @param {string} pinType
 * @param {number} variant
 * @param {number} paletteSeed
 * @param {number} taglineIdx
 * @returns {string}
 */
export function _uniquenessHash(bookId, pinType, variant, paletteSeed, taglineIdx) {
  const key = `${bookId}|${pinType}|${variant}|${paletteSeed}|${taglineIdx}`;
  return crypto.createHash('sha256').update(key).digest('hex').slice(0, 16);
}

function* candidateSpecs(bookId) {
  for (const pinType of PIN_TYPES) {
    for (const variant of VARIANTS) {
      for (const paletteSeed of PALETTE_SEEDS) {
        for (let taglineIdx = 0; taglineIdx < TAGLINE_COUNT; taglineIdx++) {
          yield {
            pin_type: pinType,
            variant,
            palette_seed: paletteSeed,
            tagline_idx: taglineIdx,
            hash: _uniquenessHash(bookId, pinType, variant, paletteSeed, taglineIdx),
          };
        }
      }
    }
  }
}

function recentHashes(db, bookId) {
  const cutoff = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();
  const rows = db.prepare(
    `SELECT uniqueness_hash FROM pinterest_queue
       WHERE kdp_book_id=? AND uniqueness_hash IS NOT NULL
     UNION
     SELECT uniqueness_hash FROM pinterest_history h
       JOIN pinterest_queue q ON q.id = h.queue_id
       WHERE q.kdp_book_id=? AND h.posted_at >= ? AND h.uniqueness_hash IS NOT NULL`,
  ).all(bookId, bookId, cutoff);
  return new Set(rows.map((r) => r.uniqueness_hash));
}

/**
 * @param {{
 *   db: import('better-sqlite3').Database,
 *   emit: (channel: string, payload: unknown) => void,
 *   generatorFn: (spec: object) => Promise<{imagePath:string,title:string,description:string,linkUrl:string}>,
 *   schedulerFn: (count: number) => string[],
 *   target?: number,
 *   now?: () => Date,
 * }} args
 * @returns {Promise<{books_topped_up:number, pins_generated:number, errors:string[]}>}
 */
export async function runOnce({
  db,
  emit,
  generatorFn,
  schedulerFn,
  target = Math.ceil(
    Number(process.env.PINTEREST_TOPUP_DAYS_RUNWAY ?? 30) *
      Number(process.env.PINTEREST_TOPUP_PER_DAY_PER_BOOK ?? 0.5),
  ),
}) {
  const books = db.prepare(
    `SELECT b.id, b.slug, b.title, b.asin,
            COUNT(q.id) FILTER (WHERE q.status IN ('pending','paused','posting')) AS pending_count
       FROM kdp_books b
       LEFT JOIN pinterest_queue q ON q.kdp_book_id = b.id
       WHERE b.status='published'
       GROUP BY b.id`,
  ).all();

  let booksTouched = 0;
  let pinsGenerated = 0;
  const errors = [];

  for (const book of books) {
    if (book.pending_count >= target) continue;
    const need = target - book.pending_count;
    const skip = recentHashes(db, book.id);

    /** @type {Array<{pin_type:string,variant:number,palette_seed:number,tagline_idx:number,hash:string}>} */
    const specs = [];
    for (const cand of candidateSpecs(book.id)) {
      if (specs.length >= need) break;
      if (skip.has(cand.hash)) continue;
      specs.push(cand);
      skip.add(cand.hash);
    }
    if (specs.length === 0) continue;

    let bookErrored = false;
    /** @type {Array<{spec:object, gen:object}>} */
    const generated = [];
    for (const spec of specs) {
      try {
        const gen = await generatorFn({
          bookId: book.id, slug: book.slug, title: book.title, asin: book.asin,
          pin_type: spec.pin_type, variant: spec.variant,
          palette_seed: spec.palette_seed, tagline_idx: spec.tagline_idx,
        });
        generated.push({ spec, gen });
      } catch (err) {
        errors.push(`book ${book.slug}: ${err instanceof Error ? err.message : String(err)}`);
        bookErrored = true;
      }
    }
    if (generated.length === 0) continue;

    const slots = schedulerFn(generated.length);
    const insert = db.prepare(
      `INSERT INTO pinterest_queue
         (kdp_book_id, pin_type, image_path, title, description, link_url,
          status, scheduled_for, uniqueness_hash)
       VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?)`,
    );
    const tx = db.transaction(() => {
      for (let i = 0; i < generated.length; i++) {
        const { spec, gen } = generated[i];
        insert.run(
          book.id, spec.pin_type, gen.imagePath, gen.title, gen.description,
          gen.linkUrl, slots[i] ?? null, spec.hash,
        );
        pinsGenerated += 1;
      }
    });
    tx();
    if (!bookErrored || generated.length > 0) booksTouched += 1;
  }

  emit('pinterest:topup-tick', { books_topped_up: booksTouched, pins_generated: pinsGenerated });
  return { books_topped_up: booksTouched, pins_generated: pinsGenerated, errors };
}

/**
 * Production wiring: real generator + scheduler + DB.
 * @param {{db?: import('better-sqlite3').Database, emit: (c:string,p:unknown)=>void, intervalMs?: number}} args
 * @returns {() => void} stop function
 */
export function startTopupWorkerDefault({ db, emit, intervalMs = DEFAULT_INTERVAL_MS }) {
  // Lazy imports to keep the test-only path light.
  let cancelled = false;
  let timer = null;

  async function tick() {
    if (cancelled) return;
    try {
      const { generatePin } = await import('./generator.js');
      const { assignSlots } = await import('./scheduler.js');
      const realDb = db ?? openDb();
      const schedulerCfg = {
        timeZone: process.env.PINTEREST_TZ ?? 'America/Los_Angeles',
        perDayMin: 3, perDayMax: 5, windowStartHour: 9, windowEndHour: 21,
      };
      const generatorFn = async (s) => {
        const out = await generatePin({
          slug: s.slug, pinType: s.pin_type, index: s.variant,
          sourcePngPath: '', // generator picks defaults based on slug
          title: s.title,
        });
        return {
          imagePath: out.imagePath ?? out,
          title: s.title,
          description: `${s.title} — fresh on Pocket Rooster Press`,
          linkUrl: s.asin ? `https://amazon.com/dp/${s.asin}` : 'https://amazon.com',
        };
      };
      const schedulerFn = (count) => {
        const existing = realDb.prepare(
          `SELECT scheduled_for FROM pinterest_queue
             WHERE status='pending' AND scheduled_for IS NOT NULL`,
        ).all();
        return assignSlots({
          count, existingQueue: existing, now: new Date(), config: schedulerCfg,
        });
      };
      await runOnce({ db: realDb, emit, generatorFn, schedulerFn });
      setWorkerHeartbeat(WORKER_NAME);
    } catch (err) {
      setWorkerError(WORKER_NAME, err instanceof Error ? err.message : String(err));
    } finally {
      if (!cancelled) {
        timer = setTimeout(tick, intervalMs);
        if (typeof timer?.unref === 'function') timer.unref();
      }
    }
  }
  void tick();
  return () => {
    cancelled = true;
    if (timer) clearTimeout(timer);
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd web.ui/backend && npm test -- --run __tests__/pinterest/topup.test.js`
Expected: PASS — 9 tests (7 runOnce + 2 hash).

- [ ] **Step 5: Commit**

```bash
git add web.ui/backend/pinterest/topup.js web.ui/backend/__tests__/pinterest/topup.test.js
git commit -m "feat(pinterest): topup worker — runOnce + uniqueness hash"
```

---

## Task 3: Wire topup worker into server.js

**Files:**
- Modify: `web.ui/backend/server.js`

Add the topup worker boot block right after the existing Pinterest poster boot block (around line 113–125).

- [ ] **Step 1: Add the import**

Near the other Pinterest imports in `server.js`:

```js
import { startTopupWorkerDefault } from './pinterest/topup.js';
```

- [ ] **Step 2: Add the boot block**

After the existing `// Start the Pinterest poster worker.` block (around line 116-125), add:

```js
// Start the Pinterest topup worker. Same gating model as the poster.
if (
  PORT !== 0 &&
  process.env.ROOSTER_SKIP_PINTEREST_TOPUP !== '1' &&
  process.env.PINTEREST_ACCESS_TOKEN
) {
  try {
    startTopupWorkerDefault({ db: openDb(), emit: recordEvent });
  } catch (err) {
    logger.warn({ err: err.message }, 'pinterest topup init failed');
  }
}
```

- [ ] **Step 3: Verify the full backend suite still passes**

Run: `cd web.ui/backend && npm test`
Expected: all tests PASS. No new server-level test required; the topup runs are tested via `topup.test.js`.

- [ ] **Step 4: Commit**

```bash
git add web.ui/backend/server.js
git commit -m "feat(pinterest): boot topup worker on server start"
```

---

## Task 4: `engagement.js` module — `runOnce` + tests

**Files:**
- Create: `web.ui/backend/pinterest/engagement.js`
- Test: `web.ui/backend/__tests__/pinterest/engagement.test.js`

`runOnce({db, apiClient, now?})` selects up to 200 history rows older than 12h, calls `apiClient.getPinAnalytics(pin_id)`, and updates the engagement columns. On 401/403 it sets a process-local disabled flag and fast-exits.

- [ ] **Step 1: Write the failing test**

Create `web.ui/backend/__tests__/pinterest/engagement.test.js`:

```js
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { runOnce, _resetForTests } from '../../pinterest/engagement.js';

function freshDb() {
  const db = new Database(':memory:');
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web.ui/backend && npm test -- --run __tests__/pinterest/engagement.test.js`
Expected: FAIL — `Cannot find module '../../pinterest/engagement.js'`.

- [ ] **Step 3: Implement the module**

Create `web.ui/backend/pinterest/engagement.js`:

```js
/**
 * Pinterest engagement fetcher worker.
 *
 * Polls each posted history row for saves/clicks/impressions via the
 * Pinterest v5 analytics endpoint. Fast-exits and self-disables on the
 * first 401/403 response (analytics access is gated separately from
 * basic posting; trial-mode apps may not have it).
 *
 * @module pinterest/engagement
 */

import { openDb } from '../db.js';
import { setWorkerHeartbeat, setWorkerError } from '../workerStatus.js';

export const WORKER_NAME = 'pinterest.engagement';
const DEFAULT_INTERVAL_MS = 12 * 60 * 60 * 1000;
const FETCH_WINDOW_MS = 12 * 60 * 60 * 1000;
const LOOKBACK_MS = 30 * 24 * 60 * 60 * 1000;
const BATCH_LIMIT = 200;

let engagementDisabled = false;

/** @internal — test only. */
export function _resetForTests() {
  engagementDisabled = false;
}

/**
 * @param {{
 *   db: import('better-sqlite3').Database,
 *   apiClient: {getPinAnalytics: (pinId: string) => Promise<{saves: number, clicks: number, impressions: number}>},
 *   now?: () => Date,
 * }} args
 * @returns {Promise<{updated:number, disabled:boolean, errors:string[]}>}
 */
export async function runOnce({ db, apiClient, now = () => new Date() }) {
  if (engagementDisabled) {
    return { updated: 0, disabled: true, errors: [] };
  }

  const cutoffLookback = new Date(now().getTime() - LOOKBACK_MS).toISOString();
  const cutoffFetched = new Date(now().getTime() - FETCH_WINDOW_MS).toISOString();
  const rows = db.prepare(
    `SELECT id, pinterest_pin_id FROM pinterest_history
       WHERE pinterest_pin_id IS NOT NULL
         AND posted_at >= ?
         AND (engagement_fetched_at IS NULL OR engagement_fetched_at < ?)
       LIMIT ?`,
  ).all(cutoffLookback, cutoffFetched, BATCH_LIMIT);

  const update = db.prepare(
    `UPDATE pinterest_history
        SET saves = ?, clicks = ?, impressions = ?, engagement_fetched_at = ?
      WHERE id = ?`,
  );
  const markSkipped = db.prepare(
    `UPDATE pinterest_history SET engagement_fetched_at = ? WHERE id = ?`,
  );

  let updated = 0;
  const errors = [];
  const stamp = now().toISOString();
  for (const r of rows) {
    try {
      const a = await apiClient.getPinAnalytics(r.pinterest_pin_id);
      update.run(a.saves ?? null, a.clicks ?? null, a.impressions ?? null, stamp, r.id);
      updated += 1;
    } catch (err) {
      const status = err && typeof err === 'object' && 'status' in err ? Number(err.status) : null;
      if (status === 401 || status === 403) {
        engagementDisabled = true;
        markSkipped.run(stamp, r.id);
        return { updated, disabled: true, errors };
      }
      errors.push(`pin ${r.pinterest_pin_id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return { updated, disabled: false, errors };
}

/**
 * @param {{db?: import('better-sqlite3').Database, intervalMs?: number, apiClientFactory: () => object}} args
 * @returns {() => void}
 */
export function startEngagementWorkerDefault({ db, intervalMs = DEFAULT_INTERVAL_MS, apiClientFactory }) {
  let cancelled = false;
  let timer = null;
  async function tick() {
    if (cancelled) return;
    try {
      const realDb = db ?? openDb();
      const apiClient = apiClientFactory();
      await runOnce({ db: realDb, apiClient });
      setWorkerHeartbeat(WORKER_NAME);
    } catch (err) {
      setWorkerError(WORKER_NAME, err instanceof Error ? err.message : String(err));
    } finally {
      if (!cancelled) {
        timer = setTimeout(tick, intervalMs);
        if (typeof timer?.unref === 'function') timer.unref();
      }
    }
  }
  void tick();
  return () => { cancelled = true; if (timer) clearTimeout(timer); };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd web.ui/backend && npm test -- --run __tests__/pinterest/engagement.test.js`
Expected: PASS — 5 tests.

- [ ] **Step 5: Commit**

```bash
git add web.ui/backend/pinterest/engagement.js web.ui/backend/__tests__/pinterest/engagement.test.js
git commit -m "feat(pinterest): engagement fetcher with 401-self-disable"
```

---

## Task 5: API client `getPinAnalytics` + server.js wiring for engagement worker

**Files:**
- Modify: `web.ui/backend/pinterest/api_client.js`
- Modify: `web.ui/backend/server.js`

The engagement worker depends on `apiClient.getPinAnalytics(pinId)`. Add that method to the existing API client, then boot the worker.

- [ ] **Step 1: Add `getPinAnalytics` to the api client**

Read the existing `web.ui/backend/pinterest/api_client.js`. It already exports a factory like `createPinterestApiClient(...)`. Find where `createPin` is defined and add a sibling method:

```js
  async getPinAnalytics(pinId) {
    const r = await fetch(
      `https://api.pinterest.com/v5/pins/${encodeURIComponent(pinId)}/analytics?metric_types=SAVE,PIN_CLICK,IMPRESSION&start_date=${new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)}&end_date=${new Date().toISOString().slice(0, 10)}`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      },
    );
    if (!r.ok) {
      const err = new Error(`Pinterest GET /v5/pins/${pinId}/analytics ${r.status}`);
      err.status = r.status;
      throw err;
    }
    const body = await r.json();
    // The analytics response shape varies by API version; defensively
    // pluck the three totals from the all_time bucket if present.
    const allTime = body?.all_time ?? body?.daily_metrics?.[0] ?? body;
    return {
      saves: Number(allTime?.SAVE ?? 0),
      clicks: Number(allTime?.PIN_CLICK ?? 0),
      impressions: Number(allTime?.IMPRESSION ?? 0),
    };
  },
```

(If the factory uses a different access-token variable name than `accessToken`, match it to whatever's already in scope. Read the existing `createPin` method to see what's available.)

- [ ] **Step 2: Wire the engagement worker into server.js**

After the topup boot block from Task 3, add:

```js
import { startEngagementWorkerDefault } from './pinterest/engagement.js';
// ... existing imports ...

if (
  PORT !== 0 &&
  process.env.ROOSTER_SKIP_PINTEREST_ENGAGEMENT !== '1' &&
  process.env.PINTEREST_ACCESS_TOKEN
) {
  try {
    startEngagementWorkerDefault({
      db: openDb(),
      apiClientFactory: () => {
        // The poster wires this same factory; reuse the import.
        return createPinterestApiClient({ accessToken: process.env.PINTEREST_ACCESS_TOKEN });
      },
    });
  } catch (err) {
    logger.warn({ err: err.message }, 'pinterest engagement init failed');
  }
}
```

(If `createPinterestApiClient` is not yet imported at the top of `server.js`, add the import next to the existing Pinterest imports.)

- [ ] **Step 3: Run the full backend suite**

Run: `cd web.ui/backend && npm test`
Expected: all tests PASS.

- [ ] **Step 4: Commit**

```bash
git add web.ui/backend/pinterest/api_client.js web.ui/backend/server.js
git commit -m "feat(pinterest): getPinAnalytics + boot engagement worker"
```

---

## Task 6: `analytics.js` pure module + cadence + engagement endpoints

**Files:**
- Create: `web.ui/backend/pinterest/analytics.js`
- Create: `web.ui/backend/__tests__/pinterest/analytics.test.js`
- Modify: `web.ui/backend/pinterest/routes.js`
- Modify: `web.ui/backend/__tests__/pinterest/routes.test.js`

`analytics.js` computes the cadence buckets and engagement rows from raw DB output. Pure functions, easy to test. Then two new route handlers call them.

- [ ] **Step 1: Write the analytics test**

Create `web.ui/backend/__tests__/pinterest/analytics.test.js`:

```js
import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { cadenceBuckets, engagementRows } from '../../pinterest/analytics.js';

function freshDb() {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE kdp_books (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT NOT NULL UNIQUE, title TEXT NOT NULL,
      status TEXT NOT NULL, output_dir TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE pinterest_queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      kdp_book_id INTEGER REFERENCES kdp_books(id),
      title TEXT
    );
    CREATE TABLE pinterest_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      queue_id INTEGER NOT NULL REFERENCES pinterest_queue(id),
      status TEXT NOT NULL, pinterest_pin_id TEXT, pinterest_url TEXT,
      posted_at TEXT NOT NULL, image_path TEXT,
      saves INTEGER, clicks INTEGER, impressions INTEGER,
      engagement_fetched_at TEXT
    );
  `);
  return db;
}

describe('cadenceBuckets', () => {
  /** @type {import('better-sqlite3').Database} */
  let db;
  beforeEach(() => { db = freshDb(); });

  it('returns N buckets when called with days=N', () => {
    const out = cadenceBuckets(db, { days: 30, target: 4, now: new Date('2026-05-30T12:00:00Z') });
    expect(out.buckets.length).toBe(30);
    expect(out.target_per_day).toBe(4);
  });

  it('counts posted vs failed per day', () => {
    db.prepare(`INSERT INTO pinterest_queue (title) VALUES ('t')`).run();
    db.prepare(`INSERT INTO pinterest_history (queue_id, status, posted_at) VALUES (1, 'posted', '2026-05-29T10:00:00Z')`).run();
    db.prepare(`INSERT INTO pinterest_history (queue_id, status, posted_at) VALUES (1, 'posted', '2026-05-29T15:00:00Z')`).run();
    db.prepare(`INSERT INTO pinterest_history (queue_id, status, posted_at) VALUES (1, 'failed', '2026-05-29T11:00:00Z')`).run();
    const out = cadenceBuckets(db, { days: 30, target: 4, now: new Date('2026-05-30T12:00:00Z') });
    const may29 = out.buckets.find((b) => b.date === '2026-05-29');
    expect(may29).toEqual({ date: '2026-05-29', posted: 2, failed: 1 });
  });

  it('summary aggregates totals + success rate + avg per day', () => {
    db.prepare(`INSERT INTO pinterest_queue (title) VALUES ('t')`).run();
    const insert = db.prepare(`INSERT INTO pinterest_history (queue_id, status, posted_at) VALUES (1, ?, ?)`);
    for (let i = 0; i < 9; i++) insert.run('posted', `2026-05-${20 + (i % 5)}T10:00:00Z`);
    insert.run('failed', '2026-05-20T10:00:00Z');
    const out = cadenceBuckets(db, { days: 30, target: 4, now: new Date('2026-05-30T12:00:00Z') });
    expect(out.summary.posted).toBe(9);
    expect(out.summary.failed).toBe(1);
    expect(out.summary.success_rate).toBeCloseTo(0.9, 5);
    expect(out.summary.avg_per_day).toBeCloseTo(9 / 30, 5);
  });
});

describe('engagementRows', () => {
  /** @type {import('better-sqlite3').Database} */
  let db;
  beforeEach(() => { db = freshDb(); });

  it('returns rows joined with book slug', () => {
    const bid = db.prepare(`INSERT INTO kdp_books (slug, title, status) VALUES ('a', 'Book A', 'published')`).run().lastInsertRowid;
    const qid = db.prepare(`INSERT INTO pinterest_queue (kdp_book_id, title) VALUES (?, 't')`).run(bid).lastInsertRowid;
    db.prepare(`INSERT INTO pinterest_history
        (queue_id, status, pinterest_pin_id, pinterest_url, posted_at, image_path, saves, clicks, impressions)
       VALUES (?, 'posted', 'pin-1', 'https://pin/1', '2026-05-29T10:00:00Z', '/p/x.png', 12, 3, 287)`,
    ).run(qid);
    const out = engagementRows(db, { limit: 50 });
    expect(out.rows.length).toBe(1);
    expect(out.rows[0]).toEqual({
      history_id: 1, image_path: '/p/x.png',
      book_slug: 'a', posted_at: '2026-05-29T10:00:00Z',
      saves: 12, clicks: 3, impressions: 287,
      pinterest_url: 'https://pin/1', engagement_available: true,
    });
  });

  it('engagement_available=false when saves is null', () => {
    const bid = db.prepare(`INSERT INTO kdp_books (slug, title, status) VALUES ('a', 'Book A', 'published')`).run().lastInsertRowid;
    const qid = db.prepare(`INSERT INTO pinterest_queue (kdp_book_id, title) VALUES (?, 't')`).run(bid).lastInsertRowid;
    db.prepare(`INSERT INTO pinterest_history
        (queue_id, status, pinterest_pin_id, posted_at)
       VALUES (?, 'posted', 'pin-1', '2026-05-29T10:00:00Z')`,
    ).run(qid);
    const out = engagementRows(db, { limit: 50 });
    expect(out.rows[0].engagement_available).toBe(false);
    expect(out.rows[0].saves).toBeNull();
  });
});
```

- [ ] **Step 2: Implement `analytics.js`**

Create `web.ui/backend/pinterest/analytics.js`:

```js
/**
 * Pinterest analytics — pure functions over the queue + history tables.
 * @module pinterest/analytics
 */

/**
 * Bucket history rows by local date over the last N days.
 * @param {import('better-sqlite3').Database} db
 * @param {{days:number, target:number, now?: Date}} args
 * @returns {{
 *   days:number, target_per_day:number,
 *   buckets: Array<{date:string, posted:number, failed:number}>,
 *   summary: {posted:number, failed:number, success_rate:number, avg_per_day:number}
 * }}
 */
export function cadenceBuckets(db, { days, target, now = new Date() }) {
  const start = new Date(now.getTime() - (days - 1) * 24 * 60 * 60 * 1000);
  const startIso = start.toISOString().slice(0, 10);
  const rows = db.prepare(
    `SELECT substr(posted_at, 1, 10) AS date, status, COUNT(*) AS n
       FROM pinterest_history
       WHERE substr(posted_at, 1, 10) >= ?
       GROUP BY substr(posted_at, 1, 10), status`,
  ).all(startIso);

  const byDate = new Map();
  for (let i = 0; i < days; i++) {
    const d = new Date(start.getTime() + i * 24 * 60 * 60 * 1000)
      .toISOString().slice(0, 10);
    byDate.set(d, { date: d, posted: 0, failed: 0 });
  }
  for (const r of rows) {
    const bucket = byDate.get(r.date);
    if (!bucket) continue;
    if (r.status === 'posted') bucket.posted = r.n;
    else if (r.status === 'failed') bucket.failed = r.n;
  }
  const buckets = [...byDate.values()];
  const posted = buckets.reduce((s, b) => s + b.posted, 0);
  const failed = buckets.reduce((s, b) => s + b.failed, 0);
  const total = posted + failed;
  const success_rate = total === 0 ? 0 : posted / total;
  const avg_per_day = posted / days;
  return {
    days,
    target_per_day: target,
    buckets,
    summary: { posted, failed, success_rate, avg_per_day },
  };
}

/**
 * Recent successfully-posted rows with engagement, joined with the book slug.
 * @param {import('better-sqlite3').Database} db
 * @param {{limit?:number, engagementDisabled?:boolean}} args
 */
export function engagementRows(db, { limit = 50, engagementDisabled = false } = {}) {
  const rows = db.prepare(
    `SELECT h.id AS history_id, h.image_path,
            b.slug AS book_slug, h.posted_at,
            h.saves, h.clicks, h.impressions,
            h.pinterest_url
       FROM pinterest_history h
       JOIN pinterest_queue q ON q.id = h.queue_id
       LEFT JOIN kdp_books b ON b.id = q.kdp_book_id
       WHERE h.status = 'posted'
       ORDER BY h.posted_at DESC
       LIMIT ?`,
  ).all(limit);
  return {
    rows: rows.map((r) => ({
      ...r,
      engagement_available: r.saves != null,
    })),
    engagement_disabled: engagementDisabled,
  };
}
```

- [ ] **Step 3: Add the two routes**

Read `web.ui/backend/pinterest/routes.js` to confirm the existing `createPinterestRouter` factory shape. Add these imports at the top:

```js
import { cadenceBuckets, engagementRows } from './analytics.js';
```

Inside the router factory, before `return router;`, add:

```js
  router.get('/cadence', (req, res) => {
    const days = Math.min(Math.max(Number(req.query.days ?? 30) || 30, 1), 90);
    const target = Number(process.env.PINTEREST_TARGET_PER_DAY ?? 4);
    const db = openDb();
    res.json(cadenceBuckets(db, { days, target }));
  });

  router.get('/engagement', (req, res) => {
    const limit = Math.min(Math.max(Number(req.query.limit ?? 50) || 50, 1), 200);
    const db = openDb();
    res.json(engagementRows(db, { limit }));
  });
```

- [ ] **Step 4: Add route tests**

Append to `web.ui/backend/__tests__/pinterest/routes.test.js` (use the existing test setup pattern in that file — read it first to see how it builds the app):

```js
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
```

- [ ] **Step 5: Run tests**

Run: `cd web.ui/backend && npm test`
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add web.ui/backend/pinterest/analytics.js web.ui/backend/pinterest/routes.js web.ui/backend/__tests__/pinterest/analytics.test.js web.ui/backend/__tests__/pinterest/routes.test.js
git commit -m "feat(pinterest): cadence + engagement analytics routes"
```

---

## Task 7: Frontend `bookColor.ts` helper + tests

**Files:**
- Create: `web.ui/frontend-react/src/lib/bookColor.ts`
- Test: `web.ui/frontend-react/src/lib/__tests__/bookColor.test.ts`

Pure helper. Hash → stable HSL string.

- [ ] **Step 1: Write the test**

Create `web.ui/frontend-react/src/lib/__tests__/bookColor.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { bookColor } from '../bookColor';

describe('bookColor', () => {
  it('is deterministic per slug', () => {
    expect(bookColor('foo')).toBe(bookColor('foo'));
  });

  it('returns a CSS hsl() string', () => {
    expect(bookColor('foo')).toMatch(/^hsl\(\d+\s*,\s*\d+%\s*,\s*\d+%\)$/);
  });

  it('different slugs produce different colors', () => {
    expect(bookColor('foo')).not.toBe(bookColor('bar'));
  });
});
```

- [ ] **Step 2: Implement**

Create `web.ui/frontend-react/src/lib/bookColor.ts`:

```ts
/**
 * Stable HSL color from a book slug. Hue varies across slugs; saturation
 * and lightness are fixed so the palette stays visually coherent.
 */
export function bookColor(slug: string): string {
  let h = 0;
  for (let i = 0; i < slug.length; i++) h = (h * 31 + slug.charCodeAt(i)) >>> 0;
  const hue = h % 360;
  return `hsl(${hue}, 60%, 55%)`;
}
```

- [ ] **Step 3: Run + commit**

```
cd web.ui/frontend-react && npm test -- --run src/lib/__tests__/bookColor.test.ts
```
Expected: 3 PASS.

```bash
git add web.ui/frontend-react/src/lib/bookColor.ts web.ui/frontend-react/src/lib/__tests__/bookColor.test.ts
git commit -m "feat(pinterest): bookColor helper for calendar chips"
```

---

## Task 8: Frontend API client extensions — `getCadence` + `getEngagement` + types

**Files:**
- Modify: `web.ui/frontend-react/src/api/pinterest.ts`

- [ ] **Step 1: Append types + functions**

Open the file and append before any final re-export block:

```ts
export interface CadenceBucket {
  date: string;
  posted: number;
  failed: number;
}

export interface CadenceResponse {
  days: number;
  target_per_day: number;
  buckets: CadenceBucket[];
  summary: {
    posted: number;
    failed: number;
    success_rate: number;
    avg_per_day: number;
  };
}

export interface EngagementRow {
  history_id: number;
  image_path: string;
  book_slug: string | null;
  posted_at: string;
  saves: number | null;
  clicks: number | null;
  impressions: number | null;
  pinterest_url: string | null;
  engagement_available: boolean;
}

export interface EngagementResponse {
  rows: EngagementRow[];
  engagement_disabled: boolean;
}

export async function getCadence(days = 30): Promise<CadenceResponse> {
  const r = await fetch(`/api/pinterest/cadence?days=${days}`);
  if (!r.ok) throw new Error(`getCadence: ${r.status}`);
  return (await r.json()) as CadenceResponse;
}

export async function getEngagement(limit = 50): Promise<EngagementResponse> {
  const r = await fetch(`/api/pinterest/engagement?limit=${limit}`);
  if (!r.ok) throw new Error(`getEngagement: ${r.status}`);
  return (await r.json()) as EngagementResponse;
}
```

- [ ] **Step 2: Type-check + commit**

```
cd web.ui/frontend-react && npx tsc --noEmit
```
Expected: clean.

```bash
git add web.ui/frontend-react/src/api/pinterest.ts
git commit -m "feat(pinterest): typed wrappers for cadence + engagement"
```

---

## Task 9: `PinterestCalendarChip` component + tests

**Files:**
- Create: `web.ui/frontend-react/src/components/PinterestCalendarChip.tsx`
- Test: `web.ui/frontend-react/src/components/__tests__/PinterestCalendarChip.test.tsx`

- [ ] **Step 1: Write the test**

Create `web.ui/frontend-react/src/components/__tests__/PinterestCalendarChip.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PinterestCalendarChip from '../PinterestCalendarChip';
import type { PinterestQueueRow } from '../../api/pinterest';

const baseRow: PinterestQueueRow = {
  id: 1,
  kdp_book_id: 1,
  pin_type: 'cover_hero',
  image_path: '/x.png',
  title: 'Travel Sudoku Vol 1',
  description: 'd',
  link_url: 'https://amazon.com',
  status: 'pending',
  scheduled_for: '2026-05-29T09:00:00Z',
  book_slug: 'travel-sudoku-v1',
};

describe('PinterestCalendarChip', () => {
  it('renders the book slug abbreviation', () => {
    render(<PinterestCalendarChip row={baseRow} onClick={vi.fn()} />);
    expect(screen.getByRole('button')).toHaveTextContent(/travel/i);
  });

  it('applies status class for each status', () => {
    const statuses = ['pending', 'paused', 'posting', 'failed'] as const;
    for (const s of statuses) {
      const { unmount } = render(
        <PinterestCalendarChip row={{ ...baseRow, status: s }} onClick={vi.fn()} />,
      );
      expect(document.querySelector(`.pin-chip--${s}`)).not.toBeNull();
      unmount();
    }
  });

  it('calls onClick with the row', async () => {
    const onClick = vi.fn();
    render(<PinterestCalendarChip row={baseRow} onClick={onClick} />);
    await userEvent.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledWith(baseRow);
  });
});
```

- [ ] **Step 2: Implement**

Create `web.ui/frontend-react/src/components/PinterestCalendarChip.tsx`:

```tsx
import type { PinterestQueueRow } from '../api/pinterest';
import { bookColor } from '../lib/bookColor';

interface Props {
  row: PinterestQueueRow;
  onClick: (row: PinterestQueueRow) => void;
}

export default function PinterestCalendarChip({ row, onClick }: Props) {
  const slug = row.book_slug ?? '';
  const abbrev = slug.slice(0, 6);
  const color = bookColor(slug);
  const title = `${row.title} · ${row.pin_type} · ${row.status}`;
  return (
    <button
      type="button"
      className={`pin-chip pin-chip--${row.status}`}
      style={{ background: color }}
      title={title}
      onClick={() => onClick(row)}
    >
      {abbrev}
    </button>
  );
}
```

- [ ] **Step 3: Run + commit**

```
cd web.ui/frontend-react && npm test -- --run src/components/__tests__/PinterestCalendarChip.test.tsx
```
Expected: 3 PASS.

```bash
git add web.ui/frontend-react/src/components/PinterestCalendarChip.tsx web.ui/frontend-react/src/components/__tests__/PinterestCalendarChip.test.tsx
git commit -m "feat(pinterest): calendar chip"
```

---

## Task 10: `PinterestCalendar` grid component + tests

**Files:**
- Create: `web.ui/frontend-react/src/components/PinterestCalendar.tsx`
- Test: `web.ui/frontend-react/src/components/__tests__/PinterestCalendar.test.tsx`

- [ ] **Step 1: Write the test**

Create `web.ui/frontend-react/src/components/__tests__/PinterestCalendar.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import PinterestCalendar from '../PinterestCalendar';
import type { PinterestQueueRow } from '../../api/pinterest';

const monday = new Date('2026-05-25T00:00:00Z');

const rows: PinterestQueueRow[] = [
  {
    id: 1, kdp_book_id: 1, pin_type: 'cover_hero',
    image_path: '/x.png', title: 'Travel Sudoku', description: 'd',
    link_url: 'http', status: 'pending',
    scheduled_for: '2026-05-25T10:00:00Z',
    book_slug: 'travel',
  },
  {
    id: 2, kdp_book_id: 2, pin_type: 'cover_hero',
    image_path: '/x.png', title: 'Kakuro', description: 'd',
    link_url: 'http', status: 'pending',
    scheduled_for: '2026-05-26T14:00:00Z',
    book_slug: 'kakuro',
  },
];

describe('PinterestCalendar', () => {
  it('renders 7 day column headers starting at `start`', () => {
    render(<PinterestCalendar rows={rows} start={monday} onChipClick={vi.fn()} />);
    expect(screen.getByText(/Mon 5\/25/i)).toBeInTheDocument();
    expect(screen.getByText(/Sun 5\/31/i)).toBeInTheDocument();
  });

  it('renders 4 slot row labels', () => {
    render(<PinterestCalendar rows={rows} start={monday} onChipClick={vi.fn()} />);
    expect(screen.getByText('9 AM')).toBeInTheDocument();
    expect(screen.getByText('12 PM')).toBeInTheDocument();
    expect(screen.getByText('3 PM')).toBeInTheDocument();
    expect(screen.getByText('6 PM')).toBeInTheDocument();
  });

  it('places chips in the cell matching the scheduled hour', () => {
    const { container } = render(
      <PinterestCalendar rows={rows} start={monday} onChipClick={vi.fn()} />,
    );
    // Two chips total.
    expect(container.querySelectorAll('.pin-chip').length).toBe(2);
  });
});
```

- [ ] **Step 2: Implement**

Create `web.ui/frontend-react/src/components/PinterestCalendar.tsx`:

```tsx
import { useMemo } from 'react';
import type { PinterestQueueRow } from '../api/pinterest';
import PinterestCalendarChip from './PinterestCalendarChip';

interface Props {
  rows: PinterestQueueRow[];
  start: Date;
  onChipClick: (row: PinterestQueueRow) => void;
}

const SLOT_HOURS = [9, 12, 15, 18];
const SLOT_LABELS = ['9 AM', '12 PM', '3 PM', '6 PM'];
const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function dayCol(start: Date, offset: number) {
  const d = new Date(start);
  d.setDate(d.getDate() + offset);
  return d;
}

function fmtDay(d: Date) {
  return `${DAY_LABELS[d.getDay()]} ${d.getMonth() + 1}/${d.getDate()}`;
}

function slotIndex(iso: string | null): number {
  if (!iso) return -1;
  const h = new Date(iso).getHours();
  let best = 0;
  let bestDiff = Math.abs(SLOT_HOURS[0] - h);
  for (let i = 1; i < SLOT_HOURS.length; i++) {
    const diff = Math.abs(SLOT_HOURS[i] - h);
    if (diff < bestDiff) { best = i; bestDiff = diff; }
  }
  return best;
}

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() &&
         a.getMonth() === b.getMonth() &&
         a.getDate() === b.getDate();
}

export default function PinterestCalendar({ rows, start, onChipClick }: Props) {
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => dayCol(start, i)), [start]);

  return (
    <div className="pin-calendar">
      <div className="pin-calendar__row pin-calendar__head">
        <div className="pin-calendar__slot-label" aria-hidden />
        {days.map((d, i) => (
          <div key={i} className="pin-calendar__day-head">{fmtDay(d)}</div>
        ))}
      </div>
      {SLOT_HOURS.map((_, slotIdx) => (
        <div key={slotIdx} className="pin-calendar__row">
          <div className="pin-calendar__slot-label">{SLOT_LABELS[slotIdx]}</div>
          {days.map((d, di) => {
            const cellRows = rows.filter((r) => {
              if (!r.scheduled_for) return false;
              const rd = new Date(r.scheduled_for);
              return isSameDay(rd, d) && slotIndex(r.scheduled_for) === slotIdx;
            });
            return (
              <div key={di} className="pin-calendar__cell">
                {cellRows.length === 0 && <span className="pin-calendar__cell-empty" />}
                {cellRows.map((r) => (
                  <PinterestCalendarChip key={r.id} row={r} onClick={onChipClick} />
                ))}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Add CSS rules**

Append to `web.ui/frontend-react/src/styles/shell.css`:

```css
/* Pinterest calendar grid. */
.pin-calendar { display: grid; gap: 4px; }
.pin-calendar__row { display: grid; grid-template-columns: 60px repeat(7, 1fr); gap: 4px; align-items: stretch; }
.pin-calendar__head { font-size: 0.8rem; font-weight: 600; color: var(--muted); }
.pin-calendar__day-head { padding: 4px; text-align: center; }
.pin-calendar__slot-label { font-size: 0.75rem; color: var(--muted); padding: 4px; }
.pin-calendar__cell { min-height: 36px; padding: 2px; border: 1px solid var(--border); border-radius: 4px; display: flex; flex-wrap: wrap; gap: 2px; }
.pin-calendar__cell-empty { display: block; width: 100%; min-height: 32px; opacity: 0.05; }
.pin-chip {
  display: inline-flex; align-items: center; justify-content: center;
  font-size: 0.7rem; color: #fff;
  padding: 2px 6px; border-radius: 999px; border: none; cursor: pointer;
}
.pin-chip--paused { background-image: repeating-linear-gradient(45deg, transparent, transparent 4px, rgba(255,255,255,0.3) 4px, rgba(255,255,255,0.3) 8px); }
.pin-chip--posting { animation: pin-chip-pulse 1.2s infinite ease-in-out; }
.pin-chip--failed { background: transparent !important; color: #b91c1c; border: 1px solid #b91c1c; }
@keyframes pin-chip-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}
```

- [ ] **Step 4: Run + commit**

```
cd web.ui/frontend-react && npm test -- --run src/components/__tests__/PinterestCalendar.test.tsx
```
Expected: 3 PASS.

```bash
git add web.ui/frontend-react/src/components/PinterestCalendar.tsx web.ui/frontend-react/src/components/__tests__/PinterestCalendar.test.tsx web.ui/frontend-react/src/styles/shell.css
git commit -m "feat(pinterest): calendar grid component + CSS"
```

---

## Task 11: `PinterestViewToggle` + wire calendar into page

**Files:**
- Create: `web.ui/frontend-react/src/components/PinterestViewToggle.tsx`
- Modify: `web.ui/frontend-react/src/pages/Pinterest.tsx`

- [ ] **Step 1: Implement the toggle**

Create `web.ui/frontend-react/src/components/PinterestViewToggle.tsx`:

```tsx
export type PinViewMode = 'week' | 'month' | 'list';

interface Props {
  mode: PinViewMode;
  onChange: (mode: PinViewMode) => void;
}

export default function PinterestViewToggle({ mode, onChange }: Props) {
  return (
    <div role="group" aria-label="View mode" style={{ display: 'inline-flex', gap: 4 }}>
      {(['week', 'month', 'list'] as const).map((m) => (
        <button
          key={m}
          type="button"
          aria-pressed={mode === m}
          onClick={() => onChange(m)}
          style={{
            padding: '4px 10px',
            background: mode === m ? 'var(--accent)' : 'transparent',
            color: mode === m ? 'var(--accent-fg)' : 'var(--fg)',
            border: '1px solid var(--border)',
            borderRadius: 4, cursor: 'pointer',
          }}
        >
          {m[0].toUpperCase() + m.slice(1)}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Wire into `Pinterest.tsx`**

Read the current `web.ui/frontend-react/src/pages/Pinterest.tsx` to find the Queue section's render block. Add these imports near the top:

```ts
import PinterestViewToggle, { type PinViewMode } from '../components/PinterestViewToggle';
import PinterestCalendar from '../components/PinterestCalendar';
```

Add the view-mode state near the other useState calls:

```ts
const [viewMode, setViewMode] = useState<PinViewMode>(() => {
  try { return (localStorage.getItem('pinterest_view_mode') as PinViewMode) ?? 'week'; }
  catch { return 'week'; }
});
useEffect(() => {
  try { localStorage.setItem('pinterest_view_mode', viewMode); } catch { /* ignore */ }
}, [viewMode]);
```

In the JSX where the existing `<PinterestQueueTable />` is mounted, wrap it like this:

```tsx
<div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
  <h2 style={{ margin: 0 }}>Upcoming</h2>
  <PinterestViewToggle mode={viewMode} onChange={setViewMode} />
</div>

{viewMode === 'list' && (
  <PinterestQueueTable
    rows={queue}
    onPreview={setPreview}
    onUpdate={async (id, patch) => {
      await updateQueueRow(id, patch);
      void reload();
    }}
    onCancel={async (id) => {
      await cancelQueueRow(id);
      void reload();
    }}
  />
)}

{viewMode === 'week' && (
  <PinterestCalendar
    rows={queue}
    start={new Date()}
    onChipClick={setPreview}
  />
)}

{viewMode === 'month' && (
  // Month view drills into week — for v1, fall back to week.
  <PinterestCalendar
    rows={queue}
    start={new Date()}
    onChipClick={setPreview}
  />
)}
```

(Month view ships as week view in v1. Documented as a v2 follow-up.)

- [ ] **Step 3: Type-check + run + commit**

```
cd web.ui/frontend-react && npx tsc --noEmit
cd web.ui/frontend-react && npm test
```
Expected: clean + full suite passes.

```bash
git add web.ui/frontend-react/src/components/PinterestViewToggle.tsx web.ui/frontend-react/src/pages/Pinterest.tsx
git commit -m "feat(pinterest): view-mode toggle (week/month/list)"
```

---

## Task 12: `PinterestCadenceChart` component + tests

**Files:**
- Create: `web.ui/frontend-react/src/components/PinterestCadenceChart.tsx`
- Test: `web.ui/frontend-react/src/components/__tests__/PinterestCadenceChart.test.tsx`

- [ ] **Step 1: Write the test**

Create `web.ui/frontend-react/src/components/__tests__/PinterestCadenceChart.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PinterestCadenceChart from '../PinterestCadenceChart';
import type { CadenceResponse } from '../../api/pinterest';

const sample: CadenceResponse = {
  days: 7, target_per_day: 4,
  buckets: [
    { date: '2026-05-23', posted: 3, failed: 0 },
    { date: '2026-05-24', posted: 4, failed: 1 },
    { date: '2026-05-25', posted: 2, failed: 0 },
    { date: '2026-05-26', posted: 5, failed: 0 },
    { date: '2026-05-27', posted: 4, failed: 0 },
    { date: '2026-05-28', posted: 3, failed: 2 },
    { date: '2026-05-29', posted: 4, failed: 0 },
  ],
  summary: { posted: 25, failed: 3, success_rate: 25 / 28, avg_per_day: 25 / 7 },
};

describe('PinterestCadenceChart', () => {
  it('renders summary copy', () => {
    render(<PinterestCadenceChart data={sample} onBarClick={vi.fn()} />);
    expect(screen.getByText(/Posted 25 over 7 days/i)).toBeInTheDocument();
    expect(screen.getByText(/target 4\/day/i)).toBeInTheDocument();
  });

  it('renders one bar per bucket', () => {
    const { container } = render(<PinterestCadenceChart data={sample} onBarClick={vi.fn()} />);
    expect(container.querySelectorAll('.cadence-bar').length).toBe(7);
  });

  it('clicking a bar fires onBarClick with the bucket', async () => {
    const onBarClick = vi.fn();
    const { container } = render(<PinterestCadenceChart data={sample} onBarClick={onBarClick} />);
    const bars = container.querySelectorAll('.cadence-bar');
    await userEvent.click(bars[0]);
    expect(onBarClick).toHaveBeenCalledWith(sample.buckets[0]);
  });
});
```

- [ ] **Step 2: Implement**

Create `web.ui/frontend-react/src/components/PinterestCadenceChart.tsx`:

```tsx
import type { CadenceResponse, CadenceBucket } from '../api/pinterest';

interface Props {
  data: CadenceResponse;
  onBarClick: (bucket: CadenceBucket) => void;
}

const WIDTH = 600;
const HEIGHT = 180;
const PADDING_BOTTOM = 24;
const PADDING_TOP = 8;

export default function PinterestCadenceChart({ data, onBarClick }: Props) {
  const { buckets, target_per_day, summary } = data;
  const maxVal = Math.max(target_per_day, ...buckets.map((b) => b.posted + b.failed)) || 1;
  const barW = (WIDTH - 8) / buckets.length;
  const yFor = (n: number) => HEIGHT - PADDING_BOTTOM - (n / maxVal) * (HEIGHT - PADDING_BOTTOM - PADDING_TOP);
  const successPct = Math.round(summary.success_rate * 100);
  const avg = summary.avg_per_day.toFixed(1);

  return (
    <div>
      <p style={{ margin: '0 0 8px' }}>
        Posted {summary.posted} over {data.days} days · {successPct}% success ·
        ~{avg}/day vs target {target_per_day}/day
      </p>
      <svg width={WIDTH} height={HEIGHT} role="img" aria-label="Posting cadence">
        <line
          x1={0} x2={WIDTH}
          y1={yFor(target_per_day)} y2={yFor(target_per_day)}
          stroke="var(--muted)" strokeDasharray="4 4"
        />
        {buckets.map((b, i) => {
          const x = i * barW + 4;
          const postedH = HEIGHT - PADDING_BOTTOM - yFor(b.posted);
          const failedH = HEIGHT - PADDING_BOTTOM - yFor(b.posted + b.failed) - postedH;
          return (
            <g key={b.date}
               className="cadence-bar"
               style={{ cursor: 'pointer' }}
               onClick={() => onBarClick(b)}>
              <rect x={x} y={yFor(b.posted)} width={barW - 2} height={postedH}
                    fill="#16a34a" />
              <rect x={x} y={yFor(b.posted + b.failed)} width={barW - 2} height={failedH}
                    fill="#dc2626" />
              <rect x={x} y={PADDING_TOP} width={barW - 2}
                    height={HEIGHT - PADDING_BOTTOM - PADDING_TOP}
                    fill="transparent" />
            </g>
          );
        })}
      </svg>
    </div>
  );
}
```

- [ ] **Step 3: Run + commit**

```
cd web.ui/frontend-react && npm test -- --run src/components/__tests__/PinterestCadenceChart.test.tsx
```
Expected: 3 PASS.

```bash
git add web.ui/frontend-react/src/components/PinterestCadenceChart.tsx web.ui/frontend-react/src/components/__tests__/PinterestCadenceChart.test.tsx
git commit -m "feat(pinterest): cadence stacked bar chart"
```

---

## Task 13: `PinterestEngagementTable` component + tests

**Files:**
- Create: `web.ui/frontend-react/src/components/PinterestEngagementTable.tsx`
- Test: `web.ui/frontend-react/src/components/__tests__/PinterestEngagementTable.test.tsx`

- [ ] **Step 1: Write the test**

Create `web.ui/frontend-react/src/components/__tests__/PinterestEngagementTable.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import PinterestEngagementTable from '../PinterestEngagementTable';
import type { EngagementResponse } from '../../api/pinterest';

const baseRow = {
  history_id: 1, image_path: '/p/x.png',
  book_slug: 'travel-v1', posted_at: '2026-05-29T10:00:00Z',
  saves: 12 as number | null, clicks: 3 as number | null, impressions: 287 as number | null,
  pinterest_url: 'https://pin/1', engagement_available: true,
};

describe('PinterestEngagementTable', () => {
  it('renders one row per data row', () => {
    const data: EngagementResponse = {
      rows: [baseRow, { ...baseRow, history_id: 2, book_slug: 'sudoku' }],
      engagement_disabled: false,
    };
    render(<PinterestEngagementTable data={data} />);
    expect(screen.getByText('travel-v1')).toBeInTheDocument();
    expect(screen.getByText('sudoku')).toBeInTheDocument();
  });

  it('shows em-dash for null engagement columns', () => {
    const data: EngagementResponse = {
      rows: [{ ...baseRow, saves: null, clicks: null, impressions: null, engagement_available: false }],
      engagement_disabled: false,
    };
    render(<PinterestEngagementTable data={data} />);
    const cells = screen.getAllByText('—');
    expect(cells.length).toBeGreaterThanOrEqual(3);
  });

  it('renders the disabled banner when engagement_disabled is true', () => {
    const data: EngagementResponse = { rows: [], engagement_disabled: true };
    render(<PinterestEngagementTable data={data} />);
    expect(screen.getByText(/analytics not available/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Implement**

Create `web.ui/frontend-react/src/components/PinterestEngagementTable.tsx`:

```tsx
import type { EngagementResponse } from '../api/pinterest';

interface Props {
  data: EngagementResponse;
}

function fmt(n: number | null): string {
  return n == null ? '—' : String(n);
}

export default function PinterestEngagementTable({ data }: Props) {
  return (
    <div>
      {data.engagement_disabled && (
        <p role="status" style={{ background: '#fff3cd', color: '#664d03', padding: '6px 10px', borderRadius: 4 }}>
          Pinterest analytics not available for this app — engagement columns will stay empty.
        </p>
      )}
      <table>
        <thead>
          <tr>
            <th>Pin</th><th>Book</th><th>Posted</th>
            <th>Saves</th><th>Clicks</th><th>Impr.</th><th>Link</th>
          </tr>
        </thead>
        <tbody>
          {data.rows.map((r) => (
            <tr key={r.history_id}>
              <td>
                {r.image_path && <img src={r.image_path} alt="" style={{ width: 48, height: 'auto' }} />}
              </td>
              <td>{r.book_slug ?? '—'}</td>
              <td>{r.posted_at.slice(0, 10)}</td>
              <td>{fmt(r.saves)}</td>
              <td>{fmt(r.clicks)}</td>
              <td>{fmt(r.impressions)}</td>
              <td>{r.pinterest_url ? <a href={r.pinterest_url} target="_blank" rel="noopener noreferrer">→</a> : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 3: Run + commit**

```
cd web.ui/frontend-react && npm test -- --run src/components/__tests__/PinterestEngagementTable.test.tsx
```
Expected: 3 PASS.

```bash
git add web.ui/frontend-react/src/components/PinterestEngagementTable.tsx web.ui/frontend-react/src/components/__tests__/PinterestEngagementTable.test.tsx
git commit -m "feat(pinterest): engagement table"
```

---

## Task 14: `PinterestHistoryTabs` + wire into page

**Files:**
- Create: `web.ui/frontend-react/src/components/PinterestHistoryTabs.tsx`
- Test: `web.ui/frontend-react/src/components/__tests__/PinterestHistoryTabs.test.tsx`
- Modify: `web.ui/frontend-react/src/pages/Pinterest.tsx`

- [ ] **Step 1: Write the test**

Create `web.ui/frontend-react/src/components/__tests__/PinterestHistoryTabs.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PinterestHistoryTabs from '../PinterestHistoryTabs';

function mockJson(body: unknown) {
  return {
    ok: true, status: 200,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

describe('PinterestHistoryTabs', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch');
    try { localStorage.removeItem('pinterest_history_tab'); } catch { /* ignore */ }
  });
  afterEach(() => { fetchSpy.mockRestore(); });

  it('defaults to the Recent tab', () => {
    render(<PinterestHistoryTabs recentChildren={<div>RECENT-PANEL</div>} />);
    expect(screen.getByText('RECENT-PANEL')).toBeInTheDocument();
  });

  it('switches to Cadence and fetches cadence data', async () => {
    fetchSpy.mockResolvedValueOnce(mockJson({
      days: 30, target_per_day: 4,
      buckets: Array.from({ length: 30 }, (_, i) => ({
        date: `2026-05-${String(i + 1).padStart(2, '0')}`, posted: 1, failed: 0,
      })),
      summary: { posted: 30, failed: 0, success_rate: 1, avg_per_day: 1 },
    }));
    render(<PinterestHistoryTabs recentChildren={<div>RECENT-PANEL</div>} />);
    await userEvent.click(screen.getByRole('tab', { name: /cadence/i }));
    expect(await screen.findByText(/Posted 30 over 30 days/i)).toBeInTheDocument();
  });

  it('switches to Engagement and fetches engagement data', async () => {
    fetchSpy.mockResolvedValueOnce(mockJson({ rows: [], engagement_disabled: false }));
    render(<PinterestHistoryTabs recentChildren={<div>RECENT-PANEL</div>} />);
    await userEvent.click(screen.getByRole('tab', { name: /engagement/i }));
    expect(await screen.findByRole('table')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Implement**

Create `web.ui/frontend-react/src/components/PinterestHistoryTabs.tsx`:

```tsx
import { useEffect, useState, type ReactNode } from 'react';
import {
  getCadence, getEngagement,
  type CadenceResponse, type EngagementResponse,
} from '../api/pinterest';
import PinterestCadenceChart from './PinterestCadenceChart';
import PinterestEngagementTable from './PinterestEngagementTable';

type Tab = 'recent' | 'cadence' | 'engagement';

interface Props {
  recentChildren: ReactNode;
}

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'recent', label: 'Recent' },
  { id: 'cadence', label: 'Cadence' },
  { id: 'engagement', label: 'Engagement' },
];

export default function PinterestHistoryTabs({ recentChildren }: Props) {
  const [tab, setTab] = useState<Tab>(() => {
    try { return (localStorage.getItem('pinterest_history_tab') as Tab) ?? 'recent'; }
    catch { return 'recent'; }
  });
  const [cadence, setCadence] = useState<CadenceResponse | null>(null);
  const [engagement, setEngagement] = useState<EngagementResponse | null>(null);

  useEffect(() => {
    try { localStorage.setItem('pinterest_history_tab', tab); } catch { /* ignore */ }
    if (tab === 'cadence' && !cadence) void getCadence(30).then(setCadence).catch(() => setCadence(null));
    if (tab === 'engagement' && !engagement) void getEngagement(50).then(setEngagement).catch(() => setEngagement(null));
  }, [tab]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div>
      <div role="tablist" style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            style={{
              padding: '4px 10px',
              background: tab === t.id ? 'var(--accent)' : 'transparent',
              color: tab === t.id ? 'var(--accent-fg)' : 'var(--fg)',
              border: '1px solid var(--border)', borderRadius: 4,
              cursor: 'pointer',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'recent' && recentChildren}
      {tab === 'cadence' && cadence && (
        <PinterestCadenceChart data={cadence} onBarClick={() => { /* drill-in is v2 */ }} />
      )}
      {tab === 'cadence' && !cadence && <p>Loading…</p>}
      {tab === 'engagement' && engagement && <PinterestEngagementTable data={engagement} />}
      {tab === 'engagement' && !engagement && <p>Loading…</p>}
    </div>
  );
}
```

- [ ] **Step 3: Wire into `Pinterest.tsx`**

In the JSX, find where the existing `<PinterestHistoryTable />` is mounted. Replace with:

```tsx
<PinterestHistoryTabs
  recentChildren={<PinterestHistoryTable rows={history} />}
/>
```

Add the import at the top.

- [ ] **Step 4: Run + type-check + commit**

```
cd web.ui/frontend-react && npm test
cd web.ui/frontend-react && npx tsc --noEmit
```
Expected: all PASS + clean.

```bash
git add web.ui/frontend-react/src/components/PinterestHistoryTabs.tsx web.ui/frontend-react/src/components/__tests__/PinterestHistoryTabs.test.tsx web.ui/frontend-react/src/pages/Pinterest.tsx
git commit -m "feat(pinterest): history tabs — recent / cadence / engagement"
```

---

## Task 15: Settings panel — read-only topup status

**Files:**
- Modify: `web.ui/frontend-react/src/components/PinterestSettings.tsx`
- Modify: `web.ui/frontend-react/src/api/pinterest.ts` (already has whatever status endpoint exists)

Add a small read-only block to the existing Settings panel showing the topup worker's last-ran timestamp + the target runway from env. No editable controls in v1.

- [ ] **Step 1: Append the block to `PinterestSettings.tsx`**

Read the existing file to see how it fetches and renders settings. Add a new section at the bottom of the panel:

```tsx
<section style={{ marginTop: 16, padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 4 }}>
  <h3 style={{ margin: '0 0 8px' }}>Auto-generate fresh pins</h3>
  <dl style={{ margin: 0, display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '4px 12px' }}>
    <dt>Target runway:</dt>
    <dd style={{ margin: 0 }}>{settings?.topup_days_runway ?? '—'} days</dd>
    <dt>Last run:</dt>
    <dd style={{ margin: 0 }}>{settings?.topup_last_run ?? '—'}</dd>
    <dt>Next run:</dt>
    <dd style={{ margin: 0 }}>{settings?.topup_next_run ?? '—'}</dd>
  </dl>
  <p style={{ marginTop: 8, fontSize: '0.85rem', color: 'var(--muted)' }}>
    To change runway: edit <code>PINTEREST_TOPUP_DAYS_RUNWAY</code> in <code>&lt;repo-root&gt;/.env.local</code> and restart the backend.
  </p>
</section>
```

- [ ] **Step 2: Extend the status endpoint to include these fields**

In `web.ui/backend/pinterest/routes.js`, find the existing `GET /status` handler. Extend the JSON response with:

```js
{
  // ... existing fields ...
  topup_days_runway: Number(process.env.PINTEREST_TOPUP_DAYS_RUNWAY ?? 30),
  topup_last_run: getAllStatuses()['pinterest.topup']?.last_success_at ?? null,
  topup_next_run: (() => {
    const last = getAllStatuses()['pinterest.topup']?.last_success_at;
    if (!last) return null;
    return new Date(new Date(last).getTime() + 6 * 60 * 60 * 1000).toISOString();
  })(),
}
```

(Add `getAllStatuses` import if not already present.)

- [ ] **Step 3: Update the frontend API type**

In `web.ui/frontend-react/src/api/pinterest.ts`, the existing settings type gets three new optional fields:

```ts
topup_days_runway?: number;
topup_last_run?: string | null;
topup_next_run?: string | null;
```

- [ ] **Step 4: Run + commit**

```
cd web.ui/frontend-react && npm test
cd web.ui/frontend-react && npx tsc --noEmit
cd web.ui/backend && npm test
```
Expected: all PASS.

```bash
git add web.ui/frontend-react/src/components/PinterestSettings.tsx web.ui/frontend-react/src/api/pinterest.ts web.ui/backend/pinterest/routes.js
git commit -m "feat(pinterest): settings panel shows topup runway + last/next run"
```

---

## Self-Review

**Spec coverage:**
- §1 topup worker (`runOnce`, gating, uniqueness hash, parameter remix) → Tasks 2, 3.
- §1 settings UI block → Task 15.
- §2 calendar grid (week view) → Tasks 7, 9, 10, 11.
- §2 month view → Task 11 (ships as week fallback; documented as v2 follow-up).
- §2 list view (existing table preserved) → Task 11.
- §2 status visuals on chips → Task 9.
- §3 engagement worker + 401 self-disable → Task 4.
- §3 schema migration → Task 1.
- §3 `analytics.js` cadence + engagement → Task 6.
- §3 routes → Task 6.
- §3 cadence chart → Task 12.
- §3 engagement table → Task 13.
- §3 history tabs → Task 14.

No gaps.

**Placeholder scan:** no TBD/TODO. Every step has actual code or actual commands.

**Type consistency:**
- `IngestedBook`/`IngestPreview` from prior KDP work are independent — no overlap. ✓
- `PinterestQueueRow` referenced in the new components needs a `book_slug` field. The existing type may not have it yet; if not, the API client extension in Task 8 or a small earlier modification adds it. Check `web.ui/frontend-react/src/api/pinterest.ts` and add `book_slug: string | null` to the existing `PinterestQueueRow` interface as part of Task 8 if missing.
- Worker names — `pinterest.topup` and `pinterest.engagement` — consistent across Tasks 2, 3, 4, 5, 15. ✓
- `CadenceResponse`, `EngagementResponse` shapes consistent between backend `analytics.js` (Task 6), API client (Task 8), and components (Tasks 12, 13, 14). ✓
- Env vars consistent: `PINTEREST_TOPUP_DAYS_RUNWAY`, `PINTEREST_TOPUP_PER_DAY_PER_BOOK`, `ROOSTER_SKIP_PINTEREST_TOPUP`, `ROOSTER_SKIP_PINTEREST_ENGAGEMENT`, `PINTEREST_TARGET_PER_DAY`. ✓
