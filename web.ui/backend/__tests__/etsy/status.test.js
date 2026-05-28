import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { getEtsyStatus } from '../../etsy/status.js';
import {
  setWorkerHeartbeat,
  setWorkerError,
  _resetWorkerStatus,
} from '../../workerStatus.js';

const ENV_KEYS = [
  'ETSY_KEYSTRING',
  'ETSY_SHARED_SECRET',
  'ETSY_SHOP_ID',
  'ETSY_TOKEN_PATH',
  'ROOSTER_ETSY_TOKEN_PATH',
];

describe('getEtsyStatus', () => {
  /** @type {Record<string, string | undefined>} */
  let snap;
  /** @type {string} */
  let tmpDir;

  beforeEach(() => {
    snap = {};
    for (const k of ENV_KEYS) {
      snap[k] = process.env[k];
      delete process.env[k];
    }
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'etsy-status-'));
    _resetWorkerStatus();
  });

  afterEach(() => {
    for (const k of ENV_KEYS) {
      if (snap[k] === undefined) delete process.env[k];
      else process.env[k] = snap[k];
    }
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns configured:false with all three missingEnv when none set', () => {
    const s = getEtsyStatus();
    expect(s.configured).toBe(false);
    expect(s.missingEnv).toEqual([
      'ETSY_KEYSTRING',
      'ETSY_SHARED_SECRET',
      'ETSY_SHOP_ID',
    ]);
    expect(s.tokenPresent).toBe(false);
    expect(s.tokenExpiresAt).toBeNull();
    expect(s.lastHeartbeatAt).toBeNull();
    expect(s.lastError).toBeNull();
    expect(s.lastSyncAt).toBeNull();
  });

  it('reports non-numeric ETSY_SHOP_ID as missing', () => {
    process.env.ETSY_KEYSTRING = 'k';
    process.env.ETSY_SHARED_SECRET = 's';
    process.env.ETSY_SHOP_ID = 'abc';
    const s = getEtsyStatus();
    expect(s.configured).toBe(false);
    expect(s.missingEnv).toEqual(['ETSY_SHOP_ID']);
  });

  it('returns tokenPresent:false when env complete but file missing', () => {
    process.env.ETSY_KEYSTRING = 'k';
    process.env.ETSY_SHARED_SECRET = 's';
    process.env.ETSY_SHOP_ID = '66064739';
    process.env.ROOSTER_ETSY_TOKEN_PATH = path.join(tmpDir, 'nope.json');
    const s = getEtsyStatus();
    expect(s.configured).toBe(true);
    expect(s.missingEnv).toEqual([]);
    expect(s.tokenPresent).toBe(false);
    expect(s.tokenExpiresAt).toBeNull();
  });

  it('returns tokenPresent + expiresAt when file exists', () => {
    process.env.ETSY_KEYSTRING = 'k';
    process.env.ETSY_SHARED_SECRET = 's';
    process.env.ETSY_SHOP_ID = '66064739';
    const tokenPath = path.join(tmpDir, 'token.json');
    process.env.ROOSTER_ETSY_TOKEN_PATH = tokenPath;
    fs.writeFileSync(
      tokenPath,
      JSON.stringify({
        access_token: 'a',
        refresh_token: 'r',
        expires_at: 1900000000,
      }),
    );
    const s = getEtsyStatus();
    expect(s.tokenPresent).toBe(true);
    expect(s.tokenExpiresAt).toBe('2030-03-17T17:46:40.000Z');
  });

  it('returns lastHeartbeatAt + lastError:null on heartbeat-after-error', () => {
    process.env.ETSY_KEYSTRING = 'k';
    process.env.ETSY_SHARED_SECRET = 's';
    process.env.ETSY_SHOP_ID = '1';
    setWorkerError('etsy.syncer','boom');
    setWorkerHeartbeat('etsy.syncer');
    const s = getEtsyStatus();
    expect(s.lastHeartbeatAt).not.toBeNull();
    expect(s.lastSyncAt).toBe(s.lastHeartbeatAt);
    expect(s.lastError).toBeNull();
  });

  it('returns lastError when error is newer than heartbeat', () => {
    process.env.ETSY_KEYSTRING = 'k';
    process.env.ETSY_SHARED_SECRET = 's';
    process.env.ETSY_SHOP_ID = '1';
    setWorkerHeartbeat('etsy.syncer');
    setWorkerError('etsy.syncer','token refresh failed');
    const s = getEtsyStatus();
    expect(s.lastError).toBe('token refresh failed');
  });

  it('tolerates an unparseable token file', () => {
    process.env.ETSY_KEYSTRING = 'k';
    process.env.ETSY_SHARED_SECRET = 's';
    process.env.ETSY_SHOP_ID = '1';
    const tokenPath = path.join(tmpDir, 'bad.json');
    process.env.ROOSTER_ETSY_TOKEN_PATH = tokenPath;
    fs.writeFileSync(tokenPath, 'not json');
    const s = getEtsyStatus();
    expect(s.tokenPresent).toBe(true);
    expect(s.tokenExpiresAt).toBeNull();
  });
});
