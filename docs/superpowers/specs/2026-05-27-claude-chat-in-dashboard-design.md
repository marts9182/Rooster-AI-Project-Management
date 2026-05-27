---
title: Claude Chat in Rooster Dashboard
date: 2026-05-27
status: design
---

# Claude Chat in Rooster Dashboard — Design

## 1. Motivation

The user already drives this project via the Claude Code CLI in a terminal — issuing requests like "regenerate the sudoku books," "fix the dark-mode contrast on /plans," "show me Etsy listings that haven't synced in 24h." The dashboard at `http://127.0.0.1:5000` already exposes most of the relevant data and operations as routes (`/api/kdp/books`, `/api/etsy/listings`, `/api/pinterest/queue`, etc.). Today those two worlds are separate: chat happens in the terminal, data lives in the browser.

This spec brings the chat into the dashboard. A persistent Claude session reachable from anywhere in the app, with the same full agentic powers it has in the terminal — read files, write files, run shell commands, commit, push, all of it — operating against this repository. Visually represented by an animated blob avatar that sits with the chat and morphs based on what Claude is doing.

The goal is one tool open, not two. Talk to Claude about the dashboard while you're looking at it.

## 2. Locked decisions

- **Integration path: spawn the Claude Code CLI as a subprocess** (`claude --print --session-id <uuid> "..."`). No per-token API cost — uses the existing Claude Code subscription. Inherits `~/.claude/settings.json` so the user's auto-mode preferences, skills, and MCP servers all carry over.
- **Capability scope: full Claude Code.** The chat has the same powers as a terminal Claude Code session — file edits, shell, git, npm, anything. Trust model is unchanged from the rest of the dashboard (single-user, localhost only).
- **UI: dedicated `/chat` page AND a drawer accessible from every page.** Same conversation history visible from both. Entry point is an animated blob avatar in the header.
- **The Blob is a first-class visual element.** Animated SVG that morphs based on chat state. The same component renders in three sizes (header trigger, drawer header, full-page hero) and is driven by shared state so all three animate in sync.
- **Persistence: SQLite tables.** Conversations and messages live in `data/dashboard.db` next to the rest of the dashboard's state. Gitignored.
- **Spike before commit.** Task 1 of the implementation verifies the `claude --print --session-id` flow actually works for multi-turn streaming under headless subprocess. If it fizzles, we fall back to the Agent SDK approach in a follow-up spec.

## 3. Architecture

### 3.1 Backend module map

Under `web.ui/backend/chat/`:

| File | Responsibility |
|---|---|
| `routes.js` | Express router mounting `/api/chat/*`. REST for conversations + SSE for streamed responses. |
| `cli_runner.js` | Spawns `claude --print --session-id <id>` as a `child_process`, captures stdout/stderr, manages lifecycle + timeouts. |
| `persistence.js` | SQL helpers — list/insert/get/update for `conversations` + `messages`. |
| `session_state.js` | In-memory map `conversation_id → {claude_session_id, subprocess?, last_activity_at}`. Cleaned on conversation close or idle timeout. |
| `events.js` (existing) | Reuses the existing audit-log + SSE channel. Chat-specific channels: `chat:message-started`, `chat:chunk`, `chat:tool-call`, `chat:message-complete`, `chat:error`. |

### 3.2 Frontend module map

Under `web.ui/frontend-react/src/`:

| File | Responsibility |
|---|---|
| `pages/Chat.tsx` | Full-page `/chat` route: conversation-list sidebar + main chat area + large Blob. |
| `components/chat/ChatDrawer.tsx` | Slide-in drawer accessible from the Blob in the header; shares conversation state with `/chat`. |
| `components/chat/ChatBlob.tsx` | The animated SVG avatar. Reads chat state, renders blob morph + color animation. Three size variants (header 36px / drawer 80px / page 200px). |
| `components/chat/ChatMessages.tsx` | Renders conversation turns with markdown + syntax highlighting + tool-call expandable detail. |
| `components/chat/ChatComposer.tsx` | Multi-line textarea + send button + (later) attachment / slash-command suggestions. |
| `components/chat/ChatConversationList.tsx` | Sidebar list of conversations with rename/delete. |
| `hooks/useChat.ts` | Conversation state + message-send + SSE subscription. Single source of truth for `/chat` and drawer. |
| `hooks/useChatBlob.ts` | Derives blob "mood" (`idle` / `listening` / `thinking` / `responding` / `tool-using` / `done` / `error`) from chat state. |
| `api/chat.ts` | Typed client: `listConversations`, `createConversation`, `getConversation`, `sendMessage` (returns SSE stream handle), `deleteConversation`. |

### 3.3 Routes

| Method | Path | Behavior |
|---|---|---|
| `GET` | `/api/chat/conversations` | List conversations sorted by `updated_at desc`. |
| `POST` | `/api/chat/conversations` | Create new with optional `title`. |
| `GET` | `/api/chat/conversations/:id` | Full conversation + all messages. |
| `PATCH` | `/api/chat/conversations/:id` | Rename via `{title}`. |
| `DELETE` | `/api/chat/conversations/:id` | Cascade-delete messages + clean any active subprocess. |
| `POST` | `/api/chat/conversations/:id/messages` | Body `{content}`. Persists user message, spawns Claude, returns SSE stream of response chunks. |

### 3.4 SSE event format

```
event: message-started
data: {"message_id": "...", "claude_session_id": "..."}

event: chunk
data: {"text": "Some response text"}

event: tool-call
data: {"tool": "Read", "args": {"file_path": "..."}, "status": "started"}

event: tool-call
data: {"tool": "Read", "status": "completed", "ms": 123}

event: chunk
data: {"text": "..."}

event: message-complete
data: {"message_id": "...", "tool_call_count": 4, "total_ms": 5421}
```

If the subprocess errors:
```
event: error
data: {"code": "subprocess_failed", "message": "claude exited with code 1: ..."}
```

## 4. Data model

Migration `web.ui/backend/migrations/0003_chat.sql`:

```sql
CREATE TABLE IF NOT EXISTS conversations (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    title               TEXT NOT NULL DEFAULT 'New conversation',
    claude_session_id   TEXT,                       -- captured on first turn; used for --session-id resume
    created_at          TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at          TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS messages (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id     INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    role                TEXT NOT NULL CHECK(role IN ('user','assistant','tool')),
    content             TEXT NOT NULL,
    tool_calls_json     TEXT,                       -- when role='assistant', JSON array of tool calls fired during this turn
    error_text          TEXT,                       -- set when the subprocess errored mid-stream
    created_at          TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages(conversation_id, created_at);
```

## 5. The Blob

Single component (`ChatBlob.tsx`) rendered in three places: header trigger, drawer header, full-page hero. All instances read the same chat-blob state via context so they animate in sync.

### 5.1 State machine

| State | Trigger | Visual |
|---|---|---|
| `idle` | No active conversation, no recent activity | Soft sphere, slow 4-second pulse, teal→brass gradient. |
| `listening` | Composer is focused, user is typing | Brighter, slightly larger, gentle 2-second ripple. |
| `thinking` | User sent message; subprocess started; no chunks received yet | Quick irregular morphing, color shifts toward deep teal. |
| `responding` | Streaming `chunk` events arriving | Active wave-y movement, brighter colors, faster pulse. |
| `tool-using` | A `tool-call` event just landed; held for 300ms after completion | Sharp pulse synced to each tool event. Transitions back to `responding` or `done` after. |
| `done` | `message-complete` fired | Settles smoothly back to `idle` over 1 second. |
| `error` | `error` event landed | Brief red tint + small horizontal shake. |

### 5.2 Tech

- One SVG `<path d="...">` whose `d` is computed each frame from N=16 control points on a circle, each perturbed by Perlin noise + state-driven amplitude and frequency.
- Color via CSS gradient (`#1F4F66` → `#CAA457`) + SVG `<filter>` for glow.
- `requestAnimationFrame` loop computes new path; uses smooth interpolation between states (no hard cuts).
- All three sizes share one component; size is a prop. Animation rate scales slightly with size so the small header blob doesn't feel frantic.

### 5.3 Click behavior

- Header blob (36px) → toggles `ChatDrawer` open/closed
- Drawer blob (80px) → does nothing (decorative)
- Page blob (200px) → does nothing (decorative)

## 6. Backend CLI spawn — what happens per message

```
1. User POSTs {content} to /api/chat/conversations/:id/messages
2. persistence.insertMessage(conversationId, role='user', content)
3. Look up the conversation's claude_session_id:
   - If null (first turn): generate a UUID; will pass it to claude and capture in DB
   - Else: reuse it for --session-id resume
4. Spawn child process:
       claude --print
              --session-id <claude_session_id>
              "<content>"
   cwd: <repo root>
   env: inherits user env so ~/.claude/settings.json works
5. Open SSE response to client; emit message-started event
6. Parse subprocess stdout line by line:
   - Plain text lines → emit `chunk` events
   - Tool-call markers (parsed from claude --print's output format) →
     emit `tool-call` events
   - Errors → emit `error` event
7. On subprocess exit (code 0):
   - persistence.insertMessage(conversationId, role='assistant',
       content=<aggregated chunks>, tool_calls_json=<tool calls>)
   - persistence.updateConversationUpdatedAt(conversationId)
   - emit `message-complete`
   - close SSE
8. On subprocess exit (non-zero) or stderr:
   - persistence.insertMessage(conversationId, role='assistant',
       content=<partial>, error_text=<stderr>)
   - emit `error` event
   - close SSE
```

**Tool-call parsing.** `claude --print` emits tool-call activity in a structured-ish way that we can parse with regex or JSON-line markers. The exact format will be confirmed during the Phase 1 spike. If parsing turns out brittle, we fall back to "all assistant output is opaque text" and the `tool-using` blob state simply doesn't fire.

**Auto-approval of tools.** Default behavior of `claude --print` should be to honor the user's `~/.claude/settings.json` permissions. If the existing config doesn't auto-allow the tools we need (Bash, Edit, etc.), the spike will surface the prompt-for-permission behavior and we'll add `--dangerously-skip-permissions` or set up a chat-only permission profile via the `--permission-mode` flag (whichever is the canonical knob).

## 7. UI placement detail

### Header (always visible)
```
┌────────────────────────────────────────────────────────────┐
│ [LOGO]  KDP  Etsy  Plans  Calendar  Pinterest   🫧  ☀  🔔 👤 │
└────────────────────────────────────────────────────────────┘
                                                  ↑
                                       36px Blob → opens drawer
```

### Drawer (slide-in from right)
```
┌──────────────────────────────────────────┐
│ 🫧 Claude Chat               [pin] [×]   │
├──────────────────────────────────────────┤
│  ▾ Recent: Sudoku rework discussion ▼   │
├──────────────────────────────────────────┤
│  You: how's the etsy worker behaving    │
│  Claude: Let me check...                │
│    [tool] GET /api/etsy/listings (123ms)│
│    Looking at the most recent sync...   │
│                                         │
├──────────────────────────────────────────┤
│ Type a message...                  [↵]  │
└──────────────────────────────────────────┘
```

### `/chat` full-page
```
┌──────────┬──────────────────────────────────────┬─────────┐
│ Recent   │  You: ...                            │         │
│  ▸ Sudo… │  Claude: ...                         │   🫧    │
│  ▸ Etsy… │    [tool] Read file.ts (12ms)        │  200px  │
│  ▸ ...   │  ...                                 │  blob   │
│          │                                      │         │
│  + new   │  ─────────────────────────────────   │         │
│          │  Type a message...           [↵]    │         │
└──────────┴──────────────────────────────────────┴─────────┘
```

## 8. Risks and open questions

These get resolved during the Phase 1 spike before we commit to the rest of the build:

1. **`claude --print --session-id` actually resumes context.** Unverified. Worst case fallback: include conversation history as the prompt prefix on every turn. Acceptable but adds latency + token usage on long conversations.
2. **Streaming granularity.** `--print` may emit one big block at the end OR genuinely stream token-by-token. Affects blob animation feel. If non-streaming, we get a long "thinking" state followed by a sudden full response — still functional, less delightful.
3. **Tool-call markers in stdout.** Parseable as structured events? Or opaque interspersed text? If opaque, the blob `tool-using` state can't fire — degrades to "responding" only. Functional but less informative.
4. **Permission prompts under headless spawn.** If Claude tries to prompt the user for tool approval and there's no TTY, it might block forever. Mitigation: pass `--dangerously-skip-permissions` OR pre-configure auto-allow.
5. **Subprocess startup latency.** Each `claude` invocation takes seconds to boot (load skills, MCP servers). For a chatty UI this could feel slow. Mitigation: keep a warm subprocess per active conversation when possible.

If any of the above turns out to be a dealbreaker, fall back to Path B (Anthropic Agent SDK in-process) — same UX, different billing model.

## 9. Phasing

Five phases, each shippable:

1. **CLI spike** — ½ day. One-off script + manual testing to verify `claude --print --session-id` behavior, streaming, tool calls, permission prompts. Output: a decision memo committed to the spec confirming Path C is viable or pivoting to Path B.
2. **Backend chat module** — 1 day. Migration 0003, `chat/` module, REST + SSE routes, CLI runner, persistence. No UI; verify via `curl`.
3. **Frontend chat shell** — 1 day. `/chat` route, `ChatDrawer`, `ChatMessages`, `ChatComposer`, `useChat` hook, SSE wiring. Conversation flow works end-to-end with a static placeholder for the Blob.
4. **The Blob** — ½–1 day. SVG morph engine, state-to-animation mapping, three-size component, sync context, mounted in header / drawer / page.
5. **Polish** — ½ day. Markdown + code-syntax in assistant responses, copy buttons, keyboard shortcuts (Ctrl+K open drawer, Esc close), session restore on page reload, conversation rename, delete confirmation.

Total: ~3–4 days of focused work.

## 10. Out of scope

- Multi-user / shared chat (single-user, localhost-only — same trust model as the rest of the dashboard).
- Voice input.
- File attachment uploads from the composer (workaround: paste paths into messages; Claude reads them via the Read tool).
- Cost / token usage tracking UI (subscription-billed, not per-token).
- Search across past conversations (could be a follow-up if the history grows large enough to matter).
- Forking conversations.
- Branching / regenerating a response.
- The Blob reacting to non-chat dashboard events (e.g., pulsing when a reminder fires). Out of scope here; nice future enhancement.

## 11. Open questions

None at design close. The Phase 1 spike resolves the §8 risks; everything else is locked.

## 12. Related memories

- [[publishing-ops-dashboard-checkpoint]] — the dashboard this extends
- [[etsy-rooster-shop-checkpoint]] — the kind of operational chatter Claude would help with day-to-day
