/**
 * Express server — serves the React build and the image-generation API.
 *
 * Commit 1 (this file): Kanban + 7-agent runtime removed. Only the
 *   minimum-viable HTTP surface remains so the app boots into an empty shell.
 *
 * Commit 2 will add:
 *   - SQLite (db.js)
 *   - SSE channel (events.js → /api/events)
 *   - /api/status (workerStatus map)
 *   - /api/help/:field
 *   - systray2, autostart, logging, backup cron
 */

import './loadEnv.js';

import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { marked } from 'marked';
import { ImageGenerationService } from './ImageGenerationService.js';
import { openDb } from './db.js';
import { subscribe, replayRecent } from './events.js';
import { getAllStatuses, trayColor } from './workerStatus.js';
import { startBackupCron } from './backupCron.js';
import { startTray } from './tray.js';
import { logger } from './logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DIST_DIR = path.resolve(__dirname, '../frontend-react/dist');
const IMAGES_DIR = path.resolve(__dirname, 'generated-images');
const PORT = process.env.PORT !== undefined ? Number(process.env.PORT) : 5000;

const SSE_HEARTBEAT_MS = 20_000;

const app = express();
app.use(express.json({ limit: '25mb' }));

// Open DB eagerly so migrations run before any request hits the API.
openDb();

// Schedule the nightly backup + log-prune cron alongside the live server.
// Gated on PORT !== 0 so the test harness (which sets PORT=0) never schedules
// a real cron during vitest runs.
if (PORT !== 0) {
  startBackupCron();
}

// ── Image generation (Nano Banana Pro) — retained from previous app ────────
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

app.use('/images', express.static(IMAGES_DIR));

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
    const msg = err?.message || 'Image generation failed';
    const isValidation =
      msg.startsWith('Invalid ') ||
      msg.startsWith('prompt is required') ||
      msg.startsWith('inputImage must be');
    res.status(isValidation ? 400 : 502).json({ error: msg });
  }
});

// ── /api/status — worker health (read-only) ────────────────────────────────
app.get('/api/status', (_req, res) => {
  res.json({
    workers: getAllStatuses(),
    tray_color: trayColor(),
  });
});

// ── /api/events — SSE channel (consumed by frontend, written by Plans B-E) ─
app.get('/api/events', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  // Flush headers immediately so clients see the stream is live.
  res.write(':\n\n');

  // Replay the last 50 events so a freshly-loaded UI shows recent history.
  for (const evt of replayRecent(50)) {
    res.write(
      `event: ${evt.kind}\ndata: ${JSON.stringify({ payload: evt.payload, occurred_at: evt.occurred_at })}\n\n`,
    );
  }

  const unsubscribe = subscribe((evt) => {
    try {
      res.write(
        `event: ${evt.kind}\ndata: ${JSON.stringify({ payload: evt.payload, occurred_at: evt.occurred_at })}\n\n`,
      );
    } catch {
      // The close handler will tear things down; nothing else to do here.
    }
  });

  const heartbeat = setInterval(() => {
    try {
      res.write(': heartbeat\n\n');
    } catch {
      // ignored — close handler runs cleanup
    }
  }, SSE_HEARTBEAT_MS);

  req.on('close', () => {
    clearInterval(heartbeat);
    unsubscribe();
  });
});

// ── /api/help/:field — documentation articles (markdown → HTML) ──────────
const HELP_DIR = path.resolve(__dirname, 'help');
app.get('/api/help/:field', (req, res) => {
  const { field } = req.params;

  // Validate field name: alphanumeric + underscore only (no path traversal)
  if (!/^[a-z0-9_]+$/.test(field)) {
    return res.status(400).json({ error: 'invalid_field_name' });
  }

  const filePath = path.join(HELP_DIR, `${field}.md`);

  // Ensure the resolved path is still within HELP_DIR (defense in depth)
  if (!filePath.startsWith(HELP_DIR)) {
    return res.status(400).json({ error: 'invalid_field_name' });
  }

  // Check if file exists
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'unknown_help_topic' });
  }

  try {
    const markdown = fs.readFileSync(filePath, 'utf8');
    const html = marked.parse(markdown);
    res.set('Content-Type', 'text/markdown; charset=utf-8');
    res.send(markdown);
  } catch (err) {
    logger.error({ err: err.message, field }, 'help endpoint error');
    res.status(500).json({ error: 'failed_to_read_help' });
  }
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
// The tray is gated on PORT !== 0 (so vitest's PORT=0 boot never spawns the
// systray2 helper) and on ROOSTER_SKIP_TRAY !== '1' (so a developer running
// the server in a non-tray environment — VS Code dev container, SSH, etc. —
// can disable it explicitly).
const server = PORT === 0
  ? null
  : app.listen(PORT, '127.0.0.1', async () => {
      console.log(`Publishing Ops Dashboard server running at http://127.0.0.1:${PORT}`);
      if (process.env.ROOSTER_SKIP_TRAY !== '1') {
        try {
          await startTray();
        } catch (err) {
          logger.warn({ err: err.message }, 'tray failed to start');
        }
      }
    });

export { app, server };
