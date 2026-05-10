/**
 * Express server — serves the React build, provides JSON CRUD API,
 * boots the AgentRuntime, and pushes live agent events via SSE.
 */

// Side-effect first: populates process.env from .env / .env.local before any
// downstream import reads ANTHROPIC_API_KEY or GEMINI_API_KEY at module load.
import './loadEnv.js';

import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { runtime, bus, marcus, analyzeTask } from './agents/index.js';
import { ImageGenerationService } from './agents/ImageGenerationService.js';
import {
  validateTransition,
  ALLOWED_STATUSES,
} from '../shared/workflow.mjs';
import { persistence, readJson, writeJson, DATA_DIR } from './persistence.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DIST_DIR = path.resolve(__dirname, '../frontend-react/dist');
const IMAGES_DIR = path.resolve(__dirname, 'generated-images');
const PORT = Number(process.env.PORT) || 5000;
const SSE_HEARTBEAT_MS = 20_000;

const app = express();
// 25 MB ceiling supports edit mode where the client posts a base64-encoded
// source image alongside the prompt. The default 100 KB rejects every edit.
app.use(express.json({ limit: '25mb' }));

// ── Image generation service (Nano Banana Pro) ───────────────────────────
// Lazy-init: only build the service if GEMINI_API_KEY is set, so dev
// environments without a key still boot cleanly. The endpoint below
// returns 503 when the service is absent.
let imageService = null;
if (process.env.GEMINI_API_KEY) {
  try {
    imageService = new ImageGenerationService({
      apiKey: process.env.GEMINI_API_KEY,
      model: process.env.IMAGE_MODEL,
      outputDir: IMAGES_DIR,
    });
    console.log(
      `🎨 Image generation enabled (${process.env.IMAGE_MODEL || 'gemini-3-pro-image-preview'})`,
    );
  } catch (err) {
    console.warn('Image service init failed:', err.message);
  }
} else {
  console.log('🎨 Image generation disabled (set GEMINI_API_KEY to enable)');
}

// Serve generated PNGs at /images/* for direct <img src> use in the browser.
app.use('/images', express.static(IMAGES_DIR));

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

// ── Image generation (Nano Banana Pro / Gemini 3 Pro Image) ──────────────
// Body: {prompt, taskId?, aspectRatio?, resolution?, inputImage?}
//   inputImage = {data: base64-string, mimeType: string}  (edit mode)
// Returns: {url, filename, bytes, model, mimeType}
app.post('/api/generate-image', async (req, res) => {
  if (!imageService) {
    return res.status(503).json({
      error: 'Image generation is not configured. Set GEMINI_API_KEY in .env and restart.',
    });
  }
  const { prompt, taskId, aspectRatio, resolution, inputImage } = req.body || {};
  if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
    return res.status(400).json({ error: 'prompt is required' });
  }
  try {
    const result = await imageService.generate({
      prompt,
      taskId,
      aspectRatio,
      resolution,
      inputImage,
    });
    res.json(result);
  } catch (err) {
    // Validation errors (invalid aspect ratio, bad inputImage shape) come
    // back as plain Error — surface as 400 so the UI can show the message.
    // Anything else is treated as upstream failure (502).
    const msg = err?.message || 'Image generation failed';
    const isValidation =
      msg.startsWith('Invalid ') ||
      msg.startsWith('prompt is required') ||
      msg.startsWith('inputImage must be');
    res.status(isValidation ? 400 : 502).json({ error: msg });
  }
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
