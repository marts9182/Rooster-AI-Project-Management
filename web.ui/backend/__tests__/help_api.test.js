import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { _resetForTests } from '../db.js';
import { app } from '../server.js';

let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rooster-help-'));
  process.env.ROOSTER_DB_PATH = path.join(tmpDir, 'dashboard.db');
  process.env.PORT = '0';
  _resetForTests();
});

afterEach(() => {
  _resetForTests();
  fs.rmSync(tmpDir, { recursive: true, force: true });
  delete process.env.ROOSTER_DB_PATH;
});

describe('/api/help/:field', () => {
  it('serves an existing markdown file', async () => {
    const res = await request(app).get('/api/help/gmail_app_password');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/markdown/);
    expect(res.text).toMatch(/Gmail App Password/);
  });

  it('404s for unknown fields', async () => {
    const res = await request(app).get('/api/help/does_not_exist');
    expect(res.status).toBe(404);
  });

  it('rejects path-traversal attempts', async () => {
    const res = await request(app).get('/api/help/..%2F..%2Fpackage');
    expect([400, 404]).toContain(res.status);
  });
});
