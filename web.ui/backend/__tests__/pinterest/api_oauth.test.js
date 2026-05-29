/**
 * Tests for pinterest/api_oauth.js — ensureFreshToken().
 *
 * Mirrors the Etsy oauth.test.js pattern (vi-mocked fetch) so no real
 * Pinterest endpoint is hit. msw is reserved for api_client.test.js where
 * the broader 401/429/5xx routing is easier to exercise via interceptors.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ensureFreshToken } from '../../pinterest/api_oauth.js';

const NOW_MS = 1_700_000_000_000;

function makeArgs(tokenPath, overrides = {}) {
  return {
    tokenStorePath: tokenPath,
    appId: '1572111',
    appSecret: 'shh-secret',
    ...overrides,
  };
}

function writeToken(tokenPath, payload) {
  fs.mkdirSync(path.dirname(tokenPath), { recursive: true });
  fs.writeFileSync(tokenPath, JSON.stringify(payload), 'utf8');
}

let tmpDir;
let tokenPath;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pin-oauth-'));
  tokenPath = path.join(tmpDir, 'pinterest_token.json');
  vi.spyOn(Date, 'now').mockReturnValue(NOW_MS);
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

describe('ensureFreshToken', () => {
  it('returns cached access_token when expires_at is more than 5 minutes away', async () => {
    writeToken(tokenPath, {
      access_token: 'cached',
      refresh_token: 'rrr',
      expires_at: new Date(NOW_MS + 10 * 60 * 1000).toISOString(),
    });
    const fetchSpy = vi.fn();
    const token = await ensureFreshToken({ ...makeArgs(tokenPath), fetchFn: fetchSpy });
    expect(token).toBe('cached');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('refreshes when expires_at is within the 5-minute skew', async () => {
    writeToken(tokenPath, {
      access_token: 'old',
      refresh_token: 'rrr',
      expires_at: new Date(NOW_MS + 60_000).toISOString(),
    });
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ access_token: 'new', refresh_token: 'rrr2', expires_in: 2592000 }),
    });
    const token = await ensureFreshToken({ ...makeArgs(tokenPath), fetchFn: fetchSpy });
    expect(token).toBe('new');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe('https://api.pinterest.com/v5/oauth/token');
    expect(init.method).toBe('POST');
    expect(init.headers['Content-Type']).toBe('application/x-www-form-urlencoded');
    expect(init.headers['Authorization']).toBe(
      'Basic ' + Buffer.from('1572111:shh-secret').toString('base64'),
    );
    expect(String(init.body)).toContain('grant_type=refresh_token');
    expect(String(init.body)).toContain('refresh_token=rrr');
    const persisted = JSON.parse(fs.readFileSync(tokenPath, 'utf8'));
    expect(persisted.access_token).toBe('new');
    expect(persisted.refresh_token).toBe('rrr2');
    expect(new Date(persisted.expires_at).getTime()).toBe(NOW_MS + 2592000 * 1000);
  });

  it('preserves old refresh_token when response omits a new one', async () => {
    writeToken(tokenPath, {
      access_token: 'old',
      refresh_token: 'keep-me',
      expires_at: new Date(NOW_MS - 5_000).toISOString(),
    });
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ access_token: 'fresh', expires_in: 600 }),
    });
    await ensureFreshToken({ ...makeArgs(tokenPath), fetchFn: fetchSpy });
    const persisted = JSON.parse(fs.readFileSync(tokenPath, 'utf8'));
    expect(persisted.refresh_token).toBe('keep-me');
    expect(persisted.access_token).toBe('fresh');
  });

  it('throws "re-auth required" on 401 refresh response', async () => {
    writeToken(tokenPath, {
      access_token: 'old',
      refresh_token: 'rrr',
      expires_at: new Date(NOW_MS - 5_000).toISOString(),
    });
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => '{"code":7,"message":"invalid_grant"}',
    });
    await expect(
      ensureFreshToken({ ...makeArgs(tokenPath), fetchFn: fetchSpy }),
    ).rejects.toThrow(/re-auth required/i);
  });

  it('bubbles up fetch network errors with a clear message', async () => {
    writeToken(tokenPath, {
      access_token: 'old',
      refresh_token: 'rrr',
      expires_at: new Date(NOW_MS - 5_000).toISOString(),
    });
    const fetchSpy = vi.fn().mockRejectedValue(new Error('ECONNRESET'));
    await expect(
      ensureFreshToken({ ...makeArgs(tokenPath), fetchFn: fetchSpy }),
    ).rejects.toThrow(/network error.*ECONNRESET/i);
  });

  it('first-run bootstrap: writes token file from env when missing', async () => {
    process.env.PINTEREST_ACCESS_TOKEN = 'envA';
    process.env.PINTEREST_REFRESH_TOKEN = 'envR';
    process.env.PINTEREST_TOKEN_EXPIRES_AT = new Date(NOW_MS + 30 * 86400_000).toISOString();
    try {
      const token = await ensureFreshToken({ ...makeArgs(tokenPath), fetchFn: vi.fn() });
      expect(token).toBe('envA');
      const persisted = JSON.parse(fs.readFileSync(tokenPath, 'utf8'));
      expect(persisted.access_token).toBe('envA');
      expect(persisted.refresh_token).toBe('envR');
    } finally {
      delete process.env.PINTEREST_ACCESS_TOKEN;
      delete process.env.PINTEREST_REFRESH_TOKEN;
      delete process.env.PINTEREST_TOKEN_EXPIRES_AT;
    }
  });

  it('first-run bootstrap: defaults expires_at to now+30d when env omits it', async () => {
    process.env.PINTEREST_ACCESS_TOKEN = 'envA';
    process.env.PINTEREST_REFRESH_TOKEN = 'envR';
    try {
      await ensureFreshToken({ ...makeArgs(tokenPath), fetchFn: vi.fn() });
      const persisted = JSON.parse(fs.readFileSync(tokenPath, 'utf8'));
      const expectedMs = NOW_MS + 30 * 86400_000;
      expect(new Date(persisted.expires_at).getTime()).toBe(expectedMs);
    } finally {
      delete process.env.PINTEREST_ACCESS_TOKEN;
      delete process.env.PINTEREST_REFRESH_TOKEN;
    }
  });

  it('first-run bootstrap: throws if env vars are missing AND file is absent', async () => {
    // Make sure no stray env vars from .env.local pollute the test.
    const saved = {
      a: process.env.PINTEREST_ACCESS_TOKEN,
      r: process.env.PINTEREST_REFRESH_TOKEN,
    };
    delete process.env.PINTEREST_ACCESS_TOKEN;
    delete process.env.PINTEREST_REFRESH_TOKEN;
    try {
      await expect(
        ensureFreshToken({ ...makeArgs(tokenPath), fetchFn: vi.fn() }),
      ).rejects.toThrow(/token file not found/i);
    } finally {
      if (saved.a !== undefined) process.env.PINTEREST_ACCESS_TOKEN = saved.a;
      if (saved.r !== undefined) process.env.PINTEREST_REFRESH_TOKEN = saved.r;
    }
  });
});

describe('loadOrBootstrap env-override', () => {
  let envTmpDir;
  let envTokenPath;
  let snap;

  beforeEach(() => {
    envTmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pin-oauth-'));
    envTokenPath = path.join(envTmpDir, 'token.json');
    snap = {
      PINTEREST_ACCESS_TOKEN: process.env.PINTEREST_ACCESS_TOKEN,
      PINTEREST_TOKEN_EXPIRES_AT: process.env.PINTEREST_TOKEN_EXPIRES_AT,
    };
  });
  afterEach(() => {
    fs.rmSync(envTmpDir, { recursive: true, force: true });
    for (const k of Object.keys(snap)) {
      if (snap[k] === undefined) delete process.env[k];
      else process.env[k] = snap[k];
    }
  });

  it('overrides stored access_token when env differs and is non-empty', async () => {
    // Pre-seed a stored token file with an OLD value.
    fs.writeFileSync(envTokenPath, JSON.stringify({
      access_token: 'old-token',
      refresh_token: 'r',
      expires_at: new Date(Date.now() + 86400_000).toISOString(),
    }));
    // Now env has a NEW value.
    process.env.PINTEREST_ACCESS_TOKEN = 'new-token';

    const got = await ensureFreshToken({
      tokenStorePath: envTokenPath,
      appId: 'x', appSecret: 'y',
    });
    expect(got).toBe('new-token');
    const onDisk = JSON.parse(fs.readFileSync(envTokenPath, 'utf8'));
    expect(onDisk.access_token).toBe('new-token');
    // Refresh token stays.
    expect(onDisk.refresh_token).toBe('r');
  });

  it('keeps stored access_token when env is empty', async () => {
    fs.writeFileSync(envTokenPath, JSON.stringify({
      access_token: 'stored',
      refresh_token: 'r',
      expires_at: new Date(Date.now() + 86400_000).toISOString(),
    }));
    delete process.env.PINTEREST_ACCESS_TOKEN;
    const got = await ensureFreshToken({
      tokenStorePath: envTokenPath,
      appId: 'x', appSecret: 'y',
    });
    expect(got).toBe('stored');
  });

  it('keeps stored access_token when env matches', async () => {
    fs.writeFileSync(envTokenPath, JSON.stringify({
      access_token: 'same',
      refresh_token: 'r',
      expires_at: new Date(Date.now() + 86400_000).toISOString(),
    }));
    process.env.PINTEREST_ACCESS_TOKEN = 'same';
    const got = await ensureFreshToken({
      tokenStorePath: envTokenPath,
      appId: 'x', appSecret: 'y',
    });
    expect(got).toBe('same');
  });
});
