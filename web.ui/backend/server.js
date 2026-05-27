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
import { subscribe, replayRecent, recordEvent } from './events.js';
import { getAllStatuses, trayColor } from './workerStatus.js';
import { startBackupCron } from './backupCron.js';
import { startTray } from './tray.js';
import { logger } from './logger.js';
import kdpRoutes from './kdp/routes.js';
import { startScanner as startKdpScanner } from './kdp/scanner.js';
import profileRoutes from './profile/routes.js';
import filesRoute from './files_route.js';
import { mountEtsyRoutes } from './etsy/routes.js';
import { runSyncPass as runEtsySyncPass } from './etsy/syncer.js';
import { startEtsyWorkerDefault } from './etsy/worker.js';
import { etsyConfig } from './etsy/config.js';
import { ensureFreshToken } from './etsy/oauth.js';
import { EtsyClient } from './etsy/client.js';
import { mountCalendarRoutes } from './calendar/routes.js';
import { mountReminderActionRoutes } from './reminders/routes.js';

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

// Start the KDP filesystem scanner. Gated on PORT !== 0 (test harness uses
// PORT=0) and on ROOSTER_SKIP_KDP_SCANNER so developers can disable it
// explicitly during local dev or integration tests.
if (PORT !== 0 && process.env.ROOSTER_SKIP_KDP_SCANNER !== '1') {
  startKdpScanner();
}

// Start the Etsy 30-min syncer. Same gating model as the KDP scanner, plus
// a requirement that ETSY_KEYSTRING is set (so a dev without Etsy creds
// doesn't see noise on every tick). ROOSTER_SKIP_ETSY_WORKER=1 disables.
if (
  PORT !== 0 &&
  process.env.ROOSTER_SKIP_ETSY_WORKER !== '1' &&
  process.env.ETSY_KEYSTRING
) {
  try {
    startEtsyWorkerDefault({ db: openDb(), emit: recordEvent });
  } catch (err) {
    logger.warn(
      { err: err.message },
      'etsy worker init failed (config missing?)',
    );
  }
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

// ── /api/kdp/* — KDP book list, detail, mark-in-review, mark-published ──
app.use('/api/kdp', kdpRoutes);

// ── /api/etsy/* — Etsy listings list/detail + manual sync trigger ───────
// The real EtsyClient (and therefore sync-now) only works when Etsy
// credentials are configured; we still mount the read endpoints so the
// UI can render whatever was last cached. A separate client factory keeps
// the route module test-friendly.
{
  /** @type {(() => Promise<{inserted:number,updated:number,statusChanged:number}>)} */
  let runEtsySync;
  if (process.env.ETSY_KEYSTRING) {
    try {
      const cfg = etsyConfig();
      const etsyClient = new EtsyClient({
        keystring: cfg.keystring,
        sharedSecret: cfg.sharedSecret,
        shopId: cfg.shopId,
        getAccessToken: () => ensureFreshToken({ cfg }),
      });
      runEtsySync = () =>
        runEtsySyncPass({ db: openDb(), client: etsyClient, emit: recordEvent });
    } catch (err) {
      logger.warn(
        { err: err.message },
        'etsy routes: sync-now disabled (config invalid?)',
      );
      runEtsySync = async () => {
        throw new Error('Etsy not configured');
      };
    }
  } else {
    runEtsySync = async () => {
      throw new Error('Etsy not configured (ETSY_KEYSTRING missing)');
    };
  }
  mountEtsyRoutes(app, { db: openDb(), runSyncPass: runEtsySync });
}

// ── /api/calendar/* — unified event stream over kdp/etsy/reminders/pinterest
mountCalendarRoutes(app, { db: openDb() });

// ── /api/reminders/* — snooze + dismiss action endpoints ────────────────
mountReminderActionRoutes(app, { db: openDb() });

// ── /api/profile — single-row profile read/write ────────────────────────
app.use('/api/profile', profileRoutes);

// ── /files/* — allow-listed static assets (covers, preview PNGs) ────────
app.use('/files', filesRoute);

// ── /api/__test__/* — E2E-only seed/reset endpoints ─────────────────────
// Gated on ROOSTER_E2E=1 so production never exposes mutation shortcuts.
// Used by Playwright specs in web.ui/frontend-react/tests/e2e/.
if (process.env.ROOSTER_E2E === '1') {
  app.post('/api/__test__/reset', (_req, res) => {
    const db = openDb();
    db.exec(
      `DELETE FROM pinterest_history;
       DELETE FROM pinterest_queue;
       DELETE FROM reminders;
       DELETE FROM kdp_books;
       DELETE FROM events;
       UPDATE profile
          SET display_name=NULL, pen_names_json=NULL, kdp_author_url=NULL,
              etsy_shop_url=NULL, pinterest_url=NULL, gmail_address=NULL,
              brand_palette_json=NULL, time_zone='America/Los_Angeles'
        WHERE id=1;`,
    );
    res.json({ ok: true });
  });

  app.post('/api/__test__/seed-kdp-book', (req, res) => {
    const db = openDb();
    const body = req.body ?? {};
    const slug = String(body.slug || 'e2e-book');
    const title = String(body.title || 'E2E Book');
    const status = String(body.status || 'built');
    const outputDir = String(body.output_dir || `./tmp/${slug}`);
    const subtitle = body.subtitle ?? null;
    const trim = body.trim_size ?? '6x9';
    const pages = body.page_count ?? 120;
    const price = body.price_usd ?? 9.99;
    const blurb = body.blurb ?? 'A test book for E2E.';
    const coverPath = body.cover_path ?? null;
    const asin = body.asin ?? null;
    const releaseDate = body.release_date ?? null;
    const listingUrl = body.listing_url ?? null;
    db.prepare(
      `INSERT OR REPLACE INTO kdp_books
         (slug, title, subtitle, asin, status, release_date, listing_url,
          page_count, trim_size, price_usd, blurb, cover_path, output_dir)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      slug,
      title,
      subtitle,
      asin,
      status,
      releaseDate,
      listingUrl,
      pages,
      trim,
      price,
      blurb,
      coverPath,
      outputDir,
    );
    const row = db.prepare('SELECT * FROM kdp_books WHERE slug=?').get(slug);
    res.json({ book: row });
  });
}

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
