/**
 * Express router for /api/chat/*. Mounted from server.js via:
 *   mountChatRoutes(app, { db: openDb() })
 *
 * The runTurnFn parameter is injectable so SSE tests pass a stub instead
 * of spawning the real CLI.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
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

    // Pass null on first turn — cli_runner generates a session UUID and
    // returns the actual session_id the CLI used (which we persist below).
    const existingSessionId = conv.claude_session_id;

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

    // We emit message-started BEFORE the runner returns the real session_id.
    // The frontend can update from the eventual message-complete payload if it
    // needs the canonical session_id.
    send('message-started', {
      message_id: null,
      claude_session_id: existingSessionId,
    });

    try {
      const result = await runTurnFn({
        conversationId: id,
        claudeSessionId: existingSessionId,
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

      // Persist the canonical session id returned by the runner.
      if (result.claudeSessionId && result.claudeSessionId !== existingSessionId) {
        setClaudeSessionId({
          db,
          conversationId: id,
          claudeSessionId: result.claudeSessionId,
        });
      }
      sessionState.set(id, {
        claudeSessionId: result.claudeSessionId,
        lastActivityAt: Date.now(),
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
