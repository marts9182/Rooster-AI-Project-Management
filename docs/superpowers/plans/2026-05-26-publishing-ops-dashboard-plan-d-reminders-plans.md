# Publishing Ops Dashboard â€” Plan D: Reminders + Plans browser

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Prerequisites:** Plan A merged. Plans B and C can be merged in any order before, after, or in parallel.

**Goal:** Stand up the reminder scheduler (Windows toast + Gmail email, node-cron, 60-second ticks) and the read-only /plans browser over docs/superpowers/specs/ and docs/superpowers/plans/.

**Architecture:** reminders/ module ticks every minute, fires due rows on the channels they specify, and emits SSE on every fire/fail. plans/ module rescans the docs folders on demand and computes progress from checkbox counts.

**Tech Stack:** Express, better-sqlite3, node-cron, node-notifier (toast), nodemailer + Gmail SMTP (email), gray-matter (frontmatter), react-markdown, Vitest, supertest.

**Spec reference:** [`docs/superpowers/specs/2026-05-26-publishing-ops-dashboard-design.md`](../specs/2026-05-26-publishing-ops-dashboard-design.md)

---

## Pre-flight context (read once)

Repo root: `C:/Sandbox/AIProjectManagement/Rooster-AI-Project-Management`. All paths below are repo-relative unless prefixed with `C:/`. Always pass absolute paths to Bash and to `git`.

**Run backend tests:**
```bash
cd web.ui/backend
npm test                                 # full vitest suite
npm test -- reminders                    # one module
npm test -- --run plans/scanner.test.js  # one file
```

**Run frontend tests:**
```bash
cd web.ui/frontend-react
npm test
```

**Inherited from Plan A (assume present):**
- `web.ui/backend/db.js` â€” better-sqlite3 wrapper exporting `openDb()` (opens WAL-mode SQLite + runs migrations).
- `web.ui/backend/events.js` â€” exports `recordEvent(kind, payload)`, which BOTH inserts a row into the `events` table AND fans out to SSE subscribers (single call covers both â€” there is no separate broadcast export). Also exports `subscribe(fn)` and `replayRecent(n)`.
- `web.ui/backend/workerStatus.js` â€” exports the procedural functions `setWorkerHeartbeat(worker: string)`, `setWorkerError(worker: string, message: string)`, `getAllStatuses()`, and `trayColor()`. Workers call these directly with their own name string (no factory, no returned handle).
- `web.ui/backend/migrations/0001_*.sql` already created the `reminders`, `events`, and `profile` tables per spec Â§4.
- `web.ui/backend/server.js` mounts routes via `app.use('/api/...', router)` and boots workers after `app.listen()`.
- `web.ui/frontend-react/src/App.tsx` has React Router with a placeholder `/plans` page component at `src/pages/PlansPage.tsx` that currently renders only `<h1>Plans</h1>`.
- `web.ui/frontend-react/src/components/TopBar.tsx` already renders a bell icon with hard-coded count `0` and an empty `onClick` â€” you wire it.
- A typed SSE hook `src/hooks/useEvents.ts` exposes `useEventStream(kindPrefix: string, onEvent: (payload) => void)`.

**Assumed from Plans B and C (may or may not be merged):**
- Plan B (KDP) may insert `reminders` rows with `source_kind='kdp.book'` and a `payload_json` shaped `{slug, asin, kind: "day30"}`.
- Plan C (Etsy) may insert reminders with `source_kind='etsy.listing'` and `payload_json` shaped `{etsy_listing_id, gate: "day30"|"day60"|"day90"}`.
- Your scheduler is agnostic to source â€” it only reads `title`, `body`, `channel`, `due_at`. Source linkage is informational, surfaced in the popover.

**Help drawer policy (per scope):** Plan B's task list creates per-field markdown files under `web.ui/backend/help/`. Plan D adds `gmail_app_password.md` ONLY if Plan B did not. See Task 11 for the conditional.

**Baseline before starting:** confirm `cd web.ui/backend && npm test 2>&1 | tail -5` reports the Plan A baseline pass count (record the number; new tasks grow it). If Plan B/C are merged, that number is higher; just record what `tail -5` says and grow from there.

---

## File structure

**New backend files:**
- `web.ui/backend/reminders/scheduler.js`
- `web.ui/backend/reminders/toast.js`
- `web.ui/backend/reminders/email.js`
- `web.ui/backend/reminders/routes.js`
- `web.ui/backend/reminders/repo.js`
- `web.ui/backend/plans/scanner.js`
- `web.ui/backend/plans/routes.js`

**New backend test files:**
- `web.ui/backend/__tests__/reminders/scheduler.test.js`
- `web.ui/backend/__tests__/reminders/toast.test.js`
- `web.ui/backend/__tests__/reminders/email.test.js`
- `web.ui/backend/__tests__/reminders/routes.test.js`
- `web.ui/backend/__tests__/reminders/repo.test.js`
- `web.ui/backend/__tests__/plans/scanner.test.js`
- `web.ui/backend/__tests__/plans/routes.test.js`

**New frontend files:**
- `web.ui/frontend-react/src/components/BellPopover.tsx`
- `web.ui/frontend-react/src/components/BellPopover.test.tsx`
- `web.ui/frontend-react/src/pages/PlansPage.tsx` (replace placeholder)
- `web.ui/frontend-react/src/pages/PlansPage.test.tsx`
- `web.ui/frontend-react/src/pages/PlanDetailModal.tsx`
- `web.ui/frontend-react/src/services/reminders.ts`
- `web.ui/frontend-react/src/services/plans.ts`

**Modified backend files:**
- `web.ui/backend/server.js` â€” mount reminder and plans routes; boot scheduler.
- `web.ui/backend/package.json` â€” add `node-cron`, `node-notifier`, `nodemailer`, `gray-matter` to `dependencies`.

**Modified frontend files:**
- `web.ui/frontend-react/src/components/TopBar.tsx` â€” wire bell to live count + popover.
- `web.ui/frontend-react/package.json` â€” add `react-markdown`, `remark-gfm`.

**Conditional new file (Task 11):**
- `web.ui/backend/help/gmail_app_password.md`

---

## Task 1: Install backend dependencies

**Files:**
- Modify: `web.ui/backend/package.json`

- [x] **Step 1: Install packages**

```bash
cd C:/Sandbox/AIProjectManagement/Rooster-AI-Project-Management/web.ui/backend
npm install --save node-cron@3.0.3 node-notifier@10.0.1 nodemailer@6.9.13 gray-matter@4.0.3
```

Expected: `package.json` `dependencies` now contains those four entries; `npm install` reports `added N packages` with no peer-dependency errors. If you see a `node-notifier` install warning about optional native build, that is normal on Windows â€” `node-notifier` ships a prebuilt SnoreToast binary.

- [x] **Step 2: Verify dependencies resolve**

```bash
node -e "console.log(require('node-cron').validate('* * * * *'))"
node -e "console.log(typeof require('node-notifier').notify)"
node -e "console.log(typeof require('nodemailer').createTransport)"
node -e "console.log(typeof require('gray-matter'))"
```

Expected output (in order):
```
true
function
function
function
```

- [x] **Step 3: Commit**

```bash
git -C C:/Sandbox/AIProjectManagement/Rooster-AI-Project-Management add web.ui/backend/package.json web.ui/backend/package-lock.json
git -C C:/Sandbox/AIProjectManagement/Rooster-AI-Project-Management commit -m "build(reminders): add node-cron, node-notifier, nodemailer, gray-matter"
```

---

## Task 2: Reminders repo (SQL helpers)

**Files:**
- Create: `web.ui/backend/reminders/repo.js`
- Create: `web.ui/backend/__tests__/reminders/repo.test.js`

- [x] **Step 1: Write failing tests**

Create `web.ui/backend/__tests__/reminders/repo.test.js`:

```javascript
import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import {
  insertReminder,
  listPending,
  listByStatus,
  markFired,
  markFailed,
  dismiss,
  snooze,
  getById,
  countPending,
} from '../../reminders/repo.js';

/** @returns {import('better-sqlite3').Database} */
function makeDb() {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE reminders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      body TEXT,
      due_at TEXT NOT NULL,
      channel TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('pending','fired','dismissed','failed')),
      source_kind TEXT,
      source_id INTEGER,
      payload_json TEXT,
      fired_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX idx_reminders_due ON reminders(status, due_at);
  `);
  return db;
}

describe('reminders/repo', () => {
  /** @type {import('better-sqlite3').Database} */
  let db;
  beforeEach(() => {
    db = makeDb();
  });

  it('insertReminder returns id and persists row', () => {
    const id = insertReminder(db, {
      title: 'Test',
      body: 'Hello',
      due_at: '2026-05-26T12:00:00Z',
      channel: 'both',
      source_kind: 'manual',
    });
    expect(id).toBe(1);
    const row = db.prepare('SELECT * FROM reminders WHERE id = ?').get(id);
    expect(row.title).toBe('Test');
    expect(row.status).toBe('pending');
    expect(row.channel).toBe('both');
  });

  it('listPending returns only pending rows due now or earlier', () => {
    const past = '2020-01-01T00:00:00Z';
    const future = '2099-01-01T00:00:00Z';
    insertReminder(db, { title: 'past-pending', due_at: past, channel: 'toast' });
    insertReminder(db, { title: 'future-pending', due_at: future, channel: 'toast' });
    const firedId = insertReminder(db, { title: 'past-fired', due_at: past, channel: 'toast' });
    markFired(db, firedId);
    const rows = listPending(db, '2026-05-26T12:00:00Z');
    expect(rows.map(r => r.title)).toEqual(['past-pending']);
  });

  it('markFired sets status and fired_at', () => {
    const id = insertReminder(db, { title: 't', due_at: '2020-01-01T00:00:00Z', channel: 'toast' });
    markFired(db, id);
    const row = getById(db, id);
    expect(row.status).toBe('fired');
    expect(row.fired_at).toMatch(/^\d{4}-\d{2}-\d{2}/);
  });

  it('markFailed sets status to failed', () => {
    const id = insertReminder(db, { title: 't', due_at: '2020-01-01T00:00:00Z', channel: 'toast' });
    markFailed(db, id);
    expect(getById(db, id).status).toBe('failed');
  });

  it('dismiss sets status to dismissed', () => {
    const id = insertReminder(db, { title: 't', due_at: '2099-01-01T00:00:00Z', channel: 'toast' });
    dismiss(db, id);
    expect(getById(db, id).status).toBe('dismissed');
  });

  it('snooze pushes due_at into the future and keeps status pending', () => {
    const id = insertReminder(db, { title: 't', due_at: '2020-01-01T00:00:00Z', channel: 'toast' });
    const newDue = '2030-06-01T10:00:00Z';
    snooze(db, id, newDue);
    const row = getById(db, id);
    expect(row.due_at).toBe(newDue);
    expect(row.status).toBe('pending');
  });

  it('countPending counts rows with status=pending regardless of due_at', () => {
    insertReminder(db, { title: 'a', due_at: '2020-01-01T00:00:00Z', channel: 'toast' });
    insertReminder(db, { title: 'b', due_at: '2099-01-01T00:00:00Z', channel: 'toast' });
    expect(countPending(db)).toBe(2);
  });

  it('listByStatus filters and orders by due_at ASC', () => {
    insertReminder(db, { title: 'b', due_at: '2026-02-01T00:00:00Z', channel: 'toast' });
    insertReminder(db, { title: 'a', due_at: '2026-01-01T00:00:00Z', channel: 'toast' });
    const rows = listByStatus(db, 'pending');
    expect(rows.map(r => r.title)).toEqual(['a', 'b']);
  });
});
```

- [x] **Step 2: Run test to confirm failure**

```bash
cd C:/Sandbox/AIProjectManagement/Rooster-AI-Project-Management/web.ui/backend
npm test -- --run reminders/repo.test.js 2>&1 | tail -10
```
Expected: `Cannot find module '../../reminders/repo.js'` or all tests fail with import error.

- [x] **Step 3: Implement the repo**

Create `web.ui/backend/reminders/repo.js`:

```javascript
/**
 * @file Small SQL helper layer for the `reminders` table.
 * Pure functions that take a better-sqlite3 Database handle. No I/O beyond SQL.
 */

/**
 * @typedef {Object} ReminderRow
 * @property {number} id
 * @property {string} title
 * @property {string|null} body
 * @property {string} due_at      ISO datetime
 * @property {'toast'|'email'|'both'} channel
 * @property {'pending'|'fired'|'dismissed'|'failed'} status
 * @property {string|null} source_kind
 * @property {number|null} source_id
 * @property {string|null} payload_json
 * @property {string|null} fired_at
 * @property {string} created_at
 */

/**
 * @typedef {Object} NewReminder
 * @property {string} title
 * @property {string} [body]
 * @property {string} due_at
 * @property {'toast'|'email'|'both'} channel
 * @property {string} [source_kind]
 * @property {number} [source_id]
 * @property {string} [payload_json]
 */

/**
 * Insert a new pending reminder. Returns the new row id.
 * @param {import('better-sqlite3').Database} db
 * @param {NewReminder} input
 * @returns {number}
 */
export function insertReminder(db, input) {
  const stmt = db.prepare(`
    INSERT INTO reminders (title, body, due_at, channel, status, source_kind, source_id, payload_json)
    VALUES (@title, @body, @due_at, @channel, 'pending', @source_kind, @source_id, @payload_json)
  `);
  const info = stmt.run({
    title: input.title,
    body: input.body ?? null,
    due_at: input.due_at,
    channel: input.channel,
    source_kind: input.source_kind ?? null,
    source_id: input.source_id ?? null,
    payload_json: input.payload_json ?? null,
  });
  return Number(info.lastInsertRowid);
}

/**
 * Pending reminders whose due_at is <= the given ISO timestamp.
 * Ordered by due_at ASC for stable fire order.
 * @param {import('better-sqlite3').Database} db
 * @param {string} nowIso
 * @returns {ReminderRow[]}
 */
export function listPending(db, nowIso) {
  return db
    .prepare(`SELECT * FROM reminders WHERE status = 'pending' AND due_at <= ? ORDER BY due_at ASC`)
    .all(nowIso);
}

/**
 * All reminders matching the status, ordered by due_at ASC.
 * @param {import('better-sqlite3').Database} db
 * @param {'pending'|'fired'|'dismissed'|'failed'} status
 * @returns {ReminderRow[]}
 */
export function listByStatus(db, status) {
  return db
    .prepare(`SELECT * FROM reminders WHERE status = ? ORDER BY due_at ASC`)
    .all(status);
}

/**
 * @param {import('better-sqlite3').Database} db
 * @param {number} id
 * @returns {ReminderRow|undefined}
 */
export function getById(db, id) {
  return db.prepare(`SELECT * FROM reminders WHERE id = ?`).get(id);
}

/**
 * @param {import('better-sqlite3').Database} db
 * @param {number} id
 */
export function markFired(db, id) {
  db.prepare(`UPDATE reminders SET status='fired', fired_at=datetime('now') WHERE id = ?`).run(id);
}

/**
 * @param {import('better-sqlite3').Database} db
 * @param {number} id
 */
export function markFailed(db, id) {
  db.prepare(`UPDATE reminders SET status='failed' WHERE id = ?`).run(id);
}

/**
 * @param {import('better-sqlite3').Database} db
 * @param {number} id
 */
export function dismiss(db, id) {
  db.prepare(`UPDATE reminders SET status='dismissed' WHERE id = ?`).run(id);
}

/**
 * Set a new due_at and (re)set status to pending.
 * @param {import('better-sqlite3').Database} db
 * @param {number} id
 * @param {string} newDueIso
 */
export function snooze(db, id, newDueIso) {
  db.prepare(`UPDATE reminders SET due_at = ?, status = 'pending' WHERE id = ?`).run(newDueIso, id);
}

/**
 * @param {import('better-sqlite3').Database} db
 * @returns {number}
 */
export function countPending(db) {
  const row = db.prepare(`SELECT COUNT(*) AS n FROM reminders WHERE status = 'pending'`).get();
  return row.n;
}
```

- [x] **Step 4: Run tests to confirm pass**

```bash
npm test -- --run reminders/repo.test.js 2>&1 | tail -10
```
Expected: 8 passed (`repo.test.js`).

- [x] **Step 5: Commit**

```bash
git -C C:/Sandbox/AIProjectManagement/Rooster-AI-Project-Management add web.ui/backend/reminders/repo.js web.ui/backend/__tests__/reminders/repo.test.js
git -C C:/Sandbox/AIProjectManagement/Rooster-AI-Project-Management commit -m "feat(reminders): SQL repo for reminders table (insert/list/fire/dismiss/snooze)"
```

---

## Task 3: Toast delivery wrapper

**Files:**
- Create: `web.ui/backend/reminders/toast.js`
- Create: `web.ui/backend/__tests__/reminders/toast.test.js`

- [x] **Step 1: Write failing tests**

Create `web.ui/backend/__tests__/reminders/toast.test.js`:

```javascript
import { describe, it, expect, vi } from 'vitest';
import { sendToast } from '../../reminders/toast.js';

describe('reminders/toast', () => {
  it('calls notifier.notify with title, message, icon', async () => {
    const notify = vi.fn((opts, cb) => cb(null, 'ok'));
    const notifierFactory = () => ({ notify });
    const result = await sendToast(
      { title: 'KDP Day-30 check', body: 'Sudoku Vol 1' },
      { notifierFactory },
    );
    expect(notify).toHaveBeenCalledTimes(1);
    const args = notify.mock.calls[0][0];
    expect(args.title).toBe('KDP Day-30 check');
    expect(args.message).toBe('Sudoku Vol 1');
    expect(args.icon).toMatch(/rooster/);
    expect(result.ok).toBe(true);
  });

  it('rejects with error when notifier callback errors', async () => {
    const notify = vi.fn((opts, cb) => cb(new Error('SnoreToast missing')));
    const notifierFactory = () => ({ notify });
    await expect(
      sendToast({ title: 't', body: 'b' }, { notifierFactory }),
    ).rejects.toThrow('SnoreToast missing');
  });

  it('uses empty string for body when undefined', async () => {
    const notify = vi.fn((opts, cb) => cb(null, 'ok'));
    const notifierFactory = () => ({ notify });
    await sendToast({ title: 't' }, { notifierFactory });
    expect(notify.mock.calls[0][0].message).toBe('');
  });
});
```

- [x] **Step 2: Run test to confirm failure**

```bash
npm test -- --run reminders/toast.test.js 2>&1 | tail -10
```
Expected: `Cannot find module '../../reminders/toast.js'`.

- [x] **Step 3: Implement the wrapper**

Create `web.ui/backend/reminders/toast.js`:

```javascript
/**
 * @file Thin wrapper around node-notifier for Windows toast notifications.
 * Inject `notifierFactory` in tests; in production we use the real `node-notifier`.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import nodeNotifier from 'node-notifier';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * @typedef {Object} ToastInput
 * @property {string} title
 * @property {string} [body]
 *
 * @typedef {Object} ToastDeps
 * @property {() => { notify: (opts: object, cb: (err: Error|null, res?: unknown) => void) => void }} [notifierFactory]
 *
 * @typedef {Object} ToastResult
 * @property {true} ok
 */

const ICON_PATH = path.resolve(__dirname, '..', 'assets', 'rooster-icon.png');

/**
 * Fire one Windows toast. Resolves on success, rejects on notifier error.
 * @param {ToastInput} input
 * @param {ToastDeps} [deps]
 * @returns {Promise<ToastResult>}
 */
export function sendToast(input, deps = {}) {
  const notifier = (deps.notifierFactory ?? (() => nodeNotifier))();
  return new Promise((resolve, reject) => {
    notifier.notify(
      {
        title: input.title,
        message: input.body ?? '',
        icon: ICON_PATH,
        sound: false,
        wait: false,
        appID: 'Rooster Dashboard',
      },
      (err) => {
        if (err) {
          reject(err);
          return;
        }
        resolve({ ok: true });
      },
    );
  });
}
```

- [x] **Step 4: Run tests**

```bash
npm test -- --run reminders/toast.test.js 2>&1 | tail -10
```
Expected: 3 passed.

Note on the icon path: the file `web.ui/backend/assets/rooster-icon.png` is owned by Plan A's tray work. If it does not exist yet, the toast still fires â€” node-notifier on Windows tolerates a missing icon by falling back to a default. Do NOT create the icon here.

- [x] **Step 5: Commit**

```bash
git -C C:/Sandbox/AIProjectManagement/Rooster-AI-Project-Management add web.ui/backend/reminders/toast.js web.ui/backend/__tests__/reminders/toast.test.js
git -C C:/Sandbox/AIProjectManagement/Rooster-AI-Project-Management commit -m "feat(reminders): node-notifier toast wrapper with notifierFactory injection"
```

---

## Task 4: Email delivery wrapper

**Files:**
- Create: `web.ui/backend/reminders/email.js`
- Create: `web.ui/backend/__tests__/reminders/email.test.js`

- [x] **Step 1: Write failing tests**

Create `web.ui/backend/__tests__/reminders/email.test.js`:

```javascript
import { describe, it, expect, vi } from 'vitest';
import nodemailer from 'nodemailer';
import { sendEmail, _buildTransportFromEnv } from '../../reminders/email.js';

describe('reminders/email', () => {
  it('sends via the provided transport and resolves with messageId', async () => {
    const transport = nodemailer.createTransport({ streamTransport: true, buffer: true });
    const transportFactory = () => transport;
    const result = await sendEmail(
      { to: 'marts9182@gmail.com', subject: 'KDP Day-30', text: 'Sudoku Vol 1' },
      { transportFactory },
    );
    expect(result.ok).toBe(true);
    expect(result.messageId).toBeDefined();
    expect(result.message.toString()).toContain('To: marts9182@gmail.com');
    expect(result.message.toString()).toContain('Subject: KDP Day-30');
    expect(result.message.toString()).toContain('Sudoku Vol 1');
  });

  it('from header reads profile.gmail_address (passed via from)', async () => {
    const transport = nodemailer.createTransport({ streamTransport: true, buffer: true });
    const transportFactory = () => transport;
    const result = await sendEmail(
      { to: 'a@b.com', from: 'me@gmail.com', subject: 's', text: 'x' },
      { transportFactory },
    );
    expect(result.message.toString()).toContain('From: me@gmail.com');
  });

  it('rejects when transport errors', async () => {
    const transportFactory = () => ({
      sendMail: (_opts, cb) => cb(new Error('SMTP 535 authentication failed')),
    });
    await expect(
      sendEmail({ to: 'a@b.com', subject: 's', text: 'x' }, { transportFactory }),
    ).rejects.toThrow('SMTP 535');
  });

  it('_buildTransportFromEnv configures Gmail SMTP with provided creds', () => {
    const t = _buildTransportFromEnv({ user: 'me@gmail.com', pass: 'app-pwd' });
    expect(t.options.host).toBe('smtp.gmail.com');
    expect(t.options.port).toBe(587);
    expect(t.options.secure).toBe(false);
    expect(t.options.requireTLS).toBe(true);
    expect(t.options.auth.user).toBe('me@gmail.com');
    expect(t.options.auth.pass).toBe('app-pwd');
  });

  it('_buildTransportFromEnv throws when GMAIL_APP_PASSWORD missing', () => {
    expect(() => _buildTransportFromEnv({ user: 'me@gmail.com', pass: '' })).toThrow(
      /GMAIL_APP_PASSWORD/,
    );
  });
});
```

- [x] **Step 2: Run test to confirm failure**

```bash
npm test -- --run reminders/email.test.js 2>&1 | tail -10
```
Expected: import error on `../../reminders/email.js`.

- [x] **Step 3: Implement the wrapper**

Create `web.ui/backend/reminders/email.js`:

```javascript
/**
 * @file Thin wrapper around nodemailer for Gmail SMTP delivery.
 * Inject `transportFactory` in tests (typically a stream transport).
 * In production we build a real SMTP transport from env vars.
 */

import nodemailer from 'nodemailer';

/**
 * @typedef {Object} EmailInput
 * @property {string} to
 * @property {string} [from]
 * @property {string} subject
 * @property {string} text
 * @property {string} [html]
 *
 * @typedef {Object} EmailDeps
 * @property {() => import('nodemailer').Transporter} [transportFactory]
 *
 * @typedef {Object} EmailResult
 * @property {true} ok
 * @property {string} messageId
 * @property {Buffer|string} [message] only present with streamTransport
 */

/**
 * Build a real Gmail SMTP transport. Throws if `pass` is empty.
 * Exposed for tests; production code calls this from sendEmail when no factory is passed.
 * @param {{ user: string, pass: string }} creds
 * @returns {import('nodemailer').Transporter}
 */
export function _buildTransportFromEnv({ user, pass }) {
  if (!pass) {
    throw new Error(
      'GMAIL_APP_PASSWORD env var is required to send reminder emails. ' +
        'See web.ui/backend/help/gmail_app_password.md for setup.',
    );
  }
  return nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    requireTLS: true,
    auth: { user, pass },
  });
}

/**
 * Send one email. Resolves with messageId; rejects on transport error.
 * @param {EmailInput} input
 * @param {EmailDeps} [deps]
 * @returns {Promise<EmailResult>}
 */
export function sendEmail(input, deps = {}) {
  const transport =
    deps.transportFactory != null
      ? deps.transportFactory()
      : _buildTransportFromEnv({
          user: input.from ?? '',
          pass: process.env.GMAIL_APP_PASSWORD ?? '',
        });
  return new Promise((resolve, reject) => {
    transport.sendMail(
      {
        from: input.from,
        to: input.to,
        subject: input.subject,
        text: input.text,
        html: input.html,
      },
      (err, info) => {
        if (err) {
          reject(err);
          return;
        }
        resolve({ ok: true, messageId: info.messageId, message: info.message });
      },
    );
  });
}
```

- [x] **Step 4: Run tests**

```bash
npm test -- --run reminders/email.test.js 2>&1 | tail -10
```
Expected: 5 passed.

- [x] **Step 5: Commit**

```bash
git -C C:/Sandbox/AIProjectManagement/Rooster-AI-Project-Management add web.ui/backend/reminders/email.js web.ui/backend/__tests__/reminders/email.test.js
git -C C:/Sandbox/AIProjectManagement/Rooster-AI-Project-Management commit -m "feat(reminders): nodemailer Gmail SMTP wrapper with transportFactory injection"
```

---

## Task 5: Scheduler worker (node-cron tick)

**Files:**
- Create: `web.ui/backend/reminders/scheduler.js`
- Create: `web.ui/backend/__tests__/reminders/scheduler.test.js`

- [x] **Step 1: Write failing tests**

Create `web.ui/backend/__tests__/reminders/scheduler.test.js`:

```javascript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import { tick } from '../../reminders/scheduler.js';
import { insertReminder, getById } from '../../reminders/repo.js';

function makeDb() {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE reminders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      body TEXT,
      due_at TEXT NOT NULL,
      channel TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('pending','fired','dismissed','failed')),
      source_kind TEXT,
      source_id INTEGER,
      payload_json TEXT,
      fired_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX idx_reminders_due ON reminders(status, due_at);
    CREATE TABLE events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      kind TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      occurred_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
  return db;
}

function makeDeps() {
  const sentToasts = [];
  const sentEmails = [];
  const broadcasts = [];
  return {
    sentToasts,
    sentEmails,
    broadcasts,
    deps: {
      sendToast: vi.fn(async (x) => {
        sentToasts.push(x);
        return { ok: true };
      }),
      sendEmail: vi.fn(async (x) => {
        sentEmails.push(x);
        return { ok: true, messageId: 'm' };
      }),
      // recordEvent handles BOTH audit-log INSERT and SSE fan-out, so it's the
      // only event-emission dep the scheduler needs. Tests capture the calls
      // into `broadcasts` so existing assertions on event kinds still work.
      recordEvent: vi.fn((kind, payload) => broadcasts.push({ kind, payload })),
      profileFor: () => ({ gmail_address: 'me@gmail.com' }),
    },
  };
}

describe('reminders/scheduler.tick', () => {
  /** @type {import('better-sqlite3').Database} */
  let db;
  beforeEach(() => {
    db = makeDb();
  });

  it('fires a pending toast-only reminder and marks it fired', async () => {
    const id = insertReminder(db, {
      title: 'KDP review check',
      body: 'Sudoku Vol 1',
      due_at: '2020-01-01T00:00:00Z',
      channel: 'toast',
    });
    const { deps, sentToasts, sentEmails, broadcasts } = makeDeps();
    await tick(db, { ...deps, now: () => new Date('2026-05-26T12:00:00Z') });
    expect(sentToasts).toHaveLength(1);
    expect(sentEmails).toHaveLength(0);
    expect(getById(db, id).status).toBe('fired');
    expect(broadcasts.some(b => b.kind === 'reminder:fired')).toBe(true);
  });

  it('fires email-only reminder', async () => {
    insertReminder(db, {
      title: 'Etsy Day-30',
      body: 'Listing X',
      due_at: '2020-01-01T00:00:00Z',
      channel: 'email',
    });
    const { deps, sentToasts, sentEmails } = makeDeps();
    await tick(db, { ...deps, now: () => new Date('2026-05-26T12:00:00Z') });
    expect(sentToasts).toHaveLength(0);
    expect(sentEmails).toHaveLength(1);
    expect(sentEmails[0].to).toBe('me@gmail.com');
    expect(sentEmails[0].subject).toBe('Etsy Day-30');
  });

  it('fires both channels for channel=both', async () => {
    insertReminder(db, {
      title: 't',
      due_at: '2020-01-01T00:00:00Z',
      channel: 'both',
    });
    const { deps, sentToasts, sentEmails } = makeDeps();
    await tick(db, { ...deps, now: () => new Date('2026-05-26T12:00:00Z') });
    expect(sentToasts).toHaveLength(1);
    expect(sentEmails).toHaveLength(1);
  });

  it('ignores future-dated pending reminders', async () => {
    insertReminder(db, {
      title: 'future',
      due_at: '2099-01-01T00:00:00Z',
      channel: 'toast',
    });
    const { deps, sentToasts } = makeDeps();
    await tick(db, { ...deps, now: () => new Date('2026-05-26T12:00:00Z') });
    expect(sentToasts).toHaveLength(0);
  });

  it('one bad row does not kill the loop; failure is recorded', async () => {
    insertReminder(db, { title: 'good', due_at: '2020-01-01T00:00:00Z', channel: 'toast' });
    const badId = insertReminder(db, { title: 'bad', due_at: '2020-01-01T00:00:00Z', channel: 'toast' });
    const { deps, sentToasts, broadcasts } = makeDeps();
    // First call to sendToast (good) succeeds; second (bad) throws.
    deps.sendToast = vi
      .fn()
      .mockResolvedValueOnce({ ok: true })
      .mockRejectedValueOnce(new Error('boom'));
    await tick(db, { ...deps, now: () => new Date('2026-05-26T12:00:00Z') });
    expect(getById(db, badId).status).toBe('failed');
    expect(broadcasts.some(b => b.kind === 'reminder:failed')).toBe(true);
  });

  it('two consecutive delivery failures broadcasts system:reminder-delivery-degraded', async () => {
    insertReminder(db, { title: 'a', due_at: '2020-01-01T00:00:00Z', channel: 'toast' });
    insertReminder(db, { title: 'b', due_at: '2020-01-01T00:00:00Z', channel: 'toast' });
    const { deps, broadcasts } = makeDeps();
    deps.sendToast = vi.fn().mockRejectedValue(new Error('SnoreToast missing'));
    await tick(db, { ...deps, now: () => new Date('2026-05-26T12:00:00Z') });
    expect(broadcasts.some(b => b.kind === 'system:reminder-delivery-degraded')).toBe(true);
  });
});
```

- [x] **Step 2: Run test to confirm failure**

```bash
npm test -- --run reminders/scheduler.test.js 2>&1 | tail -10
```
Expected: module not found.

- [x] **Step 3: Implement the scheduler**

Create `web.ui/backend/reminders/scheduler.js`:

```javascript
/**
 * @file Reminder scheduler â€” node-cron tick fires due reminders every 60s.
 *
 * Wiring: `startScheduler(db, options)` registers a cron job (`* * * * *`)
 * that on each tick selects pending reminders due now, delivers them on the
 * configured channels, marks them fired/failed, appends an `events` row and
 * broadcasts SSE.
 *
 * The pure `tick(db, deps)` function is the testable unit. The cron wrapper
 * exists only to call it every minute.
 */

import cron from 'node-cron';
import { listPending, markFired, markFailed } from './repo.js';
import { sendToast as defaultSendToast } from './toast.js';
import { sendEmail as defaultSendEmail } from './email.js';

/**
 * @typedef {import('./repo.js').ReminderRow} ReminderRow
 *
 * @typedef {Object} TickDeps
 * @property {(input: { title: string, body?: string }) => Promise<{ok: true}>} sendToast
 * @property {(input: { to: string, from?: string, subject: string, text: string }) => Promise<{ok: true, messageId: string}>} sendEmail
 * @property {(kind: string, payload: object) => void} recordEvent  Plan A's recordEvent â€” writes the audit-log row AND fans out to SSE subscribers in a single call.
 * @property {() => { gmail_address: string|null }} profileFor
 * @property {() => Date} [now]
 */

/**
 * One scheduler tick. Pure with respect to deps; database mutations happen via repo.js.
 * @param {import('better-sqlite3').Database} db
 * @param {TickDeps} deps
 * @returns {Promise<{fired: number, failed: number}>}
 */
export async function tick(db, deps) {
  const now = (deps.now ?? (() => new Date()))();
  const nowIso = now.toISOString();
  const rows = listPending(db, nowIso);
  if (rows.length === 0) {
    return { fired: 0, failed: 0 };
  }
  const profile = deps.profileFor();
  let fired = 0;
  let failed = 0;
  let consecutiveFailures = 0;

  for (const row of rows) {
    try {
      await deliver(row, profile, deps);
      markFired(db, row.id);
      // recordEvent handles both the audit-log INSERT and SSE fan-out.
      deps.recordEvent('reminder:fired', { id: row.id, title: row.title, body: row.body });
      fired += 1;
      consecutiveFailures = 0;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      markFailed(db, row.id);
      deps.recordEvent('reminder:failed', { id: row.id, title: row.title, error: message });
      failed += 1;
      consecutiveFailures += 1;
      if (consecutiveFailures >= 2) {
        deps.recordEvent('system:reminder-delivery-degraded', {
          consecutiveFailures,
          lastError: message,
        });
      }
    }
  }
  return { fired, failed };
}

/**
 * Deliver one reminder on the channels it specifies. Throws on any channel error.
 * @param {ReminderRow} row
 * @param {{ gmail_address: string|null }} profile
 * @param {TickDeps} deps
 */
async function deliver(row, profile, deps) {
  const errors = [];
  if (row.channel === 'toast' || row.channel === 'both') {
    try {
      await deps.sendToast({ title: row.title, body: row.body ?? '' });
    } catch (err) {
      errors.push(err);
    }
  }
  if (row.channel === 'email' || row.channel === 'both') {
    if (!profile.gmail_address) {
      errors.push(new Error('profile.gmail_address not set; cannot send email reminder'));
    } else {
      try {
        await deps.sendEmail({
          to: profile.gmail_address,
          from: profile.gmail_address,
          subject: row.title,
          text: row.body ?? '(no body)',
        });
      } catch (err) {
        errors.push(err);
      }
    }
  }
  if (errors.length > 0) {
    throw errors[0];
  }
}

/**
 * Start the cron job. Returns a stop() function for shutdown.
 * @param {import('better-sqlite3').Database} db
 * @param {Partial<TickDeps>} [overrides]
 * @returns {() => void}
 */
export function startScheduler(db, overrides = {}) {
  /** @type {TickDeps} */
  const deps = {
    sendToast: overrides.sendToast ?? defaultSendToast,
    sendEmail: overrides.sendEmail ?? defaultSendEmail,
    recordEvent: overrides.recordEvent ?? (() => {}),
    profileFor:
      overrides.profileFor ??
      (() => {
        const row = db.prepare(`SELECT gmail_address FROM profile WHERE id = 1`).get();
        return row ?? { gmail_address: null };
      }),
    now: overrides.now,
  };
  const task = cron.schedule('* * * * *', () => {
    tick(db, deps).catch((err) => {
      // eslint-disable-next-line no-console
      console.error('[reminders.scheduler] tick crashed:', err);
    });
  });
  return () => task.stop();
}
```

- [x] **Step 4: Run tests**

```bash
npm test -- --run reminders/scheduler.test.js 2>&1 | tail -10
```
Expected: 6 passed.

- [x] **Step 5: Commit**

```bash
git -C C:/Sandbox/AIProjectManagement/Rooster-AI-Project-Management add web.ui/backend/reminders/scheduler.js web.ui/backend/__tests__/reminders/scheduler.test.js
git -C C:/Sandbox/AIProjectManagement/Rooster-AI-Project-Management commit -m "feat(reminders): node-cron scheduler + toast/email delivery"
```

---

## Task 6: Reminders REST routes

**Files:**
- Create: `web.ui/backend/reminders/routes.js`
- Create: `web.ui/backend/__tests__/reminders/routes.test.js`

- [x] **Step 1: Write failing tests**

Create `web.ui/backend/__tests__/reminders/routes.test.js`:

```javascript
import { describe, it, expect, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import Database from 'better-sqlite3';
import { createRemindersRouter } from '../../reminders/routes.js';
import { insertReminder, getById } from '../../reminders/repo.js';

function makeApp() {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE reminders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      body TEXT,
      due_at TEXT NOT NULL,
      channel TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('pending','fired','dismissed','failed')),
      source_kind TEXT,
      source_id INTEGER,
      payload_json TEXT,
      fired_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
  const app = express();
  app.use(express.json());
  app.use('/api/reminders', createRemindersRouter({ db }));
  return { app, db };
}

describe('reminders/routes', () => {
  /** @type {ReturnType<typeof makeApp>} */
  let ctx;
  beforeEach(() => {
    ctx = makeApp();
  });

  it('GET /api/reminders defaults to status=pending, ordered by due_at', async () => {
    insertReminder(ctx.db, { title: 'b', due_at: '2026-02-01T00:00:00Z', channel: 'toast' });
    insertReminder(ctx.db, { title: 'a', due_at: '2026-01-01T00:00:00Z', channel: 'toast' });
    const res = await request(ctx.app).get('/api/reminders');
    expect(res.status).toBe(200);
    expect(res.body.reminders.map((r) => r.title)).toEqual(['a', 'b']);
  });

  it('GET /api/reminders?status=fired returns only fired rows', async () => {
    const id = insertReminder(ctx.db, { title: 't', due_at: '2026-01-01T00:00:00Z', channel: 'toast' });
    ctx.db.prepare(`UPDATE reminders SET status='fired' WHERE id = ?`).run(id);
    const res = await request(ctx.app).get('/api/reminders?status=fired');
    expect(res.body.reminders).toHaveLength(1);
  });

  it('GET /api/reminders?status=bogus returns 400', async () => {
    const res = await request(ctx.app).get('/api/reminders?status=bogus');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/status/);
  });

  it('POST /api/reminders creates a manual reminder', async () => {
    const res = await request(ctx.app)
      .post('/api/reminders')
      .send({
        title: 'Drink water',
        due_at: '2026-06-01T08:00:00Z',
        channel: 'toast',
      });
    expect(res.status).toBe(201);
    expect(res.body.reminder.id).toBeDefined();
    expect(res.body.reminder.source_kind).toBe('manual');
  });

  it('POST /api/reminders rejects missing required fields', async () => {
    const res = await request(ctx.app).post('/api/reminders').send({ title: 'x' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/due_at|channel/);
  });

  it('POST /api/reminders rejects invalid channel', async () => {
    const res = await request(ctx.app).post('/api/reminders').send({
      title: 'x',
      due_at: '2026-06-01T08:00:00Z',
      channel: 'pigeon',
    });
    expect(res.status).toBe(400);
  });

  it('POST /api/reminders/:id/dismiss sets status to dismissed', async () => {
    const id = insertReminder(ctx.db, {
      title: 't',
      due_at: '2026-01-01T00:00:00Z',
      channel: 'toast',
    });
    const res = await request(ctx.app).post(`/api/reminders/${id}/dismiss`);
    expect(res.status).toBe(200);
    expect(getById(ctx.db, id).status).toBe('dismissed');
  });

  it('POST /api/reminders/:id/dismiss on unknown id returns 404', async () => {
    const res = await request(ctx.app).post('/api/reminders/9999/dismiss');
    expect(res.status).toBe(404);
  });

  it('POST /api/reminders/:id/snooze pushes due_at by snooze_minutes', async () => {
    const id = insertReminder(ctx.db, {
      title: 't',
      due_at: '2020-01-01T00:00:00Z',
      channel: 'toast',
    });
    const res = await request(ctx.app)
      .post(`/api/reminders/${id}/snooze`)
      .send({ snooze_minutes: 15 });
    expect(res.status).toBe(200);
    const row = getById(ctx.db, id);
    // new due_at should be > now() (i.e., later than 2020).
    expect(new Date(row.due_at).getTime()).toBeGreaterThan(Date.now() + 14 * 60 * 1000);
    expect(row.status).toBe('pending');
  });

  it('POST /api/reminders/:id/snooze rejects non-positive snooze_minutes', async () => {
    const id = insertReminder(ctx.db, {
      title: 't',
      due_at: '2020-01-01T00:00:00Z',
      channel: 'toast',
    });
    const res = await request(ctx.app)
      .post(`/api/reminders/${id}/snooze`)
      .send({ snooze_minutes: 0 });
    expect(res.status).toBe(400);
  });
});
```

- [x] **Step 2: Run test to confirm failure**

```bash
npm test -- --run reminders/routes.test.js 2>&1 | tail -10
```
Expected: module not found.

- [x] **Step 3: Implement the router**

Create `web.ui/backend/reminders/routes.js`:

```javascript
/**
 * @file Express router for /api/reminders.
 * Routes: GET list, POST create, POST dismiss, POST snooze.
 */

import express from 'express';
import {
  insertReminder,
  listByStatus,
  getById,
  dismiss as dismissRow,
  snooze as snoozeRow,
} from './repo.js';

/** @typedef {'pending'|'fired'|'dismissed'|'failed'} ReminderStatus */
/** @type {ReminderStatus[]} */
const VALID_STATUS = ['pending', 'fired', 'dismissed', 'failed'];
/** @type {('toast'|'email'|'both')[]} */
const VALID_CHANNEL = ['toast', 'email', 'both'];

/**
 * @param {{ db: import('better-sqlite3').Database }} deps
 * @returns {express.Router}
 */
export function createRemindersRouter({ db }) {
  const router = express.Router();

  router.get('/', (req, res) => {
    const status = /** @type {ReminderStatus} */ (req.query.status ?? 'pending');
    if (!VALID_STATUS.includes(status)) {
      res.status(400).json({ error: `invalid status: ${String(status)}` });
      return;
    }
    const reminders = listByStatus(db, status);
    res.json({ reminders });
  });

  router.post('/', (req, res) => {
    const { title, body, due_at, channel } = req.body ?? {};
    if (!title || !due_at || !channel) {
      res.status(400).json({ error: 'title, due_at, channel are required' });
      return;
    }
    if (!VALID_CHANNEL.includes(channel)) {
      res.status(400).json({ error: `invalid channel: ${channel}` });
      return;
    }
    const id = insertReminder(db, {
      title,
      body,
      due_at,
      channel,
      source_kind: 'manual',
    });
    const reminder = getById(db, id);
    res.status(201).json({ reminder });
  });

  router.post('/:id/dismiss', (req, res) => {
    const id = Number(req.params.id);
    const row = getById(db, id);
    if (!row) {
      res.status(404).json({ error: 'not found' });
      return;
    }
    dismissRow(db, id);
    res.json({ reminder: getById(db, id) });
  });

  router.post('/:id/snooze', (req, res) => {
    const id = Number(req.params.id);
    const row = getById(db, id);
    if (!row) {
      res.status(404).json({ error: 'not found' });
      return;
    }
    const minutes = Number(req.body?.snooze_minutes);
    if (!Number.isFinite(minutes) || minutes <= 0) {
      res.status(400).json({ error: 'snooze_minutes must be a positive number' });
      return;
    }
    const newDue = new Date(Date.now() + minutes * 60 * 1000).toISOString();
    snoozeRow(db, id, newDue);
    res.json({ reminder: getById(db, id) });
  });

  return router;
}
```

- [x] **Step 4: Run tests**

```bash
npm test -- --run reminders/routes.test.js 2>&1 | tail -10
```
Expected: 10 passed.

- [x] **Step 5: Commit**

```bash
git -C C:/Sandbox/AIProjectManagement/Rooster-AI-Project-Management add web.ui/backend/reminders/routes.js web.ui/backend/__tests__/reminders/routes.test.js
git -C C:/Sandbox/AIProjectManagement/Rooster-AI-Project-Management commit -m "feat(reminders): REST routes for list/create/dismiss/snooze"
```

---

## Task 7: Wire scheduler + routes into server.js

**Files:**
- Modify: `web.ui/backend/server.js`

- [x] **Step 1: Locate the insertion points**

```bash
grep -n "app.use\|setWorkerHeartbeat\|app.listen" C:/Sandbox/AIProjectManagement/Rooster-AI-Project-Management/web.ui/backend/server.js
```
Expected: shows existing `app.use('/api/...', ...)` mounts and the `app.listen(...)` call. The exact line numbers depend on Plan A; you'll add new lines near the existing route mounts and after `app.listen` resolves.

- [x] **Step 2: Add the route mount**

In `server.js`, add to the imports section near the other Plan A route imports:

```javascript
import { createRemindersRouter } from './reminders/routes.js';
import { startScheduler } from './reminders/scheduler.js';
import { recordEvent } from './events.js';
import { setWorkerHeartbeat, setWorkerError } from './workerStatus.js';
```

Below the existing `app.use('/api/events', ...)` mount (or alongside other `/api/*` routers), add:

```javascript
app.use('/api/reminders', createRemindersRouter({ db }));
```

Replace the relative path of any existing import for `db.js` so it matches your style â€” `from './db.js'`. The line that obtains `db` already exists from Plan A; if it does not, add `import { openDb } from './db.js'; const db = openDb();` near the top.

- [x] **Step 3: Boot the scheduler after server starts**

After `app.listen(PORT, '127.0.0.1', () => { ... })`, start the scheduler. Workers update their status by calling the procedural `setWorkerHeartbeat`/`setWorkerError` functions directly with their own name string â€” there is no factory handle to obtain:

```javascript
const stopScheduler = startScheduler(db, {
  recordEvent,
  onTick: () => setWorkerHeartbeat('reminders'),
});

// Graceful shutdown hooks (only add if Plan A did not already add them):
process.on('SIGINT', () => {
  stopScheduler();
  process.exit(0);
});
process.on('SIGTERM', () => {
  stopScheduler();
  process.exit(0);
});
```

Note: `startScheduler` does not currently accept an `onTick` parameter. Patch `scheduler.js` `startScheduler` to call `overrides.onTick?.()` inside the cron callback before `tick(...)`:

```javascript
const task = cron.schedule('* * * * *', () => {
  overrides.onTick?.();
  tick(db, deps).catch((err) => {
    console.error('[reminders.scheduler] tick crashed:', err);
  });
});
```

- [x] **Step 4: Manual smoke test**

```bash
cd C:/Sandbox/AIProjectManagement/Rooster-AI-Project-Management/web.ui/backend
node server.js &
SERVER_PID=$!
sleep 2
curl -s http://127.0.0.1:5000/api/reminders | head -c 200
kill $SERVER_PID
```
Expected: JSON body `{"reminders":[]}` (or with whatever rows existed). No 500 error.

- [x] **Step 5: Run full backend test suite**

```bash
npm test 2>&1 | tail -5
```
Expected: all passes (baseline + everything Plan D added).

- [x] **Step 6: Commit**

```bash
git -C C:/Sandbox/AIProjectManagement/Rooster-AI-Project-Management add web.ui/backend/server.js web.ui/backend/reminders/scheduler.js
git -C C:/Sandbox/AIProjectManagement/Rooster-AI-Project-Management commit -m "feat(reminders): wire scheduler + routes into server.js"
```

---

## Task 8: Plans scanner (frontmatter + checkbox progress)

**Files:**
- Create: `web.ui/backend/plans/scanner.js`
- Create: `web.ui/backend/__tests__/plans/scanner.test.js`

- [x] **Step 1: Write failing tests**

Create `web.ui/backend/__tests__/plans/scanner.test.js`:

```javascript
import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { scanDocs, computeProgress, _slugFromFilename, _statusOf } from '../../plans/scanner.js';

/**
 * Builds an isolated docs/ tree with the same layout the scanner expects.
 * Returns the temp root (caller passes `${root}/superpowers` into scanDocs).
 */
function makeDocsTree() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'plans-scanner-'));
  fs.mkdirSync(path.join(root, 'superpowers', 'specs'), { recursive: true });
  fs.mkdirSync(path.join(root, 'superpowers', 'plans'), { recursive: true });
  return root;
}

describe('plans/scanner', () => {
  /** @type {string} */
  let root;
  beforeEach(() => {
    root = makeDocsTree();
  });

  it('computeProgress counts open and done checkboxes', () => {
    const md = `# Title\n\n- [ ] task one\n- [x] task two\n- [X] case insensitive\n- not a task\n`;
    expect(computeProgress(md)).toEqual({ open: 1, done: 2, total: 3, percent: 67 });
  });

  it('computeProgress returns 0% for files with no checkboxes', () => {
    const md = `# Heading\nparagraph\n`;
    expect(computeProgress(md)).toEqual({ open: 0, done: 0, total: 0, percent: 0 });
  });

  it('_slugFromFilename strips date prefix and -implementation/-design suffix', () => {
    expect(_slugFromFilename('2026-05-22-etsy-rooster-shop-plan-3-implementation.md')).toBe(
      'etsy-rooster-shop-plan-3',
    );
    expect(_slugFromFilename('2026-05-22-etsy-rooster-shop-plan-3-design.md')).toBe(
      'etsy-rooster-shop-plan-3',
    );
    expect(_slugFromFilename('2026-05-13-may-release-pair.md')).toBe('may-release-pair');
  });

  it('_statusOf returns done/in-flight/open per progress', () => {
    expect(_statusOf({ open: 0, done: 5, total: 5, percent: 100 })).toBe('done');
    expect(_statusOf({ open: 2, done: 1, total: 3, percent: 33 })).toBe('in-flight');
    expect(_statusOf({ open: 0, done: 0, total: 0, percent: 0 })).toBe('open');
  });

  it('scanDocs finds specs and plans, parses date from filename + frontmatter title', () => {
    fs.writeFileSync(
      path.join(root, 'superpowers', 'specs', '2026-05-26-foo-design.md'),
      '---\ntitle: Foo Design\ndate: 2026-05-26\n---\n# Foo\n',
    );
    fs.writeFileSync(
      path.join(root, 'superpowers', 'plans', '2026-05-26-foo-implementation.md'),
      '# Foo Implementation Plan\n\n- [ ] one\n- [x] two\n',
    );
    const entries = scanDocs(path.join(root, 'superpowers'));
    expect(entries).toHaveLength(2);
    const spec = entries.find((e) => e.kind === 'spec');
    const plan = entries.find((e) => e.kind === 'plan');
    expect(spec.title).toBe('Foo Design');
    expect(spec.date).toBe('2026-05-26');
    expect(spec.slug).toBe('foo');
    expect(spec.status).toBe('open');
    expect(plan.slug).toBe('foo');
    expect(plan.status).toBe('in-flight');
    expect(plan.progress).toEqual({ open: 1, done: 1, total: 2, percent: 50 });
  });

  it('scanDocs sorts entries by date DESC then title ASC', () => {
    fs.writeFileSync(
      path.join(root, 'superpowers', 'specs', '2026-05-01-old.md'),
      '---\ntitle: Old\n---\n',
    );
    fs.writeFileSync(
      path.join(root, 'superpowers', 'specs', '2026-05-26-new-b.md'),
      '---\ntitle: New B\n---\n',
    );
    fs.writeFileSync(
      path.join(root, 'superpowers', 'specs', '2026-05-26-new-a.md'),
      '---\ntitle: New A\n---\n',
    );
    const entries = scanDocs(path.join(root, 'superpowers'));
    expect(entries.map((e) => e.title)).toEqual(['New A', 'New B', 'Old']);
  });

  it('scanDocs handles missing frontmatter (uses H1 as title)', () => {
    fs.writeFileSync(
      path.join(root, 'superpowers', 'plans', '2026-05-26-no-fm.md'),
      '# Heading Used As Title\n\nbody\n',
    );
    const entries = scanDocs(path.join(root, 'superpowers'));
    expect(entries[0].title).toBe('Heading Used As Title');
  });

  it('scanDocs falls back to slug if no H1 and no frontmatter title', () => {
    fs.writeFileSync(
      path.join(root, 'superpowers', 'plans', '2026-05-26-bare-file.md'),
      'just some text\n',
    );
    const entries = scanDocs(path.join(root, 'superpowers'));
    expect(entries[0].title).toBe('bare-file');
  });
});
```

- [x] **Step 2: Run test to confirm failure**

```bash
cd C:/Sandbox/AIProjectManagement/Rooster-AI-Project-Management/web.ui/backend
npm test -- --run plans/scanner.test.js 2>&1 | tail -10
```
Expected: module not found.

- [x] **Step 3: Implement the scanner**

Create `web.ui/backend/plans/scanner.js`:

```javascript
/**
 * @file Scans docs/superpowers/{specs,plans}/*.md and produces a unified
 * entry list with computed status from checkbox progress.
 *
 * No DB writes; the scanner is invoked on demand from the routes layer.
 */

import fs from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';

/**
 * @typedef {Object} PlanProgress
 * @property {number} open
 * @property {number} done
 * @property {number} total
 * @property {number} percent  rounded 0â€“100
 *
 * @typedef {Object} PlanEntry
 * @property {'spec'|'plan'} kind
 * @property {string} title
 * @property {string} date          ISO yyyy-mm-dd (from filename prefix)
 * @property {'open'|'in-flight'|'done'} status
 * @property {string} path          absolute path to the .md file
 * @property {string} slug
 * @property {PlanProgress} progress
 */

const FILENAME_DATE = /^(\d{4}-\d{2}-\d{2})-(.+?)(-design|-implementation)?\.md$/i;
const CHECKBOX_OPEN = /^\s*-\s+\[ \]/gm;
const CHECKBOX_DONE = /^\s*-\s+\[[xX]\]/gm;
const H1 = /^# (.+)$/m;

/**
 * Strip the date prefix and `-design` / `-implementation` suffix from a filename.
 * "2026-05-22-etsy-rooster-shop-plan-3-implementation.md" â†’ "etsy-rooster-shop-plan-3"
 * "2026-05-13-may-release-pair.md" â†’ "may-release-pair"
 * @param {string} filename
 * @returns {string}
 */
export function _slugFromFilename(filename) {
  const m = filename.match(FILENAME_DATE);
  if (!m) return filename.replace(/\.md$/i, '');
  return m[2];
}

/**
 * @param {string} filename
 * @returns {string|null}  ISO date or null
 */
function _dateFromFilename(filename) {
  const m = filename.match(FILENAME_DATE);
  return m ? m[1] : null;
}

/**
 * Count open and done checkboxes in the markdown body.
 * @param {string} markdown
 * @returns {PlanProgress}
 */
export function computeProgress(markdown) {
  const open = (markdown.match(CHECKBOX_OPEN) ?? []).length;
  const done = (markdown.match(CHECKBOX_DONE) ?? []).length;
  const total = open + done;
  const percent = total === 0 ? 0 : Math.round((done / total) * 100);
  return { open, done, total, percent };
}

/**
 * Derive a status label from progress counts.
 * - `done`      â†’ all checkboxes complete (total > 0, open == 0)
 * - `in-flight` â†’ at least one done OR at least one open and at least one done
 * - `open`      â†’ no checkboxes at all (no plan started)
 * For files with checkboxes but zero done â†’ `in-flight` (work has started).
 * @param {PlanProgress} progress
 * @returns {'open'|'in-flight'|'done'}
 */
export function _statusOf(progress) {
  if (progress.total === 0) return 'open';
  if (progress.open === 0) return 'done';
  return 'in-flight';
}

/**
 * Extract title in order of preference: frontmatter.title â†’ first H1 â†’ slug.
 * @param {{ data: Record<string, unknown>, content: string }} parsed
 * @param {string} slug
 * @returns {string}
 */
function _titleFrom(parsed, slug) {
  if (typeof parsed.data.title === 'string' && parsed.data.title.trim() !== '') {
    return parsed.data.title;
  }
  const h1 = parsed.content.match(H1);
  if (h1) return h1[1].trim();
  return slug;
}

/**
 * Scan one directory and return its entries.
 * @param {string} dir
 * @param {'spec'|'plan'} kind
 * @returns {PlanEntry[]}
 */
function _scanDir(dir, kind) {
  if (!fs.existsSync(dir)) return [];
  /** @type {PlanEntry[]} */
  const out = [];
  for (const filename of fs.readdirSync(dir)) {
    if (!filename.endsWith('.md')) continue;
    const full = path.join(dir, filename);
    const raw = fs.readFileSync(full, 'utf8');
    const parsed = matter(raw);
    const slug = _slugFromFilename(filename);
    const date = _dateFromFilename(filename) ?? '';
    const progress = computeProgress(parsed.content);
    out.push({
      kind,
      title: _titleFrom(parsed, slug),
      date,
      status: _statusOf(progress),
      path: full,
      slug,
      progress,
    });
  }
  return out;
}

/**
 * Scan `<superpowersRoot>/specs/*.md` and `<superpowersRoot>/plans/*.md`.
 * Returns a combined array sorted by date DESC then title ASC.
 * @param {string} superpowersRoot  absolute path to docs/superpowers/
 * @returns {PlanEntry[]}
 */
export function scanDocs(superpowersRoot) {
  const specs = _scanDir(path.join(superpowersRoot, 'specs'), 'spec');
  const plans = _scanDir(path.join(superpowersRoot, 'plans'), 'plan');
  const all = [...specs, ...plans];
  all.sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1; // DESC by date
    return a.title.localeCompare(b.title);
  });
  return all;
}
```

- [x] **Step 4: Run tests**

```bash
npm test -- --run plans/scanner.test.js 2>&1 | tail -10
```
Expected: 8 passed.

- [x] **Step 5: Commit**

```bash
git -C C:/Sandbox/AIProjectManagement/Rooster-AI-Project-Management add web.ui/backend/plans/scanner.js web.ui/backend/__tests__/plans/scanner.test.js
git -C C:/Sandbox/AIProjectManagement/Rooster-AI-Project-Management commit -m "feat(plans): docs scanner + checkbox progress"
```

---

## Task 9: Plans REST routes

**Files:**
- Create: `web.ui/backend/plans/routes.js`
- Create: `web.ui/backend/__tests__/plans/routes.test.js`

- [x] **Step 1: Write failing tests**

Create `web.ui/backend/__tests__/plans/routes.test.js`:

```javascript
import { describe, it, expect, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createPlansRouter } from '../../plans/routes.js';

function makeApp() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'plans-routes-'));
  const sp = path.join(root, 'superpowers');
  fs.mkdirSync(path.join(sp, 'specs'), { recursive: true });
  fs.mkdirSync(path.join(sp, 'plans'), { recursive: true });
  fs.writeFileSync(
    path.join(sp, 'specs', '2026-05-26-foo-design.md'),
    '---\ntitle: Foo Spec\n---\n# Foo Spec\n\nbody\n',
  );
  fs.writeFileSync(
    path.join(sp, 'plans', '2026-05-26-foo-implementation.md'),
    '# Foo Plan\n\n- [ ] one\n- [x] two\n',
  );
  const app = express();
  app.use('/api/plans', createPlansRouter({ superpowersRoot: sp }));
  return { app, sp };
}

describe('plans/routes', () => {
  /** @type {ReturnType<typeof makeApp>} */
  let ctx;
  beforeEach(() => {
    ctx = makeApp();
  });

  it('GET /api/plans returns sorted entries with progress', async () => {
    const res = await request(ctx.app).get('/api/plans');
    expect(res.status).toBe(200);
    expect(res.body.entries).toHaveLength(2);
    const plan = res.body.entries.find((e) => e.kind === 'plan');
    expect(plan.progress).toEqual({ open: 1, done: 1, total: 2, percent: 50 });
  });

  it('GET /api/plans/:slug returns markdown + frontmatter, plan-first if both exist', async () => {
    const res = await request(ctx.app).get('/api/plans/foo');
    expect(res.status).toBe(200);
    expect(res.body.entries).toHaveLength(2); // spec + plan for the same slug
    const plan = res.body.entries.find((e) => e.kind === 'plan');
    expect(plan.markdown).toContain('# Foo Plan');
    expect(plan.frontmatter).toBeDefined();
  });

  it('GET /api/plans/:slug returns 404 for unknown slug', async () => {
    const res = await request(ctx.app).get('/api/plans/nope');
    expect(res.status).toBe(404);
  });

  it('GET /api/plans/:slug rejects slugs with path separators', async () => {
    const res = await request(ctx.app).get('/api/plans/..%2F..%2Fetc');
    // Either 400 (rejected at route level) or 404 (no match) is acceptable;
    // important is that we do NOT return a 200 with arbitrary file contents.
    expect([400, 404]).toContain(res.status);
  });
});
```

- [x] **Step 2: Run test to confirm failure**

```bash
npm test -- --run plans/routes.test.js 2>&1 | tail -10
```
Expected: module not found.

- [x] **Step 3: Implement the router**

Create `web.ui/backend/plans/routes.js`:

```javascript
/**
 * @file Express router for /api/plans (read-only browser over docs/superpowers/).
 */

import express from 'express';
import fs from 'node:fs';
import matter from 'gray-matter';
import { scanDocs } from './scanner.js';

const SLUG_OK = /^[a-z0-9][a-z0-9-]*$/i;

/**
 * @param {{ superpowersRoot: string }} deps
 * @returns {express.Router}
 */
export function createPlansRouter({ superpowersRoot }) {
  const router = express.Router();

  router.get('/', (_req, res) => {
    res.json({ entries: scanDocs(superpowersRoot) });
  });

  router.get('/:slug', (req, res) => {
    const { slug } = req.params;
    if (!SLUG_OK.test(slug)) {
      res.status(400).json({ error: 'invalid slug' });
      return;
    }
    const all = scanDocs(superpowersRoot);
    const matches = all.filter((e) => e.slug === slug);
    if (matches.length === 0) {
      res.status(404).json({ error: 'not found' });
      return;
    }
    const entries = matches.map((entry) => {
      const raw = fs.readFileSync(entry.path, 'utf8');
      const parsed = matter(raw);
      return {
        ...entry,
        markdown: parsed.content,
        frontmatter: parsed.data,
      };
    });
    // Sort so plans come before specs in detail view (most users want the actionable doc).
    entries.sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'plan' ? -1 : 1));
    res.json({ entries });
  });

  return router;
}
```

- [x] **Step 4: Run tests**

```bash
npm test -- --run plans/routes.test.js 2>&1 | tail -10
```
Expected: 4 passed.

- [x] **Step 5: Wire into server.js**

In `web.ui/backend/server.js`, near the other route mounts add:

```javascript
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPlansRouter } from './plans/routes.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SUPERPOWERS_ROOT = path.resolve(__dirname, '..', '..', 'docs', 'superpowers');
app.use('/api/plans', createPlansRouter({ superpowersRoot: SUPERPOWERS_ROOT }));
```

(If `__filename`/`__dirname` are already defined in `server.js`, do not redeclare; reuse them.)

- [x] **Step 6: Smoke test**

```bash
cd C:/Sandbox/AIProjectManagement/Rooster-AI-Project-Management/web.ui/backend
node server.js &
SERVER_PID=$!
sleep 2
curl -s http://127.0.0.1:5000/api/plans | head -c 500
kill $SERVER_PID
```
Expected: JSON body with `entries` containing the actual repo's specs and plans (you should see entries for `etsy-rooster-shop-plan-2e`, etc.).

- [x] **Step 7: Commit**

```bash
git -C C:/Sandbox/AIProjectManagement/Rooster-AI-Project-Management add web.ui/backend/plans/routes.js web.ui/backend/__tests__/plans/routes.test.js web.ui/backend/server.js
git -C C:/Sandbox/AIProjectManagement/Rooster-AI-Project-Management commit -m "feat(plans): /api/plans routes wired into server"
```

---

## Task 10: Frontend â€” install deps + reminder service

**Files:**
- Modify: `web.ui/frontend-react/package.json`
- Create: `web.ui/frontend-react/src/services/reminders.ts`
- Create: `web.ui/frontend-react/src/services/plans.ts`

- [x] **Step 1: Install frontend deps**

```bash
cd C:/Sandbox/AIProjectManagement/Rooster-AI-Project-Management/web.ui/frontend-react
npm install --save react-markdown@9.0.1 remark-gfm@4.0.0
```

Expected: `react-markdown` and `remark-gfm` added to `dependencies`.

- [x] **Step 2: Create the reminders service**

Create `web.ui/frontend-react/src/services/reminders.ts`:

```typescript
export type ReminderStatus = 'pending' | 'fired' | 'dismissed' | 'failed';
export type ReminderChannel = 'toast' | 'email' | 'both';

export interface Reminder {
  id: number;
  title: string;
  body: string | null;
  due_at: string;
  channel: ReminderChannel;
  status: ReminderStatus;
  source_kind: string | null;
  source_id: number | null;
  payload_json: string | null;
  fired_at: string | null;
  created_at: string;
}

const BASE = '/api/reminders';

export async function listReminders(status: ReminderStatus = 'pending'): Promise<Reminder[]> {
  const res = await fetch(`${BASE}?status=${status}`);
  if (!res.ok) throw new Error(`listReminders failed: ${res.status}`);
  const data = (await res.json()) as { reminders: Reminder[] };
  return data.reminders;
}

export async function createReminder(input: {
  title: string;
  body?: string;
  due_at: string;
  channel: ReminderChannel;
}): Promise<Reminder> {
  const res = await fetch(BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(`createReminder failed: ${res.status}`);
  const data = (await res.json()) as { reminder: Reminder };
  return data.reminder;
}

export async function dismissReminder(id: number): Promise<Reminder> {
  const res = await fetch(`${BASE}/${id}/dismiss`, { method: 'POST' });
  if (!res.ok) throw new Error(`dismissReminder failed: ${res.status}`);
  const data = (await res.json()) as { reminder: Reminder };
  return data.reminder;
}

export async function snoozeReminder(id: number, snoozeMinutes: number): Promise<Reminder> {
  const res = await fetch(`${BASE}/${id}/snooze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ snooze_minutes: snoozeMinutes }),
  });
  if (!res.ok) throw new Error(`snoozeReminder failed: ${res.status}`);
  const data = (await res.json()) as { reminder: Reminder };
  return data.reminder;
}
```

- [x] **Step 3: Create the plans service**

Create `web.ui/frontend-react/src/services/plans.ts`:

```typescript
export type PlanKind = 'spec' | 'plan';
export type PlanStatus = 'open' | 'in-flight' | 'done';

export interface PlanProgress {
  open: number;
  done: number;
  total: number;
  percent: number;
}

export interface PlanEntry {
  kind: PlanKind;
  title: string;
  date: string;
  status: PlanStatus;
  path: string;
  slug: string;
  progress: PlanProgress;
}

export interface PlanDetail extends PlanEntry {
  markdown: string;
  frontmatter: Record<string, unknown>;
}

export async function listPlans(): Promise<PlanEntry[]> {
  const res = await fetch('/api/plans');
  if (!res.ok) throw new Error(`listPlans failed: ${res.status}`);
  const data = (await res.json()) as { entries: PlanEntry[] };
  return data.entries;
}

export async function getPlan(slug: string): Promise<PlanDetail[]> {
  const res = await fetch(`/api/plans/${encodeURIComponent(slug)}`);
  if (!res.ok) throw new Error(`getPlan(${slug}) failed: ${res.status}`);
  const data = (await res.json()) as { entries: PlanDetail[] };
  return data.entries;
}
```

- [x] **Step 4: Type-check**

```bash
cd C:/Sandbox/AIProjectManagement/Rooster-AI-Project-Management/web.ui/frontend-react
npx tsc --noEmit 2>&1 | tail -10
```
Expected: no errors.

- [x] **Step 5: Commit**

```bash
git -C C:/Sandbox/AIProjectManagement/Rooster-AI-Project-Management add web.ui/frontend-react/package.json web.ui/frontend-react/package-lock.json web.ui/frontend-react/src/services/reminders.ts web.ui/frontend-react/src/services/plans.ts
git -C C:/Sandbox/AIProjectManagement/Rooster-AI-Project-Management commit -m "feat(frontend): reminders + plans services and markdown deps"
```

---

## Task 11: Conditional help drawer content

**Files:**
- Create (conditionally): `web.ui/backend/help/gmail_app_password.md`

- [x] **Step 1: Check whether Plan B already created the file**

```bash
ls C:/Sandbox/AIProjectManagement/Rooster-AI-Project-Management/web.ui/backend/help/gmail_app_password.md 2>&1
```

If the file exists: **skip the rest of this task entirely.** Plan B owns the canonical version.

If the file does not exist: continue with Step 2. Also confirm the `help/` directory exists (created by Plan B's help infrastructure work):

```bash
ls C:/Sandbox/AIProjectManagement/Rooster-AI-Project-Management/web.ui/backend/help/ 2>&1
```

If the directory itself does not exist, Plan B's help module has not yet shipped â€” create the directory but otherwise stay minimal:

```bash
mkdir -p C:/Sandbox/AIProjectManagement/Rooster-AI-Project-Management/web.ui/backend/help
```

- [x] **Step 2: Create the article**

Create `web.ui/backend/help/gmail_app_password.md`:

```markdown
# Generate a Gmail App Password

Reminder emails are sent over Gmail SMTP. Google requires an **app password**
(a one-off 16-character credential) when SMTP auth runs without a browser.

## Steps

1. Open <https://myaccount.google.com/security>.
2. Confirm **2-Step Verification** is **On**. App passwords are only available
   on accounts with 2-Step Verification enabled.
3. Open <https://myaccount.google.com/apppasswords> directly (the link is
   sometimes hidden in the regular Security page).
4. Under **Select app**, choose **Mail**.
5. Under **Select device**, choose **Windows Computer**.
6. Click **Generate**. Google shows a 16-character code grouped as 4 blocks of 4.
7. Copy the code (without spaces) into `web.ui/backend/.env`:

   ```
   GMAIL_APP_PASSWORD=xxxxxxxxxxxxxxxx
   ```

8. Restart the dashboard (tray menu â†’ Restart server, or kill the Node process
   and let Task Scheduler relaunch on next login).

## What to do if the app-password option is missing

- Confirm 2-Step Verification is enabled (Step 2 above).
- The option is hidden for accounts under Google Workspace orgs where the admin
  has disabled less-secure-app access. Use a personal Gmail account, or ask
  your admin to allow app passwords for this account.

## Revocation

Revoke a leaked password at the same `apppasswords` page; deleting the row
invalidates it immediately. Generate a new one and update `.env`.
```

- [x] **Step 3: Verify the help endpoint serves it (if Plan B's help module is merged)**

```bash
cd C:/Sandbox/AIProjectManagement/Rooster-AI-Project-Management/web.ui/backend
node server.js &
SERVER_PID=$!
sleep 2
curl -s http://127.0.0.1:5000/api/help/gmail_app_password | head -c 300
kill $SERVER_PID
```
Expected: markdown body returned. If you get 404, Plan B's help routes are not merged yet â€” file is still committed for when they do.

- [x] **Step 4: Commit (only if you created the file in Step 2)**

```bash
git -C C:/Sandbox/AIProjectManagement/Rooster-AI-Project-Management add web.ui/backend/help/gmail_app_password.md
git -C C:/Sandbox/AIProjectManagement/Rooster-AI-Project-Management commit -m "docs(help): Gmail app password setup instructions"
```

---

## Task 12: Bell badge + popover (live data)

**Files:**
- Modify: `web.ui/frontend-react/src/components/TopBar.tsx`
- Create: `web.ui/frontend-react/src/components/BellPopover.tsx`
- Create: `web.ui/frontend-react/src/components/BellPopover.test.tsx`

- [x] **Step 1: Write failing test for the popover**

Create `web.ui/frontend-react/src/components/BellPopover.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BellPopover } from './BellPopover';
import * as remindersService from '../services/reminders';

vi.mock('../services/reminders');

const sampleReminders = [
  {
    id: 1,
    title: 'KDP Day-30 check: Sudoku Vol 1',
    body: 'How are sales tracking?',
    due_at: '2026-05-26T12:00:00Z',
    channel: 'both' as const,
    status: 'pending' as const,
    source_kind: 'kdp.book',
    source_id: 7,
    payload_json: null,
    fired_at: null,
    created_at: '2026-05-26T12:00:00Z',
  },
  {
    id: 2,
    title: 'Etsy Day-60 gate: Mushroom Mandala',
    body: null,
    due_at: '2026-05-26T13:00:00Z',
    channel: 'email' as const,
    status: 'pending' as const,
    source_kind: 'etsy.listing',
    source_id: 1234567890,
    payload_json: null,
    fired_at: null,
    created_at: '2026-05-26T12:00:00Z',
  },
];

describe('BellPopover', () => {
  beforeEach(() => {
    vi.mocked(remindersService.listReminders).mockResolvedValue(sampleReminders);
    vi.mocked(remindersService.dismissReminder).mockResolvedValue({
      ...sampleReminders[0],
      status: 'dismissed',
    });
    vi.mocked(remindersService.snoozeReminder).mockResolvedValue({
      ...sampleReminders[0],
      due_at: '2026-05-26T13:00:00Z',
    });
  });

  it('renders up to 10 pending reminders sorted by due_at', async () => {
    render(<BellPopover open onClose={() => {}} />);
    await waitFor(() => {
      expect(screen.getByText(/KDP Day-30 check/)).toBeInTheDocument();
      expect(screen.getByText(/Etsy Day-60 gate/)).toBeInTheDocument();
    });
  });

  it('clicking Dismiss calls dismissReminder', async () => {
    render(<BellPopover open onClose={() => {}} />);
    await waitFor(() => screen.getByText(/KDP Day-30 check/));
    const dismissButtons = screen.getAllByRole('button', { name: /dismiss/i });
    fireEvent.click(dismissButtons[0]);
    await waitFor(() => {
      expect(remindersService.dismissReminder).toHaveBeenCalledWith(1);
    });
  });

  it('clicking Snooze 15m calls snoozeReminder with 15', async () => {
    render(<BellPopover open onClose={() => {}} />);
    await waitFor(() => screen.getByText(/KDP Day-30 check/));
    const snoozeButtons = screen.getAllByRole('button', { name: /snooze 15m/i });
    fireEvent.click(snoozeButtons[0]);
    await waitFor(() => {
      expect(remindersService.snoozeReminder).toHaveBeenCalledWith(1, 15);
    });
  });

  it('renders an empty state when there are no reminders', async () => {
    vi.mocked(remindersService.listReminders).mockResolvedValue([]);
    render(<BellPopover open onClose={() => {}} />);
    await waitFor(() => {
      expect(screen.getByText(/no pending reminders/i)).toBeInTheDocument();
    });
  });
});
```

- [x] **Step 2: Run test to confirm failure**

```bash
cd C:/Sandbox/AIProjectManagement/Rooster-AI-Project-Management/web.ui/frontend-react
npm test -- --run BellPopover 2>&1 | tail -10
```
Expected: module not found.

- [x] **Step 3: Implement the popover**

Create `web.ui/frontend-react/src/components/BellPopover.tsx`:

```tsx
import { useEffect, useState, useCallback } from 'react';
import type { Reminder } from '../services/reminders';
import {
  listReminders,
  dismissReminder,
  snoozeReminder,
} from '../services/reminders';

interface BellPopoverProps {
  open: boolean;
  onClose: () => void;
}

export function BellPopover({ open, onClose }: BellPopoverProps) {
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const list = await listReminders('pending');
      setReminders(list.slice(0, 10));
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    }
  }, []);

  useEffect(() => {
    if (open) {
      void refresh();
    }
  }, [open, refresh]);

  if (!open) return null;

  return (
    <div className="bell-popover" role="dialog" aria-label="Pending reminders">
      <header className="bell-popover__header">
        <h2>Pending reminders</h2>
        <button type="button" onClick={onClose} aria-label="Close">
          Ã—
        </button>
      </header>
      {error && <div className="bell-popover__error">Failed to load: {error}</div>}
      {reminders.length === 0 && !error && (
        <p className="bell-popover__empty">No pending reminders.</p>
      )}
      <ul className="bell-popover__list">
        {reminders.map((r) => (
          <li key={r.id} className="bell-popover__row">
            <div className="bell-popover__title">{r.title}</div>
            {r.body && <div className="bell-popover__body">{r.body}</div>}
            <div className="bell-popover__meta">
              <time dateTime={r.due_at}>{new Date(r.due_at).toLocaleString()}</time>
              <span className="bell-popover__channel">{r.channel}</span>
            </div>
            <div className="bell-popover__actions">
              <button
                type="button"
                onClick={async () => {
                  await dismissReminder(r.id);
                  await refresh();
                }}
              >
                Dismiss
              </button>
              <button
                type="button"
                onClick={async () => {
                  await snoozeReminder(r.id, 15);
                  await refresh();
                }}
              >
                Snooze 15m
              </button>
              <button
                type="button"
                onClick={async () => {
                  await snoozeReminder(r.id, 60);
                  await refresh();
                }}
              >
                Snooze 1h
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [x] **Step 4: Wire into TopBar**

Open `web.ui/frontend-react/src/components/TopBar.tsx`. Locate the bell icon (Plan A wired it with a hard-coded `0`). Replace the count + onClick with live state.

The exact existing code in `TopBar.tsx` may vary; the pattern is:

1. Add state for count and popover-open:

```tsx
import { useEffect, useState } from 'react';
import { listReminders } from '../services/reminders';
import { useEventStream } from '../hooks/useEvents';
import { BellPopover } from './BellPopover';

// inside the TopBar component:
const [pendingCount, setPendingCount] = useState(0);
const [popoverOpen, setPopoverOpen] = useState(false);

const refreshCount = async () => {
  try {
    const list = await listReminders('pending');
    setPendingCount(list.length);
  } catch {
    /* keep last count on transient error */
  }
};

useEffect(() => {
  void refreshCount();
  const id = window.setInterval(refreshCount, 30000);
  return () => window.clearInterval(id);
}, []);

useEventStream('reminder:', () => {
  void refreshCount();
});
```

2. Replace the bell render with:

```tsx
<button
  type="button"
  className="topbar__bell"
  onClick={() => setPopoverOpen((v) => !v)}
  aria-label={`${pendingCount} pending reminders`}
>
  ðŸ””
  {pendingCount > 0 && <span className="topbar__badge">{pendingCount}</span>}
</button>
<BellPopover open={popoverOpen} onClose={() => setPopoverOpen(false)} />
```

If the bell icon in your TopBar already uses an SVG or different JSX, preserve that markup â€” only swap the count source and onClick handler.

- [x] **Step 5: Run frontend tests**

```bash
npm test -- --run BellPopover 2>&1 | tail -10
```
Expected: 4 passed.

```bash
npm test 2>&1 | tail -5
```
Expected: full frontend suite passes (Plan A baseline + new tests).

- [x] **Step 6: Commit**

```bash
git -C C:/Sandbox/AIProjectManagement/Rooster-AI-Project-Management add web.ui/frontend-react/src/components/BellPopover.tsx web.ui/frontend-react/src/components/BellPopover.test.tsx web.ui/frontend-react/src/components/TopBar.tsx
git -C C:/Sandbox/AIProjectManagement/Rooster-AI-Project-Management commit -m "feat(reminders): bell badge live count + popover actions"
```

---

## Task 13: /plans page + detail modal

**Files:**
- Modify: `web.ui/frontend-react/src/pages/PlansPage.tsx`
- Create: `web.ui/frontend-react/src/pages/PlansPage.test.tsx`
- Create: `web.ui/frontend-react/src/pages/PlanDetailModal.tsx`

- [x] **Step 1: Write failing test for PlansPage**

Create `web.ui/frontend-react/src/pages/PlansPage.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { PlansPage } from './PlansPage';
import * as plansService from '../services/plans';

vi.mock('../services/plans');

const sample = [
  {
    kind: 'spec' as const,
    title: 'Etsy Plan 2e Design',
    date: '2026-05-22',
    status: 'done' as const,
    path: '/abs/2026-05-22-etsy-plan-2e-design.md',
    slug: 'etsy-plan-2e',
    progress: { open: 0, done: 0, total: 0, percent: 0 },
  },
  {
    kind: 'plan' as const,
    title: 'Etsy Plan 2e Implementation',
    date: '2026-05-22',
    status: 'in-flight' as const,
    path: '/abs/2026-05-22-etsy-plan-2e-implementation.md',
    slug: 'etsy-plan-2e',
    progress: { open: 3, done: 7, total: 10, percent: 70 },
  },
];

describe('PlansPage', () => {
  beforeEach(() => {
    vi.mocked(plansService.listPlans).mockResolvedValue(sample);
    vi.mocked(plansService.getPlan).mockResolvedValue([
      {
        ...sample[1],
        markdown: '# Plan body\n\n- [ ] step',
        frontmatter: { title: 'X' },
      },
    ]);
  });

  it('renders two columns: Specs and Implementation Plans', async () => {
    render(<PlansPage />);
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /specs/i })).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: /implementation plans/i })).toBeInTheDocument();
    });
  });

  it('renders entries in their column with title and date', async () => {
    render(<PlansPage />);
    await waitFor(() => {
      expect(screen.getByText('Etsy Plan 2e Design')).toBeInTheDocument();
      expect(screen.getByText('Etsy Plan 2e Implementation')).toBeInTheDocument();
      // Date appears at least once
      expect(screen.getAllByText('2026-05-22').length).toBeGreaterThanOrEqual(2);
    });
  });

  it('shows progress badge on plan entries', async () => {
    render(<PlansPage />);
    await waitFor(() => {
      expect(screen.getByText('70%')).toBeInTheDocument();
    });
  });

  it('clicking a plan opens the detail modal', async () => {
    render(<PlansPage />);
    await waitFor(() => screen.getByText('Etsy Plan 2e Implementation'));
    fireEvent.click(screen.getByText('Etsy Plan 2e Implementation'));
    await waitFor(() => {
      expect(screen.getByText(/Plan body/)).toBeInTheDocument();
    });
  });
});
```

- [x] **Step 2: Run test to confirm failure**

```bash
cd C:/Sandbox/AIProjectManagement/Rooster-AI-Project-Management/web.ui/frontend-react
npm test -- --run PlansPage 2>&1 | tail -10
```
Expected: tests fail because `PlansPage` is still a placeholder.

- [x] **Step 3: Implement the detail modal**

Create `web.ui/frontend-react/src/pages/PlanDetailModal.tsx`:

```tsx
import { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { getPlan } from '../services/plans';
import type { PlanDetail } from '../services/plans';

interface PlanDetailModalProps {
  slug: string | null;
  onClose: () => void;
}

export function PlanDetailModal({ slug, onClose }: PlanDetailModalProps) {
  const [entries, setEntries] = useState<PlanDetail[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (slug == null) return;
    setEntries([]);
    setError(null);
    void (async () => {
      try {
        const list = await getPlan(slug);
        setEntries(list);
        setActiveIndex(0);
      } catch (err) {
        setError((err as Error).message);
      }
    })();
  }, [slug]);

  if (slug == null) return null;

  return (
    <div className="plan-modal" role="dialog" aria-label="Plan detail">
      <div className="plan-modal__backdrop" onClick={onClose} />
      <div className="plan-modal__panel">
        <header className="plan-modal__header">
          <h2>{entries[activeIndex]?.title ?? 'Loadingâ€¦'}</h2>
          <button type="button" onClick={onClose} aria-label="Close">
            Ã—
          </button>
        </header>
        {entries.length > 1 && (
          <nav className="plan-modal__tabs">
            {entries.map((e, i) => (
              <button
                key={e.path}
                type="button"
                onClick={() => setActiveIndex(i)}
                className={i === activeIndex ? 'is-active' : ''}
              >
                {e.kind === 'plan' ? 'Plan' : 'Spec'}
              </button>
            ))}
          </nav>
        )}
        {error && <div className="plan-modal__error">{error}</div>}
        {entries[activeIndex] && (
          <article className="plan-modal__body">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {entries[activeIndex].markdown}
            </ReactMarkdown>
          </article>
        )}
      </div>
    </div>
  );
}
```

- [x] **Step 4: Replace the placeholder PlansPage**

Overwrite `web.ui/frontend-react/src/pages/PlansPage.tsx`:

```tsx
import { useEffect, useMemo, useState } from 'react';
import { listPlans } from '../services/plans';
import type { PlanEntry } from '../services/plans';
import { PlanDetailModal } from './PlanDetailModal';

export function PlansPage() {
  const [entries, setEntries] = useState<PlanEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [activeSlug, setActiveSlug] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        setEntries(await listPlans());
      } catch (err) {
        setError((err as Error).message);
      }
    })();
  }, []);

  const specs = useMemo(() => entries.filter((e) => e.kind === 'spec'), [entries]);
  const plans = useMemo(() => entries.filter((e) => e.kind === 'plan'), [entries]);

  return (
    <main className="plans-page">
      <h1>Plans</h1>
      {error && <div className="plans-page__error">Failed to load: {error}</div>}
      <div className="plans-page__columns">
        <section className="plans-page__column" aria-labelledby="specs-heading">
          <h2 id="specs-heading">Specs</h2>
          <ul>
            {specs.map((e) => (
              <PlanCard key={e.path} entry={e} onOpen={() => setActiveSlug(e.slug)} />
            ))}
          </ul>
        </section>
        <section className="plans-page__column" aria-labelledby="plans-heading">
          <h2 id="plans-heading">Implementation Plans</h2>
          <ul>
            {plans.map((e) => (
              <PlanCard key={e.path} entry={e} onOpen={() => setActiveSlug(e.slug)} />
            ))}
          </ul>
        </section>
      </div>
      <PlanDetailModal slug={activeSlug} onClose={() => setActiveSlug(null)} />
    </main>
  );
}

function PlanCard({ entry, onOpen }: { entry: PlanEntry; onOpen: () => void }) {
  return (
    <li className={`plan-card plan-card--${entry.status}`}>
      <button type="button" className="plan-card__button" onClick={onOpen}>
        <div className="plan-card__title">{entry.title}</div>
        <div className="plan-card__meta">
          <time dateTime={entry.date}>{entry.date}</time>
          <StatusBadge status={entry.status} />
          {entry.kind === 'plan' && entry.progress.total > 0 && (
            <span className="plan-card__progress">{entry.progress.percent}%</span>
          )}
        </div>
      </button>
    </li>
  );
}

function StatusBadge({ status }: { status: PlanEntry['status'] }) {
  const label = status === 'in-flight' ? 'in flight' : status;
  return <span className={`status-badge status-badge--${status}`}>{label}</span>;
}
```

Make sure the existing route definition for `/plans` in `App.tsx` imports the named export `PlansPage` (`import { PlansPage } from './pages/PlansPage'`). If Plan A used a default export, switch the import or add `export default PlansPage` at the bottom of the new file.

- [x] **Step 5: Run frontend tests**

```bash
npm test -- --run PlansPage 2>&1 | tail -10
```
Expected: 4 passed.

```bash
npm test 2>&1 | tail -5
```
Expected: full frontend suite passes.

- [x] **Step 6: Type-check + build**

```bash
npx tsc --noEmit 2>&1 | tail -10
npm run build 2>&1 | tail -10
```
Expected: no type errors, build succeeds.

- [x] **Step 7: Manual smoke test**

```bash
cd C:/Sandbox/AIProjectManagement/Rooster-AI-Project-Management/web.ui/backend
node server.js &
SERVER_PID=$!
sleep 2
# In another terminal: open http://localhost:5000/plans
# Confirm two columns render with this repo's actual specs/plans.
# Click any plan card; modal opens; markdown is rendered.
kill $SERVER_PID
```

- [x] **Step 8: Commit**

```bash
git -C C:/Sandbox/AIProjectManagement/Rooster-AI-Project-Management add web.ui/frontend-react/src/pages/PlansPage.tsx web.ui/frontend-react/src/pages/PlansPage.test.tsx web.ui/frontend-react/src/pages/PlanDetailModal.tsx
git -C C:/Sandbox/AIProjectManagement/Rooster-AI-Project-Management commit -m "feat(plans): docs scanner + /plans browser"
```

---

## Task 14: Full suite + integration smoke

**Files:**
- None (verification only)

- [x] **Step 1: Backend full suite**

```bash
cd C:/Sandbox/AIProjectManagement/Rooster-AI-Project-Management/web.ui/backend
npm test 2>&1 | tail -10
```
Expected: all green. Compared to the pre-Plan-D baseline, the test count should have grown by approximately 41 (8 repo + 3 toast + 5 email + 6 scheduler + 10 routes + 8 scanner + 4 plans routes â€” actual count may vary by Â±2 if any baseline test names overlap).

- [x] **Step 2: Frontend full suite**

```bash
cd C:/Sandbox/AIProjectManagement/Rooster-AI-Project-Management/web.ui/frontend-react
npm test 2>&1 | tail -10
```
Expected: all green. New tests: 4 (BellPopover) + 4 (PlansPage) = 8 above the Plan A baseline.

- [x] **Step 3: Integration smoke â€” schedule a 90-second-out reminder**

```bash
cd C:/Sandbox/AIProjectManagement/Rooster-AI-Project-Management/web.ui/backend
node server.js &
SERVER_PID=$!
sleep 2

# Compute due_at = now + 90 seconds (cron tick happens at top of next minute)
DUE_AT=$(node -e "console.log(new Date(Date.now() + 90*1000).toISOString())")
echo "Scheduling for: $DUE_AT"

curl -s -X POST http://127.0.0.1:5000/api/reminders \
  -H 'Content-Type: application/json' \
  -d "{\"title\":\"Smoke test\",\"body\":\"Plan D smoke\",\"due_at\":\"$DUE_AT\",\"channel\":\"toast\"}"

# Wait up to 90 seconds for next cron tick + delivery
sleep 95

# Confirm the reminder is now fired
curl -s 'http://127.0.0.1:5000/api/reminders?status=fired' | head -c 400

kill $SERVER_PID
```
Expected: a Windows toast notification appeared on screen with title "Smoke test"; the fired-status query returns one row matching the created reminder.

If toasts do not appear: check that `node-notifier`'s SnoreToast.exe is present at `web.ui/backend/node_modules/node-notifier/vendor/snoreToast/`. The package ships it on Windows; if missing, reinstall.

If the reminder remains pending: the cron tick may not yet have fired (it runs at top-of-minute, so 95s should cover one tick). If still stuck, check `events` table for `reminder:failed` rows.

- [x] **Step 4: Plans browser smoke**

Open `http://localhost:5000/plans` in a browser. Confirm:

- Two columns: Specs and Implementation Plans.
- All current entries from `docs/superpowers/specs/` and `docs/superpowers/plans/` appear, sorted newest first.
- This very plan (`2026-05-26-publishing-ops-dashboard-plan-d-reminders-plans`) appears in the Implementation Plans column. Its progress bar reads close to 100% (since you've checked off each task in this implementation).
- Clicking any card opens the modal and renders the markdown including code blocks and tables.

- [x] **Step 5: No commit (verification task only)**

This task ships no new files. The plan is complete after this verification.

---

## Definition of done

- All 14 tasks committed on the working branch.
- `npm test` green in both `web.ui/backend/` and `web.ui/frontend-react/`.
- A manually-scheduled reminder fires a Windows toast within 60 seconds of its due time and is reflected as `status=fired` in the DB.
- `/api/plans` returns the live docs tree with progress %; `/plans` page in the UI shows both columns and the detail modal works.
- The bell badge in the top bar shows the live pending count and updates within 30 seconds (poll interval) or immediately on `reminder:*` SSE.
- Plan D leaves no orphaned files in `reminders/` or `plans/`. No `console.log` debugging left behind.

## Out of scope (deferred to later plans or never)

- Per-channel retry policies more sophisticated than the "two consecutive failures â†’ degraded banner" rule.
- Calendar integration of reminder events â€” owned by Plan E (Calendar / Pinterest / Profile).
- The Pinterest queue's `pinterest:login-required` reminder ingestion â€” owned by Plan E; this plan's scheduler will deliver it generically once Plan E inserts the row.
- Email HTML formatting beyond the plain-text body. We can add MJML or similar later if reminder emails need richer layout.
- A way to edit a reminder in flight from the UI â€” for v1, dismiss + recreate is the workflow.
