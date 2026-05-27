/**
 * POST /api/kdp/books/:slug/audit-puzzles
 *
 * Spawns a Python subprocess that runs
 *   `python projects/kdp-puzzle-press/scripts/audit_puzzles.py --book=<slug>`
 * captures the JSON stdout, validates the shape, writes audit_status +
 * audit_at + audit_summary_json onto the kdp_books row, and broadcasts
 * `kdp:audit-started` + `kdp:audit-complete` over the SSE channel.
 *
 * The Python runner is injected so tests don't shell out. Default runner
 * uses node:child_process.spawn with a 5-minute timeout per spec §8.
 *
 * @module kdp/audit_routes
 */
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { openDb } from '../db.js';
import { recordEvent } from '../events.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** Slug whitelist per spec §8. */
const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;

/** Subprocess hard timeout (ms) — spec §8. */
const AUDIT_TIMEOUT_MS = 5 * 60 * 1000;

/**
 * Default pythonRunner. Spawns `python <script> --book=<slug>` with a
 * 5-minute timeout. Resolves to {code, stdout, stderr, timedOut}.
 *
 * @param {string} slug
 * @returns {Promise<{code: number|null, stdout: string, stderr: string, timedOut?: boolean}>}
 */
async function defaultPythonRunner(slug) {
  // __dirname = .../web.ui/backend/kdp ; repo root is three levels up.
  const repoRoot = path.resolve(__dirname, '..', '..', '..');
  const script = path.join(
    repoRoot,
    'projects',
    'kdp-puzzle-press',
    'scripts',
    'audit_puzzles.py',
  );
  const venvPython = path.join(
    repoRoot,
    'projects',
    'kdp-puzzle-press',
    '.venv',
    'Scripts',
    'python.exe',
  );
  const pythonExe = process.env.ROOSTER_PYTHON || venvPython;
  return new Promise((resolve) => {
    const proc = spawn(
      pythonExe,
      [script, `--book=${slug}`],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    );
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      proc.kill('SIGKILL');
    }, AUDIT_TIMEOUT_MS);
    proc.stdout.on('data', (chunk) => (stdout += chunk.toString('utf8')));
    proc.stderr.on('data', (chunk) => (stderr += chunk.toString('utf8')));
    proc.on('error', (err) => {
      clearTimeout(timer);
      resolve({ code: 1, stdout, stderr: stderr + String(err?.message || err), timedOut: false });
    });
    proc.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code: timedOut ? null : code, stdout, stderr, timedOut });
    });
  });
}

/**
 * Build the audit router. Inject `pythonRunner` in tests.
 *
 * @param {{pythonRunner?: (slug: string) => Promise<{code:number|null, stdout:string, stderr:string, timedOut?:boolean}>}} [opts]
 * @returns {import('express').Router}
 */
export function createAuditRouter(opts = {}) {
  const pythonRunner = opts.pythonRunner ?? defaultPythonRunner;
  const router = express.Router();

  router.post('/books/:slug/audit-puzzles', async (req, res) => {
    const slug = String(req.params.slug);
    if (!SLUG_RE.test(slug)) {
      return res.status(400).json({ error: 'invalid_slug', expected: SLUG_RE.source });
    }
    const db = openDb();
    const book = db.prepare('SELECT * FROM kdp_books WHERE slug = ?').get(slug);
    if (!book) {
      return res.status(404).json({ error: 'not_found' });
    }

    recordEvent('kdp:audit-started', { slug });

    let result;
    try {
      result = await pythonRunner(slug);
    } catch (err) {
      const summary = { error: String(err?.message || err) };
      writeAuditRow(db, book.id, 'failed', summary);
      const updated = db.prepare('SELECT * FROM kdp_books WHERE id = ?').get(book.id);
      recordEvent('kdp:audit-complete', { slug, status: 'failed' });
      return res.status(500).json({ book: updated });
    }

    // Timeout
    if (result.timedOut) {
      const summary = { error: 'audit_timeout' };
      writeAuditRow(db, book.id, 'failed', summary);
      const updated = db.prepare('SELECT * FROM kdp_books WHERE id = ?').get(book.id);
      recordEvent('kdp:audit-complete', { slug, status: 'failed' });
      return res.status(500).json({ book: updated });
    }

    // Non-zero exit
    if (result.code !== 0) {
      const summary = { error: result.stderr || `exit ${result.code}` };
      writeAuditRow(db, book.id, 'failed', summary);
      const updated = db.prepare('SELECT * FROM kdp_books WHERE id = ?').get(book.id);
      recordEvent('kdp:audit-complete', { slug, status: 'failed' });
      return res.status(500).json({ book: updated });
    }

    // Parse JSON
    let parsed;
    try {
      parsed = JSON.parse(result.stdout);
    } catch (err) {
      const summary = { error: `invalid_json: ${err?.message || err}`, stdout: result.stdout.slice(0, 500) };
      writeAuditRow(db, book.id, 'failed', summary);
      const updated = db.prepare('SELECT * FROM kdp_books WHERE id = ?').get(book.id);
      recordEvent('kdp:audit-complete', { slug, status: 'failed' });
      return res.status(500).json({ book: updated });
    }

    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.puzzles) || !parsed.totals) {
      const summary = { error: 'malformed_audit_json' };
      writeAuditRow(db, book.id, 'failed', summary);
      const updated = db.prepare('SELECT * FROM kdp_books WHERE id = ?').get(book.id);
      recordEvent('kdp:audit-complete', { slug, status: 'failed' });
      return res.status(500).json({ book: updated });
    }

    const status = parsed.totals.failed === 0 ? 'passed' : 'failed';
    writeAuditRow(db, book.id, status, parsed);
    const updated = db.prepare('SELECT * FROM kdp_books WHERE id = ?').get(book.id);
    recordEvent('kdp:audit-complete', { slug, status });
    return res.status(200).json({ book: updated });
  });

  return router;
}

/**
 * Persist audit fields on kdp_books.
 *
 * @param {import('better-sqlite3').Database} db
 * @param {number} bookId
 * @param {'passed'|'failed'|'unchecked'} status
 * @param {object} summary
 */
function writeAuditRow(db, bookId, status, summary) {
  db.prepare(`
    UPDATE kdp_books
       SET puzzle_audit_status = ?,
           puzzle_audit_at = datetime('now'),
           puzzle_audit_summary_json = ?,
           updated_at = datetime('now')
     WHERE id = ?
  `).run(status, JSON.stringify(summary), bookId);
}

/** Default router instance used by server.js. */
export const router = createAuditRouter();
export default router;
