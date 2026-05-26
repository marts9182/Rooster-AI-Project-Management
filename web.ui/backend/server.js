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
import { ImageGenerationService } from './ImageGenerationService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DIST_DIR = path.resolve(__dirname, '../frontend-react/dist');
const IMAGES_DIR = path.resolve(__dirname, 'generated-images');
const PORT = process.env.PORT !== undefined ? Number(process.env.PORT) : 5000;

const app = express();
app.use(express.json({ limit: '25mb' }));

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
const server = PORT === 0
  ? null
  : app.listen(PORT, '127.0.0.1', () => {
      console.log(`Publishing Ops Dashboard server running at http://127.0.0.1:${PORT}`);
    });

export { app, server };
