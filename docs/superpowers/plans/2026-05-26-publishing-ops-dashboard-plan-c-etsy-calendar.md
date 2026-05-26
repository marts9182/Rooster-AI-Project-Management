# Publishing Ops Dashboard — Plan C: Etsy + Calendar

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Prerequisites:** Plan A merged. Plan B can be merged before, after, or in parallel.

**Goal:** Stand up the Etsy listing mirror (v3 polling, Day-30/60/90 reminders, status-change SSE) and the unified Calendar view that aggregates KDP/Etsy/Pinterest/reminder events.

**Architecture:** `etsy/` module refreshes OAuth, polls the v3 listings endpoint every 30 min, upserts and diffs; `calendar/` aggregates dated records from all tables into one FullCalendar-ready stream. Both modules are read-only against external systems in v1.

**Tech Stack:** Express, better-sqlite3, node-fetch / global fetch, msw (mocked Etsy v3 in tests), Vitest, supertest, FullCalendar (`@fullcalendar/react` + `daygrid` + `timegrid` + `interaction`).

**Spec reference:** [`docs/superpowers/specs/2026-05-26-publishing-ops-dashboard-design.md`](../specs/2026-05-26-publishing-ops-dashboard-design.md)

---

## Pre-flight context (read once)

You are working inside the outer repo at `C:/Sandbox/AIProjectManagement/Rooster-AI-Project-Management`. All paths below are repo-relative. The dashboard code lives under `web.ui/backend/` (ESM + JSDoc) and `web.ui/frontend-react/src/` (TS + React 19).

**Plan A is assumed shipped.** These pieces exist already and you import them:

- `web.ui/backend/db.js` — better-sqlite3 wrapper exporting `openDb()` (opens WAL-mode SQLite + runs migrations, returns a `Database` handle).
- `web.ui/backend/events.js` — `recordEvent(kind, payload)` writes to `events` table AND fans out to SSE subscribers (single call covers both — there is no separate broadcast export); also exports `subscribe(fn)` and `replayRecent(n)`.
- `web.ui/backend/workerStatus.js` — exports the procedural functions `setWorkerHeartbeat(worker: string)`, `setWorkerError(worker: string, message: string)`, `getAllStatuses()`, and `trayColor()`. Workers call these directly with their own name string (no factory).
- `/api/events` SSE route lives in `server.js` (set up by Plan A) and emits whatever `recordEvent` sends.
- Tables `etsy_listings`, `reminders`, `pinterest_queue`, `kdp_books`, `events`, `profile` exist (schema per spec §4).
- `web.ui/frontend-react/src/pages/EtsyCatalog.tsx`, `EtsyListingDetail.tsx`, `Calendar.tsx` are empty stub components rendered by React Router. You fill them in.
- `web.ui/frontend-react/src/hooks/useSseChannel.ts` exists; signature: `useSseChannel<T>(channelPrefix: string, onEvent: (e: T) => void)`.
- `@fullcalendar/react`, `@fullcalendar/daygrid`, `@fullcalendar/timegrid`, `@fullcalendar/interaction` are already in `web.ui/frontend-react/package.json`.

**Plan B may or may not be shipped.** Your calendar aggregator queries `kdp_books` — if the table is empty your aggregator returns zero KDP events, which is fine. Tests use a temp DB with rows you insert directly.

**Test commands (all run from `web.ui/backend/`):**

```bash
npm test                          # one-shot Vitest run
npm test -- etsy                  # filter by name
npm run typecheck                 # tsc --noEmit -p jsconfig.json
```

**Frontend tests run from `web.ui/frontend-react/`:**

```bash
npm test                          # vitest + @testing-library/react
npm run typecheck                 # tsc --noEmit
```

**Etsy API behavioral facts captured from spec & existing Python code:**

- The Etsy v3 `x-api-key` header MUST be `<keystring>:<shared_secret>` (colon-joined). Sending the keystring alone returns 403 `"Shared secret is required in x-api-key header."`.
- Bearer access token is sent in the `Authorization` header.
- Token refresh endpoint: `POST https://api.etsy.com/v3/public/oauth/token` with `grant_type=refresh_token`, `client_id=<keystring>`, `refresh_token=<…>` as form data.
- Refresh response may omit a fresh `refresh_token`; if so, preserve the old one (matches `ensure_fresh_token` semantics in the Python helper).
- Listings endpoint: `GET https://openapi.etsy.com/v3/application/shops/{shop_id}/listings?state={state}&limit={limit}&offset={offset}`. Default `state=active`. Pass `limit=100` (Etsy's max); page until response `count` is satisfied or `results.length < limit`.
- Single-listing endpoint: `GET https://openapi.etsy.com/v3/application/listings/{listing_id}`.

**Env vars (read from `web.ui/backend/.env`, gitignored):**

- `ETSY_KEYSTRING` — Etsy app keystring.
- `ETSY_SHARED_SECRET` — Etsy app shared secret.
- `ETSY_SHOP_ID` — numeric shop id (66064739 in dev).
- `ETSY_TOKEN_PATH` — optional override; default `data/etsy_token.json`.

`data/etsy_token.json` is gitignored. Confirm the gitignore entry exists in Task 1.

---

## Task 1: Etsy config + token storage scaffolding

**Files:**
- Modify: `web.ui/backend/.env.example`
- Modify: `web.ui/backend/.gitignore` (create if missing — verify first)
- New: `web.ui/backend/etsy/config.js`
- New: `web.ui/backend/etsy/__tests__/config.test.js`

- [ ] **Step 1: Verify gitignore and add token path**

Run:

```bash
cat web.ui/backend/.gitignore
```

Expected output: file exists and lists `data/` or similar. If `data/etsy_token.json` is not already covered, append to `web.ui/backend/.gitignore`:

```
# Etsy OAuth token cache
data/etsy_token.json
```

- [ ] **Step 2: Append Etsy keys to `.env.example`**

Edit `web.ui/backend/.env.example`, appending:

```
# Etsy v3 — required for the etsy syncer
ETSY_KEYSTRING=
ETSY_SHARED_SECRET=
ETSY_SHOP_ID=
# Optional override; default data/etsy_token.json
ETSY_TOKEN_PATH=
```

- [ ] **Step 3: Write failing test for `etsyConfig()`**

Create `web.ui/backend/etsy/__tests__/config.test.js`:

```javascript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import { etsyConfig } from '../config.js';

const KEYS = ['ETSY_KEYSTRING', 'ETSY_SHARED_SECRET', 'ETSY_SHOP_ID', 'ETSY_TOKEN_PATH'];

describe('etsyConfig', () => {
  /** @type {Record<string, string | undefined>} */
  let snapshot;

  beforeEach(() => {
    snapshot = {};
    for (const k of KEYS) {
      snapshot[k] = process.env[k];
      delete process.env[k];
    }
  });

  afterEach(() => {
    for (const k of KEYS) {
      if (snapshot[k] === undefined) delete process.env[k];
      else process.env[k] = snapshot[k];
    }
  });

  it('reads required env vars', () => {
    process.env.ETSY_KEYSTRING = 'key123';
    process.env.ETSY_SHARED_SECRET = 'secretXYZ';
    process.env.ETSY_SHOP_ID = '66064739';

    const cfg = etsyConfig();
    expect(cfg.keystring).toBe('key123');
    expect(cfg.sharedSecret).toBe('secretXYZ');
    expect(cfg.shopId).toBe(66064739);
    expect(cfg.tokenPath).toBe(path.resolve('data/etsy_token.json'));
  });

  it('honors ETSY_TOKEN_PATH override', () => {
    process.env.ETSY_KEYSTRING = 'k';
    process.env.ETSY_SHARED_SECRET = 's';
    process.env.ETSY_SHOP_ID = '1';
    process.env.ETSY_TOKEN_PATH = '/tmp/custom.json';

    expect(etsyConfig().tokenPath).toBe(path.resolve('/tmp/custom.json'));
  });

  it('throws if any required var is missing', () => {
    expect(() => etsyConfig()).toThrow(/ETSY_KEYSTRING/);
  });

  it('throws if ETSY_SHOP_ID is not numeric', () => {
    process.env.ETSY_KEYSTRING = 'k';
    process.env.ETSY_SHARED_SECRET = 's';
    process.env.ETSY_SHOP_ID = 'abc';
    expect(() => etsyConfig()).toThrow(/numeric/);
  });
});
```

Run:

```bash
cd web.ui/backend && npm test -- config.test
```

Expected output: 4 failing tests (`Cannot find module '../config.js'`).

- [ ] **Step 4: Implement `etsy/config.js` to pass tests**

Create `web.ui/backend/etsy/config.js`:

```javascript
import path from 'node:path';

/**
 * @typedef {Object} EtsyConfig
 * @property {string} keystring
 * @property {string} sharedSecret
 * @property {number} shopId
 * @property {string} tokenPath  absolute path
 */

/**
 * Load Etsy config from process.env.
 * @returns {EtsyConfig}
 */
export function etsyConfig() {
  const required = ['ETSY_KEYSTRING', 'ETSY_SHARED_SECRET', 'ETSY_SHOP_ID'];
  for (const key of required) {
    if (!process.env[key]) {
      throw new Error(`Missing required env var: ${key}`);
    }
  }
  const shopIdRaw = process.env.ETSY_SHOP_ID ?? '';
  const shopId = Number.parseInt(shopIdRaw, 10);
  if (!Number.isFinite(shopId) || String(shopId) !== shopIdRaw.trim()) {
    throw new Error(`ETSY_SHOP_ID must be numeric, got: ${shopIdRaw}`);
  }
  const tokenPathRaw = process.env.ETSY_TOKEN_PATH || 'data/etsy_token.json';
  return {
    keystring: process.env.ETSY_KEYSTRING ?? '',
    sharedSecret: process.env.ETSY_SHARED_SECRET ?? '',
    shopId,
    tokenPath: path.resolve(tokenPathRaw),
  };
}
```

Run:

```bash
cd web.ui/backend && npm test -- config.test
```

Expected output: 4 passing.

- [ ] **Step 5: Commit**

```bash
git add web.ui/backend/.env.example web.ui/backend/.gitignore web.ui/backend/etsy/config.js web.ui/backend/etsy/__tests__/config.test.js
git commit -m "feat(etsy): config loader for keystring/secret/shop_id/token_path"
```

---

## Task 2: Node port of `ensure_fresh_token` (oauth.js)

**Files:**
- New: `web.ui/backend/etsy/oauth.js`
- New: `web.ui/backend/etsy/__tests__/oauth.test.js`

This re-implements the Python helper from `projects/etsy-rooster-shop/src/etsy_rooster/etsy/oauth.py` (function `ensure_fresh_token`) in Node so the dashboard stays fully Node-based.

- [ ] **Step 1: Failing test for token file read/write + refresh**

Create `web.ui/backend/etsy/__tests__/oauth.test.js`:

```javascript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ensureFreshToken } from '../oauth.js';

const NOW = 1_700_000_000; // seconds

function makeCfg(tokenPath) {
  return {
    keystring: 'kx',
    sharedSecret: 'sx',
    shopId: 1,
    tokenPath,
  };
}

function writeToken(tokenPath, payload) {
  fs.mkdirSync(path.dirname(tokenPath), { recursive: true });
  fs.writeFileSync(tokenPath, JSON.stringify(payload), 'utf8');
}

describe('ensureFreshToken', () => {
  /** @type {string} */
  let dir;
  /** @type {string} */
  let tokenPath;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'etsy-tok-'));
    tokenPath = path.join(dir, 'etsy_token.json');
    vi.spyOn(Date, 'now').mockReturnValue(NOW * 1000);
  });

  it('returns existing token when expires_at > now+60', async () => {
    writeToken(tokenPath, {
      access_token: 'aaa',
      refresh_token: 'rrr',
      expires_at: NOW + 3600,
    });
    const fetchSpy = vi.fn();
    const token = await ensureFreshToken({ cfg: makeCfg(tokenPath), fetchFn: fetchSpy });
    expect(token).toBe('aaa');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('refreshes when expires_at is within 60s', async () => {
    writeToken(tokenPath, {
      access_token: 'old',
      refresh_token: 'rrr',
      expires_at: NOW + 30,
    });
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        access_token: 'new',
        refresh_token: 'rrr2',
        expires_in: 3600,
      }),
    });

    const token = await ensureFreshToken({ cfg: makeCfg(tokenPath), fetchFn: fetchSpy });

    expect(token).toBe('new');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, opts] = fetchSpy.mock.calls[0];
    expect(url).toBe('https://api.etsy.com/v3/public/oauth/token');
    expect(opts.method).toBe('POST');
    expect(opts.body.toString()).toContain('grant_type=refresh_token');
    expect(opts.body.toString()).toContain('client_id=kx');
    expect(opts.body.toString()).toContain('refresh_token=rrr');

    const persisted = JSON.parse(fs.readFileSync(tokenPath, 'utf8'));
    expect(persisted.access_token).toBe('new');
    expect(persisted.refresh_token).toBe('rrr2');
    expect(persisted.expires_at).toBe(NOW + 3600);
  });

  it('preserves old refresh_token if response omits it', async () => {
    writeToken(tokenPath, {
      access_token: 'old',
      refresh_token: 'rrr',
      expires_at: NOW - 5,
    });
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ access_token: 'new2', expires_in: 600 }),
    });

    await ensureFreshToken({ cfg: makeCfg(tokenPath), fetchFn: fetchSpy });

    const persisted = JSON.parse(fs.readFileSync(tokenPath, 'utf8'));
    expect(persisted.refresh_token).toBe('rrr');
    expect(persisted.access_token).toBe('new2');
  });

  it('throws if token file is missing', async () => {
    await expect(
      ensureFreshToken({ cfg: makeCfg(tokenPath), fetchFn: vi.fn() }),
    ).rejects.toThrow(/token file not found/i);
  });

  it('surfaces a clear error on refresh HTTP failure', async () => {
    writeToken(tokenPath, {
      access_token: 'old',
      refresh_token: 'rrr',
      expires_at: NOW - 5,
    });
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => 'invalid_grant',
    });

    await expect(
      ensureFreshToken({ cfg: makeCfg(tokenPath), fetchFn: fetchSpy }),
    ).rejects.toThrow(/refresh failed: 401/);
  });
});
```

Run:

```bash
cd web.ui/backend && npm test -- oauth.test
```

Expected output: 5 failing tests (`Cannot find module '../oauth.js'`).

- [ ] **Step 2: Implement `etsy/oauth.js`**

Create `web.ui/backend/etsy/oauth.js`:

```javascript
import fs from 'node:fs';
import path from 'node:path';

/**
 * @typedef {Object} StoredToken
 * @property {string} access_token
 * @property {string} refresh_token
 * @property {number} expires_at   unix-seconds
 */

/**
 * @typedef {Object} EnsureFreshArgs
 * @property {import('./config.js').EtsyConfig} cfg
 * @property {typeof fetch} [fetchFn]   override for tests
 * @property {number} [skewSeconds]     refresh if expires_at <= now+skew (default 60)
 */

const TOKEN_URL = 'https://api.etsy.com/v3/public/oauth/token';

/**
 * Load the persisted token; refresh it via Etsy if within the skew window.
 * Returns the (possibly-refreshed) access_token string. Writes the new
 * token JSON back to disk in-place.
 *
 * @param {EnsureFreshArgs} args
 * @returns {Promise<string>}
 */
export async function ensureFreshToken({ cfg, fetchFn = fetch, skewSeconds = 60 }) {
  const tokenPath = cfg.tokenPath;
  if (!fs.existsSync(tokenPath)) {
    throw new Error(`Etsy token file not found at ${tokenPath}. Run the OAuth setup script first.`);
  }
  /** @type {StoredToken} */
  const stored = JSON.parse(fs.readFileSync(tokenPath, 'utf8'));
  const nowSec = Math.floor(Date.now() / 1000);
  if (stored.expires_at > nowSec + skewSeconds) {
    return stored.access_token;
  }

  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: cfg.keystring,
    refresh_token: stored.refresh_token,
  });
  const resp = await fetchFn(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Etsy token refresh failed: ${resp.status} ${text}`);
  }
  /** @type {{access_token: string, refresh_token?: string, expires_in: number}} */
  const fresh = await resp.json();
  /** @type {StoredToken} */
  const next = {
    access_token: fresh.access_token,
    refresh_token: fresh.refresh_token ?? stored.refresh_token,
    expires_at: nowSec + Number(fresh.expires_in),
  };
  fs.mkdirSync(path.dirname(tokenPath), { recursive: true });
  fs.writeFileSync(tokenPath, JSON.stringify(next), 'utf8');
  return next.access_token;
}
```

Run:

```bash
cd web.ui/backend && npm test -- oauth.test
```

Expected output: 5 passing.

- [ ] **Step 3: Commit**

```bash
git add web.ui/backend/etsy/oauth.js web.ui/backend/etsy/__tests__/oauth.test.js
git commit -m "feat(etsy): Node OAuth refresh helper (port of ensure_fresh_token)"
```

---

## Task 3: Etsy v3 client (client.js) with msw-mocked tests

**Files:**
- Modify: `web.ui/backend/package.json` (add `msw` to devDependencies)
- New: `web.ui/backend/etsy/client.js`
- New: `web.ui/backend/etsy/__tests__/client.test.js`

- [ ] **Step 1: Add msw dependency**

```bash
cd web.ui/backend && npm install --save-dev msw@^2.6.0
```

Expected output: `added N packages`. Verify `package.json` now lists `msw` under `devDependencies`.

- [ ] **Step 2: Failing test for `listListings` + `getListing` with msw**

Create `web.ui/backend/etsy/__tests__/client.test.js`:

```javascript
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { EtsyClient } from '../client.js';

const BASE = 'https://openapi.etsy.com';

const handlers = [
  http.get(`${BASE}/v3/application/shops/:shopId/listings`, ({ request, params }) => {
    const url = new URL(request.url);
    expect(request.headers.get('x-api-key')).toBe('keyX:secretY');
    expect(request.headers.get('authorization')).toBe('Bearer accessZ');
    const limit = Number(url.searchParams.get('limit'));
    const offset = Number(url.searchParams.get('offset'));
    const state = url.searchParams.get('state');
    const all = [
      { listing_id: 1, title: 'A', state: 'active', price: { amount: 500, divisor: 100, currency_code: 'USD' } },
      { listing_id: 2, title: 'B', state: 'active', price: { amount: 750, divisor: 100, currency_code: 'USD' } },
      { listing_id: 3, title: 'C', state: 'active', price: { amount: 999, divisor: 100, currency_code: 'USD' } },
    ];
    return HttpResponse.json({
      count: all.length,
      results: all.slice(offset, offset + limit),
    });
  }),
  http.get(`${BASE}/v3/application/listings/:listingId`, ({ params }) => {
    return HttpResponse.json({
      listing_id: Number(params.listingId),
      title: 'detail',
      state: 'active',
      price: { amount: 1234, divisor: 100, currency_code: 'USD' },
    });
  }),
];

const server = setupServer(...handlers);
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function makeClient() {
  return new EtsyClient({
    keystring: 'keyX',
    sharedSecret: 'secretY',
    shopId: 42,
    getAccessToken: async () => 'accessZ',
  });
}

describe('EtsyClient', () => {
  it('sends keystring:shared_secret in x-api-key', async () => {
    const client = makeClient();
    const r = await client.listListings({ state: 'active', limit: 1, offset: 0 });
    expect(r.results).toHaveLength(1);
    expect(r.count).toBe(3);
  });

  it('pages through all listings', async () => {
    const client = makeClient();
    const all = await client.listAllListings({ state: 'active', pageSize: 2 });
    expect(all.map((x) => x.listing_id)).toEqual([1, 2, 3]);
  });

  it('fetches a single listing', async () => {
    const client = makeClient();
    const listing = await client.getListing(99);
    expect(listing.listing_id).toBe(99);
    expect(listing.title).toBe('detail');
  });

  it('throws on non-2xx with body in message', async () => {
    server.use(
      http.get(`${BASE}/v3/application/shops/:shopId/listings`, () =>
        HttpResponse.text('boom', { status: 500 }),
      ),
    );
    const client = makeClient();
    await expect(client.listListings({ state: 'active' })).rejects.toThrow(/500.*boom/);
  });
});
```

Run:

```bash
cd web.ui/backend && npm test -- client.test
```

Expected output: 4 failing tests (`Cannot find module '../client.js'`).

- [ ] **Step 3: Implement `etsy/client.js`**

Create `web.ui/backend/etsy/client.js`:

```javascript
/**
 * @typedef {Object} EtsyListing
 * @property {number} listing_id
 * @property {string} title
 * @property {string} state
 * @property {{amount: number, divisor: number, currency_code: string}} [price]
 * @property {string} [url]
 * @property {string} [shop_section_id]
 * @property {number} [num_favorers]
 * @property {number} [views]
 * @property {number} [original_creation_timestamp]
 */

/**
 * @typedef {Object} EtsyClientArgs
 * @property {string} keystring
 * @property {string} sharedSecret
 * @property {number} shopId
 * @property {() => Promise<string>} getAccessToken  resolves to a fresh bearer token
 * @property {typeof fetch} [fetchFn]
 */

const BASE = 'https://openapi.etsy.com';

export class EtsyClient {
  /** @param {EtsyClientArgs} args */
  constructor(args) {
    this.keystring = args.keystring;
    this.sharedSecret = args.sharedSecret;
    this.shopId = args.shopId;
    this.getAccessToken = args.getAccessToken;
    this.fetchFn = args.fetchFn ?? fetch;
  }

  /** @returns {Promise<Record<string,string>>} */
  async _headers() {
    const token = await this.getAccessToken();
    return {
      Authorization: `Bearer ${token}`,
      'x-api-key': `${this.keystring}:${this.sharedSecret}`,
    };
  }

  /**
   * One page of listings.
   * @param {{state?: string, limit?: number, offset?: number}} opts
   * @returns {Promise<{count: number, results: EtsyListing[]}>}
   */
  async listListings(opts = {}) {
    const state = opts.state ?? 'active';
    const limit = opts.limit ?? 100;
    const offset = opts.offset ?? 0;
    const url = new URL(`${BASE}/v3/application/shops/${this.shopId}/listings`);
    url.searchParams.set('state', state);
    url.searchParams.set('limit', String(limit));
    url.searchParams.set('offset', String(offset));
    const resp = await this.fetchFn(url.toString(), { headers: await this._headers() });
    if (!resp.ok) {
      const body = await resp.text();
      throw new Error(`Etsy listings ${resp.status}: ${body}`);
    }
    return /** @type {Promise<{count: number, results: EtsyListing[]}>} */ (resp.json());
  }

  /**
   * Paged convenience that returns every listing.
   * @param {{state?: string, pageSize?: number}} opts
   * @returns {Promise<EtsyListing[]>}
   */
  async listAllListings(opts = {}) {
    const state = opts.state ?? 'active';
    const pageSize = opts.pageSize ?? 100;
    let offset = 0;
    /** @type {EtsyListing[]} */
    const out = [];
    // Hard ceiling at 50 pages (5000 listings) to avoid runaway loops.
    for (let page = 0; page < 50; page += 1) {
      const r = await this.listListings({ state, limit: pageSize, offset });
      out.push(...r.results);
      offset += r.results.length;
      if (r.results.length < pageSize || offset >= r.count) break;
    }
    return out;
  }

  /**
   * @param {number} listingId
   * @returns {Promise<EtsyListing>}
   */
  async getListing(listingId) {
    const url = `${BASE}/v3/application/listings/${listingId}`;
    const resp = await this.fetchFn(url, { headers: await this._headers() });
    if (!resp.ok) {
      const body = await resp.text();
      throw new Error(`Etsy listing ${listingId} ${resp.status}: ${body}`);
    }
    return /** @type {Promise<EtsyListing>} */ (resp.json());
  }
}
```

Run:

```bash
cd web.ui/backend && npm test -- client.test
```

Expected output: 4 passing.

- [ ] **Step 4: Commit**

```bash
git add web.ui/backend/package.json web.ui/backend/package-lock.json web.ui/backend/etsy/client.js web.ui/backend/etsy/__tests__/client.test.js
git commit -m "feat(etsy): v3 client wrapper with msw-mocked tests"
```

---

## Task 4: Upsert + diff repository (repo.js)

**Files:**
- New: `web.ui/backend/etsy/repo.js`
- New: `web.ui/backend/etsy/__tests__/repo.test.js`

Pure SQL helpers wrapping the `etsy_listings` table. Isolating these makes the syncer unit-testable without HTTP.

- [ ] **Step 1: Failing test**

Create `web.ui/backend/etsy/__tests__/repo.test.js`:

```javascript
import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { upsertListing, allListings, listingByEtsyId } from '../repo.js';

/** Minimal schema mirror of migration 0001 for tests. */
function freshDb() {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE etsy_listings (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      etsy_listing_id INTEGER NOT NULL UNIQUE,
      sku_id          TEXT,
      title           TEXT NOT NULL,
      status          TEXT NOT NULL,
      section         TEXT,
      niche           TEXT,
      price_usd       REAL,
      favorites       INTEGER DEFAULT 0,
      views           INTEGER DEFAULT 0,
      listed_at       TEXT,
      last_synced_at  TEXT NOT NULL DEFAULT (datetime('now')),
      listing_url     TEXT
    );
  `);
  return db;
}

describe('etsy/repo', () => {
  /** @type {import('better-sqlite3').Database} */
  let db;
  beforeEach(() => { db = freshDb(); });

  it('inserts a new row and returns {inserted:true}', () => {
    const result = upsertListing(db, {
      etsy_listing_id: 111,
      title: 'Mandala #1',
      status: 'active',
      section: 'Coloring',
      niche: 'mandala',
      price_usd: 4.99,
      favorites: 3,
      views: 50,
      listed_at: '2026-05-01T00:00:00Z',
      listing_url: 'https://etsy.com/listing/111',
    });
    expect(result.inserted).toBe(true);
    expect(result.diffs).toEqual({});
    const all = allListings(db);
    expect(all).toHaveLength(1);
    expect(all[0].title).toBe('Mandala #1');
  });

  it('updates an existing row and reports only changed fields', () => {
    upsertListing(db, {
      etsy_listing_id: 222,
      title: 'Old',
      status: 'active',
      favorites: 1,
      views: 10,
    });
    const result = upsertListing(db, {
      etsy_listing_id: 222,
      title: 'Old',
      status: 'inactive',
      favorites: 5,
      views: 10,
    });
    expect(result.inserted).toBe(false);
    expect(result.diffs).toEqual({
      status: { from: 'active', to: 'inactive' },
      favorites: { from: 1, to: 5 },
    });
  });

  it('listingByEtsyId returns null when missing', () => {
    expect(listingByEtsyId(db, 9999)).toBeNull();
  });
});
```

Run:

```bash
cd web.ui/backend && npm test -- repo.test
```

Expected output: 3 failing tests (`Cannot find module '../repo.js'`).

- [ ] **Step 2: Implement `etsy/repo.js`**

Create `web.ui/backend/etsy/repo.js`:

```javascript
/**
 * @typedef {Object} EtsyListingRow
 * @property {number} etsy_listing_id
 * @property {string} title
 * @property {string} status
 * @property {string} [sku_id]
 * @property {string} [section]
 * @property {string} [niche]
 * @property {number} [price_usd]
 * @property {number} [favorites]
 * @property {number} [views]
 * @property {string} [listed_at]
 * @property {string} [listing_url]
 */

/**
 * @typedef {Object} UpsertResult
 * @property {boolean} inserted   true if this was an insert; false if update
 * @property {Record<string, {from: unknown, to: unknown}>} diffs   keys whose value changed
 */

const TRACKED_FIELDS = /** @type {const} */ ([
  'title',
  'status',
  'sku_id',
  'section',
  'niche',
  'price_usd',
  'favorites',
  'views',
  'listed_at',
  'listing_url',
]);

/**
 * Insert or update a listing. Tracks per-field diffs vs. the existing row.
 *
 * @param {import('better-sqlite3').Database} db
 * @param {EtsyListingRow} row
 * @returns {UpsertResult}
 */
export function upsertListing(db, row) {
  const existing = listingByEtsyId(db, row.etsy_listing_id);
  /** @type {Record<string, {from: unknown, to: unknown}>} */
  const diffs = {};
  if (existing) {
    for (const field of TRACKED_FIELDS) {
      const before = existing[field];
      const after = row[field];
      if (after !== undefined && before !== after) {
        diffs[field] = { from: before, to: after };
      }
    }
  }
  db.prepare(
    `INSERT INTO etsy_listings
       (etsy_listing_id, sku_id, title, status, section, niche, price_usd,
        favorites, views, listed_at, listing_url, last_synced_at)
     VALUES (@etsy_listing_id, @sku_id, @title, @status, @section, @niche, @price_usd,
             @favorites, @views, @listed_at, @listing_url, datetime('now'))
     ON CONFLICT(etsy_listing_id) DO UPDATE SET
       sku_id         = COALESCE(excluded.sku_id, etsy_listings.sku_id),
       title          = excluded.title,
       status         = excluded.status,
       section        = excluded.section,
       niche          = excluded.niche,
       price_usd      = excluded.price_usd,
       favorites      = excluded.favorites,
       views          = excluded.views,
       listed_at      = COALESCE(excluded.listed_at, etsy_listings.listed_at),
       listing_url    = excluded.listing_url,
       last_synced_at = datetime('now')`,
  ).run({
    etsy_listing_id: row.etsy_listing_id,
    sku_id: row.sku_id ?? null,
    title: row.title,
    status: row.status,
    section: row.section ?? null,
    niche: row.niche ?? null,
    price_usd: row.price_usd ?? null,
    favorites: row.favorites ?? 0,
    views: row.views ?? 0,
    listed_at: row.listed_at ?? null,
    listing_url: row.listing_url ?? null,
  });

  return { inserted: !existing, diffs };
}

/**
 * @param {import('better-sqlite3').Database} db
 * @param {number} etsyListingId
 * @returns {Record<string, unknown> | null}
 */
export function listingByEtsyId(db, etsyListingId) {
  const row = db
    .prepare('SELECT * FROM etsy_listings WHERE etsy_listing_id = ?')
    .get(etsyListingId);
  return row ?? null;
}

/**
 * @param {import('better-sqlite3').Database} db
 * @param {{status?: string, section?: string, niche?: string}} [filters]
 * @returns {Record<string, unknown>[]}
 */
export function allListings(db, filters = {}) {
  const where = [];
  /** @type {Record<string, string>} */
  const params = {};
  if (filters.status) { where.push('status = @status'); params.status = filters.status; }
  if (filters.section) { where.push('section = @section'); params.section = filters.section; }
  if (filters.niche) { where.push('niche = @niche'); params.niche = filters.niche; }
  const sql = `SELECT * FROM etsy_listings ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY listed_at DESC, etsy_listing_id DESC`;
  return db.prepare(sql).all(params);
}
```

Run:

```bash
cd web.ui/backend && npm test -- repo.test
```

Expected output: 3 passing.

- [ ] **Step 3: Commit**

```bash
git add web.ui/backend/etsy/repo.js web.ui/backend/etsy/__tests__/repo.test.js
git commit -m "feat(etsy): upsert + diff repository for etsy_listings"
```

---

## Task 5: Sync orchestrator (syncer.js)

**Files:**
- New: `web.ui/backend/etsy/syncer.js`
- New: `web.ui/backend/etsy/__tests__/syncer.test.js`

The syncer is the "do one pass" orchestrator. It is wired to the 30-min worker in Task 6. Keeping the loop separate from the pass makes the pass directly unit-testable.

- [ ] **Step 1: Failing test for `runSyncPass`**

Create `web.ui/backend/etsy/__tests__/syncer.test.js`:

```javascript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import { runSyncPass } from '../syncer.js';

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
    const result = await runSyncPass({ db, client, emit, now: () => new Date('2026-05-26T12:00:00Z') });
    expect(result.inserted).toBe(1);
    expect(result.updated).toBe(0);
    expect(emit).toHaveBeenCalledWith('etsy:new-listing', expect.objectContaining({ etsy_listing_id: 1001 }));
  });

  it('inserts Day-30/60/90 reminders on newly-active listing', async () => {
    const client = { listAllListings: vi.fn().mockResolvedValue([rowFromEtsy({ original_creation_timestamp: 1748736000 })]) }; // 2025-06-01
    await runSyncPass({ db, client, emit, now: () => new Date('2026-05-26T12:00:00Z') });
    const reminders = db.prepare('SELECT due_at, title FROM reminders ORDER BY due_at').all();
    expect(reminders).toHaveLength(3);
    expect(reminders[0].due_at).toBe('2025-07-01T00:00:00.000Z');
    expect(reminders[1].due_at).toBe('2025-07-31T00:00:00.000Z');
    expect(reminders[2].due_at).toBe('2025-08-30T00:00:00.000Z');
    expect(reminders[0].title).toMatch(/Day-30/);
    expect(reminders[2].title).toMatch(/Day-90/);
  });

  it('emits etsy:status-changed on transition active→inactive', async () => {
    // seed an existing active row
    const client1 = { listAllListings: vi.fn().mockResolvedValue([rowFromEtsy()]) };
    await runSyncPass({ db, client: client1, emit, now: () => new Date('2026-05-26T12:00:00Z') });
    emit.mockClear();

    const client2 = { listAllListings: vi.fn().mockResolvedValue([rowFromEtsy({ state: 'inactive' })]) };
    const result = await runSyncPass({ db, client: client2, emit, now: () => new Date('2026-05-26T12:30:00Z') });

    expect(result.statusChanged).toBe(1);
    expect(emit).toHaveBeenCalledWith(
      'etsy:status-changed',
      expect.objectContaining({ etsy_listing_id: 1001, from: 'active', to: 'inactive' }),
    );
  });

  it('does NOT re-insert reminders for an already-known active listing', async () => {
    const client = { listAllListings: vi.fn().mockResolvedValue([rowFromEtsy()]) };
    await runSyncPass({ db, client, emit, now: () => new Date('2026-05-26T12:00:00Z') });
    await runSyncPass({ db, client, emit, now: () => new Date('2026-05-26T12:30:00Z') });
    const count = db.prepare('SELECT COUNT(*) AS c FROM reminders').get().c;
    expect(count).toBe(3);
  });
});
```

Run:

```bash
cd web.ui/backend && npm test -- syncer.test
```

Expected output: 4 failing tests.

- [ ] **Step 2: Implement `etsy/syncer.js`**

Create `web.ui/backend/etsy/syncer.js`:

```javascript
import { upsertListing, listingByEtsyId } from './repo.js';

/**
 * @typedef {import('./client.js').EtsyListing} EtsyListing
 */

/**
 * Convert an Etsy v3 listing payload to our row shape.
 * @param {EtsyListing} l
 * @returns {import('./repo.js').EtsyListingRow}
 */
function toRow(l) {
  let priceUsd;
  if (l.price && typeof l.price.amount === 'number' && typeof l.price.divisor === 'number' && l.price.divisor !== 0) {
    priceUsd = l.price.amount / l.price.divisor;
  }
  let listedAt;
  if (typeof l.original_creation_timestamp === 'number') {
    listedAt = new Date(l.original_creation_timestamp * 1000).toISOString();
  }
  return {
    etsy_listing_id: l.listing_id,
    title: l.title,
    status: l.state,
    section: l.shop_section_id != null ? String(l.shop_section_id) : undefined,
    price_usd: priceUsd,
    favorites: l.num_favorers ?? 0,
    views: l.views ?? 0,
    listed_at: listedAt,
    listing_url: l.url,
  };
}

/**
 * Insert Day-30/60/90 reminders rooted at `listedAtIso` for an Etsy listing.
 * @param {import('better-sqlite3').Database} db
 * @param {{etsyListingId: number, title: string, listedAtIso: string}} args
 */
function insertGateReminders(db, { etsyListingId, title, listedAtIso }) {
  const base = new Date(listedAtIso).getTime();
  const offsets = [30, 60, 90];
  const insert = db.prepare(
    `INSERT INTO reminders (title, body, due_at, channel, status, source_kind, source_id, payload_json)
     VALUES (@title, @body, @due_at, 'both', 'pending', 'etsy.listing', @source_id, @payload)`,
  );
  for (const days of offsets) {
    const due = new Date(base + days * 24 * 60 * 60 * 1000).toISOString();
    insert.run({
      title: `Etsy Day-${days} revenue check: ${title}`,
      body: `Check favorites/views/sales for Etsy listing "${title}".`,
      due_at: due,
      source_id: etsyListingId,
      payload: JSON.stringify({ days_since_listed: days }),
    });
  }
}

/**
 * @typedef {Object} SyncPassArgs
 * @property {import('better-sqlite3').Database} db
 * @property {{listAllListings: (opts?: any) => Promise<EtsyListing[]>}} client
 * @property {(channel: string, payload: unknown) => void} emit
 * @property {() => Date} [now]
 */

/**
 * Run one Etsy sync pass: list, upsert, diff, emit, and create Day-30/60/90
 * reminders for newly-active listings.
 *
 * Pure orchestration; no timers. The 30-min loop lives in worker.js.
 *
 * @param {SyncPassArgs} args
 * @returns {Promise<{inserted: number, updated: number, statusChanged: number}>}
 */
export async function runSyncPass({ db, client, emit, now = () => new Date() }) {
  const listings = await client.listAllListings({ state: 'active' });
  let inserted = 0;
  let updated = 0;
  let statusChanged = 0;

  const tx = db.transaction(() => {
    for (const listing of listings) {
      const row = toRow(listing);
      const existing = listingByEtsyId(db, row.etsy_listing_id);
      const result = upsertListing(db, row);

      if (result.inserted) {
        inserted += 1;
        emit('etsy:new-listing', { etsy_listing_id: row.etsy_listing_id, title: row.title });
        if (row.status === 'active' && row.listed_at) {
          insertGateReminders(db, {
            etsyListingId: row.etsy_listing_id,
            title: row.title,
            listedAtIso: row.listed_at,
          });
        }
      } else {
        updated += 1;
        if (result.diffs.status) {
          statusChanged += 1;
          emit('etsy:status-changed', {
            etsy_listing_id: row.etsy_listing_id,
            title: row.title,
            from: result.diffs.status.from,
            to: result.diffs.status.to,
          });
        }
        // If a listing was previously non-active and is now active for the
        // first time, also emit gate reminders.
        if (existing && existing.status !== 'active' && row.status === 'active' && row.listed_at) {
          const haveAny = db
            .prepare(
              "SELECT COUNT(*) AS c FROM reminders WHERE source_kind='etsy.listing' AND source_id=?",
            )
            .get(row.etsy_listing_id).c;
          if (haveAny === 0) {
            insertGateReminders(db, {
              etsyListingId: row.etsy_listing_id,
              title: row.title,
              listedAtIso: row.listed_at,
            });
          }
        }
      }
    }
  });
  tx();

  emit('etsy:synced', { at: now().toISOString(), inserted, updated, statusChanged });
  return { inserted, updated, statusChanged };
}
```

Run:

```bash
cd web.ui/backend && npm test -- syncer.test
```

Expected output: 4 passing.

- [ ] **Step 3: Commit**

```bash
git add web.ui/backend/etsy/syncer.js web.ui/backend/etsy/__tests__/syncer.test.js
git commit -m "feat(etsy): sync pass — upsert + diff + Day-30/60/90 reminders + SSE"
```

---

## Task 6: 30-min worker loop (worker.js) + wire into server boot

**Files:**
- New: `web.ui/backend/etsy/worker.js`
- New: `web.ui/backend/etsy/__tests__/worker.test.js`
- Modify: `web.ui/backend/server.js`

- [ ] **Step 1: Failing test for `startEtsyWorker`**

Create `web.ui/backend/etsy/__tests__/worker.test.js`:

```javascript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { startEtsyWorker } from '../worker.js';

describe('startEtsyWorker', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('runs an initial pass then re-runs every interval ms', async () => {
    const runPass = vi.fn().mockResolvedValue({ inserted: 0, updated: 0, statusChanged: 0 });
    const onHeartbeat = vi.fn();
    const onError = vi.fn();
    const stop = startEtsyWorker({
      intervalMs: 1000,
      runPass,
      onHeartbeat,
      onError,
    });
    // Let initial microtasks settle.
    await vi.advanceTimersByTimeAsync(0);
    expect(runPass).toHaveBeenCalledTimes(1);
    expect(onHeartbeat).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1000);
    expect(runPass).toHaveBeenCalledTimes(2);

    stop();
    await vi.advanceTimersByTimeAsync(5000);
    expect(runPass).toHaveBeenCalledTimes(2);
  });

  it('reports errors without stopping the loop', async () => {
    const runPass = vi.fn()
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce({ inserted: 0, updated: 0, statusChanged: 0 });
    const onError = vi.fn();
    const stop = startEtsyWorker({
      intervalMs: 1000,
      runPass,
      onHeartbeat: vi.fn(),
      onError,
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(onError).toHaveBeenCalledWith(expect.stringContaining('boom'));

    await vi.advanceTimersByTimeAsync(1000);
    expect(runPass).toHaveBeenCalledTimes(2);
    stop();
  });
});
```

Run:

```bash
cd web.ui/backend && npm test -- worker.test
```

Expected output: 2 failing tests.

- [ ] **Step 2: Implement `etsy/worker.js`**

Create `web.ui/backend/etsy/worker.js`:

```javascript
import { etsyConfig } from './config.js';
import { ensureFreshToken } from './oauth.js';
import { EtsyClient } from './client.js';
import { runSyncPass } from './syncer.js';
import { setWorkerHeartbeat, setWorkerError } from '../workerStatus.js';

/**
 * @typedef {Object} StartArgs
 * @property {number} intervalMs
 * @property {() => Promise<{inserted: number, updated: number, statusChanged: number}>} runPass
 * @property {() => void} onHeartbeat   Called on every successful pass (production wires this to setWorkerHeartbeat).
 * @property {(message: string) => void} onError   Called with the error message on failure (production wires this to setWorkerError).
 */

/**
 * Drive `runPass` on an interval. Errors do not kill the loop.
 * @param {StartArgs} args
 * @returns {() => void}   stop function
 */
export function startEtsyWorker({ intervalMs, runPass, onHeartbeat, onError }) {
  let cancelled = false;
  /** @type {NodeJS.Timeout | null} */
  let timer = null;

  const tick = async () => {
    if (cancelled) return;
    try {
      await runPass();
      onHeartbeat();
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
    } finally {
      if (!cancelled) timer = setTimeout(tick, intervalMs);
    }
  };
  // schedule first tick as a microtask
  void tick();

  return () => {
    cancelled = true;
    if (timer) clearTimeout(timer);
  };
}

/**
 * Wire defaults from env + DB. Exported for `server.js` to call once at boot.
 * Uses the canonical procedural worker-status API (no factory handle).
 * @param {{db: import('better-sqlite3').Database, emit: (c: string, p: unknown) => void}} deps
 * @returns {() => void}
 */
export function startEtsyWorkerDefault({ db, emit }) {
  const cfg = etsyConfig();
  const client = new EtsyClient({
    keystring: cfg.keystring,
    sharedSecret: cfg.sharedSecret,
    shopId: cfg.shopId,
    getAccessToken: () => ensureFreshToken({ cfg }),
  });
  return startEtsyWorker({
    intervalMs: 30 * 60 * 1000,
    runPass: () => runSyncPass({ db, client, emit }),
    onHeartbeat: () => setWorkerHeartbeat('etsy'),
    onError: (msg) => setWorkerError('etsy', msg),
  });
}
```

Run:

```bash
cd web.ui/backend && npm test -- worker.test
```

Expected output: 2 passing.

- [ ] **Step 3: Wire the worker into `server.js`**

Open `web.ui/backend/server.js`. Locate the section where Plan A wires up background workers (each worker calls `setWorkerHeartbeat`/`setWorkerError` directly with its own name string — there is no factory). Add the Etsy worker boot. Insert before `app.listen(...)`:

```javascript
import { startEtsyWorkerDefault } from './etsy/worker.js';
// ...
if (process.env.ETSY_KEYSTRING) {
  startEtsyWorkerDefault({ db, emit: events.emit });
} else {
  console.warn('[etsy] ETSY_KEYSTRING not set; etsy worker disabled');
}
```

(`startEtsyWorkerDefault` calls `setWorkerHeartbeat('etsy')` / `setWorkerError('etsy', ...)` internally; the caller does not need to thread a worker handle.)

Run a smoke check:

```bash
cd web.ui/backend && npm run typecheck && npm test
```

Expected output: typecheck clean; all Vitest tests green.

- [ ] **Step 4: Commit**

```bash
git add web.ui/backend/etsy/worker.js web.ui/backend/etsy/__tests__/worker.test.js web.ui/backend/server.js
git commit -m "feat(etsy): 30-min syncer worker wired into server boot"
```

---

## Task 7: Etsy HTTP routes (routes.js)

**Files:**
- New: `web.ui/backend/etsy/routes.js`
- New: `web.ui/backend/etsy/__tests__/routes.test.js`
- Modify: `web.ui/backend/server.js`

- [ ] **Step 1: Failing test using supertest**

Create `web.ui/backend/etsy/__tests__/routes.test.js`:

```javascript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import Database from 'better-sqlite3';
import { mountEtsyRoutes } from '../routes.js';

function freshDb() {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE etsy_listings (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      etsy_listing_id INTEGER NOT NULL UNIQUE,
      sku_id TEXT, title TEXT NOT NULL, status TEXT NOT NULL,
      section TEXT, niche TEXT, price_usd REAL,
      favorites INTEGER DEFAULT 0, views INTEGER DEFAULT 0,
      listed_at TEXT,
      last_synced_at TEXT NOT NULL DEFAULT (datetime('now')),
      listing_url TEXT
    );
  `);
  db.prepare(
    `INSERT INTO etsy_listings (etsy_listing_id, title, status, section, niche, price_usd, listed_at, listing_url)
     VALUES
       (1, 'A', 'active', 'Coloring', 'mandala', 4.99, '2026-05-01T00:00:00Z', 'https://etsy.com/listing/1'),
       (2, 'B', 'inactive', 'Coloring', 'cottagecore', 5.99, '2026-04-01T00:00:00Z', 'https://etsy.com/listing/2'),
       (3, 'C', 'active', 'SVG', 'mandala', 2.99, '2026-05-15T00:00:00Z', 'https://etsy.com/listing/3')`,
  ).run();
  return db;
}

function makeApp(db, runSyncPass) {
  const app = express();
  app.use(express.json());
  mountEtsyRoutes(app, { db, runSyncPass });
  return app;
}

describe('GET /api/etsy/listings', () => {
  /** @type {import('better-sqlite3').Database} */
  let db;
  beforeEach(() => { db = freshDb(); });

  it('returns all listings sorted by listed_at desc', async () => {
    const resp = await request(makeApp(db, vi.fn())).get('/api/etsy/listings');
    expect(resp.status).toBe(200);
    expect(resp.body.listings.map((l) => l.etsy_listing_id)).toEqual([3, 1, 2]);
  });

  it('filters by status', async () => {
    const resp = await request(makeApp(db, vi.fn())).get('/api/etsy/listings?status=active');
    expect(resp.status).toBe(200);
    expect(resp.body.listings.map((l) => l.etsy_listing_id)).toEqual([3, 1]);
  });

  it('filters by section and niche together', async () => {
    const resp = await request(makeApp(db, vi.fn())).get('/api/etsy/listings?section=Coloring&niche=mandala');
    expect(resp.status).toBe(200);
    expect(resp.body.listings.map((l) => l.etsy_listing_id)).toEqual([1]);
  });
});

describe('GET /api/etsy/listings/:listingId', () => {
  /** @type {import('better-sqlite3').Database} */
  let db;
  beforeEach(() => { db = freshDb(); });

  it('returns one listing by etsy_listing_id', async () => {
    const resp = await request(makeApp(db, vi.fn())).get('/api/etsy/listings/1');
    expect(resp.status).toBe(200);
    expect(resp.body.title).toBe('A');
  });

  it('404s for unknown id', async () => {
    const resp = await request(makeApp(db, vi.fn())).get('/api/etsy/listings/9999');
    expect(resp.status).toBe(404);
  });
});

describe('POST /api/etsy/sync-now', () => {
  it('invokes runSyncPass and returns its result', async () => {
    const runSyncPass = vi.fn().mockResolvedValue({ inserted: 2, updated: 1, statusChanged: 0 });
    const resp = await request(makeApp(freshDb(), runSyncPass)).post('/api/etsy/sync-now');
    expect(resp.status).toBe(200);
    expect(resp.body).toEqual({ inserted: 2, updated: 1, statusChanged: 0 });
    expect(runSyncPass).toHaveBeenCalledTimes(1);
  });

  it('returns 500 with message when runSyncPass throws', async () => {
    const runSyncPass = vi.fn().mockRejectedValue(new Error('etsy 401'));
    const resp = await request(makeApp(freshDb(), runSyncPass)).post('/api/etsy/sync-now');
    expect(resp.status).toBe(500);
    expect(resp.body.error).toMatch(/etsy 401/);
  });
});
```

Run:

```bash
cd web.ui/backend && npm test -- routes.test
```

Expected output: 7 failing tests.

- [ ] **Step 2: Implement `etsy/routes.js`**

Create `web.ui/backend/etsy/routes.js`:

```javascript
import { allListings, listingByEtsyId } from './repo.js';

/**
 * @typedef {Object} MountArgs
 * @property {import('better-sqlite3').Database} db
 * @property {() => Promise<{inserted: number, updated: number, statusChanged: number}>} runSyncPass
 */

/**
 * Mount Etsy routes on the given Express app.
 * @param {import('express').Express} app
 * @param {MountArgs} args
 */
export function mountEtsyRoutes(app, { db, runSyncPass }) {
  app.get('/api/etsy/listings', (req, res) => {
    /** @type {Record<string, string>} */
    const filters = {};
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    const section = typeof req.query.section === 'string' ? req.query.section : undefined;
    const niche = typeof req.query.niche === 'string' ? req.query.niche : undefined;
    if (status) filters.status = status;
    if (section) filters.section = section;
    if (niche) filters.niche = niche;
    res.json({ listings: allListings(db, filters) });
  });

  app.get('/api/etsy/listings/:listingId', (req, res) => {
    const id = Number.parseInt(req.params.listingId, 10);
    if (!Number.isFinite(id)) {
      res.status(400).json({ error: 'listingId must be numeric' });
      return;
    }
    const row = listingByEtsyId(db, id);
    if (!row) {
      res.status(404).json({ error: `listing ${id} not found` });
      return;
    }
    res.json(row);
  });

  app.post('/api/etsy/sync-now', async (_req, res) => {
    try {
      const result = await runSyncPass();
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });
}
```

Run:

```bash
cd web.ui/backend && npm test -- routes.test
```

Expected output: 7 passing.

- [ ] **Step 3: Mount in `server.js`**

Edit `web.ui/backend/server.js`. Add the import near other route imports:

```javascript
import { mountEtsyRoutes } from './etsy/routes.js';
import { runSyncPass as runEtsySyncPass } from './etsy/syncer.js';
import { etsyConfig } from './etsy/config.js';
import { ensureFreshToken } from './etsy/oauth.js';
import { EtsyClient } from './etsy/client.js';
```

Where Plan A wires its routes (after `app.use(express.json())`, before `app.listen`), add:

```javascript
if (process.env.ETSY_KEYSTRING) {
  const cfg = etsyConfig();
  const etsyClient = new EtsyClient({
    keystring: cfg.keystring,
    sharedSecret: cfg.sharedSecret,
    shopId: cfg.shopId,
    getAccessToken: () => ensureFreshToken({ cfg }),
  });
  mountEtsyRoutes(app, {
    db,
    runSyncPass: () => runEtsySyncPass({ db, client: etsyClient, emit: events.emit }),
  });
}
```

Run full test suite:

```bash
cd web.ui/backend && npm test
```

Expected output: all green.

- [ ] **Step 4: Commit**

```bash
git add web.ui/backend/etsy/routes.js web.ui/backend/etsy/__tests__/routes.test.js web.ui/backend/server.js
git commit -m "feat(etsy): REST routes — listings list/detail + manual sync"
```

---

## Task 8: Frontend `/etsy` page — sortable filterable table

**Files:**
- Modify: `web.ui/frontend-react/src/pages/EtsyCatalog.tsx`
- New: `web.ui/frontend-react/src/pages/__tests__/EtsyCatalog.test.tsx`
- New: `web.ui/frontend-react/src/services/etsyApi.ts`

- [ ] **Step 1: Implement the API service module**

Create `web.ui/frontend-react/src/services/etsyApi.ts`:

```typescript
export interface EtsyListing {
  id: number;
  etsy_listing_id: number;
  sku_id: string | null;
  title: string;
  status: string;
  section: string | null;
  niche: string | null;
  price_usd: number | null;
  favorites: number;
  views: number;
  listed_at: string | null;
  last_synced_at: string;
  listing_url: string | null;
}

export interface EtsyListFilters {
  status?: string;
  section?: string;
  niche?: string;
}

export async function fetchEtsyListings(
  filters: EtsyListFilters = {},
  init?: RequestInit,
): Promise<EtsyListing[]> {
  const qs = new URLSearchParams();
  if (filters.status) qs.set('status', filters.status);
  if (filters.section) qs.set('section', filters.section);
  if (filters.niche) qs.set('niche', filters.niche);
  const resp = await fetch(`/api/etsy/listings?${qs.toString()}`, init);
  if (!resp.ok) throw new Error(`fetchEtsyListings: ${resp.status}`);
  const body = (await resp.json()) as { listings: EtsyListing[] };
  return body.listings;
}

export async function fetchEtsyListing(listingId: number, init?: RequestInit): Promise<EtsyListing> {
  const resp = await fetch(`/api/etsy/listings/${listingId}`, init);
  if (!resp.ok) throw new Error(`fetchEtsyListing: ${resp.status}`);
  return (await resp.json()) as EtsyListing;
}

export async function triggerEtsySync(init?: RequestInit): Promise<{ inserted: number; updated: number; statusChanged: number }> {
  const resp = await fetch('/api/etsy/sync-now', { method: 'POST', ...init });
  if (!resp.ok) throw new Error(`triggerEtsySync: ${resp.status}`);
  return (await resp.json()) as { inserted: number; updated: number; statusChanged: number };
}
```

- [ ] **Step 2: Failing test for the page**

Create `web.ui/frontend-react/src/pages/__tests__/EtsyCatalog.test.tsx`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { EtsyCatalog } from '../EtsyCatalog';
import * as api from '../../services/etsyApi';

vi.mock('../../services/etsyApi');

const sample: api.EtsyListing[] = [
  { id: 1, etsy_listing_id: 101, sku_id: null, title: 'Mandala A', status: 'active', section: 'Coloring', niche: 'mandala', price_usd: 4.99, favorites: 12, views: 200, listed_at: '2026-05-01T00:00:00Z', last_synced_at: '2026-05-26T00:00:00Z', listing_url: 'https://etsy.com/listing/101' },
  { id: 2, etsy_listing_id: 102, sku_id: null, title: 'SVG Pack', status: 'active', section: 'SVG', niche: 'cottagecore', price_usd: 2.99, favorites: 5, views: 80, listed_at: '2026-05-10T00:00:00Z', last_synced_at: '2026-05-26T00:00:00Z', listing_url: 'https://etsy.com/listing/102' },
  { id: 3, etsy_listing_id: 103, sku_id: null, title: 'Inactive thing', status: 'inactive', section: 'Coloring', niche: 'mandala', price_usd: 5.99, favorites: 1, views: 10, listed_at: '2026-04-01T00:00:00Z', last_synced_at: '2026-05-26T00:00:00Z', listing_url: 'https://etsy.com/listing/103' },
];

describe('<EtsyCatalog />', () => {
  beforeEach(() => {
    vi.mocked(api.fetchEtsyListings).mockResolvedValue(sample);
    vi.mocked(api.triggerEtsySync).mockResolvedValue({ inserted: 0, updated: 0, statusChanged: 0 });
  });

  it('renders all listings on mount', async () => {
    render(<MemoryRouter><EtsyCatalog /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText('Mandala A')).toBeInTheDocument());
    expect(screen.getByText('SVG Pack')).toBeInTheDocument();
    expect(screen.getByText('Inactive thing')).toBeInTheDocument();
  });

  it('filters by section chip', async () => {
    render(<MemoryRouter><EtsyCatalog /></MemoryRouter>);
    await waitFor(() => screen.getByText('Mandala A'));
    fireEvent.click(screen.getByRole('button', { name: 'SVG' }));
    await waitFor(() => expect(api.fetchEtsyListings).toHaveBeenLastCalledWith({ section: 'SVG' }));
  });

  it('Sync Now triggers refresh', async () => {
    render(<MemoryRouter><EtsyCatalog /></MemoryRouter>);
    await waitFor(() => screen.getByText('Mandala A'));
    fireEvent.click(screen.getByRole('button', { name: /sync now/i }));
    await waitFor(() => expect(api.triggerEtsySync).toHaveBeenCalled());
  });
});
```

Run:

```bash
cd web.ui/frontend-react && npm test -- EtsyCatalog
```

Expected output: 3 failing tests (the existing page is an empty stub).

- [ ] **Step 3: Implement the page**

Replace `web.ui/frontend-react/src/pages/EtsyCatalog.tsx`:

```typescript
import { useEffect, useMemo, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { fetchEtsyListings, triggerEtsySync, type EtsyListing, type EtsyListFilters } from '../services/etsyApi';
import { useSseChannel } from '../hooks/useSseChannel';

type SortKey = 'title' | 'status' | 'favorites' | 'views' | 'price_usd' | 'listed_at';

function formatPrice(p: number | null): string {
  if (p == null) return '—';
  return `$${p.toFixed(2)}`;
}

function statusBadge(status: string): string {
  switch (status) {
    case 'active': return '🟢 active';
    case 'draft': return '⚪ draft';
    case 'inactive': return '🟡 inactive';
    case 'sold_out': return '🔴 sold out';
    case 'expired': return '🟠 expired';
    default: return status;
  }
}

export function EtsyCatalog() {
  const [filters, setFilters] = useState<EtsyListFilters>({});
  const [rows, setRows] = useState<EtsyListing[]>([]);
  const [sortKey, setSortKey] = useState<SortKey>('listed_at');
  const [sortDesc, setSortDesc] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const data = await fetchEtsyListings(filters);
      setRows(data);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [filters]);

  useEffect(() => { void reload(); }, [reload]);

  useSseChannel<{ etsy_listing_id: number }>('etsy:', () => { void reload(); });

  const sorted = useMemo(() => {
    const copy = [...rows];
    copy.sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (av < bv) return sortDesc ? 1 : -1;
      if (av > bv) return sortDesc ? -1 : 1;
      return 0;
    });
    return copy;
  }, [rows, sortKey, sortDesc]);

  const onSort = (key: SortKey) => {
    if (key === sortKey) setSortDesc(!sortDesc);
    else { setSortKey(key); setSortDesc(true); }
  };

  const toggleChip = (kind: 'status' | 'section' | 'niche', value: string) => {
    setFilters((prev) => {
      const next = { ...prev };
      if (next[kind] === value) delete next[kind];
      else next[kind] = value;
      return next;
    });
  };

  const onSyncNow = async () => {
    setSyncing(true);
    try {
      await triggerEtsySync();
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="etsy-catalog">
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1>Etsy catalog</h1>
        <button onClick={() => void onSyncNow()} disabled={syncing}>
          {syncing ? 'Syncing…' : 'Sync now'}
        </button>
      </header>
      {error && <div role="alert" style={{ color: 'crimson' }}>{error}</div>}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '0.5rem 0' }}>
        {['active', 'inactive', 'draft', 'sold_out', 'expired'].map((s) => (
          <button key={s} aria-pressed={filters.status === s} onClick={() => toggleChip('status', s)}>{s}</button>
        ))}
        {['Coloring', 'SVG', 'Posters'].map((sec) => (
          <button key={sec} aria-pressed={filters.section === sec} onClick={() => toggleChip('section', sec)}>{sec}</button>
        ))}
      </div>
      <table>
        <thead>
          <tr>
            <th><button onClick={() => onSort('title')}>Title</button></th>
            <th><button onClick={() => onSort('status')}>Status</button></th>
            <th>Section</th>
            <th>Niche</th>
            <th><button onClick={() => onSort('price_usd')}>Price</button></th>
            <th><button onClick={() => onSort('favorites')}>Favorites</button></th>
            <th><button onClick={() => onSort('views')}>Views</button></th>
            <th><button onClick={() => onSort('listed_at')}>Listed</button></th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => (
            <tr key={r.etsy_listing_id}>
              <td><Link to={`/etsy/${r.etsy_listing_id}`}>{r.title}</Link></td>
              <td>{statusBadge(r.status)}</td>
              <td>{r.section ?? '—'}</td>
              <td>{r.niche ?? '—'}</td>
              <td>{formatPrice(r.price_usd)}</td>
              <td>{r.favorites}</td>
              <td>{r.views}</td>
              <td>{r.listed_at?.slice(0, 10) ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default EtsyCatalog;
```

Run:

```bash
cd web.ui/frontend-react && npm test -- EtsyCatalog && npm run typecheck
```

Expected output: 3 tests passing; typecheck clean.

- [ ] **Step 4: Commit**

```bash
git add web.ui/frontend-react/src/services/etsyApi.ts web.ui/frontend-react/src/pages/EtsyCatalog.tsx web.ui/frontend-react/src/pages/__tests__/EtsyCatalog.test.tsx
git commit -m "feat(etsy): catalog page with filters, sort, sync-now, SSE refresh"
```

---

## Task 9: Frontend `/etsy/:listingId` detail page

**Files:**
- Modify: `web.ui/frontend-react/src/pages/EtsyListingDetail.tsx`
- New: `web.ui/frontend-react/src/pages/__tests__/EtsyListingDetail.test.tsx`

- [ ] **Step 1: Failing test**

Create `web.ui/frontend-react/src/pages/__tests__/EtsyListingDetail.test.tsx`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { EtsyListingDetail } from '../EtsyListingDetail';
import * as api from '../../services/etsyApi';

vi.mock('../../services/etsyApi');

const listing: api.EtsyListing = {
  id: 1, etsy_listing_id: 101, sku_id: null, title: 'Mandala A',
  status: 'active', section: 'Coloring', niche: 'mandala',
  price_usd: 4.99, favorites: 12, views: 200,
  listed_at: '2026-05-01T00:00:00Z', last_synced_at: '2026-05-26T00:00:00Z',
  listing_url: 'https://etsy.com/listing/101',
};

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/etsy/:listingId" element={<EtsyListingDetail />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('<EtsyListingDetail />', () => {
  beforeEach(() => { vi.mocked(api.fetchEtsyListing).mockResolvedValue(listing); });

  it('renders the listing and a deep-link to Etsy seller dashboard', async () => {
    renderAt('/etsy/101');
    await waitFor(() => screen.getByText('Mandala A'));
    const link = screen.getByRole('link', { name: /open in etsy/i });
    expect(link).toHaveAttribute('href', expect.stringContaining('etsy.com'));
  });

  it('shows a 404 message when fetch fails', async () => {
    vi.mocked(api.fetchEtsyListing).mockRejectedValueOnce(new Error('fetchEtsyListing: 404'));
    renderAt('/etsy/9999');
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/404/));
  });
});
```

Run:

```bash
cd web.ui/frontend-react && npm test -- EtsyListingDetail
```

Expected output: 2 failing.

- [ ] **Step 2: Implement detail page**

Replace `web.ui/frontend-react/src/pages/EtsyListingDetail.tsx`:

```typescript
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { fetchEtsyListing, type EtsyListing } from '../services/etsyApi';

export function EtsyListingDetail() {
  const { listingId } = useParams<{ listingId: string }>();
  const [row, setRow] = useState<EtsyListing | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!listingId) return;
    const id = Number.parseInt(listingId, 10);
    if (!Number.isFinite(id)) { setError('Invalid listing id'); return; }
    setError(null);
    fetchEtsyListing(id)
      .then(setRow)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, [listingId]);

  if (error) return <div role="alert" style={{ color: 'crimson' }}>{error}</div>;
  if (!row) return <div>Loading…</div>;

  const sellerDashboardUrl = `https://www.etsy.com/your/shops/me/tools/listings/${row.etsy_listing_id}`;
  const publicUrl = row.listing_url ?? `https://www.etsy.com/listing/${row.etsy_listing_id}`;

  return (
    <article className="etsy-detail">
      <header>
        <h1>{row.title}</h1>
        <p>Status: {row.status}</p>
      </header>
      <dl>
        <dt>Listing ID</dt><dd>{row.etsy_listing_id}</dd>
        <dt>Section</dt><dd>{row.section ?? '—'}</dd>
        <dt>Niche</dt><dd>{row.niche ?? '—'}</dd>
        <dt>Price (USD)</dt><dd>{row.price_usd != null ? `$${row.price_usd.toFixed(2)}` : '—'}</dd>
        <dt>Favorites</dt><dd>{row.favorites}</dd>
        <dt>Views</dt><dd>{row.views}</dd>
        <dt>Listed at</dt><dd>{row.listed_at?.slice(0, 10) ?? '—'}</dd>
        <dt>Last synced</dt><dd>{row.last_synced_at}</dd>
      </dl>
      <nav style={{ display: 'flex', gap: 8 }}>
        <a href={sellerDashboardUrl} target="_blank" rel="noreferrer">Open in Etsy seller dashboard</a>
        <a href={publicUrl} target="_blank" rel="noreferrer">View public listing</a>
        <Link to="/etsy">Back to catalog</Link>
      </nav>
    </article>
  );
}

export default EtsyListingDetail;
```

Run:

```bash
cd web.ui/frontend-react && npm test -- EtsyListingDetail && npm run typecheck
```

Expected output: 2 passing; typecheck clean.

- [ ] **Step 3: Commit**

```bash
git add web.ui/frontend-react/src/pages/EtsyListingDetail.tsx web.ui/frontend-react/src/pages/__tests__/EtsyListingDetail.test.tsx
git commit -m "feat(etsy): listing detail page with deep-link to seller dashboard"
```

---

## Task 10: Calendar aggregator (pure function)

**Files:**
- New: `web.ui/backend/calendar/aggregator.js`
- New: `web.ui/backend/calendar/__tests__/aggregator.test.js`

The aggregator reads `kdp_books`, `etsy_listings`, `reminders`, `pinterest_queue` and emits a unified array of `{date, kind, title, source_kind, source_id, url}`. Pure — no side effects, fully unit-testable.

- [ ] **Step 1: Failing test**

Create `web.ui/backend/calendar/__tests__/aggregator.test.js`:

```javascript
import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { aggregateCalendarEvents } from '../aggregator.js';

function freshDb() {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE kdp_books (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      subtitle TEXT,
      asin TEXT,
      status TEXT NOT NULL,
      release_date TEXT,
      listing_url TEXT,
      page_count INTEGER, trim_size TEXT, price_usd REAL,
      blurb TEXT, cover_path TEXT, output_dir TEXT NOT NULL,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE etsy_listings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      etsy_listing_id INTEGER NOT NULL UNIQUE,
      sku_id TEXT, title TEXT NOT NULL, status TEXT NOT NULL,
      section TEXT, niche TEXT, price_usd REAL,
      favorites INTEGER DEFAULT 0, views INTEGER DEFAULT 0,
      listed_at TEXT,
      last_synced_at TEXT NOT NULL DEFAULT (datetime('now')),
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
    CREATE TABLE pinterest_queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      kdp_book_id INTEGER, pin_type TEXT NOT NULL,
      image_path TEXT NOT NULL, title TEXT NOT NULL,
      description TEXT NOT NULL, link_url TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('pending','posting','posted','failed','paused')),
      scheduled_for TEXT NOT NULL,
      attempts INTEGER DEFAULT 0, last_error TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
  return db;
}

describe('aggregateCalendarEvents', () => {
  /** @type {import('better-sqlite3').Database} */
  let db;
  beforeEach(() => { db = freshDb(); });

  it('returns empty array for empty DB', () => {
    expect(aggregateCalendarEvents(db, '2026-05-01', '2026-06-01')).toEqual([]);
  });

  it('emits KDP releases for published books with release_date in range', () => {
    db.prepare(
      `INSERT INTO kdp_books (slug, title, status, release_date, asin, output_dir)
       VALUES ('foo', 'Foo', 'published', '2026-05-15', 'B0XYZ', '/tmp/foo')`,
    ).run();
    const events = aggregateCalendarEvents(db, '2026-05-01', '2026-06-01');
    expect(events).toEqual([
      expect.objectContaining({
        kind: 'kdp.release',
        date: '2026-05-15',
        title: expect.stringContaining('Foo'),
        source_kind: 'kdp.book',
        url: '/kdp/foo',
      }),
    ]);
  });

  it('excludes events outside the [from,to) window', () => {
    db.prepare(
      `INSERT INTO kdp_books (slug, title, status, release_date, output_dir)
       VALUES ('old', 'Old', 'published', '2026-04-15', '/tmp/old'),
              ('new', 'New', 'published', '2026-07-15', '/tmp/new')`,
    ).run();
    const events = aggregateCalendarEvents(db, '2026-05-01', '2026-06-01');
    expect(events).toEqual([]);
  });

  it('emits etsy listings as etsy.listed and reminders as reminder.<channel>', () => {
    db.prepare(
      `INSERT INTO etsy_listings (etsy_listing_id, title, status, listed_at)
       VALUES (111, 'Mandala', 'active', '2026-05-10T00:00:00Z')`,
    ).run();
    db.prepare(
      `INSERT INTO reminders (title, due_at, channel, status, source_kind, source_id)
       VALUES ('Day-30 check', '2026-05-20T15:00:00Z', 'both', 'pending', 'etsy.listing', 111)`,
    ).run();
    const events = aggregateCalendarEvents(db, '2026-05-01', '2026-06-01');
    expect(events.find((e) => e.kind === 'etsy.listed')).toEqual(
      expect.objectContaining({ date: '2026-05-10', source_id: 111, url: '/etsy/111' }),
    );
    expect(events.find((e) => e.kind === 'reminder')).toEqual(
      expect.objectContaining({ date: '2026-05-20', title: 'Day-30 check' }),
    );
  });

  it('emits pinterest_queue scheduled_for as pinterest.scheduled', () => {
    db.prepare(
      `INSERT INTO pinterest_queue (kdp_book_id, pin_type, image_path, title, description, link_url, status, scheduled_for)
       VALUES (1, 'cover_hero', '/x.png', 'Pin A', 'desc', 'https://amazon.com/dp/B0', 'pending', '2026-05-12T10:00:00Z')`,
    ).run();
    const events = aggregateCalendarEvents(db, '2026-05-01', '2026-06-01');
    expect(events).toEqual([
      expect.objectContaining({ kind: 'pinterest.scheduled', date: '2026-05-12', title: 'Pin A' }),
    ]);
  });

  it('omits dismissed/fired reminders', () => {
    db.prepare(
      `INSERT INTO reminders (title, due_at, channel, status)
       VALUES ('done', '2026-05-15T00:00:00Z', 'toast', 'dismissed'),
              ('also', '2026-05-15T00:00:00Z', 'toast', 'fired'),
              ('show', '2026-05-15T00:00:00Z', 'toast', 'pending')`,
    ).run();
    const events = aggregateCalendarEvents(db, '2026-05-01', '2026-06-01');
    const titles = events.map((e) => e.title);
    expect(titles).toEqual(['show']);
  });
});
```

Run:

```bash
cd web.ui/backend && npm test -- aggregator.test
```

Expected output: 6 failing.

- [ ] **Step 2: Implement `calendar/aggregator.js`**

Create `web.ui/backend/calendar/aggregator.js`:

```javascript
/**
 * @typedef {Object} CalendarEvent
 * @property {string} date           ISO yyyy-mm-dd
 * @property {string} kind           e.g. 'kdp.release','etsy.listed','reminder','pinterest.scheduled'
 * @property {string} title
 * @property {string} source_kind    e.g. 'kdp.book','etsy.listing','reminder','pinterest.queue'
 * @property {number | string} source_id
 * @property {string} url            in-app route to drill into the source record
 */

/**
 * Aggregate dated rows from kdp_books, etsy_listings, reminders, and
 * pinterest_queue into a single calendar-ready stream within [from, to).
 *
 * `from` and `to` are inclusive-exclusive ISO yyyy-mm-dd strings.
 *
 * @param {import('better-sqlite3').Database} db
 * @param {string} from
 * @param {string} to
 * @returns {CalendarEvent[]}
 */
export function aggregateCalendarEvents(db, from, to) {
  /** @type {CalendarEvent[]} */
  const out = [];

  // KDP releases
  const kdpRows = db
    .prepare(
      `SELECT slug, title, release_date
       FROM kdp_books
       WHERE release_date IS NOT NULL
         AND release_date >= ? AND release_date < ?`,
    )
    .all(from, to);
  for (const r of kdpRows) {
    out.push({
      date: r.release_date,
      kind: 'kdp.release',
      title: `KDP release: ${r.title}`,
      source_kind: 'kdp.book',
      source_id: r.slug,
      url: `/kdp/${r.slug}`,
    });
  }

  // Etsy listings — using the date portion of listed_at
  const etsyRows = db
    .prepare(
      `SELECT etsy_listing_id, title, listed_at
       FROM etsy_listings
       WHERE listed_at IS NOT NULL
         AND substr(listed_at, 1, 10) >= ?
         AND substr(listed_at, 1, 10) < ?`,
    )
    .all(from, to);
  for (const r of etsyRows) {
    out.push({
      date: r.listed_at.slice(0, 10),
      kind: 'etsy.listed',
      title: `Etsy listed: ${r.title}`,
      source_kind: 'etsy.listing',
      source_id: r.etsy_listing_id,
      url: `/etsy/${r.etsy_listing_id}`,
    });
  }

  // Reminders — only pending; date portion of due_at; carry source link if any
  const reminderRows = db
    .prepare(
      `SELECT id, title, due_at, source_kind, source_id
       FROM reminders
       WHERE status = 'pending'
         AND substr(due_at, 1, 10) >= ?
         AND substr(due_at, 1, 10) < ?`,
    )
    .all(from, to);
  for (const r of reminderRows) {
    let url = `/calendar`;
    if (r.source_kind === 'kdp.book' && r.source_id != null) {
      // source_id for KDP reminders is the slug stored as string OR id; both are OK in v1.
      url = `/kdp/${r.source_id}`;
    } else if (r.source_kind === 'etsy.listing' && r.source_id != null) {
      url = `/etsy/${r.source_id}`;
    } else if (r.source_kind === 'pinterest.queue' && r.source_id != null) {
      url = `/pinterest`;
    }
    out.push({
      date: r.due_at.slice(0, 10),
      kind: 'reminder',
      title: r.title,
      source_kind: 'reminder',
      source_id: r.id,
      url,
    });
  }

  // Pinterest queue
  const pinRows = db
    .prepare(
      `SELECT id, title, scheduled_for
       FROM pinterest_queue
       WHERE substr(scheduled_for, 1, 10) >= ?
         AND substr(scheduled_for, 1, 10) < ?`,
    )
    .all(from, to);
  for (const r of pinRows) {
    out.push({
      date: r.scheduled_for.slice(0, 10),
      kind: 'pinterest.scheduled',
      title: r.title,
      source_kind: 'pinterest.queue',
      source_id: r.id,
      url: `/pinterest`,
    });
  }

  out.sort((a, b) => a.date.localeCompare(b.date) || a.kind.localeCompare(b.kind));
  return out;
}
```

Run:

```bash
cd web.ui/backend && npm test -- aggregator.test
```

Expected output: 6 passing.

- [ ] **Step 3: Commit**

```bash
git add web.ui/backend/calendar/aggregator.js web.ui/backend/calendar/__tests__/aggregator.test.js
git commit -m "feat(calendar): pure aggregator over kdp/etsy/reminder/pinterest"
```

---

## Task 11: Calendar HTTP route (routes.js)

**Files:**
- New: `web.ui/backend/calendar/routes.js`
- New: `web.ui/backend/calendar/__tests__/routes.test.js`
- Modify: `web.ui/backend/server.js`

- [ ] **Step 1: Failing test**

Create `web.ui/backend/calendar/__tests__/routes.test.js`:

```javascript
import { describe, it, expect, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import Database from 'better-sqlite3';
import { mountCalendarRoutes } from '../routes.js';

function freshDb() {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE kdp_books (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT NOT NULL UNIQUE, title TEXT NOT NULL,
      subtitle TEXT, asin TEXT, status TEXT NOT NULL,
      release_date TEXT, listing_url TEXT,
      page_count INTEGER, trim_size TEXT, price_usd REAL,
      blurb TEXT, cover_path TEXT, output_dir TEXT NOT NULL,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE etsy_listings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      etsy_listing_id INTEGER NOT NULL UNIQUE,
      sku_id TEXT, title TEXT NOT NULL, status TEXT NOT NULL,
      section TEXT, niche TEXT, price_usd REAL,
      favorites INTEGER DEFAULT 0, views INTEGER DEFAULT 0,
      listed_at TEXT,
      last_synced_at TEXT NOT NULL DEFAULT (datetime('now')),
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
    CREATE TABLE pinterest_queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      kdp_book_id INTEGER, pin_type TEXT NOT NULL,
      image_path TEXT NOT NULL, title TEXT NOT NULL,
      description TEXT NOT NULL, link_url TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('pending','posting','posted','failed','paused')),
      scheduled_for TEXT NOT NULL,
      attempts INTEGER DEFAULT 0, last_error TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
  db.prepare(
    `INSERT INTO kdp_books (slug, title, status, release_date, output_dir)
     VALUES ('foo', 'Foo', 'published', '2026-05-15', '/tmp/foo')`,
  ).run();
  return db;
}

function makeApp(db) {
  const app = express();
  mountCalendarRoutes(app, { db });
  return app;
}

describe('GET /api/calendar/events', () => {
  /** @type {import('better-sqlite3').Database} */
  let db;
  beforeEach(() => { db = freshDb(); });

  it('returns events in the [from,to) window', async () => {
    const resp = await request(makeApp(db))
      .get('/api/calendar/events?from=2026-05-01&to=2026-06-01');
    expect(resp.status).toBe(200);
    expect(resp.body.events).toHaveLength(1);
    expect(resp.body.events[0]).toMatchObject({ kind: 'kdp.release', date: '2026-05-15' });
  });

  it('400s on missing from or to', async () => {
    const resp = await request(makeApp(db)).get('/api/calendar/events');
    expect(resp.status).toBe(400);
  });

  it('400s on invalid date strings', async () => {
    const resp = await request(makeApp(db))
      .get('/api/calendar/events?from=garbage&to=2026-06-01');
    expect(resp.status).toBe(400);
  });
});
```

Run:

```bash
cd web.ui/backend && npm test -- routes.test
```

Expected output: 3 new failing (plus the previously-passing etsy routes still green).

- [ ] **Step 2: Implement `calendar/routes.js`**

Create `web.ui/backend/calendar/routes.js`:

```javascript
import { aggregateCalendarEvents } from './aggregator.js';

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * @param {import('express').Express} app
 * @param {{db: import('better-sqlite3').Database}} args
 */
export function mountCalendarRoutes(app, { db }) {
  app.get('/api/calendar/events', (req, res) => {
    const from = typeof req.query.from === 'string' ? req.query.from : '';
    const to = typeof req.query.to === 'string' ? req.query.to : '';
    if (!from || !to) {
      res.status(400).json({ error: 'from and to query params are required (yyyy-mm-dd)' });
      return;
    }
    if (!ISO_DATE_RE.test(from) || !ISO_DATE_RE.test(to)) {
      res.status(400).json({ error: 'from/to must be ISO yyyy-mm-dd' });
      return;
    }
    const events = aggregateCalendarEvents(db, from, to);
    res.json({ events });
  });
}
```

Run:

```bash
cd web.ui/backend && npm test
```

Expected output: all green.

- [ ] **Step 3: Mount in `server.js`**

Edit `web.ui/backend/server.js`. Add:

```javascript
import { mountCalendarRoutes } from './calendar/routes.js';
// ...
mountCalendarRoutes(app, { db });
```

Run:

```bash
cd web.ui/backend && npm run typecheck && npm test
```

Expected output: typecheck clean, all tests green.

- [ ] **Step 4: Commit**

```bash
git add web.ui/backend/calendar/routes.js web.ui/backend/calendar/__tests__/routes.test.js web.ui/backend/server.js
git commit -m "feat(calendar): /api/calendar/events route over aggregator"
```

---

## Task 12: Reminder action routes (snooze / dismiss)

**Files:**
- New: `web.ui/backend/reminders/routes.js`
- New: `web.ui/backend/reminders/__tests__/routes.test.js`
- Modify: `web.ui/backend/server.js`

The Calendar drawer needs to act on reminders (snooze / dismiss). Plan D owns reminder *firing*; Plan C owns these CRUD endpoints because the Calendar page is the first consumer.

- [ ] **Step 1: Failing test**

Create `web.ui/backend/reminders/__tests__/routes.test.js`:

```javascript
import { describe, it, expect, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import Database from 'better-sqlite3';
import { mountReminderActionRoutes } from '../routes.js';

function freshDb() {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE reminders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL, body TEXT, due_at TEXT NOT NULL,
      channel TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('pending','fired','dismissed','failed')),
      source_kind TEXT, source_id INTEGER, payload_json TEXT,
      fired_at TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
  db.prepare(
    `INSERT INTO reminders (title, due_at, channel, status)
     VALUES ('R1', '2026-06-01T00:00:00Z', 'both', 'pending')`,
  ).run();
  return db;
}

function makeApp(db) {
  const app = express();
  app.use(express.json());
  mountReminderActionRoutes(app, { db });
  return app;
}

describe('POST /api/reminders/:id/dismiss', () => {
  it('marks the reminder dismissed', async () => {
    const db = freshDb();
    const resp = await request(makeApp(db)).post('/api/reminders/1/dismiss');
    expect(resp.status).toBe(200);
    const row = db.prepare('SELECT status FROM reminders WHERE id=1').get();
    expect(row.status).toBe('dismissed');
  });

  it('404s for unknown id', async () => {
    const resp = await request(makeApp(freshDb())).post('/api/reminders/9999/dismiss');
    expect(resp.status).toBe(404);
  });
});

describe('POST /api/reminders/:id/snooze', () => {
  it('shifts due_at by the given hours', async () => {
    const db = freshDb();
    const resp = await request(makeApp(db))
      .post('/api/reminders/1/snooze')
      .send({ hours: 24 });
    expect(resp.status).toBe(200);
    const row = db.prepare('SELECT due_at FROM reminders WHERE id=1').get();
    expect(row.due_at).toBe('2026-06-02T00:00:00.000Z');
  });

  it('400s on missing/invalid hours', async () => {
    const resp = await request(makeApp(freshDb()))
      .post('/api/reminders/1/snooze')
      .send({});
    expect(resp.status).toBe(400);
  });
});
```

Run:

```bash
cd web.ui/backend && npm test -- reminders/routes
```

Expected output: 4 failing.

- [ ] **Step 2: Implement `reminders/routes.js`**

Create `web.ui/backend/reminders/routes.js`:

```javascript
/**
 * Reminder mutation endpoints used by the calendar drawer.
 *
 * Firing/delivery is owned by Plan D; this module only exposes user actions
 * on rows: snooze (shift due_at) and dismiss (set status=dismissed).
 *
 * @param {import('express').Express} app
 * @param {{db: import('better-sqlite3').Database}} args
 */
export function mountReminderActionRoutes(app, { db }) {
  app.post('/api/reminders/:id/dismiss', (req, res) => {
    const id = Number.parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) { res.status(400).json({ error: 'id must be numeric' }); return; }
    const row = db.prepare('SELECT id FROM reminders WHERE id=?').get(id);
    if (!row) { res.status(404).json({ error: `reminder ${id} not found` }); return; }
    db.prepare("UPDATE reminders SET status='dismissed' WHERE id=?").run(id);
    res.json({ ok: true });
  });

  app.post('/api/reminders/:id/snooze', (req, res) => {
    const id = Number.parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) { res.status(400).json({ error: 'id must be numeric' }); return; }
    const hoursRaw = req.body?.hours;
    const hours = Number(hoursRaw);
    if (!Number.isFinite(hours) || hours <= 0) {
      res.status(400).json({ error: 'hours must be a positive number' });
      return;
    }
    const row = db.prepare('SELECT due_at FROM reminders WHERE id=?').get(id);
    if (!row) { res.status(404).json({ error: `reminder ${id} not found` }); return; }
    const next = new Date(new Date(row.due_at).getTime() + hours * 3600 * 1000).toISOString();
    db.prepare('UPDATE reminders SET due_at=? WHERE id=?').run(next, id);
    res.json({ ok: true, due_at: next });
  });
}
```

Run:

```bash
cd web.ui/backend && npm test -- reminders/routes
```

Expected output: 4 passing.

- [ ] **Step 3: Mount in `server.js`**

Edit `web.ui/backend/server.js`. Add:

```javascript
import { mountReminderActionRoutes } from './reminders/routes.js';
// ...
mountReminderActionRoutes(app, { db });
```

Run:

```bash
cd web.ui/backend && npm test
```

Expected output: all green.

- [ ] **Step 4: Commit**

```bash
git add web.ui/backend/reminders/routes.js web.ui/backend/reminders/__tests__/routes.test.js web.ui/backend/server.js
git commit -m "feat(reminders): snooze + dismiss action endpoints for calendar drawer"
```

---

## Task 13: Frontend `/calendar` page — FullCalendar + filter chips + drawer

**Files:**
- New: `web.ui/frontend-react/src/services/calendarApi.ts`
- New: `web.ui/frontend-react/src/services/reminderApi.ts`
- Modify: `web.ui/frontend-react/src/pages/Calendar.tsx`
- New: `web.ui/frontend-react/src/pages/__tests__/Calendar.test.tsx`

- [ ] **Step 1: API services**

Create `web.ui/frontend-react/src/services/calendarApi.ts`:

```typescript
export interface CalendarEvent {
  date: string;            // ISO yyyy-mm-dd
  kind: string;            // 'kdp.release' | 'etsy.listed' | 'reminder' | 'pinterest.scheduled'
  title: string;
  source_kind: string;
  source_id: number | string;
  url: string;
}

export async function fetchCalendarEvents(
  from: string,
  to: string,
  init?: RequestInit,
): Promise<CalendarEvent[]> {
  const resp = await fetch(`/api/calendar/events?from=${from}&to=${to}`, init);
  if (!resp.ok) throw new Error(`fetchCalendarEvents: ${resp.status}`);
  const body = (await resp.json()) as { events: CalendarEvent[] };
  return body.events;
}
```

Create `web.ui/frontend-react/src/services/reminderApi.ts`:

```typescript
export async function dismissReminder(id: number, init?: RequestInit): Promise<void> {
  const resp = await fetch(`/api/reminders/${id}/dismiss`, { method: 'POST', ...init });
  if (!resp.ok) throw new Error(`dismissReminder: ${resp.status}`);
}

export async function snoozeReminder(id: number, hours: number, init?: RequestInit): Promise<void> {
  const resp = await fetch(`/api/reminders/${id}/snooze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ hours }),
    ...init,
  });
  if (!resp.ok) throw new Error(`snoozeReminder: ${resp.status}`);
}
```

- [ ] **Step 2: Failing test for the page**

Create `web.ui/frontend-react/src/pages/__tests__/Calendar.test.tsx`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Calendar } from '../Calendar';
import * as calApi from '../../services/calendarApi';
import * as remApi from '../../services/reminderApi';

vi.mock('../../services/calendarApi');
vi.mock('../../services/reminderApi');

const events: calApi.CalendarEvent[] = [
  { date: '2026-05-15', kind: 'kdp.release', title: 'KDP release: Foo', source_kind: 'kdp.book', source_id: 'foo', url: '/kdp/foo' },
  { date: '2026-05-20', kind: 'etsy.listed', title: 'Etsy listed: Mandala', source_kind: 'etsy.listing', source_id: 111, url: '/etsy/111' },
  { date: '2026-05-22', kind: 'reminder', title: 'Day-30 check', source_kind: 'reminder', source_id: 7, url: '/etsy/111' },
];

describe('<Calendar />', () => {
  beforeEach(() => {
    vi.mocked(calApi.fetchCalendarEvents).mockResolvedValue(events);
    vi.mocked(remApi.dismissReminder).mockResolvedValue();
    vi.mocked(remApi.snoozeReminder).mockResolvedValue();
  });

  it('fetches events on mount and renders titles', async () => {
    render(<MemoryRouter><Calendar /></MemoryRouter>);
    await waitFor(() => expect(calApi.fetchCalendarEvents).toHaveBeenCalled());
    expect(screen.getByText(/KDP release: Foo/)).toBeInTheDocument();
    expect(screen.getByText(/Etsy listed: Mandala/)).toBeInTheDocument();
    expect(screen.getByText(/Day-30 check/)).toBeInTheDocument();
  });

  it('toggling a kind chip hides events of that kind', async () => {
    render(<MemoryRouter><Calendar /></MemoryRouter>);
    await waitFor(() => screen.getByText(/KDP release: Foo/));
    fireEvent.click(screen.getByRole('button', { name: /kdp/i }));
    await waitFor(() => expect(screen.queryByText(/KDP release: Foo/)).not.toBeInTheDocument());
    expect(screen.getByText(/Etsy listed: Mandala/)).toBeInTheDocument();
  });

  it('clicking a reminder opens the drawer with Snooze / Dismiss', async () => {
    render(<MemoryRouter><Calendar /></MemoryRouter>);
    await waitFor(() => screen.getByText(/Day-30 check/));
    fireEvent.click(screen.getByText(/Day-30 check/));
    expect(await screen.findByRole('button', { name: /snooze 24h/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /dismiss/i }));
    await waitFor(() => expect(remApi.dismissReminder).toHaveBeenCalledWith(7));
  });
});
```

Run:

```bash
cd web.ui/frontend-react && npm test -- Calendar
```

Expected output: 3 failing.

- [ ] **Step 3: Implement the page**

Replace `web.ui/frontend-react/src/pages/Calendar.tsx`:

```typescript
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import type { EventClickArg, EventInput } from '@fullcalendar/core';
import { fetchCalendarEvents, type CalendarEvent } from '../services/calendarApi';
import { dismissReminder, snoozeReminder } from '../services/reminderApi';

const KIND_COLORS: Record<string, string> = {
  'kdp.release': '#4a90d9',
  'etsy.listed': '#d96b4a',
  'reminder': '#e3b341',
  'pinterest.scheduled': '#c4488f',
};

const KIND_LABELS: Record<string, string> = {
  'kdp.release': 'KDP releases',
  'etsy.listed': 'Etsy listings',
  'reminder': 'Reminders',
  'pinterest.scheduled': 'Pinterest pins',
};

const ALL_KINDS = Object.keys(KIND_COLORS);

function defaultWindow(): { from: string; to: string } {
  const today = new Date();
  const from = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  const to = new Date(today.getFullYear(), today.getMonth() + 2, 1);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return { from: fmt(from), to: fmt(to) };
}

export function Calendar() {
  const [enabled, setEnabled] = useState<Set<string>>(new Set(ALL_KINDS));
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [selected, setSelected] = useState<CalendarEvent | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const { from, to } = defaultWindow();
      const data = await fetchCalendarEvents(from, to);
      setEvents(data);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => { void reload(); }, [reload]);

  const visible = useMemo(() => events.filter((e) => enabled.has(e.kind)), [events, enabled]);

  const fcEvents: EventInput[] = useMemo(
    () => visible.map((e, i) => ({
      id: `${e.source_kind}:${e.source_id}:${i}`,
      title: e.title,
      start: e.date,
      allDay: true,
      backgroundColor: KIND_COLORS[e.kind] ?? '#999',
      borderColor: KIND_COLORS[e.kind] ?? '#999',
      extendedProps: { calEvent: e },
    })),
    [visible],
  );

  const toggleKind = (kind: string) => {
    setEnabled((prev) => {
      const next = new Set(prev);
      if (next.has(kind)) next.delete(kind);
      else next.add(kind);
      return next;
    });
  };

  const onEventClick = (arg: EventClickArg) => {
    const ev = arg.event.extendedProps.calEvent as CalendarEvent | undefined;
    if (ev) setSelected(ev);
  };

  const onSnooze = async (hours: number) => {
    if (!selected || selected.source_kind !== 'reminder') return;
    await snoozeReminder(Number(selected.source_id), hours);
    setSelected(null);
    await reload();
  };

  const onDismiss = async () => {
    if (!selected || selected.source_kind !== 'reminder') return;
    await dismissReminder(Number(selected.source_id));
    setSelected(null);
    await reload();
  };

  return (
    <div className="calendar-page">
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1>Calendar</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          {ALL_KINDS.map((k) => (
            <button
              key={k}
              aria-pressed={enabled.has(k)}
              onClick={() => toggleKind(k)}
              style={{ background: enabled.has(k) ? KIND_COLORS[k] : 'transparent', color: enabled.has(k) ? 'white' : 'inherit' }}
            >
              {KIND_LABELS[k]}
            </button>
          ))}
        </div>
      </header>
      {error && <div role="alert" style={{ color: 'crimson' }}>{error}</div>}
      <FullCalendar
        plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
        initialView="dayGridMonth"
        headerToolbar={{ left: 'prev,next today', center: 'title', right: 'dayGridMonth,timeGridWeek,timeGridDay' }}
        events={fcEvents}
        eventClick={onEventClick}
        height="auto"
      />
      {selected && (
        <aside
          aria-label="event details"
          style={{ position: 'fixed', right: 0, top: 0, width: 360, height: '100vh', background: 'white', boxShadow: '-4px 0 16px rgba(0,0,0,0.1)', padding: 16, overflowY: 'auto' }}
        >
          <button onClick={() => setSelected(null)} aria-label="close drawer">×</button>
          <h2>{selected.title}</h2>
          <p>Kind: {selected.kind}</p>
          <p>Date: {selected.date}</p>
          <Link to={selected.url}>Open source</Link>
          {selected.source_kind === 'reminder' && (
            <div style={{ marginTop: 16, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button onClick={() => void onSnooze(1)}>Snooze 1h</button>
              <button onClick={() => void onSnooze(24)}>Snooze 24h</button>
              <button onClick={() => void onSnooze(24 * 7)}>Snooze 1w</button>
              <button onClick={() => void onDismiss()}>Dismiss</button>
            </div>
          )}
        </aside>
      )}
    </div>
  );
}

export default Calendar;
```

Run:

```bash
cd web.ui/frontend-react && npm test -- Calendar && npm run typecheck
```

Expected output: 3 passing; typecheck clean.

- [ ] **Step 4: Commit**

```bash
git add web.ui/frontend-react/src/services/calendarApi.ts web.ui/frontend-react/src/services/reminderApi.ts web.ui/frontend-react/src/pages/Calendar.tsx web.ui/frontend-react/src/pages/__tests__/Calendar.test.tsx
git commit -m "feat(calendar): FullCalendar page with kind filters + reminder drawer"
```

---

## Task 14: SSE refresh on `etsy:*` for the Calendar page

**Files:**
- Modify: `web.ui/frontend-react/src/pages/Calendar.tsx`
- Modify: `web.ui/frontend-react/src/pages/__tests__/Calendar.test.tsx`

The catalog page (Task 8) already reloads on `etsy:*` SSE events. Mirror that on the calendar so newly-listed Etsy items and newly-inserted reminders appear without a manual refresh.

- [ ] **Step 1: Add a failing test**

Append to `web.ui/frontend-react/src/pages/__tests__/Calendar.test.tsx` inside the existing `describe('<Calendar />')`:

```typescript
  it('reloads when an etsy:* SSE event fires', async () => {
    // Capture the handler registered by the SSE hook.
    const handlers: Array<{ prefix: string; fn: (e: unknown) => void }> = [];
    vi.doMock('../../hooks/useSseChannel', () => ({
      useSseChannel: (prefix: string, fn: (e: unknown) => void) => { handlers.push({ prefix, fn }); },
    }));
    // Re-import the module with the mocked hook in place.
    const { Calendar: CalendarWithMock } = await import('../Calendar');

    render(<MemoryRouter><CalendarWithMock /></MemoryRouter>);
    await waitFor(() => expect(calApi.fetchCalendarEvents).toHaveBeenCalledTimes(1));
    const etsyHandler = handlers.find((h) => h.prefix === 'etsy:');
    expect(etsyHandler).toBeDefined();
    etsyHandler!.fn({ etsy_listing_id: 999 });
    await waitFor(() => expect(calApi.fetchCalendarEvents).toHaveBeenCalledTimes(2));
  });
```

Run:

```bash
cd web.ui/frontend-react && npm test -- Calendar
```

Expected output: the new test fails (`handlers.find` returns undefined).

- [ ] **Step 2: Wire `useSseChannel` into `Calendar.tsx`**

Edit `web.ui/frontend-react/src/pages/Calendar.tsx`. Add the import near the others:

```typescript
import { useSseChannel } from '../hooks/useSseChannel';
```

Inside the `Calendar` component, after `useEffect(() => { void reload(); }, [reload]);`, add:

```typescript
  useSseChannel<unknown>('etsy:', () => { void reload(); });
  useSseChannel<unknown>('reminder:', () => { void reload(); });
  useSseChannel<unknown>('kdp:', () => { void reload(); });
  useSseChannel<unknown>('pinterest:', () => { void reload(); });
```

Run:

```bash
cd web.ui/frontend-react && npm test -- Calendar && npm run typecheck
```

Expected output: 4 passing; typecheck clean.

- [ ] **Step 3: Commit**

```bash
git add web.ui/frontend-react/src/pages/Calendar.tsx web.ui/frontend-react/src/pages/__tests__/Calendar.test.tsx
git commit -m "feat(calendar): live refresh on etsy/reminder/kdp/pinterest SSE channels"
```

---

## Task 15: End-to-end smoke run + final cleanup

**Files:** (verification only)

- [ ] **Step 1: Run the full backend test suite**

```bash
cd web.ui/backend && npm test
```

Expected output: every Vitest test green; no warnings about open handles. If anything fails, fix before moving on.

- [ ] **Step 2: Run the full frontend test suite + typecheck + lint**

```bash
cd web.ui/frontend-react && npm test && npm run typecheck
```

Expected output: every Vitest test green; tsc emits nothing.

- [ ] **Step 3: Boot the server and hit the new endpoints**

In one shell:

```bash
cd web.ui/backend && npm start
```

Wait for `listening on http://127.0.0.1:5000`.

In a second shell:

```bash
curl -s "http://127.0.0.1:5000/api/etsy/listings" | head -c 500
curl -s "http://127.0.0.1:5000/api/calendar/events?from=2026-05-01&to=2026-07-01" | head -c 500
```

Expected output: both return JSON with at least `{"listings": …}` or `{"events": …}` keys (empty arrays are fine on a fresh DB). HTTP status 200.

Stop the server (Ctrl-C).

- [ ] **Step 4: Verify `.env.example` is complete**

Open `web.ui/backend/.env.example`. Confirm it contains:

- `ETSY_KEYSTRING`
- `ETSY_SHARED_SECRET`
- `ETSY_SHOP_ID`
- `ETSY_TOKEN_PATH` (commented or optional)

If any are missing, add them, then:

```bash
git add web.ui/backend/.env.example
git commit -m "chore(etsy): finalize .env.example for Plan C variables"
```

(Skip the commit if nothing changed.)

- [ ] **Step 5: Sanity-check git log**

```bash
git log --oneline -15
```

Expected output: 12–14 new commits with `feat(etsy):`, `feat(calendar):`, and `feat(reminders):` prefixes. No leftover WIP commits.

Plan C complete. Hand off to Plan D (reminders firing + Pinterest) and Plan E (profile + help).
