import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openDb, _resetForTests } from '../db.js';

let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rooster-backup-'));
  process.env.ROOSTER_DB_PATH = path.join(tmpDir, 'dashboard.db');
  process.env.ROOSTER_BACKUP_DIR = path.join(tmpDir, '.backups');
  process.env.ROOSTER_LOG_DIR = path.join(tmpDir, 'logs');
  _resetForTests();
  vi.resetModules();
  openDb(); // create DB + tables
});

afterEach(async () => {
  _resetForTests();
  // On Windows, better-sqlite3's hot backup briefly retains file handles even
  // after the source DB is closed. Retry rmSync a few times to avoid EPERM.
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 50));
    }
  }
  delete process.env.ROOSTER_DB_PATH;
  delete process.env.ROOSTER_BACKUP_DIR;
  delete process.env.ROOSTER_LOG_DIR;
});

describe('backupCron', () => {
  it('runOnce writes a dated backup file', async () => {
    const { runBackupOnce } = await import('../backupCron.js');
    const dest = await runBackupOnce();
    expect(typeof dest).toBe('string');
    expect(fs.existsSync(dest)).toBe(true);
    const files = fs.readdirSync(process.env.ROOSTER_BACKUP_DIR);
    expect(files.some((f) => /^dashboard-\d{4}-\d{2}-\d{2}\.db$/.test(f))).toBe(true);
  });

  it('prunes backups older than 14 days', async () => {
    fs.mkdirSync(process.env.ROOSTER_BACKUP_DIR, { recursive: true });
    const stale = path.join(process.env.ROOSTER_BACKUP_DIR, 'dashboard-2024-01-01.db');
    fs.writeFileSync(stale, 'x');
    // Backdate mtime so the prune sees it as stale.
    const old = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
    fs.utimesSync(stale, old, old);
    const { pruneOldBackups } = await import('../backupCron.js');
    const pruned = pruneOldBackups(14);
    expect(fs.existsSync(stale)).toBe(false);
    expect(pruned).toContain('dashboard-2024-01-01.db');
  });

  it('startBackupCron registers a node-cron task and stopBackupCron stops it', async () => {
    const { startBackupCron, stopBackupCron } = await import('../backupCron.js');
    const task = startBackupCron();
    expect(task).toBeTruthy();
    // node-cron tasks expose .stop()
    expect(typeof task.stop).toBe('function');
    stopBackupCron();
  });
});
