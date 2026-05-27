/**
 * Plan B Task 16 — /files static route.
 *
 * The route serves files from three explicitly-allowed roots:
 *   - <repo-root>/data/cache/previews/**          (any file)
 *   - <repo-root>/projects/kdp-puzzle-press/output/kdp-ready/<slug>/
 *       (only cover.{pdf,png,jpg} or interior.pdf)
 *   - <repo-root>/output/pinterest/<slug>/**      (only .png/.jpg/.jpeg)
 *
 * Everything else — path-traversal escapes, non-matching files inside
 * kdp-ready, non-image files inside output/pinterest, files outside all
 * three roots — returns 404.
 *
 * The route resolves the repo root from the module's own location, so it
 * works regardless of process.cwd(). We point it at a tmp dir via the
 * ROOSTER_REPO_ROOT env var (test seam).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import filesRoute from '../files_route.js';

let tmpRoot;
let app;

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'rooster-files-'));
  process.env.ROOSTER_REPO_ROOT = tmpRoot;

  // Seed allow-listed directories with sample files.
  const previewsDir = path.join(tmpRoot, 'data', 'cache', 'previews', 'demo-slug');
  fs.mkdirSync(previewsDir, { recursive: true });
  fs.writeFileSync(path.join(previewsDir, 'page-001.png'), 'PNG-BYTES');

  const kdpReadyDir = path.join(
    tmpRoot,
    'projects',
    'kdp-puzzle-press',
    'output',
    'kdp-ready',
    'demo-book',
  );
  fs.mkdirSync(kdpReadyDir, { recursive: true });
  fs.writeFileSync(path.join(kdpReadyDir, 'cover.pdf'), 'PDF-BYTES');
  fs.writeFileSync(path.join(kdpReadyDir, 'interior.pdf'), 'INTERIOR-BYTES');
  // A file that exists but is NOT in the allow-list (e.g. metadata.json).
  fs.writeFileSync(path.join(kdpReadyDir, 'metadata.json'), '{}');

  // Plan E Task 17 — pin PNGs under output/pinterest/<slug>/.
  const pinterestDir = path.join(
    tmpRoot,
    'output',
    'pinterest',
    'demo-slug',
  );
  fs.mkdirSync(pinterestDir, { recursive: true });
  fs.writeFileSync(path.join(pinterestDir, 'cover_hero-0.png'), 'PIN-BYTES');
  fs.writeFileSync(
    path.join(pinterestDir, 'interior_preview-1.jpg'),
    'PIN-JPG',
  );
  // A non-image file inside the pinterest root that must NOT be served.
  fs.writeFileSync(path.join(pinterestDir, 'caption.txt'), 'caption-data');

  // A file outside all allowed roots that an attacker might try to read.
  fs.writeFileSync(path.join(tmpRoot, 'secret.txt'), 'SHHH');

  // The module reads ROOSTER_REPO_ROOT lazily at request time, so the
  // statically-imported router will see whichever value we just set.
  app = express();
  app.use('/files', filesRoute);
});

afterEach(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
  delete process.env.ROOSTER_REPO_ROOT;
});

/**
 * supertest exposes binary response bodies as Buffer on res.body (not res.text).
 * Resolve to a string regardless of content type so the asserts stay readable.
 * @param {import('supertest').Response} res
 * @returns {string}
 */
function bodyAsString(res) {
  if (Buffer.isBuffer(res.body)) return res.body.toString('utf8');
  if (typeof res.text === 'string' && res.text.length > 0) return res.text;
  return '';
}

describe('GET /files — allow-listed previews', () => {
  it('serves a PNG under data/cache/previews/', async () => {
    const res = await request(app)
      .get('/files/data/cache/previews/demo-slug/page-001.png')
      .buffer(true);
    expect(res.status).toBe(200);
    expect(bodyAsString(res)).toBe('PNG-BYTES');
    expect(res.headers['content-type']).toMatch(/png/);
  });

  it('404s on a missing file inside the allowed previews root', async () => {
    const res = await request(app).get(
      '/files/data/cache/previews/demo-slug/missing.png',
    );
    expect(res.status).toBe(404);
  });
});

describe('GET /files — allow-listed kdp-ready files', () => {
  it('serves cover.pdf', async () => {
    const res = await request(app)
      .get('/files/projects/kdp-puzzle-press/output/kdp-ready/demo-book/cover.pdf')
      .buffer(true);
    expect(res.status).toBe(200);
    expect(bodyAsString(res)).toBe('PDF-BYTES');
    expect(res.headers['content-type']).toMatch(/pdf/);
  });

  it('serves interior.pdf', async () => {
    const res = await request(app)
      .get('/files/projects/kdp-puzzle-press/output/kdp-ready/demo-book/interior.pdf')
      .buffer(true);
    expect(res.status).toBe(200);
    expect(bodyAsString(res)).toBe('INTERIOR-BYTES');
  });

  it('blocks metadata.json (not in allow-list)', async () => {
    const res = await request(app).get(
      '/files/projects/kdp-puzzle-press/output/kdp-ready/demo-book/metadata.json',
    );
    expect(res.status).toBe(404);
  });
});

describe('GET /files — allow-listed pinterest pins (Plan E Task 17)', () => {
  it('serves a PNG under output/pinterest/<slug>/', async () => {
    const res = await request(app)
      .get('/files/output/pinterest/demo-slug/cover_hero-0.png')
      .buffer(true);
    expect(res.status).toBe(200);
    expect(bodyAsString(res)).toBe('PIN-BYTES');
    expect(res.headers['content-type']).toMatch(/png/);
  });

  it('serves a JPG under output/pinterest/<slug>/', async () => {
    const res = await request(app)
      .get('/files/output/pinterest/demo-slug/interior_preview-1.jpg')
      .buffer(true);
    expect(res.status).toBe(200);
    expect(bodyAsString(res)).toBe('PIN-JPG');
  });

  it('blocks non-image files inside the pinterest root', async () => {
    const res = await request(app).get(
      '/files/output/pinterest/demo-slug/caption.txt',
    );
    expect(res.status).toBe(404);
    expect(res.text).not.toContain('caption-data');
  });

  it('404s on a missing pin PNG', async () => {
    const res = await request(app).get(
      '/files/output/pinterest/demo-slug/cover_hero-99.png',
    );
    expect(res.status).toBe(404);
  });
});

describe('GET /files — security', () => {
  it('blocks path-traversal attempts (/../) with 404', async () => {
    const res = await request(app).get(
      '/files/data/cache/previews/../../../secret.txt',
    );
    expect(res.status).toBe(404);
    // Never leak the file body even if the file exists.
    expect(res.text).not.toContain('SHHH');
  });

  it('blocks URL-encoded path traversal with 404', async () => {
    const res = await request(app).get(
      '/files/data/cache/previews/..%2F..%2F..%2Fsecret.txt',
    );
    expect(res.status).toBe(404);
    expect(res.text).not.toContain('SHHH');
  });

  it('blocks files outside both allow-listed roots with 404', async () => {
    const res = await request(app).get('/files/secret.txt');
    expect(res.status).toBe(404);
    expect(res.text).not.toContain('SHHH');
  });

  it('returns the canonical error code on rejected requests', async () => {
    const res = await request(app).get('/files/secret.txt');
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('forbidden_or_not_found');
  });
});
