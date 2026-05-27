import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openDb, _resetForTests } from '../../db.js';
import { mountChatRoutes } from '../routes.js';

let app, tmpDir;
beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rooster-chat-routes-'));
  process.env.ROOSTER_DB_PATH = path.join(tmpDir, 'dashboard.db');
  _resetForTests();
  app = express();
  app.use(express.json());
  mountChatRoutes(app, { db: openDb() });
});
afterEach(() => {
  _resetForTests();
  fs.rmSync(tmpDir, { recursive: true, force: true });
  delete process.env.ROOSTER_DB_PATH;
});

describe('chat REST', () => {
  it('GET /api/chat/conversations returns empty list initially', async () => {
    const r = await request(app).get('/api/chat/conversations');
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ conversations: [] });
  });
  it('POST /api/chat/conversations creates a new conversation', async () => {
    const r = await request(app).post('/api/chat/conversations').send({ title: 'Hi' });
    expect(r.status).toBe(200);
    expect(r.body.conversation.title).toBe('Hi');
  });
  it('GET /api/chat/conversations/:id returns conversation with messages', async () => {
    const c = await request(app).post('/api/chat/conversations').send({});
    const r = await request(app).get(`/api/chat/conversations/${c.body.conversation.id}`);
    expect(r.status).toBe(200);
    expect(r.body.conversation.messages).toEqual([]);
  });
  it('PATCH /api/chat/conversations/:id renames', async () => {
    const c = await request(app).post('/api/chat/conversations').send({});
    const r = await request(app)
      .patch(`/api/chat/conversations/${c.body.conversation.id}`)
      .send({ title: 'Renamed' });
    expect(r.status).toBe(200);
    expect(r.body.conversation.title).toBe('Renamed');
  });
  it('DELETE /api/chat/conversations/:id removes it', async () => {
    const c = await request(app).post('/api/chat/conversations').send({});
    const id = c.body.conversation.id;
    const del = await request(app).delete(`/api/chat/conversations/${id}`);
    expect(del.status).toBe(200);
    const get = await request(app).get(`/api/chat/conversations/${id}`);
    expect(get.status).toBe(404);
  });
});

describe('POST /api/chat/conversations/:id/messages (SSE)', () => {
  it('emits message-started, chunk, tool-call, message-complete', async () => {
    const c = await request(app).post('/api/chat/conversations').send({});
    const id = c.body.conversation.id;

    const app2 = express();
    app2.use(express.json());
    const fakeRun = async ({ onChunk, onToolCall, onComplete }) => {
      onChunk('Hello ');
      onToolCall({ tool: 'Read', id: 't1', args: { file_path: 'x' }, status: 'started' });
      onToolCall({ tool: 'Read', id: 't1', status: 'completed', ms: 5 });
      onChunk('world.');
      onComplete({ aggregatedText: 'Hello world.', toolCalls: [], exitCode: 0 });
      return {
        aggregatedText: 'Hello world.',
        toolCalls: [
          { tool: 'Read', id: 't1', args: { file_path: 'x' }, status: 'started' },
          { tool: 'Read', id: 't1', status: 'completed', ms: 5 },
        ],
        claudeSessionId: 'sid-canonical',
        exitCode: 0,
      };
    };
    mountChatRoutes(app2, { db: openDb(), runTurnFn: fakeRun });

    const r = await request(app2)
      .post(`/api/chat/conversations/${id}/messages`)
      .set('Accept', 'text/event-stream')
      .send({ content: 'hi' });
    expect(r.status).toBe(200);

    const events = r.text
      .split('\n\n')
      .filter((b) => b.startsWith('event:'))
      .map((b) => {
        const [evLine, dataLine] = b.split('\n');
        return {
          event: evLine.slice('event: '.length),
          data: JSON.parse(dataLine.slice('data: '.length)),
        };
      });
    expect(events.map((e) => e.event)).toEqual([
      'message-started', 'chunk', 'tool-call', 'tool-call', 'chunk', 'message-complete',
    ]);
    expect(events[1].data).toEqual({ text: 'Hello ' });
    expect(events[2].data.status).toBe('started');
    expect(events[2].data.tool).toBe('Read');
    expect(events[5].data.tool_call_count).toBe(2);
  });

  it('emits error event when exitCode !== 0', async () => {
    const c = await request(app).post('/api/chat/conversations').send({});
    const id = c.body.conversation.id;
    const app2 = express();
    app2.use(express.json());
    const fakeRun = async ({ onChunk, onError, onComplete }) => {
      onChunk('partial');
      onError(new Error('boom'));
      onComplete({ aggregatedText: 'partial', toolCalls: [], exitCode: 1 });
      return { aggregatedText: 'partial', toolCalls: [], claudeSessionId: 's', exitCode: 1 };
    };
    mountChatRoutes(app2, { db: openDb(), runTurnFn: fakeRun });
    const r = await request(app2)
      .post(`/api/chat/conversations/${id}/messages`)
      .send({ content: 'hi' });
    expect(r.text).toContain('event: error');
    expect(r.text).toContain('subprocess_failed');
  });
});
