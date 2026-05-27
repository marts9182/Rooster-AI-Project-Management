import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  _resetWorkerStatus,
  setWorkerError,
  setWorkerHeartbeat,
} from '../workerStatus.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Mock systray2 — we never want to spawn the helper binary during tests.
// Captures every constructor call so we can assert what tray.js sent.
const mockState = {
  instances: [],
};

vi.mock('systray2', () => {
  class MockSysTray {
    constructor(opts) {
      this.opts = opts;
      this._clickListener = null;
      this._readyResolved = false;
      this.sendAction = vi.fn(() => Promise.resolve(this));
      this.kill = vi.fn(() => Promise.resolve());
      mockState.instances.push(this);
    }
    onClick(listener) {
      this._clickListener = listener;
      return Promise.resolve(this);
    }
    ready() {
      this._readyResolved = true;
      return Promise.resolve();
    }
  }
  return { default: MockSysTray };
});

beforeEach(() => {
  mockState.instances.length = 0;
  _resetWorkerStatus();
  // Note: we intentionally do NOT call vi.resetModules() here. Doing so would
  // give the freshly-imported tray.js its own copy of workerStatus.js, so the
  // `setWorkerError` calls performed in the test file (against the top-level
  // import) would not be visible to tray.js's view of trayColor().
});

afterEach(() => {
  vi.useRealTimers();
  _resetWorkerStatus();
});

describe('tray.js — pickIconPath', () => {
  it('returns the green PNG when trayColor() is green', async () => {
    const { pickIconPath } = await import('../tray.js');
    expect(pickIconPath('green')).toMatch(/tray-green\.png$/);
  });

  it('returns the yellow PNG when color = yellow', async () => {
    const { pickIconPath } = await import('../tray.js');
    expect(pickIconPath('yellow')).toMatch(/tray-yellow\.png$/);
  });

  it('returns the red PNG when color = red', async () => {
    const { pickIconPath } = await import('../tray.js');
    expect(pickIconPath('red')).toMatch(/tray-red\.png$/);
  });

  it('with no argument, derives color from current workerStatus.trayColor()', async () => {
    setWorkerHeartbeat('kdp');
    setWorkerError('kdp', 'boom');
    const { pickIconPath } = await import('../tray.js');
    expect(pickIconPath()).toMatch(/tray-red\.png$/);
  });

  it('returns an absolute path under the backend assets directory', async () => {
    const { pickIconPath } = await import('../tray.js');
    const p = pickIconPath('green');
    expect(path.isAbsolute(p)).toBe(true);
    expect(p).toContain(path.join('web.ui', 'backend', 'assets'));
  });
});

describe('tray.js — startTray', () => {
  it('constructs systray2 exactly once with the 5-item menu in spec order', async () => {
    const { startTray } = await import('../tray.js');
    const tray = await startTray();
    expect(mockState.instances).toHaveLength(1);
    expect(tray).toBe(mockState.instances[0]);
    const titles = tray.opts.menu.items.map((i) => i.title);
    expect(titles).toEqual([
      'Open dashboard',
      'Pause Pinterest queue',
      'Pause reminders',
      'Restart server',
      'Quit',
    ]);
    tray._pollHandle && clearInterval(tray._pollHandle);
  });

  it('registers a click handler', async () => {
    const { startTray } = await import('../tray.js');
    const tray = await startTray();
    expect(typeof tray._clickListener).toBe('function');
    tray._pollHandle && clearInterval(tray._pollHandle);
  });

  it('passes an icon (base64 string) matching the current trayColor', async () => {
    // Force red.
    setWorkerHeartbeat('kdp');
    setWorkerError('kdp', 'boom');
    const { startTray } = await import('../tray.js');
    const tray = await startTray();
    expect(typeof tray.opts.menu.icon).toBe('string');
    expect(tray.opts.menu.icon.length).toBeGreaterThan(0);
    // Stash the chosen color via the side-channel that the implementation
    // exposes for the poll loop test below.
    expect(tray._lastColor).toBe('red');
    tray._pollHandle && clearInterval(tray._pollHandle);
  });

  it('re-evaluates icon color on a poll interval and updates the systray when color changes', async () => {
    vi.useFakeTimers();
    setWorkerHeartbeat('kdp');
    const { startTray } = await import('../tray.js');
    const tray = await startTray();
    expect(tray._lastColor).toBe('green');

    // Flip to red.
    setWorkerError('kdp', 'boom');
    // Advance past the poll interval.
    await vi.advanceTimersByTimeAsync(11_000);

    expect(tray._lastColor).toBe('red');
    expect(tray.sendAction).toHaveBeenCalled();
    // At least one update-menu action should have been sent with the red icon.
    const calls = tray.sendAction.mock.calls.map((c) => c[0]);
    expect(calls.some((a) => a.type === 'update-menu' || a.type === 'update-menu-and-item')).toBe(true);

    tray._pollHandle && clearInterval(tray._pollHandle);
  });

  it('invokes the supplied callbacks when menu items are clicked', async () => {
    const cbs = {
      onOpenDashboard: vi.fn(),
      onPausePinterest: vi.fn(),
      onPauseReminders: vi.fn(),
      onRestartServer: vi.fn(),
      onQuit: vi.fn(),
    };
    const { startTray } = await import('../tray.js');
    const tray = await startTray(cbs);

    // Simulate clicks by seq_id (the order matches menu items above).
    tray._clickListener({ seq_id: 0, type: 'clicked' });
    tray._clickListener({ seq_id: 1, type: 'clicked' });
    tray._clickListener({ seq_id: 2, type: 'clicked' });
    tray._clickListener({ seq_id: 3, type: 'clicked' });
    tray._clickListener({ seq_id: 4, type: 'clicked' });

    expect(cbs.onOpenDashboard).toHaveBeenCalledTimes(1);
    expect(cbs.onPausePinterest).toHaveBeenCalledTimes(1);
    expect(cbs.onPauseReminders).toHaveBeenCalledTimes(1);
    expect(cbs.onRestartServer).toHaveBeenCalledTimes(1);
    expect(cbs.onQuit).toHaveBeenCalledTimes(1);

    tray._pollHandle && clearInterval(tray._pollHandle);
  });
});
