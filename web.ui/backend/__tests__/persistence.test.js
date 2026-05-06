import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

// Set the data dir override BEFORE importing persistence.
const tmp = path.join(os.tmpdir(), `rooster-persistence-test-${Date.now()}`);
fs.mkdirSync(tmp, { recursive: true });
process.env.ROOSTER_DATA_DIR = tmp;

const { persistence, saveComment, flushAllWrites, readJson } = await import('../persistence.js');

beforeAll(() => {
  fs.writeFileSync(path.join(tmp, 'messages.json'), '[]', 'utf-8');
  fs.writeFileSync(
    path.join(tmp, 'agents.json'),
    JSON.stringify([{ id: 'a1', status: 'idle', current_task: null }]),
    'utf-8',
  );
});

afterAll(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe('persistence write queue', () => {
  it('preserves all comments when 50 saveComment calls fire concurrently', async () => {
    const promises = [];
    for (let i = 0; i < 50; i++) {
      promises.push(
        saveComment({
          id: `msg-${i}`,
          from_agent: 'agent-x',
          to_agent: null,
          content: `comment ${i}`,
          task_id: 't1',
          timestamp: new Date().toISOString(),
        }),
      );
    }
    await Promise.all(promises);
    await flushAllWrites();

    const stored = readJson('messages.json');
    expect(stored).toHaveLength(50);
    const ids = stored.map((m) => m.id).sort();
    const expected = Array.from({ length: 50 }, (_, i) => `msg-${i}`).sort();
    expect(ids).toEqual(expected);
  });

  it('updateAgentStatus serializes thinking → idle round-trips', async () => {
    const ops = [];
    for (let i = 0; i < 20; i++) {
      ops.push(persistence.updateAgentStatus('a1', 'thinking', `t-${i}`));
      ops.push(persistence.updateAgentStatus('a1', 'idle', null));
    }
    await Promise.all(ops);
    await flushAllWrites();

    const agents = readJson('agents.json');
    expect(agents[0].id).toBe('a1');
    // Final state should be 'idle' (last write wins, but no write should be lost mid-flight)
    expect(agents[0].status).toBe('idle');
  });
});
