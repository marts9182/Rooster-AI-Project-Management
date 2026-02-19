/**
 * AgentRuntime — boots all agents, wires them to the EventBus,
 * and provides the persistence layer for saving comments.
 *
 * This is the single entry-point the server imports.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import bus from './EventBus.js';
import { getActiveRoles } from './workflowRules.js';

import marcusThompson from './MarcusThompson.js';
import sarahChen from './SarahChen.js';
import alexRivera from './AlexRivera.js';
import jamiePark from './JamiePark.js';
import taylorJohnson from './TaylorJohnson.js';
import morganDavis from './MorganDavis.js';
import jordanLee from './JordanLee.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.resolve(__dirname, '../../../data');

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

// ── Persistence layer ─────────────────────────────────────────────────────

function readJson(filename) {
  try {
    return JSON.parse(fs.readFileSync(path.join(DATA_DIR, filename), 'utf-8'));
  } catch {
    return [];
  }
}

function writeJson(filename, data) {
  fs.writeFileSync(path.join(DATA_DIR, filename), JSON.stringify(data, null, 2), 'utf-8');
}

const persistence = {
  saveComment(comment) {
    const messages = readJson('messages.json');
    messages.push(comment);
    writeJson('messages.json', messages);
  },

  updateAgentStatus(agentId, status) {
    const agents = readJson('agents.json');
    const agent = agents.find((a) => a.id === agentId);
    if (agent) {
      agent.status = status;
      writeJson('agents.json', agents);
    }
  },
};

// ── Runtime ───────────────────────────────────────────────────────────────

class AgentRuntime {
  agents = ALL_AGENTS;
  agentsByRole = AGENTS_BY_ROLE;
  agentsById = AGENTS_BY_ID;
  bus = bus;

  /** Boot every agent — call once at server startup. */
  start() {
    console.log('\n🚀 Agent Runtime starting…');

    // Update agents.json with fresh status
    const agentRecords = ALL_AGENTS.map((a) => ({
      id: a.id,
      name: a.name,
      role: a.role,
      personality: a.personality,
      skills: a.skills,
      status: 'idle',
      current_task: null,
    }));
    writeJson('agents.json', agentRecords);

    // Boot each agent
    for (const agent of ALL_AGENTS) {
      agent.boot(persistence);
    }

    // Sync agent status to agents.json on state changes
    bus.on('agent:thinking', ({ agentId, taskId }) => {
      const agents = readJson('agents.json');
      const rec = agents.find((a) => a.id === agentId);
      if (rec) {
        rec.status = 'thinking';
        rec.current_task = taskId;
        writeJson('agents.json', agents);
      }
    });

    bus.on('agent:idle', ({ agentId }) => {
      const agents = readJson('agents.json');
      const rec = agents.find((a) => a.id === agentId);
      if (rec) {
        rec.status = 'idle';
        rec.current_task = null;
        writeJson('agents.json', agents);
      }
    });

    console.log(`✅ ${ALL_AGENTS.length} agents online\n`);
  }

  /**
   * Fire a task:moved event. The agents will pick it up asynchronously.
   * This is called by the server's POST /api/tasks/:id/move endpoint.
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
}

const runtime = new AgentRuntime();
export default runtime;
export { bus, ALL_AGENTS, AGENTS_BY_ROLE, AGENTS_BY_ID };
