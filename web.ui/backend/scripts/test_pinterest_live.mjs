#!/usr/bin/env node
/**
 * Plan E Task 20 — manual end-to-end test against the REAL Pinterest.
 *
 * WARNING: this script ACTUALLY POSTS A PIN to your live Pinterest
 * account. It is NOT run in CI. Only invoke it by hand after you have:
 *
 *   1. Run the dashboard at least once.
 *   2. Completed a Pinterest sign-in via the /pinterest "Sign in to
 *      Pinterest" button so `web.ui/backend/.pinterest-profile/` holds
 *      a valid session cookie.
 *   3. Confirmed at least one row in pinterest_queue is status='pending'
 *      with an existing image_path on disk and a scheduled_for in the past.
 *
 * Usage:
 *
 *   cd web.ui/backend
 *   PINTEREST_LIVE=1 npm run test:pinterest:live
 *
 * What it does:
 *
 *   - Refuses to run unless `PINTEREST_LIVE=1` is set in the environment.
 *   - Calls `runOnce()` with the default (real Playwright) driver factory.
 *   - Prints the JSON result so you can see action / queueId / pinId.
 *   - Exits 0 on a successful post or an idle queue.
 *   - Exits 1 on a 'failed' or 'paused_login_required' action — the error
 *     message tells you whether the session expired (re-login required) or
 *     a Pinterest UI selector needs updating in pinterest/poster.js.
 *
 * The script catches any unexpected exception (e.g. Chromium not installed)
 * and reports it gracefully on stderr rather than crashing with a stack
 * trace; that way an operator running this on a fresh machine knows
 * exactly what to fix.
 */

import process from 'node:process';

if (process.env.PINTEREST_LIVE !== '1') {
  // eslint-disable-next-line no-console
  console.error(
    'Refusing to run against real Pinterest without PINTEREST_LIVE=1',
  );
  process.exit(2);
}

try {
  const { runOnce } = await import('../pinterest/poster.js');
  const result = await runOnce();
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(result, null, 2));
  if (result.action === 'failed' || result.action === 'paused_login_required') {
    process.exit(1);
  }
  process.exit(0);
} catch (err) {
  const msg = err?.message || String(err);
  // eslint-disable-next-line no-console
  console.error('Live Pinterest test crashed before runOnce returned:');
  // eslint-disable-next-line no-console
  console.error(`  ${msg}`);
  if (/Executable doesn't exist|playwright install/i.test(msg)) {
    // eslint-disable-next-line no-console
    console.error(
      '\nHint: Playwright Chromium is missing. From web.ui/backend run:',
    );
    // eslint-disable-next-line no-console
    console.error('  npx playwright install chromium');
  }
  process.exit(1);
}
