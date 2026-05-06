/**
 * AnthropicAdapter — real Claude-powered LLM adapter.
 *
 * Uses the Messages API with tool_use to force a structured response
 * (`post_comment` tool), prompt caching on the agent identity system
 * block, and a hard max_tokens cap as a cost guardrail.
 *
 * Falls back to the SmartTemplateAdapter for `backlog` and `accepted`
 * stages — the LLM doesn't add value there and the template is fine.
 */

import Anthropic from '@anthropic-ai/sdk';
import { BaseLLMAdapter, SmartTemplateAdapter } from './LLMAdapter.js';
import { buildSystemBlocks, buildUserMessage, getValidToAgents } from './promptBuilder.js';

const TEMPLATE_ONLY_STAGES = new Set(['backlog', 'accepted']);

/** @type {import('@anthropic-ai/sdk').Anthropic.Tool} */
const POST_COMMENT_TOOL = {
  name: 'post_comment',
  description:
    'Post a single comment as this agent on the current task. Call this exactly once. ' +
    'Speak in your role\'s voice and reference specific task content. Use approved=false ' +
    'only for serious blockers (missing AC, vague description, unmitigated technical risk).',
  input_schema: {
    type: /** @type {const} */ ('object'),
    properties: {
      content: {
        type: 'string',
        description:
          'The markdown comment body. 2–5 short paragraphs or bullets, well under 400 words. ' +
          'Reference specific task title, description, and acceptance criteria — no generic boilerplate.',
      },
      approved: {
        type: 'boolean',
        description:
          'Whether this stage transition is acceptable to you. true unless there is a serious blocker.',
      },
      reason: {
        type: 'string',
        description:
          'If approved=false, the specific blocker reason. Empty string if approved=true.',
      },
      to_agent_id: {
        type: 'string',
        description:
          'If you want to direct a question to another teammate, set their agent ID exactly. ' +
          'Empty string if no specific recipient.',
      },
    },
    required: ['content', 'approved', 'reason', 'to_agent_id'],
  },
};

export class AnthropicAdapter extends BaseLLMAdapter {
  /**
   * @param {{apiKey: string, model?: string, maxTokens?: number}} opts
   */
  constructor(opts) {
    super();
    const { apiKey, model = 'claude-haiku-4-5', maxTokens = 600 } = opts || {};
    if (!apiKey) throw new Error('AnthropicAdapter requires apiKey');
    this.model = model;
    this.maxTokens = maxTokens;
    this.client = new Anthropic({ apiKey });
    this._template = new SmartTemplateAdapter();
  }

  async generate(params) {
    const { task, agent } = params;

    // Cost guardrail: skip LLM for stages where the template is enough.
    if (TEMPLATE_ONLY_STAGES.has(task.status)) {
      return this._template.generate(params);
    }

    try {
      return await this._generateLLM(params);
    } catch (err) {
      // Always fall back to template on transport/parse failure so the agent
      // still posts SOMETHING. Don't let a Claude outage stall the workflow.
      console.error(`[${agent.name}] Anthropic call failed — using template fallback:`, err.message);
      return this._template.generate(params);
    }
  }

  async _generateLLM({ task, action, analysis, conversationHistory, agent }) {
    const validToAgents = /** @type {Array<{id: string, name: string, role: string}>} */ ([...getValidToAgents()]);

    const systemBlocks = buildSystemBlocks(agent);
    const userMessage = buildUserMessage({
      task,
      analysis,
      conversationHistory,
      stage: task.status,
      validToAgents,
    });

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: this.maxTokens,
      system: systemBlocks,
      messages: [{ role: 'user', content: userMessage }],
      tools: [POST_COMMENT_TOOL],
      tool_choice: { type: 'tool', name: 'post_comment' },
    });

    // Log usage for cost visibility (cache_read_input_tokens > 0 = cache hit).
    if (response.usage) {
      const u = response.usage;
      const cached = u.cache_read_input_tokens || 0;
      const cacheCreated = u.cache_creation_input_tokens || 0;
      console.log(
        `[${agent.name}] tokens: in=${u.input_tokens} out=${u.output_tokens} ` +
        `cache_read=${cached} cache_created=${cacheCreated}`,
      );
    }

    // Find the tool_use block. Forced tool_choice means the model MUST emit one.
    const blocks = response.content || [];
    const toolUse = blocks.find((b) => b.type === 'tool_use' && b.name === 'post_comment');
    if (!toolUse || toolUse.type !== 'tool_use') {
      throw new Error('Model did not return the post_comment tool call');
    }

    const input = /** @type {Record<string, unknown>} */ (toolUse.input || {});

    // Optional: prepend the existing template header so comments still look
    // consistent with the rest of the board's UI. Remove this if you want
    // pure-LLM voice with no preamble.
    let content = String(input.content || '').trim();
    if (action?.outputTemplate) {
      const header = this._extractHeader(action.outputTemplate);
      if (header && !content.startsWith(header.split('\n')[0])) {
        content = `${header}\n\n${content}`;
      }
    }

    const approved = input.approved !== false;
    const rawReason = typeof input.reason === 'string' ? input.reason.trim() : '';
    const reason = !approved && rawReason ? rawReason : null;

    const rawToAgent = typeof input.to_agent_id === 'string' ? input.to_agent_id.trim() : '';
    const toAgent = rawToAgent && validToAgents.some((a) => a.id === rawToAgent) ? rawToAgent : null;

    return { content, approved, reason, toAgent };
  }

  /** Extract the bracketed header line, e.g. "**[Tech Lead — Technical Analysis]**". */
  _extractHeader(template) {
    const firstLine = template.split('\n')[0]?.trim();
    if (firstLine && firstLine.startsWith('**[')) return firstLine;
    return null;
  }
}
