/**
 * systray2 wiring. Started after Express is listening and after openDb() +
 * startBackupCron(). Owns the tray icon's color state (driven by
 * workerStatus.trayColor()) and the 5-item right-click menu:
 *
 *   0. Open dashboard          → opens http://127.0.0.1:PORT in default browser
 *   1. Pause Pinterest queue   → emits pinterest:queue-paused event (Plan E poster honors it)
 *   2. Pause reminders         → emits reminders:paused event
 *   3. Restart server          → process.exit(0); Task Scheduler will not auto-restart
 *                                unless a supervisor wraps node; documented in plan.
 *   4. Quit                    → process.exit(0)
 *
 * Icon updates: every POLL_INTERVAL_MS we re-evaluate trayColor() and, if it
 * has changed, send an update-menu action with the new base64-encoded PNG.
 *
 * systray2 v2.x API (per node_modules/systray2/index.d.ts):
 *   - default export = SysTray class
 *   - new SysTray({menu: {icon, title, tooltip, items}, debug, copyDir})
 *   - tray.onClick(listener) → Promise<this>
 *   - tray.ready() → Promise<void>
 *   - tray.sendAction({type: 'update-menu', menu}) → Promise<this>
 *   - tray.kill(exitNode=true) — pass false to keep the node process alive
 */

import SysTray from 'systray2';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { exec } from 'node:child_process';
import { trayColor } from './workerStatus.js';
import { logger } from './logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ASSETS = path.resolve(__dirname, 'assets');

/** How often to re-evaluate trayColor and update the icon if changed. */
const POLL_INTERVAL_MS = 10_000;

/**
 * Resolve the absolute path to the PNG icon for the given color. If `color`
 * is omitted, derive it from workerStatus.trayColor().
 *
 * @param {'green'|'yellow'|'red'} [color]
 * @returns {string}
 */
export function pickIconPath(color) {
  const c = color ?? trayColor();
  return path.join(ASSETS, `tray-${c}.png`);
}

/** Default click handlers (used when a callback is not supplied by caller). */
function defaultHandlers() {
  return {
    onOpenDashboard: () => {
      const port = process.env.PORT && process.env.PORT !== '0' ? process.env.PORT : 5000;
      const url = `http://127.0.0.1:${port}`;
      if (process.platform === 'win32') {
        // `start` is a cmd built-in; the quoted empty first arg is the window
        // title slot, which keeps the URL from being parsed as the title.
        exec(`cmd /c start "" "${url}"`);
      } else if (process.platform === 'darwin') {
        exec(`open "${url}"`);
      } else {
        exec(`xdg-open "${url}"`);
      }
    },
    onPausePinterest: async () => {
      // Lazy-import to avoid pulling the DB into the tray module's import
      // graph (and to keep tests that don't open a DB happy).
      const { recordEvent } = await import('./events.js');
      recordEvent('pinterest:queue-paused', { source: 'tray' });
      logger.info('tray: pinterest:queue-paused emitted');
    },
    onPauseReminders: async () => {
      const { recordEvent } = await import('./events.js');
      recordEvent('reminders:paused', { source: 'tray' });
      logger.info('tray: reminders:paused emitted');
    },
    onRestartServer: () => {
      logger.info('tray: restart-server clicked — exiting with code 0');
      // Note: bare `node server.js` will NOT auto-restart. If autostart was
      // installed via scripts/install-autostart.ps1 (a logon trigger), the
      // process stays exited until next logon. For true restart-on-exit, the
      // user must wrap node in a supervisor (nssm, pm2-windows-service, etc.).
      process.exit(0);
    },
    onQuit: () => {
      logger.info('tray: quit clicked');
      process.exit(0);
    },
  };
}

/**
 * Start the tray icon and return the systray2 instance. Resolves once the
 * helper binary is ready. Caller may supply custom click handlers to override
 * the defaults.
 *
 * @param {{
 *   onOpenDashboard?: () => void,
 *   onPausePinterest?: () => void,
 *   onPauseReminders?: () => void,
 *   onRestartServer?: () => void,
 *   onQuit?: () => void,
 * }} [callbacks]
 * @returns {Promise<import('systray2').default>}
 */
export async function startTray(callbacks = {}) {
  const handlers = { ...defaultHandlers(), ...callbacks };

  let lastColor = trayColor();
  const iconB64 = fs.readFileSync(pickIconPath(lastColor)).toString('base64');

  const menu = {
    icon: iconB64,
    title: 'Rooster Dashboard',
    tooltip: 'Publishing Ops Dashboard',
    items: [
      { title: 'Open dashboard',        tooltip: 'Open http://127.0.0.1:5000', checked: false, enabled: true },
      { title: 'Pause Pinterest queue', tooltip: 'Emit pinterest:queue-paused', checked: false, enabled: true },
      { title: 'Pause reminders',       tooltip: 'Emit reminders:paused',       checked: false, enabled: true },
      { title: 'Restart server',        tooltip: 'Exit process (no auto-respawn unless supervised)', checked: false, enabled: true },
      { title: 'Quit',                  tooltip: 'Stop the dashboard',         checked: false, enabled: true },
    ],
  };

  const tray = new SysTray({
    menu,
    debug: false,
    copyDir: true,
  });

  // Click dispatcher — menu items are addressed by seq_id (insertion order).
  tray.onClick((action) => {
    if (!action || typeof action.seq_id !== 'number') return;
    try {
      switch (action.seq_id) {
        case 0: handlers.onOpenDashboard(); break;
        case 1: handlers.onPausePinterest(); break;
        case 2: handlers.onPauseReminders(); break;
        case 3: handlers.onRestartServer(); break;
        case 4: handlers.onQuit(); break;
        default:
          logger.warn({ seq_id: action.seq_id }, 'tray: unknown menu item clicked');
      }
    } catch (err) {
      logger.error({ err: err.message, seq_id: action.seq_id }, 'tray: handler threw');
    }
  });

  await tray.ready();

  // Stash for testing / for the poll loop to mutate. The systray2 type
  // doesn't model these private fields, so we treat the instance as `any`
  // for these assignments.
  /** @type {any} */
  const trayAny = tray;
  trayAny._lastColor = lastColor;

  // Re-evaluate color every POLL_INTERVAL_MS; push update only on change so
  // we don't churn the helper binary's stdin every 10s.
  const pollHandle = setInterval(() => {
    const next = trayColor();
    if (next === trayAny._lastColor) return;
    trayAny._lastColor = next;
    try {
      const nextIcon = fs.readFileSync(pickIconPath(next)).toString('base64');
      // systray2 v2 doesn't support icon-only updates for the root menu,
      // so we re-send the whole menu with the new icon. Items are unchanged
      // (Pause* labels do not flip — those are independent flags).
      tray.sendAction({
        type: 'update-menu',
        menu: { ...menu, icon: nextIcon },
      });
      logger.info({ color: next }, 'tray: icon color changed');
    } catch (err) {
      logger.warn({ err: err.message }, 'tray: failed to push icon update');
    }
  }, POLL_INTERVAL_MS);
  // Don't keep the event loop alive just for the tray poll.
  pollHandle.unref?.();
  trayAny._pollHandle = pollHandle;

  return tray;
}
