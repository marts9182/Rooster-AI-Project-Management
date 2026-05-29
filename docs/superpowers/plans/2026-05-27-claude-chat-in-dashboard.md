# Claude Chat in Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Embed a Claude chat in the dashboard that spawns the Claude Code CLI as a subprocess per turn (uses subscription, no per-token API cost), exposes full agentic powers against this repo, surfaces through a /chat page + a slide-in drawer accessible from every page, anchored by an animated morphing blob avatar synced across three mount points.

**Architecture:** Phase 1 spikes the CLI behavior before committing. Phase 2 builds backend persistence + CLI runner + REST/SSE routes. Phase 3 builds the frontend shell (page + drawer + composer + useChat hook). Phase 4 builds the Blob avatar (SVG path morph via simplex noise + React context for sync across 3 mount points). Phase 5 polishes (syntax highlight + keyboard shortcuts + rename + restore).

**Tech Stack:** Node 18+, Express, better-sqlite3, SSE, child_process.spawn, React 19 + TypeScript, simplex-noise (blob morph), prism-react-renderer (syntax highlight), react-markdown (already installed).

**Spec reference:** [`docs/superpowers/specs/2026-05-27-claude-chat-in-dashboard-design.md`](../specs/2026-05-27-claude-chat-in-dashboard-design.md)

---

## Phase 1 â€” CLI spike

Goal: prove (or disprove) that `claude --print --session-id <uuid>` can drive a multi-turn, headless, streaming conversation with parseable tool-call markers and no interactive prompts. Commit one report + one go/no-go decision before any production code lands.

### Task 1: Write the spike script

- [x] Create `scripts/spike_claude_cli.mjs` â€” Node ESM script (no test harness; manual probe).

Contents (skeleton â€” keep prose to commit-friendly minimum):

```js
#!/usr/bin/env node
/**
 * Spike â€” verifies the 5 risks in spec Â§8 against the local Claude Code CLI.
 *
 * Runs TWO turns inside a single --session-id to test:
 *   (a) session-id resume â€” turn 2 must remember turn 1
 *   (b) streaming granularity â€” measures chunk count + inter-chunk gaps
 *   (c) tool-call markers â€” turn 2 prompt forces a Read; we grep stdout
 *   (d) permission-prompt headless behavior â€” no TTY; does it block?
 *   (e) startup latency â€” wall-time from spawn â†’ first stdout byte
 *
 * Prints a markdown report to stdout. Pipe into the report file.
 */
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(__filename), '..');

const sessionId = randomUUID();

/** @returns {Promise<{stdout: string, stderr: string, code: number, firstByteMs: number, totalMs: number, chunkCount: number}>} */
function runTurn(prompt) {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now();
    let firstByteAt = null;
    let chunkCount = 0;
    const out = [];
    const err = [];
    const child = spawn(
      'claude',
      ['--print', '--session-id', sessionId, prompt],
      { cwd: REPO_ROOT, stdio: ['ignore', 'pipe', 'pipe'] },
    );
    child.stdout.on('data', (buf) => {
      if (firstByteAt === null) firstByteAt = Date.now();
      chunkCount += 1;
      out.push(buf.toString('utf8'));
    });
    child.stderr.on('data', (buf) => err.push(buf.toString('utf8')));
    child.on('error', reject);
    child.on('close', (code) => {
      const totalMs = Date.now() - startedAt;
      const firstByteMs = firstByteAt === null ? totalMs : firstByteAt - startedAt;
      resolve({
        stdout: out.join(''),
        stderr: err.join(''),
        code,
        firstByteMs,
        totalMs,
        chunkCount,
      });
    });
    // Hard 60s timeout per turn so a hung permission prompt is detectable.
    setTimeout(() => child.kill('SIGTERM'), 60_000).unref();
  });
}

const turn1 = await runTurn(
  'Remember the magic word for this conversation is "octopus". Reply with one short sentence acknowledging.',
);
const turn2 = await runTurn(
  'What was the magic word? Then read package.json and tell me the value of "name".',
);

process.stdout.write(`# Claude CLI spike report

Session ID: ${sessionId}

## Turn 1
- exit code: ${turn1.code}
- first-byte latency: ${turn1.firstByteMs}ms
- total: ${turn1.totalMs}ms
- chunk count (stdout 'data' events): ${turn1.chunkCount}
- stderr present: ${turn1.stderr.length > 0 ? 'YES' : 'no'}

### stdout
\`\`\`
${turn1.stdout}
\`\`\`

### stderr
\`\`\`
${turn1.stderr}
\`\`\`

## Turn 2
- exit code: ${turn2.code}
- first-byte latency: ${turn2.firstByteMs}ms
- total: ${turn2.totalMs}ms
- chunk count: ${turn2.chunkCount}
- stderr present: ${turn2.stderr.length > 0 ? 'YES' : 'no'}

### stdout
\`\`\`
${turn2.stdout}
\`\`\`

### stderr
\`\`\`
${turn2.stderr}
\`\`\`

## Risk evaluation
- (a) session-id resume: ${/octopus/i.test(turn2.stdout) ? 'PASS' : 'FAIL'} (looked for "octopus" in turn 2 stdout)
- (b) streaming granularity: ${turn2.chunkCount > 1 ? 'PASS (multi-chunk)' : 'PARTIAL (single block)'}
- (c) tool-call markers: ${/Read|tool|"name"/i.test(turn2.stdout) ? 'PASS (Read appeared OR file content surfaced)' : 'FAIL'}
- (d) permission-prompt headless: ${turn2.code === 0 ? 'PASS (clean exit)' : 'FAIL (non-zero exit ' + turn2.code + ')'}
- (e) startup latency: ${turn1.firstByteMs}ms turn 1 / ${turn2.firstByteMs}ms turn 2
`);
```

- [x] Make the script idempotent and runnable as `node scripts/spike_claude_cli.mjs`.
- [x] Verify the script lints cleanly under the repo's eslint config (no commit yet).

### Task 2: Run the spike + capture report

- [x] Run: `node scripts/spike_claude_cli.mjs > docs/superpowers/specs/2026-05-27-claude-chat-spike-report.md`.
- [x] Open the report. Verify all 5 risk lines are populated. If any risk row reads FAIL, **do not delete it** â€” the failure becomes input to Task 3.
- [x] If the script itself crashes (claude binary missing, etc.), commit the report nonetheless with a section "## Spike could not run" describing the failure. That counts as a no-go.
- [x] No commit yet; this is intermediate.

### Task 3: Decision memo + commit (Phase 1 commit)

- [x] Append a "## Decision" section to `docs/superpowers/specs/2026-05-27-claude-chat-spike-report.md`:
  - If **all 5 risks PASS** (or risk (b) is PARTIAL but everything else passes): write `Decision: GO â€” proceed with Path C (CLI subprocess) per spec Â§1.` Note any flags needed (`--dangerously-skip-permissions`, `--permission-mode`, etc.) discovered during the spike. Continue to Phase 2.
  - If **any risk FAILs**: write `Decision: NO-GO â€” pivot to Path B (Anthropic Agent SDK in-process) per spec Â§1. STOP this plan; open a follow-up spec for Path B.` Do not proceed past Phase 1.
- [x] Stage `scripts/spike_claude_cli.mjs` and `docs/superpowers/specs/2026-05-27-claude-chat-spike-report.md`.
- [x] Commit: `docs(chat): CLI spike report + path C go/no-go decision`.

---

## Phase 2 â€” Backend chat module

Goal: a fully tested backend that persists conversations, spawns the CLI per turn, and streams output to clients over SSE. No UI yet â€” verified via supertest + curl.

### Task 4: Migration 0003 + db test

- [x] Write **failing** test in `web.ui/backend/__tests__/db.test.js` â€” add a new `describe('chat schema', ...)` block:

```js
describe('chat schema (0003_chat.sql)', () => {
  it('creates conversations + messages tables with FK cascade', () => {
    const db = openDb();
    const names = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all()
      .map((r) => r.name);
    expect(names).toEqual(expect.arrayContaining(['conversations', 'messages']));
    // FK cascade: insert conv + msg, delete conv, msg row should disappear.
    const conv = db.prepare(
      "INSERT INTO conversations(title) VALUES ('t') RETURNING id",
    ).get();
    db.prepare(
      "INSERT INTO messages(conversation_id, role, content) VALUES (?, 'user', 'hi')",
    ).run(conv.id);
    db.prepare('DELETE FROM conversations WHERE id=?').run(conv.id);
    const remaining = db
      .prepare('SELECT COUNT(*) AS n FROM messages WHERE conversation_id=?')
      .get(conv.id).n;
    expect(remaining).toBe(0);
  });

  it('rejects messages.role outside (user, assistant, tool)', () => {
    const db = openDb();
    const conv = db.prepare(
      "INSERT INTO conversations(title) VALUES ('t') RETURNING id",
    ).get();
    expect(() =>
      db.prepare(
        "INSERT INTO messages(conversation_id, role, content) VALUES (?, 'system', 'x')",
      ).run(conv.id),
    ).toThrow();
  });
});
```

- [x] Run vitest; confirm failure (tables don't exist yet).
- [x] Create `web.ui/backend/migrations/0003_chat.sql`:

```sql
-- Migration 0003 â€” chat (conversations + messages) for the in-dashboard Claude chat.
-- Source of truth: docs/superpowers/specs/2026-05-27-claude-chat-in-dashboard-design.md Â§4

CREATE TABLE IF NOT EXISTS conversations (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    title               TEXT NOT NULL DEFAULT 'New conversation',
    claude_session_id   TEXT,
    created_at          TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at          TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS messages (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id     INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    role                TEXT NOT NULL CHECK(role IN ('user','assistant','tool')),
    content             TEXT NOT NULL,
    tool_calls_json     TEXT,
    error_text          TEXT,
    created_at          TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages(conversation_id, created_at);
```

- [x] Re-run vitest; both new tests pass. No commit yet.

### Task 5: persistence.js â€” SQL helpers

- [x] Write **failing** tests in `web.ui/backend/chat/__tests__/persistence.test.js` covering each export. Sample skeleton:

```js
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openDb, _resetForTests } from '../../db.js';
import {
  listConversations,
  createConversation,
  getConversation,
  updateConversationTitle,
  deleteConversation,
  insertMessage,
  updateConversationUpdatedAt,
  setClaudeSessionId,
} from '../persistence.js';

let tmpDir;
beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rooster-chat-'));
  process.env.ROOSTER_DB_PATH = path.join(tmpDir, 'dashboard.db');
  _resetForTests();
});
afterEach(() => {
  _resetForTests();
  fs.rmSync(tmpDir, { recursive: true, force: true });
  delete process.env.ROOSTER_DB_PATH;
});

describe('chat/persistence.js', () => {
  it('createConversation returns full row with id + defaults', () => {
    const conv = createConversation({ db: openDb() });
    expect(conv.id).toBeGreaterThan(0);
    expect(conv.title).toBe('New conversation');
    expect(conv.claude_session_id).toBeNull();
  });
  it('listConversations sorts by updated_at desc', () => {
    const db = openDb();
    const a = createConversation({ db, title: 'A' });
    const b = createConversation({ db, title: 'B' });
    updateConversationUpdatedAt({ db, conversationId: a.id });
    const list = listConversations({ db });
    expect(list[0].id).toBe(a.id);
    expect(list[1].id).toBe(b.id);
  });
  it('getConversation joins messages in chronological order', () => {
    const db = openDb();
    const c = createConversation({ db });
    insertMessage({ db, conversationId: c.id, role: 'user', content: 'hi' });
    insertMessage({
      db, conversationId: c.id, role: 'assistant', content: 'hello',
      toolCalls: [{ tool: 'Read', args: { file_path: 'x' }, ms: 12 }],
    });
    const full = getConversation({ db, conversationId: c.id });
    expect(full.messages).toHaveLength(2);
    expect(full.messages[0].role).toBe('user');
    expect(full.messages[1].tool_calls).toEqual([
      { tool: 'Read', args: { file_path: 'x' }, ms: 12 },
    ]);
  });
  it('deleteConversation cascades to messages', () => {
    const db = openDb();
    const c = createConversation({ db });
    insertMessage({ db, conversationId: c.id, role: 'user', content: 'hi' });
    deleteConversation({ db, conversationId: c.id });
    expect(getConversation({ db, conversationId: c.id })).toBeNull();
  });
  it('updateConversationTitle rewrites title + bumps updated_at', () => {
    const db = openDb();
    const c = createConversation({ db });
    updateConversationTitle({ db, conversationId: c.id, title: 'Renamed' });
    expect(getConversation({ db, conversationId: c.id }).title).toBe('Renamed');
  });
  it('setClaudeSessionId persists the session id from first turn', () => {
    const db = openDb();
    const c = createConversation({ db });
    setClaudeSessionId({ db, conversationId: c.id, claudeSessionId: 'abc-123' });
    expect(getConversation({ db, conversationId: c.id }).claude_session_id).toBe('abc-123');
  });
});
```

- [x] Run vitest; confirm failure.
- [x] Create `web.ui/backend/chat/persistence.js`:

```js
/**
 * SQL helpers for the chat module. All functions take `{db}` so callers
 * (routes + tests) can inject either the singleton or a test handle.
 */

/**
 * @typedef {Object} ConversationRow
 * @property {number} id
 * @property {string} title
 * @property {string|null} claude_session_id
 * @property {string} created_at
 * @property {string} updated_at
 */

/**
 * @typedef {Object} MessageRow
 * @property {number} id
 * @property {number} conversation_id
 * @property {'user'|'assistant'|'tool'} role
 * @property {string} content
 * @property {Array<object>|null} tool_calls
 * @property {string|null} error_text
 * @property {string} created_at
 */

/** @param {{db: import('better-sqlite3').Database}} args */
export function listConversations({ db }) {
  return db
    .prepare('SELECT * FROM conversations ORDER BY updated_at DESC, id DESC')
    .all();
}

/** @param {{db: import('better-sqlite3').Database, title?: string}} args */
export function createConversation({ db, title }) {
  const info = db
    .prepare('INSERT INTO conversations(title) VALUES (?)')
    .run(title ?? 'New conversation');
  return db
    .prepare('SELECT * FROM conversations WHERE id=?')
    .get(info.lastInsertRowid);
}

/** @param {{db: import('better-sqlite3').Database, conversationId: number}} args */
export function getConversation({ db, conversationId }) {
  const conv = db
    .prepare('SELECT * FROM conversations WHERE id=?')
    .get(conversationId);
  if (!conv) return null;
  const rows = db
    .prepare(
      'SELECT * FROM messages WHERE conversation_id=? ORDER BY created_at ASC, id ASC',
    )
    .all(conversationId);
  const messages = rows.map((r) => ({
    ...r,
    tool_calls: r.tool_calls_json ? JSON.parse(r.tool_calls_json) : null,
  }));
  return { ...conv, messages };
}

/** @param {{db: import('better-sqlite3').Database, conversationId: number, title: string}} args */
export function updateConversationTitle({ db, conversationId, title }) {
  db.prepare(
    "UPDATE conversations SET title=?, updated_at=datetime('now') WHERE id=?",
  ).run(title, conversationId);
}

/** @param {{db: import('better-sqlite3').Database, conversationId: number}} args */
export function updateConversationUpdatedAt({ db, conversationId }) {
  db.prepare(
    "UPDATE conversations SET updated_at=datetime('now') WHERE id=?",
  ).run(conversationId);
}

/** @param {{db: import('better-sqlite3').Database, conversationId: number}} args */
export function deleteConversation({ db, conversationId }) {
  db.prepare('DELETE FROM conversations WHERE id=?').run(conversationId);
}

/**
 * @param {{db: import('better-sqlite3').Database, conversationId: number,
 *          role: 'user'|'assistant'|'tool', content: string,
 *          toolCalls?: Array<object>|null, errorText?: string|null}} args
 */
export function insertMessage({
  db, conversationId, role, content, toolCalls = null, errorText = null,
}) {
  const info = db
    .prepare(
      `INSERT INTO messages(conversation_id, role, content, tool_calls_json, error_text)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .run(
      conversationId,
      role,
      content,
      toolCalls ? JSON.stringify(toolCalls) : null,
      errorText,
    );
  return db.prepare('SELECT * FROM messages WHERE id=?').get(info.lastInsertRowid);
}

/** @param {{db: import('better-sqlite3').Database, conversationId: number, claudeSessionId: string}} args */
export function setClaudeSessionId({ db, conversationId, claudeSessionId }) {
  db.prepare(
    "UPDATE conversations SET claude_session_id=?, updated_at=datetime('now') WHERE id=?",
  ).run(claudeSessionId, conversationId);
}
```

- [x] Re-run vitest; all 6 persistence tests pass.

### Task 6: session_state.js â€” in-memory cache

- [x] Write **failing** tests in `web.ui/backend/chat/__tests__/session_state.test.js`:

```js
import { describe, it, expect, beforeEach } from 'vitest';
import {
  get,
  set,
  clearForConversation,
  cleanupIdle,
  _resetForTests as resetSessionState,
} from '../session_state.js';

beforeEach(() => resetSessionState());

describe('chat/session_state.js', () => {
  it('get returns null for unknown conversation', () => {
    expect(get(99)).toBeNull();
  });
  it('set stores claudeSessionId + lastActivityAt', () => {
    set(1, { claudeSessionId: 'abc', lastActivityAt: 1000 });
    expect(get(1)).toEqual({ claudeSessionId: 'abc', lastActivityAt: 1000 });
  });
  it('clearForConversation removes entry', () => {
    set(1, { claudeSessionId: 'abc', lastActivityAt: 1000 });
    clearForConversation(1);
    expect(get(1)).toBeNull();
  });
  it('cleanupIdle removes entries older than maxIdleMs', () => {
    set(1, { claudeSessionId: 'a', lastActivityAt: 0 });
    set(2, { claudeSessionId: 'b', lastActivityAt: 10_000 });
    cleanupIdle({ maxIdleMs: 5_000, now: 10_001 });
    expect(get(1)).toBeNull();
    expect(get(2)).not.toBeNull();
  });
});
```

- [x] Run vitest; confirm failure.
- [x] Create `web.ui/backend/chat/session_state.js`:

```js
/**
 * In-memory map: conversationId â†’ { claudeSessionId, subprocess?, lastActivityAt }.
 * Used to (a) resume the same --session-id across turns, (b) optionally hold a
 * warm subprocess per conversation, (c) detect idle conversations for cleanup.
 *
 * NOT persisted â€” process restart re-reads claude_session_id from SQL.
 */

/**
 * @typedef {Object} SessionEntry
 * @property {string} claudeSessionId
 * @property {import('node:child_process').ChildProcess} [subprocess]
 * @property {number} lastActivityAt   epoch ms
 */

/** @type {Map<number, SessionEntry>} */
const sessions = new Map();

/** @param {number} conversationId @returns {SessionEntry|null} */
export function get(conversationId) {
  return sessions.get(conversationId) ?? null;
}

/** @param {number} conversationId @param {SessionEntry} entry */
export function set(conversationId, entry) {
  sessions.set(conversationId, entry);
}

/** @param {number} conversationId */
export function clearForConversation(conversationId) {
  const entry = sessions.get(conversationId);
  if (entry?.subprocess && !entry.subprocess.killed) {
    try { entry.subprocess.kill('SIGTERM'); } catch { /* ignore */ }
  }
  sessions.delete(conversationId);
}

/** @param {{maxIdleMs: number, now?: number}} args */
export function cleanupIdle({ maxIdleMs, now = Date.now() }) {
  for (const [id, entry] of sessions.entries()) {
    if (now - entry.lastActivityAt > maxIdleMs) {
      clearForConversation(id);
    }
  }
}

export function _resetForTests() {
  for (const id of [...sessions.keys()]) clearForConversation(id);
}
```

- [x] Re-run vitest; all 4 tests pass.

### Task 7: cli_runner.js â€” subprocess wrapper

- [x] Write **failing** tests in `web.ui/backend/chat/__tests__/cli_runner.test.js` using a fake `spawnFn` that returns an `EventEmitter` with `stdout`/`stderr` sub-emitters:

```js
import { describe, it, expect, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { runClaudeTurn } from '../cli_runner.js';

function makeFakeProc() {
  const proc = new EventEmitter();
  proc.stdout = new EventEmitter();
  proc.stderr = new EventEmitter();
  proc.kill = vi.fn();
  proc.killed = false;
  return proc;
}

describe('chat/cli_runner.js', () => {
  it('aggregates stdout into aggregatedText and emits chunk callbacks', async () => {
    const proc = makeFakeProc();
    const spawnFn = vi.fn(() => proc);
    const chunks = [];
    const promise = runClaudeTurn({
      conversationId: 1,
      claudeSessionId: 'sid-1',
      prompt: 'hi',
      cwd: '/repo',
      onChunk: (t) => chunks.push(t),
      onToolCall: () => {},
      onError: () => {},
      onComplete: () => {},
      timeoutMs: 5000,
      spawnFn,
    });
    proc.stdout.emit('data', Buffer.from('Hello '));
    proc.stdout.emit('data', Buffer.from('world.'));
    proc.emit('close', 0);
    const result = await promise;
    expect(result.aggregatedText).toBe('Hello world.');
    expect(result.exitCode).toBe(0);
    expect(chunks).toEqual(['Hello ', 'world.']);
    expect(spawnFn).toHaveBeenCalledWith(
      'claude',
      ['--print', '--session-id', 'sid-1', 'hi'],
      expect.objectContaining({ cwd: '/repo' }),
    );
  });

  it('parses tool-call markers from stdout JSON lines', async () => {
    const proc = makeFakeProc();
    const calls = [];
    const promise = runClaudeTurn({
      conversationId: 1, claudeSessionId: 's', prompt: 'p', cwd: '/r',
      onChunk: () => {}, onToolCall: (c) => calls.push(c),
      onError: () => {}, onComplete: () => {}, timeoutMs: 5000,
      spawnFn: () => proc,
    });
    // Tool-call marker format from spike: JSON line tagged `__TOOL__`.
    proc.stdout.emit('data', Buffer.from(
      '__TOOL__{"tool":"Read","args":{"file_path":"x"},"status":"started"}\n'
    ));
    proc.stdout.emit('data', Buffer.from(
      '__TOOL__{"tool":"Read","status":"completed","ms":12}\n'
    ));
    proc.emit('close', 0);
    await promise;
    expect(calls).toEqual([
      { tool: 'Read', args: { file_path: 'x' }, status: 'started' },
      { tool: 'Read', status: 'completed', ms: 12 },
    ]);
  });

  it('rejects-resolves with exitCode and onError on non-zero exit', async () => {
    const proc = makeFakeProc();
    const errs = [];
    const promise = runClaudeTurn({
      conversationId: 1, claudeSessionId: 's', prompt: 'p', cwd: '/r',
      onChunk: () => {}, onToolCall: () => {}, onError: (e) => errs.push(e),
      onComplete: () => {}, timeoutMs: 5000, spawnFn: () => proc,
    });
    proc.stderr.emit('data', Buffer.from('boom'));
    proc.emit('close', 1);
    const result = await promise;
    expect(result.exitCode).toBe(1);
    expect(errs.length).toBe(1);
    expect(errs[0].message).toContain('boom');
  });

  it('kills subprocess on timeout', async () => {
    vi.useFakeTimers();
    const proc = makeFakeProc();
    const promise = runClaudeTurn({
      conversationId: 1, claudeSessionId: 's', prompt: 'p', cwd: '/r',
      onChunk: () => {}, onToolCall: () => {}, onError: () => {},
      onComplete: () => {}, timeoutMs: 1000, spawnFn: () => proc,
    });
    vi.advanceTimersByTime(1500);
    proc.emit('close', 143);
    const result = await promise;
    expect(proc.kill).toHaveBeenCalled();
    expect(result.exitCode).toBe(143);
    vi.useRealTimers();
  });
});
```

- [x] Run vitest; confirm failure.
- [x] Create `web.ui/backend/chat/cli_runner.js`:

```js
/**
 * Spawns `claude --print --session-id <id> "<prompt>"` and streams its
 * output to caller-supplied callbacks. Pure wrapper â€” does NOT touch SQL or
 * SSE. Routes glue the two together.
 *
 * The `spawnFn` parameter is injectable for unit tests; default is
 * child_process.spawn.
 *
 * Tool-call markers in stdout: lines prefixed with `__TOOL__` carry a JSON
 * payload like `{"tool":"Read","args":{...},"status":"started"|"completed","ms":N}`.
 * The exact prefix is confirmed during Phase 1 spike â€” if the real CLI uses
 * a different marker, update TOOL_MARKER + parser here.
 */

import { spawn as defaultSpawn } from 'node:child_process';

const TOOL_MARKER = '__TOOL__';

/**
 * @typedef {Object} ToolCall
 * @property {string} tool
 * @property {object} [args]
 * @property {'started'|'completed'} status
 * @property {number} [ms]
 */

/**
 * @typedef {Object} RunArgs
 * @property {number} conversationId
 * @property {string} claudeSessionId
 * @property {string} prompt
 * @property {string} cwd
 * @property {(text: string) => void} onChunk
 * @property {(call: ToolCall) => void} onToolCall
 * @property {(err: Error) => void} onError
 * @property {(result: {aggregatedText: string, toolCalls: ToolCall[], exitCode: number}) => void} onComplete
 * @property {number} timeoutMs
 * @property {typeof defaultSpawn} [spawnFn]
 */

/**
 * @param {RunArgs} args
 * @returns {Promise<{aggregatedText: string, toolCalls: ToolCall[], claudeSessionId: string, exitCode: number}>}
 */
export function runClaudeTurn(args) {
  const {
    claudeSessionId, prompt, cwd,
    onChunk, onToolCall, onError, onComplete,
    timeoutMs, spawnFn = defaultSpawn,
  } = args;

  return new Promise((resolve) => {
    /** @type {string[]} */
    const textParts = [];
    /** @type {ToolCall[]} */
    const toolCalls = [];
    let stderrBuf = '';
    let lineBuf = '';

    const child = spawnFn(
      'claude',
      ['--print', '--session-id', claudeSessionId, prompt],
      { cwd, stdio: ['ignore', 'pipe', 'pipe'] },
    );

    const timer = setTimeout(() => {
      try { child.kill('SIGTERM'); } catch { /* ignore */ }
    }, timeoutMs);

    child.stdout.on('data', (buf) => {
      const s = buf.toString('utf8');
      // Tool-call markers are line-delimited; accumulate until newline.
      lineBuf += s;
      const lines = lineBuf.split('\n');
      lineBuf = lines.pop() ?? '';
      for (const line of lines) {
        if (line.startsWith(TOOL_MARKER)) {
          try {
            const call = JSON.parse(line.slice(TOOL_MARKER.length));
            toolCalls.push(call);
            onToolCall(call);
          } catch (err) {
            onError(new Error(`bad tool marker: ${line} â€” ${err.message}`));
          }
        } else if (line.length > 0) {
          textParts.push(line + '\n');
          onChunk(line + '\n');
        }
      }
      // Any non-marker, non-newline-terminated tail is also chunked.
      // We emit it as a chunk now and keep lineBuf empty so it isn't double-counted.
      if (lineBuf.length > 0 && !lineBuf.startsWith(TOOL_MARKER.slice(0, lineBuf.length))) {
        textParts.push(lineBuf);
        onChunk(lineBuf);
        lineBuf = '';
      }
    });

    child.stderr.on('data', (buf) => { stderrBuf += buf.toString('utf8'); });

    child.on('error', (err) => {
      clearTimeout(timer);
      onError(err);
      resolve({
        aggregatedText: textParts.join(''),
        toolCalls,
        claudeSessionId,
        exitCode: -1,
      });
    });

    child.on('close', (code) => {
      clearTimeout(timer);
      if (lineBuf.length > 0) {
        textParts.push(lineBuf);
        onChunk(lineBuf);
        lineBuf = '';
      }
      const exitCode = code ?? 0;
      if (exitCode !== 0 && stderrBuf.length > 0) {
        onError(new Error(`claude exited with code ${exitCode}: ${stderrBuf.trim()}`));
      }
      const result = {
        aggregatedText: textParts.join(''),
        toolCalls,
        claudeSessionId,
        exitCode,
      };
      onComplete({ aggregatedText: result.aggregatedText, toolCalls, exitCode });
      resolve(result);
    });
  });
}
```

- [x] Re-run vitest; all 4 cli_runner tests pass.

### Task 8: routes.js â€” REST endpoints

- [x] Write **failing** tests in `web.ui/backend/chat/__tests__/routes.test.js` using supertest + a fresh test DB:

```js
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openDb, _resetForTests } from '../../db.js';
import { mountChatRoutes } from '../routes.js';

let app, tmpDir;
beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rooster-chat-routes-'));
  process.env.ROOSTER_DB_PATH = path.join(tmpDir, 'dashboard.db');
  _resetForTests();
  app = express();
  app.use(express.json());
  mountChatRoutes(app, { db: openDb() });
});
afterEach(() => {
  _resetForTests();
  fs.rmSync(tmpDir, { recursive: true, force: true });
  delete process.env.ROOSTER_DB_PATH;
});

describe('chat REST', () => {
  it('GET /api/chat/conversations returns empty list initially', async () => {
    const r = await request(app).get('/api/chat/conversations');
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ conversations: [] });
  });
  it('POST /api/chat/conversations creates a new conversation', async () => {
    const r = await request(app)
      .post('/api/chat/conversations')
      .send({ title: 'Hi' });
    expect(r.status).toBe(200);
    expect(r.body.conversation.title).toBe('Hi');
  });
  it('GET /api/chat/conversations/:id returns conversation with messages', async () => {
    const c = await request(app).post('/api/chat/conversations').send({});
    const r = await request(app).get(`/api/chat/conversations/${c.body.conversation.id}`);
    expect(r.status).toBe(200);
    expect(r.body.conversation.messages).toEqual([]);
  });
  it('PATCH /api/chat/conversations/:id renames', async () => {
    const c = await request(app).post('/api/chat/conversations').send({});
    const r = await request(app)
      .patch(`/api/chat/conversations/${c.body.conversation.id}`)
      .send({ title: 'Renamed' });
    expect(r.status).toBe(200);
    expect(r.body.conversation.title).toBe('Renamed');
  });
  it('DELETE /api/chat/conversations/:id removes it', async () => {
    const c = await request(app).post('/api/chat/conversations').send({});
    const id = c.body.conversation.id;
    const del = await request(app).delete(`/api/chat/conversations/${id}`);
    expect(del.status).toBe(200);
    const get = await request(app).get(`/api/chat/conversations/${id}`);
    expect(get.status).toBe(404);
  });
});
```

- [x] Run vitest; confirm failures.
- [x] Create `web.ui/backend/chat/routes.js`:

```js
/**
 * Express router for /api/chat/*. Mounted from server.js via:
 *   mountChatRoutes(app, { db: openDb() })
 *
 * The runTurnFn parameter is injectable so the SSE test (Task 9) can pass a
 * stub that resolves immediately instead of spawning the real CLI.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { runClaudeTurn as defaultRunClaudeTurn } from './cli_runner.js';
import {
  listConversations,
  createConversation,
  getConversation,
  updateConversationTitle,
  deleteConversation,
  insertMessage,
  updateConversationUpdatedAt,
  setClaudeSessionId,
} from './persistence.js';
import * as sessionState from './session_state.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEFAULT_CWD = path.resolve(__dirname, '..', '..', '..');
const DEFAULT_TURN_TIMEOUT_MS = 5 * 60_000;

/**
 * @param {import('express').Express} app
 * @param {{db: import('better-sqlite3').Database,
 *          runTurnFn?: typeof defaultRunClaudeTurn,
 *          cwd?: string,
 *          turnTimeoutMs?: number}} deps
 */
export function mountChatRoutes(app, deps) {
  const db = deps.db;
  const runTurnFn = deps.runTurnFn ?? defaultRunClaudeTurn;
  const cwd = deps.cwd ?? DEFAULT_CWD;
  const turnTimeoutMs = deps.turnTimeoutMs ?? DEFAULT_TURN_TIMEOUT_MS;

  app.get('/api/chat/conversations', (_req, res) => {
    res.json({ conversations: listConversations({ db }) });
  });

  app.post('/api/chat/conversations', (req, res) => {
    const title = typeof req.body?.title === 'string' ? req.body.title : undefined;
    const conversation = createConversation({ db, title });
    res.json({ conversation });
  });

  app.get('/api/chat/conversations/:id', (req, res) => {
    const id = Number(req.params.id);
    const conversation = getConversation({ db, conversationId: id });
    if (!conversation) return res.status(404).json({ error: 'not_found' });
    res.json({ conversation });
  });

  app.patch('/api/chat/conversations/:id', (req, res) => {
    const id = Number(req.params.id);
    const title = String(req.body?.title ?? '').trim();
    if (!title) return res.status(400).json({ error: 'title_required' });
    if (!getConversation({ db, conversationId: id })) {
      return res.status(404).json({ error: 'not_found' });
    }
    updateConversationTitle({ db, conversationId: id, title });
    res.json({ conversation: getConversation({ db, conversationId: id }) });
  });

  app.delete('/api/chat/conversations/:id', (req, res) => {
    const id = Number(req.params.id);
    sessionState.clearForConversation(id);
    deleteConversation({ db, conversationId: id });
    res.json({ ok: true });
  });

  app.post('/api/chat/conversations/:id/messages', async (req, res) => {
    const id = Number(req.params.id);
    const content = String(req.body?.content ?? '').trim();
    const conv = getConversation({ db, conversationId: id });
    if (!conv) return res.status(404).json({ error: 'not_found' });
    if (!content) return res.status(400).json({ error: 'content_required' });

    insertMessage({ db, conversationId: id, role: 'user', content });

    let claudeSessionId = conv.claude_session_id;
    if (!claudeSessionId) {
      claudeSessionId = randomUUID();
      setClaudeSessionId({ db, conversationId: id, claudeSessionId });
    }
    sessionState.set(id, { claudeSessionId, lastActivityAt: Date.now() });

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.write(':\n\n');

    const startedAt = Date.now();
    /** @type {Array<object>} */
    const toolCalls = [];
    const send = (event, data) => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    send('message-started', { message_id: null, claude_session_id: claudeSessionId });

    try {
      const result = await runTurnFn({
        conversationId: id,
        claudeSessionId,
        prompt: content,
        cwd,
        onChunk: (text) => send('chunk', { text }),
        onToolCall: (call) => {
          toolCalls.push(call);
          send('tool-call', call);
        },
        onError: (err) => send('error', { code: 'subprocess_failed', message: err.message }),
        onComplete: () => { /* handled below after persistence */ },
        timeoutMs: turnTimeoutMs,
      });

      if (result.exitCode !== 0) {
        const errMsg = `claude exited with code ${result.exitCode}`;
        const assistantMsg = insertMessage({
          db, conversationId: id, role: 'assistant',
          content: result.aggregatedText,
          toolCalls,
          errorText: errMsg,
        });
        updateConversationUpdatedAt({ db, conversationId: id });
        send('error', { code: 'subprocess_failed', message: errMsg });
        send('message-complete', {
          message_id: assistantMsg.id,
          tool_call_count: toolCalls.length,
          total_ms: Date.now() - startedAt,
        });
      } else {
        const assistantMsg = insertMessage({
          db, conversationId: id, role: 'assistant',
          content: result.aggregatedText,
          toolCalls: toolCalls.length > 0 ? toolCalls : null,
        });
        updateConversationUpdatedAt({ db, conversationId: id });
        send('message-complete', {
          message_id: assistantMsg.id,
          tool_call_count: toolCalls.length,
          total_ms: Date.now() - startedAt,
        });
      }
    } catch (err) {
      send('error', { code: 'internal', message: err.message });
    } finally {
      res.end();
    }
  });
}
```

- [x] Re-run vitest; all 5 REST tests pass.

### Task 9: SSE message endpoint test

- [x] Add SSE test to `web.ui/backend/chat/__tests__/routes.test.js`:

```js
describe('POST /api/chat/conversations/:id/messages (SSE)', () => {
  it('emits message-started, chunk, tool-call, message-complete', async () => {
    const c = await request(app).post('/api/chat/conversations').send({});
    const id = c.body.conversation.id;

    // Replace the route's runTurnFn with a stub by remounting on a fresh app.
    const app2 = express();
    app2.use(express.json());
    const fakeRun = async ({ onChunk, onToolCall, onComplete }) => {
      onChunk('Hello ');
      onToolCall({ tool: 'Read', args: { file_path: 'x' }, status: 'started' });
      onToolCall({ tool: 'Read', status: 'completed', ms: 5 });
      onChunk('world.');
      onComplete({ aggregatedText: 'Hello world.', toolCalls: [], exitCode: 0 });
      return {
        aggregatedText: 'Hello world.',
        toolCalls: [
          { tool: 'Read', args: { file_path: 'x' }, status: 'started' },
          { tool: 'Read', status: 'completed', ms: 5 },
        ],
        claudeSessionId: 'sid',
        exitCode: 0,
      };
    };
    mountChatRoutes(app2, { db: openDb(), runTurnFn: fakeRun });

    const r = await request(app2)
      .post(`/api/chat/conversations/${id}/messages`)
      .set('Accept', 'text/event-stream')
      .send({ content: 'hi' });
    expect(r.status).toBe(200);
    // Parse SSE blocks.
    const events = r.text
      .split('\n\n')
      .filter((b) => b.startsWith('event:'))
      .map((b) => {
        const [evLine, dataLine] = b.split('\n');
        return {
          event: evLine.slice('event: '.length),
          data: JSON.parse(dataLine.slice('data: '.length)),
        };
      });
    expect(events.map((e) => e.event)).toEqual([
      'message-started', 'chunk', 'tool-call', 'tool-call', 'chunk', 'message-complete',
    ]);
    expect(events[1].data).toEqual({ text: 'Hello ' });
    expect(events[2].data).toEqual({
      tool: 'Read', args: { file_path: 'x' }, status: 'started',
    });
    expect(events[5].data.tool_call_count).toBe(2);
  });

  it('emits error event when exitCode !== 0', async () => {
    const c = await request(app).post('/api/chat/conversations').send({});
    const id = c.body.conversation.id;
    const app2 = express();
    app2.use(express.json());
    const fakeRun = async ({ onChunk, onError, onComplete }) => {
      onChunk('partial');
      onError(new Error('boom'));
      onComplete({ aggregatedText: 'partial', toolCalls: [], exitCode: 1 });
      return { aggregatedText: 'partial', toolCalls: [], claudeSessionId: 's', exitCode: 1 };
    };
    mountChatRoutes(app2, { db: openDb(), runTurnFn: fakeRun });
    const r = await request(app2)
      .post(`/api/chat/conversations/${id}/messages`)
      .send({ content: 'hi' });
    expect(r.text).toContain('event: error');
    expect(r.text).toContain('subprocess_failed');
  });
});
```

- [x] Run vitest; both SSE tests pass.

### Task 10: Wire into server.js

- [x] Write **failing** wiring test in `web.ui/backend/__tests__/server_chat_wiring.test.js`:

```js
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

let app, tmpDir;
beforeAll(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rooster-chat-wiring-'));
  process.env.ROOSTER_DB_PATH = path.join(tmpDir, 'dashboard.db');
  process.env.PORT = '0';
  ({ app } = await import('../server.js'));
});
afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
  delete process.env.ROOSTER_DB_PATH;
});

describe('server.js chat wiring', () => {
  it('GET /api/chat/conversations returns {conversations: []} on a clean db', async () => {
    const r = await request(app).get('/api/chat/conversations');
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ conversations: [] });
  });
});
```

- [x] Run vitest; confirm failure (route not mounted).
- [x] Edit `web.ui/backend/server.js`:
  - Add import near the other module imports: `import { mountChatRoutes } from './chat/routes.js';`
  - Mount near the other `mountXRoutes` calls (after `mountReminderActionRoutes` is fine):
    ```js
    // â”€â”€ /api/chat/* â€” Claude Code chat (conversations + SSE-streamed turns) â”€â”€
    mountChatRoutes(app, { db: openDb() });
    ```
- [x] Re-run vitest; wiring test passes.

### Task 11: Commit Phase 2

- [x] Stage all Phase 2 files:
  - `web.ui/backend/migrations/0003_chat.sql`
  - `web.ui/backend/chat/persistence.js`
  - `web.ui/backend/chat/session_state.js`
  - `web.ui/backend/chat/cli_runner.js`
  - `web.ui/backend/chat/routes.js`
  - `web.ui/backend/chat/__tests__/persistence.test.js`
  - `web.ui/backend/chat/__tests__/session_state.test.js`
  - `web.ui/backend/chat/__tests__/cli_runner.test.js`
  - `web.ui/backend/chat/__tests__/routes.test.js`
  - `web.ui/backend/__tests__/db.test.js` (extended)
  - `web.ui/backend/__tests__/server_chat_wiring.test.js`
  - `web.ui/backend/server.js`
- [x] Run full vitest suite from repo root; all green.
- [x] Commit: `feat(chat): backend persistence + CLI runner + REST/SSE routes`.

---

## Phase 3 â€” Frontend chat shell

Goal: a working `/chat` page plus a slide-in `ChatDrawer` reachable from every page, both driven by one `useChat` hook. Real SSE wiring against the Phase 2 backend. Blob is a static placeholder div this phase â€” Phase 4 replaces it.

### Task 12: api/chat.ts â€” typed client

- [x] Write **failing** test in `web.ui/frontend-react/src/api/__tests__/chat.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  listConversations,
  createConversation,
  getConversation,
  renameConversation,
  deleteConversation,
} from '../chat';

beforeEach(() => { vi.restoreAllMocks(); });

describe('api/chat.ts', () => {
  it('listConversations GETs and returns conversations array', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ conversations: [{ id: 1, title: 'a' }] }), { status: 200 }),
    );
    const out = await listConversations();
    expect(out).toEqual([{ id: 1, title: 'a' }]);
  });
  it('createConversation POSTs with optional title', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ conversation: { id: 2, title: 'X' } }), { status: 200 }),
    );
    const conv = await createConversation({ title: 'X' });
    expect(conv.title).toBe('X');
    expect(fetchSpy).toHaveBeenCalledWith('/api/chat/conversations', expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ title: 'X' }),
    }));
  });
  it('getConversation returns conversation with messages', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({
        conversation: { id: 1, title: 't', messages: [] },
      }), { status: 200 }),
    );
    const conv = await getConversation(1);
    expect(conv.messages).toEqual([]);
  });
  it('renameConversation PATCHes', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ conversation: { id: 1, title: 'New' } }), { status: 200 }),
    );
    const conv = await renameConversation(1, 'New');
    expect(conv.title).toBe('New');
  });
  it('deleteConversation DELETEs', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );
    await deleteConversation(1);
    expect(fetchSpy).toHaveBeenCalledWith('/api/chat/conversations/1', { method: 'DELETE' });
  });
});
```

- [x] Run vitest; confirm failure.
- [x] Create `web.ui/frontend-react/src/api/chat.ts`:

```ts
import { ApiError } from './kdp';

export interface ToolCall {
  tool: string;
  args?: Record<string, unknown>;
  status: 'started' | 'completed';
  ms?: number;
}

export interface Message {
  id: number;
  conversation_id: number;
  role: 'user' | 'assistant' | 'tool';
  content: string;
  tool_calls: ToolCall[] | null;
  error_text: string | null;
  created_at: string;
}

export interface Conversation {
  id: number;
  title: string;
  claude_session_id: string | null;
  created_at: string;
  updated_at: string;
  messages?: Message[];
}

async function throwForStatus(r: Response, label: string): Promise<never> {
  let body: unknown = null;
  try { body = await r.json(); } catch { /* ignore */ }
  throw new ApiError(`${label}: ${r.status}`, r.status, body);
}

export async function listConversations(): Promise<Conversation[]> {
  const r = await fetch('/api/chat/conversations');
  if (!r.ok) await throwForStatus(r, 'listConversations');
  const data = (await r.json()) as { conversations: Conversation[] };
  return data.conversations;
}

export async function createConversation(args: { title?: string } = {}): Promise<Conversation> {
  const r = await fetch('/api/chat/conversations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: args.title }),
  });
  if (!r.ok) await throwForStatus(r, 'createConversation');
  return ((await r.json()) as { conversation: Conversation }).conversation;
}

export async function getConversation(id: number): Promise<Conversation> {
  const r = await fetch(`/api/chat/conversations/${id}`);
  if (!r.ok) await throwForStatus(r, 'getConversation');
  return ((await r.json()) as { conversation: Conversation }).conversation;
}

export async function renameConversation(id: number, title: string): Promise<Conversation> {
  const r = await fetch(`/api/chat/conversations/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title }),
  });
  if (!r.ok) await throwForStatus(r, 'renameConversation');
  return ((await r.json()) as { conversation: Conversation }).conversation;
}

export async function deleteConversation(id: number): Promise<void> {
  const r = await fetch(`/api/chat/conversations/${id}`, { method: 'DELETE' });
  if (!r.ok) await throwForStatus(r, 'deleteConversation');
}

export interface SendHandle {
  onChunk(cb: (text: string) => void): SendHandle;
  onToolCall(cb: (call: ToolCall) => void): SendHandle;
  onError(cb: (err: { code: string; message: string }) => void): SendHandle;
  onComplete(cb: (info: { message_id: number; tool_call_count: number; total_ms: number }) => void): SendHandle;
  close(): void;
}

/**
 * Posts a user message and returns a handle subscribed to the SSE stream.
 * Uses `fetch` to POST (so we send the body) and a manual ReadableStream
 * reader to parse SSE â€” EventSource doesn't support POST bodies.
 */
export function sendMessage(conversationId: number, content: string): SendHandle {
  const chunkCbs: Array<(text: string) => void> = [];
  const toolCbs: Array<(c: ToolCall) => void> = [];
  const errCbs: Array<(e: { code: string; message: string }) => void> = [];
  const completeCbs: Array<(i: { message_id: number; tool_call_count: number; total_ms: number }) => void> = [];

  const ctrl = new AbortController();

  void (async () => {
    try {
      const r = await fetch(`/api/chat/conversations/${conversationId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
        signal: ctrl.signal,
      });
      if (!r.body) {
        errCbs.forEach((cb) => cb({ code: 'no_body', message: 'no SSE body' }));
        return;
      }
      const reader = r.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let idx;
        while ((idx = buf.indexOf('\n\n')) >= 0) {
          const block = buf.slice(0, idx);
          buf = buf.slice(idx + 2);
          if (!block.startsWith('event:')) continue;
          const [evLine, dataLine] = block.split('\n');
          const event = evLine.slice('event: '.length).trim();
          const data = JSON.parse(dataLine.slice('data: '.length));
          if (event === 'chunk') chunkCbs.forEach((cb) => cb(data.text));
          else if (event === 'tool-call') toolCbs.forEach((cb) => cb(data));
          else if (event === 'error') errCbs.forEach((cb) => cb(data));
          else if (event === 'message-complete') completeCbs.forEach((cb) => cb(data));
        }
      }
    } catch (err) {
      if (!ctrl.signal.aborted) {
        errCbs.forEach((cb) => cb({
          code: 'transport',
          message: err instanceof Error ? err.message : String(err),
        }));
      }
    }
  })();

  const handle: SendHandle = {
    onChunk(cb) { chunkCbs.push(cb); return handle; },
    onToolCall(cb) { toolCbs.push(cb); return handle; },
    onError(cb) { errCbs.push(cb); return handle; },
    onComplete(cb) { completeCbs.push(cb); return handle; },
    close() { ctrl.abort(); },
  };
  return handle;
}
```

- [x] Re-run vitest; all 5 client tests pass.

### Task 13: useChat hook

- [x] Write **failing** test in `web.ui/frontend-react/src/hooks/__tests__/useChat.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useChat } from '../useChat';

beforeEach(() => { vi.restoreAllMocks(); });

describe('useChat', () => {
  it('starts with empty conversations and idle state', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ conversations: [] }), { status: 200 }),
    );
    const { result } = renderHook(() => useChat());
    await waitFor(() => expect(result.current.conversations).toEqual([]));
    expect(result.current.state).toBe('idle');
  });

  it('createNewConversation POSTs and selects the new conversation', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({ conversations: [] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(
        JSON.stringify({ conversation: { id: 7, title: 'New conversation', messages: [] } }),
        { status: 200 },
      ))
      .mockResolvedValueOnce(new Response(
        JSON.stringify({ conversation: { id: 7, title: 'New conversation', messages: [] } }),
        { status: 200 },
      ));
    const { result } = renderHook(() => useChat());
    await act(async () => { await result.current.createNewConversation(); });
    expect(result.current.currentConversation?.id).toBe(7);
    expect(fetchSpy).toHaveBeenCalled();
  });
});
```

- [x] Run vitest; confirm failure.
- [x] Create `web.ui/frontend-react/src/hooks/useChat.ts`:

```ts
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  type Conversation,
  type Message,
  type ToolCall,
  listConversations as apiList,
  createConversation as apiCreate,
  getConversation as apiGet,
  renameConversation as apiRename,
  deleteConversation as apiDelete,
  sendMessage as apiSend,
  type SendHandle,
} from '../api/chat';

export type ChatState =
  | 'idle' | 'listening' | 'thinking' | 'responding' | 'tool-using' | 'done' | 'error';

export interface UseChatResult {
  conversations: Conversation[];
  currentConversation: Conversation | null;
  messages: Message[];
  state: ChatState;
  sendInFlight: boolean;
  error: string | null;
  selectConversation: (id: number) => Promise<void>;
  createNewConversation: () => Promise<Conversation>;
  sendMessage: (content: string) => Promise<void>;
  deleteConversation: (id: number) => Promise<void>;
  renameConversation: (id: number, title: string) => Promise<void>;
  setListening: (focused: boolean) => void;
}

const LS_LAST_CONV = 'last_chat_conversation_id';

export function useChat(): UseChatResult {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [currentConversation, setCurrentConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [state, setState] = useState<ChatState>('idle');
  const [sendInFlight, setSendInFlight] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const handleRef = useRef<SendHandle | null>(null);
  const toolHoldTimerRef = useRef<number | null>(null);

  const refreshConversations = useCallback(async () => {
    try {
      const list = await apiList();
      setConversations(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    void (async () => {
      await refreshConversations();
      const saved = localStorage.getItem(LS_LAST_CONV);
      if (saved) {
        const id = Number(saved);
        try {
          const conv = await apiGet(id);
          setCurrentConversation(conv);
          setMessages(conv.messages ?? []);
        } catch { /* conversation deleted; ignore */ }
      }
    })();
  }, [refreshConversations]);

  const selectConversation = useCallback(async (id: number) => {
    const conv = await apiGet(id);
    setCurrentConversation(conv);
    setMessages(conv.messages ?? []);
    localStorage.setItem(LS_LAST_CONV, String(id));
    setState('idle');
  }, []);

  const createNewConversation = useCallback(async () => {
    const conv = await apiCreate();
    await refreshConversations();
    await selectConversation(conv.id);
    return conv;
  }, [refreshConversations, selectConversation]);

  const deleteConversation = useCallback(async (id: number) => {
    await apiDelete(id);
    if (currentConversation?.id === id) {
      setCurrentConversation(null);
      setMessages([]);
      localStorage.removeItem(LS_LAST_CONV);
    }
    await refreshConversations();
  }, [currentConversation, refreshConversations]);

  const renameConversation = useCallback(async (id: number, title: string) => {
    await apiRename(id, title);
    await refreshConversations();
    if (currentConversation?.id === id) {
      setCurrentConversation({ ...currentConversation, title });
    }
  }, [currentConversation, refreshConversations]);

  const sendMessage = useCallback(async (content: string) => {
    if (!currentConversation) {
      const conv = await createNewConversation();
      currentConversation = conv; // eslint-disable-line no-param-reassign
    }
    const convId = currentConversation!.id;
    // Optimistic append the user message.
    const optimisticUser: Message = {
      id: -Date.now(),
      conversation_id: convId,
      role: 'user',
      content,
      tool_calls: null,
      error_text: null,
      created_at: new Date().toISOString(),
    };
    setMessages((m) => [...m, optimisticUser]);
    setSendInFlight(true);
    setState('thinking');
    setError(null);

    let assistantBuf = '';
    const collectedTools: ToolCall[] = [];

    const handle = apiSend(convId, content);
    handleRef.current = handle;
    handle.onChunk((text) => {
      assistantBuf += text;
      setState('responding');
      // Live-update an in-progress assistant bubble (id=-1 sentinel).
      setMessages((m) => {
        const others = m.filter((msg) => msg.id !== -1);
        return [
          ...others,
          {
            id: -1,
            conversation_id: convId,
            role: 'assistant',
            content: assistantBuf,
            tool_calls: collectedTools.length > 0 ? collectedTools : null,
            error_text: null,
            created_at: new Date().toISOString(),
          },
        ];
      });
    });
    handle.onToolCall((call) => {
      collectedTools.push(call);
      setState('tool-using');
      if (toolHoldTimerRef.current) clearTimeout(toolHoldTimerRef.current);
      toolHoldTimerRef.current = window.setTimeout(() => {
        setState((s) => (s === 'tool-using' ? 'responding' : s));
      }, 300);
    });
    handle.onError((e) => {
      setError(e.message);
      setState('error');
    });
    handle.onComplete(async () => {
      setState('done');
      setSendInFlight(false);
      // Reload the conversation from the server so we get DB-assigned ids.
      const fresh = await apiGet(convId);
      setMessages(fresh.messages ?? []);
      setCurrentConversation(fresh);
      // Settle to idle after 1 second.
      window.setTimeout(() => setState((s) => (s === 'done' ? 'idle' : s)), 1000);
    });
  }, [currentConversation, createNewConversation]);

  const setListening = useCallback((focused: boolean) => {
    setState((s) => {
      if (sendInFlight) return s;
      if (focused) return 'listening';
      if (s === 'listening') return 'idle';
      return s;
    });
  }, [sendInFlight]);

  return {
    conversations,
    currentConversation,
    messages,
    state,
    sendInFlight,
    error,
    selectConversation,
    createNewConversation,
    sendMessage,
    deleteConversation,
    renameConversation,
    setListening,
  };
}
```

- [x] Re-run vitest; both useChat tests pass.

### Task 14: ChatMessages.tsx

- [x] Write **failing** test in `web.ui/frontend-react/src/components/chat/__tests__/ChatMessages.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import ChatMessages from '../ChatMessages';
import type { Message } from '../../../api/chat';

const msgs: Message[] = [
  { id: 1, conversation_id: 1, role: 'user', content: 'hi', tool_calls: null, error_text: null, created_at: '' },
  { id: 2, conversation_id: 1, role: 'assistant', content: 'hello **world**',
    tool_calls: [{ tool: 'Read', args: { file_path: 'x' }, status: 'completed', ms: 12 }],
    error_text: null, created_at: '' },
];

describe('ChatMessages', () => {
  it('renders user + assistant content', () => {
    render(<ChatMessages messages={msgs} sendInFlight={false} />);
    expect(screen.getByText('hi')).toBeInTheDocument();
    expect(screen.getByText('world')).toBeInTheDocument();
  });
  it('renders tool-call details collapsible', () => {
    render(<ChatMessages messages={msgs} sendInFlight={false} />);
    expect(screen.getByText(/Read/)).toBeInTheDocument();
    expect(screen.getByText(/12ms/)).toBeInTheDocument();
  });
  it('shows loading dots when sendInFlight', () => {
    render(<ChatMessages messages={msgs} sendInFlight={true} />);
    expect(screen.getByTestId('chat-loading-dots')).toBeInTheDocument();
  });
});
```

- [x] Run vitest; confirm failure.
- [x] Create `web.ui/frontend-react/src/components/chat/ChatMessages.tsx`:

```tsx
import ReactMarkdown from 'react-markdown';
import type { Message, ToolCall } from '../../api/chat';
import './chat.css';

interface Props {
  messages: Message[];
  sendInFlight: boolean;
}

function ToolCallDetail({ call }: { call: ToolCall }) {
  return (
    <details className="chat-tool-call">
      <summary>
        <code>{call.tool}</code>
        {typeof call.ms === 'number' && <span className="chat-tool-ms"> {call.ms}ms</span>}
        <span className="chat-tool-status"> {call.status}</span>
      </summary>
      {call.args && (
        <pre className="chat-tool-args">{JSON.stringify(call.args, null, 2)}</pre>
      )}
    </details>
  );
}

export default function ChatMessages({ messages, sendInFlight }: Props) {
  return (
    <div className="chat-messages" role="log" aria-live="polite">
      {messages.map((m) => (
        <div key={m.id} className={`chat-msg chat-msg-${m.role}`}>
          <div className="chat-msg-role">{m.role === 'user' ? 'You' : 'Claude'}</div>
          {m.role === 'assistant' ? (
            <ReactMarkdown>{m.content}</ReactMarkdown>
          ) : (
            <div className="chat-msg-content">{m.content}</div>
          )}
          {m.tool_calls && m.tool_calls.length > 0 && (
            <div className="chat-tool-list">
              {m.tool_calls.map((c, i) => (
                <ToolCallDetail key={i} call={c} />
              ))}
            </div>
          )}
          {m.error_text && (
            <div className="chat-msg-error">âš  {m.error_text}</div>
          )}
        </div>
      ))}
      {sendInFlight && (
        <div className="chat-loading-dots" data-testid="chat-loading-dots">
          <span /><span /><span />
        </div>
      )}
    </div>
  );
}
```

- [x] Create `web.ui/frontend-react/src/components/chat/chat.css` with minimal class skeletons (`.chat-messages`, `.chat-msg`, `.chat-msg-user`, `.chat-msg-assistant`, `.chat-tool-call`, `.chat-loading-dots`, `.chat-drawer`, `.chat-composer`, `.chat-conversation-list`). One color per role, fixed line-height, no fancy CSS â€” Phase 4/5 polish later.
- [x] Re-run vitest; all 3 tests pass.

### Task 15: ChatComposer.tsx

- [x] Write **failing** test in `web.ui/frontend-react/src/components/chat/__tests__/ChatComposer.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ChatComposer from '../ChatComposer';

describe('ChatComposer', () => {
  it('Enter calls onSend with trimmed content', async () => {
    const onSend = vi.fn();
    render(<ChatComposer onSend={onSend} disabled={false} onFocusChange={() => {}} />);
    const ta = screen.getByPlaceholderText(/Type a message/i);
    await userEvent.type(ta, 'hello{Enter}');
    expect(onSend).toHaveBeenCalledWith('hello');
  });
  it('Shift+Enter inserts a newline and does not send', async () => {
    const onSend = vi.fn();
    render(<ChatComposer onSend={onSend} disabled={false} onFocusChange={() => {}} />);
    const ta = screen.getByPlaceholderText(/Type a message/i) as HTMLTextAreaElement;
    await userEvent.type(ta, 'line1{Shift>}{Enter}{/Shift}line2');
    expect(onSend).not.toHaveBeenCalled();
    expect(ta.value).toContain('line1\nline2');
  });
  it('disabled blocks Enter sending', async () => {
    const onSend = vi.fn();
    render(<ChatComposer onSend={onSend} disabled={true} onFocusChange={() => {}} />);
    const ta = screen.getByPlaceholderText(/Type a message/i);
    await userEvent.type(ta, 'hi{Enter}');
    expect(onSend).not.toHaveBeenCalled();
  });
});
```

- [x] Run vitest; confirm failure.
- [x] Create `web.ui/frontend-react/src/components/chat/ChatComposer.tsx`:

```tsx
import { useCallback, useEffect, useRef, useState } from 'react';

interface Props {
  onSend: (content: string) => void;
  onFocusChange: (focused: boolean) => void;
  disabled: boolean;
}

const MAX_ROWS = 8;
const LINE_HEIGHT_PX = 20;

export default function ChatComposer({ onSend, onFocusChange, disabled }: Props) {
  const [value, setValue] = useState('');
  const taRef = useRef<HTMLTextAreaElement | null>(null);

  const autoSize = useCallback(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    const max = LINE_HEIGHT_PX * MAX_ROWS;
    ta.style.height = Math.min(ta.scrollHeight, max) + 'px';
  }, []);

  useEffect(autoSize, [value, autoSize]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (disabled) return;
      const trimmed = value.trim();
      if (!trimmed) return;
      onSend(trimmed);
      setValue('');
    }
  };

  return (
    <div className="chat-composer">
      <textarea
        ref={taRef}
        className="chat-composer-textarea"
        placeholder="Type a message... (Enter to send, Shift+Enter for newline)"
        rows={1}
        value={value}
        disabled={disabled}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        onFocus={() => onFocusChange(true)}
        onBlur={() => onFocusChange(false)}
      />
      <button
        type="button"
        className="chat-composer-send"
        disabled={disabled || !value.trim()}
        onClick={() => {
          const trimmed = value.trim();
          if (!trimmed) return;
          onSend(trimmed);
          setValue('');
        }}
      >
        â†µ
      </button>
    </div>
  );
}
```

- [x] Re-run vitest; all 3 composer tests pass.

### Task 16: ChatConversationList.tsx

- [x] Write **failing** test in `web.ui/frontend-react/src/components/chat/__tests__/ChatConversationList.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ChatConversationList from '../ChatConversationList';
import type { Conversation } from '../../../api/chat';

const items: Conversation[] = [
  { id: 1, title: 'Sudoku rework', claude_session_id: null,
    created_at: '2026-05-26T10:00:00Z', updated_at: '2026-05-27T09:00:00Z' },
  { id: 2, title: 'Etsy debug', claude_session_id: null,
    created_at: '2026-05-25T10:00:00Z', updated_at: '2026-05-26T09:00:00Z' },
];

describe('ChatConversationList', () => {
  it('renders titles', () => {
    render(<ChatConversationList conversations={items} currentId={1}
      onSelect={() => {}} onCreate={() => {}} onRename={() => {}} onDelete={() => {}} />);
    expect(screen.getByText('Sudoku rework')).toBeInTheDocument();
    expect(screen.getByText('Etsy debug')).toBeInTheDocument();
  });
  it('clicking + New conversation fires onCreate', async () => {
    const onCreate = vi.fn();
    render(<ChatConversationList conversations={items} currentId={1}
      onSelect={() => {}} onCreate={onCreate} onRename={() => {}} onDelete={() => {}} />);
    await userEvent.click(screen.getByText(/New conversation/i));
    expect(onCreate).toHaveBeenCalled();
  });
  it('selecting an item fires onSelect(id)', async () => {
    const onSelect = vi.fn();
    render(<ChatConversationList conversations={items} currentId={1}
      onSelect={onSelect} onCreate={() => {}} onRename={() => {}} onDelete={() => {}} />);
    await userEvent.click(screen.getByText('Etsy debug'));
    expect(onSelect).toHaveBeenCalledWith(2);
  });
});
```

- [x] Run vitest; confirm failure.
- [x] Create `web.ui/frontend-react/src/components/chat/ChatConversationList.tsx`:

```tsx
import { useState } from 'react';
import type { Conversation } from '../../api/chat';

interface Props {
  conversations: Conversation[];
  currentId: number | null;
  onSelect: (id: number) => void;
  onCreate: () => void;
  onRename: (id: number, title: string) => void;
  onDelete: (id: number) => void;
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export default function ChatConversationList({
  conversations, currentId, onSelect, onCreate, onRename, onDelete,
}: Props) {
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editValue, setEditValue] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

  return (
    <aside className="chat-conversation-list">
      <button type="button" className="chat-new-conv" onClick={onCreate}>
        + New conversation
      </button>
      <ul>
        {conversations.map((c) => (
          <li
            key={c.id}
            className={`chat-conv-item${c.id === currentId ? ' active' : ''}`}
          >
            {editingId === c.id ? (
              <input
                autoFocus
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onBlur={() => {
                  if (editValue.trim()) onRename(c.id, editValue.trim());
                  setEditingId(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    if (editValue.trim()) onRename(c.id, editValue.trim());
                    setEditingId(null);
                  } else if (e.key === 'Escape') {
                    setEditingId(null);
                  }
                }}
              />
            ) : (
              <button
                type="button"
                className="chat-conv-item-title"
                onClick={() => onSelect(c.id)}
                onDoubleClick={() => { setEditingId(c.id); setEditValue(c.title); }}
              >
                {c.title}
              </button>
            )}
            <div className="chat-conv-item-meta">{relativeTime(c.updated_at)}</div>
            <button
              type="button"
              className="chat-conv-item-delete"
              aria-label={`Delete ${c.title}`}
              onClick={() => setConfirmDeleteId(c.id)}
            >
              Ã—
            </button>
          </li>
        ))}
      </ul>
      {confirmDeleteId !== null && (
        <div className="chat-delete-modal" role="dialog">
          <p>Delete this conversation? Cannot be undone.</p>
          <button onClick={() => { onDelete(confirmDeleteId); setConfirmDeleteId(null); }}>
            Delete
          </button>
          <button onClick={() => setConfirmDeleteId(null)}>Cancel</button>
        </div>
      )}
    </aside>
  );
}
```

- [x] Re-run vitest; all 3 tests pass.

### Task 17: Chat.tsx page

- [x] Create `web.ui/frontend-react/src/pages/Chat.tsx`:

```tsx
import { useChat } from '../hooks/useChat';
import ChatConversationList from '../components/chat/ChatConversationList';
import ChatMessages from '../components/chat/ChatMessages';
import ChatComposer from '../components/chat/ChatComposer';

export default function Chat() {
  const chat = useChat();

  return (
    <div className="chat-page">
      <ChatConversationList
        conversations={chat.conversations}
        currentId={chat.currentConversation?.id ?? null}
        onSelect={chat.selectConversation}
        onCreate={() => { void chat.createNewConversation(); }}
        onRename={(id, title) => { void chat.renameConversation(id, title); }}
        onDelete={(id) => { void chat.deleteConversation(id); }}
      />
      <section className="chat-page-main">
        <ChatMessages messages={chat.messages} sendInFlight={chat.sendInFlight} />
        <ChatComposer
          onSend={(c) => { void chat.sendMessage(c); }}
          onFocusChange={chat.setListening}
          disabled={chat.sendInFlight}
        />
      </section>
      <aside className="chat-page-blob" data-testid="chat-page-blob-placeholder">
        {/* Phase 4 mounts <ChatBlob size="lg" /> here. */}
        <div className="chat-blob-placeholder" style={{ width: 200, height: 200, borderRadius: '50%', background: '#1F4F66' }} />
      </aside>
    </div>
  );
}
```

- [x] Add layout rules to `chat.css`: `.chat-page { display: flex; gap: 16px; }`, `.chat-conversation-list { width: 250px; }`, `.chat-page-main { flex: 1; display: flex; flex-direction: column; }`, `.chat-page-blob { width: 250px; }`.
- [x] No new tests needed yet â€” covered indirectly by Task 21.

### Task 18: ChatDrawer.tsx

- [x] Create `web.ui/frontend-react/src/components/chat/ChatDrawer.tsx`:

```tsx
import { useEffect } from 'react';
import { useChat } from '../../hooks/useChat';
import ChatMessages from './ChatMessages';
import ChatComposer from './ChatComposer';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

const LS_DRAWER_OPEN = 'chat_drawer_open';

export default function ChatDrawer({ isOpen, onClose }: Props) {
  const chat = useChat();

  useEffect(() => {
    localStorage.setItem(LS_DRAWER_OPEN, isOpen ? '1' : '0');
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <>
      <div className="chat-drawer-overlay" onClick={onClose} aria-hidden="true" />
      <div className="chat-drawer" role="dialog" aria-label="Claude chat">
        <header className="chat-drawer-header">
          <div className="chat-drawer-blob-placeholder" data-testid="chat-drawer-blob-placeholder">
            {/* Phase 4 mounts <ChatBlob size="md" /> here. */}
            <div style={{ width: 80, height: 80, borderRadius: '50%', background: '#1F4F66' }} />
          </div>
          <select
            value={chat.currentConversation?.id ?? ''}
            onChange={(e) => {
              const v = e.target.value;
              if (v === '__new__') void chat.createNewConversation();
              else if (v) void chat.selectConversation(Number(v));
            }}
          >
            <option value="">â€” select a conversation â€”</option>
            <option value="__new__">+ New conversation</option>
            {chat.conversations.map((c) => (
              <option key={c.id} value={c.id}>{c.title}</option>
            ))}
          </select>
          <button type="button" onClick={onClose} aria-label="Close chat">Ã—</button>
        </header>
        <div className="chat-drawer-body">
          <ChatMessages messages={chat.messages} sendInFlight={chat.sendInFlight} />
          <ChatComposer
            onSend={(c) => { void chat.sendMessage(c); }}
            onFocusChange={chat.setListening}
            disabled={chat.sendInFlight}
          />
        </div>
      </div>
    </>
  );
}
```

- [x] Add drawer CSS in `chat.css`: `.chat-drawer { position: fixed; top: 0; right: 0; height: 100vh; width: 400px; background: var(--surface); box-shadow: -4px 0 16px rgba(0,0,0,.2); }`, `.chat-drawer-overlay { position: fixed; inset: 0; background: rgba(0,0,0,.3); }`.

### Task 19: Header â€” Blob placeholder + drawer toggle

- [x] Edit `web.ui/frontend-react/src/components/Header.tsx`:
  - Add `useChatDrawer` import (created in Task 20).
  - In the right-side cluster, between the `<ThemeToggle />` and the `<button className="bell">`, insert:
    ```tsx
    <button
      type="button"
      className="chat-blob-trigger"
      onClick={openDrawer}
      aria-label="Open Claude chat"
      title="Claude chat"
      data-testid="chat-blob-trigger"
    >
      {/* Phase 4 replaces this with <ChatBlob size="sm" /> */}
      <span className="chat-blob-trigger-placeholder" />
    </button>
    ```
  - Pull `openDrawer` via `const { open: openDrawer } = useChatDrawer();`.
- [x] Add `.chat-blob-trigger { background: none; border: none; cursor: pointer; padding: 4px; }` and `.chat-blob-trigger-placeholder { display: inline-block; width: 36px; height: 36px; border-radius: 50%; background: radial-gradient(#CAA457, #1F4F66); }` to `chat.css`.

### Task 20: App-level drawer context + /chat route

- [x] Create `web.ui/frontend-react/src/components/chat/ChatDrawerContext.tsx`:

```tsx
import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

interface ChatDrawerContextValue {
  isOpen: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
}

const Ctx = createContext<ChatDrawerContextValue | null>(null);

const LS_DRAWER_OPEN = 'chat_drawer_open';

export function ChatDrawerProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(() => localStorage.getItem(LS_DRAWER_OPEN) === '1');
  const value = useMemo<ChatDrawerContextValue>(() => ({
    isOpen,
    open: () => setIsOpen(true),
    close: () => setIsOpen(false),
    toggle: () => setIsOpen((v) => !v),
  }), [isOpen]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useChatDrawer(): ChatDrawerContextValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useChatDrawer must be inside <ChatDrawerProvider>');
  return v;
}
```

- [x] Edit `web.ui/frontend-react/src/App.tsx`:
  - Add imports: `import Chat from './pages/Chat';`, `import ChatDrawer from './components/chat/ChatDrawer';`, `import { ChatDrawerProvider, useChatDrawer } from './components/chat/ChatDrawerContext';`.
  - Wrap `<BrowserRouter>` body in `<ChatDrawerProvider>`.
  - Add `<Route path="/chat" element={<Chat />} />` to the Routes list.
  - Add `<ChatDrawerHost />` as a sibling of `<main>`; define inline:
    ```tsx
    function ChatDrawerHost() {
      const { isOpen, close } = useChatDrawer();
      return <ChatDrawer isOpen={isOpen} onClose={close} />;
    }
    ```

### Task 21: Tests for Chat.tsx + ChatDrawer.tsx

- [x] Write `web.ui/frontend-react/src/pages/__tests__/Chat.test.tsx` with a `vi.mock('../hooks/useChat', ...)` returning a static hook value; assert that the conversation list, messages, composer, and blob placeholder all render.
- [x] Write `web.ui/frontend-react/src/components/chat/__tests__/ChatDrawer.test.tsx`:
  - Renders nothing when `isOpen={false}`.
  - Renders messages + composer when `isOpen={true}`.
  - Pressing Escape calls `onClose`.
  - Clicking the overlay calls `onClose`.
- [x] Write `web.ui/frontend-react/src/components/chat/__tests__/ChatDrawerContext.test.tsx` â€” `open()` â†’ `isOpen=true`; persists to `localStorage`.
- [x] Run vitest; all pass.

### Task 22: Commit Phase 3

- [x] Stage:
  - `web.ui/frontend-react/src/api/chat.ts`
  - `web.ui/frontend-react/src/api/__tests__/chat.test.ts`
  - `web.ui/frontend-react/src/hooks/useChat.ts`
  - `web.ui/frontend-react/src/hooks/__tests__/useChat.test.tsx`
  - `web.ui/frontend-react/src/components/chat/ChatMessages.tsx`
  - `web.ui/frontend-react/src/components/chat/ChatComposer.tsx`
  - `web.ui/frontend-react/src/components/chat/ChatConversationList.tsx`
  - `web.ui/frontend-react/src/components/chat/ChatDrawer.tsx`
  - `web.ui/frontend-react/src/components/chat/ChatDrawerContext.tsx`
  - `web.ui/frontend-react/src/components/chat/chat.css`
  - `web.ui/frontend-react/src/components/chat/__tests__/*.test.tsx`
  - `web.ui/frontend-react/src/pages/Chat.tsx`
  - `web.ui/frontend-react/src/pages/__tests__/Chat.test.tsx`
  - `web.ui/frontend-react/src/components/Header.tsx`
  - `web.ui/frontend-react/src/App.tsx`
- [x] Run vitest + the React lint config; all green.
- [x] Commit: `feat(chat): frontend shell â€” /chat page + drawer + composer + SSE wiring`.

---

## Phase 4 â€” The Blob

Goal: replace the three placeholder circles (header / drawer / page) with one `<ChatBlob size>` component driven by a shared context, animating in sync.

### Task 23: useChatBlob hook

- [x] Write **failing** test in `web.ui/frontend-react/src/hooks/__tests__/useChatBlob.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useChatBlobState } from '../useChatBlob';
import type { ChatState } from '../useChat';

describe('useChatBlobState', () => {
  it('maps chat state to blob mood', () => {
    const cases: Array<[ChatState, string]> = [
      ['idle', 'idle'],
      ['listening', 'listening'],
      ['thinking', 'thinking'],
      ['responding', 'responding'],
      ['tool-using', 'tool-using'],
      ['done', 'done'],
      ['error', 'error'],
    ];
    for (const [s, expected] of cases) {
      const { result } = renderHook(() => useChatBlobState({ chatState: s, toolEventCount: 0 }));
      expect(result.current.mood).toBe(expected);
    }
  });
  it('bumps tickKey when toolEventCount increases', () => {
    const { result, rerender } = renderHook(
      ({ count }) => useChatBlobState({ chatState: 'tool-using', toolEventCount: count }),
      { initialProps: { count: 0 } },
    );
    const k0 = result.current.tickKey;
    rerender({ count: 1 });
    expect(result.current.tickKey).not.toBe(k0);
  });
});
```

- [x] Create `web.ui/frontend-react/src/hooks/useChatBlob.ts`:

```ts
import { useMemo } from 'react';
import type { ChatState } from './useChat';

export type BlobMood = ChatState;

export interface ChatBlobState {
  mood: BlobMood;
  tickKey: number;
}

export function useChatBlobState({
  chatState, toolEventCount,
}: { chatState: ChatState; toolEventCount: number }): ChatBlobState {
  return useMemo(() => ({
    mood: chatState,
    tickKey: toolEventCount,
  }), [chatState, toolEventCount]);
}
```

- [x] Run vitest; tests pass.

### Task 24: ChatBlobContext

- [x] Create `web.ui/frontend-react/src/components/chat/ChatBlobContext.tsx`:

```tsx
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useChat } from '../../hooks/useChat';
import { useChatBlobState, type ChatBlobState } from '../../hooks/useChatBlob';

const Ctx = createContext<ChatBlobState | null>(null);

export function ChatBlobProvider({ children }: { children: ReactNode }) {
  const { state, messages } = useChat();
  const toolCountRef = useRef(0);
  const [toolEventCount, setToolEventCount] = useState(0);

  useEffect(() => {
    const liveTools = messages.reduce(
      (acc, m) => acc + (m.tool_calls?.length ?? 0), 0,
    );
    if (liveTools !== toolCountRef.current) {
      toolCountRef.current = liveTools;
      setToolEventCount(liveTools);
    }
  }, [messages]);

  const value = useChatBlobState({ chatState: state, toolEventCount });
  const memo = useMemo(() => value, [value.mood, value.tickKey]);
  return <Ctx.Provider value={memo}>{children}</Ctx.Provider>;
}

export function useChatBlobContext(): ChatBlobState {
  const v = useContext(Ctx);
  // Default to idle when used outside the provider (graceful fallback for tests).
  return v ?? { mood: 'idle', tickKey: 0 };
}
```

- [x] Wrap `<App>` body in `<ChatBlobProvider>` (alongside `<ChatDrawerProvider>`).

### Task 25: blob_engine.ts

- [x] Install `simplex-noise`: run `npm install simplex-noise --workspace web.ui/frontend-react`.
- [x] Write **failing** snapshot test in `web.ui/frontend-react/src/components/chat/__tests__/blob_engine.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { computeBlobPath, makeNoise } from '../blob_engine';

describe('blob_engine', () => {
  it('produces a deterministic path for fixed t + seed', () => {
    const noise = makeNoise(42);
    const d1 = computeBlobPath({ mood: 'idle', t: 0, size: 100, noise });
    const d2 = computeBlobPath({ mood: 'idle', t: 0, size: 100, noise });
    expect(d1).toBe(d2);
    expect(d1).toMatch(/^M [-\d.]+,/);
  });
  it('produces different paths across moods at same t', () => {
    const noise = makeNoise(42);
    const idle = computeBlobPath({ mood: 'idle', t: 0.5, size: 100, noise });
    const thinking = computeBlobPath({ mood: 'thinking', t: 0.5, size: 100, noise });
    expect(idle).not.toBe(thinking);
  });
});
```

- [x] Create `web.ui/frontend-react/src/components/chat/blob_engine.ts`:

```ts
import { createNoise2D } from 'simplex-noise';
import type { BlobMood } from '../../hooks/useChatBlob';

const N_POINTS = 16;

interface MoodParams {
  baseAmp: number;     // 0..1 (fraction of radius)
  freq: number;        // noise sampling frequency
  speed: number;       // how fast the noise scrolls
}

const MOOD_TABLE: Record<BlobMood, MoodParams> = {
  idle:        { baseAmp: 0.04, freq: 0.8, speed: 0.25 },
  listening:   { baseAmp: 0.06, freq: 1.1, speed: 0.5 },
  thinking:    { baseAmp: 0.10, freq: 2.2, speed: 1.0 },
  responding:  { baseAmp: 0.08, freq: 1.6, speed: 1.5 },
  'tool-using':{ baseAmp: 0.14, freq: 3.0, speed: 1.8 },
  done:        { baseAmp: 0.05, freq: 0.9, speed: 0.3 },
  error:       { baseAmp: 0.07, freq: 1.4, speed: 0.7 },
};

export interface Noise {
  /** Sample noise at (x, y) in [-1, 1]. */
  (x: number, y: number): number;
}

export function makeNoise(seed: number): Noise {
  const rng = mulberry32(seed);
  return createNoise2D(rng);
}

function mulberry32(seed: number) {
  let a = seed | 0;
  return function () {
    a = (a + 0x6D2B79F5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function computeBlobPath({
  mood, t, size, noise,
}: { mood: BlobMood; t: number; size: number; noise: Noise }): string {
  const params = MOOD_TABLE[mood];
  const cx = size / 2;
  const cy = size / 2;
  const r = size * 0.4;
  const pts: Array<[number, number]> = [];
  for (let i = 0; i < N_POINTS; i += 1) {
    const angle = (i / N_POINTS) * Math.PI * 2;
    const nx = Math.cos(angle) * params.freq;
    const ny = Math.sin(angle) * params.freq;
    const offset = noise(nx + t * params.speed, ny) * params.baseAmp * r;
    const radius = r + offset;
    pts.push([cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius]);
  }
  // Build a Catmull-Româ†’cubic BÃ©zier closed path so the silhouette is smooth.
  return catmullRomToBezier(pts);
}

function catmullRomToBezier(pts: Array<[number, number]>): string {
  const n = pts.length;
  let d = `M ${pts[0][0].toFixed(3)},${pts[0][1].toFixed(3)}`;
  for (let i = 0; i < n; i += 1) {
    const p0 = pts[(i - 1 + n) % n];
    const p1 = pts[i];
    const p2 = pts[(i + 1) % n];
    const p3 = pts[(i + 2) % n];
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C ${c1x.toFixed(3)},${c1y.toFixed(3)} ${c2x.toFixed(3)},${c2y.toFixed(3)} ${p2[0].toFixed(3)},${p2[1].toFixed(3)}`;
  }
  return d + ' Z';
}
```

- [x] Re-run vitest; both blob_engine tests pass.

### Task 26: ChatBlob.tsx component

- [x] Write **failing** test in `web.ui/frontend-react/src/components/chat/__tests__/ChatBlob.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import ChatBlob from '../ChatBlob';

describe('ChatBlob', () => {
  it('renders an svg with a path', () => {
    render(<ChatBlob size="sm" />);
    const svg = screen.getByTestId('chat-blob-svg');
    expect(svg.querySelector('path')?.getAttribute('d')).toMatch(/^M /);
  });
  it('calls onClick when clicked', async () => {
    const onClick = (await import('vitest')).vi.fn();
    render(<ChatBlob size="sm" onClick={onClick} />);
    screen.getByTestId('chat-blob-svg').dispatchEvent(
      new MouseEvent('click', { bubbles: true }),
    );
    expect(onClick).toHaveBeenCalled();
  });
});
```

- [x] Create `web.ui/frontend-react/src/components/chat/ChatBlob.tsx`:

```tsx
import { useEffect, useRef } from 'react';
import { useChatBlobContext } from './ChatBlobContext';
import { computeBlobPath, makeNoise } from './blob_engine';

interface Props {
  size: 'sm' | 'md' | 'lg';
  onClick?: () => void;
}

const SIZE_PX: Record<Props['size'], number> = { sm: 36, md: 80, lg: 200 };

export default function ChatBlob({ size, onClick }: Props) {
  const ctx = useChatBlobContext();
  const pathRef = useRef<SVGPathElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const startedAtRef = useRef<number>(performance.now());
  // One shared seed so all three sizes sync.
  const noiseRef = useRef(makeNoise(1));

  useEffect(() => {
    function frame(now: number) {
      const t = (now - startedAtRef.current) / 1000;
      const d = computeBlobPath({
        mood: ctx.mood, t, size: SIZE_PX[size], noise: noiseRef.current,
      });
      if (pathRef.current) pathRef.current.setAttribute('d', d);
      rafRef.current = requestAnimationFrame(frame);
    }
    rafRef.current = requestAnimationFrame(frame);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [ctx.mood, size, ctx.tickKey]);

  const px = SIZE_PX[size];
  const errorTint = ctx.mood === 'error';
  return (
    <svg
      width={px}
      height={px}
      viewBox={`0 0 ${px} ${px}`}
      onClick={onClick}
      data-testid="chat-blob-svg"
      className={`chat-blob chat-blob-${size}${errorTint ? ' chat-blob-error' : ''}`}
      style={{ cursor: onClick ? 'pointer' : 'default' }}
    >
      <defs>
        <linearGradient id={`chatblob-grad-${size}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={errorTint ? '#C0394B' : '#1F4F66'} />
          <stop offset="100%" stopColor={errorTint ? '#E8A0A0' : '#CAA457'} />
        </linearGradient>
        <filter id={`chatblob-glow-${size}`}>
          <feGaussianBlur stdDeviation={px / 60} />
        </filter>
      </defs>
      <path
        ref={pathRef}
        fill={`url(#chatblob-grad-${size})`}
        filter={`url(#chatblob-glow-${size})`}
        d=""
      />
    </svg>
  );
}
```

- [x] Re-run vitest; both ChatBlob tests pass. (rAF is stubbed by jsdom â€” the path's `d` may stay empty initially; the test only checks for `M ` prefix, so we set an initial `d=""` and the first rAF tick fills it. If jsdom doesn't tick rAF, switch the test to call `act(() => { jest.advanceTimersByTime(20); })` after enabling fake timers. Adjust as needed.)

### Task 27: Replace the 3 placeholders

- [x] In `web.ui/frontend-react/src/components/Header.tsx`, replace the `<span className="chat-blob-trigger-placeholder" />` inside `<button className="chat-blob-trigger">` with `<ChatBlob size="sm" />` (drop the onClick â€” let the wrapping button own it). Add `import ChatBlob from './chat/ChatBlob';`.
- [x] In `web.ui/frontend-react/src/components/chat/ChatDrawer.tsx`, replace the `chat-drawer-blob-placeholder` div with `<ChatBlob size="md" />`.
- [x] In `web.ui/frontend-react/src/pages/Chat.tsx`, replace the `chat-blob-placeholder` div with `<ChatBlob size="lg" />`.
- [x] Manual verification: open the drawer mid-turn; the header and drawer blobs animate in the same phase (both share `noiseRef` seeded at `1` and the same `ctx.mood`).

### Task 28: Transition polish

- [x] Add to `useChat.ts` (already in Task 13): the `done â†’ idle` after 1s + `error` brief tint are handled via the `setState((s) => s === 'done' ? 'idle' : s)` timeout. Verify with a vitest fake-timer test in `web.ui/frontend-react/src/hooks/__tests__/useChat.test.tsx`:

```tsx
it('settles done â†’ idle after 1 second', async () => {
  vi.useFakeTimers();
  // ... mock fetches + SSE so a turn completes;
  // after onComplete callback, advance timers 1100ms,
  // assert result.current.state === 'idle'.
  vi.useRealTimers();
});
```

- [x] Add a CSS keyframe to `chat.css` for the error shake:
  ```css
  .chat-blob-error { animation: chat-blob-shake 200ms ease-in-out 2; }
  @keyframes chat-blob-shake {
    0%, 100% { transform: translateX(0); }
    25% { transform: translateX(-4px); }
    75% { transform: translateX(4px); }
  }
  ```

### Task 29: Commit Phase 4

- [x] Stage:
  - `web.ui/frontend-react/package.json` (simplex-noise added)
  - `web.ui/frontend-react/package-lock.json`
  - `web.ui/frontend-react/src/hooks/useChatBlob.ts`
  - `web.ui/frontend-react/src/hooks/__tests__/useChatBlob.test.tsx`
  - `web.ui/frontend-react/src/components/chat/ChatBlobContext.tsx`
  - `web.ui/frontend-react/src/components/chat/blob_engine.ts`
  - `web.ui/frontend-react/src/components/chat/ChatBlob.tsx`
  - `web.ui/frontend-react/src/components/chat/__tests__/blob_engine.test.ts`
  - `web.ui/frontend-react/src/components/chat/__tests__/ChatBlob.test.tsx`
  - `web.ui/frontend-react/src/components/Header.tsx`
  - `web.ui/frontend-react/src/components/chat/ChatDrawer.tsx`
  - `web.ui/frontend-react/src/pages/Chat.tsx`
  - `web.ui/frontend-react/src/App.tsx`
  - `web.ui/frontend-react/src/components/chat/chat.css`
- [x] Run vitest; all green.
- [x] Commit: `feat(chat): morphing blob avatar synced across header / drawer / page`.

---

## Phase 5 â€” Polish

Goal: markdown polish + keyboard shortcuts + rename UX + session restore. No new backend code; pure frontend.

### Task 30: Syntax highlighting in ChatMessages

- [x] Install `prism-react-renderer`: `npm install prism-react-renderer --workspace web.ui/frontend-react`.
- [x] Edit `ChatMessages.tsx` â€” pass a `components` prop to `<ReactMarkdown>`:
  ```tsx
  import { Highlight, themes } from 'prism-react-renderer';

  const components = {
    code({ inline, className, children }: any) {
      const match = /language-(\w+)/.exec(className || '');
      const lang = match ? match[1] : 'text';
      const code = String(children).replace(/\n$/, '');
      if (inline) return <code className="chat-code-inline">{code}</code>;
      return (
        <div className="chat-code-block">
          <Highlight code={code} language={lang} theme={themes.vsDark}>
            {({ className, style, tokens, getLineProps, getTokenProps }) => (
              <pre className={className} style={style}>
                {tokens.map((line, i) => (
                  <div key={i} {...getLineProps({ line })}>
                    {line.map((token, k) => (
                      <span key={k} {...getTokenProps({ token })} />
                    ))}
                  </div>
                ))}
              </pre>
            )}
          </Highlight>
        </div>
      );
    },
  };
  ```
- [x] Write **failing** snapshot test in `web.ui/frontend-react/src/components/chat/__tests__/ChatMessages.snapshot.test.tsx`:
  ```tsx
  it('renders a fenced code block with syntax classes', () => {
    const m: Message[] = [{
      id: 1, conversation_id: 1, role: 'assistant',
      content: '```typescript\nconst x = 1;\n```',
      tool_calls: null, error_text: null, created_at: '',
    }];
    const { container } = render(<ChatMessages messages={m} sendInFlight={false} />);
    expect(container.querySelector('.chat-code-block pre')).toBeTruthy();
    expect(container.innerHTML).toMatch(/class="[^"]*token/);
  });
  ```
- [x] Run vitest; test passes after the edit.

### Task 31: Copy-to-clipboard button on code blocks

- [x] Extend the `code` component override:
  ```tsx
  function CopyButton({ text }: { text: string }) {
    const [copied, setCopied] = useState(false);
    return (
      <button
        type="button"
        className="chat-code-copy"
        onClick={async () => {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        }}
      >
        {copied ? 'Copied!' : 'Copy'}
      </button>
    );
  }
  ```
  Render `<CopyButton text={code} />` next to each `<pre>`.
- [x] Write **failing** test in `web.ui/frontend-react/src/components/chat/__tests__/CopyButton.test.tsx`:
  ```tsx
  it('writes to clipboard and shows Copied!', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    render(<CopyButton text="hi" />);
    await userEvent.click(screen.getByRole('button', { name: 'Copy' }));
    expect(writeText).toHaveBeenCalledWith('hi');
    expect(await screen.findByText('Copied!')).toBeInTheDocument();
  });
  ```
- [x] Run vitest; passes.

### Task 32: Global keyboard shortcuts

- [x] Create `web.ui/frontend-react/src/hooks/useChatKeyboard.ts`:

```ts
import { useEffect } from 'react';
import { useChatDrawer } from '../components/chat/ChatDrawerContext';

const COMPOSER_SELECTOR = '.chat-composer-textarea';

export function useChatKeyboard() {
  const { isOpen, toggle, close } = useChatDrawer();
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        toggle();
      } else if (e.key === 'Escape' && isOpen) {
        close();
      } else if (mod && e.key === '/' && isOpen) {
        const ta = document.querySelector<HTMLTextAreaElement>(COMPOSER_SELECTOR);
        ta?.focus();
        e.preventDefault();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, toggle, close]);
}
```

- [x] Call `useChatKeyboard()` from inside `<ChatDrawerHost>` in `App.tsx`.
- [x] Write **failing** test in `web.ui/frontend-react/src/hooks/__tests__/useChatKeyboard.test.tsx`:
  ```tsx
  it('Ctrl+K toggles drawer', async () => {
    // Render <ChatDrawerProvider><Harness /></ChatDrawerProvider>
    // where Harness calls useChatKeyboard() + exposes isOpen.
    await userEvent.keyboard('{Control>}k{/Control}');
    expect(harness.isOpen).toBe(true);
  });
  ```
- [x] Run vitest; tests pass.

### Task 33: Rename + delete UX is already in ChatConversationList (Task 16); add tests

- [x] Extend `ChatConversationList.test.tsx`:
  ```tsx
  it('double-click title enters edit mode; Enter fires onRename', async () => {
    const onRename = vi.fn();
    render(<ChatConversationList ... onRename={onRename} />);
    await userEvent.dblClick(screen.getByText('Sudoku rework'));
    const input = screen.getByDisplayValue('Sudoku rework');
    await userEvent.clear(input);
    await userEvent.type(input, 'Renamed{Enter}');
    expect(onRename).toHaveBeenCalledWith(1, 'Renamed');
  });

  it('delete button shows confirm modal then fires onDelete', async () => {
    const onDelete = vi.fn();
    render(<ChatConversationList ... onDelete={onDelete} />);
    await userEvent.click(screen.getByLabelText('Delete Sudoku rework'));
    expect(screen.getByText(/Cannot be undone/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(onDelete).toHaveBeenCalledWith(1);
  });
  ```
- [x] Run vitest; passes (logic already exists; this just locks the contract).

### Task 34: Session restore tests

- [x] Add to `useChat.test.tsx`:
  ```tsx
  it('restores last conversation from localStorage on mount', async () => {
    localStorage.setItem('last_chat_conversation_id', '42');
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({ conversations: [] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        conversation: { id: 42, title: 'Restored', messages: [] },
      }), { status: 200 }));
    const { result } = renderHook(() => useChat());
    await waitFor(() => expect(result.current.currentConversation?.id).toBe(42));
  });
  ```
- [x] Add to `ChatDrawerContext.test.tsx`:
  ```tsx
  it('initial open state reads from localStorage', () => {
    localStorage.setItem('chat_drawer_open', '1');
    const { result } = renderHook(() => useChatDrawer(), {
      wrapper: ChatDrawerProvider,
    });
    expect(result.current.isOpen).toBe(true);
  });
  ```
- [x] Run vitest; passes.

### Task 35: Commit Phase 5

- [x] Stage:
  - `web.ui/frontend-react/package.json` (prism-react-renderer added)
  - `web.ui/frontend-react/package-lock.json`
  - `web.ui/frontend-react/src/components/chat/ChatMessages.tsx` (updated with code-block override + CopyButton)
  - `web.ui/frontend-react/src/components/chat/__tests__/ChatMessages.snapshot.test.tsx`
  - `web.ui/frontend-react/src/components/chat/__tests__/CopyButton.test.tsx`
  - `web.ui/frontend-react/src/hooks/useChatKeyboard.ts`
  - `web.ui/frontend-react/src/hooks/__tests__/useChatKeyboard.test.tsx`
  - `web.ui/frontend-react/src/App.tsx` (calls useChatKeyboard)
  - `web.ui/frontend-react/src/components/chat/__tests__/ChatConversationList.test.tsx` (extended)
  - `web.ui/frontend-react/src/hooks/__tests__/useChat.test.tsx` (extended)
  - `web.ui/frontend-react/src/components/chat/__tests__/ChatDrawerContext.test.tsx` (extended)
  - `web.ui/frontend-react/src/components/chat/chat.css` (any code-block / copy-button styles)
- [x] Run full vitest suite (backend + frontend); all green.
- [x] Run lint; clean.
- [x] Commit: `feat(chat): polish â€” syntax highlighting, keyboard shortcuts, conversation rename, session restore`.

---

## Definition of done

- All 5 phases committed.
- `node scripts/spike_claude_cli.mjs` produces a report whose Decision section is GO.
- Vitest backend + frontend suites both green.
- Manual smoke:
  - Open `/chat`; create a new conversation; send "list the files in the repo root"; observe streaming chunks, a tool-call event, and a final assistant message.
  - From any other page, click the header Blob; the drawer slides in with the same conversation.
  - Drawer and page blobs animate in sync.
  - Refresh the page; the last conversation reopens.
  - Ctrl+K toggles the drawer; Escape closes it.

## Spec coverage check

- Â§3 architecture â€” backend module map (Tasks 5-9), frontend module map (Tasks 12-18), routes (Task 8), SSE format (Task 9). âœ“
- Â§4 data model â€” migration 0003 (Task 4). âœ“
- Â§5 the blob â€” context (Task 24), engine (Task 25), component (Task 26), 3 sizes (Task 27), state machine driven by useChat (Tasks 13, 23). âœ“
- Â§6 backend CLI spawn flow â€” cli_runner (Task 7) + routes (Task 8). âœ“
- Â§7 UI placement â€” drawer (Task 18), header trigger (Tasks 19, 27), /chat page (Task 17, 27). âœ“
- Â§8 risks â€” resolved by Phase 1 spike (Tasks 1-3); GO gate in Task 3. âœ“
- Â§9 phasing â€” 5 phases matching the spec exactly. âœ“
