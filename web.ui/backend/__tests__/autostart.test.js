/**
 * File-content checks for the PowerShell autostart scripts. We never invoke
 * schtasks / Register-ScheduledTask from CI — these tests only verify the
 * scripts exist on disk and contain the spec-required cmdlet calls.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// web.ui/backend/__tests__ → repo root → scripts
const scriptsDir = path.resolve(__dirname, '..', '..', '..', 'scripts');

describe('autostart scripts', () => {
  it('install-autostart.ps1 exists', () => {
    const p = path.join(scriptsDir, 'install-autostart.ps1');
    expect(fs.existsSync(p)).toBe(true);
  });

  it('install-autostart.ps1 registers an at-logon scheduled task named "Rooster Dashboard"', () => {
    const src = fs.readFileSync(
      path.join(scriptsDir, 'install-autostart.ps1'),
      'utf8',
    );
    expect(src).toMatch(/Register-ScheduledTask/);
    expect(src).toMatch(/-AtLogOn/);
    expect(src).toMatch(/Rooster Dashboard/);
  });

  it('install-autostart.ps1 is idempotent (unregisters any existing task first)', () => {
    const src = fs.readFileSync(
      path.join(scriptsDir, 'install-autostart.ps1'),
      'utf8',
    );
    expect(src).toMatch(/Unregister-ScheduledTask/);
  });

  it('uninstall-autostart.ps1 exists and removes the task', () => {
    const p = path.join(scriptsDir, 'uninstall-autostart.ps1');
    expect(fs.existsSync(p)).toBe(true);
    const src = fs.readFileSync(p, 'utf8');
    expect(src).toMatch(/Unregister-ScheduledTask/);
    expect(src).toMatch(/Rooster Dashboard/);
  });
});
