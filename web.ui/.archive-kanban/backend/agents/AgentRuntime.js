/**
 * AgentRuntime — boots all agents, wires them to the EventBus, selects
 * the LLM adapter (Anthropic if ANTHROPIC_API_KEY is set, else template),
 * and provides the persistence layer for saving comments.
 */

import bus from './EventBus.js';
import { getActiveRoles } from '../../shared/workflow.mjs';
import { persistence } from '../persistence.js';

import marcusThompson from './MarcusThompson.js';
import sarahChen from './SarahChen.js';
import alexRivera from './AlexRivera.js';
import jamiePark from './JamiePark.js';
import taylorJohnson from './TaylorJohnson.js';
import morganDavis from './MorganDavis.js';
import jordanLee from './JordanLee.js';

// ── All agents ────────────────────────────────────────────────────────────

const ALL_AGENTS = [
  marcusThompson,
  sarahChen,
  alexRivera,
  jamiePark,
  taylorJohnson,
  morganDavis,
  jordanLee,
];

const AGENTS_BY_ROLE = Object.fromEntries(ALL_AGENTS.map((a) => [a.role, a]));
const AGENTS_BY_ID = Object.fromEntries(ALL_AGENTS.map((a) => [a.id, a]));

// ── Runtime ───────────────────────────────────────────────────────────────

class AgentRuntime {
  agents = ALL_AGENTS;
  agentsByRole = AGENTS_BY_ROLE;
  agentsById = AGENTS_BY_ID;
  bus = bus;

  /** Boot every agent — call once at server startup. */
  async start() {
    console.log('\n🚀 Agent Runtime starting…');

    // Reset agents.json with fresh idle status — persistent state across
    // crashes is intentional: thinking-state on disk is stale by definition.
    const agentRecords = ALL_AGENTS.map((a) => ({
      id: a.id,
      name: a.name,
      role: a.role,
      personality: a.personality,
      skills: a.skills,
      status: 'idle',
      current_task: null,
    }));
    await persistence.replaceAgents(agentRecords);

    // Boot each agent
    for (const agent of ALL_AGENTS) {
      agent.boot(persistence);
    }

    // Select LLM adapter based on env
    await this._wireLLMAdapter();

    // Sync agent status to agents.json on state changes (serialized writes)
    bus.on('agent:thinking', ({ agentId, taskId }) => {
      persistence.updateAgentStatus(agentId, 'thinking', taskId).catch(() => {});
    });
    bus.on('agent:idle', ({ agentId }) => {
      persistence.updateAgentStatus(agentId, 'idle', null).catch(() => {});
    });

    console.log(`✅ ${ALL_AGENTS.length} agents online\n`);
  }

  async _wireLLMAdapter() {
    const provider = (process.env.LLM_PROVIDER || 'template').toLowerCase();
    if (provider !== 'anthropic') {
      console.log('🧠 LLM provider: template (set LLM_PROVIDER=anthropic to use Claude)');
      return;
    }
    if (!process.env.ANTHROPIC_API_KEY) {
      console.warn('⚠️  LLM_PROVIDER=anthropic but ANTHROPIC_API_KEY not set — falling back to template');
      return;
    }
    try {
      const { AnthropicAdapter } = await import('./AnthropicAdapter.js');
      const adapter = new AnthropicAdapter({
        apiKey: process.env.ANTHROPIC_API_KEY,
        model: process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5',
      });
      for (const agent of ALL_AGENTS) {
        agent.setLLMAdapter(adapter);
      }
      console.log(`🧠 LLM provider: Anthropic (${adapter.model}) — all 7 agents wired`);
    } catch (err) {
      console.error('Failed to wire AnthropicAdapter — falling back to template:', err.message);
    }
  }

  /**
   * Fire a task:moved event. The agents will pick it up asynchronously.
   * This is called by the server's POST /api/tasks/:id/move endpoint
   * AFTER the synchronous approval gate pass has succeeded.
   */
  onTaskMoved(taskId, fromStage, toStage, task) {
    bus.fire('task:moved', { taskId, fromStage, toStage, task });
  }

  /** Return live status of all agents. */
  getAgentStatuses() {
    return ALL_AGENTS.map((a) => a.toJSON());
  }

  /** Resolve agent ID to display name. */
  resolveAgentName(agentId) {
    const agent = AGENTS_BY_ID[agentId];
    return agent ? `${agent.name} (${agent.role})` : agentId;
  }

  /**
   * Return the agent instances that are *required* to engage on this
   * stage. Used by the synchronous approval gate pass — only required
   * agents (not conditional ones) can block a transition.
   */
  getRequiredAgentsForStage(stage, task) {
    const roles = getActiveRoles(stage, task);
    return roles
      .map((role) => AGENTS_BY_ROLE[role])
      .filter(Boolean);
  }
}

const runtime = new AgentRuntime();
export default runtime;
export { bus, ALL_AGENTS, AGENTS_BY_ROLE, AGENTS_BY_ID };
