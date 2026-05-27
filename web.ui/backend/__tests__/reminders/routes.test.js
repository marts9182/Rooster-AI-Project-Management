import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import Database from 'better-sqlite3';
import { mountReminderActionRoutes } from '../../reminders/routes.js';
import { insertReminder, getById } from '../../reminders/repo.js';

function freshDb() {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE reminders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL, body TEXT, due_at TEXT NOT NULL,
      channel TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('pending','fired','dismissed','failed')),
      source_kind TEXT, source_id INTEGER, payload_json TEXT,
      fired_at TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
  db.prepare(
    `INSERT INTO reminders (title, due_at, channel, status)
     VALUES ('R1', '2026-06-01T00:00:00Z', 'both', 'pending')`,
  ).run();
  return db;
}

function makeApp(db) {
  const app = express();
  app.use(express.json());
  mountReminderActionRoutes(app, { db });
  return app;
}

describe('POST /api/reminders/:id/dismiss', () => {
  it('marks the reminder dismissed', async () => {
    const db = freshDb();
    const resp = await request(makeApp(db)).post('/api/reminders/1/dismiss');
    expect(resp.status).toBe(200);
    const row = db.prepare('SELECT status FROM reminders WHERE id=1').get();
    expect(row.status).toBe('dismissed');
  });

  it('404s for unknown id', async () => {
    const resp = await request(makeApp(freshDb())).post(
      '/api/reminders/9999/dismiss',
    );
    expect(resp.status).toBe(404);
  });
});

describe('POST /api/reminders/:id/snooze', () => {
  it('shifts due_at by the given hours', async () => {
    const db = freshDb();
    const resp = await request(makeApp(db))
      .post('/api/reminders/1/snooze')
      .send({ hours: 24 });
    expect(resp.status).toBe(200);
    const row = db.prepare('SELECT due_at FROM reminders WHERE id=1').get();
    expect(row.due_at).toBe('2026-06-02T00:00:00.000Z');
  });

  it('400s on missing/invalid hours', async () => {
    const resp = await request(makeApp(freshDb()))
      .post('/api/reminders/1/snooze')
      .send({});
    expect(resp.status).toBe(400);
  });
});

describe('GET /api/reminders', () => {
  it('defaults to status=pending, ordered by due_at ASC', async () => {
    const db = freshDb();
    // wipe the seed row and insert two pendings out of order
    db.prepare('DELETE FROM reminders').run();
    insertReminder(db, {
      title: 'b',
      due_at: '2026-02-01T00:00:00Z',
      channel: 'toast',
    });
    insertReminder(db, {
      title: 'a',
      due_at: '2026-01-01T00:00:00Z',
      channel: 'toast',
    });
    const resp = await request(makeApp(db)).get('/api/reminders');
    expect(resp.status).toBe(200);
    expect(resp.body.reminders.map((r) => r.title)).toEqual(['a', 'b']);
  });

  it('filters by status=fired', async () => {
    const db = freshDb();
    const id = insertReminder(db, {
      title: 'firedOne',
      due_at: '2026-01-01T00:00:00Z',
      channel: 'toast',
    });
    db.prepare(`UPDATE reminders SET status='fired' WHERE id=?`).run(id);
    const resp = await request(makeApp(db)).get('/api/reminders?status=fired');
    expect(resp.status).toBe(200);
    expect(resp.body.reminders).toHaveLength(1);
    expect(resp.body.reminders[0].title).toBe('firedOne');
  });

  it('caps result count by limit', async () => {
    const db = freshDb();
    db.prepare('DELETE FROM reminders').run();
    for (let i = 0; i < 5; i += 1) {
      insertReminder(db, {
        title: `r${i}`,
        due_at: `2026-01-0${i + 1}T00:00:00Z`,
        channel: 'toast',
      });
    }
    const resp = await request(makeApp(db)).get('/api/reminders?limit=2');
    expect(resp.status).toBe(200);
    expect(resp.body.reminders).toHaveLength(2);
  });

  it('400s on bogus status', async () => {
    const resp = await request(makeApp(freshDb())).get(
      '/api/reminders?status=bogus',
    );
    expect(resp.status).toBe(400);
    expect(resp.body.error).toMatch(/status/);
  });

  it('400s on non-positive limit', async () => {
    const resp = await request(makeApp(freshDb())).get(
      '/api/reminders?limit=0',
    );
    expect(resp.status).toBe(400);
  });
});

describe('POST /api/reminders', () => {
  it('creates a manual reminder and returns the row', async () => {
    const db = freshDb();
    const resp = await request(makeApp(db))
      .post('/api/reminders')
      .send({
        title: 'Drink water',
        body: 'Hydrate or diedrate',
        due_at: '2026-06-01T08:00:00Z',
        channel: 'toast',
      });
    expect(resp.status).toBe(201);
    expect(resp.body.reminder).toBeDefined();
    expect(resp.body.reminder.title).toBe('Drink water');
    expect(resp.body.reminder.source_kind).toBe('manual');
    expect(resp.body.reminder.status).toBe('pending');
    // verify persisted
    const row = getById(db, resp.body.reminder.id);
    expect(row.title).toBe('Drink water');
  });

  it('400s when title is missing', async () => {
    const resp = await request(makeApp(freshDb()))
      .post('/api/reminders')
      .send({ due_at: '2026-06-01T08:00:00Z', channel: 'toast' });
    expect(resp.status).toBe(400);
    expect(resp.body.error).toMatch(/title/);
  });

  it('400s when due_at is missing', async () => {
    const resp = await request(makeApp(freshDb()))
      .post('/api/reminders')
      .send({ title: 'x', channel: 'toast' });
    expect(resp.status).toBe(400);
    expect(resp.body.error).toMatch(/due_at/);
  });

  it('400s when channel is missing', async () => {
    const resp = await request(makeApp(freshDb()))
      .post('/api/reminders')
      .send({ title: 'x', due_at: '2026-06-01T08:00:00Z' });
    expect(resp.status).toBe(400);
    expect(resp.body.error).toMatch(/channel/);
  });

  it('400s on invalid channel', async () => {
    const resp = await request(makeApp(freshDb()))
      .post('/api/reminders')
      .send({
        title: 'x',
        due_at: '2026-06-01T08:00:00Z',
        channel: 'pigeon',
      });
    expect(resp.status).toBe(400);
    expect(resp.body.error).toMatch(/channel/);
  });
});
