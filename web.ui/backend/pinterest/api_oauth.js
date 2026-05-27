/**
 * Pinterest v5 OAuth helper.
 *
 * Ported from `web.ui/backend/etsy/oauth.js`. Differences:
 *   - Stores `expires_at` as an ISO string (Etsy uses unix seconds).
 *   - Uses HTTP Basic auth for the refresh call (Etsy uses public OAuth).
 *   - Has a first-run bootstrap that materialises the token file from
 *     PINTEREST_ACCESS_TOKEN / PINTEREST_REFRESH_TOKEN env vars.
 *
 * @module pinterest/api_oauth
 */
import fs from 'node:fs';
import path from 'node:path';

/**
 * @typedef {Object} StoredToken
 * @property {string} access_token
 * @property {string} refresh_token
 * @property {string} expires_at   ISO 8601 timestamp
 */

/**
 * @typedef {Object} EnsureFreshArgs
 * @property {string} tokenStorePath
 * @property {string} appId
 * @property {string} appSecret
 * @property {typeof fetch} [fetchFn]
 * @property {number} [skewMs]   refresh if expires_at - now <= skewMs (default 5min)
 */

const TOKEN_URL = 'https://api.pinterest.com/v5/oauth/token';
const DEFAULT_SKEW_MS = 5 * 60 * 1000;
const DEFAULT_BOOTSTRAP_TTL_MS = 30 * 86400_000;

/**
 * Resolve the persisted token, bootstrapping from env on first run, then
 * refreshing if within the 5-minute skew. Writes the (possibly updated)
 * token back to disk and returns the access_token string.
 *
 * @param {EnsureFreshArgs} args
 * @returns {Promise<string>}
 */
export async function ensureFreshToken({
  tokenStorePath,
  appId,
  appSecret,
  fetchFn = fetch,
  skewMs = DEFAULT_SKEW_MS,
}) {
  const stored = loadOrBootstrap(tokenStorePath);
  const expiresMs = new Date(stored.expires_at).getTime();
  if (expiresMs - Date.now() > skewMs) {
    return stored.access_token;
  }

  // Trial-mode tokens often arrive without a refresh_token (Pinterest's
  // "Generate access token" button gives you just the access token; users
  // regenerate manually every ~30 days). If we have no refresh token, hand
  // back the access token and let the next API call surface a 401 with a
  // clear message instead of crashing the whole refresh path here.
  if (!stored.refresh_token) {
    return stored.access_token;
  }

  /** @type {Response} */
  let resp;
  try {
    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: stored.refresh_token,
    });
    const auth = Buffer.from(`${appId}:${appSecret}`).toString('base64');
    resp = await fetchFn(TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${auth}`,
      },
      body,
    });
  } catch (err) {
    const msg = err && err.message ? err.message : String(err);
    throw new Error(`Pinterest token refresh network error: ${msg}`);
  }

  if (resp.status === 401) {
    throw new Error('Pinterest refresh token expired — re-auth required');
  }
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Pinterest token refresh failed: ${resp.status} ${text}`);
  }

  /** @type {{access_token: string, refresh_token?: string, expires_in: number}} */
  const fresh = await resp.json();
  /** @type {StoredToken} */
  const next = {
    access_token: fresh.access_token,
    refresh_token: fresh.refresh_token ?? stored.refresh_token,
    expires_at: new Date(Date.now() + Number(fresh.expires_in) * 1000).toISOString(),
  };
  fs.mkdirSync(path.dirname(tokenStorePath), { recursive: true });
  fs.writeFileSync(tokenStorePath, JSON.stringify(next), 'utf8');
  return next.access_token;
}

/**
 * Force the next ensureFreshToken() call to refresh by zeroing the persisted
 * expires_at on disk, then immediately call ensureFreshToken. Used by the
 * POST /api/pinterest/refresh route so an operator can rotate the token
 * on demand from the Settings UI.
 *
 * @param {EnsureFreshArgs} args
 * @returns {Promise<string>}
 */
export async function _forceRefresh(args) {
  if (fs.existsSync(args.tokenStorePath)) {
    const stored = JSON.parse(fs.readFileSync(args.tokenStorePath, 'utf8'));
    stored.expires_at = new Date(0).toISOString();
    fs.writeFileSync(args.tokenStorePath, JSON.stringify(stored), 'utf8');
  }
  return ensureFreshToken(args);
}

/**
 * @param {string} tokenStorePath
 * @returns {StoredToken}
 */
function loadOrBootstrap(tokenStorePath) {
  if (fs.existsSync(tokenStorePath)) {
    return /** @type {StoredToken} */ (
      JSON.parse(fs.readFileSync(tokenStorePath, 'utf8'))
    );
  }
  const access = process.env.PINTEREST_ACCESS_TOKEN;
  if (!access) {
    throw new Error(
      `Pinterest token file not found at ${tokenStorePath}. ` +
        'Set PINTEREST_ACCESS_TOKEN in .env.local for first-run bootstrap ' +
        '(PINTEREST_REFRESH_TOKEN optional — trial-mode users typically ' +
        "regenerate manually from the dev portal every ~30 days).",
    );
  }
  // Refresh token is optional. In Pinterest's "Generate access token"
  // trial flow, no refresh token is issued — the user re-pastes a fresh
  // access_token when this one expires.
  const refresh = process.env.PINTEREST_REFRESH_TOKEN || '';
  const expiresAt =
    process.env.PINTEREST_TOKEN_EXPIRES_AT ||
    new Date(Date.now() + DEFAULT_BOOTSTRAP_TTL_MS).toISOString();
  /** @type {StoredToken} */
  const seed = {
    access_token: access,
    refresh_token: refresh,
    expires_at: expiresAt,
  };
  fs.mkdirSync(path.dirname(tokenStorePath), { recursive: true });
  fs.writeFileSync(tokenStorePath, JSON.stringify(seed), 'utf8');
  return seed;
}

/**
 * Read the persisted token without refreshing (used by token-status route).
 * Returns null when no file exists yet.
 *
 * @param {string} tokenStorePath
 * @returns {StoredToken|null}
 */
export function readStoredToken(tokenStorePath) {
  if (!fs.existsSync(tokenStorePath)) return null;
  return /** @type {StoredToken} */ (
    JSON.parse(fs.readFileSync(tokenStorePath, 'utf8'))
  );
}
