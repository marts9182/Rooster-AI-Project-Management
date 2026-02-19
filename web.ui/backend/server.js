/**
 * Express server — serves the React build, provides JSON CRUD API,
 * boots the AgentRuntime, and pushes live agent events via SSE.
 */

import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { runtime, bus, validateTransition } from './agents/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.resolve(__dirname, '../../data');
const DIST_DIR = path.resolve(__dirname, '../frontend-react/dist');
const PORT = 5000;

const ALLOWED_STATUSES = [
  'backlog', 'analyze', 'develop', 'ready_for_test',
  'testing', 'ready_for_acceptance', 'accepted',
];

const app = express();
app.use(express.json());

// ── helpers ──────────────────────────────────────────────────────────────

function readJson(filename) {
  const filepath = path.join(DATA_DIR, filename);
  try {
    return JSON.parse(fs.readFileSync(filepath, 'utf-8'));
  } catch {
    return [];
  }
}

function writeJson(filename, data) {
  const filepath = path.join(DATA_DIR, filename);
  fs.writeFileSync(filepath, JSON.stringify(data, null, 2), 'utf-8');
}

// ── SSE — live agent event stream ────────────────────────────────────────

const sseClients = new Set();

app.get('/api/events', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });
  res.write(':\n\n'); // comment to flush headers

  sseClients.add(res);
  req.on('close', () => sseClients.delete(res));
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

app.post('/api/tasks/:id/move', (req, res) => {
  const { status } = req.body || {};
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

  const fromStage = task.status;
  task.status = status;
  task.updated_at = new Date().toISOString();
  writeJson('tasks.json', tasks);

  // 🔥 Fire the event — agents will pick it up asynchronously
  runtime.onTaskMoved(task.id, fromStage, status, task);

  // Broadcast task move to frontend
  broadcast('task:moved', { taskId: task.id, fromStage, toStage: status });

  res.json({ success: true });
});

// Save agent-generated comments (bulk) — kept for manual use / backwards compat
app.post('/api/tasks/:id/comments', (req, res) => {
  const incoming = req.body;
  if (!Array.isArray(incoming)) {
    return res.status(400).json({ error: 'Body must be an array of comments' });
  }

  const messages = readJson('messages.json');
  messages.push(...incoming);
  writeJson('messages.json', messages);
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

app.listen(PORT, () => {
  console.log(`Rooster AI server running at http://localhost:${PORT}`);

  // 🚀 Boot all agents
  runtime.start();
});
