# Etsy Connection Port — Dashboard Design

**Date:** 2026-05-27
**Status:** Draft for review
**Mini-spec 1 of 3** in the dashboard-improvements brainstorm (Etsy → Plans → KDP).

## Goal

Make the dashboard's Etsy sync actually work by wiring it to the same credentials and OAuth token that the Python `projects/etsy-rooster-shop/` project already uses, then surface clear connection status on the `/etsy` page so silent-empty-list failures (the Pinterest trap) can't recur.

## Background

The dashboard already has the full Etsy stack — `web.ui/backend/etsy/{config,oauth,client,repo,worker,syncer,routes}.js` — and the same token JSON shape (`{access_token, refresh_token, expires_at}`) as the Python project. The connection is silent because `ETSY_KEYSTRING` is unset in the dashboard's env chain, which short-circuits worker init at `server.js:88-94` and the sync-now factory at `server.js:286-308`. `GET /api/etsy/listings` consequently returns `{"listings":[]}`.

So this is mostly a config + visibility task, not new business logic.

## Section 1 — Architecture & Wiring

**Scope is intentionally tight.** No schema changes, no new ingestion modules, no changes to the sync orchestrator. The whole port is three changes:

1. `<repo-root>/.env.local` — add four keys (user supplies values, copying from `projects/etsy-rooster-shop/.env.local`):
   ```
   ETSY_KEYSTRING=<from python project>
   ETSY_SHARED_SECRET=<from python project>
   ETSY_SHOP_ID=<from python project>
   ROOSTER_ETSY_TOKEN_PATH=C:\Users\marts\.etsy-rooster\token.json
   ```
   `web.ui/backend/loadEnv.js` already reads `<repo-root>/.env.local` (line 20), so no loader change.

2. `web.ui/backend/.env.example` — append the four keys with placeholder values and a 15-line comment block covering where to get them, the token-share rationale, and the bootstrap script path.

3. `web.ui/backend/server.js:96` — bump the "etsy worker init failed" log from debug to **warn** and include the list of missing env keys in the message. This is the only code change in this section.

**Token sharing rationale.** Both projects use identical token JSON (verified — Python `EtsyTokenStore.save` at `projects/etsy-rooster-shop/src/etsy_rooster/etsy/oauth.py:88-95` writes the same three keys the Node `ensureFreshToken` reads at `web.ui/backend/etsy/oauth.js:40-44`). Sharing the file via `ROOSTER_ETSY_TOKEN_PATH` means a single source of truth; refresh-rotation races are minimized because both sides always re-read from disk before refreshing.

## Section 2 — Status Banner & Manual Sync

### Status endpoint

New: `GET /api/etsy/status` on `web.ui/backend/etsy/routes.js`. Returns:

```ts
{
  configured: boolean,
  missingEnv: string[],          // populated when configured=false
  tokenPresent: boolean,
  tokenExpiresAt: string | null, // ISO; null when token missing
  lastHeartbeatAt: string | null,
  lastError: string | null,      // populated only when last_error_seq > last_success_seq
  lastSyncAt: string | null      // same as lastHeartbeatAt for the etsy worker — alias kept for UI clarity
}
```

**Sources:**
- `configured` + `missingEnv` — direct read of `process.env`. Check all three required keys (`ETSY_KEYSTRING`, `ETSY_SHARED_SECRET`, `ETSY_SHOP_ID`) and collect the missing ones. Don't call `etsyConfig()` here — it throws on the first missing key and we want the full list. Validate `ETSY_SHOP_ID` is numeric and include it in `missingEnv` if not.
- `tokenPresent` + `tokenExpiresAt` — `fs.statSync(cfg.tokenPath)` + `JSON.parse(fs.readFileSync(...))`. Resolve `cfg.tokenPath` even when env is incomplete by inlining the same default-cascade logic as `etsyConfig()` (`ROOSTER_ETSY_TOKEN_PATH` → `ETSY_TOKEN_PATH` → `data/etsy_token.json`). **No refresh attempt** — refresh has side effects and we want this endpoint cheap.
- `lastHeartbeatAt` / `lastError` / `lastSyncAt` — `getAllStatuses()` from `web.ui/backend/workerStatus.js` (the canonical in-memory worker map; lives in process memory, not SQL). Read the `'etsy'` entry. `lastError` is the `last_error_message` string when `_error_seq > _success_seq`, else null. Sync count is not exposed in the status payload — the banner derives "X listings" from the already-loaded `/api/etsy/listings` response, so we don't need to plumb it.

### Banner UX on `/etsy`

A strip above the existing catalog table. Priority-ordered states (first match wins):

| State | Color | Trigger | Copy |
|---|---|---|---|
| not-configured | red | `missingEnv.length > 0` | "Etsy not configured. Add `<keys>` to `<repo-root>/.env.local`. See `web.ui/backend/.env.example`." |
| no-token | red | `configured && !tokenPresent` | "Etsy token missing at `<path>`. Run `python scripts/etsy_oauth_setup.py` in `projects/etsy-rooster-shop/` to bootstrap." |
| sync-failed | amber | `lastError` non-null | "Last sync failed: `<message>` (`<relative time>`). Try Sync now." |
| ok | green (collapsed) | configured + token + no error | "Synced `<relative time>` · `<N>` listings" |

When green, the banner is a thin one-line strip so it doesn't dominate the page. When red or amber, it expands to show full message + action.

### Manual sync trigger

"Sync now" button placed in the banner.

- Calls `POST /api/etsy/sync` (route already exists; wired via `runEtsySync` factory at `server.js:286-312`).
- While the request is in flight the button is disabled.
- On success: refetch `/api/etsy/status` and `/api/etsy/listings`.
- On failure: surface the message *inside the banner* (not as a toast), driving the banner into `sync-failed` state.

### Files touched (Section 2)

- `web.ui/backend/etsy/routes.js` — add `GET /status`.
- `web.ui/frontend-react/src/pages/EtsyCatalog.tsx` — mount `<EtsyStatusBanner />` above the catalog.
- `web.ui/frontend-react/src/components/EtsyStatusBanner.tsx` — new component (~80 lines).
- `web.ui/frontend-react/src/api/etsy.ts` — add `getStatus()` and `syncNow()`.

## Section 3 — Testing & Bootstrap

### Backend tests (vitest)

- `web.ui/backend/etsy/__tests__/routes.test.js` — extend with `GET /status` cases:
  - No env vars → `{ configured: false, missingEnv: ['ETSY_KEYSTRING', 'ETSY_SHARED_SECRET', 'ETSY_SHOP_ID'], tokenPresent: false, ... }`.
  - Env set but token file missing → `{ configured: true, tokenPresent: false, tokenExpiresAt: null }`.
  - Env + token + a `setWorkerHeartbeat('etsy')` call before the request → returns the full happy-path shape with `lastHeartbeatAt` populated and `lastError: null`.
  - Env + token + a `setWorkerError('etsy', 'boom')` after the heartbeat → returns `lastError: 'boom'`.
- `web.ui/backend/etsy/__tests__/oauth.test.js` (new) — assert:
  - `etsyConfig()` honors `ROOSTER_ETSY_TOKEN_PATH` and falls back to `ETSY_TOKEN_PATH` then `data/etsy_token.json`.
  - `ensureFreshToken` does **not** refresh when `expires_at > now + 60`.

Existing syncer/worker/client tests stay as-is; we are not changing their behavior.

### Frontend tests (vitest + React Testing Library)

- `web.ui/frontend-react/src/components/__tests__/EtsyStatusBanner.test.tsx` — one test per banner state (not-configured, no-token, sync-failed, ok). Mock `getStatus()` via `vi.spyOn`.
- `web.ui/frontend-react/src/pages/__tests__/EtsyCatalog.test.tsx` — one test that the banner is mounted and that clicking "Sync now" fires `syncNow()` then refetches both `getStatus()` and `listListings()`.

### Manual smoke (user, after merge)

1. Copy `ETSY_KEYSTRING`, `ETSY_SHARED_SECRET`, `ETSY_SHOP_ID` from `projects/etsy-rooster-shop/.env.local` into `<repo-root>/.env.local`.
2. Append `ROOSTER_ETSY_TOKEN_PATH=C:\Users\marts\.etsy-rooster\token.json`.
3. Restart the backend. Server log should now print `etsy worker started` (currently silent).
4. Open `/etsy`. Banner should show "Syncing…" briefly then collapse to green within ~5s.
5. Click "Sync now". Banner timestamp advances; listing rows appear (~30 expected per the prior catalog memory).

### Bootstrap doc

The four-key block in `.env.example` is preceded by a comment:

```
# --- Etsy ---
# Copy ETSY_KEYSTRING, ETSY_SHARED_SECRET, ETSY_SHOP_ID from
# projects/etsy-rooster-shop/.env.local. Both projects share the same Etsy
# app + the same OAuth token file; the dashboard refreshes it in-place via
# ROOSTER_ETSY_TOKEN_PATH. If the token file doesn't exist yet, bootstrap it
# with:  cd projects/etsy-rooster-shop && python scripts/etsy_oauth_setup.py
```

## Out of scope (explicit)

- No new schema columns on `etsy_listings`.
- No changes to the syncer's "active state only" filter or to the Day-30/60/90 reminder dedup.
- No coordination layer between Python and Node refreshers — Etsy's refresh_token usually does not rotate, and the worst case (rotation race) self-heals on the next disk-read because both `ensureFreshToken` (Node) and `EtsyTokenStore` (Python) always read the file before refreshing.
- No UI for editing Etsy creds inside the dashboard — env file is the source of truth.

## Risks

- **Python project paused indefinitely.** Dashboard becomes sole refresher. Already supported; no work.
- **Both refresh simultaneously and Etsy rotates the refresh_token.** Older copy in memory is stale until next disk-read, which both implementations do on every call. Worst case is a single failed refresh attempt that retries on the next worker tick (30 min). Acceptable.
- **Token file deleted by accident.** Banner enters `no-token` state with bootstrap instructions. User runs the Python script; no dashboard code path required.
