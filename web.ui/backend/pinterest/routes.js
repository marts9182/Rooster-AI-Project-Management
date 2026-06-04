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
 *   GET  /api/pinterest/token-status       — apiClient.getLiveStatus()
 *   POST /api/pinterest/refresh            — apiClient._forceRefresh() then getTokenStatus()
 *   POST /api/pinterest/boards/sync        — ensureBoards() + persist niche→board_id map
 *   POST /api/pinterest/post-now           — force-post one pending/paused row immediately
 *
 * SSE events emitted on state changes:
 *   - pinterest:paused
 *   - pinterest:resumed
 *   - pinterest:queue-row-cancelled
 *   - pinterest:queue-row-updated
 *   - pinterest:boards-synced
 *
 * @module pinterest/routes
 */

import express from 'express';
import { openDb } from '../db.js';
import { recordEvent } from '../events.js';
import { getAllStatuses } from '../workerStatus.js';
import {
  listQueue,
  listHistory,
  pauseQueue,
  resumeQueue,
  cancelQueueRow,
  updateQueueRow,
  markPosted,
  markFailed,
} from './queue.js';
import { cadenceBuckets, engagementRows } from './analytics.js';
import { ensureBoards } from './boards.js';

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
      const status = await apiClient.getLiveStatus();
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

  router.get('/cadence', (req, res) => {
    const days = Math.min(Math.max(Number(req.query.days ?? 30) || 30, 1), 90);
    const target = Number(process.env.PINTEREST_TARGET_PER_DAY ?? 4);
    const db = openDb();
    res.json(cadenceBuckets(db, { days, target }));
  });

  router.get('/engagement', (req, res) => {
    const limit = Math.min(Math.max(Number(req.query.limit ?? 50) || 50, 1), 200);
    const db = openDb();
    res.json(engagementRows(db, { limit }));
  });

  router.get('/topup-status', (_req, res) => {
    const runway = Number(process.env.PINTEREST_TOPUP_DAYS_RUNWAY ?? 30);
    const status = getAllStatuses()['pinterest.topup'];
    const lastRun = status?.last_success_at ?? null;
    const nextRun = lastRun
      ? new Date(new Date(lastRun).getTime() + 6 * 60 * 60 * 1000).toISOString()
      : null;
    res.json({
      topup_days_runway: runway,
      topup_last_run: lastRun,
      topup_next_run: nextRun,
    });
  });

  // --- Ops routes -----------------------------------------------------------

  router.post('/boards/sync', async (_req, res) => {
    if (!apiClient) return res.status(503).json({ error: 'api_client_unavailable' });
    try {
      const mapPath = process.env.PINTEREST_BOARDS_MAP_PATH || undefined;
      const map = await ensureBoards(apiClient, mapPath ? { mapPath } : {});
      recordEvent('pinterest:boards-synced', { count: Object.keys(map).length });
      res.json({ map });
    } catch (err) {
      res.status(500).json({ error: err?.message || String(err) });
    }
  });

  // Ops-only: force-post one pending/paused row immediately, bypassing the
  // scheduler. Used to verify the very first real post end-to-end.
  router.post('/post-now', async (req, res) => {
    if (!apiClient) return res.status(503).json({ error: 'api_client_unavailable' });
    const id = Number(req.query.queue_id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'bad_queue_id' });
    const row = getQueueRow(id);
    if (!row) return res.status(404).json({ error: 'not_found' });
    if (!['pending', 'paused'].includes(row.status)) {
      return res.status(409).json({ error: `row is '${row.status}', not postable` });
    }
    try {
      const boardId = (row.board_id && String(row.board_id).trim())
        ? String(row.board_id).trim()
        : (process.env.PINTEREST_DEFAULT_BOARD_ID || '').trim();
      if (!boardId) return res.status(400).json({ error: 'no_board' });
      const result = await apiClient.createPin({
        board_id: boardId,
        title: row.title,
        description: row.description,
        link: row.link_url,
        imagePath: row.image_path,
      });
      markPosted(id, result.id);
      res.json({ ok: true, pinterest_pin_id: result.id });
    } catch (err) {
      markFailed(id, err?.message || String(err));
      res.status(502).json({ error: err?.message || String(err) });
    }
  });

  return router;
}

// Back-compat: an unconfigured router (no apiClient). Existing callers that
// import `router` directly still get queue/history/pause/resume/cancel/PUT;
// the four API-backed routes will respond 503 until the caller switches to
// `buildRouter({apiClient})` via `installPinterestModule(app, {apiClient})`.
export const router = buildRouter();
