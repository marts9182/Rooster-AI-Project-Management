# KDP Bookshelf Scraper (Claude for Chrome) — Dashboard Design

**Date:** 2026-05-27
**Status:** Draft for review
**Mini-spec 3 of 3** in the dashboard-improvements brainstorm (Etsy → Plans → KDP).

## Goal

Bridge the gap between the dashboard's local KDP catalog (30 books, all `status: 'built'`, zero ASINs) and the live state on `https://kdp.amazon.com/en_US/bookshelf` by letting Claude for Chrome scrape the bookshelf and POST the result to a new dashboard ingest endpoint. First scrape acts as a one-time bootstrap that establishes ASIN ↔ slug pairings via title-normalized matching; every subsequent scrape uses straight ASIN matching.

## Background

The dashboard's `kdp_books` table has the local-build fields populated (title, price, page count, blurb, cover path) but no link to the live KDP product. There are no ASINs, no real KDP statuses, and the dashboard cannot tell published-on-KDP books apart from drafts. The user's Claude for Chrome trial gives them an authenticated browser session against KDP, which the dashboard can leverage as a data source without touching the KDP API directly (no API key flow, no OAuth — just the user's existing browser auth + Claude's DOM-reading).

## Section 1 — End-to-end flow

```
1. User opens https://kdp.amazon.com/en_US/bookshelf in their Chrome tab.
2. User asks Claude for Chrome to scrape the bookshelf and POST the result
   to http://localhost:5000/api/kdp/ingest-bookshelf.
3. The dashboard endpoint:
   - matches scraped books to dashboard slugs (ASIN-first; title-normalized fallback)
   - returns a preview payload {preview_id, matches, ambiguous, orphans, missing_from_kdp}
   - DOES NOT write to the DB yet.
4. Claude for Chrome reports "preview-id <uuid> — open /kdp to review".
5. User opens /kdp, sees a new "Pending KDP sync" banner with the diff counts.
6. User reviews matches, resolves any ambiguous rows, opts in to creating
   orphan entries, then clicks "Apply".
7. Frontend POSTs the confirmed mapping to /api/kdp/ingest-bookshelf/commit,
   which upserts ASIN + status + replaces title with the KDP title verbatim,
   creates rows for confirmed orphans, and returns counts.
```

**Why a two-step preview/commit:** auto-commit on first scrape is risky — normalized-title matching can pair the wrong books across 30 entries. After the first successful sync every book has an ASIN; subsequent runs match on ASIN only and the preview becomes a sanity check the user can apply with one click.

**Claude for Chrome's scrape payload contract:**

```json
{
  "books": [
    {
      "asin": "B0CXXXXXXX",
      "kdp_title": "Travel Sudoku, Vol. 1: 200 Easy Puzzles",
      "kdp_status": "Live",
      "format": "Paperback"
    }
  ]
}
```

- `asin` — required, non-empty.
- `kdp_title` — required, verbatim from the bookshelf list (no normalization).
- `kdp_status` — required; the verbatim KDP status label ("Live", "In Review", "Draft", "Blocked", "Unpublished").
- `format` — optional in v1, stored only on orphan creation; not used for matching (multi-format defer to later spec).

A short documentation file at `docs/kdp-bookshelf-scrape.md` describes the exact prompt to give Claude for Chrome, including the schema and POST URL.

## Section 2 — Matching, schema, commit semantics

### Schema migration

`web.ui/backend/migrations/0004_kdp_ingest.sql`:

```sql
ALTER TABLE kdp_books ADD COLUMN kdp_status_raw TEXT;
ALTER TABLE kdp_books ADD COLUMN last_scraped_at TEXT;
```

The existing `status` column (enum `built | in_review | published | archived`) stays as the dashboard's normalized field. `kdp_status_raw` is the verbatim KDP string for display + future-proofing. `last_scraped_at` is an ISO datetime; only populated by ingest commits.

### Status mapping

`web.ui/backend/kdp/status_map.js` exports `kdpToDashboardStatus(raw: string): {status: DashboardStatus, mappedFrom: string} | {ambiguous: true}`:

| KDP `kdp_status_raw` | Dashboard `status` |
|---|---|
| `Live` (case-insensitive) | `published` |
| `In Review` | `in_review` |
| `Draft` | `built` |
| `Blocked` | `archived` |
| `Unpublished` | `archived` |
| anything else | `{ambiguous: true}` — preview surfaces these for manual resolution |

### Matching algorithm

`web.ui/backend/kdp/ingest.js` exports `computeIngestPreview({db, scraped}): Preview`.

```ts
interface IngestedBook {
  asin: string;
  kdp_title: string;
  kdp_status: string;
  format?: string;
}

interface Preview {
  preview_id: string;       // UUID
  created_at: string;       // ISO; preview expires 30 min later
  matches: Array<{
    kind: 'MATCHED_BY_ASIN' | 'MATCHED_BY_TITLE';
    dashboard_slug: string;
    dashboard_title_before: string;
    scraped: IngestedBook;
    new_dashboard_status: string;     // mapped via status_map
    title_will_change: boolean;       // helper for the UI yellow-dot
    status_ambiguous: boolean;        // if status_map returned ambiguous
  }>;
  ambiguous: Array<{
    scraped: IngestedBook;
    candidate_slugs: string[];        // dashboard slugs whose normalized titles tied
  }>;
  orphans: Array<{ scraped: IngestedBook }>;
  missing_from_kdp: Array<{ dashboard_slug: string; dashboard_title: string }>;
}
```

For each scraped book:

1. **ASIN match.** If any dashboard row has `asin === scraped.asin` (case-sensitive; KDP ASINs are uppercase), return `MATCHED_BY_ASIN` with that slug.
2. **Title-normalized match.** Otherwise, build `normalizedTitle(s)` by:
   - Lowercase.
   - Replace `Vol. N`, `Vol N`, `Volume N` → `vol-N` (capture digit).
   - Strip everything after the first colon (drops subtitles).
   - Strip leading/trailing whitespace and punctuation (`.,;:!?`).
   - Collapse internal whitespace runs to a single space.
   - Replace remaining non-alphanumeric runs with a single hyphen.
   Look for dashboard rows whose normalized title equals the scraped book's normalized title.
   - Exactly one match → `MATCHED_BY_TITLE` with that slug.
   - Zero matches → `ORPHAN`.
   - Two or more matches → `AMBIGUOUS` with the candidate slugs listed.

After matching all scraped books, walk the dashboard `kdp_books` table and find rows whose slug wasn't selected by any match — those become `missing_from_kdp` (informational; no auto-action).

### Preview store

In-memory: a `Map<string, Preview>` keyed by `preview_id` lives in `web.ui/backend/kdp/preview_store.js`. Previews expire after 30 minutes (timer in the same module clears the entry; lookups also check expiry as a belt-and-suspenders guard). Restarting the backend wipes the store — acceptable; user re-runs the scrape if needed.

### Routes

`web.ui/backend/kdp/routes.js` gets three new endpoints:

- `POST /api/kdp/ingest-bookshelf`
  - Body: `{books: IngestedBook[]}`
  - Validates schema (asin/kdp_title/kdp_status are required strings; 400 with per-field errors otherwise).
  - Computes preview, stores it, returns `{preview_id, matches, ambiguous, orphans, missing_from_kdp}`.
  - When called repeatedly within the window, each call generates a new preview_id; the old one stays until expiry but only the latest is surfaced by `GET /pending`.

- `GET /api/kdp/ingest-bookshelf/pending`
  - Returns the most-recent non-expired preview, or `{preview: null}` if none.
  - Used by the dashboard's banner to detect that a sync is waiting for review.

- `POST /api/kdp/ingest-bookshelf/commit`
  - Body: `{preview_id, confirmed_orphans: string[], ambiguous_resolutions: Record<string, string | null>}`
    - `confirmed_orphans` is the list of orphan ASINs the user opted to create.
    - `ambiguous_resolutions` maps the ambiguous ASIN to the chosen dashboard slug (or `null` for "none of these — skip").
  - 404 if `preview_id` is unknown or expired.
  - For each MATCHED_BY_* row: upsert `asin`, set `kdp_status_raw`, set `status` per the map, set `last_scraped_at`, **replace `title` with `scraped.kdp_title` verbatim**.
  - For each confirmed orphan: insert a new `kdp_books` row with slug = `slugify(scraped.kdp_title)`, title = `scraped.kdp_title`, asin = `scraped.asin`, status mapped from `kdp_status`, `kdp_status_raw` and `last_scraped_at` set.
  - For ambiguous resolutions with non-null slugs: apply the same update path as MATCHED_BY_TITLE — upsert `asin`, set `kdp_status_raw`, set `status` per the map, set `last_scraped_at`, and replace `title` with `scraped.kdp_title` verbatim on that slug. With a null slug, the row is skipped and counted in `skipped`.
  - Removes the preview from the store after commit.
  - Returns `{applied: N, created: M, skipped: K, errors: Error[]}`.

## Section 3 — UI, tests, out of scope

### Banner

`web.ui/frontend-react/src/components/KdpPendingSyncBanner.tsx` mounts on `/kdp` above the catalog table. It calls `GET /api/kdp/ingest-bookshelf/pending` on mount and renders nothing when `preview === null`. When a preview is present:

```
┌─────────────────────────────────────────────────────────────────┐
│ Pending KDP sync — 27 matched, 2 ambiguous, 4 orphans     [Review] │
└─────────────────────────────────────────────────────────────────┘
```

Clicking **Review** opens `<KdpIngestReviewModal />`.

### Review modal

Four collapsible sections (collapsed-by-default state per section):

1. **Matches (N)** — Each row: `dashboard_title_before → scraped.kdp_title`, ASIN, `kdp_status_raw → new dashboard status`. A yellow dot marker when `title_will_change`. A red dot marker when `status_ambiguous`. No per-row action — matches commit as a batch.

2. **Ambiguous (N)** — Each row shows the scraped book (title + ASIN + status) and a `<select>` populated with candidate dashboard slugs plus a "— skip this — " option. The Apply button is disabled until every ambiguous row has a selection.

3. **Orphans (N)** — Each row shows scraped title, ASIN, status, and a checkbox "Create dashboard entry". Unchecked orphans are skipped. New rows use `slugify(kdp_title)` as the slug.

4. **Missing from KDP (N)** — Informational. Each row shows the dashboard slug + title. No actions; no commit-side effect.

A single **[Apply]** button at the bottom calls the commit endpoint. On success, the modal closes, the catalog table refetches, and the banner disappears (preview was consumed). On error, an inline alert renders at the bottom of the modal.

### Files touched

**Created:**
- `web.ui/backend/migrations/0004_kdp_ingest.sql`
- `web.ui/backend/kdp/status_map.js`
- `web.ui/backend/kdp/preview_store.js`
- `web.ui/backend/kdp/ingest.js`
- `web.ui/backend/__tests__/kdp/ingest.test.js`
- `web.ui/backend/__tests__/kdp/status_map.test.js`
- `web.ui/frontend-react/src/components/KdpPendingSyncBanner.tsx`
- `web.ui/frontend-react/src/components/KdpIngestReviewModal.tsx`
- `web.ui/frontend-react/src/components/__tests__/KdpIngestReviewModal.test.tsx`
- `docs/kdp-bookshelf-scrape.md` — the Claude-for-Chrome prompt + schema

**Modified:**
- `web.ui/backend/kdp/routes.js` — three new routes wired
- `web.ui/backend/__tests__/kdp/routes.test.js` — three new route test cases
- `web.ui/frontend-react/src/api/kdp.ts` — add `IngestedBook`, `IngestPreview`, `getPendingIngest`, `commitIngest` types/functions
- `web.ui/frontend-react/src/pages/KdpCatalog.tsx` — mount `<KdpPendingSyncBanner />` above the table
- `web.ui/frontend-react/src/__tests__/KdpCatalog.test.tsx` — extend to mock `/api/kdp/ingest-bookshelf/pending`

### Backend tests

`web.ui/backend/__tests__/kdp/ingest.test.js`:
1. ASIN match → returns `MATCHED_BY_ASIN`.
2. Title-normalized match (exact normalized form) → `MATCHED_BY_TITLE`.
3. Title normalization handles `Vol. 1` vs `Volume 1` vs `Vol 1` identically.
4. Two candidates with the same normalized title → `AMBIGUOUS` listing both slugs.
5. Zero candidates → `ORPHAN`.
6. Dashboard row not in scrape → `missing_from_kdp`.
7. Commit applies all MATCHED_BY_* rows (verify ASIN, status, kdp_status_raw, title, last_scraped_at all set).
8. Commit creates only confirmed orphans, not unchecked ones.
9. Commit handles ambiguous resolutions: non-null slug applies, null skips.
10. Commit removes the preview from the store after success.
11. Preview expires after 30 minutes (vitest fake timers).
12. Preview lookup after expiry returns null.

`web.ui/backend/__tests__/kdp/status_map.test.js`:
1. All five canonical KDP labels (case-insensitive) map correctly.
2. Unknown labels return `{ambiguous: true}`.

`web.ui/backend/__tests__/kdp/routes.test.js` (extend):
1. `POST /ingest-bookshelf` with valid payload returns `{preview_id, matches, ambiguous, orphans, missing_from_kdp}`.
2. `POST /ingest-bookshelf` with bad payload returns 400 with field-level errors.
3. `GET /ingest-bookshelf/pending` returns null when no preview, returns the preview otherwise.
4. `POST /ingest-bookshelf/commit` with valid preview_id and resolutions returns the counts, mutates the DB, removes the preview.
5. `POST /ingest-bookshelf/commit` with unknown preview_id returns 404.

### Frontend tests

`web.ui/frontend-react/src/components/__tests__/KdpIngestReviewModal.test.tsx`:
1. Renders the four sections with correct counts.
2. Apply is disabled when at least one ambiguous row is unresolved; enables when all resolved.
3. Toggling an orphan's checkbox flips it in the commit body.
4. Clicking Apply POSTs to `/api/kdp/ingest-bookshelf/commit` with the right body shape, closes the modal on success, surfaces the error inside the modal on failure.

`web.ui/frontend-react/src/__tests__/KdpCatalog.test.tsx` (extend):
1. Banner renders with counts when `/api/kdp/ingest-bookshelf/pending` returns a preview.
2. Banner renders nothing when the endpoint returns `{preview: null}`.

### Documentation file (`docs/kdp-bookshelf-scrape.md`)

Short — about 60 lines. Contents:

- Why this exists (one paragraph linking to this spec).
- Pre-req: dashboard backend running on port 5000.
- The exact prompt to paste into Claude for Chrome when you have the KDP bookshelf tab open:
  > "Scrape every book on this KDP bookshelf page. For each book, capture the ASIN (the link/data), the verbatim title text, the verbatim status label ('Live', 'In Review', 'Draft', 'Blocked', or 'Unpublished'), and the format ('Paperback', 'Kindle eBook', or 'Hardcover'). POST the result as JSON to http://localhost:5000/api/kdp/ingest-bookshelf with this shape: `{books: [{asin, kdp_title, kdp_status, format}, ...]}`. Report back the preview_id from the response so I can review in the dashboard."
- The expected response shape (so the user can sanity-check).
- Where to go in the dashboard to review and apply.

## Out of scope (explicit)

- Royalty, sales, sales-rank — Phase 2 / Phase 3 from earlier discussion. Different KDP page (Reports), different scrape pass.
- Multi-format support — one ASIN per dashboard slug for now. A book that lives as both Paperback and Kindle on KDP gets one of them tracked.
- Scheduled scraping — Claude for Chrome needs the user to drive it; no cron, no automation.
- Auto-applying matches without a preview — too risky on first run with fuzzy matching; revisit once all books have ASINs and matching becomes ASIN-only.
- Soft-delete for `MISSING_FROM_KDP` — informational only; no destructive action on the dashboard side.
- A persistent preview store. In-memory 30-min lifecycle is sufficient.

## Risks

- **Claude-for-Chrome scrape non-determinism.** KDP's bookshelf DOM may change; scrape might miss fields or produce malformed JSON. Mitigation: the endpoint validates strictly and returns 400 with field-level errors. No catastrophic state — user retries.
- **Title-replacement is destructive (KDP → dashboard).** Acceptable per the brainstorm decision; the preview surfaces it as a yellow dot per row so big renames are visible before commit.
- **In-memory preview store loses state on backend restart.** Acceptable for a 30-minute transient — user re-runs the scrape; ~30 seconds of effort.
- **Slug collisions on orphan creation.** If `slugify(kdp_title)` produces a slug that already exists in `kdp_books`, the insert fails with a unique-constraint error. Preview's commit response surfaces it in `errors`; user resolves manually. Out of scope to auto-disambiguate.
