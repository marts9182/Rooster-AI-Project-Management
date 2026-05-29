import { describe, it, expect, beforeEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import Database from 'better-sqlite3';
import { createRoadmapRouter } from '../../roadmap/routes.js';

function freshDb() {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = OFF');
  db.exec(`
    CREATE TABLE kdp_books (
      id INTEGER PRIMARY KEY AUTOINCREMENT, slug TEXT UNIQUE NOT NULL,
      title TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'built',
      output_dir TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE etsy_listings (
      id INTEGER PRIMARY KEY AUTOINCREMENT, etsy_listing_id INTEGER UNIQUE NOT NULL,
      title TEXT NOT NULL, status TEXT NOT NULL
    );
    CREATE TABLE publishing_roadmap (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      kind TEXT NOT NULL CHECK(kind IN ('kdp','etsy')),
      slug TEXT NOT NULL,
      title TEXT NOT NULL,
      target_release_date TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('planned','building','built','scheduled','published','skipped')),
      source TEXT NOT NULL CHECK(source IN ('reuse','build')),
      niche TEXT, rationale TEXT, file_lock_date TEXT,
      kdp_book_id INTEGER REFERENCES kdp_books(id),
      etsy_listing_id INTEGER REFERENCES etsy_listings(id),
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(kind, slug, target_release_date)
    );
  `);
  return db;
}

function makeApp(db) {
  const app = express();
  app.use(express.json());
  app.use('/api/roadmap', createRoadmapRouter({ db }));
  return app;
}

const validBody = {
  kind: 'kdp', slug: 'foo', title: 'Foo',
  target_release_date: '2026-08-15',
  status: 'planned', source: 'reuse',
};

describe('roadmap routes', () => {
  /** @type {import('better-sqlite3').Database} */
  let db;
  beforeEach(() => { db = freshDb(); });

  it('POST /api/roadmap creates a row with computed file_lock_date', async () => {
    const resp = await request(makeApp(db)).post('/api/roadmap').send(validBody);
    expect(resp.status).toBe(201);
    expect(resp.body.row.id).toBeGreaterThan(0);
    expect(resp.body.row.file_lock_date).toBe('2026-07-31');
  });

  it('POST /api/roadmap returns 400 on missing required fields', async () => {
    const resp = await request(makeApp(db)).post('/api/roadmap').send({ kind: 'kdp' });
    expect(resp.status).toBe(400);
    expect(resp.body.error).toMatch(/required/i);
  });

  it('POST /api/roadmap returns 409 on UNIQUE collision', async () => {
    const app = makeApp(db);
    await request(app).post('/api/roadmap').send(validBody);
    const resp = await request(app).post('/api/roadmap').send(validBody);
    expect(resp.status).toBe(409);
    expect(resp.body.error).toMatch(/duplicate|unique|already exists/i);
  });

  it('GET /api/roadmap returns all rows', async () => {
    const app = makeApp(db);
    await request(app).post('/api/roadmap').send(validBody);
    await request(app).post('/api/roadmap').send({ ...validBody, slug: 'bar', target_release_date: '2026-09-15' });
    const resp = await request(app).get('/api/roadmap');
    expect(resp.status).toBe(200);
    expect(resp.body.rows.length).toBe(2);
  });

  it('GET /api/roadmap honors ?kind, ?status, ?from, ?to', async () => {
    const app = makeApp(db);
    await request(app).post('/api/roadmap').send(validBody);
    await request(app).post('/api/roadmap').send({ ...validBody, kind: 'etsy', slug: 'bar' });
    const resp = await request(app).get('/api/roadmap?kind=etsy');
    expect(resp.body.rows.map((r) => r.slug)).toEqual(['bar']);
  });

  it('PUT /api/roadmap/:id patches allowed fields', async () => {
    const app = makeApp(db);
    const created = await request(app).post('/api/roadmap').send(validBody);
    const id = created.body.row.id;
    const resp = await request(app).put(`/api/roadmap/${id}`).send({ status: 'building', notes: 'go' });
    expect(resp.status).toBe(200);
    expect(resp.body.row.status).toBe('building');
    expect(resp.body.row.notes).toBe('go');
  });

  it('PUT /api/roadmap/:id 404 for unknown id', async () => {
    const resp = await request(makeApp(db)).put('/api/roadmap/9999').send({ status: 'building' });
    expect(resp.status).toBe(404);
  });

  it('DELETE /api/roadmap/:id removes the row', async () => {
    const app = makeApp(db);
    const created = await request(app).post('/api/roadmap').send(validBody);
    const id = created.body.row.id;
    const resp = await request(app).delete(`/api/roadmap/${id}`);
    expect(resp.status).toBe(204);
    const after = await request(app).get('/api/roadmap');
    expect(after.body.rows.length).toBe(0);
  });
});
