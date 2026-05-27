import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import Database from 'better-sqlite3';
import { mountReminderActionRoutes } from '../../reminders/routes.js';

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
