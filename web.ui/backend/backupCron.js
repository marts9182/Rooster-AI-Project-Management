/**
 * Nightly SQLite backup + log prune. Runs at 03:00 local via node-cron.
 *
 * Files: data/.backups/dashboard-YYYY-MM-DD.db (14-day retention).
 * Logs:  pruned to 30-day retention by logger.pruneOldLogs.
 */

import cron from 'node-cron';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from './db.js';
import { logger, pruneOldLogs } from './logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** @returns {string} */
function backupDir() {
  if (process.env.ROOSTER_BACKUP_DIR) {
    return path.resolve(process.env.ROOSTER_BACKUP_DIR);
  }
  return path.resolve(__dirname, '..', '..', 'data', '.backups');
}

/**
 * Take a `.backup` of the live DB to a dated file.
 * Uses better-sqlite3's `.backup()` API for a hot copy.
 *
 * @returns {Promise<string>} Absolute path to the backup file.
 */
export async function runBackupOnce() {
  const dir = backupDir();
  fs.mkdirSync(dir, { recursive: true });
  const date = new Date().toISOString().slice(0, 10);
  const dest = path.join(dir, `dashboard-${date}.db`);
  const db = openDb();
  await db.backup(dest);
  logger.info({ dest }, 'sqlite backup written');
  return dest;
}

/**
 * Delete dated backups older than `keepDays`.
 *
 * @param {number} keepDays
 * @returns {string[]} filenames that were pruned
 */
export function pruneOldBackups(keepDays = 14) {
  const pruned = [];
  const dir = backupDir();
  if (!fs.existsSync(dir)) return pruned;
  const cutoff = Date.now() - keepDays * 24 * 60 * 60 * 1000;
  for (const file of fs.readdirSync(dir)) {
    if (!/^dashboard-\d{4}-\d{2}-\d{2}\.db$/.test(file)) continue;
    const full = path.join(dir, file);
    const stat = fs.statSync(full);
    if (stat.mtimeMs < cutoff) {
      fs.unlinkSync(full);
      pruned.push(file);
      logger.info({ file }, 'pruned stale backup');
    }
  }
  return pruned;
}

/** @type {import('node-cron').ScheduledTask | null} */
let scheduledTask = null;

/**
 * Register the 03:00 daily cron. Returns the task so callers can stop() in tests.
 *
 * @returns {import('node-cron').ScheduledTask}
 */
export function startBackupCron() {
  if (scheduledTask) return scheduledTask;
  scheduledTask = cron.schedule('0 3 * * *', async () => {
    try {
      await runBackupOnce();
      pruneOldBackups(14);
      pruneOldLogs(30);
    } catch (err) {
      logger.error({ err: err.message }, 'backup cron failed');
    }
  });
  return scheduledTask;
}

/** Stop and clear the scheduled cron (test helper). */
export function stopBackupCron() {
  if (scheduledTask) {
    scheduledTask.stop();
    scheduledTask = null;
  }
}
