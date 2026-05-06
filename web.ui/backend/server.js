/**
 * Express server — serves the React build, provides JSON CRUD API,
 * boots the AgentRuntime, and pushes live agent events via SSE.
 */

// Load .env first so AgentRuntime can read ANTHROPIC_API_KEY at boot.
import 'dotenv/config';

import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { runtime, bus, marcus, analyzeTask } from './agents/index.js';
import {
  validateTransition,
  ALLOWED_STATUSES,
} from '../shared/workflow.mjs';
import { persistence, readJson, writeJson, DATA_DIR } from './persistence.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DIST_DIR = path.resolve(__dirname, '../frontend-react/dist');
const PORT = Number(process.env.PORT) || 5000;
const SSE_HEARTBEAT_MS = 20_000;

const app = express();
app.use(express.json());

// ── SSE — live agent event stream ────────────────────────────────────────

const sseClients = new Set();

app.get('/api/events', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no', // disable proxy buffering (e.g. nginx)
  });
  res.write(':\n\n'); // comment to flush headers

  // Per-connection heartbeat — keeps proxies / browsers from silently
  // dropping the connection mid-thinking, which would strand the UI's
  // "thinking…" indicator.
  const heartbeat = setInterval(() => {
    try {
      res.write(': ping\n\n');
    } catch {
      /* will be cleaned up by close handler */
    }
  }, SSE_HEARTBEAT_MS);

  sseClients.add(res);
  req.on('close', () => {
    clearInterval(heartbeat);
    sseClients.delete(res);
  });
});

/** Push an SSE event to every connected client. */
function broadcast(event, data) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of sseClients) {
    client.write(payload);
  }
}

// Relay bus events to SSE
bus.on('agent:thinking', (data) => broadcast('agent:thinking', data));
bus.on('agent:comment', (data) => broadcast('agent:comment', data));
bus.on('agent:idle', (data) => broadcast('agent:idle', data));
bus.on('agent:rejection', (data) => broadcast('agent:rejection', data));
bus.on('agent:error', (data) => broadcast('agent:error', data));

// ── API routes ───────────────────────────────────────────────────────────

app.get('/api/sprints', (_req, res) => {
  res.json(readJson('sprints.json'));
});

app.get('/api/projects', (_req, res) => {
  res.json(readJson('projects.json'));
});

app.get('/api/tasks', (_req, res) => {
  res.json(readJson('tasks.json'));
});

app.get('/api/agents', (_req, res) => {
  res.json(runtime.getAgentStatuses());
});

app.get('/api/tasks/:id/comments', (req, res) => {
  const messages = readJson('messages.json');
  const taskComments = messages.filter((m) => String(m.task_id) === String(req.params.id));
  res.json(taskComments);
});

app.get('/api/tasks/:id/approvals', (req, res) => {
  const messages = readJson('messages.json');
  const taskComments = messages.filter((m) => String(m.task_id) === String(req.params.id) && m.approval);
  const approvals = taskComments.map((m) => ({
    agent_id: m.from_agent,
    agent_name: runtime.resolveAgentName(m.from_agent),
    approved: m.approval.approved,
    reason: m.approval.reason,
    timestamp: m.timestamp,
  }));
  const hasRejection = approvals.some((a) => !a.approved);
  res.json({ taskId: req.params.id, approvals, allApproved: !hasRejection });
});

app.post('/api/tasks/:id/move', async (req, res) => {
  const { status, force } = req.body || {};
  if (!status) return res.status(400).json({ error: 'Missing status in request body' });
  if (!ALLOWED_STATUSES.includes(status)) {
    return res.status(400).json({ error: `Invalid status: ${status}` });
  }

  const tasks = readJson('tasks.json');
  const task = tasks.find((t) => String(t.id) === String(req.params.id));
  if (!task) return res.status(404).json({ error: `Task ${req.params.id} not found` });

  // Validate transition (no stage-skipping)
  const violation = validateTransition(task.status, status);
  if (violation) return res.status(400).json({ error: violation });

  // ── Synchronous approval gate pass ─────────────────────────────────────
  // Required agents for the destination stage get a chance to block the
  // move BEFORE the task status is mutated. This makes rejections actually
  // mean something instead of being decorative async events.
  if (!force) {
    const analysis = analyzeTask(task);
    const required = runtime.getRequiredAgentsForStage(status, task);
    const blockers = [];
    for (const agent of required) {
      const verdict = agent.evaluateApproval?.(task, analysis);
      if (verdict && verdict.approved === false) {
        blockers.push({
          agent_id: agent.id,
          agent_name: `${agent.name} (${agent.role})`,
          reason: verdict.reason,
        });
      }
    }
    if (blockers.length > 0) {
      return res.status(409).json({
        error: `Move blocked by ${blockers.length} agent${blockers.length > 1 ? 's' : ''}.`,
        blockers,
        canForce: true, // UI may offer an override
      });
    }
  }

  const fromStage = task.status;
  task.status = status;
  task.updated_at = new Date().toISOString();
  writeJson('tasks.json', tasks);

  // Auto-complete sprint when last task is accepted
  if (status === 'accepted' && task.sprint_id) {
    const sprintTasks = tasks.filter((t) => t.sprint_id === task.sprint_id);
    const allAccepted = sprintTasks.every((t) => t.status === 'accepted');
    if (allAccepted) {
      const sprints = readJson('sprints.json');
      const sprint = sprints.find((s) => s.id === task.sprint_id);
      if (sprint && sprint.status !== 'completed') {
        sprint.status = 'completed';
        writeJson('sprints.json', sprints);
        broadcast('sprint:completed', { sprintId: sprint.id });
      }
    }
  }

  // 🔥 Fire the event — agents will pick it up asynchronously
  runtime.onTaskMoved(task.id, fromStage, status, task);

  // Broadcast task move to frontend
  broadcast('task:moved', { taskId: task.id, fromStage, toStage: status });

  res.json({ success: true });
});

// ── Sprint Retrospective ─────────────────────────────────────────────────

app.post('/api/sprints/:id/retro', async (req, res) => {
  const sprints = readJson('sprints.json');
  const sprint = sprints.find((s) => s.id === req.params.id);
  if (!sprint) return res.status(404).json({ error: 'Sprint not found' });

  const tasks = readJson('tasks.json').filter((t) => t.sprint_id === sprint.id);
  const allMessages = readJson('messages.json');
  const taskIds = new Set(tasks.map((t) => t.id));
  const sprintMessages = allMessages.filter((m) => taskIds.has(m.task_id));

  const { content, analytics, review } = marcus.generateRetro(sprint, tasks, sprintMessages);

  // Update sprint retrospective field via serialized write.
  await persistence.enqueueWrite('sprints.json', (current) => {
    const next = Array.isArray(current) ? current : [];
    const target = next.find((s) => s.id === sprint.id);
    if (target) {
      target.retrospective = content;
      if (!target.review || target.review.trim() === '') {
        target.review = review || '';
      }
    }
    return { next, result: target };
  });

  // Append the retro audit message via serialized write.
  await persistence.saveComment({
    id: `msg-retro-${sprint.id}`,
    from_agent: marcus.id,
    to_agent: null,
    content,
    task_id: null,
    sprint_id: sprint.id,
    timestamp: new Date().toISOString(),
    type: 'retrospective',
  });

  broadcast('sprint:retro', { sprintId: sprint.id, analytics });

  res.json({ success: true, analytics, content, review });
});

// Save agent-generated comments (bulk) — kept for manual use / backwards compat
app.post('/api/tasks/:id/comments', async (req, res) => {
  const incoming = req.body;
  if (!Array.isArray(incoming)) {
    return res.status(400).json({ error: 'Body must be an array of comments' });
  }
  for (const c of incoming) {
    await persistence.saveComment(c);
  }
  res.json({ success: true, saved: incoming.length });
});

// ── Serve React build ────────────────────────────────────────────────────

if (fs.existsSync(DIST_DIR)) {
  app.use(express.static(DIST_DIR));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(DIST_DIR, 'index.html'));
  });
} else {
  app.get('/', (_req, res) => {
    res.send('React build not found. Run "npm run build" in web.ui/frontend-react/ first.');
  });
}

// ── Start ────────────────────────────────────────────────────────────────

// Graceful shutdown so in-flight comments flush instead of being lost.
async function shutdown(signal) {
  console.log(`\n${signal} received — flushing writes…`);
  try {
    await persistence.flushAllWrites();
  } catch (err) {
    console.error('Error flushing writes:', err);
  }
  process.exit(0);
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

const server = app.listen(PORT, async () => {
  console.log(`Rooster AI server running at http://localhost:${PORT}`);
  // 🚀 Boot all agents (await so AnthropicAdapter wires before traffic).
  await runtime.start();
});

// DATA_DIR is referenced by persistence module; export so tests can locate it.
export { app, server, DATA_DIR };
