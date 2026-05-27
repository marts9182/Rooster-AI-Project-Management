/**
 * Pinterest module surface.
 *
 * Re-exports the routes mount helper, the poster worker entrypoints, and
 * the public queue helper used by Plan B's mark-published flow.
 *
 * @module pinterest
 */

import { buildRouter } from './routes.js';

export { startPosterWorker, stopPosterWorker } from './poster.js';
export { enqueuePinsForBook } from './queue.js';
export {
  PinterestApiClient,
  PinterestApiError,
  createPinterestApiClient,
} from './api_client.js';
export { ensureFreshToken, readStoredToken } from './api_oauth.js';

/**
 * Mount `/api/pinterest/*` on an Express app. Pass an `apiClient` to enable
 * the whoami/boards/token-status/refresh endpoints; the queue-management
 * routes work without one.
 *
 * @param {import('express').Express} app
 * @param {{apiClient?: import('./api_client.js').PinterestApiClient | null}} [opts]
 */
export function installPinterestModule(app, opts = {}) {
  app.use('/api/pinterest', buildRouter(opts));
}
