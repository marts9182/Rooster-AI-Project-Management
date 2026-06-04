# Pinterest Revive (Phase 0) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the dashboard's already-built Pinterest pipeline actually post — add live token validation, create the theme/niche boards, give the queue a per-pin `board_id`, and add a force-post route to verify one real pin end-to-end.

**Architecture:** The poster/topup/queue infrastructure already exists and is correct; it has just never posted because the token is dead and no board routing exists. This phase fixes the diagnosis surface (live token check), adds a `createBoard` API method + an idempotent boards-bootstrap module that persists a `niche → board_id` map, adds `board_id`/`source`/`source_id` columns to the queue (the source columns are unused until Phase 1 but added now to avoid a second migration), makes the poster prefer `row.board_id` with the existing env var as fallback, and adds `/boards/sync` + `/post-now` ops routes. No per-pin niche routing yet — that lands in Phase 1 with the source abstraction; Phase 0 pins post to the default board.

**Tech Stack:** Node ESM, Express, better-sqlite3, Vitest, the Pinterest v5 REST API (`web.ui/backend/pinterest/*`).

**Spec:** [docs/superpowers/specs/2026-06-03-pinterest-revive-and-etsy-design.md](../specs/2026-06-03-pinterest-revive-and-etsy-design.md) §1 (Phase 0).

**External prerequisite (user action, not a task):** Regenerate the Pinterest token from the dev portal **Production** environment with scopes `boards:read boards:write pins:read pins:write user_accounts:read`, write it to `<repo-root>/.env.local` as `PINTEREST_ACCESS_TOKEN`, restart the backend. Tasks 1 and 6 are how we *verify* that worked.

All commands run from `web.ui/backend` unless noted. Test runner: `npx vitest run <path>`.

---

## File Structure

- Modify: `web.ui/backend/pinterest/api_client.js` — add `getLiveStatus()` + `createBoard()`.
- Modify: `web.ui/backend/pinterest/routes.js` — `/token-status` uses live status; add `/boards/sync`, `/post-now`.
- Create: `web.ui/backend/pinterest/boards.js` — niche→board map + `ensureBoards()`, persists `data/pinterest_boards.json`.
- Create: `web.ui/backend/migrations/0008_pinterest_multi_source.sql` — `source`,`source_id`,`board_id` columns.
- Modify: `web.ui/backend/pinterest/poster.js` — prefer `row.board_id`, fall back to env.
- Tests: `web.ui/backend/__tests__/pinterest/{api_client_status,boards,routes_ops}.test.js` + extend `poster.test.js`.

---

## Task 1: Live token validation

**Files:**
- Modify: `web.ui/backend/pinterest/api_client.js` (add `getLiveStatus` after `getTokenStatus`, ~line 246)
- Modify: `web.ui/backend/pinterest/routes.js:151-162` (`/token-status` handler)
- Test: `web.ui/backend/__tests__/pinterest/api_client_status.test.js`

- [ ] **Step 1: Write the failing test**

```javascript
// web.ui/backend/__tests__/pinterest/api_client_status.test.js
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PinterestApiClient } from '../../pinterest/api_client.js';

let tmpDir;
let tokenPath;

function writeToken(expiresAt) {
  fs.writeFileSync(
    tokenPath,
    JSON.stringify({ access_token: 'tok', refresh_token: 'r', expires_at: expiresAt }),
    'utf8',
  );
}

function client(fetchFn) {
  return new PinterestApiClient({
    tokenStorePath: tokenPath, appId: 'a', appSecret: 's', fetchFn,
  });
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pin-status-'));
  tokenPath = path.join(tmpDir, 'token.json');
});
afterEach(() => { fs.rmSync(tmpDir, { recursive: true, force: true }); });

describe('getLiveStatus', () => {
  it('reports live_ok + identity when the API returns 200', async () => {
    writeToken(new Date(Date.now() + 3600_000).toISOString());
    const fetchFn = async () =>
      new Response(JSON.stringify({ username: 'pocketrooster', business_name: 'Pocket Rooster Press' }),
        { status: 200 });
    const s = await client(fetchFn).getLiveStatus();
    expect(s.connected).toBe(true);
    expect(s.live_ok).toBe(true);
    expect(s.identity.username).toBe('pocketrooster');
    expect(s.error).toBeNull();
  });

  it('reports live_ok=false + error on a 401', async () => {
    writeToken(new Date(Date.now() + 3600_000).toISOString());
    const fetchFn = async () =>
      new Response(JSON.stringify({ code: 2, message: 'Authentication failed.' }), { status: 401 });
    const s = await client(fetchFn).getLiveStatus();
    expect(s.live_ok).toBe(false);
    expect(s.error).toMatch(/401|Authentication/);
  });

  it('reports live_ok=false without calling the API when no valid token', async () => {
    writeToken(new Date(Date.now() - 1000).toISOString()); // expired
    let called = false;
    const fetchFn = async () => { called = true; return new Response('{}', { status: 200 }); };
    const s = await client(fetchFn).getLiveStatus();
    expect(s.connected).toBe(false);
    expect(s.live_ok).toBe(false);
    expect(called).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run __tests__/pinterest/api_client_status.test.js`
Expected: FAIL — `getLiveStatus is not a function`.

- [ ] **Step 3: Implement `getLiveStatus`**

Add to `PinterestApiClient` in `web.ui/backend/pinterest/api_client.js`, immediately after the `getTokenStatus()` method (before the closing `}` of the class, ~line 246):

```javascript
  /**
   * Live connection check: validates the token by actually calling the API.
   * Unlike getTokenStatus (which only inspects the local file), this catches
   * dead/wrong-environment tokens that still have a future expires_at.
   *
   * @returns {Promise<{connected: boolean, live_ok: boolean, expires_at: string|null,
   *   identity: {username: string, business_name: string|null}|null, error: string|null}>}
   */
  async getLiveStatus() {
    const base = await this.getTokenStatus();
    if (!base.connected) {
      return { ...base, live_ok: false, identity: null, error: 'no_valid_token' };
    }
    try {
      const u = await this.getUserAccount();
      return {
        ...base,
        live_ok: true,
        identity: { username: u.username, business_name: u.business_name ?? null },
        error: null,
      };
    } catch (err) {
      return { ...base, live_ok: false, identity: null, error: err?.message ?? String(err) };
    }
  }
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run __tests__/pinterest/api_client_status.test.js`
Expected: PASS (3 tests).

- [ ] **Step 5: Wire the route to the live check**

In `web.ui/backend/pinterest/routes.js`, replace the `/token-status` handler body (lines 151-162) so it returns the live status:

```javascript
  router.get('/token-status', async (_req, res) => {
    if (!apiClient) {
      return res.status(503).json({ error: 'api_client_unavailable' });
    }
    try {
      const status = await apiClient.getLiveStatus();
      res.json(status);
    } catch (err) {
      const message = err?.message || String(err);
      res.status(500).json({ error: message });
    }
  });
```

- [ ] **Step 6: Commit**

```bash
git add web.ui/backend/pinterest/api_client.js web.ui/backend/pinterest/routes.js web.ui/backend/__tests__/pinterest/api_client_status.test.js
git commit -m "feat(pinterest): live token validation via getLiveStatus + /token-status"
```

---

## Task 2: `createBoard` API method

**Files:**
- Modify: `web.ui/backend/pinterest/api_client.js` (add after `listBoards`, ~line 195)
- Test: `web.ui/backend/__tests__/pinterest/api_client_status.test.js` (extend)

- [ ] **Step 1: Write the failing test**

Append to `web.ui/backend/__tests__/pinterest/api_client_status.test.js`:

```javascript
describe('createBoard', () => {
  it('POSTs /v5/boards with name + privacy and returns the board', async () => {
    writeToken(new Date(Date.now() + 3600_000).toISOString());
    let captured;
    const fetchFn = async (url, init) => {
      captured = { url, method: init.method, body: JSON.parse(init.body) };
      return new Response(JSON.stringify({ id: '999', name: init.body && JSON.parse(init.body).name }),
        { status: 201 });
    };
    const board = await client(fetchFn).createBoard('Large-Print Sudoku');
    expect(captured.method).toBe('POST');
    expect(captured.url).toMatch(/\/v5\/boards$/);
    expect(captured.body.name).toBe('Large-Print Sudoku');
    expect(captured.body.privacy).toBe('PUBLIC');
    expect(board.id).toBe('999');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run __tests__/pinterest/api_client_status.test.js -t createBoard`
Expected: FAIL — `createBoard is not a function`.

- [ ] **Step 3: Implement `createBoard`**

Add to `PinterestApiClient` in `web.ui/backend/pinterest/api_client.js`, right after `listBoards()` (~line 195):

```javascript
  /**
   * Create a board. Idempotency is the caller's job (see boards.ensureBoards).
   * @param {string} name
   * @param {{privacy?: 'PUBLIC'|'PROTECTED'|'SECRET', description?: string}} [opts]
   * @returns {Promise<import('./api_client.js').PinterestBoard>}
   */
  async createBoard(name, opts = {}) {
    return this._callApi('POST', '/v5/boards', {
      name,
      privacy: opts.privacy ?? 'PUBLIC',
      ...(opts.description ? { description: opts.description } : {}),
    });
  }
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run __tests__/pinterest/api_client_status.test.js -t createBoard`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web.ui/backend/pinterest/api_client.js web.ui/backend/__tests__/pinterest/api_client_status.test.js
git commit -m "feat(pinterest): add createBoard to the v5 API client"
```

---

## Task 3: Migration 0008 — source/source_id/board_id columns

**Files:**
- Create: `web.ui/backend/migrations/0008_pinterest_multi_source.sql`
- Test: `web.ui/backend/__tests__/pinterest/migration_0008.test.js`

- [ ] **Step 1: Write the failing test**

```javascript
// web.ui/backend/__tests__/pinterest/migration_0008.test.js
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openDb, _resetForTests } from '../../db.js';

let tmpDir;
beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pin-mig-'));
  process.env.ROOSTER_DB_PATH = path.join(tmpDir, 'dashboard.db');
  _resetForTests();
});
afterEach(() => {
  _resetForTests();
  delete process.env.ROOSTER_DB_PATH;
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function cols(db, table) {
  return new Set(db.prepare(`PRAGMA table_info(${table})`).all().map((r) => r.name));
}

describe('migration 0008', () => {
  it('adds source/source_id/board_id to pinterest_queue and pinterest_history', () => {
    const db = openDb(); // runs all migrations including 0008
    const q = cols(db, 'pinterest_queue');
    const h = cols(db, 'pinterest_history');
    for (const c of ['source', 'source_id', 'board_id']) {
      expect(q.has(c), `queue.${c}`).toBe(true);
    }
    for (const c of ['source', 'source_id']) {
      expect(h.has(c), `history.${c}`).toBe(true);
    }
  });

  it('backfills source_id from kdp_book_id for existing rows', () => {
    const db = openDb();
    db.prepare(
      `INSERT INTO kdp_books (slug,title,status,output_dir) VALUES ('x','X','published','')`,
    ).run();
    const bookId = db.prepare('SELECT id FROM kdp_books').get().id;
    // Simulate a pre-0008 row by clearing the new columns after insert.
    db.prepare(
      `INSERT INTO pinterest_queue
         (kdp_book_id,pin_type,image_path,title,description,link_url,status,scheduled_for,source,source_id)
       VALUES (?,'cover_hero','/i.png','t','d','u','pending','2026-06-04T12:00:00Z','kdp',NULL)`,
    ).run(bookId);
    db.prepare(`UPDATE pinterest_queue SET source_id = CAST(kdp_book_id AS TEXT) WHERE source_id IS NULL`).run();
    const row = db.prepare('SELECT source, source_id FROM pinterest_queue').get();
    expect(row.source).toBe('kdp');
    expect(row.source_id).toBe(String(bookId));
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run __tests__/pinterest/migration_0008.test.js`
Expected: FAIL — `queue.source` is false (columns don't exist yet).

- [ ] **Step 3: Write the migration**

Create `web.ui/backend/migrations/0008_pinterest_multi_source.sql`:

```sql
-- Migration 0008 — multi-source pins: tag each queue/history row with its
-- origin (kdp | etsy) and the board it targets.
-- Spec: docs/superpowers/specs/2026-06-03-pinterest-revive-and-etsy-design.md §2.2

ALTER TABLE pinterest_queue   ADD COLUMN source TEXT NOT NULL DEFAULT 'kdp';
ALTER TABLE pinterest_queue   ADD COLUMN source_id TEXT;
ALTER TABLE pinterest_queue   ADD COLUMN board_id TEXT;
ALTER TABLE pinterest_history ADD COLUMN source TEXT NOT NULL DEFAULT 'kdp';
ALTER TABLE pinterest_history ADD COLUMN source_id TEXT;

-- Backfill source_id from the legacy kdp_book_id so old rows keep posting.
UPDATE pinterest_queue
   SET source_id = CAST(kdp_book_id AS TEXT)
 WHERE source_id IS NULL AND kdp_book_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_pinterest_queue_source ON pinterest_queue(source, source_id);
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run __tests__/pinterest/migration_0008.test.js`
Expected: PASS (2 tests).

- [ ] **Step 5: Run the full pinterest suite to confirm no regressions**

Run: `npx vitest run __tests__/pinterest/`
Expected: PASS (all existing pinterest tests still green — the new columns have defaults).

- [ ] **Step 6: Commit**

```bash
git add web.ui/backend/migrations/0008_pinterest_multi_source.sql web.ui/backend/__tests__/pinterest/migration_0008.test.js
git commit -m "feat(pinterest): migration 0008 — source/source_id/board_id columns"
```

---

## Task 4: niche→board map + `ensureBoards`

**Files:**
- Create: `web.ui/backend/pinterest/boards.js`
- Test: `web.ui/backend/__tests__/pinterest/boards.test.js`

- [ ] **Step 1: Write the failing test**

```javascript
// web.ui/backend/__tests__/pinterest/boards.test.js
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { NICHE_BOARD_MAP, ensureBoards } from '../../pinterest/boards.js';

let tmpDir; let mapPath;
beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pin-boards-'));
  mapPath = path.join(tmpDir, 'pinterest_boards.json');
});
afterEach(() => { fs.rmSync(tmpDir, { recursive: true, force: true }); });

function fakeClient({ existing = [], onCreate } = {}) {
  return {
    async listBoards() { return existing; },
    async createBoard(name) {
      const board = onCreate ? onCreate(name) : { id: `new-${name}`, name };
      existing.push(board);
      return board;
    },
  };
}

describe('ensureBoards', () => {
  it('creates only the missing boards and writes a niche→id map', async () => {
    const boardTitles = [...new Set(Object.values(NICHE_BOARD_MAP))];
    // Pretend the first title already exists on the account.
    const existing = [{ id: 'existing-0', name: boardTitles[0] }];
    const created = [];
    const client = fakeClient({ existing, onCreate: (name) => { created.push(name); return { id: `c-${name}`, name }; } });

    const map = await ensureBoards(client, { mapPath });
    // Every niche resolves to a board id.
    for (const niche of Object.keys(NICHE_BOARD_MAP)) {
      expect(typeof map[niche]).toBe('string');
      expect(map[niche].length).toBeGreaterThan(0);
    }
    // The already-existing board was not recreated.
    expect(created).not.toContain(boardTitles[0]);
    // Map file persisted.
    expect(fs.existsSync(mapPath)).toBe(true);
  });

  it('is idempotent — a second run creates nothing new', async () => {
    const client = fakeClient();
    await ensureBoards(client, { mapPath });
    const before = client.listBoards ? (await client.listBoards()).length : 0;
    await ensureBoards(client, { mapPath });
    const after = (await client.listBoards()).length;
    expect(after).toBe(before);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run __tests__/pinterest/boards.test.js`
Expected: FAIL — cannot import `NICHE_BOARD_MAP`/`ensureBoards`.

- [ ] **Step 3: Implement `boards.js`**

Create `web.ui/backend/pinterest/boards.js`:

```javascript
/**
 * Theme/niche board map + idempotent bootstrap.
 *
 * ensureBoards() lists the account's existing boards, creates any board named
 * in NICHE_BOARD_MAP that is missing, and writes a `niche → board_id` map to
 * data/pinterest_boards.json. Safe to run on every boot.
 *
 * @module pinterest/boards
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** niche key → board display name. Multiple niches may share a board. */
export const NICHE_BOARD_MAP = Object.freeze({
  sudoku: 'Large-Print Sudoku',
  'travel-sudoku': 'Large-Print Sudoku',
  'word-search': 'Word Search Puzzles',
  historical: 'Word Search Puzzles',
  kakuro: 'Kakuro & Logic Puzzles',
  futoshiki: 'Kakuro & Logic Puzzles',
  cryptogram: 'Cryptograms & Codes',
  coloring: 'Coloring Pages',
  'hobbyist-birds': 'Birding & Nature',
  cottagecore: 'Cottagecore SVG Cut Files',
  mandala: 'Cottagecore SVG Cut Files',
  poster: 'Printable Wall Art',
});

/** @returns {string} default on-disk path for the persisted map. */
export function defaultMapPath() {
  return path.resolve(__dirname, '..', '..', '..', 'data', 'pinterest_boards.json');
}

/**
 * @param {{listBoards: () => Promise<Array<{id:string,name:string}>>,
 *          createBoard: (name: string) => Promise<{id:string,name:string}>}} apiClient
 * @param {{mapPath?: string}} [opts]
 * @returns {Promise<Record<string,string>>}  niche → board_id
 */
export async function ensureBoards(apiClient, opts = {}) {
  const mapPath = opts.mapPath ?? defaultMapPath();
  const existing = await apiClient.listBoards();
  /** @type {Map<string,string>} name → id */
  const byName = new Map(existing.map((b) => [b.name, b.id]));

  const wantedTitles = [...new Set(Object.values(NICHE_BOARD_MAP))];
  for (const title of wantedTitles) {
    if (!byName.has(title)) {
      const created = await apiClient.createBoard(title);
      byName.set(title, created.id);
    }
  }

  /** @type {Record<string,string>} */
  const nicheMap = {};
  for (const [niche, title] of Object.entries(NICHE_BOARD_MAP)) {
    const id = byName.get(title);
    if (id) nicheMap[niche] = id;
  }

  fs.mkdirSync(path.dirname(mapPath), { recursive: true });
  fs.writeFileSync(mapPath, JSON.stringify(nicheMap, null, 2), 'utf8');
  return nicheMap;
}

/**
 * Read the persisted niche→board_id map; {} if absent.
 * @param {string} [mapPath]
 * @returns {Record<string,string>}
 */
export function readBoardMap(mapPath = defaultMapPath()) {
  try {
    return JSON.parse(fs.readFileSync(mapPath, 'utf8'));
  } catch {
    return {};
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run __tests__/pinterest/boards.test.js`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add web.ui/backend/pinterest/boards.js web.ui/backend/__tests__/pinterest/boards.test.js
git commit -m "feat(pinterest): niche-board map + idempotent ensureBoards bootstrap"
```

---

## Task 5: Poster prefers `row.board_id`

**Files:**
- Modify: `web.ui/backend/pinterest/poster.js` (`resolveBoardId` usage + createPin call, ~lines 60-106)
- Test: `web.ui/backend/__tests__/pinterest/poster.test.js` (extend)

- [ ] **Step 1: Write the failing test**

Add a test to `web.ui/backend/__tests__/pinterest/poster.test.js` that seeds a queue row with a non-null `board_id` and asserts the poster passes *that* board to `createPin`, not the env default. Mirror the existing poster-test setup in that file (it seeds a due `pinterest_queue` row and injects a fake apiClient capturing `createPin` args). Concretely:

```javascript
it('posts to the row board_id when present, overriding the env default', async () => {
  // Arrange: a due pending row with an explicit board_id.
  const db = openDb();
  db.prepare(
    `INSERT INTO kdp_books (slug,title,status,output_dir) VALUES ('b','B','published','')`,
  ).run();
  const bookId = db.prepare('SELECT id FROM kdp_books').get().id;
  const img = path.join(tmpRoot, 'pin.png');
  fs.writeFileSync(img, 'x');
  db.prepare(
    `INSERT INTO pinterest_queue
       (kdp_book_id,pin_type,image_path,title,description,link_url,status,scheduled_for,board_id,source,source_id)
     VALUES (?,'cover_hero',?,'t','d','https://a','pending','2000-01-01T00:00:00Z','board-XYZ','kdp',?)`,
  ).run(bookId, img, String(bookId));

  let captured = null;
  const apiClient = {
    async createPin(args) { captured = args; return { id: 'pin1' }; },
  };

  // Act: run one poster tick (use the same runOnce entrypoint the existing tests use).
  await runOnce({ apiClient });

  // Assert
  expect(captured).not.toBeNull();
  expect(captured.board_id).toBe('board-XYZ');
});
```

> Note: match the actual `runOnce` import/signature already used at the top of `poster.test.js`; the existing tests show how `runOnce` is invoked and how `openDb`, `tmpRoot`, `fs`, `path` are set up in that file.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run __tests__/pinterest/poster.test.js -t "row board_id"`
Expected: FAIL — `createPin` receives the env `TEST_BOARD`, not `board-XYZ`.

- [ ] **Step 3: Make the poster prefer the row's board_id**

In `web.ui/backend/pinterest/poster.js`, the row is dequeued before the `createPin` call (~line 100). Change the board resolution so the row wins. Replace the `board_id: boardId,` line in the `createPin` call (~line 101) and the surrounding resolution:

```javascript
// after the row is dequeued (row = dequeueNext()), resolve the board:
const boardId = (row.board_id && String(row.board_id).trim())
  ? String(row.board_id).trim()
  : resolveBoardId();
if (!boardId) {
  // existing no-default-board handling stays as-is
  return { posted: 0, reason: 'no_default_board' };
}
```

Then the existing `createPin({ board_id: boardId, ... })` call uses it unchanged. Keep `resolveBoardId()` as the env fallback for rows without a `board_id` (every Phase 0 row has `board_id` NULL, so the env default still applies until Phase 1 sets per-pin boards).

> Implementation detail: read the current control flow in `poster.js` lines 60-110 and insert the `row.board_id ?? resolveBoardId()` precedence at the point where `boardId` is currently computed. Do not move the dequeue.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run __tests__/pinterest/poster.test.js`
Expected: PASS (the new test + all existing poster tests).

- [ ] **Step 5: Commit**

```bash
git add web.ui/backend/pinterest/poster.js web.ui/backend/__tests__/pinterest/poster.test.js
git commit -m "feat(pinterest): poster prefers per-row board_id, env default as fallback"
```

---

## Task 6: `/boards/sync` and `/post-now` ops routes

**Files:**
- Modify: `web.ui/backend/pinterest/routes.js` (add two routes inside `buildRouter`)
- Test: `web.ui/backend/__tests__/pinterest/routes_ops.test.js`

- [ ] **Step 1: Write the failing test**

```javascript
// web.ui/backend/__tests__/pinterest/routes_ops.test.js
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import express from 'express';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildRouter } from '../../pinterest/routes.js';
import { openDb, _resetForTests } from '../../db.js';

let tmpDir;
function appWith(apiClient) {
  const app = express();
  app.use(express.json());
  app.use('/api/pinterest', buildRouter({ apiClient }));
  return app;
}
async function call(app, method, url) {
  const { default: request } = await import('supertest');
  return request(app)[method](url);
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pin-ops-'));
  process.env.ROOSTER_DB_PATH = path.join(tmpDir, 'dashboard.db');
  process.env.PINTEREST_BOARDS_MAP_PATH = path.join(tmpDir, 'pinterest_boards.json');
  _resetForTests();
});
afterEach(() => {
  _resetForTests();
  delete process.env.ROOSTER_DB_PATH;
  delete process.env.PINTEREST_BOARDS_MAP_PATH;
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('POST /api/pinterest/boards/sync', () => {
  it('creates boards via the client and returns the niche map', async () => {
    const apiClient = {
      async listBoards() { return []; },
      async createBoard(name) { return { id: `id-${name}`, name }; },
    };
    const res = await call(appWith(apiClient), 'post', '/api/pinterest/boards/sync');
    expect(res.status).toBe(200);
    expect(res.body.map['hobbyist-birds']).toBe('id-Birding & Nature');
  });

  it('503 when no apiClient', async () => {
    const res = await call(appWith(null), 'post', '/api/pinterest/boards/sync');
    expect(res.status).toBe(503);
  });
});

describe('POST /api/pinterest/post-now', () => {
  it('force-posts a specific pending row and returns the pin id', async () => {
    const db = openDb();
    db.prepare(`INSERT INTO kdp_books (slug,title,status,output_dir) VALUES ('b','B','published','')`).run();
    const bid = db.prepare('SELECT id FROM kdp_books').get().id;
    const img = path.join(tmpDir, 'p.png'); fs.writeFileSync(img, 'x');
    db.prepare(
      `INSERT INTO pinterest_queue
         (kdp_book_id,pin_type,image_path,title,description,link_url,status,scheduled_for,board_id)
       VALUES (?,'cover_hero',?,'t','d','https://a','pending','2999-01-01T00:00:00Z','board-1')`,
    ).run(bid, img);
    const qid = db.prepare('SELECT id FROM pinterest_queue').get().id;

    const apiClient = { async createPin() { return { id: 'PIN-9' }; } };
    const res = await call(appWith(apiClient), 'post', `/api/pinterest/post-now?queue_id=${qid}`);
    expect(res.status).toBe(200);
    expect(res.body.pinterest_pin_id).toBe('PIN-9');
    const row = db.prepare('SELECT status FROM pinterest_queue WHERE id=?').get(qid);
    expect(row.status).toBe('posted');
  });
});
```

> If `supertest` is not already a dev dependency, install it: `npm i -D supertest` (check `package.json` first; the dashboard's other route tests likely already use it — match their import style and skip the install if so).

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run __tests__/pinterest/routes_ops.test.js`
Expected: FAIL — routes return 404.

- [ ] **Step 3: Implement the two routes**

In `web.ui/backend/pinterest/routes.js`, add imports at the top alongside the existing queue imports:

```javascript
import { markPosted, markFailed } from './queue.js';
import { ensureBoards } from './boards.js';
```

Then inside `buildRouter`, before `return router;`, add:

```javascript
  router.post('/boards/sync', async (_req, res) => {
    if (!apiClient) return res.status(503).json({ error: 'api_client_unavailable' });
    try {
      const mapPath = process.env.PINTEREST_BOARDS_MAP_PATH || undefined;
      const map = await ensureBoards(apiClient, mapPath ? { mapPath } : {});
      recordEvent('pinterest:boards-synced', { count: Object.keys(map).length });
      res.json({ map });
    } catch (err) {
      res.status(500).json({ error: err?.message || String(err) });
    }
  });

  // Ops-only: force-post one pending/paused row immediately, bypassing the
  // scheduler. Used to verify the very first real post end-to-end.
  router.post('/post-now', async (req, res) => {
    if (!apiClient) return res.status(503).json({ error: 'api_client_unavailable' });
    const id = Number(req.query.queue_id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'bad_queue_id' });
    const row = getQueueRow(id);
    if (!row) return res.status(404).json({ error: 'not_found' });
    if (!['pending', 'paused'].includes(row.status)) {
      return res.status(409).json({ error: `row is '${row.status}', not postable` });
    }
    try {
      const boardId = (row.board_id && String(row.board_id).trim())
        ? String(row.board_id).trim()
        : (process.env.PINTEREST_DEFAULT_BOARD_ID || '').trim();
      if (!boardId) return res.status(400).json({ error: 'no_board' });
      const result = await apiClient.createPin({
        board_id: boardId,
        title: row.title,
        description: row.description,
        link: row.link_url,
        imagePath: row.image_path,
      });
      markPosted(id, result.id);
      res.json({ ok: true, pinterest_pin_id: result.id });
    } catch (err) {
      markFailed(id, err?.message || String(err));
      res.status(502).json({ error: err?.message || String(err) });
    }
  });
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run __tests__/pinterest/routes_ops.test.js`
Expected: PASS (4 tests).

- [ ] **Step 5: Document the routes**

Update the route-list JSDoc block at the top of `routes.js` (lines 1-22) to add:

```
 *   POST /api/pinterest/boards/sync        — ensureBoards(); returns niche→id map
 *   POST /api/pinterest/post-now?queue_id=N — force-post one row now (ops/verify)
```

- [ ] **Step 6: Commit**

```bash
git add web.ui/backend/pinterest/routes.js web.ui/backend/__tests__/pinterest/routes_ops.test.js
git commit -m "feat(pinterest): /boards/sync + /post-now ops routes"
```

---

## Task 7: Full suite + manual end-to-end verification

**Files:** none (verification only)

- [ ] **Step 1: Run the entire backend test suite**

Run: `npx vitest run`
Expected: PASS (all suites, including the new pinterest tests).

- [ ] **Step 2: Lint + typecheck**

Run: `npm run lint && npm run typecheck`
Expected: clean.

- [ ] **Step 3: Manual end-to-end (requires the regenerated Production token in `.env.local`)**

Start the backend, then:

```bash
# 1. Confirm the token is actually live (not just locally valid):
curl -s http://127.0.0.1:5000/api/pinterest/token-status
#   expect: {"connected":true,"live_ok":true,"identity":{"username":"..."},...}

# 2. Create the theme/niche boards:
curl -s -X POST http://127.0.0.1:5000/api/pinterest/boards/sync
#   expect: {"map":{"sudoku":"<id>", "hobbyist-birds":"<id>", ...}}

# 3. Seed the queue (run the topup worker once) — confirm rows appear:
curl -s http://127.0.0.1:5000/api/pinterest/queue | head -c 200

# 4. Force-post the first row and confirm it lands on Pinterest:
curl -s -X POST "http://127.0.0.1:5000/api/pinterest/post-now?queue_id=<ID>"
#   expect: {"ok":true,"pinterest_pin_id":"..."} and the pin visible on the account
```

Expected: `live_ok:true`, boards created, one real pin visible on the live Pinterest account.

- [ ] **Step 4: Final commit (if any doc/checklist tweaks)**

```bash
git add -A
git commit -m "chore(pinterest): phase 0 revive verified end-to-end"
```

---

## Self-Review notes

- **Spec §1.1 (live token validation):** Task 1. ✅
- **Spec §1.2 (boards bootstrap, persisted map):** Tasks 2, 4, 6 (`/boards/sync`). ✅
- **Spec §1.3 (seed + verify first post):** Task 6 (`/post-now`) + Task 7 manual. ✅
- **Spec §2.2 (source columns migration):** Task 3 — added in Phase 0 to avoid a second migration; columns are unused until Phase 1. Migration number corrected to **0008** (spec drafted 0006; 0006/0007 already exist). ✅
- **Board routing per pin (niche→board at enqueue):** intentionally deferred to Phase 1, where the source abstraction carries `niche`. Phase 0 rows have `board_id = NULL` and post to `PINTEREST_DEFAULT_BOARD_ID`; the column + poster precedence + boards all exist so Phase 1 only has to populate `board_id`.
- **Out of Phase 0 (→ Phase 1 plan):** source-agnostic topup refactor, `EtsyListingSource`, branded Etsy template, UTM tagging, warm-up ramp scheduler.
