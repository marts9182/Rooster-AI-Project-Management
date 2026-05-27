import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openDb, _resetForTests } from '../db.js';
import {
  recordEvent,
  subscribe,
  _resetSubscribersForTests,
  replayRecent,
} from '../events.js';

let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rooster-events-'));
  process.env.ROOSTER_DB_PATH = path.join(tmpDir, 'dashboard.db');
  _resetForTests();
  _resetSubscribersForTests();
});

afterEach(() => {
  _resetForTests();
  _resetSubscribersForTests();
  fs.rmSync(tmpDir, { recursive: true, force: true });
  delete process.env.ROOSTER_DB_PATH;
});

describe('events.js', () => {
  it('recordEvent writes to the events table', () => {
    recordEvent('kdp:new-book', { slug: 'foo' });
    const row = openDb()
      .prepare('SELECT kind, payload_json FROM events ORDER BY id DESC LIMIT 1')
      .get();
    expect(row.kind).toBe('kdp:new-book');
    expect(JSON.parse(row.payload_json)).toEqual({ slug: 'foo' });
  });

  it('fan-outs to subscribers synchronously', () => {
    const received = [];
    subscribe((evt) => received.push(evt));
    recordEvent('system:worker-heartbeat', { worker: 'kdp' });
    expect(received).toHaveLength(1);
    expect(received[0].kind).toBe('system:worker-heartbeat');
    expect(received[0].payload).toEqual({ worker: 'kdp' });
    expect(typeof received[0].occurred_at).toBe('string');
  });

  it('subscribe returns an unsubscribe thunk that stops delivery', () => {
    const received = [];
    const unsubscribe = subscribe((evt) => received.push(evt));
    recordEvent('a:b', { n: 1 });
    expect(received).toHaveLength(1);
    unsubscribe();
    recordEvent('a:b', { n: 2 });
    expect(received).toHaveLength(1);
  });

  it('replayRecent returns last N events oldest-first', () => {
    for (let i = 0; i < 60; i++) recordEvent('test:e', { i });
    const recent = replayRecent(50);
    expect(recent).toHaveLength(50);
    expect(recent[0].payload.i).toBe(10); // 60 - 50 = 10
    expect(recent[49].payload.i).toBe(59);
  });

  it('a throwing subscriber does not break broadcast to others', () => {
    const received = [];
    subscribe(() => {
      throw new Error('boom');
    });
    subscribe((evt) => received.push(evt));
    recordEvent('x:y', {});
    expect(received).toHaveLength(1);
  });
});
