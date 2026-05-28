/**
 * Read-only Etsy status reporter. Inspects env, the token file on disk,
 * and the in-memory workerStatus map. No refresh attempts, no mutations.
 *
 * @module etsy/status
 */
import fs from 'node:fs';
import path from 'node:path';
import { getAllStatuses } from '../workerStatus.js';

/**
 * @typedef {Object} EtsyStatus
 * @property {boolean} configured
 * @property {string[]} missingEnv
 * @property {boolean} tokenPresent
 * @property {string | null} tokenExpiresAt   ISO datetime
 * @property {string | null} lastHeartbeatAt  ISO datetime
 * @property {string | null} lastError
 * @property {string | null} lastSyncAt       alias of lastHeartbeatAt
 */

const REQUIRED = ['ETSY_KEYSTRING', 'ETSY_SHARED_SECRET', 'ETSY_SHOP_ID'];

/**
 * @param {{
 *   env?: NodeJS.ProcessEnv,
 *   statuses?: Record<string, {
 *     last_success_at: string|null,
 *     last_error_at: string|null,
 *     last_error_message: string|null,
 *     _success_seq: number,
 *     _error_seq: number,
 *   }>,
 *   fs?: typeof fs,
 * }} [opts]
 * @returns {EtsyStatus}
 */
export function getEtsyStatus(opts = {}) {
  const env = opts.env ?? process.env;
  const statuses = opts.statuses ?? getAllStatuses();
  const fsImpl = opts.fs ?? fs;

  const missingEnv = [];
  for (const k of REQUIRED) {
    if (!env[k]) missingEnv.push(k);
  }
  if (env.ETSY_SHOP_ID && !/^\d+$/.test(env.ETSY_SHOP_ID.trim())) {
    if (!missingEnv.includes('ETSY_SHOP_ID')) missingEnv.push('ETSY_SHOP_ID');
  }
  const configured = missingEnv.length === 0;

  const tokenPathRaw =
    env.ROOSTER_ETSY_TOKEN_PATH ||
    env.ETSY_TOKEN_PATH ||
    'data/etsy_token.json';
  const tokenPath = path.resolve(tokenPathRaw);

  let tokenPresent = false;
  let tokenExpiresAt = null;
  try {
    fsImpl.statSync(tokenPath);
    tokenPresent = true;
    try {
      const raw = fsImpl.readFileSync(tokenPath, 'utf8');
      const parsed = JSON.parse(raw);
      if (typeof parsed.expires_at === 'number') {
        tokenExpiresAt = new Date(parsed.expires_at * 1000).toISOString();
      }
    } catch {
      // Present but unparseable — leave tokenExpiresAt null.
    }
  } catch {
    // Not present.
  }

  const w = statuses['etsy'];
  const lastHeartbeatAt = w?.last_success_at ?? null;
  let lastError = null;
  if (w && w.last_error_at && w.last_error_message && w._error_seq > w._success_seq) {
    lastError = w.last_error_message;
  }

  return {
    configured,
    missingEnv,
    tokenPresent,
    tokenExpiresAt,
    lastHeartbeatAt,
    lastError,
    lastSyncAt: lastHeartbeatAt,
  };
}
