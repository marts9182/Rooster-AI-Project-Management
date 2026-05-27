import fs from 'node:fs';
import path from 'node:path';

/**
 * @typedef {Object} StoredToken
 * @property {string} access_token
 * @property {string} refresh_token
 * @property {number} expires_at   unix-seconds
 */

/**
 * @typedef {Object} EnsureFreshArgs
 * @property {import('./config.js').EtsyConfig} cfg
 * @property {typeof fetch} [fetchFn]   override for tests
 * @property {number} [skewSeconds]     refresh if expires_at <= now+skew (default 60)
 */

const TOKEN_URL = 'https://api.etsy.com/v3/public/oauth/token';

/**
 * Load the persisted token; refresh it via Etsy if within the skew window.
 * Returns the (possibly-refreshed) access_token string. Writes the new
 * token JSON back to disk in-place.
 *
 * Ported from the Python helper at
 * `projects/etsy-rooster-shop/src/etsy_rooster/etsy/oauth.py::ensure_fresh_token`
 * so the dashboard stays fully Node-based.
 *
 * @param {EnsureFreshArgs} args
 * @returns {Promise<string>}
 */
export async function ensureFreshToken({ cfg, fetchFn = fetch, skewSeconds = 60 }) {
  const tokenPath = cfg.tokenPath;
  if (!fs.existsSync(tokenPath)) {
    throw new Error(
      `Etsy token file not found at ${tokenPath}. Run the OAuth setup script first.`,
    );
  }
  /** @type {StoredToken} */
  const stored = JSON.parse(fs.readFileSync(tokenPath, 'utf8'));
  const nowSec = Math.floor(Date.now() / 1000);
  if (stored.expires_at > nowSec + skewSeconds) {
    return stored.access_token;
  }

  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: cfg.keystring,
    refresh_token: stored.refresh_token,
  });
  /** @type {Response} */
  let resp;
  try {
    resp = await fetchFn(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
  } catch (err) {
    throw new Error(`Etsy token refresh network error: ${err && err.message ? err.message : err}`);
  }
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Etsy token refresh failed: ${resp.status} ${text}`);
  }
  /** @type {{access_token: string, refresh_token?: string, expires_in: number}} */
  const fresh = await resp.json();
  /** @type {StoredToken} */
  const next = {
    access_token: fresh.access_token,
    refresh_token: fresh.refresh_token ?? stored.refresh_token,
    expires_at: nowSec + Number(fresh.expires_in),
  };
  fs.mkdirSync(path.dirname(tokenPath), { recursive: true });
  fs.writeFileSync(tokenPath, JSON.stringify(next), 'utf8');
  return next.access_token;
}
