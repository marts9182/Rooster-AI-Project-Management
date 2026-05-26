---
title: Publishing Ops Dashboard
date: 2026-05-26
status: design
supersedes: web.ui Kanban + 7-agent system
---

# Publishing Ops Dashboard — Design

## 1. Motivation

The user runs a self-published catalog across two storefronts: **Pocket Rooster Press** on KDP (12+ puzzle & coloring titles in market as of 2026-05-26) and the Etsy sister shop (30 active listings). There is also a Pinterest pin-bot project paused mid-build waiting on API access. Day-to-day operations span at least four disjoint surfaces today (KDP author dashboard, Etsy seller dashboard, local repos, scheduled scripts), and the existing `web.ui/` app — a Kanban board with seven autonomous AI personas — was built for a different problem (software project management) and is no longer useful for the publishing business.

This spec **replaces** the Kanban + agent system with a single-user, local-only dashboard that:

- Shows what is published, in-review, or built-but-unpublished on KDP and Etsy.
- Lets the user mark books published with a checkbox and one paste of the ASIN.
- Shows specs and implementation plans currently in flight.
- Fires reminders (Windows toast + email) for release dates, KDP review checks, and Etsy Day-30/60/90 revenue gates.
- Provides a unified calendar view of all the above.
- Posts to Pinterest via Playwright desktop-automation, since Pinterest API approval is blocked.
- Auto-starts on Windows logon and runs from the system tray.

## 2. Locked decisions

These were settled during brainstorming and are not open for renegotiation in implementation:

- **Replace, don't extend.** The Kanban board, the seven AI personas (Marcus, Sarah, Alex, Jamie, Taylor, Morgan, Jordan), `AgentRuntime`, `EventBus`, `workflowRules`, `BaseAgent`, the LLM adapter wiring, and the `tasks.json` / `sprints.json` / `messages.json` / `agents.json` / `projects.json` data files are all removed from runtime. They are archived to `web.ui/.archive-kanban/` for one cycle, then deleted.
- **Keep the stack.** React 19 + TypeScript + Vite frontend, Express + SSE + Node 18+ backend, single binary install, run in tray. No Electron, no fresh project directory.
- **KDP data is manual.** No scraping of the KDP author dashboard. No author-page scraping. No title-search scraping. User checkmarks "published" and pastes the ASIN themselves. The dashboard auto-discovers built books from the local filesystem and pre-fills everything else.
- **Pinterest auth: persistent Playwright profile.** One manual login in a visible Chromium window; session persists in `web.ui/backend/.pinterest-profile/` (gitignored). Re-login only when Pinterest invalidates the session.
- **Reminders: Windows toast AND email.** Both fire in parallel for redundancy. Toast via `node-notifier`, email via `nodemailer` + Gmail SMTP with an app password.
- **Auto-start via Task Scheduler at logon.** `schtasks /create /sc onlogon /tn "Rooster Dashboard"` runs `node server.js` minimized. Tray icon appears, browser-accessible at `http://localhost:5000`.
- **No new AI agents.** The intelligence comes from the human + Claude Code in a separate terminal. The dashboard is deterministic CRUD + scheduling. The existing Anthropic adapter is retained only for optional small chores (e.g., Pinterest pin caption drafting), gated by `ANTHROPIC_API_KEY` presence.
- **Single user, localhost only.** Express binds `127.0.0.1:5000`. No auth, no CSRF, no LAN exposure.

## 3. Architecture

### 3.1 Topology

```
Windows logon
    └─→ schtasks fires `node web.ui/backend/server.js` minimized
            ├─ Express on 127.0.0.1:5000
            │   ├─ /api/*  REST + /api/events SSE
            │   └─ static  frontend-react/dist/
            ├─ systray2 icon
            │   └─ menu: Open dashboard · Pause Pinterest · Pause reminders · Restart server · Quit
            └─ background workers (one process, multiple intervals)
                ├─ kdp/scanner          every 10 min
                ├─ etsy/syncer          every 30 min
                ├─ reminders/scheduler  every 1 min (node-cron)
                └─ pinterest/poster     sleep-until-next-slot
```

User opens browser to `http://localhost:5000`; React app subscribes to `/api/events`; UI updates live as workers do their thing.

### 3.2 Backend module map

Under `web.ui/backend/`, replacing the deleted `agents/` directory:

| Module | Responsibility |
|---|---|
| `kdp/` | KDP catalog. Scans `projects/kdp-puzzle-press/output/kdp-ready/`, parses `listing.md` + `metadata.json`. Merges with user-entered ASIN / release_date / status stored in SQLite. Emits `kdp:*` SSE events on state change. |
| `etsy/` | Etsy catalog. Reads `projects/etsy-rooster-shop/catalog.db` (existing local SKU registry) and polls Etsy v3 `/shops/<shop_id>/listings` every 30 minutes via the existing OAuth helper at `projects/etsy-rooster-shop/etsy_rooster/etsy/oauth.py`. Reuses `ensure_fresh_token` for refresh. Emits `etsy:*` events. |
| `plans/` | Read-only. Scans `docs/superpowers/specs/*.md` and `docs/superpowers/plans/*.md`, parses frontmatter + headers, surfaces "what's planned / what's done." No DB rows; computed on read. |
| `reminders/` | Cron-like rule engine on `node-cron`. Reads `reminders` SQLite table, fires due rows via toast (`node-notifier`) and email (`nodemailer`). Rules also create derived reminders (e.g., on KDP `mark published`, auto-create the Day-30 check). |
| `pinterest/` | Playwright-driven posting. Persistent profile at `.pinterest-profile/`. Reads `pinterest_queue` SQLite rows, posts on a jittered cadence (3–5/day, 09:00–21:00 local). Pin image generation (cover-hero + interior-preview) is re-implemented fresh here from the brand-palette guidance in [[kdp-cover-design-playful-theme]]; the parked pin-bot project at `projects/kdp-puzzle-press/scripts/probe_pinterest_credentials.py` etc. is retired by this design and its env vars (`PINTEREST_ACCESS_TOKEN`, etc.) become irrelevant for v1. |
| `calendar/` | Aggregates events from `kdp_books`, `etsy_listings`, `reminders`, `pinterest_queue` into one stream for the FullCalendar frontend. Exposed as `/api/calendar/events?from=&to=`. |
| `profile/` | Single-row SQLite table: penname(s), KDP author URL, Etsy shop URL, Pinterest URL, Gmail address, brand palette swatches, default time zone. |
| `help/` | Static markdown files under `web.ui/backend/help/<field>.md` and `web.ui/backend/help/screenshots/`. Served at `/api/help/:field`. Editable without redeploy. |
| `tray/` | systray2 wiring. Started by `server.js` after Express is listening. Owns the icon's color states (green = ok, yellow = degraded, red = action required). |
| `db.js` | better-sqlite3 wrapper. `data/dashboard.db` in WAL mode. Migrations as numbered SQL files in `web.ui/backend/migrations/`. Backup cron writes to `data/.backups/`. |
| `events.js` | Append-only audit log (`events` table). Every state transition writes a row; `/api/events` SSE replays the last 50 on connect. Replaces the old `EventBus`. |

### 3.3 Frontend page map

Under `web.ui/frontend-react/src/pages/`, replacing the deleted Kanban Board + Lane + Card + TaskModal + SprintSelector:

```
/                  → Dashboard home: Today / System Health / Recent activity
/kdp               → KDP catalog table
/kdp/:slug         → KDP book detail page
/etsy              → Etsy catalog table
/etsy/:listingId   → Etsy listing detail page
/plans             → Specs + implementation plans browser
/calendar          → FullCalendar month/week/day view
/pinterest         → Pin queue + history + pause/resume + re-login button
/profile           → Profile editor
/help              → Index of help articles, plus per-field drawers
```

React Router v6, file-routing by hand (no Next.js, no Remix — overkill for localhost single-user).

## 4. Data model

SQLite at `data/dashboard.db`, WAL mode. Migrations in `web.ui/backend/migrations/000N_*.sql`.

```sql
-- kdp_books: one row per book in projects/kdp-puzzle-press/output/kdp-ready/
CREATE TABLE kdp_books (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  slug            TEXT NOT NULL UNIQUE,
  title           TEXT NOT NULL,
  subtitle        TEXT,
  asin            TEXT,
  status          TEXT NOT NULL CHECK(status IN ('built','in_review','published','archived')),
  release_date    TEXT,                  -- ISO yyyy-mm-dd
  listing_url     TEXT,
  page_count      INTEGER,
  trim_size       TEXT,
  price_usd       REAL,
  blurb           TEXT,
  cover_path      TEXT,                  -- relative to project root
  output_dir      TEXT NOT NULL,         -- absolute path under output/kdp-ready/
  notes           TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_kdp_books_status ON kdp_books(status);

-- etsy_listings: mirror of Etsy v3 listing state
CREATE TABLE etsy_listings (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  etsy_listing_id   INTEGER NOT NULL UNIQUE,
  sku_id            TEXT,                -- foreign key into projects/etsy-rooster-shop catalog.db
  title             TEXT NOT NULL,
  status            TEXT NOT NULL,       -- 'active','draft','inactive','sold_out','expired'
  section           TEXT,
  niche             TEXT,
  price_usd         REAL,
  favorites         INTEGER DEFAULT 0,
  views             INTEGER DEFAULT 0,
  listed_at         TEXT,                -- ISO datetime
  last_synced_at    TEXT NOT NULL DEFAULT (datetime('now')),
  listing_url       TEXT
);
CREATE INDEX idx_etsy_listings_status ON etsy_listings(status);

-- reminders: cron-driven scheduled alerts
CREATE TABLE reminders (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  title           TEXT NOT NULL,
  body            TEXT,
  due_at          TEXT NOT NULL,         -- ISO datetime
  channel         TEXT NOT NULL,         -- 'toast','email','both'
  status          TEXT NOT NULL CHECK(status IN ('pending','fired','dismissed','failed')),
  source_kind     TEXT,                  -- 'kdp.book','etsy.listing','pinterest.queue','manual'
  source_id       INTEGER,
  payload_json    TEXT,
  fired_at        TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_reminders_due ON reminders(status, due_at);

-- pinterest_queue: pending pins waiting to be posted
CREATE TABLE pinterest_queue (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  kdp_book_id     INTEGER REFERENCES kdp_books(id),
  pin_type        TEXT NOT NULL,         -- 'cover_hero','interior_preview'
  image_path      TEXT NOT NULL,
  title           TEXT NOT NULL,
  description     TEXT NOT NULL,
  link_url        TEXT NOT NULL,         -- Amazon product URL
  status          TEXT NOT NULL CHECK(status IN ('pending','posting','posted','failed','paused')),
  scheduled_for   TEXT NOT NULL,         -- ISO datetime
  attempts        INTEGER DEFAULT 0,
  last_error      TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_pinterest_queue_due ON pinterest_queue(status, scheduled_for);

-- pinterest_history: append-only record of every posting attempt
CREATE TABLE pinterest_history (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  queue_id          INTEGER NOT NULL REFERENCES pinterest_queue(id),
  pinterest_pin_id  TEXT,
  posted_at         TEXT NOT NULL DEFAULT (datetime('now')),
  success           INTEGER NOT NULL,    -- 1 / 0
  error_message     TEXT
);

-- events: append-only audit log for SSE replay
CREATE TABLE events (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  kind            TEXT NOT NULL,         -- 'kdp:published','etsy:status-changed', etc.
  payload_json    TEXT NOT NULL,
  occurred_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_events_kind_time ON events(kind, occurred_at);

-- profile: single-row table
CREATE TABLE profile (
  id              INTEGER PRIMARY KEY CHECK (id = 1),
  display_name    TEXT,
  pen_names_json  TEXT,                  -- JSON array
  kdp_author_url  TEXT,
  etsy_shop_url   TEXT,
  pinterest_url   TEXT,
  gmail_address   TEXT,
  brand_palette_json TEXT,
  time_zone       TEXT DEFAULT 'America/Los_Angeles'
);
INSERT INTO profile(id) VALUES (1);
```

## 5. Key data flows

### 5.1 Boot sequence

1. Task Scheduler fires `node server.js` minimized at user logon.
2. Server opens SQLite, runs pending migrations.
3. Express starts on `127.0.0.1:5000`.
4. systray2 registers the icon (green = healthy).
5. Background workers spin up; each writes its first heartbeat to the in-memory `workerStatus` map.
6. Tray-click opens `http://localhost:5000` in the default browser.

### 5.2 KDP publish flow (user-driven)

```
KDP scanner finds new dir in output/kdp-ready/<slug>/
    └─→ INSERT row with status='built', parse listing.md for title/blurb/page_count/trim
    └─→ SSE 'kdp:new-book'
Dashboard /kdp shows the row. User clicks 'Submit to KDP' → opens kdp.amazon.com in browser (external action).
User comes back, clicks '📋 Mark in-review'
    └─→ UPDATE status='in_review'
    └─→ INSERT reminder due_at = now()+3d, title="Check KDP review status: <title>"
KDP approves; user opens /kdp, clicks '✅ Mark published' on that row.
A modal opens with two fields: ASIN (paste) + actual release date (date picker, default today).
On save:
    └─→ UPDATE status='published', asin=<paste>, release_date=<picker>, listing_url=https://amazon.com/dp/<asin>
    └─→ INSERT 6 pinterest_queue rows (cover_hero + 5 interior_preview variants) scheduled across next 7 days
    └─→ INSERT reminder due_at = release_date+30d, title="KDP Day-30 sales check: <title>"
    └─→ SSE 'kdp:published'
```

### 5.3 Etsy sync flow (read-mostly in v1)

```
Etsy v3 syncer runs every 30 min
    └─→ Refresh OAuth token via ensure_fresh_token
    └─→ GET /shops/<shop_id>/listings (paged)
    └─→ Upsert each into etsy_listings; record diffs in events
    └─→ For each transition active→inactive, fire SSE 'etsy:status-changed'
    └─→ For each newly-active listing, INSERT 3 reminders: due at listed_at+30d / +60d / +90d
```

Mutations on Etsy from the dashboard are out of scope for v1; the dashboard deep-links to Etsy's own UI for those.

### 5.4 Pinterest posting flow (automated)

```
poster worker wakes at scheduled_for of the top pending pinterest_queue row
    └─→ Launch Playwright with persistent profile at .pinterest-profile/
    └─→ If profile dir is empty OR page redirects to /login → mark queue 'paused', fire reminder, set tray red, exit
        (First-ever Pinterest post: dashboard's /pinterest page surfaces a "Sign in to Pinterest" button
         that launches a visible Chromium window for one-time manual login, then resumes the queue.)
    └─→ Otherwise navigate to /pin-builder, upload image_path, fill title+description+link, click Publish
    └─→ Wait for the post-success redirect; parse pin URL; INSERT pinterest_history row
    └─→ UPDATE queue row status='posted'
    └─→ Schedule next wake at the next pending row's scheduled_for
```

Cadence is 3–5 pins/day, jittered between 09:00 and 21:00 local. The exact slot for each pin is computed when the row is inserted, not at posting time.

### 5.5 Reminder flow

```
reminders/scheduler ticks every 60s (node-cron)
    └─→ SELECT * FROM reminders WHERE status='pending' AND due_at <= now()
    └─→ For each:
            - channel includes 'toast' → node-notifier.notify({title, body})
            - channel includes 'email' → nodemailer.sendMail({to: profile.gmail_address, ...})
            - UPDATE status='fired', fired_at=now()
            - INSERT events row, SSE 'reminder:fired'
```

If either delivery channel errors, mark the reminder `failed`, record the error in `events`, and retry once at the next tick. Two consecutive failures stop retrying and surface a banner on the home page.

### 5.6 SSE channels

One stream at `/api/events` replaces the old per-agent SSE. Channel prefixes:

- `kdp:*` — new-book, status-changed, published
- `etsy:*` — synced, status-changed, sale-detected
- `pinterest:*` — pin-scheduled, pin-posted, pin-failed, login-required
- `reminder:*` — fired, dismissed, failed
- `system:*` — worker-heartbeat, worker-error, tray-state-changed

20-second heartbeat keeps proxies/dev tooling from killing the stream.

## 6. UI mockups

### 6.1 Global shell

Left sidebar nav (icons + labels), top bar with live SSE status dot, bell badge counting pending reminders, and a "👤 Shane" link to `/profile`.

### 6.2 Home (`/`)

Three stacks: **Today** (next ~24h of reminders / Etsy gates / scheduled pins), **System Health** (worker status, queue depth, tray state), **Recent activity** (last 10 events).

### 6.3 KDP catalog (`/kdp`)

Sortable table: title, status badge (✅ live / 🟡 in review / 🟦 built), ASIN, released date, actions menu. Row click → detail page. Empty status cells get a `+` button (e.g., paste ASIN inline). Header has `[+ Add manually]` for books built outside `output/kdp-ready/`.

### 6.4 KDP detail (`/kdp/:slug`)

Large cover image on the left, metadata + action buttons on the right (Open on Amazon, Edit metadata, Mark in-review/live, Generate Pinterest pins, Set release date). Below: 4×4 grid of interior page previews auto-rendered via `pdf2pic` from `interior.pdf` and cached in `data/cache/previews/<slug>/`. Below that: linked Pinterest pins (with status badges) and linked Etsy editions (if any).

### 6.5 Etsy catalog (`/etsy`)

Same shape as KDP catalog but with revenue snapshot column (favorites/views from Etsy v3). Filter chips: section (Coloring / SVG / Posters), niche, status.

### 6.6 Plans (`/plans`)

Two columns: Specs (left) and Implementation Plans (right). Each entry shows title, date, status (computed: open → no plan file yet; in-flight → plan file exists with unchecked todos; done → all todos checked). Click → markdown rendered inline.

### 6.7 Calendar (`/calendar`)

FullCalendar month/week/day. Events color-coded by kind. Click → side drawer with the underlying record + actions (snooze reminder, dismiss, jump to source). Top bar has kind-filters (toggle KDP releases, Etsy gates, Pinterest posts, reminders).

### 6.8 Pinterest (`/pinterest`)

Three sections: **Queue** (pending rows, drag to reorder, edit/cancel per row), **History** (last 100 posts with success/fail badges), **Settings** (pause toggle, slot config, re-login button which opens a visible Playwright window).

### 6.9 Profile (`/profile`)

Form: display name, pen names (chip input), KDP author URL, Etsy shop URL, Pinterest URL, Gmail address (with help drawer "How to set up an app password"), brand palette swatches, time zone.

### 6.10 Help (`/help` + drawers)

Index page lists all articles. Every manual-entry field has a `?` icon that opens a side drawer rendering `web.ui/backend/help/<field>.md`. Articles include: *Where to find your ASIN*, *How to generate a Gmail app password*, *How to claim Author Central*, *How to set up Pinterest for automation*, *How to find your Etsy shop ID*. Markdown + screenshots in `web.ui/backend/help/screenshots/`.

## 7. Errors, security, observability

### 7.1 Security boundary

- Express binds `127.0.0.1:5000` only. No LAN exposure.
- No authentication; single-user local app.
- Secrets in `web.ui/backend/.env` (gitignored): `GMAIL_APP_PASSWORD`, `ETSY_OAUTH_TOKEN`, optional `ANTHROPIC_API_KEY`, optional `GEMINI_API_KEY`.
- Playwright profile dir `.pinterest-profile/` gitignored; contains active session.
- Content-Security-Policy headers set on the static site.

### 7.2 Error handling per worker

| Worker | Failure mode → response |
|---|---|
| KDP scanner | Log + keep previous snapshot. Banner: "KDP scan failed: \<reason\>". Retry next interval. |
| Etsy v3 syncer | OAuth 401 → `ensure_fresh_token`. Persistent failure → banner + reminder "Re-auth Etsy". |
| Reminders | Per-reminder try/catch. One bad row doesn't kill the loop. Failures written to `events`. |
| Pinterest poster | Login-expired → pause queue, toast "Pinterest needs login", tray red, "/pinterest" surfaces "Re-login" button. Captcha → same. Network error → exponential backoff (1m → 5m → 30m → pause). |
| Email | nodemailer error → fall back to toast only; queue email for next-day retry. |

### 7.3 Observability

- `events` table is the audit log of every state transition.
- `/api/status` returns per-worker `{last_success_at, last_error_at, last_error_message, state}`.
- Structured pino logs to `data/logs/dashboard-YYYY-MM-DD.log`, rotated daily, retained 30 days.
- Tray icon color reflects aggregate health (green / yellow / red).

### 7.4 Backups

Nightly cron at 03:00 runs SQLite `.backup` to `data/.backups/dashboard-YYYY-MM-DD.db`, retains 14 days. `.pinterest-profile/` is included in the same backup tarball.

### 7.5 Tray-side resilience

If `server.js` crashes, systray2 keeps running and the icon turns yellow with a "Restart server" menu item that respawns the Node process.

## 8. Auto-start mechanism

A one-time PowerShell setup script `scripts/install-autostart.ps1`:

```powershell
$action = New-ScheduledTaskAction `
    -Execute "node.exe" `
    -Argument "$PSScriptRoot\..\web.ui\backend\server.js" `
    -WorkingDirectory "$PSScriptRoot\..\web.ui\backend"
$trigger = New-ScheduledTaskTrigger -AtLogOn
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit ([TimeSpan]::Zero)
Register-ScheduledTask -TaskName "Rooster Dashboard" `
    -Action $action -Trigger $trigger -Settings $settings -RunLevel Limited
```

A matching `scripts/uninstall-autostart.ps1` removes the task. Both scripts are idempotent.

The dashboard's `/profile` page surfaces "Autostart: enabled / disabled" with a button to run either script via a small Express endpoint.

## 9. Testing strategy

| Layer | Tool | Scope |
|---|---|---|
| Unit | Vitest | Scanners, parsers, reminder rule evaluation, prompt builders, SQL helpers. |
| Integration | Vitest + supertest | Express routes against a temp SQLite. Mocks: Etsy v3 (msw), Pinterest Playwright (fake driver), Gmail SMTP (nodemailer stream transport). |
| E2E (UI) | Playwright | Real browser drives the React app against a real backend with a temp DB. Covers home, KDP mark-live flow, Etsy sync, calendar drill-down. |
| E2E (Pinterest) | Playwright, manual-only | Cannot be in CI (would post live pins). One `npm run test:pinterest:live` script for pre-release verification. |

CI workflow `.github/workflows/web-ui-ci.yml` updated to drop agent-related tests; unit + integration + UI e2e run on every PR.

Per-module definition of done:
- UI page renders real data
- At least one happy-path e2e test passes
- Error states surface in dashboard banner
- Manual smoke test on Windows logon

## 10. Migration off Kanban

Three commits on a feature branch, each shippable:

1. **`feat: archive Kanban agent system`** — move `web.ui/backend/agents/`, the relevant frontend components (`Board`, `Lane`, `Card`, `TaskModal`, `SprintSelector`) and hooks (`useTaskPoller`, `useAgentEvents`, `useAgentWorkflow`), and the `data/{tasks,sprints,messages,agents,projects}.json` files into `web.ui/.archive-kanban/`. `server.js` no longer boots `AgentRuntime`. App still runs but renders an empty shell.
2. **`feat: dashboard scaffolding`** — better-sqlite3, migrations, new SSE channels, React Router, empty pages for each route, systray2 wiring, autostart scripts. App boots, all routes 200, no real data.
3. **`feat: <module>` ×8** — one commit per module: `kdp/`, `etsy/`, `plans/`, `reminders/`, `calendar/`, `pinterest/`, `profile/`, `help/`. Each ships with its tests + UI page + at least one e2e test.

After all eight modules ship and the user has run the dashboard for a week, `web.ui/.archive-kanban/` is deleted in a final cleanup commit.

## 11. Out of scope for v1

- Etsy listing mutations from the dashboard (publish/edit/delete via API). Deep-link to Etsy UI instead.
- KDP author dashboard scraping (rejected during brainstorming).
- ASIN auto-fetch (rejected during brainstorming).
- Multi-user / remote access / mobile app.
- Anna Sen Mennä novel publishing pipeline — separate track, separate spec ([[anna-sen-menna-novel-checkpoint]]).
- Pinterest API path (resumes whenever approval comes through; out of scope for this v1 because we're committing to the desktop-automation path).
- New AI agents. The dashboard is deterministic. Claude integration is optional and limited to small drafting chores.

## 12. Open questions

None at design close. All load-bearing decisions are locked in §2.

## 13. Related memories

- [[etsy-rooster-shop-checkpoint]] — 30 active Etsy listings; six pipelines; Day-30/60/90 gates already in flight
- [[kdp-catalog-status-2026-05-17]] — current catalog state; what's live vs. in-review vs. built
- [[pinterest-pin-automation-checkpoint]] — design Section 1 of pin-bot was approved; the desktop-automation path here supersedes the API path until approval lands
- [[anna-sen-menna-novel-checkpoint]] — explicitly out of scope here
