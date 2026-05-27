/**
 * Pinterest REST routes.
 *
 *   GET  /api/pinterest/queue              — pending+posting+paused rows
 *   GET  /api/pinterest/history?limit=N    — most recent N history rows
 *   POST /api/pinterest/pause              — flip all pending → paused
 *   POST /api/pinterest/resume             — flip all paused  → pending
 *   POST /api/pinterest/queue/:id/cancel   — remove a pending/paused row
 *   PUT  /api/pinterest/queue/:id          — patch title/description/scheduled_for
 *   POST /api/pinterest/login              — fire-and-forget visible Playwright login
 *
 * SSE events emitted on state changes:
 *   - pinterest:paused
 *   - pinterest:resumed
 *   - pinterest:queue-row-cancelled
 *   - pinterest:queue-row-updated
 *   - pinterest:login-requested
 *
 * The login route dynamically imports `./login.js` so tests can stub it via
 * `vi.doMock` without bundling Playwright into the unit-test graph.
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

export const router = express.Router();

/**
 * Look up a queue row by id; returns undefined if absent.
 *
 * @param {number} id
 * @returns {object|undefined}
 */
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

router.post('/login', async (_req, res) => {
  try {
    const { runVisibleLogin } = await import('./login.js');
    // Fire-and-forget: the headed Chromium window stays open until the user
    // logs in (or the helper's internal timeout fires). Awaiting it would
    // tie up the request connection for minutes.
    Promise.resolve()
      .then(() => runVisibleLogin())
      .catch((err) => {
        // eslint-disable-next-line no-console
        console.warn(`runVisibleLogin failed: ${err?.message || err}`);
      });
    recordEvent('pinterest:login-requested', {});
    res.json({ ok: true, launched: true });
  } catch (err) {
    res.status(500).json({ error: err?.message || String(err) });
  }
});
