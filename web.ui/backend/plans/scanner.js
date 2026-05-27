/**
 * @file Scans docs/superpowers/{specs,plans}/*.md and produces a unified
 * entry list with computed status from checkbox progress.
 *
 * No DB writes; the scanner is invoked on demand from the routes layer.
 */

import fs from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';

/**
 * @typedef {Object} PlanProgress
 * @property {number} open
 * @property {number} done
 * @property {number} total
 * @property {number} percent  rounded 0–100
 *
 * @typedef {Object} PlanEntry
 * @property {'spec'|'plan'} kind
 * @property {string} title
 * @property {string} date          ISO yyyy-mm-dd (from filename prefix)
 * @property {'open'|'in-flight'|'done'} status
 * @property {string} path          absolute path to the .md file
 * @property {string} slug
 * @property {PlanProgress} progress
 */

const FILENAME_DATE = /^(\d{4}-\d{2}-\d{2})-(.+?)(-design|-implementation)?\.md$/i;
const CHECKBOX_OPEN = /^\s*-\s+\[ \]/gm;
const CHECKBOX_DONE = /^\s*-\s+\[[xX]\]/gm;
const H1 = /^# (.+)$/m;

/**
 * Strip the date prefix and `-design` / `-implementation` suffix from a filename.
 * "2026-05-22-etsy-rooster-shop-plan-3-implementation.md" → "etsy-rooster-shop-plan-3"
 * "2026-05-13-may-release-pair.md" → "may-release-pair"
 * @param {string} filename
 * @returns {string}
 */
export function _slugFromFilename(filename) {
  const m = filename.match(FILENAME_DATE);
  if (!m) return filename.replace(/\.md$/i, '');
  return m[2];
}

/**
 * @param {string} filename
 * @returns {string|null}  ISO date or null
 */
function _dateFromFilename(filename) {
  const m = filename.match(FILENAME_DATE);
  return m ? m[1] : null;
}

/**
 * Count open and done checkboxes in the markdown body.
 * @param {string} markdown
 * @returns {PlanProgress}
 */
export function computeProgress(markdown) {
  const open = (markdown.match(CHECKBOX_OPEN) ?? []).length;
  const done = (markdown.match(CHECKBOX_DONE) ?? []).length;
  const total = open + done;
  const percent = total === 0 ? 0 : Math.round((done / total) * 100);
  return { open, done, total, percent };
}

/**
 * Derive a status label from progress counts.
 * - `done`      → all checkboxes complete (total > 0, open == 0)
 * - `in-flight` → at least one done OR at least one open and at least one done
 * - `open`      → no checkboxes at all (no plan started)
 * For files with checkboxes but zero done → `in-flight` (work has started).
 * @param {PlanProgress} progress
 * @returns {'open'|'in-flight'|'done'}
 */
export function _statusOf(progress) {
  if (progress.total === 0) return 'open';
  if (progress.open === 0) return 'done';
  return 'in-flight';
}

/**
 * Extract title in order of preference: frontmatter.title → first H1 → slug.
 * @param {{ data: Record<string, unknown>, content: string }} parsed
 * @param {string} slug
 * @returns {string}
 */
function _titleFrom(parsed, slug) {
  if (typeof parsed.data.title === 'string' && parsed.data.title.trim() !== '') {
    return parsed.data.title;
  }
  const h1 = parsed.content.match(H1);
  if (h1) return h1[1].trim();
  return slug;
}

/**
 * Scan one directory and return its entries.
 * @param {string} dir
 * @param {'spec'|'plan'} kind
 * @returns {PlanEntry[]}
 */
function _scanDir(dir, kind) {
  if (!fs.existsSync(dir)) return [];
  /** @type {PlanEntry[]} */
  const out = [];
  for (const filename of fs.readdirSync(dir)) {
    if (!filename.endsWith('.md')) continue;
    const full = path.join(dir, filename);
    const raw = fs.readFileSync(full, 'utf8');
    const parsed = matter(raw);
    const slug = _slugFromFilename(filename);
    const date = _dateFromFilename(filename) ?? '';
    const progress = computeProgress(parsed.content);
    out.push({
      kind,
      title: _titleFrom(parsed, slug),
      date,
      status: _statusOf(progress),
      path: full,
      slug,
      progress,
    });
  }
  return out;
}

/**
 * Scan `<superpowersRoot>/specs/*.md` and `<superpowersRoot>/plans/*.md`.
 * Returns a combined array sorted by date DESC then title ASC.
 * @param {string} superpowersRoot  absolute path to docs/superpowers/
 * @returns {PlanEntry[]}
 */
export function scanDocs(superpowersRoot) {
  const specs = _scanDir(path.join(superpowersRoot, 'specs'), 'spec');
  const plans = _scanDir(path.join(superpowersRoot, 'plans'), 'plan');
  const all = [...specs, ...plans];
  all.sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1; // DESC by date
    return a.title.localeCompare(b.title);
  });
  return all;
}
