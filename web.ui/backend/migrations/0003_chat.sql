-- Migration 0003 — chat (conversations + messages) for the in-dashboard Claude chat.
-- Source of truth: docs/superpowers/specs/2026-05-27-claude-chat-in-dashboard-design.md §4

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
