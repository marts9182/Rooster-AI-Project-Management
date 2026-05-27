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
