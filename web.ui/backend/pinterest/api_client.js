/**
 * Thin Pinterest v5 API client. Bearer auth comes from api_oauth.js;
 * 401 errors transparently force a refresh and retry once; 429 errors
 * back off through `backoffMs`; 5xx errors retry up to 3 attempts total.
 *
 * @module pinterest/api_client
 */
import fs from 'node:fs';
import { ensureFreshToken, readStoredToken, _forceRefresh } from './api_oauth.js';

const BASE = 'https://api.pinterest.com';
const DEFAULT_BACKOFF_MS = [60_000, 5 * 60_000, 30 * 60_000];
const MAX_5XX_ATTEMPTS = 3;

/**
 * @typedef {Object} ApiClientArgs
 * @property {string} tokenStorePath
 * @property {string} appId
 * @property {string} appSecret
 * @property {string} [baseUrl]      override (tests)
 * @property {typeof fetch} [fetchFn]
 * @property {number[]} [backoffMs]   429 retry ladder (default 60s/5m/30m)
 */

/**
 * @typedef {Object} CreatePinArgs
 * @property {string} board_id
 * @property {string} title
 * @property {string} description
 * @property {string} link
 * @property {string} imagePath
 */

/**
 * @typedef {Object} PinterestBoard
 * @property {string} id
 * @property {string} name
 * @property {string} [privacy]
 */

/**
 * @typedef {Object} PinterestUser
 * @property {string} username
 * @property {string} [business_name]
 */

/**
 * @typedef {Object} PinterestTokenStatus
 * @property {boolean} connected
 * @property {string|null} expires_at
 */

export class PinterestApiError extends Error {
  /**
   * @param {string} message
   * @param {{status: number, body: string, code?: number}} info
   */
  constructor(message, { status, body, code }) {
    super(message);
    this.name = 'PinterestApiError';
    this.status = status;
    this.body = body;
    this.code = code;
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export class PinterestApiClient {
  /** @param {ApiClientArgs} args */
  constructor(args) {
    this.tokenStorePath = args.tokenStorePath;
    this.appId = args.appId;
    this.appSecret = args.appSecret;
    this.baseUrl = args.baseUrl ?? BASE;
    this.fetchFn = args.fetchFn ?? fetch;
    this.backoffMs = args.backoffMs ?? DEFAULT_BACKOFF_MS;
  }

  /** @returns {Promise<string>} */
  async _token() {
    return ensureFreshToken({
      tokenStorePath: this.tokenStorePath,
      appId: this.appId,
      appSecret: this.appSecret,
      fetchFn: this.fetchFn,
    });
  }

  /**
   * Force a token refresh (zeroes expires_at then calls ensureFreshToken).
   * Used by the POST /api/pinterest/refresh route.
   *
   * @returns {Promise<string>}
   */
  async _forceRefresh() {
    return _forceRefresh({
      tokenStorePath: this.tokenStorePath,
      appId: this.appId,
      appSecret: this.appSecret,
      fetchFn: this.fetchFn,
    });
  }

  /**
   * Call the API with full retry behavior.
   *   - 401 → force refresh and retry once; second 401 surfaces as error
   *   - 429 → sleep `backoffMs[attempt]` and retry; cap at backoffMs.length retries
   *   - 5xx → retry up to MAX_5XX_ATTEMPTS total attempts
   *   - other non-2xx → throw immediately
   *
   * @param {string} method
   * @param {string} path  e.g. '/v5/pins'
   * @param {object|null} body  JSON body or null for GET
   * @returns {Promise<any>}
   */
  async _callApi(method, path, body) {
    let refreshedOnce = false;
    let attempt5xx = 1;     // current attempt count (1 == first try)
    let attempt429 = 0;     // index into backoffMs ladder

    // eslint-disable-next-line no-constant-condition
    while (true) {
      const token = await this._token();
      /** @type {RequestInit} */
      const init = {
        method,
        headers: { Authorization: `Bearer ${token}` },
      };
      if (body !== null && body !== undefined) {
        init.headers['Content-Type'] = 'application/json';
        init.body = JSON.stringify(body);
      }
      const resp = await this.fetchFn(`${this.baseUrl}${path}`, init);

      if (resp.ok) {
        return resp.json();
      }

      const text = await resp.text();
      let parsedCode;
      try {
        parsedCode = JSON.parse(text)?.code;
      } catch { /* non-JSON body */ }

      if (resp.status === 401 && !refreshedOnce) {
        // Force the next _token() to refresh by zeroing expires_at on disk.
        forceTokenExpiry(this.tokenStorePath);
        refreshedOnce = true;
        continue;
      }
      if (resp.status === 429 && attempt429 < this.backoffMs.length) {
        await sleep(this.backoffMs[attempt429]);
        attempt429 += 1;
        continue;
      }
      if (resp.status >= 500 && resp.status < 600 && attempt5xx < MAX_5XX_ATTEMPTS) {
        // Use a short sleep tied to the front of the backoff ladder; this
        // keeps the test suite fast while still giving prod a real pause.
        await sleep(this.backoffMs[Math.min(attempt5xx - 1, this.backoffMs.length - 1)]);
        attempt5xx += 1;
        continue;
      }
      throw new PinterestApiError(
        `Pinterest ${method} ${path} ${resp.status}: ${text}`,
        { status: resp.status, body: text, code: parsedCode },
      );
    }
  }

  /**
   * @param {CreatePinArgs} args
   * @returns {Promise<{id: string, url?: string}>}
   */
  async createPin(args) {
    const buf = fs.readFileSync(args.imagePath);
    const body = {
      board_id: args.board_id,
      title: args.title,
      description: args.description,
      link: args.link,
      media_source: {
        source_type: 'image_base64',
        content_type: 'image/png',
        data: buf.toString('base64'),
      },
    };
    return this._callApi('POST', '/v5/pins', body);
  }

  /** @returns {Promise<PinterestBoard[]>} */
  async listBoards() {
    const resp = await this._callApi('GET', '/v5/boards', null);
    return resp.items ?? [];
  }

  /** @returns {Promise<PinterestUser>} */
  async getUserAccount() {
    return this._callApi('GET', '/v5/user_account', null);
  }

  /**
   * Pin engagement metrics for the last 30 days.
   * @param {string} pinId
   * @returns {Promise<{saves: number, clicks: number, impressions: number}>}
   */
  async getPinAnalytics(pinId) {
    const today = new Date().toISOString().slice(0, 10);
    const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
      .toISOString().slice(0, 10);
    const qs = `metric_types=SAVE,PIN_CLICK,IMPRESSION&start_date=${monthAgo}&end_date=${today}`;
    const body = await this._callApi(
      'GET',
      `/v5/pins/${encodeURIComponent(pinId)}/analytics?${qs}`,
      null,
    );
    // The analytics response shape varies by API version; defensively
    // pluck the three totals from the all_time bucket if present.
    const allTime = body?.all_time ?? body?.daily_metrics?.[0] ?? body;
    return {
      saves: Number(allTime?.SAVE ?? 0),
      clicks: Number(allTime?.PIN_CLICK ?? 0),
      impressions: Number(allTime?.IMPRESSION ?? 0),
    };
  }

  /**
   * Read the token file directly (no refresh). `connected=true` only when
   * the file exists, parses, and its expires_at is still in the future.
   *
   * @returns {Promise<PinterestTokenStatus>}
   */
  async getTokenStatus() {
    let stored;
    try {
      stored = readStoredToken(this.tokenStorePath);
    } catch {
      return { connected: false, expires_at: null };
    }
    if (!stored) return { connected: false, expires_at: null };
    const expiresMs = new Date(stored.expires_at).getTime();
    if (!Number.isFinite(expiresMs) || expiresMs <= Date.now()) {
      return { connected: false, expires_at: stored.expires_at ?? null };
    }
    return { connected: true, expires_at: stored.expires_at };
  }

  /**
   * Live connection check: validates the token by actually calling the API.
   * Unlike getTokenStatus (which only inspects the local file), this catches
   * dead/wrong-environment tokens that still have a future expires_at.
   *
   * @returns {Promise<{connected: boolean, live_ok: boolean, expires_at: string|null,
   *   identity: {username: string, business_name: string|null}|null, error: string|null}>}
   */
  async getLiveStatus() {
    const base = await this.getTokenStatus();
    if (!base.connected) {
      return { ...base, live_ok: false, identity: null, error: 'no_valid_token' };
    }
    try {
      const u = await this.getUserAccount();
      return {
        ...base,
        live_ok: true,
        identity: { username: u.username, business_name: u.business_name ?? null },
        error: null,
      };
    } catch (err) {
      // Surface "401" in the error message when the underlying failure is an
      // authentication error — either a PinterestApiError with status 401, or
      // the oauth layer's "refresh token expired" error (which is also a 401
      // from Pinterest's token endpoint).
      const status = err && typeof err === 'object' && 'status' in err ? err.status : null;
      const raw = err?.message ?? String(err);
      const isAuthError =
        status === 401 ||
        /refresh token expired|re-auth required/i.test(raw);
      const message = isAuthError && !/401/.test(raw) ? `401 ${raw}` : raw;
      return { ...base, live_ok: false, identity: null, error: message };
    }
  }
}

/**
 * Factory mirror of the constructor (matches the plan's intended API where
 * callers can use either `new PinterestApiClient({...})` or
 * `createPinterestApiClient({...})`).
 *
 * @param {ApiClientArgs} args
 * @returns {PinterestApiClient}
 */
export function createPinterestApiClient(args) {
  return new PinterestApiClient(args);
}

/**
 * Mark the persisted token's expires_at to the unix epoch so the next
 * ensureFreshToken() call refreshes it. Used after a 401 response.
 *
 * @param {string} tokenStorePath
 */
function forceTokenExpiry(tokenStorePath) {
  if (!fs.existsSync(tokenStorePath)) return;
  const stored = JSON.parse(fs.readFileSync(tokenStorePath, 'utf8'));
  stored.expires_at = new Date(0).toISOString();
  fs.writeFileSync(tokenStorePath, JSON.stringify(stored), 'utf8');
}
