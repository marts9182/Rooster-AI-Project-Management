/**
 * BaseAgent — live autonomous agent that subscribes to task events,
 * decides whether to engage, and posts comments asynchronously.
 *
 * Each subclass defines its identity, stage actions, and personality.
 * Override generateResponse() to plug in an LLM.
 */

import crypto from 'crypto';
import bus from './EventBus.js';
import { analyzeTask } from './TaskAnalyzer.js';
import { defaultAdapter } from './LLMAdapter.js';

export class BaseAgent {
  /** @abstract */ id;
  /** @abstract */ name;
  /** @abstract */ role;
  /** @abstract */ personality;
  /** @abstract */ skills;
  /** @abstract */ stageActions;
  /** @abstract */ guardrails;
  /** @abstract */ systemPrompt;

  /** How many ms this agent pauses to "think" (randomised). */
  thinkingDelayRange = [1500, 4000]; // [min, max] ms

  /** Current status. */
  status = 'idle'; // 'idle' | 'thinking' | 'responding'

  /** Reference to the shared data persistence layer (injected by runtime). */
  _persistence = null;

  /** LLM adapter — swap for OpenAI/Anthropic by calling setLLMAdapter(). */
  _llmAdapter = defaultAdapter;

  // ── lifecycle ───────────────────────────────────────────────────────────

  /** Called once by AgentRuntime to wire this agent into the event bus. */
  boot(persistence) {
    this._persistence = persistence;
    bus.on('task:moved', (event) => this._onTaskMoved(event));
    this.status = 'idle';
    console.log(`  🤖 ${this.name} (${this.role}) is online`);
  }

  // ── event handling ──────────────────────────────────────────────────────

  async _onTaskMoved({ taskId, toStage, task }) {
    if (!this.shouldEngage(toStage)) return;

    // 1. Signal that we're thinking
    this.status = 'thinking';
    bus.fire('agent:thinking', {
      agentId: this.id,
      agentName: this.name,
      role: this.role,
      taskId,
    });

    // 2. Simulate thinking time (personality-appropriate delay)
    const [min, max] = this.thinkingDelayRange;
    const delay = min + Math.random() * (max - min);
    await new Promise((r) => setTimeout(r, delay));

    // 3. Load conversation history for this task
    const conversationHistory = this._persistence
      ? this._persistence.getTaskComments(taskId)
      : [];

    // 4. Generate the response (may include approval decision)
    this.status = 'responding';
    const action = this.stageActions[toStage];
    const result = this.generateResponse(task, action, conversationHistory);

    // Normalize: generateResponse can return a string or { content, approved, reason, toAgent }
    const { content, approved, reason, toAgent } = typeof result === 'string'
      ? { content: result, approved: true, reason: null, toAgent: null }
      : result;

    const comment = {
      id: `msg-${crypto.randomUUID().slice(0, 8)}`,
      from_agent: this.id,
      to_agent: toAgent || null,
      content,
      task_id: taskId,
      timestamp: new Date().toISOString(),
      approval: { approved, reason: reason || null },
    };

    // 4. Persist the comment
    if (this._persistence) {
      this._persistence.saveComment(comment);
    }

    // 5. Broadcast that we commented (include approval info)
    bus.fire('agent:comment', {
      agentId: this.id,
      agentName: this.name,
      role: this.role,
      taskId,
      comment,
      approved,
      reason,
    });

    // 5b. If agent rejected, fire a specific event
    if (!approved) {
      bus.fire('agent:rejection', {
        agentId: this.id,
        agentName: this.name,
        role: this.role,
        taskId,
        reason,
      });
    }

    // 6. Done
    this.status = 'idle';
    bus.fire('agent:idle', { agentId: this.id });
  }

  // ── agent logic ─────────────────────────────────────────────────────────

  shouldEngage(stage) {
    return stage in (this.stageActions || {});
  }

  /** Set a custom LLM adapter (e.g., OpenAI, Anthropic). */
  setLLMAdapter(adapter) {
    this._llmAdapter = adapter;
  }

  /**
   * Generate a context-aware response using TaskAnalyzer + LLM adapter.
   * Override this method or swap the adapter for full LLM integration.
   */
  generateResponse(task, action, conversationHistory = []) {
    const analysis = analyzeTask(task);

    return this._llmAdapter.generate({
      systemPrompt: this.systemPrompt,
      task,
      action,
      analysis,
      conversationHistory,
      agent: this,
    });
  }

  _fillTemplate(template, task) {
    return template
      .replace(/\{taskTitle\}/g, task.title || 'Untitled')
      .replace(/\{taskDescription\}/g, task.description || '')
      .replace(/\{taskStatus\}/g, task.status || '')
      .replace(/\{agentName\}/g, this.name)
      .replace(/\{agentRole\}/g, this.role)
      .replace(/\{acceptanceCriteria\}/g, task.acceptance_criteria || 'Not specified');
  }

  /** Serialise to a JSON-friendly object (for /api/agents). */
  toJSON() {
    return {
      id: this.id,
      name: this.name,
      role: this.role,
      personality: this.personality,
      skills: this.skills,
      status: this.status,
    };
  }
}
