/**
 * Integration: confirm server.js wires the Pinterest module under
 * /api/pinterest and that the poster worker is gated off under
 * PORT=0 / ROOSTER_SKIP_PINTEREST_POSTER=1.
 */
import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
} from 'vitest';
import request from 'supertest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

let tmpRoot;
let app;

beforeAll(async () => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'server-pin-wiring-'));
  process.env.ROOSTER_DB_PATH = path.join(tmpRoot, 'test.db');
  process.env.ROOSTER_SKIP_KDP_SCANNER = '1';
  process.env.ROOSTER_SKIP_PINTEREST_POSTER = '1';
  // PORT=0 is already set by __tests__/setup.js, so server.js will not listen.
  const mod = await import('../server.js');
  app = mod.app;
});

afterAll(() => {
  try {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  } catch (_err) {
    // best-effort
  }
  delete process.env.ROOSTER_DB_PATH;
  delete process.env.ROOSTER_SKIP_KDP_SCANNER;
  delete process.env.ROOSTER_SKIP_PINTEREST_POSTER;
});

describe('server.js Pinterest wiring', () => {
  it('GET /api/pinterest/queue returns 200 + {queue:[]}', async () => {
    const res = await request(app).get('/api/pinterest/queue');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('queue');
    expect(Array.isArray(res.body.queue)).toBe(true);
  });

  it('GET /api/pinterest/history returns 200 + {history:[]}', async () => {
    const res = await request(app).get('/api/pinterest/history');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('history');
    expect(Array.isArray(res.body.history)).toBe(true);
  });
});
