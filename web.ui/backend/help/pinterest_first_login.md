# First-time Pinterest login

The dashboard posts pins by automating a real Chromium browser. It uses a
persistent profile stored at `web.ui/backend/.pinterest-profile/`, so you
only need to log in once — Pinterest's session cookie persists on disk
and subsequent posts run silently in the background.

## Steps

1. Open the `/pinterest` page in the dashboard.
2. In the **Settings** panel at the top, click **Sign in to Pinterest**.
3. A new Chromium window opens at `https://www.pinterest.com/login/`.
4. Complete the login normally — email + password, Google sign-in, or
   "Continue with Apple". Two-factor codes work the same as a normal
   browser login.
5. Once Pinterest redirects you to the main feed (URL becomes
   `https://www.pinterest.com/`), the Chromium window closes automatically.
6. The pin queue resumes within a minute. The tray icon returns to green.

## What gets stored

- Pinterest session cookies live inside `web.ui/backend/.pinterest-profile/`.
- This directory is gitignored — nothing is uploaded.
- Backup of this directory is included in the nightly SQLite backup tarball
  (`data/.backups/`).

## When the session expires

Pinterest typically keeps the session alive for months. If the dashboard
detects a logged-out state (page redirects to `/login`), it:

1. Pauses the entire pin queue.
2. Creates a "Pinterest re-login required" reminder (toast + email).
3. Sets the tray icon red.

Open `/pinterest` and click **Sign in to Pinterest** again. The paused
pins automatically flip back to `pending` once you resume the queue from
the Settings panel.

## Multiple accounts

This automation supports one Pinterest account at a time. To switch
accounts, log out of Pinterest in the visible Chromium window, then log
back in as the other account. The persistent profile retains whichever
session you last completed.

## Troubleshooting

- **Chromium window does not appear:** check the dashboard logs at
  `data/logs/dashboard-<date>.log`. Most commonly Playwright's bundled
  Chromium is missing — run `npx playwright install chromium` from the
  `web.ui/backend/` directory.
- **"Login required" reminder fires immediately after sign-in:** Pinterest
  may have flagged the session as suspicious. Open a normal browser, log
  in once on `pinterest.com`, complete any captcha or 2FA challenge, then
  retry the dashboard's sign-in button.
- **Pin upload fails partway through:** the dashboard marks the pin
  `failed` and tries the next pending pin. Check `/pinterest` History for
  the error message, then re-queue from the offending book's KDP detail
  page.
