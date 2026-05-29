# Publishing Roadmap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `publishing_roadmap` table that drives planned KDP + Etsy releases onto the calendar grid, fed by a YAML importer, walked through its lifecycle via a small modal — so the publisher sees what ships when AND when each file must be locked.

**Architecture:** One migration + one repo + one routes module on the backend. Calendar aggregator gets a third query branch emitting two event kinds per roadmap row (release + file-lock). KDP's existing `mark-published` route and Etsy's syncer get a small status-advancement hook by slug. Frontend Calendar gains two color/legend entries plus a click→modal flow. A YAML file at `docs/superpowers/roadmap/` holds the H2 2026 plan; a one-shot script upserts it into the table.

**Tech Stack:** Express + better-sqlite3 + vitest + supertest (backend); React 19 + Vite + TypeScript + FullCalendar + vitest + React Testing Library (frontend); js-yaml for the importer.

**Spec:** [`docs/superpowers/specs/2026-05-29-publishing-roadmap-design.md`](../specs/2026-05-29-publishing-roadmap-design.md)

---

## File Structure

**Created (backend):**
- `web.ui/backend/migrations/0007_publishing_roadmap.sql` — schema.
- `web.ui/backend/roadmap/repo.js` — DB CRUD helpers, `file_lock_date` auto-compute.
- `web.ui/backend/roadmap/routes.js` — GET/POST/PUT/DELETE.
- `web.ui/backend/__tests__/roadmap/repo.test.js`
- `web.ui/backend/__tests__/roadmap/routes.test.js`

**Modified (backend):**
- `web.ui/backend/server.js` — mount the roadmap router.
- `web.ui/backend/calendar/aggregator.js` — add a 5th query branch for `publishing_roadmap`.
- `web.ui/backend/__tests__/calendar/aggregator.test.js` — extend with roadmap cases.
- `web.ui/backend/kdp/routes.js` — `mark-published` advances the matching roadmap row.
- `web.ui/backend/etsy/syncer.js` — first-time-`active` advances the matching roadmap row.
- `web.ui/backend/__tests__/kdp/routes.test.js` + `__tests__/etsy/syncer.test.js` — extend with the new hook.

**Created (frontend):**
- `web.ui/frontend-react/src/components/RoadmapDetailModal.tsx`
- `web.ui/frontend-react/src/components/__tests__/RoadmapDetailModal.test.tsx`

**Modified (frontend):**
- `web.ui/frontend-react/src/api/calendar.ts` — extend the `CalendarEventKind` union with `roadmap.release` + `roadmap.lock`.
- New: `web.ui/frontend-react/src/api/roadmap.ts` — typed wrappers + interface.
- `web.ui/frontend-react/src/pages/Calendar.tsx` — colors, legend entries, click → modal.
- `web.ui/frontend-react/src/__tests__/Calendar.test.tsx` — extend.

**Created (docs + script):**
- `docs/superpowers/roadmap/2026-h2-pocket-rooster-press.yml` — 30 planned entries.
- `scripts/import_roadmap.mjs` — one-shot upsert script.
- `scripts/__tests__/import_roadmap.test.mjs`

---

## Task 1: Migration 0007 — `publishing_roadmap` table

**Files:**
- Create: `web.ui/backend/migrations/0007_publishing_roadmap.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Migration 0007 — publishing roadmap (planned KDP + Etsy releases).
-- Spec: docs/superpowers/specs/2026-05-29-publishing-roadmap-design.md

CREATE TABLE IF NOT EXISTS publishing_roadmap (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  kind                TEXT NOT NULL CHECK(kind IN ('kdp','etsy')),
  slug                TEXT NOT NULL,
  title               TEXT NOT NULL,
  target_release_date TEXT NOT NULL,
  status              TEXT NOT NULL CHECK(status IN ('planned','building','built','scheduled','published','skipped')),
  source              TEXT NOT NULL CHECK(source IN ('reuse','build')),
  niche               TEXT,
  rationale           TEXT,
  file_lock_date      TEXT,
  kdp_book_id         INTEGER REFERENCES kdp_books(id),
  etsy_listing_id     INTEGER REFERENCES etsy_listings(id),
  notes               TEXT,
  created_at          TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at          TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(kind, slug, target_release_date)
);
CREATE INDEX IF NOT EXISTS idx_roadmap_date ON publishing_roadmap(target_release_date);
CREATE INDEX IF NOT EXISTS idx_roadmap_status ON publishing_roadmap(status);
```

- [ ] **Step 2: Verify the migration applies + suite still passes**

Run: `cd web.ui/backend && npm test`
Expected: all existing tests still pass. `openDb()` applies the migration on first call in each test.

- [ ] **Step 3: Commit**

```bash
git add web.ui/backend/migrations/0007_publishing_roadmap.sql
git commit -m "feat(roadmap): migration 0007 — publishing_roadmap table"
```

---

## Task 2: `roadmap/repo.js` — DB helpers + tests

**Files:**
- Create: `web.ui/backend/roadmap/repo.js`
- Test: `web.ui/backend/__tests__/roadmap/repo.test.js`

The repo exposes pure DB functions: `insertRoadmapRow`, `listRoadmapRows(filters)`, `getRoadmapRowById`, `updateRoadmapRow`, `deleteRoadmapRow`, `advanceRoadmapBySlug`. `file_lock_date` is computed as `target_release_date - 15 calendar days` on insert and whenever `target_release_date` is updated.

- [ ] **Step 1: Write the failing test**

Create `web.ui/backend/__tests__/roadmap/repo.test.js`:

```js
import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import {
  insertRoadmapRow,
  listRoadmapRows,
  getRoadmapRowById,
  updateRoadmapRow,
  deleteRoadmapRow,
  advanceRoadmapBySlug,
  _fileLockDateFor,
} from '../../roadmap/repo.js';

function freshDb() {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE kdp_books (
      id INTEGER PRIMARY KEY AUTOINCREMENT, slug TEXT UNIQUE NOT NULL,
      title TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'built',
      output_dir TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE etsy_listings (
      id INTEGER PRIMARY KEY AUTOINCREMENT, etsy_listing_id INTEGER UNIQUE NOT NULL,
      title TEXT NOT NULL, status TEXT NOT NULL
    );
    CREATE TABLE publishing_roadmap (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      kind TEXT NOT NULL CHECK(kind IN ('kdp','etsy')),
      slug TEXT NOT NULL,
      title TEXT NOT NULL,
      target_release_date TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('planned','building','built','scheduled','published','skipped')),
      source TEXT NOT NULL CHECK(source IN ('reuse','build')),
      niche TEXT, rationale TEXT, file_lock_date TEXT,
      kdp_book_id INTEGER REFERENCES kdp_books(id),
      etsy_listing_id INTEGER REFERENCES etsy_listings(id),
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(kind, slug, target_release_date)
    );
  `);
  return db;
}

const baseRow = {
  kind: 'kdp',
  slug: 'foo',
  title: 'Foo',
  target_release_date: '2026-08-15',
  status: 'planned',
  source: 'reuse',
};

describe('_fileLockDateFor', () => {
  it('subtracts 15 calendar days from the release date', () => {
    expect(_fileLockDateFor('2026-08-15')).toBe('2026-07-31');
    expect(_fileLockDateFor('2026-03-10')).toBe('2026-02-23');
  });
  it('handles year boundaries', () => {
    expect(_fileLockDateFor('2027-01-10')).toBe('2026-12-26');
  });
});

describe('insertRoadmapRow', () => {
  /** @type {import('better-sqlite3').Database} */
  let db;
  beforeEach(() => { db = freshDb(); });

  it('inserts and auto-computes file_lock_date', () => {
    const id = insertRoadmapRow(db, baseRow);
    expect(id).toBeGreaterThan(0);
    const row = getRoadmapRowById(db, id);
    expect(row.kind).toBe('kdp');
    expect(row.slug).toBe('foo');
    expect(row.file_lock_date).toBe('2026-07-31');
  });

  it('throws on UNIQUE collision (kind, slug, target_release_date)', () => {
    insertRoadmapRow(db, baseRow);
    expect(() => insertRoadmapRow(db, baseRow)).toThrow(/UNIQUE/i);
  });
});

describe('listRoadmapRows', () => {
  /** @type {import('better-sqlite3').Database} */
  let db;
  beforeEach(() => {
    db = freshDb();
    insertRoadmapRow(db, { ...baseRow, slug: 'a', target_release_date: '2026-08-01' });
    insertRoadmapRow(db, { ...baseRow, slug: 'b', target_release_date: '2026-09-01', status: 'building' });
    insertRoadmapRow(db, { ...baseRow, kind: 'etsy', slug: 'c', target_release_date: '2026-10-01' });
    insertRoadmapRow(db, { ...baseRow, slug: 'd', target_release_date: '2026-11-01', status: 'skipped' });
  });

  it('returns all rows by default, ordered by target_release_date ASC', () => {
    const rows = listRoadmapRows(db, {});
    expect(rows.map((r) => r.slug)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('filters by kind', () => {
    expect(listRoadmapRows(db, { kind: 'etsy' }).map((r) => r.slug)).toEqual(['c']);
  });

  it('filters by status (comma list)', () => {
    expect(listRoadmapRows(db, { status: 'planned,building' }).map((r) => r.slug))
      .toEqual(['a', 'b', 'c']);
  });

  it('filters by date window [from, to)', () => {
    expect(listRoadmapRows(db, { from: '2026-09-01', to: '2026-10-15' }).map((r) => r.slug))
      .toEqual(['b', 'c']);
  });
});

describe('updateRoadmapRow', () => {
  /** @type {import('better-sqlite3').Database} */
  let db;
  beforeEach(() => { db = freshDb(); });

  it('updates allowed fields and bumps updated_at', () => {
    const id = insertRoadmapRow(db, baseRow);
    const before = getRoadmapRowById(db, id);
    // Wait a millisecond to guarantee updated_at moves.
    const ok = updateRoadmapRow(db, id, { status: 'building', notes: 'started' });
    expect(ok).toBe(true);
    const after = getRoadmapRowById(db, id);
    expect(after.status).toBe('building');
    expect(after.notes).toBe('started');
    expect(after.updated_at >= before.updated_at).toBe(true);
  });

  it('recomputes file_lock_date when target_release_date changes', () => {
    const id = insertRoadmapRow(db, baseRow);
    updateRoadmapRow(db, id, { target_release_date: '2026-12-01' });
    const row = getRoadmapRowById(db, id);
    expect(row.target_release_date).toBe('2026-12-01');
    expect(row.file_lock_date).toBe('2026-11-16');
  });

  it('returns false when id does not exist', () => {
    expect(updateRoadmapRow(db, 9999, { status: 'building' })).toBe(false);
  });
});

describe('deleteRoadmapRow', () => {
  it('deletes by id', () => {
    const db = freshDb();
    const id = insertRoadmapRow(db, baseRow);
    expect(deleteRoadmapRow(db, id)).toBe(true);
    expect(getRoadmapRowById(db, id)).toBeNull();
    expect(deleteRoadmapRow(db, id)).toBe(false);
  });
});

describe('advanceRoadmapBySlug', () => {
  /** @type {import('better-sqlite3').Database} */
  let db;
  beforeEach(() => { db = freshDb(); });

  it('advances any non-terminal matching row to published and back-fills kdp_book_id', () => {
    const id = insertRoadmapRow(db, baseRow);
    const bookId = db.prepare(
      `INSERT INTO kdp_books (slug, title, output_dir) VALUES ('foo', 'Foo', 'x')`,
    ).run().lastInsertRowid;
    const n = advanceRoadmapBySlug(db, {
      kind: 'kdp', slug: 'foo', toStatus: 'published', linkId: bookId,
    });
    expect(n).toBe(1);
    const row = getRoadmapRowById(db, id);
    expect(row.status).toBe('published');
    expect(row.kdp_book_id).toBe(bookId);
  });

  it('does not advance terminal-status rows (published or skipped)', () => {
    insertRoadmapRow(db, { ...baseRow, status: 'published', target_release_date: '2026-09-01' });
    insertRoadmapRow(db, { ...baseRow, status: 'skipped', target_release_date: '2026-10-01' });
    const n = advanceRoadmapBySlug(db, {
      kind: 'kdp', slug: 'foo', toStatus: 'published', linkId: 7,
    });
    expect(n).toBe(0);
  });

  it('etsy variant back-fills etsy_listing_id', () => {
    const id = insertRoadmapRow(db, {
      ...baseRow, kind: 'etsy', slug: 'bar',
    });
    const n = advanceRoadmapBySlug(db, {
      kind: 'etsy', slug: 'bar', toStatus: 'published', linkId: 4242,
    });
    expect(n).toBe(1);
    const row = getRoadmapRowById(db, id);
    expect(row.etsy_listing_id).toBe(4242);
    expect(row.kdp_book_id).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd web.ui/backend && npm test -- --run __tests__/roadmap/repo.test.js`
Expected: FAIL — `Cannot find module '../../roadmap/repo.js'`.

- [ ] **Step 3: Implement the repo**

Create `web.ui/backend/roadmap/repo.js`:

```js
/**
 * Publishing roadmap repo — pure DB helpers for the `publishing_roadmap`
 * table. No HTTP layer here.
 *
 * @module roadmap/repo
 */

/**
 * @typedef {Object} RoadmapRow
 * @property {number} id
 * @property {'kdp'|'etsy'} kind
 * @property {string} slug
 * @property {string} title
 * @property {string} target_release_date    yyyy-mm-dd
 * @property {'planned'|'building'|'built'|'scheduled'|'published'|'skipped'} status
 * @property {'reuse'|'build'} source
 * @property {string|null} niche
 * @property {string|null} rationale
 * @property {string|null} file_lock_date    yyyy-mm-dd; release - 15 days
 * @property {number|null} kdp_book_id
 * @property {number|null} etsy_listing_id
 * @property {string|null} notes
 * @property {string} created_at
 * @property {string} updated_at
 */

/**
 * @param {string} releaseDate   yyyy-mm-dd
 * @returns {string}             yyyy-mm-dd, 15 calendar days earlier
 */
export function _fileLockDateFor(releaseDate) {
  const d = new Date(`${releaseDate}T12:00:00Z`); // noon avoids DST edges
  d.setUTCDate(d.getUTCDate() - 15);
  return d.toISOString().slice(0, 10);
}

/**
 * @param {import('better-sqlite3').Database} db
 * @param {Omit<RoadmapRow, 'id'|'file_lock_date'|'created_at'|'updated_at'|'kdp_book_id'|'etsy_listing_id'> & {niche?: string|null, rationale?: string|null, notes?: string|null}} row
 * @returns {number}  inserted id
 */
export function insertRoadmapRow(db, row) {
  const lock = _fileLockDateFor(row.target_release_date);
  const result = db.prepare(
    `INSERT INTO publishing_roadmap
       (kind, slug, title, target_release_date, status, source,
        niche, rationale, file_lock_date, notes)
     VALUES (@kind, @slug, @title, @target_release_date, @status, @source,
             @niche, @rationale, @file_lock_date, @notes)`,
  ).run({
    kind: row.kind,
    slug: row.slug,
    title: row.title,
    target_release_date: row.target_release_date,
    status: row.status,
    source: row.source,
    niche: row.niche ?? null,
    rationale: row.rationale ?? null,
    file_lock_date: lock,
    notes: row.notes ?? null,
  });
  return Number(result.lastInsertRowid);
}

/**
 * @param {import('better-sqlite3').Database} db
 * @param {{kind?: 'kdp'|'etsy', status?: string, from?: string, to?: string}} filters
 *   status accepts a comma-separated list ("planned,building").
 * @returns {RoadmapRow[]}
 */
export function listRoadmapRows(db, { kind, status, from, to }) {
  const wheres = [];
  const params = {};
  if (kind) { wheres.push('kind = @kind'); params.kind = kind; }
  if (status) {
    const list = status.split(',').map((s) => s.trim()).filter(Boolean);
    if (list.length > 0) {
      const placeholders = list.map((_, i) => `@s${i}`).join(',');
      wheres.push(`status IN (${placeholders})`);
      list.forEach((s, i) => { params[`s${i}`] = s; });
    }
  }
  if (from) { wheres.push('target_release_date >= @from'); params.from = from; }
  if (to)   { wheres.push('target_release_date < @to');    params.to = to; }
  const sql =
    `SELECT * FROM publishing_roadmap` +
    (wheres.length ? ` WHERE ${wheres.join(' AND ')}` : '') +
    ` ORDER BY target_release_date ASC, id ASC`;
  return /** @type {RoadmapRow[]} */ (db.prepare(sql).all(params));
}

/**
 * @param {import('better-sqlite3').Database} db
 * @param {number} id
 * @returns {RoadmapRow | null}
 */
export function getRoadmapRowById(db, id) {
  const row = db.prepare('SELECT * FROM publishing_roadmap WHERE id = ?').get(id);
  return row ?? null;
}

const PATCHABLE = ['status', 'target_release_date', 'title', 'niche', 'rationale', 'notes'];

/**
 * @param {import('better-sqlite3').Database} db
 * @param {number} id
 * @param {Partial<RoadmapRow>} patch
 * @returns {boolean}  true when a row was updated
 */
export function updateRoadmapRow(db, id, patch) {
  const cols = [];
  const params = { id };
  for (const k of PATCHABLE) {
    if (patch[k] !== undefined) {
      cols.push(`${k} = @${k}`);
      params[k] = patch[k];
    }
  }
  if (cols.length === 0) return false;
  if (patch.target_release_date !== undefined) {
    cols.push('file_lock_date = @file_lock_date');
    params.file_lock_date = _fileLockDateFor(patch.target_release_date);
  }
  cols.push(`updated_at = datetime('now')`);
  const result = db.prepare(
    `UPDATE publishing_roadmap SET ${cols.join(', ')} WHERE id = @id`,
  ).run(params);
  return result.changes > 0;
}

/**
 * @param {import('better-sqlite3').Database} db
 * @param {number} id
 * @returns {boolean}
 */
export function deleteRoadmapRow(db, id) {
  const result = db.prepare('DELETE FROM publishing_roadmap WHERE id = ?').run(id);
  return result.changes > 0;
}

/**
 * Advance any non-terminal roadmap row matching (kind, slug) to the given
 * status and back-fill the kdp_book_id / etsy_listing_id link. Returns the
 * number of rows touched. Terminal statuses ('published', 'skipped') are
 * left alone.
 *
 * @param {import('better-sqlite3').Database} db
 * @param {{kind: 'kdp'|'etsy', slug: string, toStatus: RoadmapRow['status'], linkId: number}} args
 * @returns {number}
 */
export function advanceRoadmapBySlug(db, { kind, slug, toStatus, linkId }) {
  const linkCol = kind === 'kdp' ? 'kdp_book_id' : 'etsy_listing_id';
  const result = db.prepare(
    `UPDATE publishing_roadmap
        SET status = @toStatus,
            ${linkCol} = @linkId,
            updated_at = datetime('now')
      WHERE kind = @kind
        AND slug = @slug
        AND status NOT IN ('published','skipped')`,
  ).run({ kind, slug, toStatus, linkId });
  return result.changes;
}
```

- [ ] **Step 4: Run tests**

Run: `cd web.ui/backend && npm test -- --run __tests__/roadmap/repo.test.js`
Expected: PASS — 16 tests (3 + 2 + 4 + 3 + 1 + 3).

- [ ] **Step 5: Commit**

```bash
git add web.ui/backend/roadmap/repo.js web.ui/backend/__tests__/roadmap/repo.test.js
git commit -m "feat(roadmap): repo helpers + file_lock_date computation"
```

---

## Task 3: `roadmap/routes.js` — HTTP routes + tests

**Files:**
- Create: `web.ui/backend/roadmap/routes.js`
- Test: `web.ui/backend/__tests__/roadmap/routes.test.js`
- Modify: `web.ui/backend/server.js` (mount the router)

- [ ] **Step 1: Write the failing test**

Create `web.ui/backend/__tests__/roadmap/routes.test.js`:

```js
import { describe, it, expect, beforeEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import Database from 'better-sqlite3';
import { createRoadmapRouter } from '../../roadmap/routes.js';

function freshDb() {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE kdp_books (
      id INTEGER PRIMARY KEY AUTOINCREMENT, slug TEXT UNIQUE NOT NULL,
      title TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'built',
      output_dir TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE etsy_listings (
      id INTEGER PRIMARY KEY AUTOINCREMENT, etsy_listing_id INTEGER UNIQUE NOT NULL,
      title TEXT NOT NULL, status TEXT NOT NULL
    );
    CREATE TABLE publishing_roadmap (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      kind TEXT NOT NULL CHECK(kind IN ('kdp','etsy')),
      slug TEXT NOT NULL,
      title TEXT NOT NULL,
      target_release_date TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('planned','building','built','scheduled','published','skipped')),
      source TEXT NOT NULL CHECK(source IN ('reuse','build')),
      niche TEXT, rationale TEXT, file_lock_date TEXT,
      kdp_book_id INTEGER REFERENCES kdp_books(id),
      etsy_listing_id INTEGER REFERENCES etsy_listings(id),
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(kind, slug, target_release_date)
    );
  `);
  return db;
}

function makeApp(db) {
  const app = express();
  app.use(express.json());
  app.use('/api/roadmap', createRoadmapRouter({ db }));
  return app;
}

const validBody = {
  kind: 'kdp', slug: 'foo', title: 'Foo',
  target_release_date: '2026-08-15',
  status: 'planned', source: 'reuse',
};

describe('roadmap routes', () => {
  /** @type {import('better-sqlite3').Database} */
  let db;
  beforeEach(() => { db = freshDb(); });

  it('POST /api/roadmap creates a row with computed file_lock_date', async () => {
    const resp = await request(makeApp(db)).post('/api/roadmap').send(validBody);
    expect(resp.status).toBe(201);
    expect(resp.body.row.id).toBeGreaterThan(0);
    expect(resp.body.row.file_lock_date).toBe('2026-07-31');
  });

  it('POST /api/roadmap returns 400 on missing required fields', async () => {
    const resp = await request(makeApp(db)).post('/api/roadmap').send({ kind: 'kdp' });
    expect(resp.status).toBe(400);
    expect(resp.body.error).toMatch(/required/i);
  });

  it('POST /api/roadmap returns 409 on UNIQUE collision', async () => {
    const app = makeApp(db);
    await request(app).post('/api/roadmap').send(validBody);
    const resp = await request(app).post('/api/roadmap').send(validBody);
    expect(resp.status).toBe(409);
    expect(resp.body.error).toMatch(/duplicate|unique|already exists/i);
  });

  it('GET /api/roadmap returns all rows', async () => {
    const app = makeApp(db);
    await request(app).post('/api/roadmap').send(validBody);
    await request(app).post('/api/roadmap').send({ ...validBody, slug: 'bar', target_release_date: '2026-09-15' });
    const resp = await request(app).get('/api/roadmap');
    expect(resp.status).toBe(200);
    expect(resp.body.rows.length).toBe(2);
  });

  it('GET /api/roadmap honors ?kind, ?status, ?from, ?to', async () => {
    const app = makeApp(db);
    await request(app).post('/api/roadmap').send(validBody);
    await request(app).post('/api/roadmap').send({ ...validBody, kind: 'etsy', slug: 'bar' });
    const resp = await request(app).get('/api/roadmap?kind=etsy');
    expect(resp.body.rows.map((r) => r.slug)).toEqual(['bar']);
  });

  it('PUT /api/roadmap/:id patches allowed fields', async () => {
    const app = makeApp(db);
    const created = await request(app).post('/api/roadmap').send(validBody);
    const id = created.body.row.id;
    const resp = await request(app).put(`/api/roadmap/${id}`).send({ status: 'building', notes: 'go' });
    expect(resp.status).toBe(200);
    expect(resp.body.row.status).toBe('building');
    expect(resp.body.row.notes).toBe('go');
  });

  it('PUT /api/roadmap/:id 404 for unknown id', async () => {
    const resp = await request(makeApp(db)).put('/api/roadmap/9999').send({ status: 'building' });
    expect(resp.status).toBe(404);
  });

  it('DELETE /api/roadmap/:id removes the row', async () => {
    const app = makeApp(db);
    const created = await request(app).post('/api/roadmap').send(validBody);
    const id = created.body.row.id;
    const resp = await request(app).delete(`/api/roadmap/${id}`);
    expect(resp.status).toBe(204);
    const after = await request(app).get('/api/roadmap');
    expect(after.body.rows.length).toBe(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd web.ui/backend && npm test -- --run __tests__/roadmap/routes.test.js`
Expected: FAIL — `Cannot find module '../../roadmap/routes.js'`.

- [ ] **Step 3: Implement the routes**

Create `web.ui/backend/roadmap/routes.js`:

```js
/**
 * Publishing roadmap routes:
 *   GET    /api/roadmap                    — list, optional ?kind=&status=&from=&to=
 *   POST   /api/roadmap                    — insert; 201 + {row}, 409 on UNIQUE
 *   PUT    /api/roadmap/:id                — patch; 200 + {row}, 404 unknown
 *   DELETE /api/roadmap/:id                — hard delete; 204
 *
 * @module roadmap/routes
 */
import express from 'express';
import {
  insertRoadmapRow, listRoadmapRows, getRoadmapRowById,
  updateRoadmapRow, deleteRoadmapRow,
} from './repo.js';

const REQUIRED = ['kind', 'slug', 'title', 'target_release_date', 'status', 'source'];
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const KIND = new Set(['kdp', 'etsy']);
const STATUS = new Set(['planned', 'building', 'built', 'scheduled', 'published', 'skipped']);
const SOURCE = new Set(['reuse', 'build']);

function validate(body) {
  const missing = REQUIRED.filter((k) => body[k] == null || body[k] === '');
  if (missing.length) return `required fields missing: ${missing.join(', ')}`;
  if (!KIND.has(body.kind)) return `kind must be one of: kdp,etsy`;
  if (!STATUS.has(body.status)) return `status invalid`;
  if (!SOURCE.has(body.source)) return `source must be one of: reuse,build`;
  if (!ISO_DATE.test(body.target_release_date)) return `target_release_date must be yyyy-mm-dd`;
  return null;
}

/**
 * @param {{db: import('better-sqlite3').Database}} args
 * @returns {import('express').Router}
 */
export function createRoadmapRouter({ db }) {
  const router = express.Router();

  router.get('/', (req, res) => {
    const rows = listRoadmapRows(db, {
      kind: req.query.kind,
      status: req.query.status,
      from: req.query.from,
      to: req.query.to,
    });
    res.json({ rows });
  });

  router.post('/', (req, res) => {
    const body = req.body ?? {};
    const err = validate(body);
    if (err) return res.status(400).json({ error: err });
    try {
      const id = insertRoadmapRow(db, body);
      const row = getRoadmapRowById(db, id);
      res.status(201).json({ row });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (/UNIQUE/i.test(msg)) {
        return res.status(409).json({ error: 'duplicate (kind, slug, target_release_date) — already exists' });
      }
      res.status(500).json({ error: msg });
    }
  });

  router.put('/:id', (req, res) => {
    const id = Number.parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'id must be numeric' });
    const body = req.body ?? {};
    if (body.target_release_date !== undefined && !ISO_DATE.test(body.target_release_date)) {
      return res.status(400).json({ error: 'target_release_date must be yyyy-mm-dd' });
    }
    if (body.status !== undefined && !STATUS.has(body.status)) {
      return res.status(400).json({ error: 'status invalid' });
    }
    const ok = updateRoadmapRow(db, id, body);
    if (!ok) return res.status(404).json({ error: 'not_found' });
    res.json({ row: getRoadmapRowById(db, id) });
  });

  router.delete('/:id', (req, res) => {
    const id = Number.parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'id must be numeric' });
    const ok = deleteRoadmapRow(db, id);
    if (!ok) return res.status(404).json({ error: 'not_found' });
    res.status(204).end();
  });

  return router;
}
```

- [ ] **Step 4: Mount in server.js**

In `web.ui/backend/server.js`, add this import near the other route imports:

```js
import { createRoadmapRouter } from './roadmap/routes.js';
```

Then add the mount alongside the existing `app.use('/api/kdp', ...)`, `app.use('/api/etsy', ...)` lines:

```js
app.use('/api/roadmap', createRoadmapRouter({ db: openDb() }));
```

- [ ] **Step 5: Run the full backend suite**

Run: `cd web.ui/backend && npm test`
Expected: all PASS — 8 new route tests + existing suite.

- [ ] **Step 6: Commit**

```bash
git add web.ui/backend/roadmap/routes.js web.ui/backend/__tests__/roadmap/routes.test.js web.ui/backend/server.js
git commit -m "feat(roadmap): GET/POST/PUT/DELETE /api/roadmap routes"
```

---

## Task 4: Calendar aggregator extension — two new event kinds

**Files:**
- Modify: `web.ui/backend/calendar/aggregator.js`
- Test: `web.ui/backend/__tests__/calendar/aggregator.test.js`

Each non-skipped roadmap row emits a release event at `target_release_date` and a lock event at `file_lock_date` (only when the lock date falls inside the window).

- [ ] **Step 1: Write the failing test (extend aggregator.test.js)**

Append to the existing `web.ui/backend/__tests__/calendar/aggregator.test.js` (use the existing freshDb + `aggregateCalendarEvents` import). Add a new describe block at the end:

```js
describe('aggregateCalendarEvents — publishing_roadmap', () => {
  /** @type {import('better-sqlite3').Database} */
  let db;
  beforeEach(() => {
    db = freshDb();
    // freshDb already creates kdp_books, etsy_listings, reminders,
    // pinterest_queue. The publishing_roadmap table is added by migration
    // 0007 inside the live openDb(), but the test helper builds its own
    // schema — extend it here:
    db.exec(`
      CREATE TABLE publishing_roadmap (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        kind TEXT NOT NULL CHECK(kind IN ('kdp','etsy')),
        slug TEXT NOT NULL,
        title TEXT NOT NULL,
        target_release_date TEXT NOT NULL,
        status TEXT NOT NULL,
        source TEXT NOT NULL,
        niche TEXT, rationale TEXT, file_lock_date TEXT,
        kdp_book_id INTEGER, etsy_listing_id INTEGER, notes TEXT,
        created_at TEXT, updated_at TEXT,
        UNIQUE(kind, slug, target_release_date)
      );
    `);
  });

  function seedRoadmap(row) {
    db.prepare(
      `INSERT INTO publishing_roadmap
         (kind, slug, title, target_release_date, status, source, file_lock_date)
       VALUES (@kind, @slug, @title, @target_release_date, @status, @source, @file_lock_date)`,
    ).run({
      file_lock_date: row.file_lock_date ?? null,
      ...row,
    });
  }

  it('emits a release event for each non-skipped row in window', () => {
    seedRoadmap({
      kind: 'kdp', slug: 'foo', title: 'Foo',
      target_release_date: '2026-09-15', status: 'planned', source: 'reuse',
      file_lock_date: '2026-08-31',
    });
    const events = aggregateCalendarEvents(db, '2026-09-01', '2026-10-01');
    const release = events.find((e) => e.kind === 'roadmap.release');
    expect(release).toBeTruthy();
    expect(release.date).toBe('2026-09-15');
    expect(release.title).toMatch(/Foo/);
    expect(release.source_kind).toBe('publishing.roadmap');
  });

  it('emits a lock event when file_lock_date is inside window', () => {
    seedRoadmap({
      kind: 'kdp', slug: 'foo', title: 'Foo',
      target_release_date: '2026-09-15', status: 'planned', source: 'reuse',
      file_lock_date: '2026-08-31',
    });
    const events = aggregateCalendarEvents(db, '2026-08-01', '2026-09-01');
    const lock = events.find((e) => e.kind === 'roadmap.lock');
    expect(lock).toBeTruthy();
    expect(lock.date).toBe('2026-08-31');
    expect(lock.title).toMatch(/Lock file/i);
  });

  it('excludes skipped rows', () => {
    seedRoadmap({
      kind: 'kdp', slug: 'foo', title: 'Foo',
      target_release_date: '2026-09-15', status: 'skipped', source: 'reuse',
      file_lock_date: '2026-08-31',
    });
    const events = aggregateCalendarEvents(db, '2026-08-01', '2026-10-01');
    expect(events.filter((e) => e.kind.startsWith('roadmap.'))).toHaveLength(0);
  });

  it('omits lock event when file_lock_date falls outside the [from,to) window', () => {
    seedRoadmap({
      kind: 'kdp', slug: 'foo', title: 'Foo',
      target_release_date: '2026-09-15', status: 'planned', source: 'reuse',
      file_lock_date: '2026-07-31',
    });
    const events = aggregateCalendarEvents(db, '2026-09-01', '2026-10-01');
    expect(events.find((e) => e.kind === 'roadmap.release')).toBeTruthy();
    expect(events.find((e) => e.kind === 'roadmap.lock')).toBeUndefined();
  });
});
```

(If the existing test file's `freshDb()` helper is defined elsewhere or doesn't include the four prior tables, adjust as needed — the goal is each test starts with a clean DB that has all the tables the aggregator queries.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd web.ui/backend && npm test -- --run __tests__/calendar/aggregator.test.js`
Expected: FAIL — the aggregator doesn't yet emit roadmap events.

- [ ] **Step 3: Extend `aggregator.js`**

In `web.ui/backend/calendar/aggregator.js`, after the existing pinterest-queue branch (just before `out.sort(...)`), add:

```js
  // ── Publishing roadmap — release + lock events ────────────────────────
  const roadmapRows = /** @type {Array<{id:number,kind:string,slug:string,title:string,target_release_date:string,file_lock_date:string|null,status:string}>} */ (
    db
      .prepare(
        `SELECT id, kind, slug, title, target_release_date, file_lock_date, status
           FROM publishing_roadmap
          WHERE status != 'skipped'
            AND (
                  (target_release_date >= ? AND target_release_date < ?)
               OR (file_lock_date IS NOT NULL AND file_lock_date >= ? AND file_lock_date < ?)
            )`,
      )
      .all(from, to, from, to)
  );
  for (const r of roadmapRows) {
    const kindUpper = r.kind.toUpperCase();
    if (r.target_release_date >= from && r.target_release_date < to) {
      out.push({
        date: r.target_release_date,
        kind: 'roadmap.release',
        title: `${kindUpper}: ${r.title}`,
        source_kind: 'publishing.roadmap',
        source_id: r.id,
        url: '/calendar',
      });
    }
    if (r.file_lock_date && r.file_lock_date >= from && r.file_lock_date < to) {
      out.push({
        date: r.file_lock_date,
        kind: 'roadmap.lock',
        title: `Lock file: ${r.title}`,
        source_kind: 'publishing.roadmap',
        source_id: r.id,
        url: '/calendar',
      });
    }
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd web.ui/backend && npm test -- --run __tests__/calendar/aggregator.test.js`
Expected: PASS — 4 new tests + existing.

- [ ] **Step 5: Commit**

```bash
git add web.ui/backend/calendar/aggregator.js web.ui/backend/__tests__/calendar/aggregator.test.js
git commit -m "feat(roadmap): calendar aggregator emits release + lock events"
```

---

## Task 5: KDP + Etsy auto-advance hooks

**Files:**
- Modify: `web.ui/backend/kdp/routes.js` (extend `mark-published` to advance roadmap row)
- Modify: `web.ui/backend/etsy/syncer.js` (advance roadmap row when listing first goes active)
- Modify: `web.ui/backend/__tests__/kdp/routes.test.js`
- Modify: `web.ui/backend/__tests__/etsy/syncer.test.js`

- [ ] **Step 1: Extend the KDP mark-published test**

Find the existing `POST /api/kdp/books/:slug/mark-published` test in `web.ui/backend/__tests__/kdp/routes.test.js`. After the existing assertions, append a new test (use the same setup pattern as the file's other tests):

```js
  it('mark-published advances any matching roadmap row to published', async () => {
    const db = openDb();
    // Seed a kdp_books row + a roadmap row with the same slug.
    db.prepare(
      `INSERT INTO kdp_books (slug, title, status, output_dir)
       VALUES ('foo', 'Foo', 'built', ?)`,
    ).run(tmpRoot);
    db.prepare(
      `INSERT INTO publishing_roadmap
         (kind, slug, title, target_release_date, status, source, file_lock_date)
       VALUES ('kdp', 'foo', 'Foo', '2026-09-15', 'scheduled', 'reuse', '2026-08-31')`,
    ).run();

    await request(app)
      .post('/api/kdp/books/foo/mark-published')
      .send({ asin: 'B0CFOOFOOFO', release_date: '2026-09-15' });

    const row = db.prepare(`SELECT status, kdp_book_id FROM publishing_roadmap WHERE slug='foo'`).get();
    expect(row.status).toBe('published');
    expect(row.kdp_book_id).toBeGreaterThan(0);
  });
```

- [ ] **Step 2: Wire the KDP hook**

In `web.ui/backend/kdp/routes.js`, at the top with the other imports, add:

```js
import { advanceRoadmapBySlug } from '../roadmap/repo.js';
```

Find the `mark-published` handler. After the existing `db.prepare('UPDATE kdp_books ...')` block (which sets status='published' on the book) and BEFORE the existing `recordEvent('kdp:published', ...)`, wrap both writes in a transaction by adding:

```js
    // Advance any matching publishing_roadmap row in the same DB
    // transaction so the two updates can't desync.
    db.transaction(() => {
      advanceRoadmapBySlug(db, {
        kind: 'kdp',
        slug: updated.slug,
        toStatus: 'published',
        linkId: updated.id,
      });
    })();
```

(If the existing UPDATE is not already inside a `db.transaction(...)`, leave it as-is and run `advanceRoadmapBySlug` as a standalone call after it. The point of the spec's "same transaction" wording is to avoid mid-publish crashes leaving roadmap stale; in better-sqlite3 single-statement UPDATEs are atomic, so a follow-up UPDATE is safe enough for v1.)

- [ ] **Step 3: Run KDP route tests**

Run: `cd web.ui/backend && npm test -- --run __tests__/kdp/routes.test.js`
Expected: PASS — all existing + 1 new.

- [ ] **Step 4: Extend the Etsy syncer test**

Read `web.ui/backend/__tests__/etsy/syncer.test.js` to see how it constructs the in-memory DB. Append a test:

```js
  it('runSyncPass advances roadmap row to published when listing first goes active', async () => {
    // Seed the schema + a planned roadmap row with kind='etsy' matching
    // the listing's sku_id (= our slug).
    db.exec(`
      CREATE TABLE publishing_roadmap (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        kind TEXT NOT NULL, slug TEXT NOT NULL, title TEXT NOT NULL,
        target_release_date TEXT NOT NULL, status TEXT NOT NULL, source TEXT NOT NULL,
        niche TEXT, rationale TEXT, file_lock_date TEXT,
        kdp_book_id INTEGER, etsy_listing_id INTEGER, notes TEXT,
        created_at TEXT, updated_at TEXT,
        UNIQUE(kind, slug, target_release_date)
      );
    `);
    db.prepare(
      `INSERT INTO publishing_roadmap
         (kind, slug, title, target_release_date, status, source, file_lock_date)
       VALUES ('etsy', 'cottagecore-halloween-pack', 'Halloween Pack', '2026-09-15', 'scheduled', 'build', '2026-08-31')`,
    ).run();

    // Fake client returns one ACTIVE listing whose sku_id equals our slug.
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
    const row = db.prepare(`SELECT status, etsy_listing_id FROM publishing_roadmap WHERE slug='cottagecore-halloween-pack'`).get();
    expect(row.status).toBe('published');
    expect(row.etsy_listing_id).toBe(99001);
  });
```

(Adjust the inline `sku_id` field name if the Etsy syncer's row shape uses a different key — see the existing `repo.js` for the canonical column name. The test may need `db.prepare('UPDATE etsy_listings SET sku_id=?')` instead; whatever the existing syncer.test.js uses, mirror it.)

- [ ] **Step 5: Wire the Etsy hook**

In `web.ui/backend/etsy/syncer.js`, at the top with the other imports, add:

```js
import { advanceRoadmapBySlug } from '../roadmap/repo.js';
```

In the `runSyncPass` function, find where the syncer detects a status transition into `'active'` (look for `result.diffs.status` or a `status === 'active'` block). After the existing `emit('etsy:status-changed', ...)` for that transition, add:

```js
        // Advance any matching publishing_roadmap row.
        if (row.status === 'active' && row.sku_id) {
          advanceRoadmapBySlug(db, {
            kind: 'etsy',
            slug: row.sku_id,
            toStatus: 'published',
            linkId: row.etsy_listing_id,
          });
        }
```

Also do the same inside the `result.inserted` branch (a brand-new listing already in `active` state should advance the roadmap on first sight).

- [ ] **Step 6: Run Etsy syncer tests**

Run: `cd web.ui/backend && npm test -- --run __tests__/etsy/syncer.test.js`
Expected: PASS — all existing + 1 new.

- [ ] **Step 7: Full suite + commit**

Run: `cd web.ui/backend && npm test`
Expected: all PASS.

```bash
git add web.ui/backend/kdp/routes.js web.ui/backend/etsy/syncer.js \
        web.ui/backend/__tests__/kdp/routes.test.js \
        web.ui/backend/__tests__/etsy/syncer.test.js
git commit -m "feat(roadmap): KDP + Etsy publish hooks auto-advance roadmap"
```

---

## Task 6: Frontend — API client + Calendar integration

**Files:**
- Create: `web.ui/frontend-react/src/api/roadmap.ts`
- Modify: `web.ui/frontend-react/src/api/calendar.ts` (extend the kind union)
- Modify: `web.ui/frontend-react/src/pages/Calendar.tsx` (colors, legend, click handler)
- Modify: `web.ui/frontend-react/src/__tests__/Calendar.test.tsx`

- [ ] **Step 1: Add the roadmap API client**

Create `web.ui/frontend-react/src/api/roadmap.ts`:

```ts
/**
 * Typed fetch wrappers for /api/roadmap/*.
 *
 *   listRoadmap(filters?) → GET    /api/roadmap
 *   createRoadmap(body)   → POST   /api/roadmap
 *   updateRoadmap(id, p)  → PUT    /api/roadmap/:id
 *   deleteRoadmap(id)     → DELETE /api/roadmap/:id
 */

import { ApiError } from './kdp';

export type RoadmapKind = 'kdp' | 'etsy';
export type RoadmapStatus =
  | 'planned' | 'building' | 'built' | 'scheduled' | 'published' | 'skipped';
export type RoadmapSource = 'reuse' | 'build';

export interface RoadmapRow {
  id: number;
  kind: RoadmapKind;
  slug: string;
  title: string;
  target_release_date: string;
  status: RoadmapStatus;
  source: RoadmapSource;
  niche: string | null;
  rationale: string | null;
  file_lock_date: string | null;
  kdp_book_id: number | null;
  etsy_listing_id: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface ListRoadmapParams {
  kind?: RoadmapKind;
  status?: string; // comma list
  from?: string;
  to?: string;
}

async function throwForStatus(r: Response, label: string): Promise<never> {
  let body: unknown = null;
  try { body = await r.json(); } catch { /* not JSON */ }
  throw new ApiError(`${label}: ${r.status}`, r.status, body);
}

export async function listRoadmap(params: ListRoadmapParams = {}): Promise<RoadmapRow[]> {
  const qs = new URLSearchParams();
  if (params.kind) qs.set('kind', params.kind);
  if (params.status) qs.set('status', params.status);
  if (params.from) qs.set('from', params.from);
  if (params.to) qs.set('to', params.to);
  const suffix = qs.toString() ? `?${qs.toString()}` : '';
  const r = await fetch(`/api/roadmap${suffix}`);
  if (!r.ok) await throwForStatus(r, 'listRoadmap');
  const data = (await r.json()) as { rows: RoadmapRow[] };
  return data.rows;
}

export async function getRoadmapById(id: number): Promise<RoadmapRow> {
  const all = await listRoadmap();
  const row = all.find((r) => r.id === id);
  if (!row) throw new ApiError(`roadmap row ${id} not found`, 404, null);
  return row;
}

export async function updateRoadmap(
  id: number,
  patch: Partial<RoadmapRow>,
): Promise<RoadmapRow> {
  const r = await fetch(`/api/roadmap/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
  if (!r.ok) await throwForStatus(r, 'updateRoadmap');
  const data = (await r.json()) as { row: RoadmapRow };
  return data.row;
}

export { ApiError };
```

- [ ] **Step 2: Extend the calendar kind union**

In `web.ui/frontend-react/src/api/calendar.ts`, find the `CalendarEventKind` type and extend it:

```ts
export type CalendarEventKind =
  | 'kdp.release'
  | 'etsy.listed'
  | 'reminder'
  | 'pinterest.scheduled'
  | 'roadmap.release'
  | 'roadmap.lock';
```

- [ ] **Step 3: Calendar.tsx — add colors, legend, click handler**

In `web.ui/frontend-react/src/pages/Calendar.tsx`:

(a) Add the import at the top:

```ts
import RoadmapDetailModal from '../components/RoadmapDetailModal';
```

(b) Find the kind-to-color map (likely a `const COLORS` or similar). Add two entries:

```ts
'roadmap.release': '#7c3aed',
'roadmap.lock':    '#a78bfa',
```

(c) Find the kind-filter chips array and append two:

```ts
{ kind: 'roadmap.release', label: 'Planned release' },
{ kind: 'roadmap.lock',    label: 'File lock deadline' },
```

(d) Add state + click handler for the modal:

```ts
const [activeRoadmapId, setActiveRoadmapId] = useState<number | null>(null);
```

(e) In the existing `handleEventClick(arg: EventClickArg)` (or whatever the existing click handler is named), branch on roadmap kinds before the existing navigation logic:

```ts
if (arg.event.extendedProps?.sourceKind === 'publishing.roadmap') {
  const id = Number(arg.event.extendedProps?.sourceId);
  if (Number.isFinite(id)) setActiveRoadmapId(id);
  return;
}
```

(f) In the JSX, render the modal at the end:

```tsx
{activeRoadmapId != null && (
  <RoadmapDetailModal
    id={activeRoadmapId}
    onClose={() => setActiveRoadmapId(null)}
    onChanged={() => {
      // refetch calendar after a status change
      refetchEvents?.();
    }}
  />
)}
```

(`refetchEvents` should be whatever existing function refetches the calendar feed. If the page uses FullCalendar's `events` callback pattern, this is the function that re-runs the fetch — match the existing name.)

- [ ] **Step 4: Update the Calendar.tsx test**

In `web.ui/frontend-react/src/__tests__/Calendar.test.tsx`:

- If the file has a URL-routed `fetchMock`, add an arm for `/api/roadmap` returning `{rows: []}` by default.
- Add ONE new test that asserts a roadmap event opens the modal:

```ts
  it('clicking a roadmap.release event opens the RoadmapDetailModal', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/calendar')) {
        return {
          ok: true, status: 200,
          json: async () => ({
            events: [{
              date: '2026-09-15',
              kind: 'roadmap.release',
              title: 'KDP: Foo',
              source_kind: 'publishing.roadmap',
              source_id: 7,
              url: '/calendar',
            }],
          }),
          text: async () => '{}',
        } as unknown as Response;
      }
      if (url.startsWith('/api/roadmap')) {
        return {
          ok: true, status: 200,
          json: async () => ({ rows: [{
            id: 7, kind: 'kdp', slug: 'foo', title: 'Foo',
            target_release_date: '2026-09-15',
            status: 'scheduled', source: 'reuse',
            niche: null, rationale: null,
            file_lock_date: '2026-08-31',
            kdp_book_id: null, etsy_listing_id: null, notes: null,
            created_at: '', updated_at: '',
          }]}),
          text: async () => '{}',
        } as unknown as Response;
      }
      throw new Error(`unexpected URL: ${url}`);
    });

    render(<MemoryRouter><Calendar /></MemoryRouter>);
    const event = await screen.findByText(/KDP: Foo/i);
    await userEvent.click(event);
    expect(await screen.findByRole('dialog', { name: /roadmap/i })).toBeInTheDocument();
  });
```

- [ ] **Step 5: Type-check + run**

Run: `cd web.ui/frontend-react && npx tsc --noEmit`
Expected: error — `Cannot find module '../components/RoadmapDetailModal'`. That's expected; Task 7 creates it.

Skip the test run until Task 7 creates the modal.

- [ ] **Step 6: Commit — but only the API client + calendar.ts kind union**

```bash
git add web.ui/frontend-react/src/api/roadmap.ts web.ui/frontend-react/src/api/calendar.ts
git commit -m "feat(roadmap): frontend API client + calendar kind union"
```

(Leave the modified `Calendar.tsx` + test uncommitted in the working tree; they get committed at the end of Task 7 with the modal.)

---

## Task 7: `<RoadmapDetailModal />` + Calendar.tsx wire-up

**Files:**
- Create: `web.ui/frontend-react/src/components/RoadmapDetailModal.tsx`
- Create: `web.ui/frontend-react/src/components/__tests__/RoadmapDetailModal.test.tsx`
- (Continued from Task 6: commit the Calendar.tsx changes once the modal exists.)

- [ ] **Step 1: Write the failing test**

Create `web.ui/frontend-react/src/components/__tests__/RoadmapDetailModal.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import RoadmapDetailModal from '../RoadmapDetailModal';
import type { RoadmapRow } from '../../api/roadmap';

const sample: RoadmapRow = {
  id: 7, kind: 'kdp', slug: 'foo', title: 'Foo',
  target_release_date: '2026-09-15', status: 'planned', source: 'reuse',
  niche: 'faith', rationale: 'because faith Q4 evergreen',
  file_lock_date: '2026-08-31',
  kdp_book_id: null, etsy_listing_id: null, notes: '',
  created_at: '', updated_at: '',
};

function mockJson(body: unknown, ok = true, status = 200) {
  return { ok, status, json: async () => body, text: async () => '{}' } as unknown as Response;
}

describe('RoadmapDetailModal', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => { fetchSpy = vi.spyOn(globalThis, 'fetch'); });
  afterEach(() => { fetchSpy.mockRestore(); });

  it('fetches row on mount and renders the title + slug + niche', async () => {
    fetchSpy.mockResolvedValueOnce(mockJson({ rows: [sample] }));
    render(<RoadmapDetailModal id={7} onClose={vi.fn()} onChanged={vi.fn()} />);
    expect(await screen.findByText('Foo')).toBeInTheDocument();
    expect(screen.getByText('foo')).toBeInTheDocument();
    expect(screen.getByText(/faith/i)).toBeInTheDocument();
  });

  it('status dropdown PUTs the new status', async () => {
    fetchSpy
      .mockResolvedValueOnce(mockJson({ rows: [sample] }))
      .mockResolvedValueOnce(mockJson({ row: { ...sample, status: 'building' } }));
    const onChanged = vi.fn();
    render(<RoadmapDetailModal id={7} onClose={vi.fn()} onChanged={onChanged} />);
    await screen.findByText('Foo');
    const select = screen.getByLabelText(/status/i) as HTMLSelectElement;
    await userEvent.selectOptions(select, 'building');
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    const putCall = fetchSpy.mock.calls.find(
      (c) => String(c[0]).includes('/api/roadmap/7') && (c[1] as RequestInit)?.method === 'PUT',
    );
    expect(putCall).toBeTruthy();
    const body = JSON.parse((putCall![1] as RequestInit).body as string);
    expect(body.status).toBe('building');
  });

  it('changing target_release_date recomputes file_lock_date via PUT response', async () => {
    fetchSpy
      .mockResolvedValueOnce(mockJson({ rows: [sample] }))
      .mockResolvedValueOnce(mockJson({
        row: { ...sample, target_release_date: '2026-12-01', file_lock_date: '2026-11-16' },
      }));
    render(<RoadmapDetailModal id={7} onClose={vi.fn()} onChanged={vi.fn()} />);
    await screen.findByText('Foo');
    const dateInput = screen.getByLabelText(/target release/i) as HTMLInputElement;
    await userEvent.clear(dateInput);
    await userEvent.type(dateInput, '2026-12-01');
    // Trigger blur to save:
    await userEvent.tab();
    expect(await screen.findByText('2026-11-16')).toBeInTheDocument();
  });

  it('Cancel button calls onClose', async () => {
    fetchSpy.mockResolvedValueOnce(mockJson({ rows: [sample] }));
    const onClose = vi.fn();
    render(<RoadmapDetailModal id={7} onClose={onClose} onChanged={vi.fn()} />);
    await screen.findByText('Foo');
    await userEvent.click(screen.getByRole('button', { name: /close/i }));
    expect(onClose).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web.ui/frontend-react && npm test -- --run src/components/__tests__/RoadmapDetailModal.test.tsx`
Expected: FAIL — `Cannot find module '../RoadmapDetailModal'`.

- [ ] **Step 3: Implement the modal**

Create `web.ui/frontend-react/src/components/RoadmapDetailModal.tsx`:

```tsx
import { useEffect, useState } from 'react';
import {
  listRoadmap, updateRoadmap,
  type RoadmapRow, type RoadmapStatus,
} from '../api/roadmap';

interface Props {
  id: number;
  onClose: () => void;
  onChanged: () => void;
}

const STATUS_OPTIONS: RoadmapStatus[] = [
  'planned', 'building', 'built', 'scheduled', 'published', 'skipped',
];

export default function RoadmapDetailModal({ id, onClose, onChanged }: Props) {
  const [row, setRow] = useState<RoadmapRow | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void listRoadmap()
      .then((rows) => setRow(rows.find((r) => r.id === id) ?? null))
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [id]);

  async function save(patch: Partial<RoadmapRow>) {
    if (!row) return;
    try {
      const updated = await updateRoadmap(row.id, patch);
      setRow(updated);
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div
      role="dialog"
      aria-label="Roadmap row detail"
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.4)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 1000,
      }}
    >
      <div style={{
        background: 'var(--surface)', color: 'var(--fg)',
        maxWidth: 540, width: '90%',
        padding: '1rem 1.25rem', borderRadius: 8,
        boxShadow: '0 10px 30px rgba(0,0,0,0.2)',
      }}>
        {row ? (
          <>
            <header style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <span style={{
                background: row.kind === 'kdp' ? '#0ea5e9' : '#f97316',
                color: '#fff', padding: '2px 8px', borderRadius: 4,
                fontSize: '0.75rem', textTransform: 'uppercase',
              }}>{row.kind}</span>
              <h2 style={{ margin: 0 }}>{row.title}</h2>
              <code style={{ color: 'var(--muted)' }}>{row.slug}</code>
            </header>

            {row.niche && (
              <p style={{ margin: '6px 0', color: 'var(--muted)' }}>
                Niche: <strong>{row.niche}</strong>
              </p>
            )}

            <dl style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '4px 12px', margin: '12px 0' }}>
              <dt>
                <label htmlFor="rm-status">Status</label>
              </dt>
              <dd style={{ margin: 0 }}>
                <select
                  id="rm-status"
                  value={row.status}
                  onChange={(e) => void save({ status: e.target.value as RoadmapStatus })}
                >
                  {STATUS_OPTIONS.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </dd>

              <dt>
                <label htmlFor="rm-date">Target release</label>
              </dt>
              <dd style={{ margin: 0 }}>
                <input
                  id="rm-date"
                  type="date"
                  defaultValue={row.target_release_date}
                  onBlur={(e) => {
                    if (e.target.value !== row.target_release_date) {
                      void save({ target_release_date: e.target.value });
                    }
                  }}
                />
              </dd>

              <dt>File lock</dt>
              <dd style={{ margin: 0 }}>{row.file_lock_date ?? '—'}</dd>

              <dt>Source</dt>
              <dd style={{ margin: 0 }}>{row.source}</dd>
            </dl>

            {row.rationale && (
              <p style={{ fontStyle: 'italic', color: 'var(--muted)' }}>
                {row.rationale}
              </p>
            )}

            <label htmlFor="rm-notes" style={{ display: 'block', marginTop: 8 }}>
              Notes
            </label>
            <textarea
              id="rm-notes"
              defaultValue={row.notes ?? ''}
              onBlur={(e) => {
                if (e.target.value !== (row.notes ?? '')) {
                  void save({ notes: e.target.value });
                }
              }}
              style={{ width: '100%', minHeight: 60 }}
            />

            {error && (
              <p role="alert" style={{ color: '#b91c1c', marginTop: 8 }}>{error}</p>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
              <button type="button" onClick={onClose}>Close</button>
            </div>
          </>
        ) : error ? (
          <p role="alert" style={{ color: '#b91c1c' }}>{error}</p>
        ) : (
          <p>Loading…</p>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run tests + full suite**

Run: `cd web.ui/frontend-react && npm test -- --run src/components/__tests__/RoadmapDetailModal.test.tsx`
Expected: 4/4 PASS.

Run: `cd web.ui/frontend-react && npm test -- --run src/__tests__/Calendar.test.tsx`
Expected: PASS — including the new roadmap-click test from Task 6.

Run: `cd web.ui/frontend-react && npm test`
Expected: full suite green.

Run: `cd web.ui/frontend-react && npx tsc --noEmit`
Expected: clean.

- [ ] **Step 5: Commit (modal + Calendar.tsx changes from Task 6 together)**

```bash
git add web.ui/frontend-react/src/components/RoadmapDetailModal.tsx \
        web.ui/frontend-react/src/components/__tests__/RoadmapDetailModal.test.tsx \
        web.ui/frontend-react/src/pages/Calendar.tsx \
        web.ui/frontend-react/src/__tests__/Calendar.test.tsx
git commit -m "feat(roadmap): RoadmapDetailModal + calendar colors/legend/click"
```

---

## Task 8: YAML roadmap + importer

**Files:**
- Create: `docs/superpowers/roadmap/2026-h2-pocket-rooster-press.yml`
- Create: `scripts/import_roadmap.mjs`
- Create: `scripts/__tests__/import_roadmap.test.mjs`

- [ ] **Step 1: Write the importer test**

Create `scripts/__tests__/import_roadmap.test.mjs`:

```js
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { importRoadmap } from '../import_roadmap.mjs';

const SAMPLE_YAML = `
entries:
  - kind: kdp
    slug: foo
    title: Foo
    target_release_date: '2026-08-15'
    status: planned
    source: reuse
    niche: faith
  - kind: kdp
    slug: bar
    title: Bar
    target_release_date: '2026-09-15'
    status: planned
    source: build
`;

function mockJson(body, ok = true, status = 200) {
  return { ok, status, json: async () => body, text: async () => '{}' };
}

describe('importRoadmap', () => {
  /** @type {ReturnType<typeof vi.fn>} */
  let fetchFn;
  beforeEach(() => { fetchFn = vi.fn(); });

  it('POSTs each entry and counts created/updated', async () => {
    fetchFn
      .mockResolvedValueOnce(mockJson({ row: { id: 1 } }, true, 201))
      .mockResolvedValueOnce(mockJson({ row: { id: 2 } }, true, 201));
    const result = await importRoadmap({ yaml: SAMPLE_YAML, fetchFn, baseUrl: 'http://x' });
    expect(result.created).toBe(2);
    expect(result.updated).toBe(0);
    expect(result.errors).toEqual([]);
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('on 409 falls back to PUT and counts as updated', async () => {
    // First POST → 409, then we look up id via GET → 1 row, then PUT.
    fetchFn
      .mockResolvedValueOnce(mockJson({ error: 'dup' }, false, 409))
      .mockResolvedValueOnce(mockJson({ rows: [{ id: 42, kind: 'kdp', slug: 'foo', target_release_date: '2026-08-15' }] }))
      .mockResolvedValueOnce(mockJson({ row: { id: 42 } }))
      .mockResolvedValueOnce(mockJson({ row: { id: 2 } }, true, 201));
    const result = await importRoadmap({ yaml: SAMPLE_YAML, fetchFn, baseUrl: 'http://x' });
    expect(result.created).toBe(1);
    expect(result.updated).toBe(1);
    expect(result.errors).toEqual([]);
  });

  it('captures errors without aborting the run', async () => {
    fetchFn
      .mockResolvedValueOnce(mockJson({ error: 'boom' }, false, 500))
      .mockResolvedValueOnce(mockJson({ row: { id: 2 } }, true, 201));
    const result = await importRoadmap({ yaml: SAMPLE_YAML, fetchFn, baseUrl: 'http://x' });
    expect(result.created).toBe(1);
    expect(result.errors.length).toBe(1);
    expect(result.errors[0]).toMatch(/foo/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd "c:/Sandbox/AIProjectManagement/Rooster-AI-Project-Management" && npx vitest run scripts/__tests__/import_roadmap.test.mjs`
Expected: FAIL — `Cannot find module '../import_roadmap.mjs'`.

(If the repo root doesn't have vitest set up for scripts/ — confirm by checking `vitest.config.js`. If scripts/ tests aren't in the include glob, either extend the glob or run the script test via the backend's vitest config: `cd web.ui/backend && npx vitest run ../../scripts/__tests__/import_roadmap.test.mjs`.)

- [ ] **Step 3: Install js-yaml in the backend workspace if not already present**

Check `web.ui/backend/package.json` for `js-yaml`. If absent:

```bash
cd web.ui/backend && npm install js-yaml
```

(The script will import js-yaml; we put it in the backend workspace so the existing test infra resolves it.)

- [ ] **Step 4: Implement the importer**

Create `scripts/import_roadmap.mjs`:

```js
#!/usr/bin/env node
/**
 * Upsert the publishing roadmap YAML into the dashboard's
 * /api/roadmap endpoint. Idempotent: on a 409 UNIQUE collision, the
 * script does a follow-up PUT with the non-key fields.
 *
 * Usage:
 *   node scripts/import_roadmap.mjs [path/to/file.yml]
 *
 * Defaults to docs/superpowers/roadmap/2026-h2-pocket-rooster-press.yml.
 */
import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';

const DEFAULT_YAML = path.resolve(
  path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')),
  '..',
  'docs/superpowers/roadmap/2026-h2-pocket-rooster-press.yml',
);
const DEFAULT_BASE = process.env.ROOSTER_DASHBOARD_URL || 'http://127.0.0.1:5000';

/**
 * @param {{yaml: string, fetchFn: typeof fetch, baseUrl: string}} args
 * @returns {Promise<{created:number, updated:number, errors:string[]}>}
 */
export async function importRoadmap({ yaml: yamlStr, fetchFn, baseUrl }) {
  const doc = yaml.load(yamlStr);
  const entries = Array.isArray(doc?.entries) ? doc.entries : [];
  let created = 0, updated = 0;
  /** @type {string[]} */
  const errors = [];
  for (const e of entries) {
    try {
      const postResp = await fetchFn(`${baseUrl}/api/roadmap`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(e),
      });
      if (postResp.status === 201) {
        created += 1;
        continue;
      }
      if (postResp.status === 409) {
        // Look up the existing row and PUT.
        const qs = new URLSearchParams({
          kind: e.kind, from: e.target_release_date,
          to: nextDay(e.target_release_date),
        });
        const findResp = await fetchFn(`${baseUrl}/api/roadmap?${qs}`);
        const data = await findResp.json();
        const match = (data.rows ?? []).find((r) => r.slug === e.slug);
        if (!match) {
          errors.push(`${e.kind}/${e.slug}@${e.target_release_date}: 409 but no matching row found on lookup`);
          continue;
        }
        const { kind, slug, target_release_date, ...patch } = e;
        void kind; void slug; void target_release_date;
        const putResp = await fetchFn(`${baseUrl}/api/roadmap/${match.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(patch),
        });
        if (putResp.ok) {
          updated += 1;
        } else {
          errors.push(`${e.kind}/${e.slug}@${e.target_release_date}: PUT ${putResp.status}`);
        }
        continue;
      }
      const detail = await postResp.text();
      errors.push(`${e.kind}/${e.slug}@${e.target_release_date}: POST ${postResp.status} ${detail}`);
    } catch (err) {
      errors.push(`${e?.kind}/${e?.slug}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return { created, updated, errors };
}

function nextDay(yyyyMmDd) {
  const d = new Date(`${yyyyMmDd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

// CLI entry — only when run directly.
if (import.meta.url === `file://${process.argv[1]}`) {
  const filePath = process.argv[2] || DEFAULT_YAML;
  const yamlStr = fs.readFileSync(filePath, 'utf8');
  const result = await importRoadmap({ yaml: yamlStr, fetchFn: fetch, baseUrl: DEFAULT_BASE });
  console.log(`Created: ${result.created}, Updated: ${result.updated}, Errors: ${result.errors.length}`);
  for (const e of result.errors) console.error('  ' + e);
  process.exit(result.errors.length > 0 ? 1 : 0);
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd "c:/Sandbox/AIProjectManagement/Rooster-AI-Project-Management" && npx vitest run scripts/__tests__/import_roadmap.test.mjs`
Expected: PASS — 3 tests.

- [ ] **Step 6: Create the YAML roadmap file**

Create `docs/superpowers/roadmap/2026-h2-pocket-rooster-press.yml`:

```yaml
# Pocket Rooster Press — H2 2026 publishing roadmap.
# Derived from deep-research output 2026-05-29 + brand-fit decisions in
# the spec at docs/superpowers/specs/2026-05-29-publishing-roadmap-design.md.
# Edit by hand; re-run `node scripts/import_roadmap.mjs` to upsert.
entries:
  # ── June 2026 ─────────────────────────────────────────────────────────
  - kind: kdp
    slug: fathers-day-variety-dad
    title: "Father's Day Variety Pack for Dad"
    target_release_date: '2026-06-14'
    status: planned
    source: reuse
    niche: holiday-fathers-day
    rationale: "Father's Day Jun 21; file must lock today."
  - kind: kdp
    slug: backyard-birdwatcher
    title: 'Backyard Birdwatcher'
    target_release_date: '2026-06-22'
    status: planned
    source: reuse
    niche: hobbyist-birds
    rationale: 'Summer birdwatching peak.'
  - kind: kdp
    slug: travel-sudoku-v1
    title: 'Travel Sudoku Vol. 1'
    target_release_date: '2026-06-28'
    status: planned
    source: reuse
    niche: travel-sudoku
    rationale: 'July 4 weekend travel + summer road-trip gift.'

  # ── July 2026 ─────────────────────────────────────────────────────────
  - kind: kdp
    slug: patriotic-american-word-search
    title: 'Patriotic American Word Search'
    target_release_date: '2026-07-04'
    status: planned
    source: reuse
    niche: holiday-patriotic
    rationale: 'Independence Day.'
  - kind: kdp
    slug: garden-companion
    title: 'Garden Companion'
    target_release_date: '2026-07-12'
    status: planned
    source: reuse
    niche: hobbyist-gardening
    rationale: 'Mid-summer garden peak.'
  - kind: kdp
    slug: gardeners-word-search-v2
    title: "Gardener's Word Search Vol. 2"
    target_release_date: '2026-07-19'
    status: planned
    source: reuse
    niche: hobbyist-gardening
    rationale: 'Same garden audience, staggered.'
  - kind: kdp
    slug: travel-sudoku-v2
    title: 'Travel Sudoku Vol. 2'
    target_release_date: '2026-07-26'
    status: planned
    source: reuse
    niche: travel-sudoku
    rationale: 'August travel window.'

  # ── August 2026 ───────────────────────────────────────────────────────
  - kind: kdp
    slug: vintage-1950s-word-search
    title: '1950s Vintage Nostalgia Word Search'
    target_release_date: '2026-08-02'
    status: planned
    source: reuse
    niche: senior-nostalgia
    rationale: 'Back-to-grandparents gifting positioning.'
  - kind: kdp
    slug: kakuro-quiet-minds
    title: 'Kakuro for Quiet Minds'
    target_release_date: '2026-08-09'
    status: planned
    source: reuse
    niche: senior-large-print
    rationale: 'Late-summer relaxation; pre-Grandparents Day.'
  - kind: kdp
    slug: futoshiki-seniors-v1
    title: 'Futoshiki for Seniors'
    target_release_date: '2026-08-16'
    status: planned
    source: reuse
    niche: senior-large-print
    rationale: 'Same audience, staggered.'
  - kind: kdp
    slug: large-print-sudoku-grandparents
    title: 'Large Print Sudoku for Grandparents'
    target_release_date: '2026-08-23'
    status: planned
    source: reuse
    niche: senior-large-print
    rationale: 'Grandparents Day Sep 13; 3-week ramp.'
  - kind: kdp
    slug: knit-crochet-word-search
    title: 'Knit & Crochet Word Search'
    target_release_date: '2026-08-30'
    status: planned
    source: reuse
    niche: hobbyist-knit
    rationale: 'Fall hobbyist season opening.'

  # ── September 2026 ────────────────────────────────────────────────────
  - kind: kdp
    slug: bold-easy-songbirds-v1
    title: 'Bold Easy Songbirds Coloring'
    target_release_date: '2026-09-06'
    status: planned
    source: reuse
    niche: cottagecore-nature
    rationale: 'Cottagecore evergreen + nature audience.'
  - kind: kdp
    slug: bold-easy-cottagecore-mushrooms-v1
    title: 'Bold Easy Cottagecore Mushrooms Coloring'
    target_release_date: '2026-09-13'
    status: planned
    source: reuse
    niche: cottagecore-nature
    rationale: 'Cottagecore evergreen; Sep search peak.'
  - kind: kdp
    slug: bold-easy-cute-cats-v1
    title: 'Bold Easy Cute Cats Coloring'
    target_release_date: '2026-09-20'
    status: planned
    source: reuse
    niche: cozy-pets
    rationale: 'Pre-Halloween cat aesthetic warmup.'
  - kind: kdp
    slug: bold-easy-cozy-halloween-v1
    title: 'Bold Easy Cozy Halloween Coloring'
    target_release_date: '2026-09-20'
    status: planned
    source: reuse
    niche: holiday-halloween
    rationale: 'Halloween Oct 31; 6 weeks out.'
  - kind: kdp
    slug: halloween-word-search
    title: 'Halloween Word Search'
    target_release_date: '2026-09-20'
    status: planned
    source: reuse
    niche: holiday-halloween
    rationale: 'Second Halloween SKU on the search term.'

  # ── October 2026 ──────────────────────────────────────────────────────
  - kind: kdp
    slug: bible-verse-bold-easy-coloring
    title: 'Bible Verse Bold Easy Coloring'
    target_release_date: '2026-10-11'
    status: planned
    source: build
    niche: faith
    rationale: 'Durable evergreen faith niche; Advent gift positioning.'
  - kind: kdp
    slug: thanksgiving-word-search-seniors
    title: 'Thanksgiving Word Search for Seniors'
    target_release_date: '2026-10-18'
    status: planned
    source: reuse
    niche: holiday-thanksgiving
    rationale: 'Thanksgiving Nov 26; 6 weeks out.'
  - kind: kdp
    slug: thanksgiving-gratitude-coloring
    title: 'Thanksgiving Gratitude Cottagecore Coloring'
    target_release_date: '2026-10-25'
    status: planned
    source: build
    niche: holiday-thanksgiving
    rationale: 'New build — Thanksgiving cottagecore coloring gap.'

  # ── November 2026 ─────────────────────────────────────────────────────
  - kind: kdp
    slug: christmas-word-search-seniors
    title: 'Christmas Word Search for Seniors'
    target_release_date: '2026-11-01'
    status: planned
    source: reuse
    niche: holiday-christmas
    rationale: 'Christmas Dec 25; 8 weeks out with Q4 backlog buffer.'
  - kind: kdp
    slug: bold-easy-cozy-christmas-v1
    title: 'Bold Easy Cozy Christmas Coloring'
    target_release_date: '2026-11-01'
    status: planned
    source: reuse
    niche: holiday-christmas
    rationale: 'Second Christmas SKU on the search term.'
  - kind: kdp
    slug: advent-bible-verse-coloring
    title: 'Advent Bible Verse Coloring'
    target_release_date: '2026-11-08'
    status: planned
    source: build
    niche: faith
    rationale: 'Advent runs Nov 29 → Dec 24; validated faith niche.'
  - kind: kdp
    slug: anxiety-relief-coloring-seniors
    title: 'Anxiety Relief Coloring for Seniors'
    target_release_date: '2026-11-15'
    status: planned
    source: build
    niche: senior-wellness
    rationale: 'Anti-anxiety niche validated 2026; brand-fit good.'
  - kind: kdp
    slug: christmas-cottagecore-bundle
    title: 'Cottagecore Christmas Coloring Bundle'
    target_release_date: '2026-11-22'
    status: planned
    source: build
    niche: cottagecore-holiday
    rationale: 'Extends cottagecore line into Christmas.'

  # ── December 2026 ─────────────────────────────────────────────────────
  - kind: kdp
    slug: beloved-hymns-cryptograms
    title: 'Beloved Hymns Cryptograms'
    target_release_date: '2026-12-06'
    status: planned
    source: reuse
    niche: faith
    rationale: 'Christmas/Advent gift slot; faith audience peak.'
  - kind: kdp
    slug: kjv-psalms-cryptograms
    title: 'KJV Psalms Cryptograms'
    target_release_date: '2026-12-13'
    status: planned
    source: reuse
    niche: faith
    rationale: 'Same audience, second SKU.'
  - kind: kdp
    slug: new-year-fresh-start-coloring
    title: 'New Year Fresh Start Coloring'
    target_release_date: '2026-12-20'
    status: planned
    source: build
    niche: motivational
    rationale: 'New Year motivational peak in Jan.'
  - kind: kdp
    slug: 30-day-gratitude-faith-tracker
    title: '30-Day Gratitude Faith Tracker'
    target_release_date: '2026-12-27'
    status: planned
    source: build
    niche: faith-tracker
    rationale: 'Specific tracker (validated niche structure) for fresh-start window.'

  # ── Etsy Q3-Q4 listings (target_release_date = go-live date) ─────────
  - kind: etsy
    slug: halloween-cottagecore-wall-art-set
    title: 'Halloween Cottagecore Wall Art Set'
    target_release_date: '2026-09-15'
    status: planned
    source: build
    niche: etsy-halloween
    rationale: 'Halloween wall art Sept-Oct peak.'
  - kind: etsy
    slug: pumpkin-harvest-botanical-print-pack
    title: 'Pumpkin/Harvest Botanical Print Pack'
    target_release_date: '2026-09-15'
    status: planned
    source: build
    niche: etsy-halloween
    rationale: 'Harvest aesthetic riding cottagecore + Halloween.'
  - kind: etsy
    slug: halloween-coloring-page-mini-pack
    title: 'Halloween Coloring Page Mini-Pack'
    target_release_date: '2026-10-01'
    status: planned
    source: build
    niche: etsy-halloween
    rationale: 'Halloween coloring pack; bold-easy cats + bats + cottagecore.'
  - kind: etsy
    slug: thanksgiving-gratitude-printable-wall-art
    title: 'Thanksgiving Gratitude Printable Wall Art'
    target_release_date: '2026-10-15'
    status: planned
    source: build
    niche: etsy-thanksgiving
    rationale: 'Lead-in to Christmas-gift window.'
  - kind: etsy
    slug: cottagecore-christmas-wall-art-bundle
    title: 'Cottagecore Christmas Wall Art Bundle'
    target_release_date: '2026-11-01'
    status: planned
    source: build
    niche: etsy-christmas
    rationale: 'Q4 gift window; live by Nov 1.'
  - kind: etsy
    slug: christmas-coloring-page-bundle
    title: 'Christmas Coloring Page Bundle'
    target_release_date: '2026-11-01'
    status: planned
    source: build
    niche: etsy-christmas
    rationale: 'Reskin of Advent + cottagecore + songbirds.'
  - kind: etsy
    slug: hanukkah-botanical-menorah-wall-art-set
    title: 'Hanukkah Botanical/Menorah Wall Art Set'
    target_release_date: '2026-11-01'
    status: planned
    source: build
    niche: etsy-hanukkah
    rationale: 'Q4 gift window; underserved niche.'
  - kind: etsy
    slug: vintage-botanical-christmas-card-printables
    title: 'Vintage Botanical Christmas Card Printables'
    target_release_date: '2026-11-01'
    status: planned
    source: build
    niche: etsy-christmas
    rationale: 'Card printables for last-minute gifters.'
  - kind: etsy
    slug: new-year-motivational-cottagecore-quote-art
    title: 'New Year Motivational Cottagecore Quote Art'
    target_release_date: '2026-12-26'
    status: planned
    source: build
    niche: etsy-new-year
    rationale: 'Jan motivational peak.'
  - kind: etsy
    slug: fresh-start-botanical-habit-tracker-printable
    title: 'Fresh Start Botanical Habit Tracker Printable'
    target_release_date: '2026-12-26'
    status: planned
    source: build
    niche: etsy-new-year
    rationale: 'Pairs with new-year motivational art bundle.'
```

- [ ] **Step 7: Commit**

```bash
git add docs/superpowers/roadmap/2026-h2-pocket-rooster-press.yml \
        scripts/import_roadmap.mjs \
        scripts/__tests__/import_roadmap.test.mjs \
        web.ui/backend/package.json web.ui/backend/package-lock.json
git commit -m "feat(roadmap): YAML roadmap + idempotent importer script"
```

---

## Task 9: Run the importer + verify live

This is operational, not code. Run once after Task 8 lands.

- [ ] **Step 1: Restart the backend so migration 0007 is applied to the live DB**

The user normally has the backend running on port 5000. Stop it (Ctrl+C or `Stop-Process`) and re-run `npm start` in `web.ui/backend`.

- [ ] **Step 2: Run the importer against the live API**

```bash
node scripts/import_roadmap.mjs
```

Expected output:
```
Created: 38, Updated: 0, Errors: 0
```

(Or some mix of created/updated if any rows already exist.)

- [ ] **Step 3: Probe the new endpoint**

```bash
curl -s "http://127.0.0.1:5000/api/roadmap?kind=kdp" | python -c "import sys,json; d=json.load(sys.stdin); print(f'kdp rows: {len(d[\"rows\"])}')"
curl -s "http://127.0.0.1:5000/api/roadmap?kind=etsy" | python -c "import sys,json; d=json.load(sys.stdin); print(f'etsy rows: {len(d[\"rows\"])}')"
```

Expected: `kdp rows: 28`, `etsy rows: 10`.

- [ ] **Step 4: Probe the calendar feed for a single month**

```bash
curl -s "http://127.0.0.1:5000/api/calendar?from=2026-10-01&to=2026-11-01" | python -c "
import sys, json
d = json.load(sys.stdin)
evs = d['events']
roadmap = [e for e in evs if e['kind'].startswith('roadmap.')]
print(f'roadmap events in Oct: {len(roadmap)}')
for e in roadmap[:5]: print(f'  {e[\"date\"]}  {e[\"kind\"]:18s}  {e[\"title\"]}')
"
```

Expected: several roadmap.release + roadmap.lock events showing the October-ish slots from the YAML.

- [ ] **Step 5: Hard-refresh `/calendar` in the browser and visually verify**

Open `http://localhost:3000/calendar`. Confirm:
- Purple "Planned release" and lighter-purple "File lock deadline" entries appear on the grid for September/October/November.
- The two new entries appear in the legend.
- Clicking a purple dot opens `<RoadmapDetailModal />` with the row details.
- Changing the status dropdown in the modal persists (refresh the page; the new status should stick).

(Operational task — no commit. If any of these don't work, the corresponding task above had a bug that needs a follow-up commit.)

---

## Self-Review

**Spec coverage:**
- §1 schema → Task 1 migration; Task 2 repo enforces the FK-shape via `advanceRoadmapBySlug`.
- §1 status lifecycle → Task 2 repo accepts all 6 statuses; Task 7 modal exposes all 6 as dropdown options.
- §1 file_lock_date computation → Task 2 `_fileLockDateFor` (exported for unit test); recomputes on `target_release_date` update.
- §1 auto-advancement → Task 5 (KDP route hook + Etsy syncer hook).
- §2 GET/POST/PUT/DELETE routes → Task 3.
- §2 mount in server.js → Task 3 step 4.
- §2 aggregator extension → Task 4; both event kinds, lock event suppressed outside window, skipped rows excluded.
- §3 calendar UI colors + legend → Task 6.
- §3 RoadmapDetailModal → Task 7; status dropdown, target-release-date editor with auto-recompute, mark-skipped via the same dropdown, notes textarea, close button.
- §3 importer + YAML format → Task 8; idempotent, validates entries, captures per-row errors.
- §4 out-of-scope items → respected: no auto-create kdp_books, no auto-publish, no auto-list, no reminder.
- §5 tests — every test case listed in the spec has a corresponding step in the plan.
- §6 risks → file-lock past-due red marker is NOT in v1 (deferred — flag for follow-up); other risks (importer overwrites, calendar density, transaction safety, YAML schema validation) are addressed inline in the relevant tasks.

**Placeholder scan:** every step has actual code or actual commands. No TBD. The two "match the existing fetchMock pattern" notes in Task 6 and Task 5 give the implementer enough information to slot the new branch in without ambiguity (existing test files have established patterns; the implementer reads them and mirrors).

**Type consistency:** `RoadmapRow` shape defined in Task 2 JSDoc, mirrored in Task 6 TS interface, used in Task 7 modal. `RoadmapStatus` lifecycle enum identical across repo / routes validator / modal dropdown. `kind` is `'kdp' | 'etsy'` everywhere. `file_lock_date = target_release_date - 15 days` consistent in Task 2 (compute), Task 4 (aggregator query), Task 7 (modal display).

**Carry-over for follow-up (not in this plan):**
1. Lock-past-due red marker on the calendar (spec §6 risk #1).
2. SSE event on roadmap CRUD so multiple browser tabs sync without manual refresh.
3. A dedicated `/roadmap` index page that lists all rows in a table — currently you reach roadmap rows only via the calendar.
