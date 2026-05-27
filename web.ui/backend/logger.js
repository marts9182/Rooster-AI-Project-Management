/**
 * Pino logger with simple per-day file rotation.
 *
 * Output: `data/logs/dashboard-YYYY-MM-DD.log` (one JSON object per line).
 * Tests redirect via ROOSTER_LOG_DIR.
 *
 * On non-production environments (NODE_ENV !== 'production') the logger
 * additionally pretty-prints to stdout via pino-pretty.
 *
 * Retention is handled by the daily-prune call wired into the backup cron
 * (Task 16). 30-day retention by default.
 */

import pino from 'pino';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);

/** @returns {string} */
function resolveLogDir() {
  if (process.env.ROOSTER_LOG_DIR) {
    return path.resolve(process.env.ROOSTER_LOG_DIR);
  }
  return path.resolve(__dirname, '..', '..', 'data', 'logs');
}

const logDir = resolveLogDir();
fs.mkdirSync(logDir, { recursive: true });

const today = new Date().toISOString().slice(0, 10);
const logFile = path.join(logDir, `dashboard-${today}.log`);

// We mkdir'd `logDir` synchronously above, so pino's own mkdir option is
// unnecessary (and racy under Vitest: a flushing worker can try to mkdir a
// tmp dir that an afterEach hook has already torn down). Keep writes async
// for performance; tests call `_flush()` before assertions.
const fileDest = pino.destination({ dest: logFile, sync: false });

/**
 * @returns {pino.DestinationStream | import('pino').MultiStreamRes}
 */
function buildStreams() {
  if (process.env.NODE_ENV === 'production') {
    return fileDest;
  }
  const streams = [{ stream: fileDest }];
  try {
    const pretty = require('pino-pretty');
    streams.push({ stream: pretty({ colorize: true, translateTime: 'SYS:standard' }) });
  } catch {
    // pino-pretty unavailable — file-only logging
  }
  return pino.multistream(streams);
}

export const logger = pino(
  {
    base: { app: 'rooster-dashboard' },
    timestamp: pino.stdTimeFunctions.isoTime,
  },
  buildStreams(),
);

/**
 * Force buffered writes to disk. Used by tests; safe to call in production.
 * @returns {Promise<void>}
 */
export async function _flush() {
  return new Promise((resolve) => {
    try {
      fileDest.flushSync?.();
    } catch {
      // best-effort
    }
    setTimeout(resolve, 25);
  });
}

/**
 * Delete log files older than `keepDays`. Called by the nightly cron.
 *
 * @param {number} keepDays
 * @returns {string[]} filenames that were pruned
 */
export function pruneOldLogs(keepDays = 30) {
  const pruned = [];
  if (!fs.existsSync(logDir)) return pruned;
  const cutoff = Date.now() - keepDays * 24 * 60 * 60 * 1000;
  for (const file of fs.readdirSync(logDir)) {
    if (!/^dashboard-\d{4}-\d{2}-\d{2}\.log$/.test(file)) continue;
    const full = path.join(logDir, file);
    const stat = fs.statSync(full);
    if (stat.mtimeMs < cutoff) {
      fs.unlinkSync(full);
      pruned.push(file);
    }
  }
  return pruned;
}
