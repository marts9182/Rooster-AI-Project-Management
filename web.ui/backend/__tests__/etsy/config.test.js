import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import { etsyConfig } from '../../etsy/config.js';

const KEYS = [
  'ETSY_KEYSTRING',
  'ETSY_SHARED_SECRET',
  'ETSY_SHOP_ID',
  'ETSY_TOKEN_PATH',
  'ROOSTER_ETSY_TOKEN_PATH',
];

describe('etsyConfig', () => {
  /** @type {Record<string, string | undefined>} */
  let snapshot;

  beforeEach(() => {
    snapshot = {};
    for (const k of KEYS) {
      snapshot[k] = process.env[k];
      delete process.env[k];
    }
  });

  afterEach(() => {
    for (const k of KEYS) {
      if (snapshot[k] === undefined) delete process.env[k];
      else process.env[k] = snapshot[k];
    }
  });

  it('reads required env vars', () => {
    process.env.ETSY_KEYSTRING = 'key123';
    process.env.ETSY_SHARED_SECRET = 'secretXYZ';
    process.env.ETSY_SHOP_ID = '66064739';

    const cfg = etsyConfig();
    expect(cfg.keystring).toBe('key123');
    expect(cfg.sharedSecret).toBe('secretXYZ');
    expect(cfg.shopId).toBe(66064739);
    expect(cfg.tokenPath).toBe(path.resolve('data/etsy_token.json'));
  });

  it('honors ETSY_TOKEN_PATH override', () => {
    process.env.ETSY_KEYSTRING = 'k';
    process.env.ETSY_SHARED_SECRET = 's';
    process.env.ETSY_SHOP_ID = '1';
    process.env.ETSY_TOKEN_PATH = '/tmp/custom.json';

    expect(etsyConfig().tokenPath).toBe(path.resolve('/tmp/custom.json'));
  });

  it('honors ROOSTER_ETSY_TOKEN_PATH override (preferred over ETSY_TOKEN_PATH)', () => {
    process.env.ETSY_KEYSTRING = 'k';
    process.env.ETSY_SHARED_SECRET = 's';
    process.env.ETSY_SHOP_ID = '1';
    process.env.ETSY_TOKEN_PATH = '/tmp/other.json';
    process.env.ROOSTER_ETSY_TOKEN_PATH = '/tmp/preferred.json';

    expect(etsyConfig().tokenPath).toBe(path.resolve('/tmp/preferred.json'));
  });

  it('throws if any required var is missing', () => {
    expect(() => etsyConfig()).toThrow(/ETSY_KEYSTRING/);
  });

  it('throws if ETSY_SHOP_ID is not numeric', () => {
    process.env.ETSY_KEYSTRING = 'k';
    process.env.ETSY_SHARED_SECRET = 's';
    process.env.ETSY_SHOP_ID = 'abc';
    expect(() => etsyConfig()).toThrow(/numeric/);
  });
});
