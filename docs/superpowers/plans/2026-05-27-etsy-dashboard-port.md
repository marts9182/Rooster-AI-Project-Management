# Etsy Dashboard Port Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the dashboard's already-existing Etsy integration actually work by sharing credentials and the OAuth token with `projects/etsy-rooster-shop`, and surface a clear status banner on `/etsy` so silent-empty-list failures can't recur.

**Architecture:** All Etsy code already exists in `web.ui/backend/etsy/*`. This plan adds (a) a `getEtsyStatus()` reader that inspects env + token file + in-memory worker status without side effects, (b) a `GET /api/etsy/status` endpoint serving it, (c) a banner component that drives `/etsy` UX off the status payload, and (d) one new server-startup warn log so missing creds aren't silent. No schema changes, no changes to the syncer or worker loops.

**Tech Stack:** Express, better-sqlite3, vitest + supertest (backend); React 19 + Vite, vitest + React Testing Library + user-event (frontend); `fetch` mocked via `vi.spyOn(globalThis, 'fetch')`.

**Spec:** [`docs/superpowers/specs/2026-05-27-etsy-dashboard-port-design.md`](../specs/2026-05-27-etsy-dashboard-port-design.md)

---

## File Structure

**Created:**
- `web.ui/backend/etsy/status.js` â€” pure function `getEtsyStatus(opts)` returning the status payload.
- `web.ui/backend/__tests__/etsy/status.test.js` â€” unit tests for the four banner states.
- `web.ui/frontend-react/src/components/EtsyStatusBanner.tsx` â€” React component (state-machine driven).
- `web.ui/frontend-react/src/components/__tests__/EtsyStatusBanner.test.tsx` â€” banner state tests.

**Modified:**
- `web.ui/backend/etsy/routes.js` â€” accept `getStatus` in `MountArgs`, add `GET /status` handler.
- `web.ui/backend/__tests__/etsy/routes.test.js` â€” add `GET /status` cases.
- `web.ui/backend/server.js` â€” wire real `getEtsyStatus` into `mountEtsyRoutes`; add one warn log when Etsy is skipped because config is missing.
- `web.ui/backend/.env.example` â€” replace the bare Etsy block with a comment explaining the credential-share with `projects/etsy-rooster-shop` + the bootstrap-script path.
- `web.ui/frontend-react/src/api/etsy.ts` â€” add `EtsyStatus` interface + `getStatus()` function.
- `web.ui/frontend-react/src/pages/EtsyCatalog.tsx` â€” mount banner above the table, remove the now-redundant top-of-page Sync-now button and toast (banner owns sync UX).
- `web.ui/frontend-react/src/__tests__/EtsyCatalog.test.tsx` â€” update to mock `/api/etsy/status` and assert the banner-driven sync flow.

---

## Task 1: `getEtsyStatus()` reader module

**Files:**
- Create: `web.ui/backend/etsy/status.js`
- Test: `web.ui/backend/__tests__/etsy/status.test.js`

Pure function. Reads `process.env` + the on-disk token file + the in-memory worker map. No mutation, no refresh attempts. Dependencies are injectable so tests can stub them.

- [x] **Step 1: Write the failing test**

`web.ui/backend/__tests__/etsy/status.test.js`:

```js
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { getEtsyStatus } from '../../etsy/status.js';
import {
  setWorkerHeartbeat,
  setWorkerError,
  _resetWorkerStatus,
} from '../../workerStatus.js';

const ENV_KEYS = [
  'ETSY_KEYSTRING',
  'ETSY_SHARED_SECRET',
  'ETSY_SHOP_ID',
  'ETSY_TOKEN_PATH',
  'ROOSTER_ETSY_TOKEN_PATH',
];

describe('getEtsyStatus', () => {
  /** @type {Record<string, string | undefined>} */
  let snap;
  /** @type {string} */
  let tmpDir;

  beforeEach(() => {
    snap = {};
    for (const k of ENV_KEYS) {
      snap[k] = process.env[k];
      delete process.env[k];
    }
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'etsy-status-'));
    _resetWorkerStatus();
  });

  afterEach(() => {
    for (const k of ENV_KEYS) {
      if (snap[k] === undefined) delete process.env[k];
      else process.env[k] = snap[k];
    }
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns configured:false with all three missingEnv when none set', () => {
    const s = getEtsyStatus();
    expect(s.configured).toBe(false);
    expect(s.missingEnv).toEqual([
      'ETSY_KEYSTRING',
      'ETSY_SHARED_SECRET',
      'ETSY_SHOP_ID',
    ]);
    expect(s.tokenPresent).toBe(false);
    expect(s.tokenExpiresAt).toBeNull();
    expect(s.lastHeartbeatAt).toBeNull();
    expect(s.lastError).toBeNull();
    expect(s.lastSyncAt).toBeNull();
  });

  it('reports non-numeric ETSY_SHOP_ID as missing', () => {
    process.env.ETSY_KEYSTRING = 'k';
    process.env.ETSY_SHARED_SECRET = 's';
    process.env.ETSY_SHOP_ID = 'abc';
    const s = getEtsyStatus();
    expect(s.configured).toBe(false);
    expect(s.missingEnv).toEqual(['ETSY_SHOP_ID']);
  });

  it('returns tokenPresent:false when env complete but file missing', () => {
    process.env.ETSY_KEYSTRING = 'k';
    process.env.ETSY_SHARED_SECRET = 's';
    process.env.ETSY_SHOP_ID = '66064739';
    process.env.ROOSTER_ETSY_TOKEN_PATH = path.join(tmpDir, 'nope.json');
    const s = getEtsyStatus();
    expect(s.configured).toBe(true);
    expect(s.missingEnv).toEqual([]);
    expect(s.tokenPresent).toBe(false);
    expect(s.tokenExpiresAt).toBeNull();
  });

  it('returns tokenPresent + expiresAt when file exists', () => {
    process.env.ETSY_KEYSTRING = 'k';
    process.env.ETSY_SHARED_SECRET = 's';
    process.env.ETSY_SHOP_ID = '66064739';
    const tokenPath = path.join(tmpDir, 'token.json');
    process.env.ROOSTER_ETSY_TOKEN_PATH = tokenPath;
    fs.writeFileSync(
      tokenPath,
      JSON.stringify({
        access_token: 'a',
        refresh_token: 'r',
        expires_at: 1900000000,
      }),
    );
    const s = getEtsyStatus();
    expect(s.tokenPresent).toBe(true);
    expect(s.tokenExpiresAt).toBe('2030-03-17T18:26:40.000Z');
  });

  it('returns lastHeartbeatAt + lastError:null on heartbeat-after-error', () => {
    process.env.ETSY_KEYSTRING = 'k';
    process.env.ETSY_SHARED_SECRET = 's';
    process.env.ETSY_SHOP_ID = '1';
    setWorkerError('etsy', 'boom');
    setWorkerHeartbeat('etsy');
    const s = getEtsyStatus();
    expect(s.lastHeartbeatAt).not.toBeNull();
    expect(s.lastSyncAt).toBe(s.lastHeartbeatAt);
    expect(s.lastError).toBeNull();
  });

  it('returns lastError when error is newer than heartbeat', () => {
    process.env.ETSY_KEYSTRING = 'k';
    process.env.ETSY_SHARED_SECRET = 's';
    process.env.ETSY_SHOP_ID = '1';
    setWorkerHeartbeat('etsy');
    setWorkerError('etsy', 'token refresh failed');
    const s = getEtsyStatus();
    expect(s.lastError).toBe('token refresh failed');
  });

  it('tolerates an unparseable token file', () => {
    process.env.ETSY_KEYSTRING = 'k';
    process.env.ETSY_SHARED_SECRET = 's';
    process.env.ETSY_SHOP_ID = '1';
    const tokenPath = path.join(tmpDir, 'bad.json');
    process.env.ROOSTER_ETSY_TOKEN_PATH = tokenPath;
    fs.writeFileSync(tokenPath, 'not json');
    const s = getEtsyStatus();
    expect(s.tokenPresent).toBe(true);
    expect(s.tokenExpiresAt).toBeNull();
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `cd web.ui/backend && npm test -- --run __tests__/etsy/status.test.js`
Expected: FAIL with `Cannot find module '../../etsy/status.js'`.

- [x] **Step 3: Implement `getEtsyStatus()`**

`web.ui/backend/etsy/status.js`:

```js
/**
 * Read-only Etsy status reporter. Inspects env, the token file on disk,
 * and the in-memory workerStatus map. No refresh attempts, no mutations.
 *
 * @module etsy/status
 */
import fs from 'node:fs';
import path from 'node:path';
import { getAllStatuses } from '../workerStatus.js';

/**
 * @typedef {Object} EtsyStatus
 * @property {boolean} configured
 * @property {string[]} missingEnv
 * @property {boolean} tokenPresent
 * @property {string | null} tokenExpiresAt   ISO datetime
 * @property {string | null} lastHeartbeatAt  ISO datetime
 * @property {string | null} lastError
 * @property {string | null} lastSyncAt       alias of lastHeartbeatAt
 */

const REQUIRED = ['ETSY_KEYSTRING', 'ETSY_SHARED_SECRET', 'ETSY_SHOP_ID'];

/**
 * @param {{
 *   env?: NodeJS.ProcessEnv,
 *   statuses?: Record<string, {last_success_at: string|null, last_error_at: string|null, last_error_message: string|null}>,
 *   fs?: typeof fs,
 * }} [opts]
 * @returns {EtsyStatus}
 */
export function getEtsyStatus(opts = {}) {
  const env = opts.env ?? process.env;
  const statuses = opts.statuses ?? getAllStatuses();
  const fsImpl = opts.fs ?? fs;

  const missingEnv = [];
  for (const k of REQUIRED) {
    if (!env[k]) missingEnv.push(k);
  }
  if (env.ETSY_SHOP_ID && !/^\d+$/.test(env.ETSY_SHOP_ID.trim())) {
    if (!missingEnv.includes('ETSY_SHOP_ID')) missingEnv.push('ETSY_SHOP_ID');
  }
  const configured = missingEnv.length === 0;

  const tokenPathRaw =
    env.ROOSTER_ETSY_TOKEN_PATH ||
    env.ETSY_TOKEN_PATH ||
    'data/etsy_token.json';
  const tokenPath = path.resolve(tokenPathRaw);

  let tokenPresent = false;
  let tokenExpiresAt = null;
  try {
    fsImpl.statSync(tokenPath);
    tokenPresent = true;
    try {
      const raw = fsImpl.readFileSync(tokenPath, 'utf8');
      const parsed = JSON.parse(raw);
      if (typeof parsed.expires_at === 'number') {
        tokenExpiresAt = new Date(parsed.expires_at * 1000).toISOString();
      }
    } catch {
      // Present but unparseable â€” leave tokenExpiresAt null.
    }
  } catch {
    // Not present.
  }

  const w = statuses['etsy'];
  const lastHeartbeatAt = w?.last_success_at ?? null;
  let lastError = null;
  if (w && w.last_error_at && w.last_error_message) {
    const successT = w.last_success_at ? Date.parse(w.last_success_at) : 0;
    const errorT = Date.parse(w.last_error_at);
    if (errorT > successT) lastError = w.last_error_message;
  }

  return {
    configured,
    missingEnv,
    tokenPresent,
    tokenExpiresAt,
    lastHeartbeatAt,
    lastError,
    lastSyncAt: lastHeartbeatAt,
  };
}
```

- [x] **Step 4: Run test to verify it passes**

Run: `cd web.ui/backend && npm test -- --run __tests__/etsy/status.test.js`
Expected: PASS (7 tests).

- [x] **Step 5: Commit**

```bash
git add web.ui/backend/etsy/status.js web.ui/backend/__tests__/etsy/status.test.js
git commit -m "feat(etsy): add getEtsyStatus reader for /api/etsy/status"
```

---

## Task 2: `GET /api/etsy/status` route

**Files:**
- Modify: `web.ui/backend/etsy/routes.js`
- Modify: `web.ui/backend/__tests__/etsy/routes.test.js`

Extend `mountEtsyRoutes`'s injection contract with `getStatus`, register the handler. server.js wiring is done in Task 3.

- [x] **Step 1: Write the failing test (extend routes.test.js)**

Append to `web.ui/backend/__tests__/etsy/routes.test.js` after the existing `POST /api/etsy/sync-now` describe:

```js
describe('GET /api/etsy/status', () => {
  it('returns the status payload from the injected getStatus', async () => {
    const payload = {
      configured: false,
      missingEnv: ['ETSY_KEYSTRING'],
      tokenPresent: false,
      tokenExpiresAt: null,
      lastHeartbeatAt: null,
      lastError: null,
      lastSyncAt: null,
    };
    const getStatus = vi.fn().mockReturnValue(payload);
    const app = express();
    app.use(express.json());
    mountEtsyRoutes(app, { db: freshDb(), runSyncPass: vi.fn(), getStatus });
    const resp = await request(app).get('/api/etsy/status');
    expect(resp.status).toBe(200);
    expect(resp.body).toEqual(payload);
    expect(getStatus).toHaveBeenCalledTimes(1);
  });

  it('returns 200 with default fallback when getStatus is not injected', async () => {
    // Backwards compat: mounting without getStatus should not 500. The
    // route returns a degraded payload that flags configured:false so the
    // banner stays in the not-configured state.
    const app = express();
    app.use(express.json());
    mountEtsyRoutes(app, { db: freshDb(), runSyncPass: vi.fn() });
    const resp = await request(app).get('/api/etsy/status');
    expect(resp.status).toBe(200);
    expect(resp.body.configured).toBe(false);
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `cd web.ui/backend && npm test -- --run __tests__/etsy/routes.test.js`
Expected: FAIL â€” `Cannot GET /api/etsy/status`.

- [x] **Step 3: Add `getStatus` to MountArgs and register the route**

Edit `web.ui/backend/etsy/routes.js`:

Replace the existing `MountArgs` typedef and `mountEtsyRoutes` signature so the function accepts an optional `getStatus`:

```js
/**
 * @typedef {Object} MountArgs
 * @property {import('better-sqlite3').Database} db
 * @property {() => Promise<{inserted: number, updated: number, statusChanged: number}>} runSyncPass
 * @property {() => import('./status.js').EtsyStatus} [getStatus]
 */
```

Then, just before the closing `}` of `mountEtsyRoutes`, add:

```js
  app.get('/api/etsy/status', (_req, res) => {
    const payload = getStatus
      ? getStatus()
      : {
          configured: false,
          missingEnv: ['ETSY_KEYSTRING', 'ETSY_SHARED_SECRET', 'ETSY_SHOP_ID'],
          tokenPresent: false,
          tokenExpiresAt: null,
          lastHeartbeatAt: null,
          lastError: null,
          lastSyncAt: null,
        };
    res.json(payload);
  });
```

- [x] **Step 4: Run test to verify it passes**

Run: `cd web.ui/backend && npm test -- --run __tests__/etsy/routes.test.js`
Expected: PASS (all original tests + 2 new ones).

- [x] **Step 5: Commit**

```bash
git add web.ui/backend/etsy/routes.js web.ui/backend/__tests__/etsy/routes.test.js
git commit -m "feat(etsy): GET /api/etsy/status route"
```

---

## Task 3: Wire real `getEtsyStatus` in server.js + add missing-config startup warn

**Files:**
- Modify: `web.ui/backend/server.js`

Two surgical changes: (a) import `getEtsyStatus` and pass it to `mountEtsyRoutes`, (b) when the worker is skipped because keys are missing, log one warn with the missing key list (today this branch is silent â€” that's the trap the spec calls out).

- [x] **Step 1: Import `getEtsyStatus` and wire it**

In `web.ui/backend/server.js`, add to the existing etsy imports block (around lines 34-39):

```js
import { getEtsyStatus } from './etsy/status.js';
```

Then change the `mountEtsyRoutes` call at line 312 from:

```js
  mountEtsyRoutes(app, { db: openDb(), runSyncPass: runEtsySync });
```

to:

```js
  mountEtsyRoutes(app, {
    db: openDb(),
    runSyncPass: runEtsySync,
    getStatus: getEtsyStatus,
  });
```

- [x] **Step 2: Add the missing-config startup warn**

In `web.ui/backend/server.js`, replace the existing worker-start block at lines 86-99:

```js
if (
  PORT !== 0 &&
  process.env.ROOSTER_SKIP_ETSY_WORKER !== '1' &&
  process.env.ETSY_KEYSTRING
) {
  try {
    startEtsyWorkerDefault({ db: openDb(), emit: recordEvent });
  } catch (err) {
    logger.warn(
      { err: err.message },
      'etsy worker init failed (config missing?)',
    );
  }
}
```

with:

```js
if (
  PORT !== 0 &&
  process.env.ROOSTER_SKIP_ETSY_WORKER !== '1'
) {
  const missing = ['ETSY_KEYSTRING', 'ETSY_SHARED_SECRET', 'ETSY_SHOP_ID']
    .filter((k) => !process.env[k]);
  if (missing.length === 0) {
    try {
      startEtsyWorkerDefault({ db: openDb(), emit: recordEvent });
    } catch (err) {
      logger.warn(
        { err: err.message },
        'etsy worker init failed (config invalid?)',
      );
    }
  } else {
    logger.warn(
      { missing },
      'etsy worker skipped â€” required env vars are not set',
    );
  }
}
```

- [x] **Step 3: Verify the existing backend test suite still passes**

Run: `cd web.ui/backend && npm test`
Expected: all tests PASS. We are not adding a new server.js test â€” the wiring is exercised end-to-end by Task 2's routes tests and the manual smoke step.

- [x] **Step 4: Commit**

```bash
git add web.ui/backend/server.js
git commit -m "feat(etsy): wire status endpoint + warn when worker skipped"
```

---

## Task 4: `.env.example` bootstrap documentation

**Files:**
- Modify: `web.ui/backend/.env.example`

The four keys already exist (lines 31-39). We're improving the comment so the next person knows where the values come from and how to bootstrap the token file.

- [x] **Step 1: Replace the Etsy block**

In `web.ui/backend/.env.example`, replace the existing Etsy section (currently lines 31-39):

```
# â”€â”€ Etsy v3 â€” required for the etsy syncer â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
ETSY_KEYSTRING=
ETSY_SHARED_SECRET=
ETSY_SHOP_ID=
# Optional token-path override. Defaults to data/etsy_token.json (repo-relative).
# ROOSTER_ETSY_TOKEN_PATH is the preferred name; ETSY_TOKEN_PATH is accepted
# for back-compat with the standalone etsy-rooster project.
ROOSTER_ETSY_TOKEN_PATH=
ETSY_TOKEN_PATH=
```

with:

```
# â”€â”€ Etsy v3 â€” required for the etsy syncer â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
# Copy ETSY_KEYSTRING, ETSY_SHARED_SECRET, ETSY_SHOP_ID from the Python
# project's env at `projects/etsy-rooster-shop/.env.local`. Both projects
# share the same Etsy app + the same OAuth token file; the dashboard
# refreshes it in-place via ROOSTER_ETSY_TOKEN_PATH.
#
# If the token file does not exist yet, bootstrap it once with:
#   cd projects/etsy-rooster-shop && python scripts/etsy_oauth_setup.py
#
# Place the actual values in <repo-root>/.env.local (which is loaded after
# this file by loadEnv.js and never committed).
ETSY_KEYSTRING=
ETSY_SHARED_SECRET=
ETSY_SHOP_ID=
# Recommended: share with the Python project, e.g.
#   ROOSTER_ETSY_TOKEN_PATH=C:\Users\<you>\.etsy-rooster\token.json
# Default (when unset): data/etsy_token.json (repo-relative). ETSY_TOKEN_PATH
# is accepted as a back-compat alias.
ROOSTER_ETSY_TOKEN_PATH=
ETSY_TOKEN_PATH=
```

- [x] **Step 2: Commit**

```bash
git add web.ui/backend/.env.example
git commit -m "docs(etsy): point .env.example at the python project for creds"
```

---

## Task 5: Frontend API client â€” `getStatus()` + `EtsyStatus` type

**Files:**
- Modify: `web.ui/frontend-react/src/api/etsy.ts`

Thin typed fetch wrapper following the same pattern as `listListings` / `syncNow`.

- [x] **Step 1: Add the interface and function**

At the end of `web.ui/frontend-react/src/api/etsy.ts`, before the final `export { ApiError };` line, insert:

```ts
export interface EtsyStatus {
  configured: boolean;
  missingEnv: string[];
  tokenPresent: boolean;
  tokenExpiresAt: string | null;
  lastHeartbeatAt: string | null;
  lastError: string | null;
  lastSyncAt: string | null;
}

export async function getStatus(): Promise<EtsyStatus> {
  const r = await fetch('/api/etsy/status');
  if (!r.ok) await throwForStatus(r, 'getStatus');
  return (await r.json()) as EtsyStatus;
}
```

- [x] **Step 2: Type-check**

Run: `cd web.ui/frontend-react && npx tsc --noEmit`
Expected: no errors.

- [x] **Step 3: Commit**

```bash
git add web.ui/frontend-react/src/api/etsy.ts
git commit -m "feat(etsy): add getStatus() and EtsyStatus type to api client"
```

---

## Task 6: `<EtsyStatusBanner />` component + tests

**Files:**
- Create: `web.ui/frontend-react/src/components/EtsyStatusBanner.tsx`
- Test: `web.ui/frontend-react/src/components/__tests__/EtsyStatusBanner.test.tsx`

State-machine driven from the status payload. Banner owns the Sync-now button. Parent passes a callback for refetching the listings table after a successful sync.

- [x] **Step 1: Write the failing test**

`web.ui/frontend-react/src/components/__tests__/EtsyStatusBanner.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import EtsyStatusBanner from '../EtsyStatusBanner';
import type { EtsyStatus } from '../../api/etsy';

const baseOk: EtsyStatus = {
  configured: true,
  missingEnv: [],
  tokenPresent: true,
  tokenExpiresAt: '2030-01-01T00:00:00Z',
  lastHeartbeatAt: new Date(Date.now() - 60_000).toISOString(),
  lastError: null,
  lastSyncAt: new Date(Date.now() - 60_000).toISOString(),
};

function mockJson(body: unknown, ok = true, status = 200) {
  return {
    ok,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

describe('EtsyStatusBanner', () => {
  /** @type {ReturnType<typeof vi.spyOn>} */
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });
  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('renders not-configured state with missingEnv list', async () => {
    const s: EtsyStatus = {
      ...baseOk,
      configured: false,
      missingEnv: ['ETSY_KEYSTRING', 'ETSY_SHARED_SECRET'],
      tokenPresent: false,
      tokenExpiresAt: null,
      lastHeartbeatAt: null,
      lastError: null,
      lastSyncAt: null,
    };
    fetchSpy.mockResolvedValueOnce(mockJson(s));
    render(<EtsyStatusBanner onSynced={vi.fn()} />);
    expect(await screen.findByRole('alert')).toHaveTextContent(/Etsy not configured/i);
    expect(screen.getByRole('alert')).toHaveTextContent('ETSY_KEYSTRING');
    expect(screen.getByRole('alert')).toHaveTextContent('ETSY_SHARED_SECRET');
  });

  it('renders no-token state with bootstrap hint', async () => {
    const s: EtsyStatus = {
      ...baseOk,
      tokenPresent: false,
      tokenExpiresAt: null,
      lastHeartbeatAt: null,
      lastSyncAt: null,
    };
    fetchSpy.mockResolvedValueOnce(mockJson(s));
    render(<EtsyStatusBanner onSynced={vi.fn()} />);
    expect(await screen.findByRole('alert')).toHaveTextContent(/Etsy token missing/i);
    expect(screen.getByRole('alert')).toHaveTextContent(/etsy_oauth_setup\.py/);
  });

  it('renders sync-failed state when lastError is set', async () => {
    const s: EtsyStatus = { ...baseOk, lastError: 'token refresh failed: 401' };
    fetchSpy.mockResolvedValueOnce(mockJson(s));
    render(<EtsyStatusBanner onSynced={vi.fn()} />);
    expect(await screen.findByRole('alert')).toHaveTextContent(/Last sync failed/i);
    expect(screen.getByRole('alert')).toHaveTextContent('token refresh failed: 401');
  });

  it('renders ok state as a collapsed status strip', async () => {
    fetchSpy.mockResolvedValueOnce(mockJson(baseOk));
    render(<EtsyStatusBanner onSynced={vi.fn()} />);
    expect(await screen.findByRole('status')).toHaveTextContent(/Synced/i);
    expect(screen.getByRole('button', { name: /sync now/i })).toBeEnabled();
  });

  it('clicking Sync now POSTs sync-now, refetches status, and calls onSynced', async () => {
    fetchSpy
      .mockResolvedValueOnce(mockJson(baseOk))                              // initial GET /status
      .mockResolvedValueOnce(mockJson({ inserted: 1, updated: 0, statusChanged: 0 })) // POST /sync-now
      .mockResolvedValueOnce(mockJson(baseOk));                             // refetch GET /status
    const onSynced = vi.fn();
    render(<EtsyStatusBanner onSynced={onSynced} />);
    await screen.findByRole('button', { name: /sync now/i });
    await userEvent.click(screen.getByRole('button', { name: /sync now/i }));
    await waitFor(() => expect(onSynced).toHaveBeenCalled());
    const calls = fetchSpy.mock.calls.map((c) => String(c[0]));
    expect(calls).toEqual([
      '/api/etsy/status',
      '/api/etsy/sync-now',
      '/api/etsy/status',
    ]);
  });

  it('on sync failure surfaces error inside the banner (no toast)', async () => {
    fetchSpy
      .mockResolvedValueOnce(mockJson(baseOk))                                // initial GET
      .mockResolvedValueOnce(mockJson({ error: 'etsy 401' }, false, 500));    // POST fails
    render(<EtsyStatusBanner onSynced={vi.fn()} />);
    await userEvent.click(await screen.findByRole('button', { name: /sync now/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/etsy 401/i);
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `cd web.ui/frontend-react && npm test -- --run src/components/__tests__/EtsyStatusBanner.test.tsx`
Expected: FAIL â€” `Cannot find module '../EtsyStatusBanner'`.

- [x] **Step 3: Implement the banner**

`web.ui/frontend-react/src/components/EtsyStatusBanner.tsx`:

```tsx
import { useCallback, useEffect, useState } from 'react';
import { getStatus, syncNow, type EtsyStatus } from '../api/etsy';

interface Props {
  /** Called after a successful sync so the parent can refetch listings. */
  onSynced: () => void;
}

function relTime(iso: string | null, now: Date = new Date()): string {
  if (!iso) return '';
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '';
  const sec = Math.round((now.getTime() - t) / 1000);
  if (sec < 60) return 'just now';
  if (sec < 3600) return `${Math.round(sec / 60)} min ago`;
  if (sec < 86400) return `${Math.round(sec / 3600)} hr ago`;
  return `${Math.round(sec / 86400)} day(s) ago`;
}

type BannerKind = 'not-configured' | 'no-token' | 'sync-failed' | 'ok' | 'loading';

function classify(status: EtsyStatus | null, syncError: string | null): BannerKind {
  if (!status) return 'loading';
  if (!status.configured) return 'not-configured';
  if (!status.tokenPresent) return 'no-token';
  if (syncError || status.lastError) return 'sync-failed';
  return 'ok';
}

export default function EtsyStatusBanner({ onSynced }: Props) {
  const [status, setStatus] = useState<EtsyStatus | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setStatus(await getStatus());
    } catch {
      // If the status endpoint itself fails we leave the banner in
      // loading state; the catalog table renders independently.
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const handleSync = async () => {
    setSyncing(true);
    setSyncError(null);
    try {
      await syncNow();
      await refresh();
      onSynced();
    } catch (err) {
      setSyncError(err instanceof Error ? err.message : String(err));
    } finally {
      setSyncing(false);
    }
  };

  const kind = classify(status, syncError);
  const syncButton = (
    <button
      type="button"
      onClick={() => void handleSync()}
      disabled={syncing || !status?.configured || !status?.tokenPresent}
      style={{ marginLeft: 'auto' }}
    >
      {syncing ? 'Syncingâ€¦' : 'Sync now'}
    </button>
  );

  const baseStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '6px 10px',
    borderRadius: 4,
    marginBottom: '0.5rem',
  };

  if (kind === 'loading') {
    return <div role="status" style={baseStyle}>Loading Etsy statusâ€¦</div>;
  }

  if (kind === 'not-configured' && status) {
    return (
      <div role="alert" style={{ ...baseStyle, background: '#fbe5e5', color: '#7a1024' }}>
        <span>
          <strong>Etsy not configured.</strong> Add {status.missingEnv.join(', ')} to{' '}
          <code>&lt;repo-root&gt;/.env.local</code>. See{' '}
          <code>web.ui/backend/.env.example</code>.
        </span>
        {syncButton}
      </div>
    );
  }

  if (kind === 'no-token') {
    return (
      <div role="alert" style={{ ...baseStyle, background: '#fbe5e5', color: '#7a1024' }}>
        <span>
          <strong>Etsy token missing.</strong> Bootstrap it with{' '}
          <code>cd projects/etsy-rooster-shop &amp;&amp; python scripts/etsy_oauth_setup.py</code>.
        </span>
        {syncButton}
      </div>
    );
  }

  if (kind === 'sync-failed' && status) {
    const msg = syncError ?? status.lastError ?? 'unknown error';
    const when = relTime(status.lastHeartbeatAt);
    return (
      <div role="alert" style={{ ...baseStyle, background: '#fff3cd', color: '#664d03' }}>
        <span>
          <strong>Last sync failed:</strong> {msg}
          {when ? ` (${when})` : ''}
        </span>
        {syncButton}
      </div>
    );
  }

  // ok
  const when = status ? relTime(status.lastSyncAt) : '';
  return (
    <div role="status" style={{ ...baseStyle, background: '#e6f7ec', color: '#1b6d3a' }}>
      <span>Synced {when || 'â€”'}</span>
      {syncButton}
    </div>
  );
}
```

- [x] **Step 4: Run test to verify it passes**

Run: `cd web.ui/frontend-react && npm test -- --run src/components/__tests__/EtsyStatusBanner.test.tsx`
Expected: PASS (6 tests).

- [x] **Step 5: Commit**

```bash
git add web.ui/frontend-react/src/components/EtsyStatusBanner.tsx web.ui/frontend-react/src/components/__tests__/EtsyStatusBanner.test.tsx
git commit -m "feat(etsy): EtsyStatusBanner with sync-now + error/config diagnostics"
```

---

## Task 7: Mount the banner on `/etsy` and remove the duplicate Sync button + toast

**Files:**
- Modify: `web.ui/frontend-react/src/pages/EtsyCatalog.tsx`
- Modify: `web.ui/frontend-react/src/__tests__/EtsyCatalog.test.tsx`

The current page header has a `Sync now` button and a transient toast (lines ~246-296). The banner now owns both. Remove the inline button + toast and the `onSyncNow` handler. Banner calls `reload(filters)` via the `onSynced` callback.

- [x] **Step 1: Update the page test to expect the banner shape**

In `web.ui/frontend-react/src/__tests__/EtsyCatalog.test.tsx`:

1. Above the existing test block, add a helper for the status mock:

   ```ts
   function mockStatusOk(): Response {
     return {
       ok: true,
       status: 200,
       json: async () => ({
         configured: true,
         missingEnv: [],
         tokenPresent: true,
         tokenExpiresAt: '2030-01-01T00:00:00Z',
         lastHeartbeatAt: new Date(Date.now() - 60_000).toISOString(),
         lastError: null,
         lastSyncAt: new Date(Date.now() - 60_000).toISOString(),
       }),
       text: async () => '{}',
     } as unknown as Response;
   }
   ```

2. In each existing test that calls `fetchMock.mockResolvedValueOnce(mockListings(sample))`, prepend a `.mockResolvedValueOnce(mockStatusOk())` for the banner's `getStatus()` request that fires on mount.

3. Update the existing sync-now test so the mock sequence is:
   `mockStatusOk()` â†’ `mockListings(sample)` â†’ `mockSyncResult({inserted:1,updated:0,statusChanged:0})` â†’ `mockStatusOk()` â†’ `mockListings(sample)` and the button assertion targets the banner: `screen.getByRole('button', { name: /sync now/i })`.

(Note for the implementer: the test file imports `userEvent` already; the change is mechanical re-ordering of mock responses to match the new mount-time fetch sequence.)

- [x] **Step 2: Run the page test to verify it fails**

Run: `cd web.ui/frontend-react && npm test -- --run src/__tests__/EtsyCatalog.test.tsx`
Expected: FAIL â€” banner expects `/api/etsy/status` but the page hasn't mounted the banner yet.

- [x] **Step 3: Modify `EtsyCatalog.tsx`**

1. Add the import near the other component imports:

   ```ts
   import EtsyStatusBanner from '../components/EtsyStatusBanner';
   ```

2. Remove the `syncing` and `toast` `useState` declarations and the `onSyncNow` function (lines ~118-119 and ~246-260 â€” they move into the banner).

3. Remove the `syncNow` import from `../api/etsy`. Keep `listListings`, `EtsyListing`, `ListListingsParams`.

4. Remove the auto-dismiss toast effect (lines ~156-160).

5. Replace the page-header JSX (lines ~262-275) and the toast/error block (lines ~277-296) with:

   ```tsx
   return (
     <section>
       <div className="page-header">
         <h1>Etsy catalog</h1>
       </div>

       <EtsyStatusBanner onSynced={() => reload(filters)} />

       {error && (
         <p role="alert" className="error-text">
           {error}
         </p>
       )}
   ```

   (The rest of the JSX from the filter-row down stays unchanged.)

- [x] **Step 4: Run page test to verify it passes**

Run: `cd web.ui/frontend-react && npm test -- --run src/__tests__/EtsyCatalog.test.tsx`
Expected: PASS.

- [x] **Step 5: Run the full frontend test suite**

Run: `cd web.ui/frontend-react && npm test`
Expected: all PASS.

- [x] **Step 6: Type-check**

Run: `cd web.ui/frontend-react && npx tsc --noEmit`
Expected: no errors.

- [x] **Step 7: Commit**

```bash
git add web.ui/frontend-react/src/pages/EtsyCatalog.tsx web.ui/frontend-react/src/__tests__/EtsyCatalog.test.tsx
git commit -m "feat(etsy): mount status banner on /etsy, drop duplicate sync button"
```

---

## Task 8: Manual smoke + bootstrap (user action â€” not code)

This task is for the human, not the implementer subagent. Hand it off as a checklist.

- [x] **Step 1: Populate `<repo-root>/.env.local`**

Open `projects/etsy-rooster-shop/.env.local`, copy these three values into `<repo-root>/.env.local`:

```
ETSY_KEYSTRING=<value from python project>
ETSY_SHARED_SECRET=<value from python project>
ETSY_SHOP_ID=<value from python project>
ROOSTER_ETSY_TOKEN_PATH=C:\Users\marts\.etsy-rooster\token.json
```

- [x] **Step 2: Confirm the token file exists**

```
dir C:\Users\marts\.etsy-rooster\token.json
```
Expected: file is present (it should be, from prior Python-project use). If not, run:
```
cd projects/etsy-rooster-shop
python scripts/etsy_oauth_setup.py
```

- [x] **Step 3: Restart the backend**

Kill the existing `node server.js` and run `npm start` in `web.ui/backend`. Expected new log line on boot (replacing the previous silent skip):
```
INFO  Publishing Ops Dashboard server running at http://127.0.0.1:5000
```
And **no** `etsy worker skipped` warning (which would mean creds didn't load).

- [x] **Step 4: Open `/etsy` in the dashboard**

Hard-refresh. The banner should appear above the catalog. Expected sequence:
1. "Loading Etsy statusâ€¦" (briefly)
2. Green "Synced <n> min ago" once the worker's first tick lands, OR red "Etsy token missing" if step 2 was skipped.

- [x] **Step 5: Click Sync now**

The button should disable while in flight, then re-enable. The catalog table should populate with ~30 listings (the prior Etsy memory's count). The banner's "Synced <relative time>" should update.

---

## Self-Review

**Spec coverage check:** Re-read [`2026-05-27-etsy-dashboard-port-design.md`](../specs/2026-05-27-etsy-dashboard-port-design.md) and verify every requirement maps to a task.

- Â§1 env wiring + `<repo-root>/.env.local` â†’ Task 8 step 1 (user) + Task 4 (docs).
- Â§1 `.env.example` four keys â†’ Task 4 (preserves existing keys, improves comment).
- Â§1 server.js warn bump with missing key list â†’ Task 3.
- Â§2 `GET /api/etsy/status` shape â†’ Tasks 1 + 2.
- Â§2 status sources (env, token file, workerStatus map) â†’ Task 1 implementation.
- Â§2 banner UX with four priority-ordered states â†’ Task 6.
- Â§2 manual sync trigger from banner â†’ Task 6 (banner owns it).
- Â§2 files touched list â†’ Tasks 1, 2, 5, 6, 7 (matches).
- Â§3 backend tests for `GET /status` â†’ Task 2 (two cases as required: full happy-path with heartbeat populated, and error-overrides-heartbeat in Task 1).
- Â§3 backend tests for `etsyConfig()` and `ensureFreshToken()` no-refresh path â†’ **already covered** by existing `__tests__/etsy/config.test.js` (5 tests) and `__tests__/etsy/oauth.test.js`. No new tests required; spec referenced these as a non-regression check.
- Â§3 frontend tests for the four banner states â†’ Task 6 (covers all four).
- Â§3 frontend test that page mounts banner + click triggers refetch â†’ Task 7.
- Â§3 manual smoke â†’ Task 8.
- Â§3 bootstrap doc â†’ Task 4 (the comment in .env.example).

No gaps.

**Placeholder scan:** no TBD/TODO/"fill in" anywhere. Tests show actual code; commands show actual paths. Done.

**Type consistency:**
- `EtsyStatus` shape â€” defined in Task 1 (JSDoc typedef), used by Task 2 (handler payload), Task 5 (frontend interface), Task 6 (component prop type). All seven fields match: `configured`, `missingEnv`, `tokenPresent`, `tokenExpiresAt`, `lastHeartbeatAt`, `lastError`, `lastSyncAt`. âœ“
- `MountArgs.getStatus: () => EtsyStatus` (sync function returning typed payload) â€” matches `getEtsyStatus(opts?)` implementation. âœ“
- `onSynced: () => void` prop on banner â€” matches the `() => reload(filters)` callsite in Task 7. âœ“
- Banner uses `syncNow` from existing `api/etsy.ts` (already returns `{inserted, updated, statusChanged}`) â€” no change needed there. âœ“
