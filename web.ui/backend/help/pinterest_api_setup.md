# Pinterest API Setup

The dashboard posts to Pinterest via the official v5 API. You provide
credentials once in .env.local; the dashboard handles token refresh
automatically every 30 days.

## Required env vars

Add to `.env.local` at the repo root:

```
PINTEREST_ACCESS_TOKEN=<paste from Pinterest dev portal>
PINTEREST_REFRESH_TOKEN=<paste from Pinterest dev portal>
PINTEREST_APP_ID=1572111
PINTEREST_APP_SECRET=<paste from Pinterest dev portal>
PINTEREST_DEFAULT_BOARD_ID=<optional; auto-detected if missing>
```

## Where to get these

1. Visit https://developers.pinterest.com/apps/
2. Open your app (Pocket Rooster Press Pin Bot)
3. Under "Configuration":
    - App ID is shown at the top — that's `PINTEREST_APP_ID`
    - "App secret key" — that's `PINTEREST_APP_SECRET`
4. Under "Trial access":
    - "Generate access token" → that's `PINTEREST_ACCESS_TOKEN`
    - The refresh token is returned alongside — that's `PINTEREST_REFRESH_TOKEN`
5. Restart the dashboard (Quit + relaunch from the tray menu)

## Verifying

Open /pinterest in the dashboard, scroll to Settings. The status chip
should say "✓ Connected" once both the token is fresh and a default board
is selected. Click "Test connection" to confirm — the panel will show
`Connected as @<your-handle>`.

If no default board has been picked yet, the chip stays amber
("⚠ Board not selected") and a yellow banner prompts you to choose one
from the dropdown. The selection persists locally so the poster knows
where to publish.

## When the refresh fails

If the dashboard banner says "Pinterest refresh token expired", that
means it's been more than a year since you generated the tokens (or
Pinterest revoked them). Regenerate from the dev portal and re-paste
into .env.local, then restart the dashboard.
