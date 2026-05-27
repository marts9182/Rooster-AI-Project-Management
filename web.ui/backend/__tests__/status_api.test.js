import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { _resetForTests } from '../db.js';
import {
  _resetSubscribersForTests,
  recordEvent,
} from '../events.js';
import {
  _resetWorkerStatus,
  setWorkerHeartbeat,
  setWorkerError,
} from '../workerStatus.js';
import { app } from '../server.js';

let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rooster-status-'));
  process.env.ROOSTER_DB_PATH = path.join(tmpDir, 'dashboard.db');
  process.env.PORT = '0';
  _resetForTests();
  _resetSubscribersForTests();
  _resetWorkerStatus();
});

afterEach(() => {
  _resetForTests();
  _resetSubscribersForTests();
  _resetWorkerStatus();
  fs.rmSync(tmpDir, { recursive: true, force: true });
  delete process.env.ROOSTER_DB_PATH;
});

describe('GET /api/status', () => {
  it('returns workers + tray_color', async () => {
    setWorkerHeartbeat('kdp');
    setWorkerError('etsy', 'OAuth failed');
    const res = await request(app).get('/api/status');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('workers');
    expect(res.body).toHaveProperty('tray_color');
    expect(res.body.workers.kdp.last_success_at).toBeTruthy();
    expect(res.body.workers.etsy.last_error_message).toBe('OAuth failed');
    expect(['green', 'yellow', 'red']).toContain(res.body.tray_color);
  });

  it('returns empty workers + green tray when nothing is registered', async () => {
    const res = await request(app).get('/api/status');
    expect(res.status).toBe(200);
    expect(res.body.workers).toEqual({});
    expect(res.body.tray_color).toBe('green');
  });
});

describe('GET /api/events (SSE)', () => {
  it('sets text/event-stream headers', async () => {
    await new Promise((resolve, reject) => {
      const req = request(app)
        .get('/api/events')
        .buffer(false)
        .parse((r, cb) => {
          // Validate headers, then tear down the long-lived connection.
          try {
            expect(r.headers['content-type']).toMatch(/text\/event-stream/);
            expect(r.headers['cache-control']).toMatch(/no-cache/);
          } catch (e) {
            cb(e, '');
            return;
          }
          r.on('data', () => r.destroy());
          r.on('close', () => cb(null, ''));
        });
      req.end((err) => {
        if (err && err.code !== 'ECONNRESET' && err.code !== 'ERR_STREAM_PREMATURE_CLOSE') {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  });

  it('delivers an event with the channel kind prefix after recordEvent fires', async () => {
    await new Promise((resolve, reject) => {
      const req = request(app)
        .get('/api/events')
        .buffer(false)
        .parse((r, cb) => {
          let buf = '';
          r.on('data', (chunk) => {
            buf += chunk.toString('utf8');
            if (buf.includes('event: test:hello')) {
              try {
                expect(buf).toMatch(/event: test:hello/);
                expect(buf).toMatch(/data: .*"world".*\n\n/);
              } catch (e) {
                cb(e, '');
                return;
              }
              r.destroy();
            }
          });
          r.on('close', () => cb(null, ''));
          r.on('error', () => cb(null, ''));
        });

      // Once we know the route is open, fire the event. Give SSE a moment
      // to flush headers + replay before we publish.
      setTimeout(() => {
        recordEvent('test:hello', { msg: 'world' });
      }, 50);

      req.end((err) => {
        if (err && err.code !== 'ECONNRESET' && err.code !== 'ERR_STREAM_PREMATURE_CLOSE') {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  });
});
