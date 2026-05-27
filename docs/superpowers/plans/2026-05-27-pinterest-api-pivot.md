# Pinterest API Pivot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Plan E Playwright-based Pinterest poster with direct v5 API calls. Keep all of Plan E's pin image generation, queue, scheduler, and UI shell. Rewrite poster.js to use a new api_client.js + api_oauth.js pair (mirroring etsy/oauth.js + etsy/client.js). Delete login.js + the POST /login route. Add whoami/boards/token-status routes for the new Settings UI.

**Architecture:** Two commits. (1) Backend pivot: add api_oauth.js (30-day token refresh) + api_client.js (Pinterest v5 wrapper with 401-retry + 429-backoff + 5xx-retry); rewrite poster.js; delete login surface; add whoami/boards/token-status routes. (2) Frontend pivot: rewrite PinterestSettings with token status + board picker + test-connection + refresh-token controls; rename help article.

**Tech Stack:** Node 18+, Express, fetch, msw (test HTTP mocks), Vitest, supertest, React 19 + TypeScript.

**Spec reference:** [`docs/superpowers/specs/2026-05-27-pinterest-api-pivot-design.md`](../specs/2026-05-27-pinterest-api-pivot-design.md)

---

## Commit 1 — `refactor(pinterest): replace Playwright poster with v5 API`

### Task 1: `api_oauth.js` + tests (TDD)

**Files:**
- Create: `web.ui/backend/pinterest/api_oauth.js`
- Test: `web.ui/backend/__tests__/pinterest/api_oauth.test.js`

- [ ] **Step 1: Write the failing test file**

Create `web.ui/backend/__tests__/pinterest/api_oauth.test.js`:

```javascript
/**
 * Tests for pinterest/api_oauth.js — ensureFreshToken().
 *
 * Mirrors the Etsy oauth.test.js pattern (vi-mocked fetch) so no real
 * Pinterest endpoint is hit. msw is reserved for api_client.test.js where
 * the broader 401/429/5xx routing is easier to exercise via interceptors.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ensureFreshToken } from '../../pinterest/api_oauth.js';

const NOW_MS = 1_700_000_000_000;

function makeArgs(tokenPath, overrides = {}) {
  return {
    tokenStorePath: tokenPath,
    appId: '1572111',
    appSecret: 'shh-secret',
    ...overrides,
  };
}

function writeToken(tokenPath, payload) {
  fs.mkdirSync(path.dirname(tokenPath), { recursive: true });
  fs.writeFileSync(tokenPath, JSON.stringify(payload), 'utf8');
}

let tmpDir;
let tokenPath;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pin-oauth-'));
  tokenPath = path.join(tmpDir, 'pinterest_token.json');
  vi.spyOn(Date, 'now').mockReturnValue(NOW_MS);
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

describe('ensureFreshToken', () => {
  it('returns cached access_token when expires_at is more than 5 minutes away', async () => {
    writeToken(tokenPath, {
      access_token: 'cached',
      refresh_token: 'rrr',
      expires_at: new Date(NOW_MS + 10 * 60 * 1000).toISOString(),
    });
    const fetchSpy = vi.fn();
    const token = await ensureFreshToken({ ...makeArgs(tokenPath), fetchFn: fetchSpy });
    expect(token).toBe('cached');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('refreshes when expires_at is within the 5-minute skew', async () => {
    writeToken(tokenPath, {
      access_token: 'old',
      refresh_token: 'rrr',
      expires_at: new Date(NOW_MS + 60_000).toISOString(),
    });
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ access_token: 'new', refresh_token: 'rrr2', expires_in: 2592000 }),
    });
    const token = await ensureFreshToken({ ...makeArgs(tokenPath), fetchFn: fetchSpy });
    expect(token).toBe('new');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe('https://api.pinterest.com/v5/oauth/token');
    expect(init.method).toBe('POST');
    expect(init.headers['Content-Type']).toBe('application/x-www-form-urlencoded');
    expect(init.headers['Authorization']).toBe(
      'Basic ' + Buffer.from('1572111:shh-secret').toString('base64'),
    );
    expect(String(init.body)).toContain('grant_type=refresh_token');
    expect(String(init.body)).toContain('refresh_token=rrr');
    const persisted = JSON.parse(fs.readFileSync(tokenPath, 'utf8'));
    expect(persisted.access_token).toBe('new');
    expect(persisted.refresh_token).toBe('rrr2');
    expect(new Date(persisted.expires_at).getTime()).toBe(NOW_MS + 2592000 * 1000);
  });

  it('preserves old refresh_token when response omits a new one', async () => {
    writeToken(tokenPath, {
      access_token: 'old',
      refresh_token: 'keep-me',
      expires_at: new Date(NOW_MS - 5_000).toISOString(),
    });
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ access_token: 'fresh', expires_in: 600 }),
    });
    await ensureFreshToken({ ...makeArgs(tokenPath), fetchFn: fetchSpy });
    const persisted = JSON.parse(fs.readFileSync(tokenPath, 'utf8'));
    expect(persisted.refresh_token).toBe('keep-me');
    expect(persisted.access_token).toBe('fresh');
  });

  it('throws "re-auth required" on 401 refresh response', async () => {
    writeToken(tokenPath, {
      access_token: 'old',
      refresh_token: 'rrr',
      expires_at: new Date(NOW_MS - 5_000).toISOString(),
    });
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => '{"code":7,"message":"invalid_grant"}',
    });
    await expect(
      ensureFreshToken({ ...makeArgs(tokenPath), fetchFn: fetchSpy }),
    ).rejects.toThrow(/re-auth required/i);
  });

  it('bubbles up fetch network errors with a clear message', async () => {
    writeToken(tokenPath, {
      access_token: 'old',
      refresh_token: 'rrr',
      expires_at: new Date(NOW_MS - 5_000).toISOString(),
    });
    const fetchSpy = vi.fn().mockRejectedValue(new Error('ECONNRESET'));
    await expect(
      ensureFreshToken({ ...makeArgs(tokenPath), fetchFn: fetchSpy }),
    ).rejects.toThrow(/network error.*ECONNRESET/i);
  });

  it('first-run bootstrap: writes token file from env when missing', async () => {
    process.env.PINTEREST_ACCESS_TOKEN = 'envA';
    process.env.PINTEREST_REFRESH_TOKEN = 'envR';
    process.env.PINTEREST_TOKEN_EXPIRES_AT = new Date(NOW_MS + 30 * 86400_000).toISOString();
    try {
      const token = await ensureFreshToken({ ...makeArgs(tokenPath), fetchFn: vi.fn() });
      expect(token).toBe('envA');
      const persisted = JSON.parse(fs.readFileSync(tokenPath, 'utf8'));
      expect(persisted.access_token).toBe('envA');
      expect(persisted.refresh_token).toBe('envR');
    } finally {
      delete process.env.PINTEREST_ACCESS_TOKEN;
      delete process.env.PINTEREST_REFRESH_TOKEN;
      delete process.env.PINTEREST_TOKEN_EXPIRES_AT;
    }
  });

  it('first-run bootstrap: defaults expires_at to now+30d when env omits it', async () => {
    process.env.PINTEREST_ACCESS_TOKEN = 'envA';
    process.env.PINTEREST_REFRESH_TOKEN = 'envR';
    try {
      await ensureFreshToken({ ...makeArgs(tokenPath), fetchFn: vi.fn() });
      const persisted = JSON.parse(fs.readFileSync(tokenPath, 'utf8'));
      const expectedMs = NOW_MS + 30 * 86400_000;
      expect(new Date(persisted.expires_at).getTime()).toBe(expectedMs);
    } finally {
      delete process.env.PINTEREST_ACCESS_TOKEN;
      delete process.env.PINTEREST_REFRESH_TOKEN;
    }
  });

  it('first-run bootstrap: throws if env vars are missing AND file is absent', async () => {
    await expect(
      ensureFreshToken({ ...makeArgs(tokenPath), fetchFn: vi.fn() }),
    ).rejects.toThrow(/token file not found/i);
  });
});
```

- [ ] **Step 2: Run the test — confirm it fails (no module yet)**

```bash
cd web.ui/backend && npx vitest run __tests__/pinterest/api_oauth.test.js
```

Expected: `Cannot find module '../../pinterest/api_oauth.js'` (or similar import error).

- [ ] **Step 3: Implement `web.ui/backend/pinterest/api_oauth.js`**

```javascript
/**
 * Pinterest v5 OAuth helper.
 *
 * Ported from `web.ui/backend/etsy/oauth.js`. Differences:
 *   - Stores `expires_at` as an ISO string (Etsy uses unix seconds).
 *   - Uses HTTP Basic auth for the refresh call (Etsy uses public OAuth).
 *   - Has a first-run bootstrap that materialises the token file from
 *     PINTEREST_ACCESS_TOKEN / PINTEREST_REFRESH_TOKEN env vars.
 *
 * @module pinterest/api_oauth
 */
import fs from 'node:fs';
import path from 'node:path';

/**
 * @typedef {Object} StoredToken
 * @property {string} access_token
 * @property {string} refresh_token
 * @property {string} expires_at   ISO 8601 timestamp
 */

/**
 * @typedef {Object} EnsureFreshArgs
 * @property {string} tokenStorePath
 * @property {string} appId
 * @property {string} appSecret
 * @property {typeof fetch} [fetchFn]
 * @property {number} [skewMs]   refresh if expires_at - now <= skewMs (default 5min)
 */

const TOKEN_URL = 'https://api.pinterest.com/v5/oauth/token';
const DEFAULT_SKEW_MS = 5 * 60 * 1000;
const DEFAULT_BOOTSTRAP_TTL_MS = 30 * 86400_000;

/**
 * Resolve the persisted token, bootstrapping from env on first run, then
 * refreshing if within the 5-minute skew. Writes the (possibly updated)
 * token back to disk and returns the access_token string.
 *
 * @param {EnsureFreshArgs} args
 * @returns {Promise<string>}
 */
export async function ensureFreshToken({
  tokenStorePath,
  appId,
  appSecret,
  fetchFn = fetch,
  skewMs = DEFAULT_SKEW_MS,
}) {
  let stored = await loadOrBootstrap(tokenStorePath);
  const expiresMs = new Date(stored.expires_at).getTime();
  if (expiresMs - Date.now() > skewMs) {
    return stored.access_token;
  }

  /** @type {Response} */
  let resp;
  try {
    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: stored.refresh_token,
    });
    const auth = Buffer.from(`${appId}:${appSecret}`).toString('base64');
    resp = await fetchFn(TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${auth}`,
      },
      body,
    });
  } catch (err) {
    const msg = err && err.message ? err.message : String(err);
    throw new Error(`Pinterest token refresh network error: ${msg}`);
  }

  if (resp.status === 401) {
    throw new Error('Pinterest refresh token expired — re-auth required');
  }
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Pinterest token refresh failed: ${resp.status} ${text}`);
  }

  /** @type {{access_token: string, refresh_token?: string, expires_in: number}} */
  const fresh = await resp.json();
  /** @type {StoredToken} */
  const next = {
    access_token: fresh.access_token,
    refresh_token: fresh.refresh_token ?? stored.refresh_token,
    expires_at: new Date(Date.now() + Number(fresh.expires_in) * 1000).toISOString(),
  };
  fs.mkdirSync(path.dirname(tokenStorePath), { recursive: true });
  fs.writeFileSync(tokenStorePath, JSON.stringify(next), 'utf8');
  return next.access_token;
}

/**
 * @param {string} tokenStorePath
 * @returns {Promise<StoredToken>}
 */
async function loadOrBootstrap(tokenStorePath) {
  if (fs.existsSync(tokenStorePath)) {
    return /** @type {StoredToken} */ (
      JSON.parse(fs.readFileSync(tokenStorePath, 'utf8'))
    );
  }
  const access = process.env.PINTEREST_ACCESS_TOKEN;
  const refresh = process.env.PINTEREST_REFRESH_TOKEN;
  if (!access || !refresh) {
    throw new Error(
      `Pinterest token file not found at ${tokenStorePath}. ` +
        'Set PINTEREST_ACCESS_TOKEN + PINTEREST_REFRESH_TOKEN in .env.local for first-run bootstrap.',
    );
  }
  const expiresAt =
    process.env.PINTEREST_TOKEN_EXPIRES_AT ||
    new Date(Date.now() + DEFAULT_BOOTSTRAP_TTL_MS).toISOString();
  /** @type {StoredToken} */
  const seed = {
    access_token: access,
    refresh_token: refresh,
    expires_at: expiresAt,
  };
  fs.mkdirSync(path.dirname(tokenStorePath), { recursive: true });
  fs.writeFileSync(tokenStorePath, JSON.stringify(seed), 'utf8');
  return seed;
}

/**
 * Read the persisted token without refreshing (used by token-status route).
 * Returns null when no file exists yet.
 *
 * @param {string} tokenStorePath
 * @returns {StoredToken|null}
 */
export function readStoredToken(tokenStorePath) {
  if (!fs.existsSync(tokenStorePath)) return null;
  return /** @type {StoredToken} */ (
    JSON.parse(fs.readFileSync(tokenStorePath, 'utf8'))
  );
}
```

- [ ] **Step 4: Run the test — confirm green**

```bash
cd web.ui/backend && npx vitest run __tests__/pinterest/api_oauth.test.js
```

Expected: `Test Files  1 passed (1)` with all 8 tests passing.

---

### Task 2: `api_client.js` + tests (TDD with msw)

**Files:**
- Create: `web.ui/backend/pinterest/api_client.js`
- Test: `web.ui/backend/__tests__/pinterest/api_client.test.js`

- [ ] **Step 1: Write the failing msw-backed test**

Create `web.ui/backend/__tests__/pinterest/api_client.test.js`:

```javascript
/**
 * Tests for pinterest/api_client.js — PinterestApiClient.
 *
 * Uses msw to intercept https://api.pinterest.com/v5/* so no real network
 * call ever happens. Each test seeds a tokenStore so the client doesn't
 * have to do its own refresh dance.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach, beforeEach, vi } from 'vitest';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PinterestApiClient, PinterestApiError } from '../../pinterest/api_client.js';

const BASE = 'https://api.pinterest.com';
const NOW_MS = 1_700_000_000_000;

let tmpDir;
let tokenPath;
let imagePath;

function seedToken(extra = {}) {
  fs.writeFileSync(
    tokenPath,
    JSON.stringify({
      access_token: 'access-T',
      refresh_token: 'refresh-R',
      expires_at: new Date(NOW_MS + 60 * 60 * 1000).toISOString(),
      ...extra,
    }),
  );
}

function makeClient(overrides = {}) {
  return new PinterestApiClient({
    tokenStorePath: tokenPath,
    appId: '1572111',
    appSecret: 'shh',
    backoffMs: [10, 20, 30],
    ...overrides,
  });
}

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

beforeEach(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pin-client-'));
  tokenPath = path.join(tmpDir, 'pinterest_token.json');
  imagePath = path.join(tmpDir, 'pin.png');
  // 4-byte PNG-ish payload is enough — we only need readFileSync to succeed.
  fs.writeFileSync(imagePath, Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  vi.spyOn(Date, 'now').mockReturnValue(NOW_MS);
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

describe('createPin', () => {
  it('POSTs base64-encoded media_source to /v5/pins with Bearer auth', async () => {
    seedToken();
    /** @type {any} */
    let bodyReceived;
    let authHeader;
    server.use(
      http.post(`${BASE}/v5/pins`, async ({ request }) => {
        authHeader = request.headers.get('authorization');
        bodyReceived = await request.json();
        return HttpResponse.json({ id: 'PIN_123', url: 'https://pin.it/PIN_123' });
      }),
    );

    const client = makeClient();
    const out = await client.createPin({
      board_id: 'BOARD_A',
      title: 'T',
      description: 'D',
      link: 'http://x',
      imagePath,
    });

    expect(out.id).toBe('PIN_123');
    expect(authHeader).toBe('Bearer access-T');
    expect(bodyReceived.board_id).toBe('BOARD_A');
    expect(bodyReceived.media_source.source_type).toBe('image_base64');
    expect(bodyReceived.media_source.content_type).toBe('image/png');
    expect(bodyReceived.media_source.data).toBe(
      Buffer.from([0x89, 0x50, 0x4e, 0x47]).toString('base64'),
    );
  });

  it('on 401: refreshes the token and retries once', async () => {
    seedToken({ expires_at: new Date(NOW_MS + 60 * 60 * 1000).toISOString() });
    let pinHit = 0;
    let refreshHit = 0;
    server.use(
      http.post(`${BASE}/v5/oauth/token`, async () => {
        refreshHit++;
        return HttpResponse.json({
          access_token: 'access-T2',
          refresh_token: 'refresh-R',
          expires_in: 3600,
        });
      }),
      http.post(`${BASE}/v5/pins`, async ({ request }) => {
        pinHit++;
        if (pinHit === 1) {
          return HttpResponse.json({ code: 7, message: 'unauthorized' }, { status: 401 });
        }
        const auth = request.headers.get('authorization');
        expect(auth).toBe('Bearer access-T2');
        return HttpResponse.json({ id: 'PIN_OK' });
      }),
    );

    const out = await makeClient().createPin({
      board_id: 'B', title: 'T', description: 'D', link: 'L', imagePath,
    });
    expect(out.id).toBe('PIN_OK');
    expect(pinHit).toBe(2);
    expect(refreshHit).toBe(1);
  });

  it('on 429: backs off and retries through the ladder', async () => {
    seedToken();
    let hits = 0;
    server.use(
      http.post(`${BASE}/v5/pins`, async () => {
        hits++;
        if (hits < 3) return HttpResponse.json({ code: 8 }, { status: 429 });
        return HttpResponse.json({ id: 'PIN_LATE' });
      }),
    );
    const out = await makeClient().createPin({
      board_id: 'B', title: 'T', description: 'D', link: 'L', imagePath,
    });
    expect(out.id).toBe('PIN_LATE');
    expect(hits).toBe(3);
  });

  it('on 5xx: retries up to 3 times then throws', async () => {
    seedToken();
    let hits = 0;
    server.use(
      http.post(`${BASE}/v5/pins`, async () => {
        hits++;
        return HttpResponse.text('boom', { status: 503 });
      }),
    );
    await expect(
      makeClient().createPin({ board_id: 'B', title: 'T', description: 'D', link: 'L', imagePath }),
    ).rejects.toBeInstanceOf(PinterestApiError);
    expect(hits).toBe(3);
  });

  it('on 400: throws PinterestApiError without retry', async () => {
    seedToken();
    let hits = 0;
    server.use(
      http.post(`${BASE}/v5/pins`, async () => {
        hits++;
        return HttpResponse.json({ code: 1, message: 'bad title' }, { status: 400 });
      }),
    );
    await expect(
      makeClient().createPin({ board_id: 'B', title: 'T', description: 'D', link: 'L', imagePath }),
    ).rejects.toMatchObject({ status: 400 });
    expect(hits).toBe(1);
  });
});

describe('listBoards', () => {
  it('GETs /v5/boards and returns the items array', async () => {
    seedToken();
    server.use(
      http.get(`${BASE}/v5/boards`, ({ request }) => {
        expect(request.headers.get('authorization')).toBe('Bearer access-T');
        return HttpResponse.json({
          items: [
            { id: 'B1', name: 'Cottagecore Coloring', privacy: 'PUBLIC' },
            { id: 'B2', name: 'Sudoku Puzzles', privacy: 'PUBLIC' },
          ],
        });
      }),
    );
    const boards = await makeClient().listBoards();
    expect(boards).toHaveLength(2);
    expect(boards[0].id).toBe('B1');
  });
});

describe('getUserAccount', () => {
  it('GETs /v5/user_account and returns the body', async () => {
    seedToken();
    server.use(
      http.get(`${BASE}/v5/user_account`, () =>
        HttpResponse.json({ username: 'pocketroosterpress', business_name: 'Pocket Rooster Press' }),
      ),
    );
    const u = await makeClient().getUserAccount();
    expect(u.username).toBe('pocketroosterpress');
    expect(u.business_name).toBe('Pocket Rooster Press');
  });
});

describe('getTokenStatus', () => {
  it('returns connected=true and expires_at from the stored token', async () => {
    const exp = new Date(NOW_MS + 7 * 86400_000).toISOString();
    seedToken({ expires_at: exp });
    const status = await makeClient().getTokenStatus();
    expect(status.connected).toBe(true);
    expect(status.expires_at).toBe(exp);
  });

  it('returns connected=false when token file is missing', async () => {
    // Belt-and-braces: scrub env vars so getTokenStatus (which reads the
    // file directly via readStoredToken, not ensureFreshToken) cannot be
    // fooled into bootstrapping mid-test.
    const saved = {
      a: process.env.PINTEREST_ACCESS_TOKEN,
      r: process.env.PINTEREST_REFRESH_TOKEN,
    };
    delete process.env.PINTEREST_ACCESS_TOKEN;
    delete process.env.PINTEREST_REFRESH_TOKEN;
    try {
      const status = await makeClient().getTokenStatus();
      expect(status.connected).toBe(false);
      expect(status.expires_at).toBeNull();
    } finally {
      if (saved.a !== undefined) process.env.PINTEREST_ACCESS_TOKEN = saved.a;
      if (saved.r !== undefined) process.env.PINTEREST_REFRESH_TOKEN = saved.r;
    }
  });
});
```

- [ ] **Step 2: Run the test — confirm it fails (no module yet)**

```bash
cd web.ui/backend && npx vitest run __tests__/pinterest/api_client.test.js
```

Expected: `Cannot find module '../../pinterest/api_client.js'`.

- [ ] **Step 3: Implement `web.ui/backend/pinterest/api_client.js`**

```javascript
/**
 * Thin Pinterest v5 API client. Bearer auth comes from api_oauth.js;
 * 401 errors transparently force a refresh and retry once; 429 errors
 * back off through `backoffMs`; 5xx errors retry up to 3 times.
 *
 * @module pinterest/api_client
 */
import fs from 'node:fs';
import { ensureFreshToken, readStoredToken } from './api_oauth.js';

const BASE = 'https://api.pinterest.com';
const DEFAULT_BACKOFF_MS = [60_000, 5 * 60_000, 30 * 60_000];

/**
 * @typedef {Object} ApiClientArgs
 * @property {string} tokenStorePath
 * @property {string} appId
 * @property {string} appSecret
 * @property {typeof fetch} [fetchFn]
 * @property {number[]} [backoffMs]   429 retry ladder (default 60s/5m/30m)
 */

/**
 * @typedef {Object} CreatePinArgs
 * @property {string} board_id
 * @property {string} title
 * @property {string} description
 * @property {string} link
 * @property {string} imagePath
 */

/**
 * @typedef {Object} PinterestBoard
 * @property {string} id
 * @property {string} name
 * @property {string} [privacy]
 */

/**
 * @typedef {Object} PinterestUser
 * @property {string} username
 * @property {string} [business_name]
 */

/**
 * @typedef {Object} PinterestTokenStatus
 * @property {boolean} connected
 * @property {string|null} expires_at
 */

export class PinterestApiError extends Error {
  /**
   * @param {string} message
   * @param {{status: number, body: string, code?: number}} info
   */
  constructor(message, { status, body, code }) {
    super(message);
    this.name = 'PinterestApiError';
    this.status = status;
    this.body = body;
    this.code = code;
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export class PinterestApiClient {
  /** @param {ApiClientArgs} args */
  constructor(args) {
    this.tokenStorePath = args.tokenStorePath;
    this.appId = args.appId;
    this.appSecret = args.appSecret;
    this.fetchFn = args.fetchFn ?? fetch;
    this.backoffMs = args.backoffMs ?? DEFAULT_BACKOFF_MS;
  }

  /** @returns {Promise<string>} */
  async _token() {
    return ensureFreshToken({
      tokenStorePath: this.tokenStorePath,
      appId: this.appId,
      appSecret: this.appSecret,
      fetchFn: this.fetchFn,
    });
  }

  /**
   * Call the API with full retry behavior.
   *   - 401 → force refresh and retry once
   *   - 429 → sleep `backoffMs[attempt]` and retry
   *   - 5xx → retry up to 3 attempts total
   *
   * @param {string} method
   * @param {string} path  e.g. '/v5/pins'
   * @param {object|null} body  JSON body or null for GET
   * @returns {Promise<any>}
   */
  async _callApi(method, path, body) {
    let refreshedOnce = false;
    let attempt5xx = 0;
    let attempt429 = 0;

    // eslint-disable-next-line no-constant-condition
    while (true) {
      const token = await this._token();
      const init = {
        method,
        headers: { Authorization: `Bearer ${token}` },
      };
      if (body !== null) {
        init.headers['Content-Type'] = 'application/json';
        init.body = JSON.stringify(body);
      }
      const resp = await this.fetchFn(`${BASE}${path}`, init);

      if (resp.ok) {
        return resp.json();
      }

      const text = await resp.text();
      let parsedCode;
      try {
        parsedCode = JSON.parse(text)?.code;
      } catch { /* non-JSON body */ }

      if (resp.status === 401 && !refreshedOnce) {
        // Force the next _token() to refresh by zeroing expires_at.
        forceTokenExpiry(this.tokenStorePath);
        refreshedOnce = true;
        continue;
      }
      if (resp.status === 429 && attempt429 < this.backoffMs.length) {
        await sleep(this.backoffMs[attempt429]);
        attempt429 += 1;
        continue;
      }
      if (resp.status >= 500 && attempt5xx < 2) {
        await sleep(this.backoffMs[Math.min(attempt5xx, this.backoffMs.length - 1)]);
        attempt5xx += 1;
        continue;
      }
      throw new PinterestApiError(
        `Pinterest ${method} ${path} ${resp.status}: ${text}`,
        { status: resp.status, body: text, code: parsedCode },
      );
    }
  }

  /**
   * @param {CreatePinArgs} args
   * @returns {Promise<{id: string, url?: string}>}
   */
  async createPin(args) {
    const buf = fs.readFileSync(args.imagePath);
    const body = {
      board_id: args.board_id,
      title: args.title,
      description: args.description,
      link: args.link,
      media_source: {
        source_type: 'image_base64',
        content_type: 'image/png',
        data: buf.toString('base64'),
      },
    };
    return this._callApi('POST', '/v5/pins', body);
  }

  /** @returns {Promise<PinterestBoard[]>} */
  async listBoards() {
    const resp = await this._callApi('GET', '/v5/boards', null);
    return resp.items ?? [];
  }

  /** @returns {Promise<PinterestUser>} */
  async getUserAccount() {
    return this._callApi('GET', '/v5/user_account', null);
  }

  /** @returns {Promise<PinterestTokenStatus>} */
  async getTokenStatus() {
    const stored = readStoredToken(this.tokenStorePath);
    if (!stored) return { connected: false, expires_at: null };
    return { connected: true, expires_at: stored.expires_at };
  }
}

/**
 * Mark the persisted token's expires_at to the unix epoch so the next
 * ensureFreshToken() call refreshes it. Used after a 401 response.
 *
 * @param {string} tokenStorePath
 */
function forceTokenExpiry(tokenStorePath) {
  if (!fs.existsSync(tokenStorePath)) return;
  const stored = JSON.parse(fs.readFileSync(tokenStorePath, 'utf8'));
  stored.expires_at = new Date(0).toISOString();
  fs.writeFileSync(tokenStorePath, JSON.stringify(stored), 'utf8');
}
```

- [ ] **Step 4: Run the test — confirm green**

```bash
cd web.ui/backend && npx vitest run __tests__/pinterest/api_client.test.js
```

Expected: all 8 tests pass.

---

### Task 3: Rewrite `poster.js` + tests

**Files:**
- Modify: `web.ui/backend/pinterest/poster.js` (full rewrite)
- Modify: `web.ui/backend/__tests__/pinterest/poster.test.js` (full rewrite)

- [ ] **Step 1: Replace `__tests__/pinterest/poster.test.js` with the API-based version**

```javascript
/**
 * Tests for pinterest/poster.js — runOnce() with an injected fake apiClient.
 *
 * No real Pinterest API calls fire; tests pass an `apiClient` stub that
 * resolves/rejects createPin() synchronously.
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

function fakeApiClient(overrides = {}) {
  return {
    createPin: vi.fn(async () => ({ id: 'PIN_abc' })),
    listBoards: vi.fn(async () => [{ id: 'B1', name: 'B' }]),
    getUserAccount: vi.fn(async () => ({ username: 'u' })),
    getTokenStatus: vi.fn(async () => ({ connected: true, expires_at: 'x' })),
    ...overrides,
  };
}

describe('runOnce — happy path', () => {
  it('calls apiClient.createPin with the row payload and marks posted', async () => {
    const img = path.join(tmpRoot, 'pin.png');
    await fakeImage(img);
    const id = makePendingRow(img);
    process.env.PINTEREST_DEFAULT_BOARD_ID = 'BOARD_DEFAULT';
    const api = fakeApiClient({
      createPin: vi.fn(async () => ({ id: 'PIN_OK' })),
    });

    const result = await runOnce({ apiClient: api });

    expect(result.action).toBe('posted');
    expect(result.queueId).toBe(id);
    expect(result.pinId).toBe('PIN_OK');
    expect(api.createPin).toHaveBeenCalledWith({
      board_id: 'BOARD_DEFAULT',
      title: 'T',
      description: 'D',
      link: 'http://amazon.com/dp/X',
      imagePath: img,
    });
    const db = openDb();
    const row = db.prepare('SELECT status FROM pinterest_queue WHERE id=?').get(id);
    expect(row.status).toBe('posted');
    const hist = db.prepare('SELECT pinterest_pin_id FROM pinterest_history WHERE queue_id=?').get(id);
    expect(hist.pinterest_pin_id).toBe('PIN_OK');
    const statuses = getAllStatuses();
    expect(statuses.pinterest?.last_success_at).toBeTruthy();

    delete process.env.PINTEREST_DEFAULT_BOARD_ID;
  });

  it('falls back to listBoards()[0].id when no PINTEREST_DEFAULT_BOARD_ID env is set', async () => {
    const img = path.join(tmpRoot, 'pin.png');
    await fakeImage(img);
    makePendingRow(img);
    const api = fakeApiClient({
      listBoards: vi.fn(async () => [{ id: 'BAUTO', name: 'auto' }]),
    });
    await runOnce({ apiClient: api });
    expect(api.createPin).toHaveBeenCalledWith(expect.objectContaining({ board_id: 'BAUTO' }));
  });
});

describe('runOnce — error paths', () => {
  it('marks the row failed when image_path is missing', async () => {
    const id = makePendingRow(path.join(tmpRoot, 'missing.png'));
    const api = fakeApiClient();
    const result = await runOnce({ apiClient: api });
    expect(result.action).toBe('failed');
    expect(api.createPin).not.toHaveBeenCalled();
    const db = openDb();
    const row = db.prepare('SELECT status, last_error FROM pinterest_queue WHERE id=?').get(id);
    expect(row.status).toBe('failed');
    expect(row.last_error).toMatch(/image_path missing/);
  });

  it('marks the row failed when createPin throws a network error', async () => {
    const img = path.join(tmpRoot, 'pin.png');
    await fakeImage(img);
    const id = makePendingRow(img);
    const api = fakeApiClient({
      createPin: vi.fn(async () => { throw new Error('ECONNRESET'); }),
    });
    const result = await runOnce({ apiClient: api });
    expect(result.action).toBe('failed');
    const db = openDb();
    const row = db.prepare('SELECT status, last_error FROM pinterest_queue WHERE id=?').get(id);
    expect(row.status).toBe('failed');
    expect(row.last_error).toMatch(/ECONNRESET/);
    const hist = db.prepare('SELECT success, error_message FROM pinterest_history WHERE queue_id=?').get(id);
    expect(hist.success).toBe(0);
  });

  it('on auth-failure-after-refresh: marks the row failed with explicit message', async () => {
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
    const row = db.prepare('SELECT last_error FROM pinterest_queue WHERE id=?').get(id);
    expect(row.last_error).toMatch(/401/);
  });
});

describe('runOnce — nothing due', () => {
  it('returns idle with no api calls when no rows are due', async () => {
    const api = fakeApiClient();
    const result = await runOnce({ apiClient: api });
    expect(result.action).toBe('idle');
    expect(api.createPin).not.toHaveBeenCalled();
  });
});

describe('msUntilNextPending', () => {
  it('returns null when no pending rows exist', () => {
    expect(msUntilNextPending()).toBeNull();
  });

  it('returns positive ms for a future pending row', async () => {
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
```

- [ ] **Step 2: Run the test — confirm it fails (old poster.js still imports login.js)**

```bash
cd web.ui/backend && npx vitest run __tests__/pinterest/poster.test.js
```

Expected: tests fail because `runOnce` no longer accepts `apiClient`. That's fine — we are rewriting it.

- [ ] **Step 3: Replace `web.ui/backend/pinterest/poster.js` wholesale**

```javascript
/**
 * Pinterest poster worker — API edition.
 *
 * `runOnce({apiClient})` dequeues one pending row, reads its PNG, and calls
 * `apiClient.createPin(...)`. Success → markPosted + history row; failure →
 * markFailed + history row.
 *
 * `startPosterWorker({apiClient, intervalMs})` is a sleep-until-next loop:
 * computes msUntilNextPending and schedules the next runOnce. On consecutive
 * failures, the backoff ladder kicks in (1m → 5m → 30m → pauseQueue).
 *
 * No Playwright. No browser. The api_oauth + api_client layer handles auth.
 *
 * @module pinterest/poster
 */
import fs from 'node:fs';
import path from 'node:path';
import { openDb } from '../db.js';
import { setWorkerHeartbeat, setWorkerError } from '../workerStatus.js';
import { dequeueNext, markPosted, markFailed, pauseQueue } from './queue.js';
import { PinterestApiClient } from './api_client.js';

const WORKER_NAME = 'pinterest';

/**
 * @typedef {Object} ApiClientLike
 * @property {(args: {board_id: string, title: string, description: string, link: string, imagePath: string}) => Promise<{id: string}>} createPin
 * @property {() => Promise<Array<{id: string, name: string}>>} listBoards
 * @property {() => Promise<{username: string, business_name?: string}>} getUserAccount
 * @property {() => Promise<{connected: boolean, expires_at: string|null}>} getTokenStatus
 */

/**
 * @typedef {Object} RunOnceInput
 * @property {ApiClientLike} [apiClient]
 */

/**
 * @typedef {Object} RunOnceResult
 * @property {'idle'|'posted'|'failed'} action
 * @property {number} [queueId]
 * @property {string} [pinId]
 * @property {string} [error]
 */

/**
 * Resolve the default board id: env first, otherwise listBoards()[0].
 *
 * @param {ApiClientLike} apiClient
 * @returns {Promise<string>}
 */
async function resolveBoardId(apiClient) {
  if (process.env.PINTEREST_DEFAULT_BOARD_ID) {
    return process.env.PINTEREST_DEFAULT_BOARD_ID;
  }
  const boards = await apiClient.listBoards();
  if (!boards.length) {
    throw new Error('No Pinterest boards available — create one at pinterest.com first');
  }
  return boards[0].id;
}

/**
 * Process at most one pending pin.
 *
 * @param {RunOnceInput} [input]
 * @returns {Promise<RunOnceResult>}
 */
export async function runOnce(input = {}) {
  const apiClient = input.apiClient ?? defaultApiClient();
  const row = dequeueNext();
  if (!row) {
    setWorkerHeartbeat(WORKER_NAME);
    return { action: 'idle' };
  }

  if (!fs.existsSync(row.image_path)) {
    const msg = `image_path missing: ${row.image_path}`;
    markFailed(row.id, msg);
    setWorkerError(WORKER_NAME, 'image missing');
    return { action: 'failed', queueId: row.id, error: msg };
  }

  try {
    const boardId = await resolveBoardId(apiClient);
    const result = await apiClient.createPin({
      board_id: boardId,
      title: row.title,
      description: row.description,
      link: row.link_url,
      imagePath: row.image_path,
    });
    markPosted(row.id, result.id);
    setWorkerHeartbeat(WORKER_NAME);
    return { action: 'posted', queueId: row.id, pinId: result.id };
  } catch (err) {
    const msg = err?.message || String(err);
    markFailed(row.id, msg);
    setWorkerError(WORKER_NAME, msg);
    return { action: 'failed', queueId: row.id, error: msg };
  }
}

/**
 * @returns {number|null}
 */
export function msUntilNextPending() {
  const db = openDb();
  const row = db.prepare(`
    SELECT scheduled_for FROM pinterest_queue
     WHERE status='pending'
     ORDER BY scheduled_for ASC
     LIMIT 1
  `).get();
  if (!row) return null;
  return new Date(row.scheduled_for).getTime() - Date.now();
}

// --- Supervisor loop -------------------------------------------------------

let consecutiveFailures = 0;
const BACKOFF_MS = [60_000, 5 * 60_000, 30 * 60_000];

/** @type {ReturnType<typeof setTimeout>|null} */
let currentTimer = null;
let workerCancelled = false;

/**
 * @param {{
 *   apiClient?: ApiClientLike,
 *   intervalMs?: number,
 *   idleCheckMs?: number,
 * }} [opts]
 * @returns {() => void}
 */
export function startPosterWorker(opts = {}) {
  if (currentTimer) return stopPosterWorker;
  const idleCheckMs = opts.idleCheckMs ?? opts.intervalMs ?? 5 * 60 * 1000;
  workerCancelled = false;
  consecutiveFailures = 0;

  async function loop() {
    if (workerCancelled) return;
    let result;
    try {
      result = await runOnce({ apiClient: opts.apiClient });
    } catch (err) {
      const msg = err?.message || String(err);
      setWorkerError(WORKER_NAME, msg);
      result = { action: 'failed', error: msg };
    }
    if (result.action === 'posted' || result.action === 'idle') {
      consecutiveFailures = 0;
    } else if (result.action === 'failed') {
      consecutiveFailures += 1;
      if (consecutiveFailures > BACKOFF_MS.length) {
        try { pauseQueue(); } catch { /* ignore */ }
        setWorkerError(WORKER_NAME, 'paused after repeated failures');
        consecutiveFailures = 0;
      }
    }
    if (workerCancelled) return;
    let delay;
    if (result.action === 'failed' && consecutiveFailures > 0) {
      delay = BACKOFF_MS[Math.min(consecutiveFailures - 1, BACKOFF_MS.length - 1)];
    } else {
      const ms = msUntilNextPending();
      delay = ms === null ? idleCheckMs : Math.max(5_000, Math.min(idleCheckMs, ms));
    }
    currentTimer = setTimeout(loop, delay);
  }

  setWorkerHeartbeat(WORKER_NAME);
  currentTimer = setTimeout(loop, 1000);
  return stopPosterWorker;
}

export function stopPosterWorker() {
  workerCancelled = true;
  if (currentTimer) {
    clearTimeout(currentTimer);
    currentTimer = null;
  }
  consecutiveFailures = 0;
}

/**
 * Build a real PinterestApiClient from env. Used when no apiClient is
 * injected. Tests always inject a fake so this path is exercised only by
 * production callers.
 *
 * @returns {PinterestApiClient}
 */
function defaultApiClient() {
  const tokenStorePath = path.resolve(
    process.env.ROOSTER_PINTEREST_TOKEN_PATH || 'data/pinterest_token.json',
  );
  const appId = process.env.PINTEREST_APP_ID || '1572111';
  const appSecret = process.env.PINTEREST_APP_SECRET;
  if (!appSecret) {
    throw new Error('PINTEREST_APP_SECRET env var is required');
  }
  return new PinterestApiClient({ tokenStorePath, appId, appSecret });
}

/** Test-only helper. */
export function _resetPosterStateForTests() {
  consecutiveFailures = 0;
  workerCancelled = false;
  if (currentTimer) {
    clearTimeout(currentTimer);
    currentTimer = null;
  }
}
```

- [ ] **Step 4: Run the poster test — confirm green**

```bash
cd web.ui/backend && npx vitest run __tests__/pinterest/poster.test.js
```

Expected: all 7 tests pass.

---

### Task 4: Delete `login.js` + its test + remove the POST /login route

**Files:**
- Delete: `web.ui/backend/pinterest/login.js`
- Delete: `web.ui/backend/__tests__/pinterest/login.test.js`
- Modify: `web.ui/backend/pinterest/routes.js` (remove `POST /login` block)
- Modify: `web.ui/backend/__tests__/pinterest/routes.test.js` (remove `POST /api/pinterest/login` describe block)

- [ ] **Step 1: Delete the login module and its test**

```bash
git rm web.ui/backend/pinterest/login.js
git rm web.ui/backend/__tests__/pinterest/login.test.js
```

Expected: both files removed, staged for commit.

- [ ] **Step 2: Strip the login route from `routes.js`**

Edit `web.ui/backend/pinterest/routes.js` — delete the entire `router.post('/login', ...)` block (lines starting at `router.post('/login', async (_req, res) => {` through its closing `});`). Also delete the corresponding mention in the file's header comment:

Old header comment (delete the matching lines):
```
 *   POST /api/pinterest/login              — fire-and-forget visible Playwright login
```

```
 *   - pinterest:login-requested
```

```
 * The login route dynamically imports `./login.js` so tests can stub it via
 * `vi.doMock` without bundling Playwright into the unit-test graph.
```

Final `routes.js` should retain: `queue`, `history`, `pause`, `resume`, `queue/:id/cancel`, `queue/:id` (PUT). Nothing else.

- [ ] **Step 3: Strip the login describe block from `routes.test.js`**

Edit `web.ui/backend/__tests__/pinterest/routes.test.js`:

1. Delete the entire `describe('POST /api/pinterest/login', () => { ... })` block (from `describe('POST /api/pinterest/login'` through the matching closing `});`).
2. In the `afterEach` block, delete the line `vi.doUnmock('../../pinterest/login.js');` since no test mocks login.js any more.

- [ ] **Step 4: Run the routes test — confirm green**

```bash
cd web.ui/backend && npx vitest run __tests__/pinterest/routes.test.js
```

Expected: all remaining tests pass.

---

### Task 5: Add `/whoami`, `/boards`, `/token-status` routes + tests (TDD)

**Files:**
- Modify: `web.ui/backend/pinterest/routes.js` (add routes + apiClient injection)
- Modify: `web.ui/backend/pinterest/index.js` (forward apiClient through mount)
- Modify: `web.ui/backend/__tests__/pinterest/routes.test.js` (add three new describe blocks)

- [ ] **Step 1: Write the failing tests**

Append to `web.ui/backend/__tests__/pinterest/routes.test.js` (after the existing `PUT /api/pinterest/queue/:id` block):

```javascript
async function makeAppWithApi(api) {
  const events = await import('../../events.js');
  subscribe = events.subscribe;
  _resetSubscribersForTests = events._resetSubscribersForTests;
  const { installPinterestModule } = await import('../../pinterest/index.js');
  const a = express();
  a.use(express.json());
  installPinterestModule(a, { apiClient: api });
  return a;
}

describe('GET /api/pinterest/whoami', () => {
  it('returns the user account from apiClient.getUserAccount', async () => {
    const api = {
      getUserAccount: vi.fn(async () => ({ username: 'prp', business_name: 'Pocket Rooster Press' })),
      listBoards: vi.fn(),
      getTokenStatus: vi.fn(),
      createPin: vi.fn(),
    };
    const a2 = await makeAppWithApi(api);
    const res = await request(a2).get('/api/pinterest/whoami');
    expect(res.status).toBe(200);
    expect(res.body.username).toBe('prp');
    expect(res.body.business_name).toBe('Pocket Rooster Press');
    expect(api.getUserAccount).toHaveBeenCalled();
  });

  it('returns 502 with the api error body on failure', async () => {
    const api = {
      getUserAccount: vi.fn(async () => { throw new Error('upstream 401'); }),
      listBoards: vi.fn(), getTokenStatus: vi.fn(), createPin: vi.fn(),
    };
    const a2 = await makeAppWithApi(api);
    const res = await request(a2).get('/api/pinterest/whoami');
    expect(res.status).toBe(502);
    expect(res.body.error).toMatch(/upstream 401/);
  });
});

describe('GET /api/pinterest/boards', () => {
  it('returns boards array from apiClient.listBoards', async () => {
    const api = {
      listBoards: vi.fn(async () => [
        { id: 'B1', name: 'Coloring' },
        { id: 'B2', name: 'Sudoku' },
      ]),
      getUserAccount: vi.fn(), getTokenStatus: vi.fn(), createPin: vi.fn(),
    };
    const a2 = await makeAppWithApi(api);
    const res = await request(a2).get('/api/pinterest/boards');
    expect(res.status).toBe(200);
    expect(res.body.boards).toHaveLength(2);
    expect(res.body.boards[0].id).toBe('B1');
  });
});

describe('GET /api/pinterest/token-status', () => {
  it('returns connected/expires_at envelope from apiClient.getTokenStatus', async () => {
    const api = {
      getTokenStatus: vi.fn(async () => ({
        connected: true,
        expires_at: '2026-06-26T18:32:00.000Z',
      })),
      listBoards: vi.fn(), getUserAccount: vi.fn(), createPin: vi.fn(),
    };
    const a2 = await makeAppWithApi(api);
    const res = await request(a2).get('/api/pinterest/token-status');
    expect(res.status).toBe(200);
    expect(res.body.connected).toBe(true);
    expect(res.body.expires_at).toBe('2026-06-26T18:32:00.000Z');
  });
});
```

- [ ] **Step 2: Run the new tests — confirm they fail**

```bash
cd web.ui/backend && npx vitest run __tests__/pinterest/routes.test.js
```

Expected: three new tests fail with 404 (route absent) and `installPinterestModule` doesn't accept a second arg.

- [ ] **Step 3: Update `web.ui/backend/pinterest/routes.js` to expose a factory + add three routes**

Replace the existing module-level `export const router = express.Router();` and its handlers with a factory function that accepts an `apiClient`:

```javascript
/**
 * Pinterest REST routes.
 *
 *   GET  /api/pinterest/queue              — pending+posting+paused rows
 *   GET  /api/pinterest/history?limit=N    — most recent N history rows
 *   POST /api/pinterest/pause              — flip all pending → paused
 *   POST /api/pinterest/resume             — flip all paused  → pending
 *   POST /api/pinterest/queue/:id/cancel   — remove a pending/paused row
 *   PUT  /api/pinterest/queue/:id          — patch title/description/scheduled_for
 *   GET  /api/pinterest/whoami             — apiClient.getUserAccount()
 *   GET  /api/pinterest/boards             — apiClient.listBoards()
 *   GET  /api/pinterest/token-status       — apiClient.getTokenStatus()
 *
 * SSE events emitted on state changes:
 *   - pinterest:paused
 *   - pinterest:resumed
 *   - pinterest:queue-row-cancelled
 *   - pinterest:queue-row-updated
 *
 * @module pinterest/routes
 */
import express from 'express';
import { openDb } from '../db.js';
import { recordEvent } from '../events.js';
import {
  listQueue,
  listHistory,
  pauseQueue,
  resumeQueue,
  cancelQueueRow,
  updateQueueRow,
} from './queue.js';

/**
 * Build the Pinterest router. apiClient is required for the whoami/boards/
 * token-status endpoints; the queue-management routes work without it.
 *
 * @param {{apiClient?: import('./api_client.js').PinterestApiClient}} [opts]
 * @returns {import('express').Router}
 */
export function buildRouter(opts = {}) {
  const router = express.Router();
  const apiClient = opts.apiClient ?? null;

  function getQueueRow(id) {
    return openDb().prepare('SELECT * FROM pinterest_queue WHERE id=?').get(id);
  }

  router.get('/queue', (_req, res) => {
    res.json({ queue: listQueue() });
  });

  router.get('/history', (req, res) => {
    const raw = Number(req.query.limit ?? 100);
    const limit = Number.isFinite(raw) ? Math.max(1, Math.min(500, raw)) : 100;
    res.json({ history: listHistory(limit) });
  });

  router.post('/pause', (_req, res) => {
    const paused = pauseQueue();
    recordEvent('pinterest:paused', { affected: paused });
    res.json({ paused });
  });

  router.post('/resume', (_req, res) => {
    const resumed = resumeQueue();
    recordEvent('pinterest:resumed', { affected: resumed });
    res.json({ resumed });
  });

  router.post('/queue/:id/cancel', (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'bad_id' });
    }
    const row = getQueueRow(id);
    if (!row) {
      return res.status(404).json({ error: 'not_found' });
    }
    cancelQueueRow(id);
    recordEvent('pinterest:queue-row-cancelled', { queue_id: id });
    res.json({ ok: true });
  });

  router.put('/queue/:id', (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'bad_id' });
    }
    const body = req.body ?? {};
    const { title, description, scheduled_for } = body;
    const hasTitle = typeof title === 'string';
    const hasDescription = typeof description === 'string';
    const hasScheduledFor = typeof scheduled_for === 'string';
    if (!hasTitle && !hasDescription && !hasScheduledFor) {
      return res.status(400).json({ error: 'empty_patch' });
    }
    const row = getQueueRow(id);
    if (!row) {
      return res.status(404).json({ error: 'not_found' });
    }
    updateQueueRow(id, {
      title: hasTitle ? title : undefined,
      description: hasDescription ? description : undefined,
      scheduled_for: hasScheduledFor ? scheduled_for : undefined,
    });
    recordEvent('pinterest:queue-row-updated', {
      queue_id: id,
      fields: Object.keys({
        ...(hasTitle ? { title } : {}),
        ...(hasDescription ? { description } : {}),
        ...(hasScheduledFor ? { scheduled_for } : {}),
      }),
    });
    res.json({ ok: true });
  });

  router.get('/whoami', async (_req, res) => {
    if (!apiClient) return res.status(503).json({ error: 'api_client_unavailable' });
    try {
      const u = await apiClient.getUserAccount();
      res.json(u);
    } catch (err) {
      res.status(502).json({ error: err?.message || String(err) });
    }
  });

  router.get('/boards', async (_req, res) => {
    if (!apiClient) return res.status(503).json({ error: 'api_client_unavailable' });
    try {
      const boards = await apiClient.listBoards();
      res.json({ boards });
    } catch (err) {
      res.status(502).json({ error: err?.message || String(err) });
    }
  });

  router.get('/token-status', async (_req, res) => {
    if (!apiClient) return res.status(503).json({ error: 'api_client_unavailable' });
    try {
      const status = await apiClient.getTokenStatus();
      res.json(status);
    } catch (err) {
      res.status(500).json({ error: err?.message || String(err) });
    }
  });

  return router;
}

// Back-compat default router (no apiClient) — kept so existing imports of
// `router` keep working until the migration lands.
export const router = buildRouter();
```

- [ ] **Step 4: Update `web.ui/backend/pinterest/index.js` to forward the apiClient**

```javascript
/**
 * Pinterest module surface.
 *
 * Re-exports the routes mount helper, the poster worker entrypoints, and
 * the public queue helper used by Plan B's mark-published flow.
 *
 * @module pinterest
 */
import { buildRouter } from './routes.js';

export { startPosterWorker, stopPosterWorker } from './poster.js';
export { enqueuePinsForBook } from './queue.js';
export { PinterestApiClient, PinterestApiError } from './api_client.js';
export { ensureFreshToken, readStoredToken } from './api_oauth.js';

/**
 * Mount `/api/pinterest/*` on an Express app.
 *
 * @param {import('express').Express} app
 * @param {{apiClient?: import('./api_client.js').PinterestApiClient}} [opts]
 */
export function installPinterestModule(app, opts = {}) {
  app.use('/api/pinterest', buildRouter(opts));
}
```

- [ ] **Step 5: Run the routes test — confirm green**

```bash
cd web.ui/backend && npx vitest run __tests__/pinterest/routes.test.js
```

Expected: every test (existing + 4 new) passes.

---

### Task 6: Rename + rewrite the end-to-end fake-driver test

**Files:**
- Rename: `web.ui/backend/__tests__/pinterest/e2e_fake_driver.test.js` → `web.ui/backend/__tests__/pinterest/e2e_api.test.js`
- Rewrite the renamed file

- [ ] **Step 1: git mv the file**

```bash
git mv web.ui/backend/__tests__/pinterest/e2e_fake_driver.test.js web.ui/backend/__tests__/pinterest/e2e_api.test.js
```

- [ ] **Step 2: Replace the file's contents with the API-driven version**

```javascript
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
import { runOnce } from '../../pinterest/poster.js';

let tmpRoot;

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pin-e2e-'));
  process.env.ROOSTER_DB_PATH = path.join(tmpRoot, 'dashboard.db');
  process.env.PINTEREST_OUTPUT_ROOT = path.join(tmpRoot, 'output', 'pinterest');
  process.env.PINTEREST_DEFAULT_BOARD_ID = 'BOARD_E2E';
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
  delete process.env.PINTEREST_OUTPUT_ROOT;
  delete process.env.PINTEREST_DEFAULT_BOARD_ID;
});

async function seedBookWithArt() {
  const slug = 'e2e-book';
  const outDir = path.join(tmpRoot, 'kdp-ready', slug);
  fs.mkdirSync(outDir, { recursive: true });
  const png = async (file, w, h) =>
    sharp({
      create: { width: w, height: h, channels: 3, background: { r: 220, g: 220, b: 220 } },
    }).png().toFile(file);
  await png(path.join(outDir, 'cover_preview.png'), 800, 1200);
  for (let i = 1; i <= 5; i++) {
    await png(path.join(outDir, `interior_${i}.png`), 600, 800);
  }
  const db = openDb();
  const info = db.prepare(`
    INSERT INTO kdp_books (slug, title, status, output_dir, cover_path, asin, blurb)
    VALUES (?, 'E2E Book', 'published', ?, ?, 'B0E2E00000', 'Test blurb.')
  `).run(slug, outDir, path.join(outDir, 'cover_preview.png'));
  return Number(info.lastInsertRowid);
}

describe('end-to-end with fake apiClient', () => {
  it('enqueues 6 pins, posts them one by one, ends with empty pending queue', async () => {
    const events = [];
    const unsubscribe = subscribe((evt) => events.push(evt));
    try {
      const bookId = await seedBookWithArt();
      const inserted = await enqueuePinsForBook(bookId);
      expect(inserted).toHaveLength(6);

      const scheduledEvents = events.filter((e) => e.kind === 'pinterest:pin-scheduled');
      expect(scheduledEvents).toHaveLength(6);

      const db = openDb();
      db.prepare(`UPDATE pinterest_queue SET scheduled_for = ? WHERE status='pending'`)
        .run(new Date(Date.now() - 60_000).toISOString());

      let pinCounter = 0;
      const fakeApi = {
        createPin: vi.fn(async () => ({ id: `pin_${++pinCounter}` })),
        listBoards: vi.fn(async () => [{ id: 'BOARD_E2E', name: 'e2e' }]),
        getUserAccount: vi.fn(async () => ({ username: 'u' })),
        getTokenStatus: vi.fn(async () => ({ connected: true, expires_at: 'x' })),
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
        .prepare(`SELECT COUNT(*) AS n FROM pinterest_queue WHERE status='pending'`).get().n;
      expect(finalPending).toBe(0);
      const posted = db
        .prepare(`SELECT COUNT(*) AS n FROM pinterest_queue WHERE status='posted'`).get().n;
      expect(posted).toBe(6);
      const history = db
        .prepare(`SELECT COUNT(*) AS n FROM pinterest_history WHERE success = 1`).get().n;
      expect(history).toBe(6);

      const postedEvents = events.filter((e) => e.kind === 'pinterest:pin-posted');
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
```

- [ ] **Step 3: Run the renamed test — confirm green**

```bash
cd web.ui/backend && npx vitest run __tests__/pinterest/e2e_api.test.js
```

Expected: 1 test passes, 6 createPin invocations.

---

### Task 7: Module surface cleanup + delete `.pinterest-profile/` + gitignore

**Files:**
- Modify: `web.ui/backend/pinterest/index.js` (already done in Task 5 — verify exports)
- Modify: `.gitignore` (remove `.pinterest-profile/` line)
- Delete: `web.ui/backend/.pinterest-profile/` directory if present

- [ ] **Step 1: Verify `index.js` no longer exports anything from login.js**

```bash
grep -n "login" web.ui/backend/pinterest/index.js || echo "no login references"
```

Expected: `no login references`. (Task 5 already removed them.)

- [ ] **Step 2: Edit `.gitignore` — remove the `.pinterest-profile/` line**

Open `.gitignore` and delete the line:
```
web.ui/backend/.pinterest-profile/
```

Keep `output/pinterest/` (still used for pin PNGs).

The block should now read:
```
# Plan E — Pinterest automation
output/pinterest/
```

- [ ] **Step 3: Remove the persistent profile dir if it exists**

Run from the repo root:

```bash
node -e "require('node:fs').rmSync('web.ui/backend/.pinterest-profile', {recursive: true, force: true}); console.log('removed (or absent)');"
```

Expected: `removed (or absent)`. The `force: true` flag makes it a no-op when the directory doesn't exist.

- [ ] **Step 4: Run the entire pinterest test suite to catch regressions**

```bash
cd web.ui/backend && npx vitest run __tests__/pinterest
```

Expected: all four pinterest test files pass:
- `api_oauth.test.js` (8 tests)
- `api_client.test.js` (8 tests)
- `poster.test.js` (7 tests)
- `routes.test.js` (existing queue/history/pause/resume/cancel/PUT tests + 4 new whoami/boards/token-status tests)
- `e2e_api.test.js` (1 test)

---

### Task 8: Commit 1

- [ ] **Step 1: Stage every Commit 1 change**

```bash
git add web.ui/backend/pinterest/api_oauth.js \
        web.ui/backend/pinterest/api_client.js \
        web.ui/backend/pinterest/poster.js \
        web.ui/backend/pinterest/routes.js \
        web.ui/backend/pinterest/index.js \
        web.ui/backend/__tests__/pinterest/api_oauth.test.js \
        web.ui/backend/__tests__/pinterest/api_client.test.js \
        web.ui/backend/__tests__/pinterest/poster.test.js \
        web.ui/backend/__tests__/pinterest/routes.test.js \
        web.ui/backend/__tests__/pinterest/e2e_api.test.js \
        .gitignore
git rm --cached web.ui/backend/pinterest/login.js 2>/dev/null || true
git rm --cached web.ui/backend/__tests__/pinterest/login.test.js 2>/dev/null || true
git status
```

Expected: every file above is staged; `login.js` and `login.test.js` are staged as deleted; `e2e_fake_driver.test.js` is staged as a rename to `e2e_api.test.js`.

- [ ] **Step 2: Commit**

```bash
git commit -m "$(cat <<'EOF'
refactor(pinterest): replace Playwright poster with v5 API

Pinterest trial access was approved 2026-05-27 — the Playwright DOM-
automation poster is now strictly worse than direct v5 API calls. This
commit removes the Playwright path entirely:

- Add api_oauth.js — 30-day token refresh with 5-minute skew + first-run
  env-var bootstrap. Mirrors etsy/oauth.js with Basic auth.
- Add api_client.js — Pinterest v5 wrapper. createPin uses base64 inline
  upload; 401 forces refresh+retry once; 429 backs off through the 60s/
  5m/30m ladder; 5xx retries up to 3 times. msw-mocked tests.
- Rewrite poster.js — runOnce() now takes an apiClient and calls
  createPin instead of driving a browser. Backoff supervisor loop
  unchanged.
- Delete login.js + login.test.js (no more visible Chromium window).
- Strip POST /api/pinterest/login from routes.js.
- Add GET /whoami, /boards, /token-status. Router becomes a factory that
  takes apiClient; installPinterestModule(app, {apiClient}) forwards it.
- Rename e2e_fake_driver.test.js -> e2e_api.test.js; same end-to-end
  invariants with a fake apiClient instead of a fake browser driver.
- Remove web.ui/backend/.pinterest-profile/ + its gitignore entry.

All four pinterest test files green: api_oauth (8), api_client (8),
poster (7), routes (existing + 4 new), e2e_api (1).
EOF
)"
```

Expected: commit lands with the message above.

---

## Commit 2 — `feat(pinterest): API-based settings UI + help article`

### Task 9: Extend `src/api/pinterest.ts` + add tests

**Files:**
- Modify: `web.ui/frontend-react/src/api/pinterest.ts`
- Modify: `web.ui/frontend-react/src/__tests__/api-pinterest.test.ts`

- [ ] **Step 1: Append the new test blocks to `api-pinterest.test.ts`**

Add to the imports at the top:

```typescript
import {
  getWhoami,
  listBoards,
  getTokenStatus,
  refreshToken,
  type PinterestUser,
  type PinterestBoard,
  type PinterestTokenStatus,
} from '../api/pinterest';
```

Also remove the `startLogin` import (we'll delete that helper in Step 3) and delete the `describe('startLogin', ...)` block.

Append three new describe blocks after `describe('updateQueueRow', ...)`:

```typescript
describe('getWhoami', () => {
  it('GETs /api/pinterest/whoami and returns the user envelope', async () => {
    const body: PinterestUser = { username: 'prp', business_name: 'Pocket Rooster Press' };
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse(200, body));
    const out = await getWhoami();
    expect(fetchSpy).toHaveBeenCalledWith('/api/pinterest/whoami');
    expect(out).toEqual(body);
  });

  it('throws ApiError on 502', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse(502, { error: 'upstream' }));
    await expect(getWhoami()).rejects.toMatchObject({ status: 502 });
  });
});

describe('listBoards', () => {
  it('GETs /api/pinterest/boards and unwraps {boards}', async () => {
    const boards: PinterestBoard[] = [
      { id: 'B1', name: 'Coloring' },
      { id: 'B2', name: 'Sudoku' },
    ];
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse(200, { boards }));
    const out = await listBoards();
    expect(fetchSpy).toHaveBeenCalledWith('/api/pinterest/boards');
    expect(out).toEqual(boards);
  });

  it('throws ApiError on 503', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse(503, { error: 'api_client_unavailable' }));
    await expect(listBoards()).rejects.toMatchObject({ status: 503 });
  });
});

describe('getTokenStatus', () => {
  it('GETs /api/pinterest/token-status and returns the envelope', async () => {
    const body: PinterestTokenStatus = { connected: true, expires_at: '2026-06-26T18:32:00.000Z' };
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse(200, body));
    const out = await getTokenStatus();
    expect(fetchSpy).toHaveBeenCalledWith('/api/pinterest/token-status');
    expect(out).toEqual(body);
  });

  it('returns {connected: false} envelope for an unbootstrapped backend', async () => {
    const body: PinterestTokenStatus = { connected: false, expires_at: null };
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse(200, body));
    const out = await getTokenStatus();
    expect(out.connected).toBe(false);
    expect(out.expires_at).toBeNull();
  });
});

describe('refreshToken', () => {
  it('POSTs /api/pinterest/refresh and returns {connected, expires_at}', async () => {
    const body: PinterestTokenStatus = { connected: true, expires_at: '2026-07-26T18:32:00.000Z' };
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse(200, body));
    const out = await refreshToken();
    expect(fetchSpy).toHaveBeenCalledWith('/api/pinterest/refresh', { method: 'POST' });
    expect(out).toEqual(body);
  });

  it('throws ApiError on 401 (re-auth required)', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse(401, { error: 're-auth required' }));
    await expect(refreshToken()).rejects.toMatchObject({ status: 401 });
  });
});
```

- [ ] **Step 2: Run the test — confirm it fails**

```bash
cd web.ui/frontend-react && npx vitest run src/__tests__/api-pinterest.test.ts
```

Expected: `'getWhoami' is not exported from '../api/pinterest'` etc.

- [ ] **Step 3: Rewrite `web.ui/frontend-react/src/api/pinterest.ts`**

Append the new types + functions and delete `startLogin`. The full file:

```typescript
/**
 * Typed fetch wrappers for the /api/pinterest/* backend routes.
 *
 *   listQueue()                  → GET    /api/pinterest/queue
 *   listHistory(limit?)          → GET    /api/pinterest/history?limit=N
 *   pauseQueue()                 → POST   /api/pinterest/pause
 *   resumeQueue()                → POST   /api/pinterest/resume
 *   cancelQueueRow(id)           → POST   /api/pinterest/queue/:id/cancel
 *   updateQueueRow(id, patch)    → PUT    /api/pinterest/queue/:id
 *   getWhoami()                  → GET    /api/pinterest/whoami
 *   listBoards()                 → GET    /api/pinterest/boards
 *   getTokenStatus()             → GET    /api/pinterest/token-status
 *   refreshToken()               → POST   /api/pinterest/refresh
 *
 * All functions throw an `ApiError` (re-exported from ./kdp) with `.status`
 * and `.body` on non-2xx. The backend wraps list responses in `{queue: [...]}`
 * / `{history: [...]}` / `{boards: [...]}` envelopes — those are unwrapped
 * here so callers see plain arrays.
 *
 * Tests stub `globalThis.fetch`.
 */

import { ApiError } from './kdp';

export type PinType = 'cover_hero' | 'interior_preview';
export type QueueStatus =
  | 'pending'
  | 'posting'
  | 'posted'
  | 'failed'
  | 'paused'
  | 'cancelled';

export interface PinterestQueueRow {
  id: number;
  kdp_book_id: number | null;
  pin_type: PinType;
  /** Filesystem path; preview UI converts this to a /files URL. */
  image_path: string;
  title: string;
  description: string;
  link_url: string;
  status: QueueStatus;
  scheduled_for: string;
  attempts: number;
  last_error: string | null;
  created_at: string;
}

export interface PinterestHistoryRow {
  id: number;
  queue_id: number;
  pinterest_pin_id: string | null;
  posted_at: string;
  success: boolean;
  error_message: string | null;
  title?: string;
  image_path?: string;
}

export interface UpdateQueuePatch {
  title?: string;
  description?: string;
  scheduled_for?: string;
}

export interface PinterestUser {
  username: string;
  business_name?: string;
}

export interface PinterestBoard {
  id: string;
  name: string;
  privacy?: string;
}

export interface PinterestTokenStatus {
  connected: boolean;
  /** ISO timestamp, or null when the token has never been bootstrapped. */
  expires_at: string | null;
}

async function throwForStatus(r: Response, label: string): Promise<never> {
  let body: unknown = null;
  try { body = await r.json(); } catch { /* body not JSON */ }
  const detail =
    body && typeof body === 'object' && 'error' in body
      ? String((body as { error: unknown }).error)
      : '';
  const message = detail ? `${label}: ${r.status} ${detail}` : `${label}: ${r.status}`;
  throw new ApiError(message, r.status, body);
}

export async function listQueue(): Promise<PinterestQueueRow[]> {
  const r = await fetch('/api/pinterest/queue');
  if (!r.ok) await throwForStatus(r, 'listQueue');
  const data = (await r.json()) as { queue: PinterestQueueRow[] };
  return data.queue;
}

export async function listHistory(limit = 100): Promise<PinterestHistoryRow[]> {
  const r = await fetch(`/api/pinterest/history?limit=${encodeURIComponent(limit)}`);
  if (!r.ok) await throwForStatus(r, 'listHistory');
  const data = (await r.json()) as { history: PinterestHistoryRow[] };
  return data.history;
}

export async function pauseQueue(): Promise<{ paused: number }> {
  const r = await fetch('/api/pinterest/pause', { method: 'POST' });
  if (!r.ok) await throwForStatus(r, 'pauseQueue');
  return (await r.json()) as { paused: number };
}

export async function resumeQueue(): Promise<{ resumed: number }> {
  const r = await fetch('/api/pinterest/resume', { method: 'POST' });
  if (!r.ok) await throwForStatus(r, 'resumeQueue');
  return (await r.json()) as { resumed: number };
}

export async function cancelQueueRow(id: number): Promise<{ ok: true }> {
  const r = await fetch(`/api/pinterest/queue/${id}/cancel`, { method: 'POST' });
  if (!r.ok) await throwForStatus(r, 'cancelQueueRow');
  return (await r.json()) as { ok: true };
}

export async function updateQueueRow(id: number, patch: UpdateQueuePatch): Promise<{ ok: true }> {
  const r = await fetch(`/api/pinterest/queue/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
  if (!r.ok) await throwForStatus(r, 'updateQueueRow');
  return (await r.json()) as { ok: true };
}

export async function getWhoami(): Promise<PinterestUser> {
  const r = await fetch('/api/pinterest/whoami');
  if (!r.ok) await throwForStatus(r, 'getWhoami');
  return (await r.json()) as PinterestUser;
}

export async function listBoards(): Promise<PinterestBoard[]> {
  const r = await fetch('/api/pinterest/boards');
  if (!r.ok) await throwForStatus(r, 'listBoards');
  const data = (await r.json()) as { boards: PinterestBoard[] };
  return data.boards;
}

export async function getTokenStatus(): Promise<PinterestTokenStatus> {
  const r = await fetch('/api/pinterest/token-status');
  if (!r.ok) await throwForStatus(r, 'getTokenStatus');
  return (await r.json()) as PinterestTokenStatus;
}

export async function refreshToken(): Promise<PinterestTokenStatus> {
  const r = await fetch('/api/pinterest/refresh', { method: 'POST' });
  if (!r.ok) await throwForStatus(r, 'refreshToken');
  return (await r.json()) as PinterestTokenStatus;
}

export { ApiError };
```

- [ ] **Step 4: Add the matching backend `POST /refresh` route**

The `refreshToken()` frontend helper hits a new backend route. Edit `web.ui/backend/pinterest/routes.js` and add inside `buildRouter()` before the `return router;`:

```javascript
  router.post('/refresh', async (_req, res) => {
    if (!apiClient) return res.status(503).json({ error: 'api_client_unavailable' });
    try {
      // Force a refresh by zeroing expires_at then calling getTokenStatus
      // — which triggers ensureFreshToken on its next call via createPin /
      // listBoards. Here we explicitly invoke ensureFreshToken via the
      // apiClient's exposed _refresh hook.
      await apiClient._forceRefresh();
      const status = await apiClient.getTokenStatus();
      res.json(status);
    } catch (err) {
      const status = err && typeof err === 'object' && 'status' in err && err.status === 401
        ? 401
        : 500;
      res.status(status).json({ error: err?.message || String(err) });
    }
  });
```

And add a `_forceRefresh` method to `PinterestApiClient` in `web.ui/backend/pinterest/api_client.js` (inside the class, before `_callApi`):

```javascript
  /**
   * Force the next API call to refresh the token. Used by the UI's
   * "Refresh token now" button.
   *
   * @returns {Promise<void>}
   */
  async _forceRefresh() {
    // Zero out expires_at on disk, then call ensureFreshToken to drive the
    // refresh cycle exactly once.
    const fs = await import('node:fs');
    if (fs.existsSync(this.tokenStorePath)) {
      const stored = JSON.parse(fs.readFileSync(this.tokenStorePath, 'utf8'));
      stored.expires_at = new Date(0).toISOString();
      fs.writeFileSync(this.tokenStorePath, JSON.stringify(stored), 'utf8');
    }
    await this._token();
  }
```

Add a routes test for the new endpoint inside `__tests__/pinterest/routes.test.js`:

```javascript
describe('POST /api/pinterest/refresh', () => {
  it('calls apiClient._forceRefresh then returns getTokenStatus()', async () => {
    const api = {
      _forceRefresh: vi.fn(async () => {}),
      getTokenStatus: vi.fn(async () => ({
        connected: true,
        expires_at: '2026-07-26T18:32:00.000Z',
      })),
      listBoards: vi.fn(), getUserAccount: vi.fn(), createPin: vi.fn(),
    };
    const a2 = await makeAppWithApi(api);
    const res = await request(a2).post('/api/pinterest/refresh').send({});
    expect(res.status).toBe(200);
    expect(res.body.connected).toBe(true);
    expect(api._forceRefresh).toHaveBeenCalled();
  });

  it('surfaces a 401 when the refresh-token is expired', async () => {
    const err = new Error('Pinterest refresh token expired — re-auth required');
    err.status = 401;
    const api = {
      _forceRefresh: vi.fn(async () => { throw err; }),
      getTokenStatus: vi.fn(),
      listBoards: vi.fn(), getUserAccount: vi.fn(), createPin: vi.fn(),
    };
    const a2 = await makeAppWithApi(api);
    const res = await request(a2).post('/api/pinterest/refresh').send({});
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/re-auth/i);
  });
});
```

- [ ] **Step 5: Run the frontend test — confirm green**

```bash
cd web.ui/frontend-react && npx vitest run src/__tests__/api-pinterest.test.ts
```

Expected: every test passes (existing + 8 new for getWhoami/listBoards/getTokenStatus/refreshToken).

- [ ] **Step 6: Run the backend routes test — confirm green**

```bash
cd web.ui/backend && npx vitest run __tests__/pinterest/routes.test.js
```

Expected: every test passes including the two new refresh tests.

---

### Task 10: Rewrite `PinterestSettings.tsx` + update its test

**Files:**
- Modify: `web.ui/frontend-react/src/components/PinterestSettings.tsx`
- Modify: `web.ui/frontend-react/src/__tests__/PinterestSettings.test.tsx`

- [ ] **Step 1: Replace `PinterestSettings.test.tsx` with the API-edition test**

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PinterestSettings from '../components/PinterestSettings';
import type {
  PinterestQueueRow,
  PinterestUser,
  PinterestBoard,
  PinterestTokenStatus,
} from '../api/pinterest';

function jsonOk(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

const pendingRow: PinterestQueueRow = {
  id: 1,
  kdp_book_id: 1,
  pin_type: 'cover_hero',
  image_path: '/tmp/output/pinterest/sample/cover_hero-0.png',
  title: 'A pending pin',
  description: 'desc',
  link_url: 'https://www.amazon.com/dp/B01ABCDEFG',
  status: 'pending',
  scheduled_for: '2026-06-01T15:00:00Z',
  attempts: 0,
  last_error: null,
  created_at: '2026-05-26T00:00:00Z',
};
const pausedRow: PinterestQueueRow = { ...pendingRow, id: 2, status: 'paused' };

const userBody: PinterestUser = { username: 'pocketroosterpress', business_name: 'Pocket Rooster Press' };
const boardsBody: PinterestBoard[] = [
  { id: 'B1', name: 'Cottagecore Coloring' },
  { id: 'B2', name: 'Sudoku Puzzles' },
];
const statusFresh: PinterestTokenStatus = {
  connected: true,
  expires_at: new Date(Date.now() + 30 * 86400_000).toISOString(),
};
const statusExpiringSoon: PinterestTokenStatus = {
  connected: true,
  expires_at: new Date(Date.now() + 3 * 86400_000).toISOString(),
};
const statusDisconnected: PinterestTokenStatus = { connected: false, expires_at: null };

let fetchMock: ReturnType<typeof vi.fn>;

function respond(url: string): Response {
  if (url === '/api/pinterest/token-status') return jsonOk(statusFresh);
  if (url === '/api/pinterest/boards') return jsonOk({ boards: boardsBody });
  if (url === '/api/pinterest/whoami') return jsonOk(userBody);
  throw new Error(`unexpected fetch: ${url}`);
}

beforeEach(() => {
  fetchMock = vi.fn(async (url: string) => respond(url));
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('<PinterestSettings />', () => {
  it('shows pending and paused counts derived from the queue', async () => {
    render(
      <PinterestSettings
        queue={[pendingRow, pendingRow, pausedRow]}
        onChanged={vi.fn()}
      />,
    );
    await waitFor(() => screen.getByText(/Connected as/i));
    const counts = screen.getByText(/pending/i);
    expect(counts.textContent).toMatch(/2.*pending/);
    expect(counts.textContent).toMatch(/1.*paused/);
  });

  it('on mount fetches token-status, whoami, and boards', async () => {
    render(<PinterestSettings queue={[pendingRow]} onChanged={vi.fn()} />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/pinterest/token-status'));
    expect(fetchMock).toHaveBeenCalledWith('/api/pinterest/whoami');
    expect(fetchMock).toHaveBeenCalledWith('/api/pinterest/boards');
  });

  it('renders the "Connected" chip when token-status returns connected=true and ≥7d remaining', async () => {
    render(<PinterestSettings queue={[]} onChanged={vi.fn()} />);
    await waitFor(() => expect(screen.getByText(/Connected as @pocketroosterpress/i)).toBeInTheDocument());
    expect(screen.getByText(/Connected/i).className).toMatch(/chip-ok/);
  });

  it('renders the "Expiring soon" chip when expires_at < 7 days away', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url === '/api/pinterest/token-status') return jsonOk(statusExpiringSoon);
      return respond(url);
    });
    render(<PinterestSettings queue={[]} onChanged={vi.fn()} />);
    await waitFor(() => expect(screen.getByText(/Expiring/i)).toBeInTheDocument());
  });

  it('renders the disconnected chip when token-status returns connected=false', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url === '/api/pinterest/token-status') return jsonOk(statusDisconnected);
      if (url === '/api/pinterest/boards') return jsonOk({ boards: [] });
      if (url === '/api/pinterest/whoami') {
        return { ok: false, status: 503, json: async () => ({ error: 'api_client_unavailable' }) } as unknown as Response;
      }
      throw new Error(url);
    });
    render(<PinterestSettings queue={[]} onChanged={vi.fn()} />);
    await waitFor(() => expect(screen.getByText(/Not connected/i)).toBeInTheDocument());
  });

  it('clicking "Test connection" calls /whoami and surfaces the username', async () => {
    render(<PinterestSettings queue={[]} onChanged={vi.fn()} />);
    await waitFor(() => screen.getByText(/Connected as/i));
    fetchMock.mockClear();
    fetchMock.mockImplementation(async (url: string) => respond(url));
    await userEvent.click(screen.getByRole('button', { name: /Test connection/i }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/pinterest/whoami'));
    expect(screen.getByText(/Connected as @pocketroosterpress/i)).toBeInTheDocument();
  });

  it('clicking "Refresh token now" POSTs /refresh and updates the chip', async () => {
    render(<PinterestSettings queue={[]} onChanged={vi.fn()} />);
    await waitFor(() => screen.getByText(/Connected as/i));
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (init?.method === 'POST' && url === '/api/pinterest/refresh') return jsonOk(statusFresh);
      return respond(url);
    });
    await userEvent.click(screen.getByRole('button', { name: /Refresh token now/i }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith('/api/pinterest/refresh', { method: 'POST' }),
    );
  });

  it('renders the board dropdown populated from /boards', async () => {
    render(<PinterestSettings queue={[]} onChanged={vi.fn()} />);
    await waitFor(() => screen.getByRole('combobox', { name: /Default board/i }));
    const opts = screen.getAllByRole('option').map((o) => o.textContent);
    expect(opts).toContain('Cottagecore Coloring');
    expect(opts).toContain('Sudoku Puzzles');
  });

  it('still shows Pause/Resume buttons for the underlying queue', async () => {
    render(<PinterestSettings queue={[pendingRow]} onChanged={vi.fn()} />);
    await waitFor(() => screen.getByText(/Connected as/i));
    expect(screen.getByRole('button', { name: /Pause queue/i })).toBeInTheDocument();
  });

  it('shows the cadence summary in muted copy', async () => {
    render(<PinterestSettings queue={[]} onChanged={vi.fn()} />);
    await waitFor(() =>
      expect(
        screen.getByText(/3.{1,3}5 pins\/day between 09:00 and 21:00/i),
      ).toBeInTheDocument(),
    );
  });

  it('clicking Pause POSTs /api/pinterest/pause and calls onChanged', async () => {
    const onChanged = vi.fn();
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (init?.method === 'POST' && url === '/api/pinterest/pause') return jsonOk({ paused: 3 });
      return respond(url);
    });
    render(<PinterestSettings queue={[pendingRow]} onChanged={onChanged} />);
    await waitFor(() => screen.getByText(/Connected as/i));
    await userEvent.click(screen.getByRole('button', { name: /Pause queue/i }));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
  });
});
```

- [ ] **Step 2: Run the test — confirm it fails (old component still has Sign-in button)**

```bash
cd web.ui/frontend-react && npx vitest run src/__tests__/PinterestSettings.test.tsx
```

Expected: tests fail because the component doesn't render Connected/Refresh/Default-board controls yet.

- [ ] **Step 3: Rewrite `web.ui/frontend-react/src/components/PinterestSettings.tsx`**

```typescript
import { useEffect, useState } from 'react';
import {
  pauseQueue,
  resumeQueue,
  getWhoami,
  getTokenStatus,
  listBoards,
  refreshToken,
  type PinterestQueueRow,
  type PinterestUser,
  type PinterestBoard,
  type PinterestTokenStatus,
} from '../api/pinterest';

interface Props {
  queue: PinterestQueueRow[];
  onChanged: () => void | Promise<void>;
}

/**
 * Pinterest connection status + board picker + queue pause/resume.
 *
 * On mount we fetch /token-status, /whoami, /boards in parallel. The chip
 * goes green when token-status returns connected=true and expires_at is more
 * than 7 days away; amber inside 7 days; red on connected=false.
 *
 * Test-connection re-fetches /whoami. Refresh-token-now POSTs /refresh
 * (forces ensureFreshToken on the backend) and re-renders the chip.
 *
 * The default-board <select> persists locally to the component for now;
 * server-side persistence lives in PINTEREST_DEFAULT_BOARD_ID env until a
 * profile-level field is added in a follow-up.
 */
export default function PinterestSettings({ queue, onChanged }: Props) {
  const [status, setStatus] = useState<PinterestTokenStatus | null>(null);
  const [user, setUser] = useState<PinterestUser | null>(null);
  const [boards, setBoards] = useState<PinterestBoard[]>([]);
  const [selectedBoardId, setSelectedBoardId] = useState<string>('');
  const [message, setMessage] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const [lastRefreshAt, setLastRefreshAt] = useState<string>('');

  const pendingCount = queue.filter((r) => r.status === 'pending').length;
  const pausedCount = queue.filter((r) => r.status === 'paused').length;
  const isPaused = pausedCount > 0;

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [s, b] = await Promise.all([getTokenStatus(), listBoards()]);
        if (cancelled) return;
        setStatus(s);
        setBoards(b);
        if (b.length > 0) setSelectedBoardId(b[0].id);
      } catch (err) {
        if (!cancelled) setMessage(`Status load failed: ${(err as Error).message}`);
      }
      try {
        const u = await getWhoami();
        if (!cancelled) setUser(u);
      } catch {
        // Leave user=null — chip falls back to "Not connected".
      }
    }
    void load();
    return () => { cancelled = true; };
  }, []);

  function chipClass(): string {
    if (!status || !status.connected) return 'pin-chip chip-bad';
    if (!status.expires_at) return 'pin-chip chip-amber';
    const msLeft = new Date(status.expires_at).getTime() - Date.now();
    if (msLeft < 7 * 86400_000) return 'pin-chip chip-amber';
    return 'pin-chip chip-ok';
  }

  function chipLabel(): string {
    if (!status || !status.connected) return 'Not connected';
    if (user?.username) return `Connected as @${user.username}`;
    return 'Connected';
  }

  function formatExpires(): string {
    if (!status?.expires_at) return '—';
    const d = new Date(status.expires_at);
    const days = Math.round((d.getTime() - Date.now()) / 86400_000);
    return `${d.toISOString().slice(0, 10)} (${days} days)`;
  }

  async function handleTestConnection() {
    setBusy(true);
    try {
      const u = await getWhoami();
      setUser(u);
      setMessage(`Connection ok: @${u.username}`);
    } catch (err) {
      setMessage(`Test failed: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  async function handleRefreshToken() {
    setBusy(true);
    try {
      const next = await refreshToken();
      setStatus(next);
      setLastRefreshAt(new Date().toISOString().replace('T', ' ').slice(0, 16));
      setMessage('Token refreshed.');
    } catch (err) {
      setMessage(`Refresh failed: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  async function handlePause() {
    setBusy(true);
    try {
      const r = await pauseQueue();
      setMessage(`Paused ${r.paused} pin(s).`);
      await onChanged();
    } catch (err) {
      setMessage(`Pause failed: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  async function handleResume() {
    setBusy(true);
    try {
      const r = await resumeQueue();
      setMessage(`Resumed ${r.resumed} pin(s).`);
      await onChanged();
    } catch (err) {
      setMessage(`Resume failed: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="pin-settings" aria-label="Pinterest settings">
      <h2>Settings</h2>

      <div className="pin-settings-row">
        <div>
          <span className={chipClass()}>{chipLabel()}</span>
          <span className="muted"> · Token expires: {formatExpires()}</span>
          {lastRefreshAt && (
            <span className="muted"> · Last refresh: {lastRefreshAt}</span>
          )}
        </div>
        <div className="pin-settings-actions">
          <button type="button" onClick={handleTestConnection} disabled={busy}>
            Test connection
          </button>
          <button type="button" onClick={handleRefreshToken} disabled={busy}>
            Refresh token now
          </button>
        </div>
      </div>

      <div className="pin-settings-row">
        <label htmlFor="pin-board-select">Default board:</label>
        <select
          id="pin-board-select"
          aria-label="Default board"
          value={selectedBoardId}
          onChange={(e) => setSelectedBoardId(e.target.value)}
        >
          {boards.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
      </div>

      <div className="pin-settings-row">
        <div>
          <strong>{pendingCount}</strong> pending ·{' '}
          <strong>{pausedCount}</strong> paused
        </div>
        <div className="pin-settings-actions">
          {isPaused ? (
            <button type="button" onClick={handleResume} disabled={busy}>
              Resume queue
            </button>
          ) : (
            <button
              type="button"
              onClick={handlePause}
              disabled={busy || pendingCount === 0}
            >
              Pause queue
            </button>
          )}
        </div>
      </div>

      <p className="muted">
        Posting cadence: 3–5 pins/day between 09:00 and 21:00 in your
        profile time zone. Edit the time zone on /profile to shift the
        window.
      </p>
      {message && <p className="pin-settings-status">{message}</p>}
    </section>
  );
}
```

- [ ] **Step 4: Run the test — confirm green**

```bash
cd web.ui/frontend-react && npx vitest run src/__tests__/PinterestSettings.test.tsx
```

Expected: all 10 tests pass.

---

### Task 11: Rename help article + update help-articles test

**Files:**
- Rename: `web.ui/backend/help/pinterest_first_login.md` → `web.ui/backend/help/pinterest_api_setup.md`
- Replace contents of the renamed file
- Modify: `web.ui/backend/__tests__/help_articles.test.js` (update ARTICLES entry)

- [ ] **Step 1: git mv the article**

```bash
git mv web.ui/backend/help/pinterest_first_login.md web.ui/backend/help/pinterest_api_setup.md
```

- [ ] **Step 2: Replace the file's contents per spec §5.2**

Overwrite `web.ui/backend/help/pinterest_api_setup.md` with:

````markdown
# Pinterest API Setup

The dashboard posts to Pinterest via the official v5 API. You provide
credentials once in .env.local; the dashboard handles token refresh
automatically every 30 days.

## Required env vars

Add to `.env.local` at the repo root:

```
PINTEREST_ACCESS_TOKEN=<paste from Pinterest dev portal>
PINTEREST_REFRESH_TOKEN=<paste from Pinterest dev portal>
PINTEREST_APP_ID=1572111
PINTEREST_APP_SECRET=<paste from Pinterest dev portal>
PINTEREST_DEFAULT_BOARD_ID=<optional; auto-detected if missing>
```

## Where to get these

1. Visit https://developers.pinterest.com/apps/
2. Open your app (Pocket Rooster Press Pin Bot)
3. Under "Configuration":
    - App ID is shown at the top — that's `PINTEREST_APP_ID`
    - "App secret key" — that's `PINTEREST_APP_SECRET`
4. Under "Trial access":
    - "Generate access token" → that's `PINTEREST_ACCESS_TOKEN`
    - The refresh token is returned alongside — that's `PINTEREST_REFRESH_TOKEN`
5. Restart the dashboard (Quit + relaunch from the tray menu)

## Verifying

Open /pinterest in the dashboard, scroll to Settings. The status chip
should say "✓ Connected as @<your-handle>". Click "Test connection" to
double-check.

## When the refresh fails

If the dashboard banner says "Pinterest refresh token expired", that
means it's been more than a year since you generated the tokens (or
Pinterest revoked them). Regenerate from the dev portal and re-paste
into .env.local.
````

- [ ] **Step 3: Update `__tests__/help_articles.test.js` ARTICLES entry**

Replace the entry:

```javascript
  ['pinterest_first_login', 'Sign in to Pinterest'],
```

with:

```javascript
  ['pinterest_api_setup', 'Pinterest API'],
```

The signature phrase `Pinterest API` appears in the article's H1 (`# Pinterest API Setup`).

- [ ] **Step 4: If any frontend code references the old help slug, update it**

```bash
grep -rn "pinterest_first_login" web.ui/ || echo "no references remain"
```

Expected: `no references remain`. If anything matches, change those slugs to `pinterest_api_setup`.

- [ ] **Step 5: Run the help test — confirm green**

```bash
cd web.ui/backend && npx vitest run __tests__/help_articles.test.js
```

Expected: all 8 article tests pass.

- [ ] **Step 6: Run the full backend + frontend test suites for a final regression sweep**

```bash
cd web.ui/backend && npx vitest run
cd ../../web.ui/frontend-react && npx vitest run
```

Expected: every test passes in both packages.

---

### Task 12: Commit 2

- [ ] **Step 1: Stage every Commit 2 change**

```bash
git add web.ui/frontend-react/src/api/pinterest.ts \
        web.ui/frontend-react/src/components/PinterestSettings.tsx \
        web.ui/frontend-react/src/__tests__/api-pinterest.test.ts \
        web.ui/frontend-react/src/__tests__/PinterestSettings.test.tsx \
        web.ui/backend/help/pinterest_api_setup.md \
        web.ui/backend/__tests__/help_articles.test.js \
        web.ui/backend/pinterest/routes.js \
        web.ui/backend/pinterest/api_client.js \
        web.ui/backend/__tests__/pinterest/routes.test.js
git status
```

Expected: every file above is staged; `pinterest_first_login.md` is staged as a rename to `pinterest_api_setup.md`.

- [ ] **Step 2: Commit**

```bash
git commit -m "$(cat <<'EOF'
feat(pinterest): API-based settings UI + help article

Wire Commit 1's new backend endpoints into the dashboard:

- src/api/pinterest.ts: add getWhoami, listBoards, getTokenStatus,
  refreshToken with PinterestUser / PinterestBoard / PinterestTokenStatus
  types. Delete the old startLogin helper.
- PinterestSettings.tsx: rewrite around a connection chip (green/amber/
  red based on token-status), [Test connection] + [Refresh token now]
  buttons, and a default-board <select> populated from /boards. Pause/
  resume queue toggle stays put.
- Add POST /api/pinterest/refresh — forces ensureFreshToken via a new
  PinterestApiClient._forceRefresh method.
- Rename help/pinterest_first_login.md → pinterest_api_setup.md with
  new env-var / dev-portal copy.
- Update help_articles.test.js ARTICLES entry to match the new slug
  and signature phrase.
EOF
)"
```

Expected: commit lands with the message above.

---

## Verification checklist

After both commits land, every box below should be checked:

- [ ] `cd web.ui/backend && npx vitest run` — all backend tests green
- [ ] `cd web.ui/frontend-react && npx vitest run` — all frontend tests green
- [ ] `grep -rn "pinterest/login" web.ui/ || echo ok` — prints `ok` (no stale imports)
- [ ] `grep -rn "playwright" web.ui/backend/pinterest/ || echo ok` — prints `ok`
- [ ] `grep -rn "pinterest_first_login" web.ui/ || echo ok` — prints `ok`
- [ ] `.gitignore` no longer mentions `.pinterest-profile/`
- [ ] `web.ui/backend/.pinterest-profile/` does not exist on disk
- [ ] `web.ui/backend/pinterest/login.js` does not exist on disk
- [ ] `web.ui/backend/__tests__/pinterest/login.test.js` does not exist on disk
- [ ] `git log --oneline -5` shows the two new commits with the expected subjects

---

## Spec coverage trace

| Spec section | Covered by |
|---|---|
| §3.1 Backend module map | T1 (api_oauth.js), T2 (api_client.js), T3 (poster.js rewrite), T4 (login.js deletion + login route removal), T5 (whoami/boards/token-status routes), T7 (index.js surface) |
| §3.2 Token storage shape (`{access_token, refresh_token, expires_at}` ISO) | T1 implementation + tests |
| §3.3 Env vars | T1 (bootstrap), T3 (PINTEREST_DEFAULT_BOARD_ID), spec §5.2 help article |
| §3.4 Final route shape | T4 (delete /login), T5 (/whoami, /boards, /token-status), T9 (/refresh) |
| §4.1 Posting flow | T3 poster.js + e2e_api.test.js (T6) |
| §4.2 Token-refresh flow | T1 + T2 (401-retry + force-refresh) |
| §4.3 First-run bootstrap | T1 last three tests |
| §5.1 PinterestSettings UI | T10 component + test |
| §5.2 Help article | T11 rename + content + ARTICLES update |
| §6 Test matrix | T1, T2, T3, T5, T6, T9, T10, T11 |
| §7 Errors / security | PinterestApiError class (T2); token gitignored via existing `data/` rule; secrets only in env (T1) |
| §8 Migration plan (two commits) | T8 + T12 |
