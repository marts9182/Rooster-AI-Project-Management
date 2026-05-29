/**
 * @typedef {Object} EtsyListing
 * @property {number} listing_id
 * @property {string} title
 * @property {string} state
 * @property {string} [sku_id]
 * @property {{amount: number, divisor: number, currency_code: string}} [price]
 * @property {string} [url]
 * @property {string|number} [shop_section_id]
 * @property {number} [num_favorers]
 * @property {number} [views]
 * @property {number} [original_creation_timestamp]
 */

/**
 * @typedef {Object} EtsyClientArgs
 * @property {string} keystring
 * @property {string} sharedSecret
 * @property {number} shopId
 * @property {() => Promise<string>} getAccessToken  resolves to a fresh bearer token
 * @property {typeof fetch} [fetchFn]
 */

const BASE = 'https://openapi.etsy.com';

/**
 * Thrown for any non-2xx Etsy v3 response. Carries `.status` (HTTP code)
 * and `.body` (raw response text) so callers can branch on auth errors,
 * surface error pages, or log structured diagnostics.
 */
export class EtsyApiError extends Error {
  /**
   * @param {string} message
   * @param {{status: number, body: string}} info
   */
  constructor(message, { status, body }) {
    super(message);
    this.name = 'EtsyApiError';
    this.status = status;
    this.body = body;
  }
}

export class EtsyClient {
  /** @param {EtsyClientArgs} args */
  constructor(args) {
    this.keystring = args.keystring;
    this.sharedSecret = args.sharedSecret;
    this.shopId = args.shopId;
    this.getAccessToken = args.getAccessToken;
    this.fetchFn = args.fetchFn ?? fetch;
  }

  /** @returns {Promise<Record<string,string>>} */
  async _headers() {
    const token = await this.getAccessToken();
    return {
      Authorization: `Bearer ${token}`,
      'x-api-key': `${this.keystring}:${this.sharedSecret}`,
    };
  }

  /**
   * One page of listings.
   * @param {{state?: string, limit?: number, offset?: number}} [opts]
   * @returns {Promise<{count: number, results: EtsyListing[]}>}
   */
  async listListings(opts = {}) {
    const state = opts.state ?? 'active';
    const limit = opts.limit ?? 100;
    const offset = opts.offset ?? 0;
    const url = new URL(`${BASE}/v3/application/shops/${this.shopId}/listings`);
    url.searchParams.set('state', state);
    url.searchParams.set('limit', String(limit));
    url.searchParams.set('offset', String(offset));
    const resp = await this.fetchFn(url.toString(), { headers: await this._headers() });
    if (!resp.ok) {
      const body = await resp.text();
      throw new EtsyApiError(`Etsy listings ${resp.status}: ${body}`, {
        status: resp.status,
        body,
      });
    }
    return /** @type {Promise<{count: number, results: EtsyListing[]}>} */ (resp.json());
  }

  /**
   * Paged convenience that returns every listing.
   * @param {{state?: string, pageSize?: number}} [opts]
   * @returns {Promise<EtsyListing[]>}
   */
  async listAllListings(opts = {}) {
    const state = opts.state ?? 'active';
    const pageSize = opts.pageSize ?? 100;
    let offset = 0;
    /** @type {EtsyListing[]} */
    const out = [];
    // Hard ceiling at 50 pages (5000 listings) to avoid runaway loops.
    for (let page = 0; page < 50; page += 1) {
      const r = await this.listListings({ state, limit: pageSize, offset });
      out.push(...r.results);
      offset += r.results.length;
      if (r.results.length < pageSize || offset >= r.count) break;
    }
    return out;
  }

  /**
   * @param {number} listingId
   * @returns {Promise<EtsyListing>}
   */
  async getListing(listingId) {
    const url = `${BASE}/v3/application/listings/${listingId}`;
    const resp = await this.fetchFn(url, { headers: await this._headers() });
    if (!resp.ok) {
      const body = await resp.text();
      throw new EtsyApiError(`Etsy listing ${listingId} ${resp.status}: ${body}`, {
        status: resp.status,
        body,
      });
    }
    return /** @type {Promise<EtsyListing>} */ (resp.json());
  }
}
