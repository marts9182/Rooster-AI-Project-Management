import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rooster-log-'));
  process.env.ROOSTER_LOG_DIR = tmpDir;
  vi.resetModules();
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
  delete process.env.ROOSTER_LOG_DIR;
});

describe('logger.js', () => {
  it('writes a JSON line to today\'s log file', async () => {
    const { logger, _flush } = await import('../logger.js');
    logger.info({ marker: 'abc123' }, 'hello');
    await _flush();
    const today = new Date().toISOString().slice(0, 10);
    const file = path.join(tmpDir, `dashboard-${today}.log`);
    expect(fs.existsSync(file)).toBe(true);
    const content = fs.readFileSync(file, 'utf8');
    expect(content).toMatch(/"marker":"abc123"/);
    expect(content).toMatch(/"msg":"hello"/);
  });

  it('exposes pruneOldLogs that deletes files older than 30 days', async () => {
    const oldName = path.join(tmpDir, 'dashboard-2024-01-01.log');
    fs.writeFileSync(oldName, 'stale');
    // Backdate mtime so the prune sees it as stale.
    const old = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
    fs.utimesSync(oldName, old, old);
    const { pruneOldLogs } = await import('../logger.js');
    pruneOldLogs(30);
    expect(fs.existsSync(oldName)).toBe(false);
  });
});
