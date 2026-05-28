# KDP Bookshelf Scrape via Claude for Chrome

This page tells you exactly what to ask Claude for Chrome when you want to
sync the dashboard's KDP catalog with the live state on
https://kdp.amazon.com/en_US/bookshelf.

## Pre-reqs

1. The dashboard backend is running locally on port 5000
   (`npm start` in `web.ui/backend`).
2. You are logged into KDP in your Chrome browser and have the bookshelf
   page open.
3. The Claude for Chrome extension is active on that tab.

## The prompt

Paste this into Claude for Chrome on the bookshelf tab:

> Scrape every book on this KDP bookshelf page. For each book, capture:
> - the ASIN (typically a `B0`-prefixed 10-character code visible in the link or row),
> - the verbatim title text exactly as KDP displays it,
> - the verbatim status label — one of "Live", "In Review", "Draft", "Blocked", or "Unpublished",
> - the format — one of "Paperback", "Kindle eBook", or "Hardcover".
>
> Then POST the result as JSON to http://localhost:5000/api/kdp/ingest-bookshelf with this shape:
> ```
> {
>   "books": [
>     {"asin": "B0CXXXXXXX", "kdp_title": "...", "kdp_status": "Live", "format": "Paperback"},
>     ...
>   ]
> }
> ```
>
> Report back the `preview_id` from the response so I can review the diff in the dashboard.

## What the dashboard does next

1. POST receives the books, computes a preview, and returns:
   ```
   {
     "preview_id": "uuid",
     "matches": [...],
     "ambiguous": [...],
     "orphans": [...],
     "missing_from_kdp": [...]
   }
   ```
2. Open the dashboard at http://localhost:3000/kdp. A blue "Pending KDP sync"
   banner appears above the catalog table.
3. Click **Review** to open the diff modal. Resolve any ambiguous rows
   (where two dashboard slugs share a normalized title), opt into creating
   dashboard entries for orphans (books on KDP that aren't in the dashboard
   yet), then click **Apply**.
4. Matched rows get their ASIN, KDP status, and title updated. Confirmed
   orphans become new `kdp_books` rows. Skipped rows are counted but not
   modified.

Previews expire after 30 minutes in memory; if the dashboard backend
restarts mid-review, just re-run the scrape.

## Why this exists

The dashboard's local `kdp_books` table has every book's local-build state
(title, page count, price, cover) but no link to the live KDP product. This
workflow uses your existing browser session against KDP (via Claude for
Chrome) as the data source — no KDP API key, no OAuth, no scraper
authentication of our own.

See [`docs/superpowers/specs/2026-05-27-kdp-bookshelf-scraper-design.md`](superpowers/specs/2026-05-27-kdp-bookshelf-scraper-design.md)
for the full design.
