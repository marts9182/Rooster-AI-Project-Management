---
title: Pinterest API Pivot
date: 2026-05-27
status: design
supersedes: web.ui/backend/pinterest/{login.js,poster.js Playwright path} (Plan E)
---

# Pinterest API Pivot — Design

## 1. Motivation

Plan E shipped a Playwright-based desktop-automation poster because Pinterest's API access was blocked at design time (see [[pinterest-pin-automation-checkpoint]]). On 2026-05-27 the user's Pinterest trial-access application was approved, yielding a real app secret + access token. The Playwright path is now strictly worse than the v5 API for every dimension that matters:

- DOM-selector brittleness — every Pinterest UI tweak risks breaking us
- Bot-detection risk against the trial account
- ~300 MB Chromium dependency
- Browser launch on every pin (slow + resource-heavy)
- Manual one-time login flow + persistent profile dir to maintain

This spec replaces the Playwright posting path with direct v5 API calls. The rest of the Pinterest module — pin image generation, queue, scheduler, /pinterest UI, SSE wiring, KDP integration — stays as Plan E shipped it.

## 2. Locked decisions

- **API only.** Playwright posting path is deleted (not kept as fallback). Playwright remains in devDependencies for frontend e2e UI tests only.
- **Base64 image upload.** Pinterest's `media_source.source_type='image_url'` requires a publicly-reachable URL. Our dashboard runs on `127.0.0.1:5000` — Pinterest can't fetch from there. Every pin uploads its PNG bytes as base64 inline. The cost: ~200 KB per request, well under v5's 10 MB limit per pin.
- **Refresh-token flow.** Trial access tokens expire every 30 days. Refresh tokens are valid for 1 year. The poster checks expiry before every API call and refreshes 5 minutes early. Mirrors the Etsy OAuth helper (`web.ui/backend/etsy/oauth.js`) ported to Pinterest's `/v5/oauth/token` endpoint.
- **Default board, configurable.** Every pin needs a `board_id`. Dashboard reads `PINTEREST_DEFAULT_BOARD_ID` from env on first run; if absent, fetches the user's boards via `/v5/boards` and uses the first one. UI exposes a dropdown to switch.
- **Token persistence at `data/pinterest_token.json`.** Bootstrapped from env on first run (`PINTEREST_ACCESS_TOKEN`, `PINTEREST_REFRESH_TOKEN`, `PINTEREST_TOKEN_EXPIRES_AT`). Subsequent refreshes write back to the same file.
- **Trial scope.** Single-account use (the user's own Pocket Rooster Press business account). No third-party OAuth dance. If Pinterest later graduates the app to production, that's a follow-up spec.

## 3. Architecture

### 3.1 Backend module map

Under `web.ui/backend/pinterest/`:

| File | Status | Responsibility |
|---|---|---|
| `palette.js` | unchanged | Brand palette + font registration |
| `templates/cover_hero.js` | unchanged | 1000×1500 cover-hero pin PNG buffer |
| `templates/interior_preview.js` | unchanged | 1000×1500 interior-preview pin PNG buffer |
| `generator.js` | unchanged | Writes PNGs to `output/pinterest/<slug>/` |
| `scheduler.js` | unchanged | Pure 3–5/day jittered slot assignment |
| `queue.js` | unchanged | `enqueuePinsForBook`, `dequeueNext`, `markPosted`, `markFailed`, `pauseQueue`, `resumeQueue`, `cancelQueueRow`, `updateQueueRow`, `listQueue`, `listHistory` |
| `routes.js` | **modified** | Existing routes unchanged. Add `GET /whoami`, `GET /boards`, `GET /token-status`. Remove `POST /login`. |
| `index.js` | **modified** | Surface updated to drop the login export. |
| `login.js` | **deleted** | Visible-window Playwright login is gone. |
| `poster.js` | **rewritten** | API-based: `runOnce({db, apiClient})` + `startPosterWorker({db, intervalMs})`. |
| `api_oauth.js` | **new** | `ensureFreshToken({tokenStorePath, appId, appSecret})` — port of `etsy/oauth.js` to Pinterest's `/v5/oauth/token`. |
| `api_client.js` | **new** | Thin v5 client: `createPin`, `listBoards`, `getUserAccount`, `getTokenStatus`. Bearer auth + 401-triggers-refresh + 429-backoff + 5xx-retry. |

Tests parallel the source files. Tests under `__tests__/pinterest/`.

### 3.2 Token storage

JSON file at `<repo-root>/data/pinterest_token.json` (gitignored by the existing `data/` pattern):

```json
{
  "access_token": "<string>",
  "refresh_token": "<string>",
  "expires_at": "2026-06-26T18:32:00.000Z"
}
```

Override path via `ROOSTER_PINTEREST_TOKEN_PATH` env (for tests).

### 3.3 Env vars

Add to `.env.local` at repo root:

```
PINTEREST_ACCESS_TOKEN=<from trial approval>
PINTEREST_REFRESH_TOKEN=<from trial approval>
PINTEREST_TOKEN_EXPIRES_AT=<optional ISO; defaults to now+30d if missing>
PINTEREST_APP_ID=1572111
PINTEREST_APP_SECRET=<from app dashboard, was empty before trial approval>
PINTEREST_DEFAULT_BOARD_ID=<optional; auto-detected if missing>
```

`PINTEREST_APP_ID=1572111` was already known from the parked pin-bot brainstorm (see [[pinterest-pin-automation-checkpoint]]).

### 3.4 Routes (final shape)

Existing routes from Plan E (kept verbatim):

```
GET  /api/pinterest/queue
GET  /api/pinterest/history?limit=100
POST /api/pinterest/pause
POST /api/pinterest/resume
POST /api/pinterest/queue/:id/cancel
PUT  /api/pinterest/queue/:id
```

Removed:

```
POST /api/pinterest/login         (no more visible-window Playwright)
```

New:

```
GET  /api/pinterest/whoami         (calls api_client.getUserAccount; returns username + business_name)
GET  /api/pinterest/boards         (calls api_client.listBoards; returns boards list)
GET  /api/pinterest/token-status   (returns {connected: bool, expires_at, last_refresh_at})
```

## 4. Data flow

### 4.1 Posting flow

```
poster worker wakes at next pending row's scheduled_for
    └─→ dequeue one row → status='posting'
    └─→ read row.image_path from disk → base64 encode
    └─→ apiClient.createPin({
            board_id: row.board_id || PINTEREST_DEFAULT_BOARD_ID || fetched-default,
            title: row.title,
            description: row.description,
            link: row.link_url,
            media_source: {source_type: 'image_base64', content_type: 'image/png', data: <base64>},
        })
    └─→ on 200: parse pin_id from response, markPosted(row.id, pin_id)
                emit SSE pinterest:pin-posted
    └─→ on 401: refresh token, retry once
    └─→ on 429: exponential backoff (60s → 5m → 30m), re-queue the row
    └─→ on 5xx: retry up to 3 times with backoff
    └─→ on persistent failure: markFailed(row.id, err.message)
                emit SSE pinterest:pin-failed
    └─→ schedule next wake at next pending row's scheduled_for
```

### 4.2 Token refresh flow

```
Before every API call:
    api_client.callApi(method, path, body)
        └─→ token = await ensureFreshToken({tokenStorePath, appId, appSecret})
        └─→ fetch(`https://api.pinterest.com/v5${path}`, {
                method,
                headers: {Authorization: `Bearer ${token}`, 'Content-Type': 'application/json'},
                body: JSON.stringify(body),
            })
        └─→ if 401: clear token cache, await ensureFreshToken (forces refresh), retry once

ensureFreshToken({tokenStorePath, appId, appSecret}):
    └─→ token = read tokenStorePath JSON
    └─→ if token.expires_at - now > 300_000ms: return token.access_token
    └─→ POST https://api.pinterest.com/v5/oauth/token
            body: 'grant_type=refresh_token&refresh_token=' + token.refresh_token
            headers: 'Content-Type: application/x-www-form-urlencoded',
                     'Authorization: Basic ' + base64(appId + ':' + appSecret)
    └─→ on 200: parse {access_token, refresh_token?, expires_in},
                write {access_token, refresh_token: new || old, expires_at: now + expires_in*1000} to disk,
                return new access_token
    └─→ on 401: throw 'Pinterest refresh token expired — re-auth required'
                (dashboard surfaces banner; user pastes new env vars + restarts)
```

### 4.3 First-run bootstrap

If `data/pinterest_token.json` is missing on first call:
1. Read `PINTEREST_ACCESS_TOKEN`, `PINTEREST_REFRESH_TOKEN`, `PINTEREST_TOKEN_EXPIRES_AT` from env.
2. If `PINTEREST_TOKEN_EXPIRES_AT` is missing, default to `now + 30 days` (Pinterest trial default).
3. Write the file. Subsequent runs read from disk.

## 5. Frontend changes

### 5.1 PinterestSettings (`src/components/PinterestSettings.tsx`)

Replace the "Sign in to Pinterest" button with:

```
┌─ Pinterest Connection ──────────────────────────────────┐
│ Status:  ✓ Connected as @pocketroosterpress             │
│ Token expires: 2026-06-26 (30 days)                     │
│ Last refresh: 2026-05-27 14:32                          │
│ [Test connection]  [Refresh token now]                  │
│                                                         │
│ Default board: [Cottagecore Coloring Books ▾]           │
└─────────────────────────────────────────────────────────┘
```

- Token status pulled from `GET /api/pinterest/token-status` on mount
- `[Test connection]` button → calls `GET /api/pinterest/whoami` → displays user info
- `[Refresh token now]` button → forces token refresh, updates status
- Board dropdown populated from `GET /api/pinterest/boards`. Selection persists to `profile.pinterest_default_board_id` (new field) or the `PINTEREST_DEFAULT_BOARD_ID` env var.

### 5.2 Help article

Replace `web.ui/backend/help/pinterest_first_login.md` with `pinterest_api_setup.md`:

```markdown
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
```

## 6. Tests

| File | Coverage |
|---|---|
| `__tests__/pinterest/api_oauth.test.js` | First-run bootstrap from env; token fresh → returns cached; token stale → refresh succeeds; refresh 401 → throws "re-auth required"; network error → bubbles up |
| `__tests__/pinterest/api_client.test.js` | createPin happy path (base64 upload); listBoards; getUserAccount; 401 → refresh + retry; 429 → exponential backoff; 5xx → retry up to 3; uses msw for HTTP mocking |
| `__tests__/pinterest/poster.test.js` | Rewritten: dequeues → reads PNG bytes → calls apiClient.createPin → markPosted on success; 401 propagates through retry; network failure → markFailed |
| `__tests__/pinterest/routes.test.js` | New: `/whoami`, `/boards`, `/token-status` (with injected apiClient). Existing tests for queue/history/pause/resume/cancel/edit unchanged. **Delete:** the `POST /login` test. |
| `__tests__/pinterest/e2e_fake_driver.test.js` | Renamed `e2e_api.test.js`; same end-to-end behavior with fake apiClient instead of fake Playwright driver |
| Frontend `__tests__/PinterestSettings.test.tsx` | Token status chip; Test-connection button; Refresh-token button; board dropdown |
| Frontend `__tests__/api-pinterest.test.ts` | Add `getWhoami`, `listBoards`, `getTokenStatus` |

Deleted:
- `__tests__/pinterest/login.test.js`

## 7. Errors, security, observability

- API errors carry `{status, body, code}` in the thrown `PinterestApiError`. Logged structured via pino.
- 401 after refresh-then-retry → row marked `failed`, error message "auth failed after refresh" so the user knows to re-paste credentials.
- 429 backoff per pin attempt: 60s → 5m → 30m. After 3 consecutive 429s across pins, pause the queue + fire a reminder.
- Token storage is gitignored (`data/` pattern). Never logged.
- App secret read from `.env.local` only — never echoed in error messages or SSE payloads.
- SSE channels unchanged from Plan E.

## 8. Migration plan

Two commits, each shippable:

1. **`refactor(pinterest): replace Playwright poster with v5 API`**
   - Add `api_oauth.js`, `api_client.js` + their tests
   - Rewrite `poster.js` to use api_client; rewrite its tests
   - Delete `login.js` + `__tests__/pinterest/login.test.js`
   - Remove `POST /login` from `routes.js`; update routes tests
   - Add `/whoami`, `/boards`, `/token-status` routes + tests
   - Rename `e2e_fake_driver.test.js` → `e2e_api.test.js`; rewrite to use fake apiClient
   - Update `pinterest/index.js` exports (drop login surface)
   - `.gitignore`: remove `.pinterest-profile/` entry (no longer needed)
   - Delete `.pinterest-profile/` directory if present

2. **`feat(pinterest): API-based settings UI + help article`**
   - `PinterestSettings.tsx`: token status chip + Test-connection + Refresh-token + board dropdown
   - `src/api/pinterest.ts`: add `getWhoami`, `listBoards`, `getTokenStatus`, `refreshToken`
   - Rename help article `pinterest_first_login.md` → `pinterest_api_setup.md`
   - Update help-articles test for the rename

After both commits: backend test count should be roughly unchanged (deletes balance adds; the API path has more tests than the Playwright one because mocked HTTP is easier to cover than mocked browser).

## 9. Out of scope

- Multi-account / production-mode OAuth dance (trial covers our use case)
- Video pin support (we don't generate video pins)
- Board management UI (create / rename / delete boards — done on pinterest.com)
- Scheduled-pin feature of v5 (we schedule client-side; v5 also supports server-side scheduling but that's a different abstraction we don't need)
- Analytics / pin engagement read-back (`/v5/pins/<id>/analytics`) — future enhancement

## 10. Open questions

None at design close.

## 11. Related memories

- [[pinterest-pin-automation-checkpoint]] — the parked pin-bot project where `PINTEREST_APP_ID=1572111` and the privacy-policy URL were established. Note: that memory's "Approach A architecture" lived under `projects/kdp-puzzle-press/` and is now superseded by the dashboard's `web.ui/backend/pinterest/` location.
- [[publishing-ops-dashboard-checkpoint]] — the dashboard this pivots within.
