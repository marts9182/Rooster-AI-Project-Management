import path from 'node:path';

/**
 * @typedef {Object} EtsyConfig
 * @property {string} keystring
 * @property {string} sharedSecret
 * @property {number} shopId
 * @property {string} tokenPath  absolute path
 */

/**
 * Load Etsy config from process.env.
 *
 * Required env: ETSY_KEYSTRING, ETSY_SHARED_SECRET, ETSY_SHOP_ID.
 * Optional token-path override: ROOSTER_ETSY_TOKEN_PATH (preferred) or
 * ETSY_TOKEN_PATH. Default is `data/etsy_token.json` resolved against cwd.
 *
 * @returns {EtsyConfig}
 */
export function etsyConfig() {
  const required = ['ETSY_KEYSTRING', 'ETSY_SHARED_SECRET', 'ETSY_SHOP_ID'];
  for (const key of required) {
    if (!process.env[key]) {
      throw new Error(`Missing required env var: ${key}`);
    }
  }
  const shopIdRaw = process.env.ETSY_SHOP_ID ?? '';
  const shopId = Number.parseInt(shopIdRaw, 10);
  if (!Number.isFinite(shopId) || String(shopId) !== shopIdRaw.trim()) {
    throw new Error(`ETSY_SHOP_ID must be numeric, got: ${shopIdRaw}`);
  }
  const tokenPathRaw =
    process.env.ROOSTER_ETSY_TOKEN_PATH ||
    process.env.ETSY_TOKEN_PATH ||
    'data/etsy_token.json';
  return {
    keystring: process.env.ETSY_KEYSTRING ?? '',
    sharedSecret: process.env.ETSY_SHARED_SECRET ?? '',
    shopId,
    tokenPath: path.resolve(tokenPathRaw),
  };
}
