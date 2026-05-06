#!/usr/bin/env node
/**
 * fix-encoding.mjs — repair UTF-8-decoded-as-Latin-1 mojibake in data/*.json.
 *
 * Many task descriptions contain garbled sequences like "ÃƒÆ'Ã†â€™" that
 * appear when UTF-8 bytes were re-decoded as Windows-1252/Latin-1 and then
 * re-encoded as UTF-8 (sometimes more than once). The fix is to take the
 * mojibake string, encode it back as Latin-1 bytes, and decode those bytes
 * as UTF-8 — restoring the original characters.
 *
 * Run: `node scripts/fix-encoding.mjs`
 *
 * Safety:
 *   - Originals are backed up to data/.backup-<timestamp>/ before any write.
 *   - A repair is only kept if it strictly *reduces* the count of mojibake
 *     marker characters in the string. Strings that already look clean are
 *     left alone.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.resolve(__dirname, '../data');

const FILES = ['tasks.json', 'messages.json', 'sprints.json'];

// Characters that strongly indicate Latin-1-as-UTF-8 mojibake.
// "Â" (U+00C2), "Ã" (U+00C3), "â€" sequences, etc.
const MOJIBAKE_PATTERN = /[ÂÃ]|â€|Ã¢â‚¬|ÃƒÆ|Ã†|â„¢|â€™|â€œ|â€|Ã©|Ã¨|Ã³|Ã¡/g;

/** How many mojibake markers does this string contain? */
function countMojibake(s) {
  if (typeof s !== 'string') return 0;
  return (s.match(MOJIBAKE_PATTERN) || []).length;
}

/**
 * Attempt to repair a string by re-decoding as if its UTF-8 bytes were
 * mistakenly read as Latin-1. Run up to 2 passes (some data was double-
 * encoded), keeping each pass only if it strictly reduces the marker count.
 */
function repairString(s) {
  if (typeof s !== 'string' || !s) return s;
  let current = s;
  let bestScore = countMojibake(current);
  if (bestScore === 0) return current;

  for (let i = 0; i < 2; i++) {
    let candidate;
    try {
      candidate = Buffer.from(current, 'latin1').toString('utf8');
    } catch {
      break;
    }
    const newScore = countMojibake(candidate);
    if (newScore < bestScore) {
      current = candidate;
      bestScore = newScore;
      if (bestScore === 0) break;
    } else {
      break;
    }
  }
  return current;
}

/** Walk an arbitrary JSON value, repairing every string in place. */
function repairValue(value, stats) {
  if (typeof value === 'string') {
    const before = countMojibake(value);
    if (before === 0) return value;
    const repaired = repairString(value);
    const after = countMojibake(repaired);
    if (after < before) {
      stats.stringsFixed++;
      stats.markersRemoved += before - after;
    }
    return repaired;
  }
  if (Array.isArray(value)) {
    return value.map((v) => repairValue(v, stats));
  }
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = repairValue(v, stats);
    }
    return out;
  }
  return value;
}

function backupAndWrite(filename, repaired, backupDir) {
  const src = path.join(DATA_DIR, filename);
  const backup = path.join(backupDir, filename);
  fs.copyFileSync(src, backup);
  fs.writeFileSync(src, JSON.stringify(repaired, null, 2), 'utf-8');
}

function main() {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupDir = path.join(DATA_DIR, `.backup-${stamp}`);

  let totalFixed = 0;
  let totalMarkers = 0;
  const fileResults = [];

  // Pre-flight: verify all files exist before touching anything.
  const present = FILES.filter((f) => fs.existsSync(path.join(DATA_DIR, f)));
  if (present.length === 0) {
    console.log(`No data files found in ${DATA_DIR}.`);
    return;
  }

  fs.mkdirSync(backupDir, { recursive: true });

  for (const filename of present) {
    const filepath = path.join(DATA_DIR, filename);
    const raw = fs.readFileSync(filepath, 'utf-8');
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      console.error(`✗ ${filename}: JSON parse failed — ${err.message}. Skipping.`);
      continue;
    }
    const stats = { stringsFixed: 0, markersRemoved: 0 };
    const repaired = repairValue(parsed, stats);
    if (stats.stringsFixed > 0) {
      backupAndWrite(filename, repaired, backupDir);
      totalFixed += stats.stringsFixed;
      totalMarkers += stats.markersRemoved;
      fileResults.push({ filename, ...stats });
      console.log(`✓ ${filename}: repaired ${stats.stringsFixed} strings (${stats.markersRemoved} markers removed)`);
    } else {
      console.log(`· ${filename}: clean — no changes`);
    }
  }

  if (totalFixed === 0) {
    console.log('\nNo mojibake found. No backup created.');
    fs.rmdirSync(backupDir);
  } else {
    console.log(`\n✅ Done. Repaired ${totalFixed} strings (${totalMarkers} mojibake markers).`);
    console.log(`   Originals backed up to ${backupDir}`);
  }
}

main();
