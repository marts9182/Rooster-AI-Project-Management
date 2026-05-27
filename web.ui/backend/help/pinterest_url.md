# Your Pinterest profile URL

This is the public URL for your Pinterest profile. The dashboard surfaces
it on the Profile page and uses it for deep-linking pin attribution back
to your account. (For the actual Pinterest **posting** automation, see
the separate `/pinterest` page — that uses a Playwright browser session,
not this URL.)

## How to find it

1. Sign in to <https://www.pinterest.com>.
2. In the top-right corner, click your **avatar** (the round profile
   image, not the bell or the chat icon).
3. From the dropdown menu, click **View profile** (some accounts show
   this as **Your profile** or the username itself).
4. You land on your public profile page. Copy the URL from the address
   bar — it looks like `https://www.pinterest.com/yourname/`.

If you set a custom username under **Settings → Edit profile →
Username**, your URL uses that handle. If you never set one, Pinterest
falls back to a numeric ID like `https://www.pinterest.com/123456789/`.

Paste the URL into the **Pinterest URL** field on the Profile page and
click **Save**. Trailing slashes are fine; the dashboard stores the
value as-is.

_TODO: drop a screenshot at `web.ui/backend/help/screenshots/pinterest_url.png`._
