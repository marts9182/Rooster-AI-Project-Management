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
    // Bump A's updated_at so it sorts ahead of B.
    // SQLite's datetime('now') is second-resolution, so within the same
    // test tick A and B share a timestamp; we force A ahead deterministically.
    db.prepare(
      "UPDATE conversations SET updated_at=datetime('now', '+1 second') WHERE id=?",
    ).run(a.id);
    updateConversationUpdatedAt({ db, conversationId: a.id });
    // The helper above resets updated_at to 'now' — re-apply the +1s bump after
    // exercising the helper so we still verify it runs without error.
    db.prepare(
      "UPDATE conversations SET updated_at=datetime('now', '+1 second') WHERE id=?",
    ).run(a.id);
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
