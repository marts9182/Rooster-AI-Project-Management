# Pinterest Autonomous Feature — Dashboard Design

**Date:** 2026-05-29
**Status:** Draft for review

## Goal

Make the dashboard's Pinterest feature actually autonomous and useful: keep at least 30 days of pending pins queued at all times for every published KDP book, show the upcoming schedule on a calendar grid you can scan in seconds, and surface real cadence + engagement metrics on the History view. Today the infrastructure (queue table, poster worker, scheduler, generator, page) all exists but pin generation is a one-shot per KDP publish event and the schedule is a flat table that doesn't read as a calendar.

## Background

The dashboard already has, from prior plans:

- `pinterest_queue` + `pinterest_history` tables.
- [`pinterest/poster.js`](../../web.ui/backend/pinterest/poster.js) — autonomous worker that dequeues a due pending row and posts via the Pinterest v5 API.
- [`pinterest/scheduler.js`](../../web.ui/backend/pinterest/scheduler.js) — pure scheduler that jitters timestamps within a configurable window (3–5/day default).
- [`pinterest/generator.js`](../../web.ui/backend/pinterest/generator.js) — renders PNGs from templates + a palette swap.
- [`Pinterest.tsx`](../../web.ui/frontend-react/src/pages/Pinterest.tsx) — page with Settings, Queue (flat table), and History (flat table) sections.
- KDP `mark-published` auto-enqueues 6 pins (cover_hero + 5 themed) per book.

What's missing: a top-up loop, a calendar visualization, and engagement metrics.

## Section 1 — Continuous pin generation backlog

### New worker

`web.ui/backend/pinterest/topup.js` exports `runOnce({db, emit, generatorFn?, schedulerFn?})`. The worker file also exports `startTopupWorkerDefault({db, emit, intervalMs?})` (mirroring the Etsy worker pattern at `etsy/worker.js`).

**Gating in server.js boot:** identical to the Etsy and existing Pinterest poster — `PORT !== 0 && process.env.ROOSTER_SKIP_PINTEREST_TOPUP !== '1' && pinterestConfigured()`. Default interval: 6 hours. `ROOSTER_SKIP_PINTEREST_TOPUP=1` disables.

### `runOnce` algorithm

1. Read the topup config from env:
   - `PINTEREST_TOPUP_DAYS_RUNWAY` (default `30`).
   - `PINTEREST_TOPUP_PER_DAY_PER_BOOK` (default `0.5`).
   - Target pending per book = `Math.ceil(DAYS_RUNWAY × PER_DAY_PER_BOOK)`. With defaults: 15.
2. Query published books and their queued-but-not-posted pin counts:
   ```sql
   SELECT b.id, b.slug, b.title,
          COUNT(q.id) FILTER (WHERE q.status IN ('pending','paused','posting')) AS pending_count
   FROM kdp_books b
   LEFT JOIN pinterest_queue q ON q.kdp_book_id = b.id
   WHERE b.status='published'
   GROUP BY b.id
   ```
   (Counting `paused` and `posting` toward `pending_count` is intentional — a fully queued book whose pins are paused should not get more pins generated on top.)
3. For each book where `pending_count < target`:
   - Compute `need = target - pending_count`.
   - Generate `need` pin specs by **cycling through the 6 existing pin types** with parameter variation: palette swap from `palette.js`, slight layout offset (in-template via a `variant` integer 0..N), tagline rotation from a per-book pool (read from `kdp_books.notes` JSON if present; falls back to a generic per-book template if not). Before persisting a spec, compute a uniqueness key = `sha256(book_id|pin_type|variant|palette_seed|tagline_idx).slice(0,16)` and check it against the last 60 days of `pinterest_queue` + `pinterest_history` (a new `uniqueness_hash` column added to both tables in the same migration). If the key collides, advance one parameter and re-compute until a fresh key is found.
   - Run each spec through the existing `generator.js` → PNG path.
   - Run each through `scheduler.js` to get a `scheduled_for` ISO that respects the existing 3–5/day window. The scheduler is given the current queue so it doesn't re-collide.
   - Insert `pinterest_queue` rows: `status='pending'`, populated `kdp_book_id`, `pin_type`, `image_path`, `title`, `description`, `link_url`, `scheduled_for`.
4. Emit `pinterest:topup-tick` event with `{books_topped_up: N, pins_generated: M}` for the SSE bus.
5. Call `setWorkerHeartbeat('pinterest.topup')`. On any thrown error: `setWorkerError('pinterest.topup', message)`.

### Parameter variation: how "remix" works

The generator takes a spec `{book, pin_type, variant, palette_seed, tagline_idx}`. The 6 base pin types stay the same; we vary:

- `variant: 0..3` — small layout offset (`+/- 12px` on title position; one of 4 stable layouts per type).
- `palette_seed: 0..6` — picks one of 7 palette swaps already defined in `palette.js`.
- `tagline_idx: 0..N` — index into a per-book tagline pool. Default pool: 8 generic templates ("Print and play instantly", "Perfect for travel", etc.). Per-book override via `kdp_books.notes` JSON field `{pin_taglines: [...]}`.

Combined: 6 types × 4 variants × 7 palettes × 8 taglines = 1344 distinct visual specs per book. More than enough headroom for years of pins from one book.

### Tests

`web.ui/backend/__tests__/pinterest/topup.test.js`:
1. `runOnce` skips books that aren't published.
2. `runOnce` skips published books already at the target.
3. `runOnce` generates exactly `need` rows for under-target books.
4. Generated rows have `status='pending'`, valid `kdp_book_id`, `scheduled_for`, and non-empty `image_path`.
5. Two consecutive `runOnce` calls don't double-generate (idempotent against current state).
6. On generator failure for one book, other books still process; error surfaces in worker status.

### Settings UI

The existing `<PinterestSettings />` panel gets one new read-only status block (no editable controls in v1):

```
┌─ Auto-generate fresh pins ─────────────────────────┐
│ Target runway:           30 days                    │
│ Top-up worker last ran:  3 hours ago                │
│ Next run:                in 2h 47m                   │
│                                                     │
│ To change runway: edit PINTEREST_TOPUP_DAYS_RUNWAY  │
│ in <repo-root>/.env.local and restart the backend.  │
└─────────────────────────────────────────────────────┘
```

Configuration is env-only in v1 (matches how `ETSY_KEYSTRING` and the other Pinterest tuning vars work). No DB-backed settings table, no env-file mutation from the UI. The last-ran timestamp comes from `getAllStatuses()['pinterest.topup']`. Next-run is derived as `last_success_at + intervalMs`. The runway value is read from the same env var the worker reads.

Disabling the worker entirely is the existing `ROOSTER_SKIP_PINTEREST_TOPUP=1` flag — also env-only.

## Section 2 — Calendar / timeline view of upcoming pins

### Layout

The existing `<PinterestQueueTable />` is moved behind a view-mode toggle. Default view is **Week**:

```
┌─ Pinterest — Upcoming ──────────────────────────────────┐  [Week] [Month] [List]
│                                                         │
│         Mon 5/28   Tue 5/29   Wed 5/30   Thu 5/31  ...  │
│ ──────  ─────────  ─────────  ─────────  ─────────  ─── │
│  9 AM   ◐ travel   ◐ kakuro              ◐ herbs        │
│ 12 PM              ◐ herbs    ◐ mushrm   ◐ kakuro       │
│  3 PM   ◐ sudoku   ◐ mushrm              ◐ sudoku       │
│  6 PM                                    ◐ herbs        │
└─────────────────────────────────────────────────────────┘
```

- **Rows:** 4 fixed slot buckets at 3-hour intervals (`9 AM`, `12 PM`, `3 PM`, `6 PM`) covering the default 9 AM–9 PM window.
- **Columns:** 7 days starting today (Mon–Sun visually, but rolling from today).
- **Cells:** colored circular chips with a 6-char book slug abbreviation. Color comes from `bookColor(slug)` — pure hash → HSL.

### Behavior

- **Hover a chip:** tooltip with full title + pin type + exact scheduled time + post status.
- **Click a chip:** opens existing `<PinPreviewModal />` with PNG preview + inline edit (the same controls already in the list view).
- **Empty cells** are rendered muted so cadence gaps are visible.
- **Status visual treatment on chips:**
  - `pending` → solid fill.
  - `paused` → diagonal-striped fill.
  - `posting` → pulsing (CSS keyframe).
  - `failed` → red outline, clickable to retry or cancel.

### Month view

The same grid but compressed to a 5-row month layout. Each day cell shows the count badge (e.g., `4`) and up to 3 chip dots inline. Click a day → switches to week view focused on that day.

### List view

The existing table verbatim, unchanged. Inline edit works there.

### State persistence

View mode (`week|month|list`) stored in `localStorage` under `pinterest_view_mode`. Defaults to `week`. The toggle is a three-button pill in the page header.

### Files

- New: `web.ui/frontend-react/src/components/PinterestCalendar.tsx` — grid + slot layout, props `{rows: PinterestQueueRow[], onChipClick: (row) => void}`.
- New: `web.ui/frontend-react/src/components/PinterestCalendarChip.tsx` — single chip + tooltip.
- New: `web.ui/frontend-react/src/components/PinterestViewToggle.tsx` — the three-button pill.
- New: `web.ui/frontend-react/src/lib/bookColor.ts` — pure helper, `bookColor(slug) → string` (HSL).
- Modify: `web.ui/frontend-react/src/pages/Pinterest.tsx` — read view mode from localStorage; render calendar/month/list per mode.
- Modify: `web.ui/frontend-react/src/styles/shell.css` — append calendar + chip rules.

No backend changes. Calendar reads `listQueue()` (already exists). All grouping/binning is client-side.

### Tests

`web.ui/frontend-react/src/components/__tests__/PinterestCalendar.test.tsx`:
1. Renders 7 day columns starting today.
2. Places a chip in the correct slot row based on `scheduled_for` time.
3. Click on a chip fires `onChipClick` with the row.
4. Empty cells render muted (assertion on a class or aria-label).

`web.ui/frontend-react/src/components/__tests__/PinterestCalendarChip.test.tsx`:
1. Status visual variants: pending/paused/posting/failed each produce a distinct className.
2. Tooltip shows title + pin_type + scheduled time on hover.

`web.ui/frontend-react/src/lib/__tests__/bookColor.test.ts`:
1. Same slug always returns same HSL.
2. Two different slugs return different HSL.
3. Output is a valid CSS HSL string.

## Section 3 — Richer history view (analytics)

### Three tabs on the History section

The existing flat history table becomes the default "Recent" tab. Two new tabs:

#### Recent (default)

The existing `<PinterestHistoryTable />`, unchanged. Quick debug view; last 100 attempts.

#### Cadence

30-day stacked bar chart:

```
Posted N over 30d · M% success · ~K/day vs target 4/day
┌─────────────────────────────────────────────────────────┐
│   ▇    ▇       ▇▇   ▇    ▇▇   ▇▇       ▇   ▇▇    ▇    ▇│  posted (green)
│   ▆            ▆    ▆         ▆            ▆           │  failed (red, stacked)
│ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ │  target line: 4
│ Apr 30   May 6   May 13   May 20   May 27   ...        │
└─────────────────────────────────────────────────────────┘
```

- X-axis: each of last 30 days.
- Stacked bars: `posted` (green) + `failed` (red).
- Horizontal target line at the scheduler's daily target (`4` by default).
- One-line summary above: `"Posted N over 30 days · M% success · ~K/day vs target T/day"`.
- Click a bar → shows the rows for that day inline below the chart.

#### Per-pin engagement

Table of last 50 successfully posted pins:

| Pin (thumb) | Book        | Posted   | Saves | Clicks | Impressions | Link |
|-------------|-------------|----------|-------|--------|-------------|------|
| 64px PNG    | travel-v1   | 5/27     | 12    | 3      | 287         | →    |
| 64px PNG    | sudoku-v2   | 5/26     | —     | —      | —           | →    |

Thumbnails come from `pinterest_history.image_path` (already on disk). `—` is shown when the engagement fetcher hasn't successfully populated the columns yet.

### Engagement fetcher (new backend worker)

`web.ui/backend/pinterest/engagement.js` exports `runOnce({db, apiClient})` and `startEngagementWorkerDefault({...})`. Default interval: 12 hours. Same gating as the poster.

**`runOnce` behavior:**

1. Select up to 200 rows from `pinterest_history` where:
   - `pinterest_pin_id IS NOT NULL`
   - `posted_at` is within the last 30 days
   - (`engagement_fetched_at` IS NULL OR `engagement_fetched_at` < `now - 12 hours`)
2. For each row, call `apiClient.getPinAnalytics(pin_id)`. The API client method wraps `GET /v5/pins/{pin_id}/analytics`.
3. If the response is `2xx`, update the row's `saves`, `clicks`, `impressions`, `engagement_fetched_at`.
4. If the response is `401/403`: log once at WARN level, set `engagement_fetched_at = now` on the row to skip it next cycle, set a process-local `engagementDisabled = true` flag, and **fast-exit the run**. Future runs check this flag at startup and short-circuit if true.
5. On any other error per row: log + continue with the next row.
6. `setWorkerHeartbeat('pinterest.engagement')` on success; `setWorkerError(...)` on the catch-all.

### Schema migration

`web.ui/backend/migrations/0005_pinterest_engagement_uniqueness.sql`:

```sql
-- Migration 0005 — engagement metrics + variant-uniqueness hash for Pinterest pins.
-- Spec: docs/superpowers/specs/2026-05-29-pinterest-autonomous-feature-design.md §§1, 3

ALTER TABLE pinterest_history ADD COLUMN saves INTEGER;
ALTER TABLE pinterest_history ADD COLUMN clicks INTEGER;
ALTER TABLE pinterest_history ADD COLUMN impressions INTEGER;
ALTER TABLE pinterest_history ADD COLUMN engagement_fetched_at TEXT;

ALTER TABLE pinterest_queue   ADD COLUMN uniqueness_hash TEXT;
ALTER TABLE pinterest_history ADD COLUMN uniqueness_hash TEXT;
CREATE INDEX IF NOT EXISTS idx_pinterest_queue_uniqueness   ON pinterest_queue(uniqueness_hash);
CREATE INDEX IF NOT EXISTS idx_pinterest_history_uniqueness ON pinterest_history(uniqueness_hash);
```

### Routes

`web.ui/backend/pinterest/routes.js` gets two new endpoints:

- `GET /api/pinterest/cadence?days=30` — returns
  ```json
  {
    "days": 30,
    "target_per_day": 4,
    "buckets": [
      {"date": "2026-05-27", "posted": 4, "failed": 1},
      ...
    ],
    "summary": {"posted": 95, "failed": 12, "success_rate": 0.888, "avg_per_day": 3.6}
  }
  ```

- `GET /api/pinterest/engagement?limit=50` — returns
  ```json
  {
    "rows": [
      {
        "history_id": 123,
        "image_path": "...",
        "book_slug": "travel-sudoku-v1",
        "posted_at": "...",
        "saves": 12, "clicks": 3, "impressions": 287,
        "pinterest_url": "https://pinterest.com/pin/...",
        "engagement_available": true
      }
    ],
    "engagement_disabled": false
  }
  ```

  `engagement_disabled: true` when the worker has hit a 401/403 and stopped fetching; the UI shows a banner explaining the limitation.

### Frontend

- Modify: `web.ui/frontend-react/src/api/pinterest.ts` — add `getCadence(days=30)` and `getEngagement(limit=50)`.
- New: `web.ui/frontend-react/src/components/PinterestHistoryTabs.tsx` — three-tab strip.
- New: `web.ui/frontend-react/src/components/PinterestCadenceChart.tsx` — inline SVG stacked bar chart, no chart library.
- New: `web.ui/frontend-react/src/components/PinterestEngagementTable.tsx` — the analytics table.
- Modify: `web.ui/frontend-react/src/pages/Pinterest.tsx` — replace the inline `<PinterestHistoryTable />` mount with `<PinterestHistoryTabs />` that defaults to "Recent".

### Tests

Backend:
- `web.ui/backend/__tests__/pinterest/engagement.test.js` — 401 disables the worker, 200 populates the row, idempotent on repeat runs within 12h window, error on one row doesn't kill the batch.
- `web.ui/backend/__tests__/pinterest/routes.test.js` extension — cadence returns 30 buckets with correct counts; engagement returns the shape; `engagement_disabled` flag flows through.

Frontend:
- `PinterestCadenceChart.test.tsx` — renders 30 bars from sample data, target line at correct y-coordinate, click a bar fires onSelect.
- `PinterestEngagementTable.test.tsx` — renders thumbnails, shows `—` for null engagement columns, banner appears when `engagement_disabled` is true.
- `PinterestHistoryTabs.test.tsx` — default tab is Recent, clicking each tab swaps the active panel, localStorage persists last selected tab.

## Out of scope (explicit)

- Multi-account Pinterest support — single account only.
- A/B testing pin variants — engagement view shows raw numbers, not statistical comparison.
- Automatic boost/promote of high-engagement pins — no paid features.
- Posting to other social networks — Pinterest only.
- Manual pin upload through the dashboard — keep the existing model where pins are generated, not user-uploaded.
- Bulk-regenerate-all UI — top-up is the only generation flow.
- Cross-book pin reuse / dedupe — every pin is single-use.

## Risks

- **Pinterest analytics endpoint may 401/403 in trial mode.** Mitigated above — the worker disables itself on first 401/403, the UI degrades to "—" with an explanatory banner. Cadence and Recent views work regardless.
- **Top-up over-generates for paused books.** The pending-count query in §1 step 2 counts ALL non-posted rows (`pending`, `paused`, `posting`) toward the target — so a book that's fully queued but paused still reads as "at target" and won't get topped up further. The published+paused combination is the user's call to manage.
- **Calendar with many chips.** Week view caps at 4 × 7 = 28 chip cells, manageable. Month view aggregates to counts above 3 chips per day.
- **Variant remix collisions.** The uniqueness hash in §1 step 3 (sha256-derived 16-char key on `(book_id, pin_type, variant, palette_seed, tagline_idx)`) prevents re-generating the exact same spec used in the last 60 days. The hash is stored on both `pinterest_queue` and `pinterest_history` rows via a new `uniqueness_hash` column added in the migration.
