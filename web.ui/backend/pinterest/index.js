/**
 * Pinterest module surface.
 *
 * Re-exports the routes mount helper, the poster worker entrypoints, and
 * the public queue helper used by Plan B's mark-published flow.
 *
 * @module pinterest
 */

import { router as pinterestRouter } from './routes.js';

export { startPosterWorker, stopPosterWorker } from './poster.js';
export { enqueuePinsForBook } from './queue.js';

/**
 * Mount `/api/pinterest/*` on an Express app.
 *
 * @param {import('express').Express} app
 */
export function installPinterestModule(app) {
  app.use('/api/pinterest', pinterestRouter);
}
