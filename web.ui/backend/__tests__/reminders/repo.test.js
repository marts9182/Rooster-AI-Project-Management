import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import {
  insertReminder,
  listPending,
  listByStatus,
  markFired,
  markFailed,
  dismiss,
  snooze,
  getById,
  countPending,
} from '../../reminders/repo.js';

/** @returns {import('better-sqlite3').Database} */
function makeDb() {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE reminders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      body TEXT,
      due_at TEXT NOT NULL,
      channel TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('pending','fired','dismissed','failed')),
      source_kind TEXT,
      source_id INTEGER,
      payload_json TEXT,
      fired_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX idx_reminders_due ON reminders(status, due_at);
  `);
  return db;
}

describe('reminders/repo', () => {
  /** @type {import('better-sqlite3').Database} */
  let db;
  beforeEach(() => {
    db = makeDb();
  });

  it('insertReminder returns id and persists row', () => {
    const id = insertReminder(db, {
      title: 'Test',
      body: 'Hello',
      due_at: '2026-05-26T12:00:00Z',
      channel: 'both',
      source_kind: 'manual',
    });
    expect(id).toBe(1);
    const row = db.prepare('SELECT * FROM reminders WHERE id = ?').get(id);
    expect(row.title).toBe('Test');
    expect(row.status).toBe('pending');
    expect(row.channel).toBe('both');
  });

  it('listPending returns only pending rows due now or earlier', () => {
    const past = '2020-01-01T00:00:00Z';
    const future = '2099-01-01T00:00:00Z';
    insertReminder(db, { title: 'past-pending', due_at: past, channel: 'toast' });
    insertReminder(db, { title: 'future-pending', due_at: future, channel: 'toast' });
    const firedId = insertReminder(db, { title: 'past-fired', due_at: past, channel: 'toast' });
    markFired(db, firedId);
    const rows = listPending(db, '2026-05-26T12:00:00Z');
    expect(rows.map((r) => r.title)).toEqual(['past-pending']);
  });

  it('markFired sets status and fired_at', () => {
    const id = insertReminder(db, { title: 't', due_at: '2020-01-01T00:00:00Z', channel: 'toast' });
    markFired(db, id);
    const row = getById(db, id);
    expect(row.status).toBe('fired');
    expect(row.fired_at).toMatch(/^\d{4}-\d{2}-\d{2}/);
  });

  it('markFailed sets status to failed', () => {
    const id = insertReminder(db, { title: 't', due_at: '2020-01-01T00:00:00Z', channel: 'toast' });
    markFailed(db, id);
    expect(getById(db, id).status).toBe('failed');
  });

  it('dismiss sets status to dismissed', () => {
    const id = insertReminder(db, { title: 't', due_at: '2099-01-01T00:00:00Z', channel: 'toast' });
    dismiss(db, id);
    expect(getById(db, id).status).toBe('dismissed');
  });

  it('snooze pushes due_at into the future and keeps status pending', () => {
    const id = insertReminder(db, { title: 't', due_at: '2020-01-01T00:00:00Z', channel: 'toast' });
    const newDue = '2030-06-01T10:00:00Z';
    snooze(db, id, newDue);
    const row = getById(db, id);
    expect(row.due_at).toBe(newDue);
    expect(row.status).toBe('pending');
  });

  it('countPending counts rows with status=pending regardless of due_at', () => {
    insertReminder(db, { title: 'a', due_at: '2020-01-01T00:00:00Z', channel: 'toast' });
    insertReminder(db, { title: 'b', due_at: '2099-01-01T00:00:00Z', channel: 'toast' });
    expect(countPending(db)).toBe(2);
  });

  it('listByStatus filters and orders by due_at ASC', () => {
    insertReminder(db, { title: 'b', due_at: '2026-02-01T00:00:00Z', channel: 'toast' });
    insertReminder(db, { title: 'a', due_at: '2026-01-01T00:00:00Z', channel: 'toast' });
    const rows = listByStatus(db, 'pending');
    expect(rows.map((r) => r.title)).toEqual(['a', 'b']);
  });
});
