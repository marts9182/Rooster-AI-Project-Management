/**
 * Tests for the /api/profile GET/PUT routes (Plan B Task 8).
 *
 * - Seeded id=1 row is returned by GET, with pen_names + brand_palette parsed
 *   from their JSON columns and time_zone defaulted to America/Los_Angeles.
 * - PUT updates only writable fields, validates URLs + gmail_address shape,
 *   and round-trips array columns as JSON strings.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { _resetForTests } from '../db.js';
import profileRoutes from '../profile/routes.js';

let tmpDir;
let app;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rooster-profile-'));
  process.env.ROOSTER_DB_PATH = path.join(tmpDir, 'dashboard.db');
  _resetForTests();
  app = express();
  app.use(express.json());
  app.use('/api/profile', profileRoutes);
});

afterEach(() => {
  _resetForTests();
  fs.rmSync(tmpDir, { recursive: true, force: true });
  delete process.env.ROOSTER_DB_PATH;
});

describe('GET /api/profile', () => {
  it('returns the seeded id=1 row with parsed array columns', async () => {
    const res = await request(app).get('/api/profile');
    expect(res.status).toBe(200);
    expect(res.body.profile.id).toBe(1);
    expect(Array.isArray(res.body.profile.pen_names)).toBe(true);
    expect(res.body.profile.pen_names).toEqual([]);
    expect(Array.isArray(res.body.profile.brand_palette)).toBe(true);
    expect(res.body.profile.brand_palette).toEqual([]);
  });

  it('defaults time_zone to America/Los_Angeles when not set', async () => {
    const res = await request(app).get('/api/profile');
    expect(res.status).toBe(200);
    expect(res.body.profile.time_zone).toBe('America/Los_Angeles');
  });
});

describe('PUT /api/profile', () => {
  it('updates only the provided fields and returns the updated row', async () => {
    const res = await request(app)
      .put('/api/profile')
      .send({ display_name: 'Shane' });
    expect(res.status).toBe(200);
    expect(res.body.profile.display_name).toBe('Shane');
    // Other fields untouched.
    expect(res.body.profile.kdp_author_url).toBeNull();
    expect(res.body.profile.etsy_shop_url).toBeNull();
  });

  it('stores pen_names as JSON and returns it as an array', async () => {
    const res = await request(app)
      .put('/api/profile')
      .send({ pen_names: ['Pocket Rooster Press', 'Seven Martin'] });
    expect(res.status).toBe(200);
    expect(res.body.profile.pen_names).toEqual([
      'Pocket Rooster Press',
      'Seven Martin',
    ]);

    // GET round-trips it as an array too.
    const get = await request(app).get('/api/profile');
    expect(get.body.profile.pen_names).toEqual([
      'Pocket Rooster Press',
      'Seven Martin',
    ]);
  });

  it('stores brand_palette as JSON and returns it as an array', async () => {
    const res = await request(app)
      .put('/api/profile')
      .send({ brand_palette: ['#f5efe3', '#1f6f72', '#b08a3c', '#d96a59'] });
    expect(res.status).toBe(200);
    expect(res.body.profile.brand_palette).toEqual([
      '#f5efe3',
      '#1f6f72',
      '#b08a3c',
      '#d96a59',
    ]);
  });

  it('rejects pen_names that are not an array of strings', async () => {
    const res = await request(app)
      .put('/api/profile')
      .send({ pen_names: 'not-an-array' });
    expect(res.status).toBe(400);
  });

  it('rejects brand_palette that is not an array', async () => {
    const res = await request(app)
      .put('/api/profile')
      .send({ brand_palette: 'not-an-array' });
    expect(res.status).toBe(400);
  });

  it('rejects invalid gmail_address format with 400', async () => {
    const res = await request(app)
      .put('/api/profile')
      .send({ gmail_address: 'not-an-email' });
    expect(res.status).toBe(400);
  });

  it('accepts a valid gmail_address', async () => {
    const res = await request(app)
      .put('/api/profile')
      .send({ gmail_address: 'marts9182@gmail.com' });
    expect(res.status).toBe(200);
    expect(res.body.profile.gmail_address).toBe('marts9182@gmail.com');
  });

  it('rejects URLs that do not start with http:// or https://', async () => {
    const res = await request(app)
      .put('/api/profile')
      .send({ kdp_author_url: 'ftp://example.com' });
    expect(res.status).toBe(400);
  });

  it('accepts a valid http(s) URL for kdp_author_url', async () => {
    const res = await request(app)
      .put('/api/profile')
      .send({ kdp_author_url: 'https://amazon.com/author/x' });
    expect(res.status).toBe(200);
    expect(res.body.profile.kdp_author_url).toBe('https://amazon.com/author/x');
  });

  it('accepts an empty string / null to clear a URL field', async () => {
    // First set a value.
    await request(app)
      .put('/api/profile')
      .send({ kdp_author_url: 'https://amazon.com/author/x' });
    // Then clear it with null.
    const cleared = await request(app)
      .put('/api/profile')
      .send({ kdp_author_url: null });
    expect(cleared.status).toBe(200);
    expect(cleared.body.profile.kdp_author_url).toBeNull();
  });

  it('updates time_zone when explicitly provided', async () => {
    const res = await request(app)
      .put('/api/profile')
      .send({ time_zone: 'America/New_York' });
    expect(res.status).toBe(200);
    expect(res.body.profile.time_zone).toBe('America/New_York');
  });

  it('ignores unknown fields silently', async () => {
    const res = await request(app)
      .put('/api/profile')
      .send({ display_name: 'X', evil_field: 'drop tables' });
    expect(res.status).toBe(200);
    expect(res.body.profile.display_name).toBe('X');
    expect(res.body.profile).not.toHaveProperty('evil_field');
  });
});
