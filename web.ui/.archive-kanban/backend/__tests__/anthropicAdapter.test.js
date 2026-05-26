import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the Anthropic SDK BEFORE importing AnthropicAdapter.
const mockCreate = vi.fn();
vi.mock('@anthropic-ai/sdk', () => {
  return {
    default: class MockAnthropic {
      constructor(_opts) {
        this.messages = { create: mockCreate };
      }
    },
  };
});

import { AnthropicAdapter } from '../agents/AnthropicAdapter.js';
import { analyzeTask } from '../agents/TaskAnalyzer.js';

const fakeAgent = {
  id: 'agent-techlead-001',
  name: 'Sarah Chen',
  role: 'Tech Lead',
  personality: 'Analytical.',
  skills: ['arch'],
  guardrails: ['always test'],
  systemPrompt: 'You are Sarah.',
  stageActions: {
    analyze: { description: 'analyze', reviewCriteria: [], outputTemplate: '**[Tech Lead]**\nGo' },
    develop: { description: 'develop', reviewCriteria: [], outputTemplate: '**[Tech Lead]**\nGo' },
  },
};

const fakeTask = {
  id: 't1',
  title: 'Add login',
  description: 'Build the login flow.',
  status: 'analyze',
  acceptance_criteria: '1. Email\n2. Password',
};

beforeEach(() => {
  mockCreate.mockReset();
});

describe('AnthropicAdapter', () => {
  it('calls Anthropic with cached system blocks and forces post_comment tool', async () => {
    mockCreate.mockResolvedValue({
      content: [
        {
          type: 'tool_use',
          name: 'post_comment',
          input: { content: 'My take', approved: true, reason: '', to_agent_id: '' },
        },
      ],
      usage: { input_tokens: 100, output_tokens: 50, cache_read_input_tokens: 0, cache_creation_input_tokens: 100 },
    });

    const adapter = new AnthropicAdapter({ apiKey: 'sk-test', model: 'claude-haiku-4-5' });
    const analysis = analyzeTask(fakeTask);
    const result = await adapter.generate({
      systemPrompt: fakeAgent.systemPrompt,
      task: fakeTask,
      action: fakeAgent.stageActions.analyze,
      analysis,
      conversationHistory: [],
      agent: fakeAgent,
    });

    expect(mockCreate).toHaveBeenCalledOnce();
    const args = mockCreate.mock.calls[0][0];

    // System is an array with cache_control: ephemeral
    expect(Array.isArray(args.system)).toBe(true);
    expect(args.system[0].cache_control).toEqual({ type: 'ephemeral' });

    // Tool use is forced
    expect(args.tool_choice).toEqual({ type: 'tool', name: 'post_comment' });
    expect(args.tools[0].name).toBe('post_comment');
    expect(args.max_tokens).toBeLessThanOrEqual(1000);

    // Result mirrors the tool_use payload
    expect(result.content).toContain('My take');
    expect(result.approved).toBe(true);
    expect(result.toAgent).toBeNull();
  });

  it('parses approved=false with a reason', async () => {
    mockCreate.mockResolvedValue({
      content: [
        {
          type: 'tool_use',
          name: 'post_comment',
          input: { content: 'Blocking', approved: false, reason: 'No AC', to_agent_id: '' },
        },
      ],
    });

    const adapter = new AnthropicAdapter({ apiKey: 'sk-test' });
    const analysis = analyzeTask(fakeTask);
    const result = await adapter.generate({
      task: fakeTask,
      action: fakeAgent.stageActions.analyze,
      analysis,
      conversationHistory: [],
      agent: fakeAgent,
    });

    expect(result.approved).toBe(false);
    expect(result.reason).toBe('No AC');
  });

  it('skips LLM and uses template for backlog and accepted stages', async () => {
    const adapter = new AnthropicAdapter({ apiKey: 'sk-test' });
    const analysis = analyzeTask({ ...fakeTask, status: 'backlog' });
    const backlogAction = { description: 'b', reviewCriteria: [], outputTemplate: '**[Manager]**\nHi' };

    const result = await adapter.generate({
      task: { ...fakeTask, status: 'backlog' },
      action: backlogAction,
      analysis,
      conversationHistory: [],
      agent: fakeAgent,
    });

    expect(mockCreate).not.toHaveBeenCalled();
    expect(result.content).toContain('[Manager]');
  });

  it('falls back to template when the SDK throws', async () => {
    mockCreate.mockRejectedValue(new Error('rate_limit'));
    const adapter = new AnthropicAdapter({ apiKey: 'sk-test' });
    const analysis = analyzeTask(fakeTask);
    const result = await adapter.generate({
      task: fakeTask,
      action: fakeAgent.stageActions.analyze,
      analysis,
      conversationHistory: [],
      agent: fakeAgent,
    });
    expect(result.content).toBeTruthy();
    expect(result.approved).toBe(true); // template defaults to approved
  });

  it('only accepts to_agent_id values that exist in the agent directory', async () => {
    mockCreate.mockResolvedValue({
      content: [
        {
          type: 'tool_use',
          name: 'post_comment',
          input: { content: 'X', approved: true, reason: '', to_agent_id: 'agent-bogus-999' },
        },
      ],
    });
    const adapter = new AnthropicAdapter({ apiKey: 'sk-test' });
    const analysis = analyzeTask(fakeTask);
    const result = await adapter.generate({
      task: fakeTask,
      action: fakeAgent.stageActions.analyze,
      analysis,
      conversationHistory: [],
      agent: fakeAgent,
    });
    expect(result.toAgent).toBeNull();
  });
});
