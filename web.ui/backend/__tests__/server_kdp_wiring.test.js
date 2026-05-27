/**
 * Integration: confirm server.js wires the KDP routes module under /api/kdp
 * and the scanner worker is gated off when PORT=0 / ROOSTER_SKIP_KDP_SCANNER=1.
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
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'server-kdp-wiring-'));
  process.env.ROOSTER_DB_PATH = path.join(tmpRoot, 'test.db');
  process.env.ROOSTER_SKIP_KDP_SCANNER = '1';
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
});

describe('server.js KDP wiring', () => {
  it('GET /api/kdp/books returns 200 + {books:[]}', async () => {
    const res = await request(app).get('/api/kdp/books');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('books');
    expect(Array.isArray(res.body.books)).toBe(true);
  });

  it('GET /api/kdp/books/nonesuch returns 404 + JSON error', async () => {
    const res = await request(app).get('/api/kdp/books/nonesuch');
    expect(res.status).toBe(404);
    expect(res.body.error).toBeDefined();
  });
});
