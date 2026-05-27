import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

let app, tmpDir;
beforeAll(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rooster-chat-wiring-'));
  process.env.ROOSTER_DB_PATH = path.join(tmpDir, 'dashboard.db');
  process.env.PORT = '0';
  ({ app } = await import('../server.js'));
});
afterAll(() => {
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch (_err) {
    // best-effort (Windows holds the SQLite file handle open)
  }
  delete process.env.ROOSTER_DB_PATH;
});

describe('server.js chat wiring', () => {
  it('GET /api/chat/conversations returns {conversations: []} on a clean db', async () => {
    const r = await request(app).get('/api/chat/conversations');
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ conversations: [] });
  });
});
