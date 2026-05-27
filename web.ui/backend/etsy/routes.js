/**
 * Etsy HTTP routes:
 *   GET  /api/etsy/listings              — list (optional ?status=, ?section=, ?niche=)
 *   GET  /api/etsy/listings/:listingId   — detail by Etsy listing_id, 404 on miss
 *   POST /api/etsy/sync-now              — manual sync trigger
 *
 * `runSyncPass` is injected via `mountEtsyRoutes` so tests can stub it
 * without touching module mocking (and server.js wires the real one).
 *
 * @module etsy/routes
 */

import { allListings, listingByEtsyId } from './repo.js';

/**
 * @typedef {Object} MountArgs
 * @property {import('better-sqlite3').Database} db
 * @property {() => Promise<{inserted: number, updated: number, statusChanged: number}>} runSyncPass
 */

/**
 * Mount Etsy routes on the given Express app.
 *
 * @param {import('express').Express} app
 * @param {MountArgs} args
 */
export function mountEtsyRoutes(app, { db, runSyncPass }) {
  app.get('/api/etsy/listings', (req, res) => {
    /** @type {Record<string, string>} */
    const filters = {};
    const status =
      typeof req.query.status === 'string' ? req.query.status : undefined;
    const section =
      typeof req.query.section === 'string' ? req.query.section : undefined;
    const niche =
      typeof req.query.niche === 'string' ? req.query.niche : undefined;
    if (status) filters.status = status;
    if (section) filters.section = section;
    if (niche) filters.niche = niche;
    res.json({ listings: allListings(db, filters) });
  });

  app.get('/api/etsy/listings/:listingId', (req, res) => {
    const id = Number.parseInt(req.params.listingId, 10);
    if (!Number.isFinite(id)) {
      res.status(400).json({ error: 'listingId must be numeric' });
      return;
    }
    const row = listingByEtsyId(db, id);
    if (!row) {
      res.status(404).json({ error: `listing ${id} not found` });
      return;
    }
    res.json(row);
  });

  app.post('/api/etsy/sync-now', async (_req, res) => {
    try {
      const result = await runSyncPass();
      res.json(result);
    } catch (err) {
      res
        .status(500)
        .json({ error: err instanceof Error ? err.message : String(err) });
    }
  });
}
