/**
 * One-time visible Pinterest login helper.
 *
 * Surfaces from the dashboard's "Sign in to Pinterest" button. Launches a
 * HEADED Chromium window pointed at the persistent profile dir, navigates
 * to the login page, waits until the user reaches the home feed (the
 * `successUrlRegex`), then closes. The persistent profile retains the
 * authenticated cookies on disk for subsequent headless posting runs.
 *
 * Production callers MUST run with headless: false so the user can see the
 * window and type credentials. Tests inject a fake `playwrightChromium`
 * object so no real browser launches.
 *
 * @module pinterest/login
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Default location for the persistent Chromium profile dir. Gitignored.
 *
 * @returns {string}
 */
export function defaultProfileDir() {
  return path.resolve(__dirname, '..', '.pinterest-profile');
}

/**
 * @typedef {Object} VisibleLoginInput
 * @property {string} [profileDir]                Defaults to web.ui/backend/.pinterest-profile/.
 * @property {{ launchPersistentContext: Function }} [playwrightChromium]  Real Playwright by default; tests inject fakes.
 * @property {string} [loginUrl]                  Defaults to Pinterest login.
 * @property {RegExp} [successUrlRegex]           Defaults to /pinterest\.com\/?$/.
 * @property {number} [timeoutMs]                 Default 5 minutes.
 */

/**
 * @param {VisibleLoginInput} [input]
 * @returns {Promise<void>}
 */
export async function runVisibleLogin(input = {}) {
  const dir = input.profileDir ?? defaultProfileDir();
  const loginUrl = input.loginUrl ?? 'https://www.pinterest.com/login/';
  const successUrlRegex = input.successUrlRegex ?? /pinterest\.com\/?$/;
  const timeoutMs = input.timeoutMs ?? 5 * 60 * 1000;

  fs.mkdirSync(dir, { recursive: true });

  const browser = input.playwrightChromium ?? (await loadRealChromium());

  const context = await browser.launchPersistentContext(dir, {
    headless: false,
    viewport: { width: 1280, height: 800 },
  });
  try {
    const pages = context.pages();
    const page = pages.length > 0 ? pages[0] : await context.newPage();
    await page.goto(loginUrl);
    await page.waitForURL(successUrlRegex, { timeout: timeoutMs });
  } finally {
    await context.close();
  }
}

/**
 * Lazy import so tests never need playwright installed at module-load time.
 *
 * @returns {Promise<{launchPersistentContext: Function}>}
 */
async function loadRealChromium() {
  const { chromium } = await import('playwright');
  return chromium;
}
