# Publishing Ops Dashboard — Plan A: Migration + Scaffolding

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Archive the existing Kanban + 7-agent app and stand up the empty scaffolding (SQLite, SSE, React Router, tray, autostart) so the new publishing-ops dashboard boots into a working empty shell.

**Architecture:** Two commits. (1) Move all Kanban code to `web.ui/.archive-kanban/`; remove agent boot from `server.js`. (2) Install scaffolding so all routes return 200, the tray icon appears, and Task Scheduler boots the server at logon.

**Tech Stack:** Node 18+, Express, React 19 + Vite + TypeScript, better-sqlite3, systray2, node-notifier, nodemailer, node-cron, pino, react-router-dom v6, @fullcalendar/react, Vitest, Playwright.

**Scope boundary (read this before starting):** This plan creates infrastructure only. KDP scanning, Etsy syncing, reminders rule engine, Pinterest poster, calendar event aggregation, and plans-folder browser are Plans B–E. Empty route components rendering a static placeholder are correct for this plan.

---

## Commit 1 — Archive Kanban

### Task 1: Create archive directory and verify branch state

**Files:**
- Create: `web.ui/.archive-kanban/README.md`

- [ ] **Step 1: Verify clean working tree on a feature branch**

```bash
git status
git rev-parse --abbrev-ref HEAD
```

Expected (branch is up to you; do not work on `main`):
```
On branch <feature-branch>
...
nothing to commit (or only the in-flight scheduled_tasks.lock change)
```

If on `main`, create a branch:
```bash
git checkout -b feat/publishing-ops-dashboard
```

- [ ] **Step 2: Create the archive directory with a README**

Create `web.ui/.archive-kanban/README.md`:

```markdown
# Kanban + 7-Agent Archive

The contents of this directory were the previous Kanban board + 7-agent runtime
(`Marcus`, `Sarah`, `Alex`, `Jamie`, `Taylor`, `Morgan`, `Jordan`). They are
preserved here for one development cycle while the Publishing Ops Dashboard is
built. After the dashboard has run in production for at least a week, this
entire directory will be removed in a single cleanup commit.

Do **not** import from this directory; nothing in here is wired into the live
app. See `docs/superpowers/specs/2026-05-26-publishing-ops-dashboard-design.md`
for the replacement architecture.
```

- [ ] **Step 3: Verify directory exists**

```powershell
Test-Path "web.ui/.archive-kanban/README.md"
```

Expected: `True`

---

### Task 2: Archive backend agents directory

**Files:**
- Move: `web.ui/backend/agents/` → `web.ui/.archive-kanban/backend/agents/`
- Move: `web.ui/backend/__tests__/{anthropicAdapter,approvalGates,baseAgent,taskAnalyzer}.test.js` → `web.ui/.archive-kanban/backend/__tests__/`

- [ ] **Step 1: Move the agents directory wholesale via git mv**

```bash
git mv web.ui/backend/agents web.ui/.archive-kanban/backend/agents
```

Expected: no output, exit code 0.

- [ ] **Step 2: Move the agent-related backend tests**

```bash
mkdir -p web.ui/.archive-kanban/backend/__tests__
git mv web.ui/backend/__tests__/anthropicAdapter.test.js web.ui/.archive-kanban/backend/__tests__/
git mv web.ui/backend/__tests__/approvalGates.test.js   web.ui/.archive-kanban/backend/__tests__/
git mv web.ui/backend/__tests__/baseAgent.test.js       web.ui/.archive-kanban/backend/__tests__/
git mv web.ui/backend/__tests__/taskAnalyzer.test.js    web.ui/.archive-kanban/backend/__tests__/
```

Note: keep `imageGenerationService.test.js`, `persistence.test.js`, `validateTransition.test.js`, and `workflow.test.js` in place — image generation survives, persistence/workflow tests will be deleted by later tasks but not via archive.

- [ ] **Step 3: Verify the move**

```powershell
Test-Path "web.ui/backend/agents"
Test-Path "web.ui/.archive-kanban/backend/agents/AgentRuntime.js"
```

Expected: `False` then `True`.

---

### Task 3: Archive backend agents-specific tests cleanly (delete what's only needed by agents)

**Files:**
- Delete: `web.ui/backend/__tests__/workflow.test.js` (tests the shared workflow used only by agents)
- Delete: `web.ui/backend/__tests__/validateTransition.test.js` (tests the shared workflow used only by agents)
- Delete: `web.ui/backend/__tests__/persistence.test.js` (persistence layer is replaced by SQLite in Commit 2)
- Delete: `web.ui/backend/persistence.js`
- Delete: `web.ui/shared/agentIds.mjs`, `web.ui/shared/agentIds.d.mts`, `web.ui/shared/workflow.mjs`, `web.ui/shared/workflow.d.mts`

- [ ] **Step 1: Confirm `persistence.test.js`, `workflow.test.js`, and `validateTransition.test.js` have only agent/Kanban-relevant assertions**

```bash
git grep -l "AgentRuntime\|sprints.json\|tasks.json\|messages.json" web.ui/backend/__tests__/persistence.test.js web.ui/backend/__tests__/workflow.test.js web.ui/backend/__tests__/validateTransition.test.js
```

Expected: all three filenames listed. (If any test references something we keep — image generation, env loading — pause and re-evaluate.)

- [ ] **Step 2: Move (don't delete) so we can resurrect anything we miss**

```bash
git mv web.ui/backend/__tests__/persistence.test.js       web.ui/.archive-kanban/backend/__tests__/
git mv web.ui/backend/__tests__/workflow.test.js          web.ui/.archive-kanban/backend/__tests__/
git mv web.ui/backend/__tests__/validateTransition.test.js web.ui/.archive-kanban/backend/__tests__/
git mv web.ui/backend/persistence.js                      web.ui/.archive-kanban/backend/persistence.js
git mv web.ui/shared                                       web.ui/.archive-kanban/shared
```

- [ ] **Step 3: Verify**

```powershell
Test-Path "web.ui/backend/persistence.js"
Test-Path "web.ui/shared"
Test-Path "web.ui/.archive-kanban/backend/persistence.js"
Test-Path "web.ui/.archive-kanban/shared/workflow.mjs"
```

Expected: `False`, `False`, `True`, `True`.

---

### Task 4: Archive frontend Kanban components and hooks

**Files:**
- Move: `web.ui/frontend-react/src/components/{Board,Lane,Card,TaskModal,SprintSelector,SprintRetroModal}.tsx` → `web.ui/.archive-kanban/frontend/components/`
- Move: `web.ui/frontend-react/src/hooks/{useTaskPoller,useAgentEvents,useAgentWorkflow}.ts` → `web.ui/.archive-kanban/frontend/hooks/`
- Move: `web.ui/frontend-react/src/constants/` (whole dir, contains `lanes.ts`) → `web.ui/.archive-kanban/frontend/constants/`
- Move: `web.ui/frontend-react/src/types/` (whole dir if entries are Kanban-only) → `web.ui/.archive-kanban/frontend/types/`
- Move: `web.ui/frontend-react/src/services/api.ts` → `web.ui/.archive-kanban/frontend/services/api.ts`
- Keep: `ErrorBanner.tsx`, `ImageGenPanel.tsx` (general-purpose; may be reused)

- [ ] **Step 1: Move the Kanban-specific components**

```bash
mkdir -p web.ui/.archive-kanban/frontend/components
git mv web.ui/frontend-react/src/components/Board.tsx            web.ui/.archive-kanban/frontend/components/
git mv web.ui/frontend-react/src/components/Lane.tsx             web.ui/.archive-kanban/frontend/components/
git mv web.ui/frontend-react/src/components/Card.tsx             web.ui/.archive-kanban/frontend/components/
git mv web.ui/frontend-react/src/components/TaskModal.tsx        web.ui/.archive-kanban/frontend/components/
git mv web.ui/frontend-react/src/components/SprintSelector.tsx   web.ui/.archive-kanban/frontend/components/
git mv web.ui/frontend-react/src/components/SprintRetroModal.tsx web.ui/.archive-kanban/frontend/components/
```

- [ ] **Step 2: Move the Kanban-specific hooks**

```bash
mkdir -p web.ui/.archive-kanban/frontend/hooks
git mv web.ui/frontend-react/src/hooks/useTaskPoller.ts    web.ui/.archive-kanban/frontend/hooks/
git mv web.ui/frontend-react/src/hooks/useAgentEvents.ts   web.ui/.archive-kanban/frontend/hooks/
git mv web.ui/frontend-react/src/hooks/useAgentWorkflow.ts web.ui/.archive-kanban/frontend/hooks/
```

- [ ] **Step 3: Move Kanban-only support modules (constants, types, services)**

```bash
git mv web.ui/frontend-react/src/constants web.ui/.archive-kanban/frontend/constants
git mv web.ui/frontend-react/src/types     web.ui/.archive-kanban/frontend/types
mkdir -p web.ui/.archive-kanban/frontend/services
git mv web.ui/frontend-react/src/services/api.ts web.ui/.archive-kanban/frontend/services/api.ts
```

- [ ] **Step 4: Verify**

```powershell
Test-Path "web.ui/frontend-react/src/components/Board.tsx"
Test-Path "web.ui/frontend-react/src/components/ErrorBanner.tsx"
Test-Path "web.ui/.archive-kanban/frontend/components/Board.tsx"
Test-Path "web.ui/.archive-kanban/frontend/hooks/useTaskPoller.ts"
```

Expected: `False`, `True`, `True`, `True`.

---

### Task 5: Archive `data/*.json` Kanban payloads

**Files:**
- Move: `data/agents.json`, `data/projects.json`, `data/sprints.json`, `data/tasks.json`, `data/messages.json` → `web.ui/.archive-kanban/data/`

- [ ] **Step 1: Move the JSON payloads**

```bash
mkdir -p web.ui/.archive-kanban/data
git mv data/agents.json   web.ui/.archive-kanban/data/
git mv data/projects.json web.ui/.archive-kanban/data/
git mv data/sprints.json  web.ui/.archive-kanban/data/
git mv data/tasks.json    web.ui/.archive-kanban/data/
git mv data/messages.json web.ui/.archive-kanban/data/
```

- [ ] **Step 2: Verify**

```powershell
Test-Path "data/tasks.json"
Test-Path "web.ui/.archive-kanban/data/tasks.json"
```

Expected: `False` then `True`.

The repo-root `data/` directory continues to exist (it's where the new `dashboard.db` and `.backups/` and `logs/` will go in Commit 2).

---

### Task 6: Replace `server.js` — drop agents, keep image-gen, leave room for SQLite

**Files:**
- Modify: `web.ui/backend/server.js` (full rewrite — show full file below)

- [ ] **Step 1: Write a failing smoke test that asserts server boots without AgentRuntime**

Create `web.ui/backend/__tests__/server_smoke.test.js`:

```javascript
/**
 * Smoke test: server must import and start without depending on the
 * archived AgentRuntime. Confirms Commit 1 cleanly severs the Kanban
 * dependency before Commit 2 introduces SQLite + SSE + workers.
 */
import { describe, it, expect } from 'vitest';
import request from 'supertest';

describe('server smoke', () => {
  it('boots and responds 200 on /api/status (or 404 in Commit 1 pre-scaffolding)', async () => {
    process.env.PORT = '0'; // ephemeral port; we won't actually listen here
    const mod = await import('../server.js');
    // After Commit 1: /api/status does not yet exist (added in Commit 2). The
    // app object must exist and export must succeed without touching agents/.
    expect(mod.app).toBeDefined();
  });

  it('does not import anything under ./agents/', async () => {
    const fs = await import('node:fs');
    const url = await import('node:url');
    const path = await import('node:path');
    const here = path.dirname(url.fileURLToPath(import.meta.url));
    const src = fs.readFileSync(path.join(here, '..', 'server.js'), 'utf8');
    expect(src).not.toMatch(/from\s+['"]\.\/agents/);
    expect(src).not.toMatch(/from\s+['"]\.\.\/shared\/workflow/);
  });
});
```

- [ ] **Step 2: Run the test, confirm failure**

```bash
cd web.ui/backend && npm test -- server_smoke.test.js
```

Expected: failure — current `server.js` imports `./agents/index.js`.

- [ ] **Step 3: Rewrite `server.js`**

Replace the entire contents of `web.ui/backend/server.js` with:

```javascript
/**
 * Express server — serves the React build and the image-generation API.
 *
 * Commit 1 (this file): Kanban + 7-agent runtime removed. Only the
 *   minimum-viable HTTP surface remains so the app boots into an empty shell.
 *
 * Commit 2 will add:
 *   - SQLite (db.js)
 *   - SSE channel (events.js → /api/events)
 *   - /api/status (workerStatus map)
 *   - /api/help/:field
 *   - systray2, autostart, logging, backup cron
 */

import './loadEnv.js';

import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { ImageGenerationService } from './ImageGenerationService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DIST_DIR = path.resolve(__dirname, '../frontend-react/dist');
const IMAGES_DIR = path.resolve(__dirname, 'generated-images');
const PORT = Number(process.env.PORT) || 5000;

const app = express();
app.use(express.json({ limit: '25mb' }));

// ── Image generation (Nano Banana Pro) — retained from previous app ────────
let imageService = null;
if (process.env.GEMINI_API_KEY) {
  try {
    imageService = new ImageGenerationService({
      apiKey: process.env.GEMINI_API_KEY,
      model: process.env.IMAGE_MODEL,
      outputDir: IMAGES_DIR,
    });
    console.log(
      `🎨 Image generation enabled (${process.env.IMAGE_MODEL || 'gemini-3-pro-image-preview'})`,
    );
  } catch (err) {
    console.warn('Image service init failed:', err.message);
  }
} else {
  console.log('🎨 Image generation disabled (set GEMINI_API_KEY to enable)');
}

app.use('/images', express.static(IMAGES_DIR));

app.post('/api/generate-image', async (req, res) => {
  if (!imageService) {
    return res.status(503).json({
      error: 'Image generation is not configured. Set GEMINI_API_KEY in .env and restart.',
    });
  }
  const { prompt, taskId, aspectRatio, resolution, inputImage } = req.body || {};
  if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
    return res.status(400).json({ error: 'prompt is required' });
  }
  try {
    const result = await imageService.generate({
      prompt,
      taskId,
      aspectRatio,
      resolution,
      inputImage,
    });
    res.json(result);
  } catch (err) {
    const msg = err?.message || 'Image generation failed';
    const isValidation =
      msg.startsWith('Invalid ') ||
      msg.startsWith('prompt is required') ||
      msg.startsWith('inputImage must be');
    res.status(isValidation ? 400 : 502).json({ error: msg });
  }
});

// ── Serve React build ────────────────────────────────────────────────────
if (fs.existsSync(DIST_DIR)) {
  app.use(express.static(DIST_DIR));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(DIST_DIR, 'index.html'));
  });
} else {
  app.get('/', (_req, res) => {
    res.send('React build not found. Run "npm run build" in web.ui/frontend-react/ first.');
  });
}

// ── Start ────────────────────────────────────────────────────────────────
const server = PORT === 0
  ? null
  : app.listen(PORT, '127.0.0.1', () => {
      console.log(`Publishing Ops Dashboard server running at http://127.0.0.1:${PORT}`);
    });

export { app, server };
```

- [ ] **Step 4: Relocate `ImageGenerationService.js`**

The image service used to live under `agents/`. Move it up one level:

```bash
git mv web.ui/.archive-kanban/backend/agents/ImageGenerationService.js web.ui/backend/ImageGenerationService.js
```

Then update the existing `imageGenerationService.test.js` import path:

```bash
git grep -l "agents/ImageGenerationService" web.ui/backend/__tests__/
```

If the test references `../agents/ImageGenerationService.js`, edit it to `../ImageGenerationService.js`.

- [ ] **Step 5: Re-run smoke test, confirm pass**

```bash
cd web.ui/backend && npm test -- server_smoke.test.js imageGenerationService.test.js
```

Expected: all passing (both test files green).

- [ ] **Step 6: Boot the server manually as a sanity check**

```bash
cd web.ui/backend && node server.js
```

Expected stdout (then Ctrl+C):
```
🎨 Image generation disabled (set GEMINI_API_KEY to enable)
Publishing Ops Dashboard server running at http://127.0.0.1:5000
```

---

### Task 7: Replace `App.tsx` with empty placeholder (router comes in Commit 2)

**Files:**
- Modify: `web.ui/frontend-react/src/App.tsx`
- Delete: `web.ui/frontend-react/src/App.css` references that no longer apply (leave file; we'll trim in Task 17)

- [ ] **Step 1: Replace `App.tsx`**

```typescript
import './App.css';

/**
 * Commit 1 placeholder — Kanban removed, router not yet installed.
 * Commit 2 (Task 17) replaces this with React Router + the global shell.
 */
export default function App() {
  return (
    <main style={{ padding: '2rem', fontFamily: 'system-ui, sans-serif' }}>
      <h1>🐓 Publishing Ops Dashboard</h1>
      <p>Migration in progress. The full dashboard arrives in Commit 2.</p>
    </main>
  );
}
```

- [ ] **Step 2: Build to verify TypeScript is happy**

```bash
cd web.ui/frontend-react && npm run build
```

Expected: build succeeds with no TS errors. Any errors here mean an archived hook is still referenced — find and archive it.

---

### Task 8: Commit 1

**Files:** all of the above

- [ ] **Step 1: Stage and review**

```bash
git status
git diff --stat HEAD
```

- [ ] **Step 2: Commit**

```bash
git add web.ui/.archive-kanban \
        web.ui/backend/server.js \
        web.ui/backend/ImageGenerationService.js \
        web.ui/backend/__tests__/server_smoke.test.js \
        web.ui/backend/__tests__/imageGenerationService.test.js \
        web.ui/frontend-react/src/App.tsx
git add -u web.ui/backend/agents web.ui/backend/persistence.js \
            web.ui/backend/__tests__/anthropicAdapter.test.js \
            web.ui/backend/__tests__/approvalGates.test.js \
            web.ui/backend/__tests__/baseAgent.test.js \
            web.ui/backend/__tests__/taskAnalyzer.test.js \
            web.ui/backend/__tests__/persistence.test.js \
            web.ui/backend/__tests__/workflow.test.js \
            web.ui/backend/__tests__/validateTransition.test.js \
            web.ui/shared \
            web.ui/frontend-react/src/components/Board.tsx \
            web.ui/frontend-react/src/components/Lane.tsx \
            web.ui/frontend-react/src/components/Card.tsx \
            web.ui/frontend-react/src/components/TaskModal.tsx \
            web.ui/frontend-react/src/components/SprintSelector.tsx \
            web.ui/frontend-react/src/components/SprintRetroModal.tsx \
            web.ui/frontend-react/src/hooks/useTaskPoller.ts \
            web.ui/frontend-react/src/hooks/useAgentEvents.ts \
            web.ui/frontend-react/src/hooks/useAgentWorkflow.ts \
            web.ui/frontend-react/src/constants \
            web.ui/frontend-react/src/types \
            web.ui/frontend-react/src/services/api.ts \
            data/agents.json data/projects.json data/sprints.json data/tasks.json data/messages.json

git commit -m "chore(archive): move Kanban board + 7-agent runtime to .archive-kanban/"
```

- [ ] **Step 3: Verify commit landed cleanly**

```bash
git log -1 --stat
```

Expected: single commit titled `chore(archive): ...` showing ~30+ renames and the `App.tsx` / `server.js` rewrites.

---

## Commit 2 — Scaffolding

### Task 9: Install backend dependencies

**Files:**
- Modify: `web.ui/backend/package.json`
- Modify: `web.ui/backend/package-lock.json`

- [ ] **Step 1: Install runtime deps**

```bash
cd web.ui/backend && npm install --save \
  better-sqlite3@^11.5.0 \
  systray2@^1.0.6 \
  node-notifier@^10.0.1 \
  nodemailer@^6.9.16 \
  node-cron@^3.0.3 \
  pino@^9.5.0 \
  pino-pretty@^11.3.0
```

Expected: package.json updated, no peer-dep warnings beyond benign ones.

- [ ] **Step 2: Install dev deps for testing**

```bash
cd web.ui/backend && npm install --save-dev \
  @types/better-sqlite3@^7.6.11 \
  @types/node-cron@^3.0.11 \
  @types/nodemailer@^6.4.16
```

- [ ] **Step 3: Verify `package.json` reflects the additions**

```bash
git diff web.ui/backend/package.json
```

Expected: new dependencies listed. The `type: "module"` line is unchanged — every new file in this plan must be ESM.

---

### Task 10: Create `db.js` + first migration

**Files:**
- Create: `web.ui/backend/db.js`
- Create: `web.ui/backend/migrations/0001_init.sql`
- Create: `web.ui/backend/__tests__/db.test.js`

- [ ] **Step 1: Write the failing test**

Create `web.ui/backend/__tests__/db.test.js`:

```javascript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

let tmpDir;
let openDb;

beforeEach(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rooster-db-'));
  process.env.ROOSTER_DB_PATH = path.join(tmpDir, 'dashboard.db');
  // Force fresh module load with the new env var.
  delete require.cache?.[require.resolve?.('../db.js') ?? ''];
  ({ openDb } = await import(`../db.js?cachebust=${Date.now()}`));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
  delete process.env.ROOSTER_DB_PATH;
});

describe('db.js', () => {
  it('creates and migrates all 7 tables on first open', () => {
    const db = openDb();
    const names = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all()
      .map((r) => r.name);
    expect(names).toEqual(
      expect.arrayContaining([
        'kdp_books',
        'etsy_listings',
        'reminders',
        'pinterest_queue',
        'pinterest_history',
        'events',
        'profile',
      ]),
    );
  });

  it('runs in WAL mode', () => {
    const db = openDb();
    const mode = db.prepare('PRAGMA journal_mode').get().journal_mode;
    expect(mode).toBe('wal');
  });

  it('seeds profile with id=1 row', () => {
    const db = openDb();
    const row = db.prepare('SELECT id FROM profile WHERE id=1').get();
    expect(row).toEqual({ id: 1 });
  });

  it('is idempotent across re-opens', () => {
    openDb().close();
    const db = openDb();
    const count = db
      .prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table'")
      .get().n;
    expect(count).toBeGreaterThanOrEqual(7);
  });
});
```

- [ ] **Step 2: Run, confirm failure (module does not exist)**

```bash
cd web.ui/backend && npm test -- db.test.js
```

Expected: `Cannot find module '../db.js'` or similar.

- [ ] **Step 3: Create the migration SQL**

Create `web.ui/backend/migrations/0001_init.sql` with the exact schema from spec §4 (the entire SQL block):

```sql
-- Migration 0001 — initial schema for the Publishing Ops Dashboard.
-- Source of truth: docs/superpowers/specs/2026-05-26-publishing-ops-dashboard-design.md §4

CREATE TABLE IF NOT EXISTS kdp_books (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  slug            TEXT NOT NULL UNIQUE,
  title           TEXT NOT NULL,
  subtitle        TEXT,
  asin            TEXT,
  status          TEXT NOT NULL CHECK(status IN ('built','in_review','published','archived')),
  release_date    TEXT,
  listing_url     TEXT,
  page_count      INTEGER,
  trim_size       TEXT,
  price_usd       REAL,
  blurb           TEXT,
  cover_path      TEXT,
  output_dir      TEXT NOT NULL,
  notes           TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_kdp_books_status ON kdp_books(status);

CREATE TABLE IF NOT EXISTS etsy_listings (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  etsy_listing_id   INTEGER NOT NULL UNIQUE,
  sku_id            TEXT,
  title             TEXT NOT NULL,
  status            TEXT NOT NULL,
  section           TEXT,
  niche             TEXT,
  price_usd         REAL,
  favorites         INTEGER DEFAULT 0,
  views             INTEGER DEFAULT 0,
  listed_at         TEXT,
  last_synced_at    TEXT NOT NULL DEFAULT (datetime('now')),
  listing_url       TEXT
);
CREATE INDEX IF NOT EXISTS idx_etsy_listings_status ON etsy_listings(status);

CREATE TABLE IF NOT EXISTS reminders (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  title           TEXT NOT NULL,
  body            TEXT,
  due_at          TEXT NOT NULL,
  channel         TEXT NOT NULL,
  status          TEXT NOT NULL CHECK(status IN ('pending','fired','dismissed','failed')),
  source_kind     TEXT,
  source_id       INTEGER,
  payload_json    TEXT,
  fired_at        TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_reminders_due ON reminders(status, due_at);

CREATE TABLE IF NOT EXISTS pinterest_queue (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  kdp_book_id     INTEGER REFERENCES kdp_books(id),
  pin_type        TEXT NOT NULL,
  image_path      TEXT NOT NULL,
  title           TEXT NOT NULL,
  description     TEXT NOT NULL,
  link_url        TEXT NOT NULL,
  status          TEXT NOT NULL CHECK(status IN ('pending','posting','posted','failed','paused')),
  scheduled_for   TEXT NOT NULL,
  attempts        INTEGER DEFAULT 0,
  last_error      TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_pinterest_queue_due ON pinterest_queue(status, scheduled_for);

CREATE TABLE IF NOT EXISTS pinterest_history (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  queue_id          INTEGER NOT NULL REFERENCES pinterest_queue(id),
  pinterest_pin_id  TEXT,
  posted_at         TEXT NOT NULL DEFAULT (datetime('now')),
  success           INTEGER NOT NULL,
  error_message     TEXT
);

CREATE TABLE IF NOT EXISTS events (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  kind            TEXT NOT NULL,
  payload_json    TEXT NOT NULL,
  occurred_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_events_kind_time ON events(kind, occurred_at);

CREATE TABLE IF NOT EXISTS profile (
  id                 INTEGER PRIMARY KEY CHECK (id = 1),
  display_name       TEXT,
  pen_names_json     TEXT,
  kdp_author_url     TEXT,
  etsy_shop_url      TEXT,
  pinterest_url      TEXT,
  gmail_address      TEXT,
  brand_palette_json TEXT,
  time_zone          TEXT DEFAULT 'America/Los_Angeles'
);
INSERT OR IGNORE INTO profile(id) VALUES (1);
```

- [ ] **Step 4: Create `db.js`**

Create `web.ui/backend/db.js`:

```javascript
/**
 * better-sqlite3 wrapper. Opens (or creates) `data/dashboard.db`, sets
 * WAL mode, applies any pending migrations from `web.ui/backend/migrations/`,
 * and exposes a singleton handle.
 *
 * Tests override the DB location by setting ROOSTER_DB_PATH before importing.
 */

import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** @returns {string} */
function resolveDbPath() {
  if (process.env.ROOSTER_DB_PATH) {
    return path.resolve(process.env.ROOSTER_DB_PATH);
  }
  // Default: <repo-root>/data/dashboard.db
  return path.resolve(__dirname, '..', '..', 'data', 'dashboard.db');
}

/** @returns {string} */
function migrationsDir() {
  return path.resolve(__dirname, 'migrations');
}

/**
 * Apply any unapplied migration files (sorted by filename). Each successful
 * migration is recorded in a `_schema_migrations` table so re-running is a
 * no-op.
 *
 * @param {Database.Database} db
 */
function migrate(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS _schema_migrations (
    name TEXT PRIMARY KEY,
    applied_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);
  const applied = new Set(
    db.prepare('SELECT name FROM _schema_migrations').all().map((r) => r.name),
  );
  const dir = migrationsDir();
  if (!fs.existsSync(dir)) return;
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  const insert = db.prepare(
    'INSERT INTO _schema_migrations(name) VALUES (?)',
  );
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = fs.readFileSync(path.join(dir, file), 'utf8');
    db.exec('BEGIN');
    try {
      db.exec(sql);
      insert.run(file);
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw new Error(`Migration ${file} failed: ${err.message}`);
    }
  }
}

/** @type {Database.Database | null} */
let cached = null;

/**
 * Open (or return the cached) database handle. WAL mode enabled; foreign keys on.
 *
 * @returns {Database.Database}
 */
export function openDb() {
  if (cached) return cached;
  const dbPath = resolveDbPath();
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  migrate(db);
  cached = db;
  return db;
}

/** For tests — resets the cached handle so a new path takes effect. */
export function _resetForTests() {
  if (cached) cached.close();
  cached = null;
}
```

- [ ] **Step 5: Patch test to use `_resetForTests` (avoid Vitest module-cache quirks)**

Edit `web.ui/backend/__tests__/db.test.js` — replace the `beforeEach`/`afterEach`:

```javascript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openDb, _resetForTests } from '../db.js';

let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rooster-db-'));
  process.env.ROOSTER_DB_PATH = path.join(tmpDir, 'dashboard.db');
  _resetForTests();
});

afterEach(() => {
  _resetForTests();
  fs.rmSync(tmpDir, { recursive: true, force: true });
  delete process.env.ROOSTER_DB_PATH;
});
```

(The four `it()` blocks stay as written in Step 1.)

- [ ] **Step 6: Run, confirm pass**

```bash
cd web.ui/backend && npm test -- db.test.js
```

Expected: all 4 tests pass.

---

### Task 11: Create `events.js` (audit log + SSE channel skeleton)

**Files:**
- Create: `web.ui/backend/events.js`
- Create: `web.ui/backend/__tests__/events.test.js`

- [ ] **Step 1: Write the failing test**

Create `web.ui/backend/__tests__/events.test.js`:

```javascript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openDb, _resetForTests } from '../db.js';
import { recordEvent, subscribe, _resetSubscribersForTests, replayRecent } from '../events.js';

let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rooster-events-'));
  process.env.ROOSTER_DB_PATH = path.join(tmpDir, 'dashboard.db');
  _resetForTests();
  _resetSubscribersForTests();
});

afterEach(() => {
  _resetForTests();
  _resetSubscribersForTests();
  fs.rmSync(tmpDir, { recursive: true, force: true });
  delete process.env.ROOSTER_DB_PATH;
});

describe('events.js', () => {
  it('recordEvent writes to the events table', () => {
    recordEvent('kdp:new-book', { slug: 'foo' });
    const row = openDb()
      .prepare('SELECT kind, payload_json FROM events ORDER BY id DESC LIMIT 1')
      .get();
    expect(row.kind).toBe('kdp:new-book');
    expect(JSON.parse(row.payload_json)).toEqual({ slug: 'foo' });
  });

  it('fan-outs to subscribers', () => {
    const received = [];
    subscribe((evt) => received.push(evt));
    recordEvent('system:worker-heartbeat', { worker: 'kdp' });
    expect(received).toHaveLength(1);
    expect(received[0].kind).toBe('system:worker-heartbeat');
    expect(received[0].payload).toEqual({ worker: 'kdp' });
  });

  it('replayRecent returns last N events oldest-first', () => {
    for (let i = 0; i < 60; i++) recordEvent('test:e', { i });
    const recent = replayRecent(50);
    expect(recent).toHaveLength(50);
    expect(recent[0].payload.i).toBe(10); // 60 - 50 = 10
    expect(recent[49].payload.i).toBe(59);
  });
});
```

- [ ] **Step 2: Run, confirm failure**

```bash
cd web.ui/backend && npm test -- events.test.js
```

Expected: `Cannot find module '../events.js'`.

- [ ] **Step 3: Implement `events.js`**

Create `web.ui/backend/events.js`:

```javascript
/**
 * Append-only audit log + in-process pub/sub.
 *
 * Every state transition in the dashboard goes through recordEvent().
 * Both the events table (persistent audit log) and connected SSE clients
 * (via subscribe) get the event.
 */

import { openDb } from './db.js';

/**
 * @typedef {Object} DashboardEvent
 * @property {string} kind          Channel name, e.g. 'kdp:published'.
 * @property {object} payload       Arbitrary JSON-serializable data.
 * @property {string} occurred_at   ISO datetime.
 */

/** @type {Set<(evt: DashboardEvent) => void>} */
const subscribers = new Set();

/**
 * Append an event to the persistent log and fan-out to subscribers.
 *
 * @param {string} kind
 * @param {object} payload
 * @returns {DashboardEvent}
 */
export function recordEvent(kind, payload = {}) {
  const db = openDb();
  const occurred_at = new Date().toISOString();
  db.prepare(
    'INSERT INTO events(kind, payload_json, occurred_at) VALUES (?, ?, ?)',
  ).run(kind, JSON.stringify(payload), occurred_at);
  const evt = { kind, payload, occurred_at };
  for (const fn of subscribers) {
    try {
      fn(evt);
    } catch (err) {
      // A bad subscriber must not poison the broadcast loop.
      console.error('events subscriber threw:', err);
    }
  }
  return evt;
}

/**
 * Subscribe to all events. Returns an unsubscribe function.
 *
 * @param {(evt: DashboardEvent) => void} fn
 * @returns {() => void}
 */
export function subscribe(fn) {
  subscribers.add(fn);
  return () => subscribers.delete(fn);
}

/**
 * Return the most recent `limit` events oldest-first (for SSE on-connect replay).
 *
 * @param {number} limit
 * @returns {DashboardEvent[]}
 */
export function replayRecent(limit = 50) {
  const rows = openDb()
    .prepare(
      'SELECT kind, payload_json, occurred_at FROM events ORDER BY id DESC LIMIT ?',
    )
    .all(limit);
  return rows
    .map((r) => ({
      kind: r.kind,
      payload: JSON.parse(r.payload_json),
      occurred_at: r.occurred_at,
    }))
    .reverse();
}

/** For tests. */
export function _resetSubscribersForTests() {
  subscribers.clear();
}
```

- [ ] **Step 4: Run, confirm pass**

```bash
cd web.ui/backend && npm test -- events.test.js
```

Expected: all 3 tests pass.

---

### Task 12: Create `workerStatus` map + `/api/status` endpoint + `/api/events` SSE

**Files:**
- Create: `web.ui/backend/workerStatus.js`
- Modify: `web.ui/backend/server.js`
- Create: `web.ui/backend/__tests__/status_api.test.js`

- [ ] **Step 1: Write failing tests**

Create `web.ui/backend/__tests__/status_api.test.js`:

```javascript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { _resetForTests } from '../db.js';
import { _resetSubscribersForTests } from '../events.js';
import { _resetWorkerStatus, setWorkerHeartbeat, setWorkerError } from '../workerStatus.js';

let app;
let tmpDir;

beforeEach(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rooster-status-'));
  process.env.ROOSTER_DB_PATH = path.join(tmpDir, 'dashboard.db');
  process.env.PORT = '0';
  _resetForTests();
  _resetSubscribersForTests();
  _resetWorkerStatus();
  ({ app } = await import(`../server.js?cachebust=${Date.now()}`));
});

afterEach(() => {
  _resetForTests();
  _resetSubscribersForTests();
  _resetWorkerStatus();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('/api/status', () => {
  it('returns an object keyed by worker name', async () => {
    setWorkerHeartbeat('kdp');
    setWorkerError('etsy', 'OAuth failed');
    const res = await request(app).get('/api/status');
    expect(res.status).toBe(200);
    expect(res.body.kdp).toMatchObject({ state: 'ok' });
    expect(res.body.kdp.last_success_at).toBeTruthy();
    expect(res.body.etsy).toMatchObject({
      state: 'error',
      last_error_message: 'OAuth failed',
    });
  });

  it('returns empty object when no workers registered', async () => {
    const res = await request(app).get('/api/status');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({});
  });
});

describe('/api/events SSE', () => {
  it('sets text/event-stream headers', async () => {
    const res = await request(app)
      .get('/api/events')
      .buffer(false)
      .parse((r, cb) => {
        // Abort the long-lived connection after we read headers.
        r.on('data', () => r.destroy());
        r.on('close', () => cb(null, ''));
      });
    expect(res.headers['content-type']).toMatch(/text\/event-stream/);
    expect(res.headers['cache-control']).toMatch(/no-cache/);
  });
});
```

- [ ] **Step 2: Run, confirm failure**

```bash
cd web.ui/backend && npm test -- status_api.test.js
```

Expected: module-not-found error for `workerStatus.js`.

- [ ] **Step 3: Create `workerStatus.js`**

Create `web.ui/backend/workerStatus.js`:

```javascript
/**
 * In-memory per-worker status. Used by /api/status (read) and by each
 * background worker (write). The tray-icon color is derived from the
 * aggregate of these states.
 *
 * Plans B-E register their workers by calling setWorkerHeartbeat / setWorkerError.
 */

/**
 * @typedef {Object} WorkerStatus
 * @property {'ok'|'degraded'|'error'|'idle'} state
 * @property {string|null} last_success_at  ISO datetime
 * @property {string|null} last_error_at    ISO datetime
 * @property {string|null} last_error_message
 */

/** @type {Map<string, WorkerStatus>} */
const statuses = new Map();

/** @param {string} worker */
export function setWorkerHeartbeat(worker) {
  const prev = statuses.get(worker) ?? blank();
  prev.state = 'ok';
  prev.last_success_at = new Date().toISOString();
  statuses.set(worker, prev);
}

/**
 * @param {string} worker
 * @param {string} message
 */
export function setWorkerError(worker, message) {
  const prev = statuses.get(worker) ?? blank();
  prev.state = 'error';
  prev.last_error_at = new Date().toISOString();
  prev.last_error_message = message;
  statuses.set(worker, prev);
}

/** @returns {Record<string, WorkerStatus>} */
export function getAllStatuses() {
  return Object.fromEntries(statuses);
}

/** @returns {'green'|'yellow'|'red'} aggregate health */
export function trayColor() {
  if (statuses.size === 0) return 'green';
  const states = [...statuses.values()].map((s) => s.state);
  if (states.includes('error')) return 'red';
  if (states.includes('degraded')) return 'yellow';
  return 'green';
}

/** @returns {WorkerStatus} */
function blank() {
  return {
    state: 'idle',
    last_success_at: null,
    last_error_at: null,
    last_error_message: null,
  };
}

/** Test helper. */
export function _resetWorkerStatus() {
  statuses.clear();
}
```

- [ ] **Step 4: Add `/api/status` + `/api/events` to `server.js`**

Replace the entire contents of `web.ui/backend/server.js`:

```javascript
/**
 * Express server — Publishing Ops Dashboard.
 *
 * Scaffolding only at Commit 2. Per-domain logic (KDP scanner, Etsy syncer,
 * reminders, Pinterest poster, calendar aggregation) ships in Plans B-E.
 */

import './loadEnv.js';

import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { ImageGenerationService } from './ImageGenerationService.js';
import { openDb } from './db.js';
import { subscribe, replayRecent } from './events.js';
import { getAllStatuses } from './workerStatus.js';
import { logger } from './logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DIST_DIR = path.resolve(__dirname, '../frontend-react/dist');
const IMAGES_DIR = path.resolve(__dirname, 'generated-images');
const HELP_DIR = path.resolve(__dirname, 'help');
const PORT = Number(process.env.PORT ?? 5000);
const SSE_HEARTBEAT_MS = 20_000;

const app = express();
app.use(express.json({ limit: '25mb' }));

// Open DB eagerly so migrations run before any request hits the API.
openDb();

// ── Image generation (Nano Banana Pro) — retained ──────────────────────────
let imageService = null;
if (process.env.GEMINI_API_KEY) {
  try {
    imageService = new ImageGenerationService({
      apiKey: process.env.GEMINI_API_KEY,
      model: process.env.IMAGE_MODEL,
      outputDir: IMAGES_DIR,
    });
    logger.info(
      { model: process.env.IMAGE_MODEL || 'gemini-3-pro-image-preview' },
      'image generation enabled',
    );
  } catch (err) {
    logger.warn({ err: err.message }, 'image service init failed');
  }
}

app.use('/images', express.static(IMAGES_DIR));

app.post('/api/generate-image', async (req, res) => {
  if (!imageService) {
    return res.status(503).json({
      error: 'Image generation is not configured. Set GEMINI_API_KEY in .env and restart.',
    });
  }
  const { prompt, taskId, aspectRatio, resolution, inputImage } = req.body || {};
  if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
    return res.status(400).json({ error: 'prompt is required' });
  }
  try {
    const result = await imageService.generate({
      prompt,
      taskId,
      aspectRatio,
      resolution,
      inputImage,
    });
    res.json(result);
  } catch (err) {
    const msg = err?.message || 'Image generation failed';
    const isValidation =
      msg.startsWith('Invalid ') ||
      msg.startsWith('prompt is required') ||
      msg.startsWith('inputImage must be');
    res.status(isValidation ? 400 : 502).json({ error: msg });
  }
});

// ── /api/status — worker health (read-only) ────────────────────────────────
app.get('/api/status', (_req, res) => {
  res.json(getAllStatuses());
});

// ── /api/events — SSE channel (consumed by frontend, written by Plans B-E) ─
app.get('/api/events', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write(':\n\n');

  // Replay last 50 events so a freshly-loaded UI shows recent history.
  for (const evt of replayRecent(50)) {
    res.write(
      `event: ${evt.kind}\ndata: ${JSON.stringify({ payload: evt.payload, occurred_at: evt.occurred_at })}\n\n`,
    );
  }

  const unsubscribe = subscribe((evt) => {
    try {
      res.write(
        `event: ${evt.kind}\ndata: ${JSON.stringify({ payload: evt.payload, occurred_at: evt.occurred_at })}\n\n`,
      );
    } catch {
      /* cleaned up by close handler */
    }
  });

  const heartbeat = setInterval(() => {
    try {
      res.write(': ping\n\n');
    } catch {
      /* cleaned up by close handler */
    }
  }, SSE_HEARTBEAT_MS);

  req.on('close', () => {
    clearInterval(heartbeat);
    unsubscribe();
  });
});

// ── /api/help/:field — per-field help markdown (one example file in Task 18) ──
app.get('/api/help/:field', (req, res) => {
  const safe = req.params.field.replace(/[^a-zA-Z0-9_-]/g, '');
  const file = path.join(HELP_DIR, `${safe}.md`);
  if (!fs.existsSync(file)) {
    return res.status(404).json({ error: `No help article for "${safe}"` });
  }
  res.type('text/markdown').send(fs.readFileSync(file, 'utf8'));
});

// ── Serve React build ────────────────────────────────────────────────────
if (fs.existsSync(DIST_DIR)) {
  app.use(express.static(DIST_DIR));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(DIST_DIR, 'index.html'));
  });
} else {
  app.get('/', (_req, res) => {
    res.send('React build not found. Run "npm run build" in web.ui/frontend-react/ first.');
  });
}

// ── Start ────────────────────────────────────────────────────────────────
const server = PORT === 0
  ? null
  : app.listen(PORT, '127.0.0.1', () => {
      logger.info({ port: PORT }, 'dashboard server listening');
    });

export { app, server };
```

(Note: `logger` is created in Task 14 — server tests in this task will fail until Task 14 lands. Acceptable: we'll re-run them at the end of Task 14.)

- [ ] **Step 5: Defer status_api test pass until Task 14**

Don't run `npm test` yet. Move on to Task 13 (frontend deps) then Task 14 (logger), then circle back.

---

### Task 13: Install frontend dependencies

**Files:**
- Modify: `web.ui/frontend-react/package.json`
- Modify: `web.ui/frontend-react/package-lock.json`

- [ ] **Step 1: Install runtime deps**

```bash
cd web.ui/frontend-react && npm install --save \
  react-router-dom@^6.28.0 \
  @fullcalendar/react@^6.1.15 \
  @fullcalendar/daygrid@^6.1.15 \
  @fullcalendar/timegrid@^6.1.15 \
  @fullcalendar/interaction@^6.1.15
```

- [ ] **Step 2: Verify Playwright is installable as a dev dep (E2E)**

Check `web.ui/frontend-react/package.json` for `@playwright/test`. If absent, install:

```bash
cd web.ui/frontend-react && npm install --save-dev @playwright/test@^1.49.0
```

Then install the Chromium browser binary (one-time per machine):

```bash
cd web.ui/frontend-react && npx playwright install chromium
```

Expected: `chromium` downloaded once; subsequent runs are no-op.

- [ ] **Step 3: Verify**

```bash
git diff --stat web.ui/frontend-react/package.json
```

Expected: deps + devDeps updated.

---

### Task 14: Pino logger with daily rotation

**Files:**
- Create: `web.ui/backend/logger.js`
- Create: `web.ui/backend/__tests__/logger.test.js`

- [ ] **Step 1: Write the failing test**

Create `web.ui/backend/__tests__/logger.test.js`:

```javascript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rooster-log-'));
  process.env.ROOSTER_LOG_DIR = tmpDir;
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
  delete process.env.ROOSTER_LOG_DIR;
});

describe('logger.js', () => {
  it('writes a JSON line to today\'s log file', async () => {
    const { logger, _flush } = await import(`../logger.js?cachebust=${Date.now()}`);
    logger.info({ marker: 'abc123' }, 'hello');
    await _flush();
    const today = new Date().toISOString().slice(0, 10);
    const file = path.join(tmpDir, `dashboard-${today}.log`);
    expect(fs.existsSync(file)).toBe(true);
    const content = fs.readFileSync(file, 'utf8');
    expect(content).toMatch(/"marker":"abc123"/);
    expect(content).toMatch(/"msg":"hello"/);
  });

  it('exposes pruneOldLogs that deletes files older than 30 days', async () => {
    const oldName = path.join(tmpDir, 'dashboard-2024-01-01.log');
    fs.writeFileSync(oldName, 'stale');
    const { pruneOldLogs } = await import(`../logger.js?cachebust=${Date.now()}`);
    pruneOldLogs(30);
    expect(fs.existsSync(oldName)).toBe(false);
  });
});
```

- [ ] **Step 2: Run, confirm failure**

```bash
cd web.ui/backend && npm test -- logger.test.js
```

- [ ] **Step 3: Implement `logger.js`**

Create `web.ui/backend/logger.js`:

```javascript
/**
 * Pino logger with simple per-day file rotation.
 *
 * Output: `data/logs/dashboard-YYYY-MM-DD.log` (one JSON object per line).
 * Tests redirect via ROOSTER_LOG_DIR.
 *
 * Retention is handled by the daily-prune call wired into the backup cron
 * (Task 16). 30-day retention by default.
 */

import pino from 'pino';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** @returns {string} */
function resolveLogDir() {
  if (process.env.ROOSTER_LOG_DIR) {
    return path.resolve(process.env.ROOSTER_LOG_DIR);
  }
  return path.resolve(__dirname, '..', '..', 'data', 'logs');
}

const logDir = resolveLogDir();
fs.mkdirSync(logDir, { recursive: true });

const today = new Date().toISOString().slice(0, 10);
const logFile = path.join(logDir, `dashboard-${today}.log`);

const dest = pino.destination({ dest: logFile, sync: false, mkdir: true });

export const logger = pino(
  {
    base: { app: 'rooster-dashboard' },
    timestamp: pino.stdTimeFunctions.isoTime,
  },
  dest,
);

/**
 * Force buffered writes to disk. Used by tests; safe to call in production.
 * @returns {Promise<void>}
 */
export async function _flush() {
  return new Promise((resolve) => {
    dest.flushSync?.();
    setTimeout(resolve, 25);
  });
}

/**
 * Delete log files older than `keepDays`. Called by the nightly cron.
 *
 * @param {number} keepDays
 */
export function pruneOldLogs(keepDays = 30) {
  const cutoff = Date.now() - keepDays * 24 * 60 * 60 * 1000;
  for (const file of fs.readdirSync(logDir)) {
    if (!/^dashboard-\d{4}-\d{2}-\d{2}\.log$/.test(file)) continue;
    const full = path.join(logDir, file);
    const stat = fs.statSync(full);
    if (stat.mtimeMs < cutoff) fs.unlinkSync(full);
  }
}
```

- [ ] **Step 4: Run logger tests + status_api tests, confirm pass**

```bash
cd web.ui/backend && npm test -- logger.test.js status_api.test.js
```

Expected: both test files pass. (The `status_api.test.js` SSE test pulls in `server.js` which now imports `logger.js`.)

---

### Task 15: systray2 wiring with color-state icon

**Files:**
- Create: `web.ui/backend/tray.js`
- Create: `web.ui/backend/assets/tray-green.png`, `tray-yellow.png`, `tray-red.png` (16×16 PNGs)
- Modify: `web.ui/backend/server.js` (call `startTray()` after `app.listen`)
- Create: `web.ui/backend/__tests__/tray.test.js`

- [ ] **Step 1: Create the icon PNGs**

Use Node to write three 16×16 solid PNGs. Run this throwaway script once:

```bash
cd web.ui/backend && node -e "
const fs = require('fs');
const path = require('path');
const out = path.join(__dirname, 'assets');
fs.mkdirSync(out, { recursive: true });
// Minimal solid-color 16x16 PNG via a tiny generator.
function solidPng(r, g, b) {
  const w = 16, h = 16;
  const sig = Buffer.from([137,80,78,71,13,10,26,10]);
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(w, 0); ihdrData.writeUInt32BE(h, 4);
  ihdrData[8] = 8; ihdrData[9] = 2; ihdrData[10] = 0; ihdrData[11] = 0; ihdrData[12] = 0;
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
    const t = Buffer.from(type);
    const crc = Buffer.alloc(4);
    const zlib = require('zlib');
    const tableData = Buffer.concat([t, data]);
    crc.writeUInt32BE(zlib.crc32 ? zlib.crc32(tableData) : require('buffer').Buffer.from(require('crypto').createHash('md5').update(tableData).digest()).readUInt32BE(0), 0);
    return Buffer.concat([len, t, data, crc]);
  };
  const zlib = require('zlib');
  // Build raw scanlines: each row = filter byte (0) + w*3 RGB bytes.
  const row = Buffer.alloc(1 + w * 3);
  row[0] = 0;
  for (let x = 0; x < w; x++) { row[1 + x*3] = r; row[2 + x*3] = g; row[3 + x*3] = b; }
  const raw = Buffer.concat(new Array(h).fill(row));
  const idat = zlib.deflateSync(raw);
  // CRC implementation that matches PNG spec (zlib.crc32 was added in Node 18+).
  const png = Buffer.concat([sig, chunk('IHDR', ihdrData), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
  return png;
}
fs.writeFileSync(path.join(out, 'tray-green.png'),  solidPng( 16, 185,  87));
fs.writeFileSync(path.join(out, 'tray-yellow.png'), solidPng(245, 158,  11));
fs.writeFileSync(path.join(out, 'tray-red.png'),    solidPng(239,  68,  68));
console.log('Wrote 3 tray icons to', out);
"
```

Expected: `Wrote 3 tray icons to .../web.ui/backend/assets`.

(If `zlib.crc32` is unavailable on your Node, swap the CRC line for the standard PNG CRC table. A 12-line implementation is acceptable here.)

- [ ] **Step 2: Write the failing test**

Create `web.ui/backend/__tests__/tray.test.js`:

```javascript
import { describe, it, expect, vi } from 'vitest';

vi.mock('systray2', () => {
  const ctor = vi.fn(function MockSysTray(opts) {
    this.opts = opts;
    this.onClick = vi.fn();
    this.kill = vi.fn();
    this.ready = vi.fn(() => Promise.resolve());
    this.sendAction = vi.fn();
  });
  return { default: ctor };
});

describe('tray.js', () => {
  it('starts a SysTray with the 5 menu items from spec §3.1', async () => {
    const { startTray } = await import(`../tray.js?cachebust=${Date.now()}`);
    const tray = await startTray();
    expect(tray).toBeTruthy();
    const items = tray.opts.menu.items.map((i) => i.title);
    expect(items).toEqual([
      'Open dashboard',
      'Pause Pinterest',
      'Pause reminders',
      'Restart server',
      'Quit',
    ]);
  });

  it('chooses icon based on workerStatus.trayColor', async () => {
    const { _resetWorkerStatus, setWorkerError } = await import('../workerStatus.js');
    _resetWorkerStatus();
    setWorkerError('kdp', 'boom');
    const { pickIconPath } = await import(`../tray.js?cachebust=${Date.now()}`);
    expect(pickIconPath()).toMatch(/tray-red\.png$/);
  });
});
```

- [ ] **Step 3: Run, confirm failure**

```bash
cd web.ui/backend && npm test -- tray.test.js
```

- [ ] **Step 4: Implement `tray.js`**

Create `web.ui/backend/tray.js`:

```javascript
/**
 * systray2 wiring. Started after Express is listening. Owns the icon's
 * color states (green/yellow/red driven by workerStatus.trayColor) and
 * the 5-item menu (Open dashboard / Pause Pinterest / Pause reminders /
 * Restart server / Quit).
 *
 * Plans B-D wire the "Pause Pinterest" / "Pause reminders" menu actions
 * into their respective workers via shared mutable flags.
 */

import SysTray from 'systray2';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { exec } from 'node:child_process';
import { trayColor } from './workerStatus.js';
import { logger } from './logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ASSETS = path.resolve(__dirname, 'assets');

/** @returns {string} */
export function pickIconPath() {
  return path.join(ASSETS, `tray-${trayColor()}.png`);
}

/** Shared flags Plans B/D mutate via the menu. */
export const trayFlags = {
  pinterestPaused: false,
  remindersPaused: false,
};

/**
 * Start the tray icon. Resolves once the systray2 helper is ready.
 *
 * @returns {Promise<SysTray>}
 */
export async function startTray() {
  const iconPath = pickIconPath();
  const icon = fs.readFileSync(iconPath).toString('base64');

  const tray = new SysTray({
    menu: {
      icon,
      title: 'Rooster Dashboard',
      tooltip: 'Publishing Ops Dashboard',
      items: [
        { title: 'Open dashboard',   tooltip: 'http://localhost:5000', checked: false, enabled: true },
        { title: 'Pause Pinterest',  tooltip: 'Toggle Pinterest poster', checked: false, enabled: true },
        { title: 'Pause reminders',  tooltip: 'Toggle reminders worker', checked: false, enabled: true },
        { title: 'Restart server',   tooltip: 'Respawn node server.js', checked: false, enabled: true },
        { title: 'Quit',             tooltip: 'Stop dashboard',         checked: false, enabled: true },
      ],
    },
    debug: false,
    copyDir: true,
  });

  tray.onClick((action) => {
    switch (action.seq_id) {
      case 0:
        openDashboardInBrowser();
        break;
      case 1:
        trayFlags.pinterestPaused = !trayFlags.pinterestPaused;
        logger.info({ paused: trayFlags.pinterestPaused }, 'pinterest pause toggled');
        break;
      case 2:
        trayFlags.remindersPaused = !trayFlags.remindersPaused;
        logger.info({ paused: trayFlags.remindersPaused }, 'reminders pause toggled');
        break;
      case 3:
        logger.info('restart-server menu item clicked');
        process.exit(2); // Task Scheduler / supervisor will respawn.
        break;
      case 4:
        logger.info('tray quit');
        tray.kill();
        process.exit(0);
        break;
    }
  });

  await tray.ready();
  return tray;
}

function openDashboardInBrowser() {
  const url = `http://localhost:${process.env.PORT || 5000}`;
  if (process.platform === 'win32') {
    exec(`start "" "${url}"`);
  } else if (process.platform === 'darwin') {
    exec(`open "${url}"`);
  } else {
    exec(`xdg-open "${url}"`);
  }
}
```

- [ ] **Step 5: Wire `startTray()` into `server.js`**

Edit `web.ui/backend/server.js`. Find the `app.listen` block at the bottom and replace with:

```javascript
import { startTray } from './tray.js';

const server = PORT === 0
  ? null
  : app.listen(PORT, '127.0.0.1', async () => {
      logger.info({ port: PORT }, 'dashboard server listening');
      if (process.env.ROOSTER_SKIP_TRAY !== '1') {
        try {
          await startTray();
        } catch (err) {
          logger.warn({ err: err.message }, 'tray failed to start');
        }
      }
    });
```

The `import { startTray }` line goes near the top with the other imports.

- [ ] **Step 6: Run tests, confirm pass**

```bash
cd web.ui/backend && npm test -- tray.test.js
```

Expected: both tray tests pass.

- [ ] **Step 7: Smoke-test the tray manually**

```bash
cd web.ui/backend && node server.js
```

Expected: green tray icon appears in the Windows system tray. Right-click → see 5 menu items. Click "Quit" to exit.

---

### Task 16: Nightly SQLite backup cron + log prune

**Files:**
- Create: `web.ui/backend/backupCron.js`
- Create: `web.ui/backend/__tests__/backupCron.test.js`
- Modify: `web.ui/backend/server.js` (call `startBackupCron()`)

- [ ] **Step 1: Write the failing test**

Create `web.ui/backend/__tests__/backupCron.test.js`:

```javascript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openDb, _resetForTests } from '../db.js';

let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rooster-backup-'));
  process.env.ROOSTER_DB_PATH = path.join(tmpDir, 'dashboard.db');
  process.env.ROOSTER_BACKUP_DIR = path.join(tmpDir, '.backups');
  process.env.ROOSTER_LOG_DIR = path.join(tmpDir, 'logs');
  _resetForTests();
  openDb(); // create DB + tables
});

afterEach(() => {
  _resetForTests();
  fs.rmSync(tmpDir, { recursive: true, force: true });
  delete process.env.ROOSTER_DB_PATH;
  delete process.env.ROOSTER_BACKUP_DIR;
  delete process.env.ROOSTER_LOG_DIR;
});

describe('backupCron', () => {
  it('runOnce writes a dated backup file', async () => {
    const { runBackupOnce } = await import(`../backupCron.js?cachebust=${Date.now()}`);
    await runBackupOnce();
    const files = fs.readdirSync(process.env.ROOSTER_BACKUP_DIR);
    expect(files.some((f) => /^dashboard-\d{4}-\d{2}-\d{2}\.db$/.test(f))).toBe(true);
  });

  it('prunes backups older than 14 days', async () => {
    fs.mkdirSync(process.env.ROOSTER_BACKUP_DIR, { recursive: true });
    const stale = path.join(process.env.ROOSTER_BACKUP_DIR, 'dashboard-2024-01-01.db');
    fs.writeFileSync(stale, 'x');
    // Backdate mtime so the prune sees it as stale.
    const old = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
    fs.utimesSync(stale, old, old);
    const { pruneOldBackups } = await import(`../backupCron.js?cachebust=${Date.now()}`);
    pruneOldBackups(14);
    expect(fs.existsSync(stale)).toBe(false);
  });
});
```

- [ ] **Step 2: Run, confirm failure**

```bash
cd web.ui/backend && npm test -- backupCron.test.js
```

- [ ] **Step 3: Implement `backupCron.js`**

Create `web.ui/backend/backupCron.js`:

```javascript
/**
 * Nightly SQLite backup + log prune. Runs at 03:00 local via node-cron.
 *
 * Files: data/.backups/dashboard-YYYY-MM-DD.db (14-day retention).
 * Logs:  pruned to 30-day retention by logger.pruneOldLogs.
 */

import cron from 'node-cron';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from './db.js';
import { logger, pruneOldLogs } from './logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** @returns {string} */
function backupDir() {
  if (process.env.ROOSTER_BACKUP_DIR) {
    return path.resolve(process.env.ROOSTER_BACKUP_DIR);
  }
  return path.resolve(__dirname, '..', '..', 'data', '.backups');
}

/**
 * Take a `.backup` of the live DB to a dated file.
 * @returns {Promise<string>} Absolute path to the backup file.
 */
export async function runBackupOnce() {
  const dir = backupDir();
  fs.mkdirSync(dir, { recursive: true });
  const date = new Date().toISOString().slice(0, 10);
  const dest = path.join(dir, `dashboard-${date}.db`);
  const db = openDb();
  await db.backup(dest);
  logger.info({ dest }, 'sqlite backup written');
  return dest;
}

/**
 * Delete dated backups older than `keepDays`.
 * @param {number} keepDays
 */
export function pruneOldBackups(keepDays = 14) {
  const dir = backupDir();
  if (!fs.existsSync(dir)) return;
  const cutoff = Date.now() - keepDays * 24 * 60 * 60 * 1000;
  for (const file of fs.readdirSync(dir)) {
    if (!/^dashboard-\d{4}-\d{2}-\d{2}\.db$/.test(file)) continue;
    const full = path.join(dir, file);
    const stat = fs.statSync(full);
    if (stat.mtimeMs < cutoff) {
      fs.unlinkSync(full);
      logger.info({ file }, 'pruned stale backup');
    }
  }
}

/** Register the 03:00 daily cron. Returns the task so callers can stop() in tests. */
export function startBackupCron() {
  return cron.schedule('0 3 * * *', async () => {
    try {
      await runBackupOnce();
      pruneOldBackups(14);
      pruneOldLogs(30);
    } catch (err) {
      logger.error({ err: err.message }, 'backup cron failed');
    }
  });
}
```

- [ ] **Step 4: Wire into `server.js`**

In `web.ui/backend/server.js`, near other imports add:

```javascript
import { startBackupCron } from './backupCron.js';
```

Then inside the existing `app.listen` callback (just after `startTray()` block), add:

```javascript
if (process.env.ROOSTER_SKIP_CRON !== '1') {
  startBackupCron();
}
```

- [ ] **Step 5: Run tests, confirm pass**

```bash
cd web.ui/backend && npm test -- backupCron.test.js
```

Expected: both backup tests pass.

---

### Task 17: React Router shell — empty pages for all 10 routes

**Files:**
- Modify: `web.ui/frontend-react/src/App.tsx`
- Create: `web.ui/frontend-react/src/pages/Home.tsx`
- Create: `web.ui/frontend-react/src/pages/KdpCatalog.tsx`
- Create: `web.ui/frontend-react/src/pages/KdpDetail.tsx`
- Create: `web.ui/frontend-react/src/pages/EtsyCatalog.tsx`
- Create: `web.ui/frontend-react/src/pages/EtsyDetail.tsx`
- Create: `web.ui/frontend-react/src/pages/Plans.tsx`
- Create: `web.ui/frontend-react/src/pages/Calendar.tsx`
- Create: `web.ui/frontend-react/src/pages/Pinterest.tsx`
- Create: `web.ui/frontend-react/src/pages/Profile.tsx`
- Create: `web.ui/frontend-react/src/pages/Help.tsx`
- Create: `web.ui/frontend-react/src/components/Sidebar.tsx`
- Create: `web.ui/frontend-react/src/components/TopBar.tsx`
- Create: `web.ui/frontend-react/src/components/HelpDrawer.tsx`
- Create: `web.ui/frontend-react/src/hooks/useSseEvents.ts`
- Create: `web.ui/frontend-react/src/styles/shell.css`

- [ ] **Step 1: Create the SSE hook**

Create `web.ui/frontend-react/src/hooks/useSseEvents.ts`:

```typescript
import { useEffect, useState, useRef } from 'react';

export interface DashboardEvent {
  kind: string;
  payload: Record<string, unknown>;
  occurred_at: string;
}

export interface SseState {
  connected: boolean;
  lastEvent: DashboardEvent | null;
}

/**
 * Subscribe to /api/events. Returns connection state and the most recent
 * event. Plans B-E build domain-specific hooks on top of this (e.g.
 * useKdpBooks listens for kdp:* events and refetches).
 */
export function useSseEvents(): SseState {
  const [connected, setConnected] = useState(false);
  const [lastEvent, setLastEvent] = useState<DashboardEvent | null>(null);
  const sourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    const es = new EventSource('/api/events');
    sourceRef.current = es;

    es.onopen = () => setConnected(true);
    es.onerror = () => setConnected(false);

    // Listen to every channel we know about. New channels added by Plans B-E
    // should add a line here.
    const channels = [
      'kdp:new-book', 'kdp:status-changed', 'kdp:published',
      'etsy:synced', 'etsy:status-changed', 'etsy:sale-detected',
      'pinterest:pin-scheduled', 'pinterest:pin-posted',
      'pinterest:pin-failed', 'pinterest:login-required',
      'reminder:fired', 'reminder:dismissed', 'reminder:failed',
      'system:worker-heartbeat', 'system:worker-error', 'system:tray-state-changed',
    ];
    const handlers: Array<[string, (e: MessageEvent) => void]> = channels.map((kind) => {
      const fn = (e: MessageEvent) => {
        try {
          const data = JSON.parse(e.data);
          setLastEvent({ kind, payload: data.payload, occurred_at: data.occurred_at });
        } catch {
          /* ignore malformed */
        }
      };
      es.addEventListener(kind, fn as EventListener);
      return [kind, fn];
    });

    return () => {
      for (const [kind, fn] of handlers) es.removeEventListener(kind, fn as EventListener);
      es.close();
    };
  }, []);

  return { connected, lastEvent };
}
```

- [ ] **Step 2: Create the global-shell components**

Create `web.ui/frontend-react/src/components/Sidebar.tsx`:

```typescript
import { NavLink } from 'react-router-dom';
import './../styles/shell.css';

const LINKS: Array<{ to: string; label: string; icon: string }> = [
  { to: '/',          label: 'Home',      icon: '🏠' },
  { to: '/kdp',       label: 'KDP',       icon: '📚' },
  { to: '/etsy',      label: 'Etsy',      icon: '🛍️' },
  { to: '/plans',     label: 'Plans',     icon: '🗺️' },
  { to: '/calendar',  label: 'Calendar',  icon: '📅' },
  { to: '/pinterest', label: 'Pinterest', icon: '📌' },
  { to: '/profile',   label: 'Profile',   icon: '👤' },
  { to: '/help',      label: 'Help',      icon: '❓' },
];

export default function Sidebar() {
  return (
    <nav className="sidebar" aria-label="Main navigation">
      <div className="sidebar-logo">🐓 Rooster</div>
      <ul>
        {LINKS.map((l) => (
          <li key={l.to}>
            <NavLink
              to={l.to}
              end={l.to === '/'}
              className={({ isActive }) => `sidebar-link${isActive ? ' active' : ''}`}
            >
              <span className="sidebar-icon" aria-hidden="true">{l.icon}</span>
              <span>{l.label}</span>
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
```

Create `web.ui/frontend-react/src/components/TopBar.tsx`:

```typescript
import { useSseEvents } from '../hooks/useSseEvents';
import './../styles/shell.css';

interface Props {
  pendingRemindersCount?: number;
}

/**
 * Top bar with SSE status dot + reminder-bell badge. The badge count is
 * passed in from a higher-level provider in Plans C; Commit 2 wires the
 * prop but defaults to 0.
 */
export default function TopBar({ pendingRemindersCount = 0 }: Props) {
  const { connected } = useSseEvents();
  return (
    <header className="topbar">
      <div className="topbar-spacer" />
      <span
        className={`sse-dot ${connected ? 'sse-dot-ok' : 'sse-dot-down'}`}
        title={connected ? 'Live updates connected' : 'Reconnecting…'}
        aria-label={connected ? 'connected' : 'disconnected'}
      />
      <a className="bell" href="/" aria-label={`${pendingRemindersCount} pending reminders`}>
        🔔
        {pendingRemindersCount > 0 && (
          <span className="bell-badge">{pendingRemindersCount}</span>
        )}
      </a>
      <a className="profile-link" href="/profile">👤</a>
    </header>
  );
}
```

Create `web.ui/frontend-react/src/components/HelpDrawer.tsx`:

```typescript
import { useEffect, useState } from 'react';

interface Props {
  field: string | null;   // e.g. 'gmail_app_password'
  onClose: () => void;
}

/**
 * Side drawer that fetches /api/help/:field and renders the markdown as
 * raw text inside a <pre>. Plans B-E may upgrade to react-markdown if
 * they need links/images; for the scaffolding, raw text is sufficient.
 */
export default function HelpDrawer({ field, onClose }: Props) {
  const [body, setBody] = useState<string>('');
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!field) return;
    setBody('');
    setErr(null);
    fetch(`/api/help/${encodeURIComponent(field)}`)
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.text();
      })
      .then(setBody)
      .catch((e) => setErr(String(e)));
  }, [field]);

  if (!field) return null;
  return (
    <aside className="help-drawer" role="dialog" aria-label="Help">
      <button className="help-close" onClick={onClose} aria-label="Close help">×</button>
      <h2>{field.replace(/_/g, ' ')}</h2>
      {err && <p className="help-error">{err}</p>}
      <pre className="help-body">{body}</pre>
    </aside>
  );
}
```

- [ ] **Step 3: Create the 10 empty page components**

Create `web.ui/frontend-react/src/pages/Home.tsx`:

```typescript
export default function Home() {
  return (
    <section>
      <h1>Today</h1>
      <p>Home dashboard. Reminders / System Health / Recent activity arrive in Plan C.</p>
    </section>
  );
}
```

Create `web.ui/frontend-react/src/pages/KdpCatalog.tsx`:

```typescript
export default function KdpCatalog() {
  return (
    <section>
      <h1>KDP catalog</h1>
      <p>Catalog table arrives in Plan B.</p>
    </section>
  );
}
```

Create `web.ui/frontend-react/src/pages/KdpDetail.tsx`:

```typescript
import { useParams } from 'react-router-dom';

export default function KdpDetail() {
  const { slug } = useParams();
  return (
    <section>
      <h1>KDP book: {slug}</h1>
      <p>Detail page arrives in Plan B.</p>
    </section>
  );
}
```

Create `web.ui/frontend-react/src/pages/EtsyCatalog.tsx`:

```typescript
export default function EtsyCatalog() {
  return (
    <section>
      <h1>Etsy catalog</h1>
      <p>Listings table arrives in Plan B.</p>
    </section>
  );
}
```

Create `web.ui/frontend-react/src/pages/EtsyDetail.tsx`:

```typescript
import { useParams } from 'react-router-dom';

export default function EtsyDetail() {
  const { listingId } = useParams();
  return (
    <section>
      <h1>Etsy listing: {listingId}</h1>
      <p>Detail page arrives in Plan B.</p>
    </section>
  );
}
```

Create `web.ui/frontend-react/src/pages/Plans.tsx`:

```typescript
export default function Plans() {
  return (
    <section>
      <h1>Specs &amp; Implementation Plans</h1>
      <p>Two-column browser arrives in Plan E.</p>
    </section>
  );
}
```

Create `web.ui/frontend-react/src/pages/Calendar.tsx`:

```typescript
export default function Calendar() {
  return (
    <section>
      <h1>Calendar</h1>
      <p>FullCalendar view arrives in Plan E.</p>
    </section>
  );
}
```

Create `web.ui/frontend-react/src/pages/Pinterest.tsx`:

```typescript
export default function Pinterest() {
  return (
    <section>
      <h1>Pinterest</h1>
      <p>Queue + history + settings arrive in Plan D.</p>
    </section>
  );
}
```

Create `web.ui/frontend-react/src/pages/Profile.tsx`:

```typescript
export default function Profile() {
  return (
    <section>
      <h1>Profile</h1>
      <p>Profile editor arrives in Plan E.</p>
    </section>
  );
}
```

Create `web.ui/frontend-react/src/pages/Help.tsx`:

```typescript
export default function Help() {
  return (
    <section>
      <h1>Help</h1>
      <p>Help article index arrives in Plan E. One example article (gmail_app_password) ships in Commit 2.</p>
    </section>
  );
}
```

- [ ] **Step 4: Create `shell.css`**

Create `web.ui/frontend-react/src/styles/shell.css`:

```css
/* Global shell styles — sidebar + topbar + drawer.
   Plans B-E may add component CSS; this file defines only the chrome. */

:root {
  --sidebar-w: 220px;
  --topbar-h: 48px;
  --bg: #fafaf7;
  --fg: #1a1a1a;
  --accent: #0e7c66;
  --muted: #6b7280;
  --border: #e5e7eb;
  --danger: #ef4444;
  --warn: #f59e0b;
  --ok: #10b981;
}

* { box-sizing: border-box; }
body { margin: 0; font-family: system-ui, -apple-system, sans-serif; color: var(--fg); background: var(--bg); }

.app-shell { display: grid; grid-template-columns: var(--sidebar-w) 1fr; grid-template-rows: var(--topbar-h) 1fr; min-height: 100vh; }
.sidebar { grid-row: 1 / span 2; background: #fff; border-right: 1px solid var(--border); padding: 1rem 0.5rem; }
.sidebar-logo { font-size: 1.1rem; font-weight: 600; padding: 0.5rem 0.75rem 1rem; }
.sidebar ul { list-style: none; margin: 0; padding: 0; }
.sidebar-link { display: flex; align-items: center; gap: 0.6rem; padding: 0.5rem 0.75rem; border-radius: 6px; color: var(--fg); text-decoration: none; font-size: 0.95rem; }
.sidebar-link:hover { background: #f3f4f6; }
.sidebar-link.active { background: var(--accent); color: white; }
.sidebar-icon { font-size: 1.05rem; }

.topbar { grid-column: 2; display: flex; align-items: center; gap: 1rem; padding: 0 1rem; border-bottom: 1px solid var(--border); background: #fff; }
.topbar-spacer { flex: 1; }
.sse-dot { width: 10px; height: 10px; border-radius: 50%; display: inline-block; }
.sse-dot-ok { background: var(--ok); }
.sse-dot-down { background: var(--danger); animation: pulse 1.2s ease-in-out infinite; }
@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }

.bell { position: relative; text-decoration: none; font-size: 1.2rem; }
.bell-badge { position: absolute; top: -6px; right: -10px; background: var(--danger); color: white; border-radius: 999px; font-size: 0.7rem; padding: 1px 5px; min-width: 16px; text-align: center; }
.profile-link { text-decoration: none; font-size: 1.2rem; }

.page { grid-column: 2; padding: 1.5rem; overflow: auto; }

.help-drawer { position: fixed; top: 0; right: 0; width: 380px; height: 100vh; background: #fff; border-left: 1px solid var(--border); padding: 1rem 1.25rem; box-shadow: -4px 0 12px rgba(0,0,0,0.06); z-index: 50; overflow-y: auto; }
.help-close { float: right; border: none; background: transparent; font-size: 1.5rem; cursor: pointer; }
.help-error { color: var(--danger); }
.help-body { white-space: pre-wrap; font-family: ui-monospace, monospace; font-size: 0.85rem; }
```

- [ ] **Step 5: Rewrite `App.tsx` with the router**

Replace `web.ui/frontend-react/src/App.tsx`:

```typescript
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import TopBar from './components/TopBar';
import Home from './pages/Home';
import KdpCatalog from './pages/KdpCatalog';
import KdpDetail from './pages/KdpDetail';
import EtsyCatalog from './pages/EtsyCatalog';
import EtsyDetail from './pages/EtsyDetail';
import Plans from './pages/Plans';
import Calendar from './pages/Calendar';
import Pinterest from './pages/Pinterest';
import Profile from './pages/Profile';
import Help from './pages/Help';
import './styles/shell.css';

export default function App() {
  return (
    <BrowserRouter>
      <div className="app-shell">
        <Sidebar />
        <TopBar />
        <main className="page">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/kdp" element={<KdpCatalog />} />
            <Route path="/kdp/:slug" element={<KdpDetail />} />
            <Route path="/etsy" element={<EtsyCatalog />} />
            <Route path="/etsy/:listingId" element={<EtsyDetail />} />
            <Route path="/plans" element={<Plans />} />
            <Route path="/calendar" element={<Calendar />} />
            <Route path="/pinterest" element={<Pinterest />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/help" element={<Help />} />
            <Route path="*" element={<Home />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}
```

- [ ] **Step 6: Delete the now-obsolete `App.css` (we use `shell.css`)**

```bash
git rm web.ui/frontend-react/src/App.css
```

- [ ] **Step 7: Build to verify**

```bash
cd web.ui/frontend-react && npm run build
```

Expected: build succeeds. Any TS error here means a stale import — find and fix.

- [ ] **Step 8: Smoke-test in the dev server**

```bash
cd web.ui/frontend-react && npm run dev
```

Open http://localhost:5173, click every sidebar link. Each route should render its placeholder page. Quit the dev server.

---

### Task 18: Help directory + example `gmail_app_password.md`

**Files:**
- Create: `web.ui/backend/help/gmail_app_password.md`
- Create: `web.ui/backend/help/screenshots/.gitkeep`
- Create: `web.ui/backend/__tests__/help_api.test.js`

- [ ] **Step 1: Write the failing test**

Create `web.ui/backend/__tests__/help_api.test.js`:

```javascript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { _resetForTests } from '../db.js';

let app;
let tmpDir;

beforeEach(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rooster-help-'));
  process.env.ROOSTER_DB_PATH = path.join(tmpDir, 'dashboard.db');
  process.env.PORT = '0';
  process.env.ROOSTER_SKIP_TRAY = '1';
  process.env.ROOSTER_SKIP_CRON = '1';
  _resetForTests();
  ({ app } = await import(`../server.js?cachebust=${Date.now()}`));
});

afterEach(() => {
  _resetForTests();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('/api/help/:field', () => {
  it('serves an existing markdown file', async () => {
    const res = await request(app).get('/api/help/gmail_app_password');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/markdown/);
    expect(res.text).toMatch(/Gmail App Password/);
  });

  it('404s for unknown fields', async () => {
    const res = await request(app).get('/api/help/does_not_exist');
    expect(res.status).toBe(404);
  });

  it('rejects path-traversal attempts', async () => {
    const res = await request(app).get('/api/help/..%2F..%2Fpackage');
    expect([400, 404]).toContain(res.status);
  });
});
```

- [ ] **Step 2: Run, confirm failure**

```bash
cd web.ui/backend && npm test -- help_api.test.js
```

Expected: 404 for `gmail_app_password` (the file doesn't exist yet).

- [ ] **Step 3: Create the markdown file**

Create `web.ui/backend/help/gmail_app_password.md`:

```markdown
# Gmail App Password

The dashboard uses Gmail SMTP to send reminder emails. Because two-factor
auth is on, you can't use your regular password — you need an **App
Password**.

## Steps

1. Go to https://myaccount.google.com/security
2. Confirm **2-Step Verification** is on. If not, turn it on first.
3. Open **App passwords** (https://myaccount.google.com/apppasswords).
4. Choose **Mail** as the app and **Other (custom name)** as the device.
5. Name it "Rooster Dashboard" and click **Generate**.
6. Copy the 16-character password Google shows you.
7. Paste it into `web.ui/backend/.env` as `GMAIL_APP_PASSWORD=...`.
8. Restart the server.

## If you ever rotate the password

Re-run steps 3–7 and update `.env`. The dashboard reads the env on boot.

## Troubleshooting

- **535-5.7.8 Username and Password not accepted** → the app password is
  wrong or stale. Generate a new one.
- **No email arriving** → check the toast still fires. If toast works but
  email doesn't, the SMTP credentials are bad — start at step 3.
```

- [ ] **Step 4: Create the screenshots directory placeholder**

Create `web.ui/backend/help/screenshots/.gitkeep` (empty file).

- [ ] **Step 5: Run tests, confirm pass**

```bash
cd web.ui/backend && npm test -- help_api.test.js
```

Expected: all 3 tests pass.

---

### Task 19: Autostart install/uninstall PowerShell scripts

**Files:**
- Create: `scripts/install-autostart.ps1`
- Create: `scripts/uninstall-autostart.ps1`
- Create: `web.ui/backend/__tests__/autostart.test.js` (file-content test only; we don't invoke schtasks from CI)

- [ ] **Step 1: Write the failing test**

Create `web.ui/backend/__tests__/autostart.test.js`:

```javascript
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const scriptsDir = path.resolve(__dirname, '..', '..', '..', 'scripts');

describe('autostart scripts', () => {
  it('install-autostart.ps1 exists and registers a logon task', () => {
    const p = path.join(scriptsDir, 'install-autostart.ps1');
    expect(fs.existsSync(p)).toBe(true);
    const src = fs.readFileSync(p, 'utf8');
    expect(src).toMatch(/Register-ScheduledTask/);
    expect(src).toMatch(/-AtLogOn/);
    expect(src).toMatch(/Rooster Dashboard/);
  });

  it('install-autostart.ps1 is idempotent (unregisters first)', () => {
    const src = fs.readFileSync(path.join(scriptsDir, 'install-autostart.ps1'), 'utf8');
    expect(src).toMatch(/Unregister-ScheduledTask/);
  });

  it('uninstall-autostart.ps1 exists and removes the task', () => {
    const p = path.join(scriptsDir, 'uninstall-autostart.ps1');
    expect(fs.existsSync(p)).toBe(true);
    const src = fs.readFileSync(p, 'utf8');
    expect(src).toMatch(/Unregister-ScheduledTask/);
    expect(src).toMatch(/Rooster Dashboard/);
  });
});
```

- [ ] **Step 2: Run, confirm failure**

```bash
cd web.ui/backend && npm test -- autostart.test.js
```

- [ ] **Step 3: Create `install-autostart.ps1`**

Create `scripts/install-autostart.ps1`:

```powershell
<#
.SYNOPSIS
  Register the Publishing Ops Dashboard to launch at user logon.

.DESCRIPTION
  Idempotent: if the task already exists, it is removed first. Re-runs
  cleanly. Uses `Limited` run level so no UAC elevation is required at logon.

.EXAMPLE
  PS> .\scripts\install-autostart.ps1
#>

$ErrorActionPreference = 'Stop'
$taskName = 'Rooster Dashboard'

# Resolve absolute paths so the task survives a moved repo.
$repoRoot = (Resolve-Path "$PSScriptRoot\..").Path
$serverJs = Join-Path $repoRoot 'web.ui\backend\server.js'
$workDir  = Join-Path $repoRoot 'web.ui\backend'

if (-not (Test-Path $serverJs)) {
    throw "server.js not found at $serverJs. Run from the repo root."
}

$node = (Get-Command node.exe -ErrorAction SilentlyContinue).Source
if (-not $node) {
    throw "node.exe not on PATH. Install Node 18+ first."
}

# Idempotency: remove any prior registration before creating the new one.
if (Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue) {
    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
    Write-Host "Removed existing task '$taskName' before re-registering."
}

$action = New-ScheduledTaskAction `
    -Execute $node `
    -Argument "`"$serverJs`"" `
    -WorkingDirectory $workDir

$trigger  = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$settings = New-ScheduledTaskSettingsSet `
    -StartWhenAvailable `
    -ExecutionTimeLimit ([TimeSpan]::Zero) `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries

Register-ScheduledTask `
    -TaskName $taskName `
    -Action $action `
    -Trigger $trigger `
    -Settings $settings `
    -RunLevel Limited | Out-Null

Write-Host "Registered '$taskName'. It will start on next logon."
Write-Host "  node:     $node"
Write-Host "  server:   $serverJs"
Write-Host "  workdir:  $workDir"
```

- [ ] **Step 4: Create `uninstall-autostart.ps1`**

Create `scripts/uninstall-autostart.ps1`:

```powershell
<#
.SYNOPSIS
  Remove the Publishing Ops Dashboard's logon task.

.DESCRIPTION
  Idempotent: succeeds whether the task exists or not.
#>

$ErrorActionPreference = 'Stop'
$taskName = 'Rooster Dashboard'

if (Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue) {
    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
    Write-Host "Unregistered task '$taskName'."
} else {
    Write-Host "Task '$taskName' was not registered. Nothing to do."
}
```

- [ ] **Step 5: Run tests, confirm pass**

```bash
cd web.ui/backend && npm test -- autostart.test.js
```

Expected: 3 tests pass.

- [ ] **Step 6: Verify scripts run interactively (optional sanity check)**

```powershell
.\scripts\install-autostart.ps1
Get-ScheduledTask -TaskName 'Rooster Dashboard' | Format-List TaskName, State
.\scripts\uninstall-autostart.ps1
```

Expected: task appears between the two scripts, then is gone.

---

### Task 20: Update CI workflow — drop agent tests

**Files:**
- Modify: `.github/workflows/web-ui-ci.yml`

- [ ] **Step 1: Replace the workflow file**

Replace the entire contents of `.github/workflows/web-ui-ci.yml`:

```yaml
name: web.ui CI

on:
  push:
    branches: [main]
    paths:
      - 'web.ui/**'
      - 'scripts/**'
      - '.github/workflows/web-ui-ci.yml'
  pull_request:
    branches: [main]
    paths:
      - 'web.ui/**'
      - 'scripts/**'
      - '.github/workflows/web-ui-ci.yml'

jobs:
  backend:
    name: Backend (Node)
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: web.ui/backend
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - name: Install
        run: npm install --no-audit --no-fund
      - name: Lint
        run: npm run lint
      - name: Type-check
        run: npm run typecheck
      - name: Test
        # Skip tray test on Linux runner — systray2 needs a display.
        # Skip cron real-time / autostart tests by env flags.
        env:
          ROOSTER_SKIP_TRAY: '1'
          ROOSTER_SKIP_CRON: '1'
        run: npm test

  frontend:
    name: Frontend (React)
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: web.ui/frontend-react
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - name: Install
        run: npm install --no-audit --no-fund
      - name: Lint
        run: npm run lint
      - name: Build
        run: npm run build
      - name: Install Playwright browsers
        run: npx playwright install --with-deps chromium
      # Plans B-E add `npm run test:e2e` here once they ship their first
      # e2e specs. Plan A intentionally has no e2e tests to run yet.
```

- [ ] **Step 2: Verify the YAML is valid**

```bash
cd web.ui/backend && node -e "const yaml = require('yaml'); console.log(yaml.parse(require('fs').readFileSync('../../.github/workflows/web-ui-ci.yml', 'utf8')).name)"
```

If `yaml` isn't installed locally, skip — GitHub will tell us if it's malformed on push.

- [ ] **Step 3: Confirm tray-test env flag is honored**

Re-run the tray test under the skip flag — it should still pass (the mock bypasses the platform check):

```bash
cd web.ui/backend && ROOSTER_SKIP_TRAY=1 npm test -- tray.test.js
```

(On Windows in PowerShell use `$env:ROOSTER_SKIP_TRAY='1'; npm test -- tray.test.js`.)

Expected: pass.

---

### Task 21: Full test pass + lint + typecheck

**Files:** none (verification only)

- [ ] **Step 1: Backend full suite**

```bash
cd web.ui/backend && npm run lint && npm run typecheck && npm test
```

Expected: lint clean, typecheck clean, all tests pass. Tests in scope at this point:

- `__tests__/server_smoke.test.js`
- `__tests__/imageGenerationService.test.js`
- `__tests__/db.test.js`
- `__tests__/events.test.js`
- `__tests__/status_api.test.js`
- `__tests__/logger.test.js`
- `__tests__/tray.test.js`
- `__tests__/backupCron.test.js`
- `__tests__/help_api.test.js`
- `__tests__/autostart.test.js`

- [ ] **Step 2: Frontend full suite**

```bash
cd web.ui/frontend-react && npm run lint && npm run build
```

Expected: clean.

- [ ] **Step 3: End-to-end smoke**

```bash
cd web.ui/backend && node server.js
```

Expected: server boots, green tray icon appears, log line `dashboard server listening` appears, navigating to http://localhost:5000 in a browser shows the Sidebar + TopBar + Home placeholder. Ctrl+C to stop.

If a `dist/` doesn't exist yet, `node server.js` says "React build not found" — run `cd web.ui/frontend-react && npm run build` first, then re-test.

---

### Task 22: Commit 2

**Files:** all of Tasks 9–21

- [ ] **Step 1: Review staged changes**

```bash
git status
git diff --stat HEAD
```

- [ ] **Step 2: Stage and commit**

```bash
git add web.ui/backend/db.js \
        web.ui/backend/events.js \
        web.ui/backend/workerStatus.js \
        web.ui/backend/logger.js \
        web.ui/backend/tray.js \
        web.ui/backend/backupCron.js \
        web.ui/backend/server.js \
        web.ui/backend/migrations/ \
        web.ui/backend/help/ \
        web.ui/backend/assets/ \
        web.ui/backend/__tests__/db.test.js \
        web.ui/backend/__tests__/events.test.js \
        web.ui/backend/__tests__/status_api.test.js \
        web.ui/backend/__tests__/logger.test.js \
        web.ui/backend/__tests__/tray.test.js \
        web.ui/backend/__tests__/backupCron.test.js \
        web.ui/backend/__tests__/help_api.test.js \
        web.ui/backend/__tests__/autostart.test.js \
        web.ui/backend/package.json \
        web.ui/backend/package-lock.json \
        web.ui/frontend-react/src/App.tsx \
        web.ui/frontend-react/src/pages/ \
        web.ui/frontend-react/src/components/Sidebar.tsx \
        web.ui/frontend-react/src/components/TopBar.tsx \
        web.ui/frontend-react/src/components/HelpDrawer.tsx \
        web.ui/frontend-react/src/hooks/useSseEvents.ts \
        web.ui/frontend-react/src/styles/ \
        web.ui/frontend-react/package.json \
        web.ui/frontend-react/package-lock.json \
        scripts/install-autostart.ps1 \
        scripts/uninstall-autostart.ps1 \
        .github/workflows/web-ui-ci.yml
git add -u web.ui/frontend-react/src/App.css

git commit -m "feat(dashboard): scaffolding — SQLite + SSE + tray + autostart + router shell"
```

- [ ] **Step 3: Verify**

```bash
git log -2 --stat
```

Expected: two commits — `chore(archive): ...` and `feat(dashboard): scaffolding ...`. The dashboard app boots into a working empty shell ready for Plans B–E to build on top of.

---

## Done criteria for Plan A

- [ ] Both commits land.
- [ ] `cd web.ui/backend && npm test` is green (10 test files).
- [ ] `cd web.ui/frontend-react && npm run build` is green.
- [ ] `node web.ui/backend/server.js` boots; tray icon appears; all 10 routes return 200; `/api/events` streams a heartbeat; `/api/status` returns `{}`; `/api/help/gmail_app_password` returns markdown.
- [ ] `scripts/install-autostart.ps1` and `scripts/uninstall-autostart.ps1` are idempotent.
- [ ] Nothing under `web.ui/.archive-kanban/` is imported by live code (`git grep -r 'archive-kanban' web.ui/backend web.ui/frontend-react/src` returns empty).

Plans B–E begin from this state.
