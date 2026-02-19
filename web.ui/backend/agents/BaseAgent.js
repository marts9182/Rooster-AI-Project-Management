/**
 * BaseAgent — live autonomous agent that subscribes to task events,
 * decides whether to engage, and posts comments asynchronously.
 *
 * Each subclass defines its identity, stage actions, and personality.
 * Override generateResponse() to plug in an LLM.
 */

import crypto from 'crypto';
import bus from './EventBus.js';

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

    // 3. Generate the response
    this.status = 'responding';
    const action = this.stageActions[toStage];
    const content = this.generateResponse(task, action);

    const comment = {
      id: `msg-${crypto.randomUUID().slice(0, 8)}`,
      from_agent: this.id,
      to_agent: null,
      content,
      task_id: taskId,
      timestamp: new Date().toISOString(),
    };

    // 4. Persist the comment
    if (this._persistence) {
      this._persistence.saveComment(comment);
    }

    // 5. Broadcast that we commented
    bus.fire('agent:comment', {
      agentId: this.id,
      agentName: this.name,
      role: this.role,
      taskId,
      comment,
    });

    // 6. Done
    this.status = 'idle';
    bus.fire('agent:idle', { agentId: this.id });
  }

  // ── agent logic ─────────────────────────────────────────────────────────

  shouldEngage(stage) {
    return stage in (this.stageActions || {});
  }

  /** Build a response from the template. Override for LLM. */
  generateResponse(task, action) {
    const parts = [];

    if (action.outputTemplate) {
      parts.push(this._fillTemplate(action.outputTemplate, task));
    }

    if (action.reviewCriteria?.length > 0) {
      parts.push('\n**Review checklist:**');
      for (const criterion of action.reviewCriteria) {
        parts.push(`  - ${criterion}`);
      }
    }

    if (this.guardrails?.length > 0) {
      parts.push('\n**Standing rules applied:**');
      for (const rule of this.guardrails) {
        parts.push(`  - ${rule}`);
      }
    }

    return parts.join('\n');
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
