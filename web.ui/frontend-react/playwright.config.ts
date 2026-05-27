import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright config for end-to-end tests of the Publishing Ops Dashboard.
 *
 * The webServer block boots the Express backend (which also serves the
 * Vite build output from `dist/`) on port 5000. Tests then drive the
 * browser against that real server.
 *
 * Pre-requisites for local runs:
 *   - `npm run build` in this directory so `dist/` exists.
 *   - Playwright Chromium installed: `npx playwright install chromium`.
 */
export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://127.0.0.1:5000',
    headless: true,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: 'node ../backend/server.js',
        url: 'http://127.0.0.1:5000/api/status',
        timeout: 60_000,
        reuseExistingServer: !process.env.CI,
        env: {
          PORT: '5000',
          ROOSTER_DB_PATH: './data/dashboard-e2e.db',
          ROOSTER_SKIP_TRAY: '1',
          ROOSTER_SKIP_KDP_SCANNER: '1',
          ROOSTER_E2E: '1',
          NODE_ENV: 'test',
        },
      },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
