import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BaseAgent } from '../agents/BaseAgent.js';
import bus from '../agents/EventBus.js';

class TestAgent extends BaseAgent {
  id = 'test-agent';
  name = 'Test Agent';
  role = 'Test';
  personality = 'Just a test.';
  skills = [];
  guardrails = [];
  systemPrompt = '';
  thinkingDelayRange = [1, 2]; // effectively zero
  stageActions = {
    develop: { description: 'test', reviewCriteria: [], outputTemplate: 'TEST' },
  };
}

function makeMockPersistence() {
  return {
    saveComment: vi.fn().mockResolvedValue(undefined),
    getTaskComments: vi.fn().mockResolvedValue([]),
    updateAgentStatus: vi.fn().mockResolvedValue(undefined),
  };
}

function captureBusEvents() {
  const events = [];
  const handler = (name) => (data) => events.push({ name, data });
  const names = ['agent:thinking', 'agent:comment', 'agent:idle', 'agent:rejection', 'agent:error'];
  const handlers = names.map((n) => [n, handler(n)]);
  for (const [n, h] of handlers) bus.on(n, h);
  return {
    events,
    cleanup: () => {
      for (const [n, h] of handlers) bus.off(n, h);
    },
  };
}

describe('BaseAgent lifecycle', () => {
  let agent;
  let persistence;
  let cap;

  beforeEach(() => {
    agent = new TestAgent();
    persistence = makeMockPersistence();
    cap = captureBusEvents();
  });

  it('emits thinking → comment → idle in order when engaged', async () => {
    agent.boot(persistence);

    const task = { id: 'task-1', title: 'X', description: 'Y', status: 'develop', acceptance_criteria: '1. a' };
    bus.fire('task:moved', { taskId: 'task-1', fromStage: 'analyze', toStage: 'develop', task });

    // Wait for the async chain to complete
    await new Promise((r) => setTimeout(r, 50));

    const names = cap.events.map((e) => e.name);
    expect(names[0]).toBe('agent:thinking');
    expect(names).toContain('agent:comment');
    expect(names[names.length - 1]).toBe('agent:idle');

    cap.cleanup();
  });

  it('does not engage on stages outside its stageActions', async () => {
    agent.boot(persistence);

    bus.fire('task:moved', {
      taskId: 'task-1',
      fromStage: 'analyze',
      toStage: 'testing',
      task: { id: 'task-1', title: 'X', description: 'Y', status: 'testing' },
    });

    await new Promise((r) => setTimeout(r, 50));

    expect(cap.events).toEqual([]);
    expect(persistence.saveComment).not.toHaveBeenCalled();

    cap.cleanup();
  });

  it('emits agent:error and agent:idle when generateResponse throws', async () => {
    agent.generateResponse = vi.fn().mockRejectedValue(new Error('boom'));
    agent.boot(persistence);

    const task = { id: 'task-2', title: 'X', description: 'Y', status: 'develop' };
    bus.fire('task:moved', { taskId: 'task-2', fromStage: 'analyze', toStage: 'develop', task });

    await new Promise((r) => setTimeout(r, 50));

    const names = cap.events.map((e) => e.name);
    expect(names).toContain('agent:error');
    expect(names[names.length - 1]).toBe('agent:idle');

    cap.cleanup();
  });

  it('persists the generated comment via persistence.saveComment', async () => {
    agent.boot(persistence);

    const task = { id: 'task-3', title: 'X', description: 'Y', status: 'develop', acceptance_criteria: '1. a' };
    bus.fire('task:moved', { taskId: 'task-3', fromStage: 'analyze', toStage: 'develop', task });

    await new Promise((r) => setTimeout(r, 50));

    expect(persistence.saveComment).toHaveBeenCalledOnce();
    const comment = persistence.saveComment.mock.calls[0][0];
    expect(comment.from_agent).toBe('test-agent');
    expect(comment.task_id).toBe('task-3');
    expect(comment.content).toBeTruthy();

    cap.cleanup();
  });
});
