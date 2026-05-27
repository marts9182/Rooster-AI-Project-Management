/**
 * Reminder scheduler — tick() tests.
 *
 * The cron wrapper is exercised via the dep-injected `tick()` to keep the
 * tests deterministic (no real timers, no real node-cron schedule).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import {
  tick,
  startScheduler,
  _resetConsecutiveFailures,
} from '../../reminders/scheduler.js';
import { insertReminder, getById } from '../../reminders/repo.js';

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
    CREATE TABLE events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      kind TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      occurred_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE profile (
      id INTEGER PRIMARY KEY,
      gmail_address TEXT
    );
    INSERT INTO profile (id, gmail_address) VALUES (1, NULL);
  `);
  return db;
}

function makeDeps() {
  const sentToasts = [];
  const sentEmails = [];
  const broadcasts = [];
  return {
    sentToasts,
    sentEmails,
    broadcasts,
    deps: {
      sendToast: vi.fn(async (x) => {
        sentToasts.push(x);
        return { ok: true };
      }),
      sendEmail: vi.fn(async (x) => {
        sentEmails.push(x);
        return { ok: true, messageId: 'm' };
      }),
      recordEvent: vi.fn((kind, payload) => broadcasts.push({ kind, payload })),
      profileFor: () => ({ gmail_address: 'me@gmail.com' }),
    },
  };
}

describe('reminders/scheduler.tick', () => {
  /** @type {import('better-sqlite3').Database} */
  let db;
  beforeEach(() => {
    db = makeDb();
    _resetConsecutiveFailures();
  });

  it('fires a pending toast-only reminder and marks it fired', async () => {
    const id = insertReminder(db, {
      title: 'KDP review check',
      body: 'Sudoku Vol 1',
      due_at: '2020-01-01T00:00:00Z',
      channel: 'toast',
    });
    const { deps, sentToasts, sentEmails, broadcasts } = makeDeps();
    await tick(db, { ...deps, now: () => new Date('2026-05-26T12:00:00Z') });
    expect(sentToasts).toHaveLength(1);
    expect(sentEmails).toHaveLength(0);
    expect(getById(db, id).status).toBe('fired');
    expect(broadcasts.some((b) => b.kind === 'reminder:fired')).toBe(true);
  });

  it('fires email-only reminder against profile.gmail_address', async () => {
    insertReminder(db, {
      title: 'Etsy Day-30',
      body: 'Listing X',
      due_at: '2020-01-01T00:00:00Z',
      channel: 'email',
    });
    const { deps, sentToasts, sentEmails } = makeDeps();
    await tick(db, { ...deps, now: () => new Date('2026-05-26T12:00:00Z') });
    expect(sentToasts).toHaveLength(0);
    expect(sentEmails).toHaveLength(1);
    expect(sentEmails[0].to).toBe('me@gmail.com');
    expect(sentEmails[0].subject).toBe('Etsy Day-30');
  });

  it('fires both channels for channel=both', async () => {
    insertReminder(db, {
      title: 't',
      due_at: '2020-01-01T00:00:00Z',
      channel: 'both',
    });
    const { deps, sentToasts, sentEmails } = makeDeps();
    await tick(db, { ...deps, now: () => new Date('2026-05-26T12:00:00Z') });
    expect(sentToasts).toHaveLength(1);
    expect(sentEmails).toHaveLength(1);
  });

  it('ignores future-dated pending reminders', async () => {
    insertReminder(db, {
      title: 'future',
      due_at: '2099-01-01T00:00:00Z',
      channel: 'toast',
    });
    const { deps, sentToasts } = makeDeps();
    await tick(db, { ...deps, now: () => new Date('2026-05-26T12:00:00Z') });
    expect(sentToasts).toHaveLength(0);
  });

  it('ignores already-fired and dismissed reminders', async () => {
    const firedId = insertReminder(db, {
      title: 'old',
      due_at: '2020-01-01T00:00:00Z',
      channel: 'toast',
    });
    db.prepare(`UPDATE reminders SET status='fired' WHERE id=?`).run(firedId);
    const dismissedId = insertReminder(db, {
      title: 'gone',
      due_at: '2020-01-01T00:00:00Z',
      channel: 'toast',
    });
    db.prepare(`UPDATE reminders SET status='dismissed' WHERE id=?`).run(
      dismissedId,
    );
    const { deps, sentToasts } = makeDeps();
    const result = await tick(db, {
      ...deps,
      now: () => new Date('2026-05-26T12:00:00Z'),
    });
    expect(sentToasts).toHaveLength(0);
    expect(result.fired).toBe(0);
  });

  it('one bad row does not kill the loop; failure is recorded', async () => {
    insertReminder(db, {
      title: 'good',
      due_at: '2020-01-01T00:00:00Z',
      channel: 'toast',
    });
    const badId = insertReminder(db, {
      title: 'bad',
      due_at: '2020-01-01T00:00:00Z',
      channel: 'toast',
    });
    const { deps, broadcasts } = makeDeps();
    // First call to sendToast (good) succeeds; second (bad) throws.
    deps.sendToast = vi
      .fn()
      .mockResolvedValueOnce({ ok: true })
      .mockRejectedValueOnce(new Error('boom'));
    const result = await tick(db, {
      ...deps,
      now: () => new Date('2026-05-26T12:00:00Z'),
    });
    expect(result.fired).toBe(1);
    expect(result.failed).toBe(1);
    expect(getById(db, badId).status).toBe('failed');
    expect(broadcasts.some((b) => b.kind === 'reminder:failed')).toBe(true);
  });

  it('email reminder with no profile.gmail_address fails gracefully', async () => {
    insertReminder(db, {
      title: 'no-mail',
      due_at: '2020-01-01T00:00:00Z',
      channel: 'email',
    });
    const { deps, sentEmails, broadcasts } = makeDeps();
    deps.profileFor = () => ({ gmail_address: null });
    const result = await tick(db, {
      ...deps,
      now: () => new Date('2026-05-26T12:00:00Z'),
    });
    expect(sentEmails).toHaveLength(0);
    expect(result.failed).toBe(1);
    expect(broadcasts.some((b) => b.kind === 'reminder:failed')).toBe(true);
  });

  it('two consecutive ticks with failures emit system:reminder-delivery-degraded', async () => {
    insertReminder(db, {
      title: 'a',
      due_at: '2020-01-01T00:00:00Z',
      channel: 'toast',
    });
    const { deps, broadcasts } = makeDeps();
    deps.sendToast = vi
      .fn()
      .mockRejectedValue(new Error('SnoreToast missing'));
    // First tick — fails. No degraded broadcast yet (single failure).
    await tick(db, { ...deps, now: () => new Date('2026-05-26T12:00:00Z') });
    expect(
      broadcasts.some((b) => b.kind === 'system:reminder-delivery-degraded'),
    ).toBe(false);
    // Insert a second row and run a second tick — also fails → degraded fires.
    insertReminder(db, {
      title: 'b',
      due_at: '2020-01-01T00:00:00Z',
      channel: 'toast',
    });
    await tick(db, { ...deps, now: () => new Date('2026-05-26T12:01:00Z') });
    expect(
      broadcasts.some((b) => b.kind === 'system:reminder-delivery-degraded'),
    ).toBe(true);
  });

  it('a clean tick resets the consecutive-failure streak', async () => {
    insertReminder(db, {
      title: 'a',
      due_at: '2020-01-01T00:00:00Z',
      channel: 'toast',
    });
    const { deps, broadcasts } = makeDeps();
    deps.sendToast = vi
      .fn()
      // tick 1: fails
      .mockRejectedValueOnce(new Error('boom'))
      // tick 3: succeeds (different row)
      .mockResolvedValueOnce({ ok: true })
      // tick 4: fails again (single failure, streak broken by tick 2's clean run)
      .mockRejectedValueOnce(new Error('boom2'));

    // Tick 1 — fails (streak=1)
    await tick(db, { ...deps, now: () => new Date('2026-05-26T12:00:00Z') });
    // Tick 2 — nothing pending (streak resets to 0)
    await tick(db, { ...deps, now: () => new Date('2026-05-26T12:01:00Z') });
    // Tick 3 — new row, succeeds (streak still 0)
    insertReminder(db, {
      title: 'b',
      due_at: '2020-01-01T00:00:00Z',
      channel: 'toast',
    });
    await tick(db, { ...deps, now: () => new Date('2026-05-26T12:02:00Z') });
    // Tick 4 — new row, fails (streak=1, still no degraded broadcast)
    insertReminder(db, {
      title: 'c',
      due_at: '2020-01-01T00:00:00Z',
      channel: 'toast',
    });
    await tick(db, { ...deps, now: () => new Date('2026-05-26T12:03:00Z') });

    expect(
      broadcasts.some((b) => b.kind === 'system:reminder-delivery-degraded'),
    ).toBe(false);
  });

  it('returns {fired, failed} counts', async () => {
    insertReminder(db, {
      title: 'a',
      due_at: '2020-01-01T00:00:00Z',
      channel: 'toast',
    });
    insertReminder(db, {
      title: 'b',
      due_at: '2020-01-01T00:00:00Z',
      channel: 'toast',
    });
    const { deps } = makeDeps();
    const result = await tick(db, {
      ...deps,
      now: () => new Date('2026-05-26T12:00:00Z'),
    });
    expect(result).toEqual({ fired: 2, failed: 0 });
  });
});

describe('reminders/scheduler.startScheduler', () => {
  it('returns a stop function and registers a cron task', () => {
    const db = makeDb();
    const onTick = vi.fn();
    const stop = startScheduler(db, {
      cronExpression: '* * * * *',
      recordEvent: () => {},
      onTick,
    });
    expect(typeof stop).toBe('function');
    stop();
  });

  it('rejects an invalid cron expression', () => {
    const db = makeDb();
    expect(() =>
      startScheduler(db, { cronExpression: 'not-a-cron' }),
    ).toThrow();
  });
});
