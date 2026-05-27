import { describe, it, expect, beforeEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ensureFreshToken } from '../../etsy/oauth.js';

const NOW = 1_700_000_000; // seconds

function makeCfg(tokenPath) {
  return {
    keystring: 'kx',
    sharedSecret: 'sx',
    shopId: 1,
    tokenPath,
  };
}

function writeToken(tokenPath, payload) {
  fs.mkdirSync(path.dirname(tokenPath), { recursive: true });
  fs.writeFileSync(tokenPath, JSON.stringify(payload), 'utf8');
}

describe('ensureFreshToken', () => {
  /** @type {string} */
  let dir;
  /** @type {string} */
  let tokenPath;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'etsy-tok-'));
    tokenPath = path.join(dir, 'etsy_token.json');
    vi.spyOn(Date, 'now').mockReturnValue(NOW * 1000);
  });

  it('returns existing token when expires_at > now+60', async () => {
    writeToken(tokenPath, {
      access_token: 'aaa',
      refresh_token: 'rrr',
      expires_at: NOW + 3600,
    });
    const fetchSpy = vi.fn();
    const token = await ensureFreshToken({ cfg: makeCfg(tokenPath), fetchFn: fetchSpy });
    expect(token).toBe('aaa');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('refreshes when expires_at is within 60s', async () => {
    writeToken(tokenPath, {
      access_token: 'old',
      refresh_token: 'rrr',
      expires_at: NOW + 30,
    });
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        access_token: 'new',
        refresh_token: 'rrr2',
        expires_in: 3600,
      }),
    });

    const token = await ensureFreshToken({ cfg: makeCfg(tokenPath), fetchFn: fetchSpy });

    expect(token).toBe('new');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, opts] = fetchSpy.mock.calls[0];
    expect(url).toBe('https://api.etsy.com/v3/public/oauth/token');
    expect(opts.method).toBe('POST');
    expect(opts.body.toString()).toContain('grant_type=refresh_token');
    expect(opts.body.toString()).toContain('client_id=kx');
    expect(opts.body.toString()).toContain('refresh_token=rrr');

    const persisted = JSON.parse(fs.readFileSync(tokenPath, 'utf8'));
    expect(persisted.access_token).toBe('new');
    expect(persisted.refresh_token).toBe('rrr2');
    expect(persisted.expires_at).toBe(NOW + 3600);
  });

  it('preserves old refresh_token if response omits it', async () => {
    writeToken(tokenPath, {
      access_token: 'old',
      refresh_token: 'rrr',
      expires_at: NOW - 5,
    });
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ access_token: 'new2', expires_in: 600 }),
    });

    await ensureFreshToken({ cfg: makeCfg(tokenPath), fetchFn: fetchSpy });

    const persisted = JSON.parse(fs.readFileSync(tokenPath, 'utf8'));
    expect(persisted.refresh_token).toBe('rrr');
    expect(persisted.access_token).toBe('new2');
  });

  it('throws if token file is missing', async () => {
    await expect(
      ensureFreshToken({ cfg: makeCfg(tokenPath), fetchFn: vi.fn() }),
    ).rejects.toThrow(/token file not found/i);
  });

  it('surfaces a clear error on refresh HTTP failure', async () => {
    writeToken(tokenPath, {
      access_token: 'old',
      refresh_token: 'rrr',
      expires_at: NOW - 5,
    });
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => 'invalid_grant',
    });

    await expect(
      ensureFreshToken({ cfg: makeCfg(tokenPath), fetchFn: fetchSpy }),
    ).rejects.toThrow(/refresh failed: 401/);
  });
});
