/**
 * Plan B Task 9: verify the 6 new help articles are served by the existing
 * /api/help/:field endpoint (already implemented in server.js) and that the
 * pre-existing gmail_app_password article still works (regression).
 *
 * The endpoint returns markdown bytes with `Content-Type: text/markdown`;
 * each assertion below checks the article's signature phrase appears in the
 * body so we know the right file is being read.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { _resetForTests } from '../db.js';
import { app } from '../server.js';

let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rooster-help-articles-'));
  process.env.ROOSTER_DB_PATH = path.join(tmpDir, 'dashboard.db');
  process.env.PORT = '0';
  _resetForTests();
});

afterEach(() => {
  _resetForTests();
  fs.rmSync(tmpDir, { recursive: true, force: true });
  delete process.env.ROOSTER_DB_PATH;
});

/** Each entry: [field, signature phrase that must appear in the markdown]. */
const ARTICLES = [
  ['asin', 'ASIN'],
  ['kdp_author_url', 'Author Central'],
  ['etsy_shop_url', 'Shop Manager'],
  ['pinterest_url', 'pinterest.com'],
  ['bisac_code', 'BISAC'],
  ['release_date', 'release date'],
  ['pinterest_first_login', 'Sign in to Pinterest'],
];

describe('Plan B Task 9 — help articles served by /api/help/:field', () => {
  for (const [field, phrase] of ARTICLES) {
    it(`GET /api/help/${field} returns 200 with markdown containing "${phrase}"`, async () => {
      const res = await request(app).get(`/api/help/${field}`);
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/markdown/);
      expect(res.text.toLowerCase()).toContain(phrase.toLowerCase());
    });
  }

  it('GET /api/help/gmail_app_password still returns 200 (regression)', async () => {
    const res = await request(app).get('/api/help/gmail_app_password');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/markdown/);
    expect(res.text).toMatch(/Gmail App Password/i);
  });
});
