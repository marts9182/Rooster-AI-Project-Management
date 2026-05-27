/**
 * Pinterest REST routes.
 *
 *   GET  /api/pinterest/queue              — pending+posting+paused rows
 *   GET  /api/pinterest/history?limit=N    — most recent N history rows
 *   POST /api/pinterest/pause              — flip all pending → paused
 *   POST /api/pinterest/resume             — flip all paused  → pending
 *   POST /api/pinterest/queue/:id/cancel   — remove a pending/paused row
 *   PUT  /api/pinterest/queue/:id          — patch title/description/scheduled_for
 *   GET  /api/pinterest/whoami             — apiClient.getUserAccount()
 *   GET  /api/pinterest/boards             — apiClient.listBoards()
 *   GET  /api/pinterest/token-status       — apiClient.getTokenStatus()
 *   POST /api/pinterest/refresh            — apiClient._forceRefresh() then getTokenStatus()
 *
 * SSE events emitted on state changes:
 *   - pinterest:paused
 *   - pinterest:resumed
 *   - pinterest:queue-row-cancelled
 *   - pinterest:queue-row-updated
 *
 * @module pinterest/routes
 */

import express from 'express';
import { openDb } from '../db.js';
import { recordEvent } from '../events.js';
import {
  listQueue,
  listHistory,
  pauseQueue,
  resumeQueue,
  cancelQueueRow,
  updateQueueRow,
} from './queue.js';

/**
 * Build the Pinterest router. The apiClient is required only for the
 * whoami/boards/token-status/refresh endpoints; the queue-management
 * routes work without it.
 *
 * @param {{apiClient?: import('./api_client.js').PinterestApiClient | null}} [opts]
 * @returns {import('express').Router}
 */
export function buildRouter(opts = {}) {
  const router = express.Router();
  const apiClient = opts.apiClient ?? null;

  function getQueueRow(id) {
    return openDb().prepare('SELECT * FROM pinterest_queue WHERE id=?').get(id);
  }

  router.get('/queue', (_req, res) => {
    res.json({ queue: listQueue() });
  });

  router.get('/history', (req, res) => {
    const raw = Number(req.query.limit ?? 100);
    const limit = Number.isFinite(raw) ? Math.max(1, Math.min(500, raw)) : 100;
    res.json({ history: listHistory(limit) });
  });

  router.post('/pause', (_req, res) => {
    const paused = pauseQueue();
    recordEvent('pinterest:paused', { affected: paused });
    res.json({ paused });
  });

  router.post('/resume', (_req, res) => {
    const resumed = resumeQueue();
    recordEvent('pinterest:resumed', { affected: resumed });
    res.json({ resumed });
  });

  router.post('/queue/:id/cancel', (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'bad_id' });
    }
    const row = getQueueRow(id);
    if (!row) {
      return res.status(404).json({ error: 'not_found' });
    }
    cancelQueueRow(id);
    recordEvent('pinterest:queue-row-cancelled', { queue_id: id });
    res.json({ ok: true });
  });

  router.put('/queue/:id', (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'bad_id' });
    }
    const body = req.body ?? {};
    const { title, description, scheduled_for } = body;
    const hasTitle = typeof title === 'string';
    const hasDescription = typeof description === 'string';
    const hasScheduledFor = typeof scheduled_for === 'string';
    if (!hasTitle && !hasDescription && !hasScheduledFor) {
      return res.status(400).json({ error: 'empty_patch' });
    }
    const row = getQueueRow(id);
    if (!row) {
      return res.status(404).json({ error: 'not_found' });
    }
    updateQueueRow(id, {
      title: hasTitle ? title : undefined,
      description: hasDescription ? description : undefined,
      scheduled_for: hasScheduledFor ? scheduled_for : undefined,
    });
    recordEvent('pinterest:queue-row-updated', {
      queue_id: id,
      fields: Object.keys({
        ...(hasTitle ? { title } : {}),
        ...(hasDescription ? { description } : {}),
        ...(hasScheduledFor ? { scheduled_for } : {}),
      }),
    });
    res.json({ ok: true });
  });

  // --- API-backed status / connection routes ------------------------------

  router.get('/whoami', async (_req, res) => {
    if (!apiClient) {
      return res.status(503).json({ error: 'api_client_unavailable' });
    }
    try {
      const u = await apiClient.getUserAccount();
      res.json(u);
    } catch (err) {
      const message = err?.message || String(err);
      res.status(500).json({ error: message });
    }
  });

  router.get('/boards', async (_req, res) => {
    if (!apiClient) {
      return res.status(503).json({ error: 'api_client_unavailable' });
    }
    try {
      const boards = await apiClient.listBoards();
      res.json({ boards });
    } catch (err) {
      const message = err?.message || String(err);
      res.status(500).json({ error: message });
    }
  });

  router.get('/token-status', async (_req, res) => {
    if (!apiClient) {
      return res.status(503).json({ error: 'api_client_unavailable' });
    }
    try {
      const status = await apiClient.getTokenStatus();
      res.json(status);
    } catch (err) {
      const message = err?.message || String(err);
      res.status(500).json({ error: message });
    }
  });

  router.post('/refresh', async (_req, res) => {
    if (!apiClient) {
      return res.status(503).json({ error: 'api_client_unavailable' });
    }
    try {
      await apiClient._forceRefresh();
      const status = await apiClient.getTokenStatus();
      res.json(status);
    } catch (err) {
      const message = err?.message || String(err);
      const code =
        err && typeof err === 'object' && 'status' in err && err.status === 401
          ? 401
          : 500;
      res.status(code).json({ error: message });
    }
  });

  return router;
}

// Back-compat: an unconfigured router (no apiClient). Existing callers that
// import `router` directly still get queue/history/pause/resume/cancel/PUT;
// the four API-backed routes will respond 503 until the caller switches to
// `buildRouter({apiClient})` via `installPinterestModule(app, {apiClient})`.
export const router = buildRouter();
