# KDP Bookshelf Scraper Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let Claude for Chrome scrape kdp.amazon.com/bookshelf and POST results to a new dashboard ingest endpoint that previews matches against the local catalog, then applies them on user confirmation, establishing the ASIN ↔ slug pairing the dashboard currently lacks.

**Architecture:** A new `web.ui/backend/kdp/ingest.js` module computes a preview by matching scraped books to existing dashboard rows (ASIN-first, normalized-title fallback). Previews live for 30 minutes in an in-memory `Map` (`preview_store.js`). Three new routes — `POST /ingest-bookshelf`, `GET /ingest-bookshelf/pending`, `POST /ingest-bookshelf/commit` — are mounted into the existing `createKdpRouter` factory. On the frontend, a `<KdpPendingSyncBanner />` polls `/pending` on mount; when a preview exists, opening `<KdpIngestReviewModal />` lets the user resolve ambiguity, opt into orphan creation, and POST the confirmed mapping to `/commit`. One migration adds two columns (`kdp_status_raw`, `last_scraped_at`); no other schema changes.

**Tech Stack:** Express + better-sqlite3 + vitest + supertest (backend); React 19 + Vite + TypeScript + vitest + React Testing Library + user-event (frontend).

**Spec:** [`docs/superpowers/specs/2026-05-27-kdp-bookshelf-scraper-design.md`](../specs/2026-05-27-kdp-bookshelf-scraper-design.md)

---

## File Structure

**Created (backend):**
- `web.ui/backend/migrations/0004_kdp_ingest.sql` — `ALTER TABLE` for two new columns.
- `web.ui/backend/kdp/status_map.js` — `kdpToDashboardStatus(raw)`.
- `web.ui/backend/kdp/preview_store.js` — TTL-keyed in-memory preview map.
- `web.ui/backend/kdp/ingest.js` — `computeIngestPreview()` + `applyIngestCommit()`.
- `web.ui/backend/__tests__/kdp/status_map.test.js`
- `web.ui/backend/__tests__/kdp/preview_store.test.js`
- `web.ui/backend/__tests__/kdp/ingest.test.js`

**Modified (backend):**
- `web.ui/backend/kdp/routes.js` — three new routes wired through the existing `createKdpRouter(opts)` factory.
- `web.ui/backend/__tests__/kdp/routes.test.js` — five new route-level cases.

**Created (frontend):**
- `web.ui/frontend-react/src/components/KdpPendingSyncBanner.tsx`
- `web.ui/frontend-react/src/components/KdpIngestReviewModal.tsx`
- `web.ui/frontend-react/src/components/__tests__/KdpPendingSyncBanner.test.tsx`
- `web.ui/frontend-react/src/components/__tests__/KdpIngestReviewModal.test.tsx`

**Modified (frontend):**
- `web.ui/frontend-react/src/api/kdp.ts` — add `IngestedBook`, `IngestPreview`, `getPendingIngest()`, `commitIngest()`.
- `web.ui/frontend-react/src/pages/KdpCatalog.tsx` — mount the banner.
- `web.ui/frontend-react/src/__tests__/KdpCatalog.test.tsx` — extend to mock `/api/kdp/ingest-bookshelf/pending`.

**Created (docs):**
- `docs/kdp-bookshelf-scrape.md` — the Claude-for-Chrome prompt + schema + workflow.

---

## Task 1: Migration 0004 — add `kdp_status_raw` and `last_scraped_at`

**Files:**
- Create: `web.ui/backend/migrations/0004_kdp_ingest.sql`

- [ ] **Step 1: Write the migration file**

Create `web.ui/backend/migrations/0004_kdp_ingest.sql`:

```sql
-- Migration 0004 — columns for the KDP bookshelf ingest pipeline.
-- Spec: docs/superpowers/specs/2026-05-27-kdp-bookshelf-scraper-design.md §2

ALTER TABLE kdp_books ADD COLUMN kdp_status_raw TEXT;
ALTER TABLE kdp_books ADD COLUMN last_scraped_at TEXT;
```

- [ ] **Step 2: Verify the migration applies cleanly**

Run: `cd web.ui/backend && npm test`
Expected: all 370+ existing backend tests still pass — `openDb()` applies the new migration on its first call inside each test, and SQLite's `ALTER TABLE ADD COLUMN` is idempotent at the row level (new columns default to `NULL`).

Then verify the live DB also picked it up:

```
sqlite3 data/dashboard.db ".schema kdp_books" | grep -E "kdp_status_raw|last_scraped_at"
```
Expected output:
```
  kdp_status_raw TEXT,
  last_scraped_at TEXT
```

(If the live DB doesn't have it yet, simply restart the backend — `openDb()` runs migrations on boot.)

- [ ] **Step 3: Commit**

```bash
git add web.ui/backend/migrations/0004_kdp_ingest.sql
git commit -m "feat(kdp): migration 0004 — kdp_status_raw + last_scraped_at"
```

---

## Task 2: `status_map.js` + tests

**Files:**
- Create: `web.ui/backend/kdp/status_map.js`
- Test: `web.ui/backend/__tests__/kdp/status_map.test.js`

Pure function. No I/O, no state. Maps the verbatim KDP status string to the dashboard's normalized enum.

- [ ] **Step 1: Write the failing test**

Create `web.ui/backend/__tests__/kdp/status_map.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { kdpToDashboardStatus } from '../../kdp/status_map.js';

describe('kdpToDashboardStatus', () => {
  it('maps "Live" to published', () => {
    expect(kdpToDashboardStatus('Live')).toEqual({
      status: 'published',
      mappedFrom: 'Live',
    });
  });

  it('maps "In Review" to in_review', () => {
    expect(kdpToDashboardStatus('In Review')).toEqual({
      status: 'in_review',
      mappedFrom: 'In Review',
    });
  });

  it('maps "Draft" to built', () => {
    expect(kdpToDashboardStatus('Draft')).toEqual({
      status: 'built',
      mappedFrom: 'Draft',
    });
  });

  it('maps "Blocked" to archived', () => {
    expect(kdpToDashboardStatus('Blocked')).toEqual({
      status: 'archived',
      mappedFrom: 'Blocked',
    });
  });

  it('maps "Unpublished" to archived', () => {
    expect(kdpToDashboardStatus('Unpublished')).toEqual({
      status: 'archived',
      mappedFrom: 'Unpublished',
    });
  });

  it('is case-insensitive on the input label', () => {
    expect(kdpToDashboardStatus('LIVE')).toEqual({
      status: 'published',
      mappedFrom: 'LIVE',
    });
    expect(kdpToDashboardStatus('in review')).toEqual({
      status: 'in_review',
      mappedFrom: 'in review',
    });
  });

  it('returns {ambiguous:true} for unknown labels', () => {
    expect(kdpToDashboardStatus('Pending Review')).toEqual({ ambiguous: true });
    expect(kdpToDashboardStatus('')).toEqual({ ambiguous: true });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web.ui/backend && npm test -- --run __tests__/kdp/status_map.test.js`
Expected: FAIL — `Cannot find module '../../kdp/status_map.js'`.

- [ ] **Step 3: Implement the function**

Create `web.ui/backend/kdp/status_map.js`:

```js
/**
 * Map the verbatim KDP status label (as it appears on the bookshelf)
 * to the dashboard's normalized `kdp_books.status` enum.
 *
 * @module kdp/status_map
 */

/** @typedef {'built'|'in_review'|'published'|'archived'} DashboardStatus */

const MAP = new Map([
  ['live', 'published'],
  ['in review', 'in_review'],
  ['draft', 'built'],
  ['blocked', 'archived'],
  ['unpublished', 'archived'],
]);

/**
 * @param {string} raw  verbatim label from the KDP bookshelf
 * @returns {{status: DashboardStatus, mappedFrom: string} | {ambiguous: true}}
 */
export function kdpToDashboardStatus(raw) {
  const status = MAP.get(String(raw ?? '').toLowerCase().trim());
  if (!status) return { ambiguous: true };
  return { status, mappedFrom: raw };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd web.ui/backend && npm test -- --run __tests__/kdp/status_map.test.js`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add web.ui/backend/kdp/status_map.js web.ui/backend/__tests__/kdp/status_map.test.js
git commit -m "feat(kdp): kdpToDashboardStatus mapping helper"
```

---

## Task 3: `preview_store.js` + tests

**Files:**
- Create: `web.ui/backend/kdp/preview_store.js`
- Test: `web.ui/backend/__tests__/kdp/preview_store.test.js`

In-memory Map with 30-minute TTL. No persistence. Exposes `put`, `get`, `getLatest`, `delete`, `_resetForTests`.

- [ ] **Step 1: Write the failing test**

Create `web.ui/backend/__tests__/kdp/preview_store.test.js`:

```js
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  putPreview,
  getPreview,
  getLatestPreview,
  deletePreview,
  _resetForTests,
} from '../../kdp/preview_store.js';

describe('preview_store', () => {
  beforeEach(() => {
    _resetForTests();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('stores and retrieves a preview by id', () => {
    const preview = { preview_id: 'a', created_at: new Date().toISOString() };
    putPreview(preview);
    expect(getPreview('a')).toEqual(preview);
  });

  it('returns null for unknown id', () => {
    expect(getPreview('nope')).toBeNull();
  });

  it('getLatest returns the most recently put preview', () => {
    putPreview({ preview_id: 'a', created_at: '2026-05-27T10:00:00Z' });
    putPreview({ preview_id: 'b', created_at: '2026-05-27T11:00:00Z' });
    expect(getLatestPreview()?.preview_id).toBe('b');
  });

  it('getLatest returns null when the store is empty', () => {
    expect(getLatestPreview()).toBeNull();
  });

  it('delete removes a preview', () => {
    putPreview({ preview_id: 'a', created_at: new Date().toISOString() });
    deletePreview('a');
    expect(getPreview('a')).toBeNull();
  });

  it('expires entries after 30 minutes', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-27T10:00:00Z'));
    putPreview({ preview_id: 'a', created_at: new Date().toISOString() });
    vi.setSystemTime(new Date('2026-05-27T10:29:59Z'));
    expect(getPreview('a')).not.toBeNull();
    vi.setSystemTime(new Date('2026-05-27T10:30:01Z'));
    expect(getPreview('a')).toBeNull();
    expect(getLatestPreview()).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web.ui/backend && npm test -- --run __tests__/kdp/preview_store.test.js`
Expected: FAIL — `Cannot find module '../../kdp/preview_store.js'`.

- [ ] **Step 3: Implement the store**

Create `web.ui/backend/kdp/preview_store.js`:

```js
/**
 * In-memory KDP ingest preview store.
 *
 * Entries expire 30 minutes after their `created_at` ISO timestamp.
 * Expiry is checked lazily on every read; there is no background timer.
 *
 * @module kdp/preview_store
 */

const TTL_MS = 30 * 60 * 1000;

/** @type {Map<string, {preview: object, putAt: number}>} */
const store = new Map();

/**
 * @param {{preview_id: string, created_at: string}} preview
 */
export function putPreview(preview) {
  store.set(preview.preview_id, { preview, putAt: Date.now() });
}

/**
 * @param {string} previewId
 * @returns {object | null}
 */
export function getPreview(previewId) {
  const entry = store.get(previewId);
  if (!entry) return null;
  if (Date.now() - entry.putAt >= TTL_MS) {
    store.delete(previewId);
    return null;
  }
  return entry.preview;
}

/**
 * Returns the most-recently-put non-expired preview, or null when none.
 * @returns {object | null}
 */
export function getLatestPreview() {
  let latestId = null;
  let latestPutAt = -1;
  const now = Date.now();
  for (const [id, entry] of store.entries()) {
    if (now - entry.putAt >= TTL_MS) {
      store.delete(id);
      continue;
    }
    if (entry.putAt > latestPutAt) {
      latestPutAt = entry.putAt;
      latestId = id;
    }
  }
  return latestId ? store.get(latestId).preview : null;
}

/**
 * @param {string} previewId
 */
export function deletePreview(previewId) {
  store.delete(previewId);
}

/** Test helper — clears the store. */
export function _resetForTests() {
  store.clear();
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd web.ui/backend && npm test -- --run __tests__/kdp/preview_store.test.js`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add web.ui/backend/kdp/preview_store.js web.ui/backend/__tests__/kdp/preview_store.test.js
git commit -m "feat(kdp): preview_store with 30-minute TTL"
```

---

## Task 4: `ingest.js` — matching + commit logic

**Files:**
- Create: `web.ui/backend/kdp/ingest.js`
- Test: `web.ui/backend/__tests__/kdp/ingest.test.js`

The matching algorithm and commit transaction. This is the biggest single module in the plan.

- [ ] **Step 1: Write the failing test**

Create `web.ui/backend/__tests__/kdp/ingest.test.js`:

```js
import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import {
  computeIngestPreview,
  applyIngestCommit,
  _normalizeTitle,
} from '../../kdp/ingest.js';

function freshDb() {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE kdp_books (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      slug            TEXT NOT NULL UNIQUE,
      title           TEXT NOT NULL,
      subtitle        TEXT,
      asin            TEXT,
      status          TEXT NOT NULL,
      release_date    TEXT,
      listing_url     TEXT,
      page_count      INTEGER,
      trim_size       TEXT,
      price_usd       REAL,
      blurb           TEXT,
      cover_path      TEXT,
      output_dir      TEXT NOT NULL DEFAULT '',
      notes           TEXT,
      kdp_status_raw  TEXT,
      last_scraped_at TEXT,
      created_at      TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
  return db;
}

function seed(db, rows) {
  const insert = db.prepare(
    `INSERT INTO kdp_books (slug, title, asin, status, output_dir)
     VALUES (@slug, @title, @asin, @status, '')`,
  );
  for (const r of rows) insert.run({ asin: null, status: 'built', ...r });
}

describe('_normalizeTitle', () => {
  it('lowercases and trims', () => {
    expect(_normalizeTitle('  Hello World  ')).toBe('hello-world');
  });

  it('treats Vol. N, Vol N, Volume N identically', () => {
    expect(_normalizeTitle('Travel Sudoku, Vol. 1')).toBe(_normalizeTitle('Travel Sudoku, Volume 1'));
    expect(_normalizeTitle('Travel Sudoku, Vol 1')).toBe(_normalizeTitle('Travel Sudoku, Vol. 1'));
  });

  it('strips subtitle after the first colon', () => {
    expect(_normalizeTitle('Travel Sudoku: 200 Easy Puzzles'))
      .toBe(_normalizeTitle('Travel Sudoku: 100 Hard Puzzles'));
  });

  it('collapses whitespace and punctuation', () => {
    expect(_normalizeTitle('Travel  Sudoku!!  ')).toBe('travel-sudoku');
  });
});

describe('computeIngestPreview', () => {
  /** @type {import('better-sqlite3').Database} */
  let db;
  beforeEach(() => {
    db = freshDb();
  });

  it('MATCHED_BY_ASIN when an existing book has the same ASIN', () => {
    seed(db, [{ slug: 'travel-sudoku-v1', title: 'Travel Sudoku', asin: 'B0CXXXXXXX' }]);
    const preview = computeIngestPreview({
      db,
      scraped: [
        { asin: 'B0CXXXXXXX', kdp_title: 'Different Title', kdp_status: 'Live', format: 'Paperback' },
      ],
    });
    expect(preview.matches).toHaveLength(1);
    expect(preview.matches[0].kind).toBe('MATCHED_BY_ASIN');
    expect(preview.matches[0].dashboard_slug).toBe('travel-sudoku-v1');
    expect(preview.matches[0].title_will_change).toBe(true);
    expect(preview.matches[0].new_dashboard_status).toBe('published');
    expect(preview.ambiguous).toHaveLength(0);
    expect(preview.orphans).toHaveLength(0);
  });

  it('MATCHED_BY_TITLE when no ASIN match but normalized title matches', () => {
    seed(db, [{ slug: 'travel-sudoku-v1', title: 'Travel Sudoku, Vol. 1: 200 Easy Puzzles' }]);
    const preview = computeIngestPreview({
      db,
      scraped: [
        { asin: 'B0CXXXXXXX', kdp_title: 'Travel Sudoku, Volume 1: Different Subtitle', kdp_status: 'Live' },
      ],
    });
    expect(preview.matches).toHaveLength(1);
    expect(preview.matches[0].kind).toBe('MATCHED_BY_TITLE');
    expect(preview.matches[0].dashboard_slug).toBe('travel-sudoku-v1');
  });

  it('AMBIGUOUS when two dashboard rows normalize to the same title', () => {
    seed(db, [
      { slug: 'travel-sudoku-v1', title: 'Travel Sudoku' },
      { slug: 'travel-sudoku-v2', title: 'Travel Sudoku' },
    ]);
    const preview = computeIngestPreview({
      db,
      scraped: [{ asin: 'B0CXXXXXXX', kdp_title: 'Travel Sudoku', kdp_status: 'Live' }],
    });
    expect(preview.matches).toHaveLength(0);
    expect(preview.ambiguous).toHaveLength(1);
    expect(preview.ambiguous[0].candidate_slugs.sort()).toEqual([
      'travel-sudoku-v1',
      'travel-sudoku-v2',
    ]);
  });

  it('ORPHAN when no candidates match', () => {
    seed(db, [{ slug: 'other', title: 'Something Else' }]);
    const preview = computeIngestPreview({
      db,
      scraped: [{ asin: 'B0CXXXXXXX', kdp_title: 'Brand New Book', kdp_status: 'Live' }],
    });
    expect(preview.matches).toHaveLength(0);
    expect(preview.orphans).toHaveLength(1);
    expect(preview.orphans[0].scraped.asin).toBe('B0CXXXXXXX');
  });

  it('missing_from_kdp lists dashboard rows not in the scrape', () => {
    seed(db, [
      { slug: 'a', title: 'Book A' },
      { slug: 'b', title: 'Book B' },
    ]);
    const preview = computeIngestPreview({
      db,
      scraped: [{ asin: 'B0CXXXXXXX', kdp_title: 'Book A', kdp_status: 'Live' }],
    });
    expect(preview.matches.map((m) => m.dashboard_slug)).toEqual(['a']);
    expect(preview.missing_from_kdp.map((m) => m.dashboard_slug)).toEqual(['b']);
  });

  it('status_ambiguous flag set when KDP status maps to unknown', () => {
    seed(db, [{ slug: 'a', title: 'Book A', asin: 'B0CAAAAAAA' }]);
    const preview = computeIngestPreview({
      db,
      scraped: [{ asin: 'B0CAAAAAAA', kdp_title: 'Book A', kdp_status: 'Pending Approval' }],
    });
    expect(preview.matches[0].status_ambiguous).toBe(true);
  });

  it('sets preview_id and created_at on the result', () => {
    seed(db, []);
    const preview = computeIngestPreview({ db, scraped: [] });
    expect(typeof preview.preview_id).toBe('string');
    expect(preview.preview_id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
    expect(typeof preview.created_at).toBe('string');
  });
});

describe('applyIngestCommit', () => {
  /** @type {import('better-sqlite3').Database} */
  let db;
  beforeEach(() => {
    db = freshDb();
  });

  it('applies MATCHED_BY_ASIN rows: updates asin, status, raw, title, last_scraped_at', () => {
    seed(db, [{ slug: 'travel-sudoku-v1', title: 'Old Title', asin: 'B0CXXXXXXX' }]);
    const preview = computeIngestPreview({
      db,
      scraped: [
        { asin: 'B0CXXXXXXX', kdp_title: 'New KDP Title', kdp_status: 'Live' },
      ],
    });
    const result = applyIngestCommit({
      db,
      preview,
      confirmedOrphans: [],
      ambiguousResolutions: {},
    });
    expect(result.applied).toBe(1);
    expect(result.created).toBe(0);
    expect(result.skipped).toBe(0);
    const row = db.prepare('SELECT * FROM kdp_books WHERE slug=?').get('travel-sudoku-v1');
    expect(row.title).toBe('New KDP Title');
    expect(row.asin).toBe('B0CXXXXXXX');
    expect(row.status).toBe('published');
    expect(row.kdp_status_raw).toBe('Live');
    expect(typeof row.last_scraped_at).toBe('string');
  });

  it('creates a new row only for ASINs listed in confirmedOrphans', () => {
    seed(db, []);
    const preview = computeIngestPreview({
      db,
      scraped: [
        { asin: 'B0CCONFIRMD', kdp_title: 'Confirmed Orphan', kdp_status: 'Live' },
        { asin: 'B0CSKIPPED1', kdp_title: 'Skipped Orphan', kdp_status: 'Live' },
      ],
    });
    const result = applyIngestCommit({
      db,
      preview,
      confirmedOrphans: ['B0CCONFIRMD'],
      ambiguousResolutions: {},
    });
    expect(result.applied).toBe(0);
    expect(result.created).toBe(1);
    expect(result.skipped).toBe(1);
    const created = db.prepare('SELECT * FROM kdp_books WHERE asin=?').get('B0CCONFIRMD');
    expect(created.title).toBe('Confirmed Orphan');
    expect(created.status).toBe('published');
    expect(created.slug).toBe('confirmed-orphan');
    const notCreated = db.prepare('SELECT * FROM kdp_books WHERE asin=?').get('B0CSKIPPED1');
    expect(notCreated).toBeUndefined();
  });

  it('ambiguous with non-null slug behaves like MATCHED_BY_TITLE', () => {
    seed(db, [
      { slug: 'travel-sudoku-v1', title: 'Travel Sudoku' },
      { slug: 'travel-sudoku-v2', title: 'Travel Sudoku' },
    ]);
    const preview = computeIngestPreview({
      db,
      scraped: [{ asin: 'B0CAAAAAAA', kdp_title: 'Travel Sudoku, Vol. 1', kdp_status: 'Live' }],
    });
    const result = applyIngestCommit({
      db,
      preview,
      confirmedOrphans: [],
      ambiguousResolutions: { B0CAAAAAAA: 'travel-sudoku-v1' },
    });
    expect(result.applied).toBe(1);
    expect(result.skipped).toBe(0);
    const row = db.prepare('SELECT * FROM kdp_books WHERE slug=?').get('travel-sudoku-v1');
    expect(row.asin).toBe('B0CAAAAAAA');
    expect(row.title).toBe('Travel Sudoku, Vol. 1');
  });

  it('ambiguous with null slug is skipped', () => {
    seed(db, [
      { slug: 'a', title: 'Travel Sudoku' },
      { slug: 'b', title: 'Travel Sudoku' },
    ]);
    const preview = computeIngestPreview({
      db,
      scraped: [{ asin: 'B0CAAAAAAA', kdp_title: 'Travel Sudoku', kdp_status: 'Live' }],
    });
    const result = applyIngestCommit({
      db,
      preview,
      confirmedOrphans: [],
      ambiguousResolutions: { B0CAAAAAAA: null },
    });
    expect(result.applied).toBe(0);
    expect(result.skipped).toBe(1);
  });

  it('surfaces a unique-constraint error in result.errors without aborting other rows', () => {
    seed(db, [
      { slug: 'good', title: 'Good Title', asin: 'B0CGOODGOOD' },
      { slug: 'orphan-clash', title: 'Orphan Clash', asin: 'B0CEXISTING' },
    ]);
    const preview = computeIngestPreview({
      db,
      scraped: [
        { asin: 'B0CGOODGOOD', kdp_title: 'Good Updated', kdp_status: 'Live' },
        { asin: 'B0CCLASH001', kdp_title: 'Orphan Clash', kdp_status: 'Live' }, // slugifies to same slug
      ],
    });
    const result = applyIngestCommit({
      db,
      preview,
      confirmedOrphans: ['B0CCLASH001'],
      ambiguousResolutions: {},
    });
    expect(result.applied).toBe(1);
    expect(result.errors.length).toBe(1);
    expect(result.errors[0]).toMatch(/UNIQUE|already exists/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web.ui/backend && npm test -- --run __tests__/kdp/ingest.test.js`
Expected: FAIL — `Cannot find module '../../kdp/ingest.js'`.

- [ ] **Step 3: Implement the module**

Create `web.ui/backend/kdp/ingest.js`:

```js
/**
 * KDP bookshelf ingest — match scraped books to dashboard rows, then commit.
 *
 * No HTTP layer here; the routes module wraps these functions.
 *
 * @module kdp/ingest
 */
import { randomUUID } from 'node:crypto';
import { kdpToDashboardStatus } from './status_map.js';

/**
 * @typedef {{asin: string, kdp_title: string, kdp_status: string, format?: string}} IngestedBook
 *
 * @typedef {Object} Preview
 * @property {string} preview_id
 * @property {string} created_at
 * @property {Match[]} matches
 * @property {Ambiguous[]} ambiguous
 * @property {Orphan[]} orphans
 * @property {{dashboard_slug: string, dashboard_title: string}[]} missing_from_kdp
 *
 * @typedef {Object} Match
 * @property {'MATCHED_BY_ASIN'|'MATCHED_BY_TITLE'} kind
 * @property {string} dashboard_slug
 * @property {string} dashboard_title_before
 * @property {IngestedBook} scraped
 * @property {string} new_dashboard_status
 * @property {boolean} title_will_change
 * @property {boolean} status_ambiguous
 *
 * @typedef {Object} Ambiguous
 * @property {IngestedBook} scraped
 * @property {string[]} candidate_slugs
 *
 * @typedef {Object} Orphan
 * @property {IngestedBook} scraped
 */

/**
 * Normalize a title for fuzzy matching:
 *  - lowercase
 *  - "Vol. N" / "Vol N" / "Volume N" → "vol-N"
 *  - drop everything after the first colon (subtitle)
 *  - replace non-alphanumeric runs with hyphens
 *  - trim leading/trailing hyphens
 *
 * Pure; exported under an underscore name for unit testing.
 *
 * @param {string} raw
 * @returns {string}
 */
export function _normalizeTitle(raw) {
  let s = String(raw ?? '').toLowerCase();
  const colonIdx = s.indexOf(':');
  if (colonIdx !== -1) s = s.slice(0, colonIdx);
  s = s.replace(/\b(vol\.?|volume)\s+(\d+)\b/g, 'vol-$2');
  s = s.replace(/[^a-z0-9]+/g, '-');
  s = s.replace(/^-+|-+$/g, '');
  return s;
}

/**
 * Slugify a KDP title for orphan-row creation. Same normalization as the
 * match-time normalizer but without the subtitle drop (we want the full
 * title in the slug for distinctness).
 *
 * @param {string} title
 * @returns {string}
 */
function _slugify(title) {
  return String(title ?? '')
    .toLowerCase()
    .replace(/\b(vol\.?|volume)\s+(\d+)\b/g, 'vol-$2')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * @param {{db: import('better-sqlite3').Database, scraped: IngestedBook[]}} args
 * @returns {Preview}
 */
export function computeIngestPreview({ db, scraped }) {
  const rows = db
    .prepare('SELECT slug, title, asin FROM kdp_books')
    .all();

  const byAsin = new Map();
  /** @type {Map<string, Array<{slug: string, title: string}>>} */
  const byNormalizedTitle = new Map();
  for (const r of rows) {
    if (r.asin) byAsin.set(r.asin, r);
    const norm = _normalizeTitle(r.title);
    const list = byNormalizedTitle.get(norm) ?? [];
    list.push({ slug: r.slug, title: r.title });
    byNormalizedTitle.set(norm, list);
  }

  /** @type {Match[]} */
  const matches = [];
  /** @type {Ambiguous[]} */
  const ambiguous = [];
  /** @type {Orphan[]} */
  const orphans = [];
  const matchedSlugs = new Set();

  for (const s of scraped) {
    const mapped = kdpToDashboardStatus(s.kdp_status);
    const statusAmbiguous = 'ambiguous' in mapped;
    const newStatus = statusAmbiguous ? null : mapped.status;

    const byAsinHit = byAsin.get(s.asin);
    if (byAsinHit) {
      matches.push({
        kind: 'MATCHED_BY_ASIN',
        dashboard_slug: byAsinHit.slug,
        dashboard_title_before: byAsinHit.title,
        scraped: s,
        new_dashboard_status: newStatus,
        title_will_change: byAsinHit.title !== s.kdp_title,
        status_ambiguous: statusAmbiguous,
      });
      matchedSlugs.add(byAsinHit.slug);
      continue;
    }

    const norm = _normalizeTitle(s.kdp_title);
    const candidates = byNormalizedTitle.get(norm) ?? [];
    if (candidates.length === 1) {
      matches.push({
        kind: 'MATCHED_BY_TITLE',
        dashboard_slug: candidates[0].slug,
        dashboard_title_before: candidates[0].title,
        scraped: s,
        new_dashboard_status: newStatus,
        title_will_change: candidates[0].title !== s.kdp_title,
        status_ambiguous: statusAmbiguous,
      });
      matchedSlugs.add(candidates[0].slug);
    } else if (candidates.length > 1) {
      ambiguous.push({
        scraped: s,
        candidate_slugs: candidates.map((c) => c.slug),
      });
    } else {
      orphans.push({ scraped: s });
    }
  }

  /** @type {{dashboard_slug: string, dashboard_title: string}[]} */
  const missing_from_kdp = [];
  for (const r of rows) {
    if (!matchedSlugs.has(r.slug)) {
      missing_from_kdp.push({ dashboard_slug: r.slug, dashboard_title: r.title });
    }
  }

  return {
    preview_id: randomUUID(),
    created_at: new Date().toISOString(),
    matches,
    ambiguous,
    orphans,
    missing_from_kdp,
  };
}

/**
 * Apply a preview commit. Updates matched rows, creates confirmed orphans,
 * applies ambiguous resolutions. Returns a summary; per-row errors are
 * captured in `errors` without aborting the rest.
 *
 * @param {{
 *   db: import('better-sqlite3').Database,
 *   preview: Preview,
 *   confirmedOrphans: string[],
 *   ambiguousResolutions: Record<string, string | null>,
 * }} args
 * @returns {{applied: number, created: number, skipped: number, errors: string[]}}
 */
export function applyIngestCommit({
  db,
  preview,
  confirmedOrphans,
  ambiguousResolutions,
}) {
  const now = new Date().toISOString();
  let applied = 0;
  let created = 0;
  let skipped = 0;
  /** @type {string[]} */
  const errors = [];

  const updateBySlug = db.prepare(
    `UPDATE kdp_books
        SET title=@title, asin=@asin, status=@status,
            kdp_status_raw=@kdp_status_raw, last_scraped_at=@last_scraped_at,
            updated_at=datetime('now')
      WHERE slug=@slug`,
  );

  const insertOrphan = db.prepare(
    `INSERT INTO kdp_books (slug, title, asin, status, kdp_status_raw, last_scraped_at, output_dir)
     VALUES (@slug, @title, @asin, @status, @kdp_status_raw, @last_scraped_at, '')`,
  );

  /**
   * Resolve a scraped book's dashboard status string. Returns null when
   * the KDP status is unmapped — caller skips that row.
   *
   * @param {string} kdpStatus
   * @returns {string | null}
   */
  function mappedStatus(kdpStatus) {
    const mapped = kdpToDashboardStatus(kdpStatus);
    if ('ambiguous' in mapped) return null;
    return mapped.status;
  }

  // Matches (ASIN + title).
  for (const m of preview.matches) {
    const status = mappedStatus(m.scraped.kdp_status);
    if (!status) {
      skipped += 1;
      continue;
    }
    try {
      updateBySlug.run({
        slug: m.dashboard_slug,
        title: m.scraped.kdp_title,
        asin: m.scraped.asin,
        status,
        kdp_status_raw: m.scraped.kdp_status,
        last_scraped_at: now,
      });
      applied += 1;
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
    }
  }

  // Ambiguous resolutions.
  for (const a of preview.ambiguous) {
    const slug = ambiguousResolutions[a.scraped.asin];
    if (!slug) {
      skipped += 1;
      continue;
    }
    const status = mappedStatus(a.scraped.kdp_status);
    if (!status) {
      skipped += 1;
      continue;
    }
    try {
      updateBySlug.run({
        slug,
        title: a.scraped.kdp_title,
        asin: a.scraped.asin,
        status,
        kdp_status_raw: a.scraped.kdp_status,
        last_scraped_at: now,
      });
      applied += 1;
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
    }
  }

  // Orphans (only confirmed ones).
  const confirmedSet = new Set(confirmedOrphans);
  for (const o of preview.orphans) {
    if (!confirmedSet.has(o.scraped.asin)) {
      skipped += 1;
      continue;
    }
    const status = mappedStatus(o.scraped.kdp_status);
    if (!status) {
      skipped += 1;
      continue;
    }
    try {
      insertOrphan.run({
        slug: _slugify(o.scraped.kdp_title),
        title: o.scraped.kdp_title,
        asin: o.scraped.asin,
        status,
        kdp_status_raw: o.scraped.kdp_status,
        last_scraped_at: now,
      });
      created += 1;
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
    }
  }

  return { applied, created, skipped, errors };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd web.ui/backend && npm test -- --run __tests__/kdp/ingest.test.js`
Expected: PASS (all describe blocks — 4 normalize, 7 preview, 5 commit = 16 tests).

- [ ] **Step 5: Commit**

```bash
git add web.ui/backend/kdp/ingest.js web.ui/backend/__tests__/kdp/ingest.test.js
git commit -m "feat(kdp): ingest preview + commit logic"
```

---

## Task 5: Three new routes wired into `createKdpRouter`

**Files:**
- Modify: `web.ui/backend/kdp/routes.js`
- Test: `web.ui/backend/__tests__/kdp/routes.test.js`

- [ ] **Step 1: Write the failing tests (append to routes.test.js)**

Append to `web.ui/backend/__tests__/kdp/routes.test.js` inside the same top-level test setup (it already has its own `app` builder). Add a new `describe` block at the end of the file, before any final closing braces:

```js
describe('Ingest routes', () => {
  it('POST /ingest-bookshelf returns a preview', async () => {
    // Seed a book that the scrape will match by title.
    const db = openDb();
    db.prepare(
      `INSERT INTO kdp_books (slug, title, status, output_dir)
       VALUES ('foo', 'Foo Book', 'built', ?)`,
    ).run(tmpRoot);

    const resp = await request(app)
      .post('/api/kdp/ingest-bookshelf')
      .send({
        books: [
          { asin: 'B0CFOOFOOFO', kdp_title: 'Foo Book', kdp_status: 'Live' },
        ],
      });

    expect(resp.status).toBe(200);
    expect(typeof resp.body.preview_id).toBe('string');
    expect(resp.body.matches).toHaveLength(1);
    expect(resp.body.matches[0].dashboard_slug).toBe('foo');
  });

  it('POST /ingest-bookshelf with invalid body returns 400', async () => {
    const resp = await request(app)
      .post('/api/kdp/ingest-bookshelf')
      .send({ books: [{ kdp_title: 'no asin' }] });
    expect(resp.status).toBe(400);
    expect(resp.body.error).toBeTruthy();
  });

  it('GET /ingest-bookshelf/pending returns null when no preview', async () => {
    const resp = await request(app).get('/api/kdp/ingest-bookshelf/pending');
    expect(resp.status).toBe(200);
    expect(resp.body).toEqual({ preview: null });
  });

  it('GET /ingest-bookshelf/pending returns the latest preview after a POST', async () => {
    await request(app)
      .post('/api/kdp/ingest-bookshelf')
      .send({
        books: [
          { asin: 'B0CFOOFOOFO', kdp_title: 'Foo Book', kdp_status: 'Live' },
        ],
      });
    const resp = await request(app).get('/api/kdp/ingest-bookshelf/pending');
    expect(resp.status).toBe(200);
    expect(resp.body.preview).not.toBeNull();
    expect(typeof resp.body.preview.preview_id).toBe('string');
  });

  it('POST /ingest-bookshelf/commit applies the preview and clears it', async () => {
    const db = openDb();
    db.prepare(
      `INSERT INTO kdp_books (slug, title, status, output_dir)
       VALUES ('foo', 'Foo Book', 'built', ?)`,
    ).run(tmpRoot);

    const previewResp = await request(app)
      .post('/api/kdp/ingest-bookshelf')
      .send({
        books: [
          { asin: 'B0CFOOFOOFO', kdp_title: 'Foo Book Updated', kdp_status: 'Live' },
        ],
      });
    const previewId = previewResp.body.preview_id;

    const commitResp = await request(app)
      .post('/api/kdp/ingest-bookshelf/commit')
      .send({
        preview_id: previewId,
        confirmed_orphans: [],
        ambiguous_resolutions: {},
      });
    expect(commitResp.status).toBe(200);
    expect(commitResp.body.applied).toBe(1);

    const row = db.prepare('SELECT * FROM kdp_books WHERE slug=?').get('foo');
    expect(row.title).toBe('Foo Book Updated');
    expect(row.asin).toBe('B0CFOOFOOFO');
    expect(row.status).toBe('published');

    // Preview consumed.
    const after = await request(app).get('/api/kdp/ingest-bookshelf/pending');
    expect(after.body).toEqual({ preview: null });
  });

  it('POST /ingest-bookshelf/commit returns 404 for unknown preview_id', async () => {
    const resp = await request(app)
      .post('/api/kdp/ingest-bookshelf/commit')
      .send({
        preview_id: '00000000-0000-0000-0000-000000000000',
        confirmed_orphans: [],
        ambiguous_resolutions: {},
      });
    expect(resp.status).toBe(404);
  });
});
```

Also, at the top of `routes.test.js`, add `_resetForTests as _resetPreviewStore` to the imports — and make sure `beforeEach` (or the existing setup) calls `_resetPreviewStore()` to keep the store clean across the new tests. Find the existing `beforeEach` block and append the reset call to it. If you can't find a clear single `beforeEach`, add a fresh one scoped to the `describe('Ingest routes', ...)` block:

```js
// add this at the very top of the new describe block, right under describe('Ingest routes', () => {
  beforeEach(() => {
    _resetPreviewStore();
  });
```

Top-of-file import change:

```js
import { _resetForTests as _resetPreviewStore } from '../../kdp/preview_store.js';
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd web.ui/backend && npm test -- --run __tests__/kdp/routes.test.js`
Expected: FAIL — `Cannot POST /api/kdp/ingest-bookshelf`, etc.

- [ ] **Step 3: Implement the three routes**

Edit `web.ui/backend/kdp/routes.js`. Add imports at the top, next to the existing `import { renderPreviewsForBook }` line:

```js
import { computeIngestPreview, applyIngestCommit } from './ingest.js';
import {
  putPreview,
  getPreview,
  getLatestPreview,
  deletePreview,
} from './preview_store.js';
```

Add a helper near the top of `createKdpRouter`'s body (after `const router = express.Router();`, before the first route):

```js
  /** Schema-validate one scraped book entry. */
  function validateBook(book, idx) {
    const errors = [];
    if (!book || typeof book !== 'object') {
      errors.push(`books[${idx}] must be an object`);
      return errors;
    }
    if (typeof book.asin !== 'string' || book.asin.trim() === '') {
      errors.push(`books[${idx}].asin must be a non-empty string`);
    }
    if (typeof book.kdp_title !== 'string' || book.kdp_title.trim() === '') {
      errors.push(`books[${idx}].kdp_title must be a non-empty string`);
    }
    if (typeof book.kdp_status !== 'string' || book.kdp_status.trim() === '') {
      errors.push(`books[${idx}].kdp_status must be a non-empty string`);
    }
    return errors;
  }
```

Add the three routes inside `createKdpRouter`, before `return router;`:

```js
  // ── Ingest: POST scraped bookshelf, return preview ──────────────────────
  router.post('/ingest-bookshelf', (req, res) => {
    const body = req.body ?? {};
    const books = Array.isArray(body.books) ? body.books : null;
    if (!books) {
      return res.status(400).json({ error: 'body.books must be an array' });
    }
    /** @type {string[]} */
    const allErrors = [];
    for (let i = 0; i < books.length; i++) {
      allErrors.push(...validateBook(books[i], i));
    }
    if (allErrors.length > 0) {
      return res.status(400).json({ error: 'validation_failed', details: allErrors });
    }
    const db = openDb();
    const preview = computeIngestPreview({ db, scraped: books });
    putPreview(preview);
    res.json(preview);
  });

  // ── Ingest: GET pending preview ─────────────────────────────────────────
  router.get('/ingest-bookshelf/pending', (_req, res) => {
    const preview = getLatestPreview();
    res.json({ preview });
  });

  // ── Ingest: POST commit ─────────────────────────────────────────────────
  router.post('/ingest-bookshelf/commit', (req, res) => {
    const body = req.body ?? {};
    const previewId = typeof body.preview_id === 'string' ? body.preview_id : null;
    if (!previewId) {
      return res.status(400).json({ error: 'preview_id required' });
    }
    const preview = getPreview(previewId);
    if (!preview) {
      return res.status(404).json({ error: 'preview not found or expired' });
    }
    const confirmedOrphans = Array.isArray(body.confirmed_orphans)
      ? body.confirmed_orphans
      : [];
    const ambiguousResolutions =
      body.ambiguous_resolutions && typeof body.ambiguous_resolutions === 'object'
        ? body.ambiguous_resolutions
        : {};
    const db = openDb();
    const result = applyIngestCommit({
      db,
      preview,
      confirmedOrphans,
      ambiguousResolutions,
    });
    deletePreview(previewId);
    recordEvent('kdp:ingest-applied', {
      preview_id: previewId,
      applied: result.applied,
      created: result.created,
      skipped: result.skipped,
      errors: result.errors.length,
    });
    res.json(result);
  });
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd web.ui/backend && npm test -- --run __tests__/kdp/routes.test.js`
Expected: PASS — original KDP route tests + 6 new ingest route tests.

Then run the full backend suite to confirm nothing else broke:

Run: `cd web.ui/backend && npm test`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add web.ui/backend/kdp/routes.js web.ui/backend/__tests__/kdp/routes.test.js
git commit -m "feat(kdp): ingest-bookshelf + pending + commit routes"
```

---

## Task 6: Frontend API client — types + two functions

**Files:**
- Modify: `web.ui/frontend-react/src/api/kdp.ts`

- [ ] **Step 1: Add the types and fetch wrappers**

Edit `web.ui/frontend-react/src/api/kdp.ts`. After the existing exports, before the file-final `export { ApiError };` (or the last export — the file's exact shape determines where, but append AFTER the existing book-detail/list helpers), insert:

```ts
export interface IngestedBook {
  asin: string;
  kdp_title: string;
  kdp_status: string;
  format?: string;
}

export interface IngestPreviewMatch {
  kind: 'MATCHED_BY_ASIN' | 'MATCHED_BY_TITLE';
  dashboard_slug: string;
  dashboard_title_before: string;
  scraped: IngestedBook;
  new_dashboard_status: string | null;
  title_will_change: boolean;
  status_ambiguous: boolean;
}

export interface IngestPreviewAmbiguous {
  scraped: IngestedBook;
  candidate_slugs: string[];
}

export interface IngestPreviewOrphan {
  scraped: IngestedBook;
}

export interface IngestPreviewMissing {
  dashboard_slug: string;
  dashboard_title: string;
}

export interface IngestPreview {
  preview_id: string;
  created_at: string;
  matches: IngestPreviewMatch[];
  ambiguous: IngestPreviewAmbiguous[];
  orphans: IngestPreviewOrphan[];
  missing_from_kdp: IngestPreviewMissing[];
}

export interface CommitResult {
  applied: number;
  created: number;
  skipped: number;
  errors: string[];
}

export async function getPendingIngest(): Promise<IngestPreview | null> {
  const r = await fetch('/api/kdp/ingest-bookshelf/pending');
  if (!r.ok) throw new ApiError(`getPendingIngest: ${r.status}`, r.status, null);
  const data = (await r.json()) as { preview: IngestPreview | null };
  return data.preview;
}

export async function commitIngest(args: {
  preview_id: string;
  confirmed_orphans: string[];
  ambiguous_resolutions: Record<string, string | null>;
}): Promise<CommitResult> {
  const r = await fetch('/api/kdp/ingest-bookshelf/commit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  });
  if (!r.ok) {
    let body: unknown = null;
    try { body = await r.json(); } catch { /* ignore */ }
    throw new ApiError(`commitIngest: ${r.status}`, r.status, body);
  }
  return (await r.json()) as CommitResult;
}
```

(If the file uses a local `throwForStatus` helper for other functions, use it instead of inlining the `ApiError` — match the existing style.)

- [ ] **Step 2: Type-check**

Run: `cd web.ui/frontend-react && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add web.ui/frontend-react/src/api/kdp.ts
git commit -m "feat(kdp): typed wrappers for ingest preview + commit"
```

---

## Task 7: `<KdpPendingSyncBanner />` + tests

**Files:**
- Create: `web.ui/frontend-react/src/components/KdpPendingSyncBanner.tsx`
- Test: `web.ui/frontend-react/src/components/__tests__/KdpPendingSyncBanner.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `web.ui/frontend-react/src/components/__tests__/KdpPendingSyncBanner.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import KdpPendingSyncBanner from '../KdpPendingSyncBanner';
import type { IngestPreview } from '../../api/kdp';

function previewWithCounts(matches: number, ambiguous: number, orphans: number): IngestPreview {
  return {
    preview_id: 'p1',
    created_at: new Date().toISOString(),
    matches: Array.from({ length: matches }, (_, i) => ({
      kind: 'MATCHED_BY_ASIN',
      dashboard_slug: `s${i}`,
      dashboard_title_before: 'T',
      scraped: { asin: 'B0CTESTTEST', kdp_title: 'T', kdp_status: 'Live' },
      new_dashboard_status: 'published',
      title_will_change: false,
      status_ambiguous: false,
    })),
    ambiguous: Array.from({ length: ambiguous }, () => ({
      scraped: { asin: 'B0CABCABCAB', kdp_title: 'T', kdp_status: 'Live' },
      candidate_slugs: ['a', 'b'],
    })),
    orphans: Array.from({ length: orphans }, () => ({
      scraped: { asin: 'B0CORPHANBC', kdp_title: 'T', kdp_status: 'Live' },
    })),
    missing_from_kdp: [],
  };
}

function mockJson(body: unknown, ok = true, status = 200) {
  return {
    ok,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

describe('KdpPendingSyncBanner', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });
  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('renders nothing when there is no pending preview', async () => {
    fetchSpy.mockResolvedValueOnce(mockJson({ preview: null }));
    const { container } = render(<KdpPendingSyncBanner onApplied={vi.fn()} />);
    await waitFor(() => expect(fetchSpy).toHaveBeenCalled());
    expect(container.firstChild).toBeNull();
  });

  it('renders counts and a Review button when a preview is pending', async () => {
    fetchSpy.mockResolvedValueOnce(mockJson({ preview: previewWithCounts(5, 2, 1) }));
    render(<KdpPendingSyncBanner onApplied={vi.fn()} />);
    expect(await screen.findByText(/Pending KDP sync/i)).toBeInTheDocument();
    expect(screen.getByText(/5 matched/i)).toBeInTheDocument();
    expect(screen.getByText(/2 ambiguous/i)).toBeInTheDocument();
    expect(screen.getByText(/1 orphan/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /review/i })).toBeEnabled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web.ui/frontend-react && npm test -- --run src/components/__tests__/KdpPendingSyncBanner.test.tsx`
Expected: FAIL — `Cannot find module '../KdpPendingSyncBanner'`.

- [ ] **Step 3: Implement the banner**

Create `web.ui/frontend-react/src/components/KdpPendingSyncBanner.tsx`:

```tsx
import { useCallback, useEffect, useState } from 'react';
import { getPendingIngest, type IngestPreview } from '../api/kdp';
import KdpIngestReviewModal from './KdpIngestReviewModal';

interface Props {
  /** Called after a successful commit so the parent can refetch the catalog. */
  onApplied: () => void;
}

export default function KdpPendingSyncBanner({ onApplied }: Props) {
  const [preview, setPreview] = useState<IngestPreview | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setPreview(await getPendingIngest());
    } catch {
      setPreview(null);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (!preview) return null;

  const matched = preview.matches.length;
  const ambiguous = preview.ambiguous.length;
  const orphans = preview.orphans.length;

  return (
    <>
      <div
        role="status"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '6px 10px',
          borderRadius: 4,
          marginBottom: '0.5rem',
          background: '#e0e7ff',
          color: '#1e3a8a',
        }}
      >
        <span>
          <strong>Pending KDP sync</strong> — {matched} matched, {ambiguous} ambiguous, {orphans} orphan{orphans === 1 ? '' : 's'}
        </span>
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          style={{ marginLeft: 'auto' }}
        >
          Review
        </button>
      </div>
      {modalOpen && (
        <KdpIngestReviewModal
          preview={preview}
          onClose={() => setModalOpen(false)}
          onApplied={() => {
            setModalOpen(false);
            setPreview(null);
            onApplied();
          }}
        />
      )}
    </>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd web.ui/frontend-react && npm test -- --run src/components/__tests__/KdpPendingSyncBanner.test.tsx`
Expected: FAIL — the banner imports `KdpIngestReviewModal` which we haven't built yet. That's intentional; Task 8 builds the modal and the import resolves then. Skip the banner test run until Task 8 lands.

Instead, do a type-check now:

Run: `cd web.ui/frontend-react && npx tsc --noEmit`
Expected: error — cannot find module `./KdpIngestReviewModal`. Continue to Task 8 — the type-check will pass after Task 8 creates the modal.

- [ ] **Step 5: Commit (do this after Task 8 too if you want a single combined commit; otherwise commit now)**

Defer the commit to after Task 8 — they form a single feature unit. Leave the banner uncommitted in the working tree.

---

## Task 8: `<KdpIngestReviewModal />` + tests

**Files:**
- Create: `web.ui/frontend-react/src/components/KdpIngestReviewModal.tsx`
- Test: `web.ui/frontend-react/src/components/__tests__/KdpIngestReviewModal.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `web.ui/frontend-react/src/components/__tests__/KdpIngestReviewModal.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import KdpIngestReviewModal from '../KdpIngestReviewModal';
import type { IngestPreview } from '../../api/kdp';

const samplePreview: IngestPreview = {
  preview_id: 'preview-uuid-1',
  created_at: '2026-05-27T10:00:00Z',
  matches: [
    {
      kind: 'MATCHED_BY_ASIN',
      dashboard_slug: 'foo',
      dashboard_title_before: 'Foo Old Title',
      scraped: { asin: 'B0CFOOFOOFO', kdp_title: 'Foo New Title', kdp_status: 'Live' },
      new_dashboard_status: 'published',
      title_will_change: true,
      status_ambiguous: false,
    },
  ],
  ambiguous: [
    {
      scraped: { asin: 'B0CAMBIGUOU', kdp_title: 'Ambig Book', kdp_status: 'Live' },
      candidate_slugs: ['cand-a', 'cand-b'],
    },
  ],
  orphans: [
    {
      scraped: { asin: 'B0CORPHANBC', kdp_title: 'Orphan Book', kdp_status: 'Live' },
    },
  ],
  missing_from_kdp: [
    { dashboard_slug: 'lost', dashboard_title: 'Lost Book' },
  ],
};

function mockJson(body: unknown, ok = true, status = 200) {
  return {
    ok,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

describe('KdpIngestReviewModal', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });
  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('renders the four section counts in the headings', () => {
    render(
      <KdpIngestReviewModal
        preview={samplePreview}
        onClose={vi.fn()}
        onApplied={vi.fn()}
      />,
    );
    expect(screen.getByText(/Matches \(1\)/)).toBeInTheDocument();
    expect(screen.getByText(/Ambiguous \(1\)/)).toBeInTheDocument();
    expect(screen.getByText(/Orphans \(1\)/)).toBeInTheDocument();
    expect(screen.getByText(/Missing from KDP \(1\)/)).toBeInTheDocument();
  });

  it('disables Apply until every ambiguous row has a selection', async () => {
    render(
      <KdpIngestReviewModal
        preview={samplePreview}
        onClose={vi.fn()}
        onApplied={vi.fn()}
      />,
    );
    const applyBtn = screen.getByRole('button', { name: /apply/i });
    expect(applyBtn).toBeDisabled();

    const select = screen.getByLabelText(/Ambig Book/i) as HTMLSelectElement;
    await userEvent.selectOptions(select, 'cand-a');
    expect(applyBtn).toBeEnabled();
  });

  it('toggling an orphan checkbox flips the commit body', async () => {
    fetchSpy.mockResolvedValueOnce(
      mockJson({ applied: 1, created: 1, skipped: 0, errors: [] }),
    );
    render(
      <KdpIngestReviewModal
        preview={samplePreview}
        onClose={vi.fn()}
        onApplied={vi.fn()}
      />,
    );
    // Resolve the ambiguous so Apply is enabled.
    await userEvent.selectOptions(screen.getByLabelText(/Ambig Book/i), 'cand-a');
    // Tick the orphan checkbox.
    await userEvent.click(screen.getByLabelText(/Orphan Book/i));
    await userEvent.click(screen.getByRole('button', { name: /apply/i }));

    const [, options] = fetchSpy.mock.calls[0];
    const body = JSON.parse((options as RequestInit).body as string);
    expect(body.preview_id).toBe('preview-uuid-1');
    expect(body.confirmed_orphans).toEqual(['B0CORPHANBC']);
    expect(body.ambiguous_resolutions).toEqual({ B0CAMBIGUOU: 'cand-a' });
  });

  it('calls onApplied on commit success', async () => {
    fetchSpy.mockResolvedValueOnce(
      mockJson({ applied: 1, created: 0, skipped: 0, errors: [] }),
    );
    const onApplied = vi.fn();
    render(
      <KdpIngestReviewModal
        preview={samplePreview}
        onClose={vi.fn()}
        onApplied={onApplied}
      />,
    );
    await userEvent.selectOptions(screen.getByLabelText(/Ambig Book/i), 'cand-a');
    await userEvent.click(screen.getByRole('button', { name: /apply/i }));
    await screen.findByText(/Applied 1/i); // success-summary line appears briefly before onApplied
    expect(onApplied).toHaveBeenCalled();
  });

  it('surfaces error inside the modal on commit failure', async () => {
    fetchSpy.mockResolvedValueOnce(mockJson({ error: 'boom' }, false, 500));
    render(
      <KdpIngestReviewModal
        preview={samplePreview}
        onClose={vi.fn()}
        onApplied={vi.fn()}
      />,
    );
    await userEvent.selectOptions(screen.getByLabelText(/Ambig Book/i), 'cand-a');
    await userEvent.click(screen.getByRole('button', { name: /apply/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/boom|500/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web.ui/frontend-react && npm test -- --run src/components/__tests__/KdpIngestReviewModal.test.tsx`
Expected: FAIL — `Cannot find module '../KdpIngestReviewModal'`.

- [ ] **Step 3: Implement the modal**

Create `web.ui/frontend-react/src/components/KdpIngestReviewModal.tsx`:

```tsx
import { useState } from 'react';
import { commitIngest, type IngestPreview } from '../api/kdp';

interface Props {
  preview: IngestPreview;
  onClose: () => void;
  onApplied: () => void;
}

const sectionStyle: React.CSSProperties = {
  marginBottom: '1rem',
  border: '1px solid var(--border)',
  borderRadius: 4,
  padding: '0.5rem 0.75rem',
};

export default function KdpIngestReviewModal({ preview, onClose, onApplied }: Props) {
  const [ambiguousResolutions, setAmbiguousResolutions] = useState<
    Record<string, string | null>
  >({});
  const [orphanChecks, setOrphanChecks] = useState<Record<string, boolean>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const allAmbiguousResolved = preview.ambiguous.every(
    (a) => ambiguousResolutions[a.scraped.asin] !== undefined,
  );

  async function handleApply() {
    setSubmitting(true);
    setError(null);
    try {
      const confirmed_orphans = Object.entries(orphanChecks)
        .filter(([, v]) => v)
        .map(([asin]) => asin);
      const result = await commitIngest({
        preview_id: preview.preview_id,
        confirmed_orphans,
        ambiguous_resolutions: ambiguousResolutions,
      });
      setSuccess(`Applied ${result.applied}, created ${result.created}, skipped ${result.skipped}`);
      onApplied();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-label="KDP ingest review"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.4)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
    >
      <div
        style={{
          background: 'var(--surface)',
          color: 'var(--fg)',
          maxWidth: 800,
          maxHeight: '85vh',
          overflowY: 'auto',
          padding: '1rem',
          borderRadius: 8,
        }}
      >
        <h2>KDP Sync Review</h2>

        <section style={sectionStyle}>
          <h3>Matches ({preview.matches.length})</h3>
          <ul>
            {preview.matches.map((m) => (
              <li key={m.dashboard_slug}>
                <strong>{m.dashboard_slug}</strong>: {m.dashboard_title_before} → {m.scraped.kdp_title}
                {' · '}ASIN {m.scraped.asin}
                {' · '}{m.scraped.kdp_status} → {m.new_dashboard_status}
                {m.title_will_change && <span style={{ color: '#b58105' }}> ●</span>}
                {m.status_ambiguous && <span style={{ color: '#b91c1c' }}> ●</span>}
              </li>
            ))}
          </ul>
        </section>

        <section style={sectionStyle}>
          <h3>Ambiguous ({preview.ambiguous.length})</h3>
          {preview.ambiguous.map((a) => (
            <div key={a.scraped.asin} style={{ marginBottom: '0.5rem' }}>
              <label>
                {a.scraped.kdp_title} (ASIN {a.scraped.asin}){': '}
                <select
                  aria-label={a.scraped.kdp_title}
                  value={ambiguousResolutions[a.scraped.asin] ?? ''}
                  onChange={(e) =>
                    setAmbiguousResolutions((prev) => ({
                      ...prev,
                      [a.scraped.asin]: e.target.value === '__skip__' ? null : e.target.value,
                    }))
                  }
                >
                  <option value="">— pick one —</option>
                  {a.candidate_slugs.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                  <option value="__skip__">— skip this —</option>
                </select>
              </label>
            </div>
          ))}
        </section>

        <section style={sectionStyle}>
          <h3>Orphans ({preview.orphans.length})</h3>
          {preview.orphans.map((o) => (
            <div key={o.scraped.asin}>
              <label>
                <input
                  type="checkbox"
                  checked={!!orphanChecks[o.scraped.asin]}
                  onChange={(e) =>
                    setOrphanChecks((prev) => ({
                      ...prev,
                      [o.scraped.asin]: e.target.checked,
                    }))
                  }
                />
                {' '}
                {o.scraped.kdp_title} (ASIN {o.scraped.asin})
              </label>
            </div>
          ))}
        </section>

        <section style={sectionStyle}>
          <h3>Missing from KDP ({preview.missing_from_kdp.length})</h3>
          <ul>
            {preview.missing_from_kdp.map((m) => (
              <li key={m.dashboard_slug}>{m.dashboard_slug} — {m.dashboard_title}</li>
            ))}
          </ul>
        </section>

        {error && (
          <p role="alert" style={{ color: '#b91c1c' }}>
            commitIngest: {error}
          </p>
        )}
        {success && <p role="status">{success}</p>}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" onClick={onClose} disabled={submitting}>
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleApply()}
            disabled={!allAmbiguousResolved || submitting}
          >
            {submitting ? 'Applying…' : 'Apply'}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd web.ui/frontend-react && npm test -- --run src/components/__tests__/KdpIngestReviewModal.test.tsx src/components/__tests__/KdpPendingSyncBanner.test.tsx`
Expected: PASS — all 5 modal tests + both banner tests.

- [ ] **Step 5: Type-check**

Run: `cd web.ui/frontend-react && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit (combined banner + modal)**

```bash
git add web.ui/frontend-react/src/components/KdpPendingSyncBanner.tsx \
        web.ui/frontend-react/src/components/KdpIngestReviewModal.tsx \
        web.ui/frontend-react/src/components/__tests__/KdpPendingSyncBanner.test.tsx \
        web.ui/frontend-react/src/components/__tests__/KdpIngestReviewModal.test.tsx
git commit -m "feat(kdp): pending-sync banner + ingest review modal"
```

---

## Task 9: Wire banner into `KdpCatalog`

**Files:**
- Modify: `web.ui/frontend-react/src/pages/KdpCatalog.tsx`
- Modify: `web.ui/frontend-react/src/__tests__/KdpCatalog.test.tsx`

- [ ] **Step 1: Extend the page test to expect the banner**

Edit `web.ui/frontend-react/src/__tests__/KdpCatalog.test.tsx`. Locate the existing `beforeEach` mock setup. If it's URL-routed (like the EtsyCatalog test we updated earlier in this session), add a branch for `/api/kdp/ingest-bookshelf/pending` that returns `{ preview: null }` by default. Otherwise, for each existing test that mounts the page, prepend a `.mockResolvedValueOnce(...)` for the banner's `getPendingIngest()` call.

Add one new test at the end of the existing describe block:

```ts
  it('renders the pending-sync banner when /pending returns a preview', async () => {
    // Override the default mock: pending endpoint returns a preview.
    fetchMock.mockImplementation(async (url: string) => {
      if (url === '/api/kdp/ingest-bookshelf/pending') {
        return {
          ok: true, status: 200,
          json: async () => ({
            preview: {
              preview_id: 'p1',
              created_at: new Date().toISOString(),
              matches: [], ambiguous: [], orphans: [], missing_from_kdp: [],
            },
          }),
          text: async () => '{}',
        } as unknown as Response;
      }
      if (url.startsWith('/api/kdp/books')) {
        return {
          ok: true, status: 200,
          json: async () => ({ books: [] }),
          text: async () => '{}',
        } as unknown as Response;
      }
      throw new Error(`Unexpected URL: ${url}`);
    });
    render(<MemoryRouter><KdpCatalog /></MemoryRouter>);
    expect(await screen.findByText(/Pending KDP sync/i)).toBeInTheDocument();
  });
```

(The exact `MemoryRouter` import + the way `KdpCatalog` is rendered should match the existing tests in the file — copy their pattern.)

- [ ] **Step 2: Modify `KdpCatalog.tsx`**

Edit `web.ui/frontend-react/src/pages/KdpCatalog.tsx`. Add this import near the other component imports:

```ts
import KdpPendingSyncBanner from '../components/KdpPendingSyncBanner';
```

Locate the JSX `return` in `KdpCatalog`. Mount the banner above the existing table, after the `<h1>`-style page header and before the table/filters. Pass `onApplied={() => reloadCatalog()}` (or whatever the existing catalog refresh callback is — find the one used by other refresh paths in the file). If no such helper exists, follow the EtsyCatalog precedent: pass a closure that re-runs the existing `useEffect` data fetch by bumping a state variable, e.g.:

```tsx
const [reloadKey, setReloadKey] = useState(0);
// ... existing useEffect [reloadKey] dependency to trigger refetch ...

<KdpPendingSyncBanner onApplied={() => setReloadKey((k) => k + 1)} />
```

(Match the page's existing refresh pattern — if there's already a `reload()` function or a state-bumping refresh trigger from earlier work, reuse it.)

- [ ] **Step 3: Run page tests + full frontend suite**

Run: `cd web.ui/frontend-react && npm test -- --run src/__tests__/KdpCatalog.test.tsx`
Expected: PASS, including the new banner test.

Then:

Run: `cd web.ui/frontend-react && npm test`
Expected: all tests PASS.

- [ ] **Step 4: Type-check**

Run: `cd web.ui/frontend-react && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add web.ui/frontend-react/src/pages/KdpCatalog.tsx web.ui/frontend-react/src/__tests__/KdpCatalog.test.tsx
git commit -m "feat(kdp): mount pending-sync banner on /kdp"
```

---

## Task 10: Documentation for the Claude-for-Chrome workflow

**Files:**
- Create: `docs/kdp-bookshelf-scrape.md`

- [ ] **Step 1: Write the documentation**

Create `docs/kdp-bookshelf-scrape.md`:

```markdown
# KDP Bookshelf Scrape via Claude for Chrome

This page tells you exactly what to ask Claude for Chrome when you want to
sync the dashboard's KDP catalog with the live state on
https://kdp.amazon.com/en_US/bookshelf.

## Pre-reqs

1. The dashboard backend is running locally on port 5000
   (`npm start` in `web.ui/backend`).
2. You are logged into KDP in your Chrome browser and have the bookshelf
   page open.
3. The Claude for Chrome extension is active on that tab.

## The prompt

Paste this into Claude for Chrome on the bookshelf tab:

> Scrape every book on this KDP bookshelf page. For each book, capture:
> - the ASIN (typically a `B0`-prefixed 10-character code visible in the link or row),
> - the verbatim title text exactly as KDP displays it,
> - the verbatim status label — one of "Live", "In Review", "Draft", "Blocked", or "Unpublished",
> - the format — one of "Paperback", "Kindle eBook", or "Hardcover".
>
> Then POST the result as JSON to http://localhost:5000/api/kdp/ingest-bookshelf with this shape:
> ```
> {
>   "books": [
>     {"asin": "B0CXXXXXXX", "kdp_title": "...", "kdp_status": "Live", "format": "Paperback"},
>     ...
>   ]
> }
> ```
>
> Report back the `preview_id` from the response so I can review the diff in the dashboard.

## What the dashboard does next

1. POST receives the books, computes a preview, and returns:
   ```
   {
     "preview_id": "uuid",
     "matches": [...],
     "ambiguous": [...],
     "orphans": [...],
     "missing_from_kdp": [...]
   }
   ```
2. Open the dashboard at http://localhost:3000/kdp. A blue "Pending KDP sync"
   banner appears above the catalog table.
3. Click **Review** to open the diff modal. Resolve any ambiguous rows
   (where two dashboard slugs share a normalized title), opt into creating
   dashboard entries for orphans (books on KDP that aren't in the dashboard
   yet), then click **Apply**.
4. Matched rows get their ASIN, KDP status, and title updated. Confirmed
   orphans become new `kdp_books` rows. Skipped rows are counted but not
   modified.

Previews expire after 30 minutes in memory; if the dashboard backend
restarts mid-review, just re-run the scrape.

## Why this exists

The dashboard's local `kdp_books` table has every book's local-build state
(title, page count, price, cover) but no link to the live KDP product. This
workflow uses your existing browser session against KDP (via Claude for
Chrome) as the data source — no KDP API key, no OAuth, no scraper
authentication of our own.

See [`docs/superpowers/specs/2026-05-27-kdp-bookshelf-scraper-design.md`](superpowers/specs/2026-05-27-kdp-bookshelf-scraper-design.md)
for the full design.
```

- [ ] **Step 2: Commit**

```bash
git add docs/kdp-bookshelf-scrape.md
git commit -m "docs(kdp): bookshelf scrape workflow via claude for chrome"
```

---

## Self-Review

**Spec coverage check** — every spec requirement maps to a task:

- §1 end-to-end flow → Tasks 5 (routes) + 7/8 (banner + modal) + 10 (docs).
- §1 payload contract `{books: [{asin, kdp_title, kdp_status, format}]}` → Task 5 (validation) + Task 10 (prompt).
- §2 migration `kdp_status_raw` + `last_scraped_at` → Task 1.
- §2 `kdpToDashboardStatus` mapping → Task 2.
- §2 matching algorithm (ASIN, normalized title, ambiguous, orphan, missing_from_kdp) → Task 4.
- §2 preview store with 30-min TTL → Task 3.
- §2 three routes (POST ingest, GET pending, POST commit) → Task 5.
- §2 commit semantics (title replacement, status mapping, ambiguous resolution, orphan creation, skipped counts) → Task 4 (logic) + Task 5 (route).
- §3 banner UX (counts in copy, Review button, mounts on /kdp) → Tasks 7 + 9.
- §3 modal UX (four sections, ambiguous gating, orphan checkboxes, Apply error inline) → Task 8.
- §3 docs file → Task 10.
- §3 frontend types (`IngestedBook`, `IngestPreview*`, `CommitResult`) → Task 6.

No gaps.

**Placeholder scan:** every step has actual code or actual commands. No "TBD" / "etc." / "similar to…" references.

**Type consistency:**
- `IngestedBook`, `IngestPreviewMatch`, `IngestPreviewAmbiguous`, `IngestPreviewOrphan`, `IngestPreviewMissing`, `IngestPreview`, `CommitResult` — same shape in backend JSDoc (Task 4) and frontend interfaces (Task 6). ✓
- `Match.kind` is `'MATCHED_BY_ASIN' | 'MATCHED_BY_TITLE'` everywhere it appears. ✓
- Commit body shape `{preview_id, confirmed_orphans, ambiguous_resolutions}` consistent between backend route (Task 5), modal (Task 8), API client (Task 6), and tests. ✓
- `applyIngestCommit` returns `{applied, created, skipped, errors}` — same in commit route (Task 5), modal success copy (Task 8), and frontend tests (Tasks 4/8). ✓
- `getPendingIngest()` returns `IngestPreview | null` — banner test mocks this shape (Task 7); modal accepts an `IngestPreview` directly via props (Task 8). ✓
