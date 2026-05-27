/**
 * /files static route — serves cover.pdf, interior.pdf, preview PNGs, and
 * Pinterest pin PNGs to the React UI without exposing the rest of the repo.
 *
 * Allow-list (all paths are repo-root-relative):
 *   - data/cache/previews/**                         — any file
 *   - projects/kdp-puzzle-press/output/kdp-ready/<slug>/
 *         (only cover.pdf | cover.png | cover.jpg | interior.pdf)
 *   - output/pinterest/<slug>/**                     — only .png / .jpg / .jpeg
 *
 * Anything else — path traversal, files in an allowed root but with a
 * disallowed extension, or files outside all three roots — returns 404
 * with `{ error: 'forbidden_or_not_found' }`. We deliberately do not
 * distinguish "exists but blocked" from "missing" so the route never
 * leaks filesystem layout.
 *
 * Path handling notes:
 *   - The express router is mounted at /files, so req.path is repo-relative.
 *   - We decode URI components, then normalize the joined absolute path,
 *     then verify it starts with one of the allow-list roots (case-insensitive
 *     on Windows). This blocks `..`, encoded `..`, and absolute-path tricks.
 *
 * @module files_route
 */
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const router = express.Router();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** Default repo root: <backend>/../.. — overrideable via ROOSTER_REPO_ROOT for tests. */
function repoRoot() {
  if (process.env.ROOSTER_REPO_ROOT) {
    return path.resolve(process.env.ROOSTER_REPO_ROOT);
  }
  return path.resolve(__dirname, '..', '..');
}

/** Filenames permitted inside kdp-ready/<slug>/. */
const KDP_READY_ALLOWED_NAMES = new Set([
  'cover.pdf',
  'cover.png',
  'cover.jpg',
  'interior.pdf',
]);

/** Extensions permitted inside output/pinterest/<slug>/. */
const PINTEREST_ALLOWED_EXTS = new Set(['.png', '.jpg', '.jpeg']);

/**
 * Case-insensitive "is path inside root" check that handles Windows drive
 * letters. Both arguments are expected to be absolute, already-normalized.
 *
 * @param {string} child
 * @param {string} root
 * @returns {boolean}
 */
function isInside(child, root) {
  const c = child.toLowerCase();
  const r = root.toLowerCase();
  return c === r || c.startsWith(r + path.sep);
}

/**
 * Decide whether `absPath` is in the allow-list. Returns true if the request
 * should be served, false otherwise.
 *
 * @param {string} absPath
 * @returns {boolean}
 */
function isAllowed(absPath) {
  const root = repoRoot();
  const previewsRoot = path.join(root, 'data', 'cache', 'previews');
  const kdpReadyRoot = path.join(
    root,
    'projects',
    'kdp-puzzle-press',
    'output',
    'kdp-ready',
  );
  const pinterestRoot = path.join(root, 'output', 'pinterest');

  // Any file under data/cache/previews/ is fair game.
  if (isInside(absPath, previewsRoot)) {
    return true;
  }

  // Inside kdp-ready/, only allow specific filenames.
  if (isInside(absPath, kdpReadyRoot)) {
    const basename = path.basename(absPath).toLowerCase();
    return KDP_READY_ALLOWED_NAMES.has(basename);
  }

  // Inside output/pinterest/, only allow image extensions. Pin PNGs are
  // generated under output/pinterest/<slug>/<pin_type>-<index>.png by
  // pinterest/generator.js (Plan E Task 4).
  if (isInside(absPath, pinterestRoot)) {
    const ext = path.extname(absPath).toLowerCase();
    return PINTEREST_ALLOWED_EXTS.has(ext);
  }

  return false;
}

router.get(/.*/, (req, res) => {
  let rel;
  try {
    rel = decodeURIComponent(req.path);
  } catch {
    return res.status(404).json({ error: 'forbidden_or_not_found' });
  }
  // req.path begins with '/' — strip it so path.join treats it as relative.
  rel = rel.replace(/^\/+/, '');

  // Reject obviously hostile path components before resolution. (Normalize
  // still happens below for defense in depth.)
  if (rel.length === 0) {
    return res.status(404).json({ error: 'forbidden_or_not_found' });
  }

  const absPath = path.normalize(path.join(repoRoot(), rel));

  if (!isAllowed(absPath)) {
    return res.status(404).json({ error: 'forbidden_or_not_found' });
  }

  if (!fs.existsSync(absPath) || !fs.statSync(absPath).isFile()) {
    return res.status(404).json({ error: 'forbidden_or_not_found' });
  }

  return res.sendFile(absPath, (err) => {
    if (err && !res.headersSent) {
      res.status(404).json({ error: 'forbidden_or_not_found' });
    }
  });
});

export default router;
