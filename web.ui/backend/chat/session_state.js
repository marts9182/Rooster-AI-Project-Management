/**
 * In-memory map: conversationId → { claudeSessionId, subprocess?, lastActivityAt }.
 * NOT persisted — process restart re-reads claude_session_id from SQL.
 */

/**
 * @typedef {Object} SessionEntry
 * @property {string} claudeSessionId
 * @property {import('node:child_process').ChildProcess} [subprocess]
 * @property {number} lastActivityAt
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
