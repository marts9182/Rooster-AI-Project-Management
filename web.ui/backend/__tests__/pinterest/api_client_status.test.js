import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PinterestApiClient } from '../../pinterest/api_client.js';

let tmpDir;
let tokenPath;

function writeToken(expiresAt) {
  fs.writeFileSync(
    tokenPath,
    JSON.stringify({ access_token: 'tok', refresh_token: 'r', expires_at: expiresAt }),
    'utf8',
  );
}

function client(fetchFn) {
  return new PinterestApiClient({
    tokenStorePath: tokenPath, appId: 'a', appSecret: 's', fetchFn,
  });
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pin-status-'));
  tokenPath = path.join(tmpDir, 'token.json');
});
afterEach(() => { fs.rmSync(tmpDir, { recursive: true, force: true }); });

describe('getLiveStatus', () => {
  it('reports live_ok + identity when the API returns 200', async () => {
    writeToken(new Date(Date.now() + 3600_000).toISOString());
    const fetchFn = async () =>
      new Response(JSON.stringify({ username: 'pocketrooster', business_name: 'Pocket Rooster Press' }),
        { status: 200 });
    const s = await client(fetchFn).getLiveStatus();
    expect(s.connected).toBe(true);
    expect(s.live_ok).toBe(true);
    expect(s.identity.username).toBe('pocketrooster');
    expect(s.error).toBeNull();
  });

  it('reports live_ok=false + error on a 401', async () => {
    writeToken(new Date(Date.now() + 3600_000).toISOString());
    const fetchFn = async () =>
      new Response(JSON.stringify({ code: 2, message: 'Authentication failed.' }), { status: 401 });
    const s = await client(fetchFn).getLiveStatus();
    expect(s.live_ok).toBe(false);
    expect(s.error).toMatch(/401|Authentication/);
  });

  it('reports live_ok=false without calling the API when no valid token', async () => {
    writeToken(new Date(Date.now() - 1000).toISOString()); // expired
    let called = false;
    const fetchFn = async () => { called = true; return new Response('{}', { status: 200 }); };
    const s = await client(fetchFn).getLiveStatus();
    expect(s.connected).toBe(false);
    expect(s.live_ok).toBe(false);
    expect(called).toBe(false);
  });
});

describe('createBoard', () => {
  it('POSTs /v5/boards with name + privacy and returns the board', async () => {
    writeToken(new Date(Date.now() + 3600_000).toISOString());
    let captured;
    const fetchFn = async (url, init) => {
      captured = { url, method: init.method, body: JSON.parse(init.body) };
      return new Response(JSON.stringify({ id: '999', name: init.body && JSON.parse(init.body).name }),
        { status: 201 });
    };
    const board = await client(fetchFn).createBoard('Large-Print Sudoku');
    expect(captured.method).toBe('POST');
    expect(captured.url).toMatch(/\/v5\/boards$/);
    expect(captured.body.name).toBe('Large-Print Sudoku');
    expect(captured.body.privacy).toBe('PUBLIC');
    expect(board.id).toBe('999');
  });
});
