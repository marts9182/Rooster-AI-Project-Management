# Publishing Roadmap — Dashboard Design

**Date:** 2026-05-29
**Status:** Draft for review

## Goal

A single source of truth for planned KDP + Etsy releases through the rest of 2026 (and beyond), surfaced on the dashboard's `/calendar` page so the publisher can see at a glance what ships when and which builds must be locked by which date. Backed by a new `publishing_roadmap` table, fed by a YAML importer, drilled into via a small modal that lets the publisher walk a row through its lifecycle without leaving the dashboard.

## Background

Today the calendar aggregates dated rows from `kdp_books.release_date`, `etsy_listings.listed_at`, `reminders`, and `pinterest_queue`. There is no record of planned-but-not-yet-built releases — every entry on the calendar is a thing that already exists. The publisher's actual release plan lives in his head and a research report just produced via the deep-research workflow. This spec brings that plan into the database and onto the calendar.

The roadmap is filled from a curated YAML file the publisher edits by hand. A one-shot importer turns each YAML entry into a `publishing_roadmap` row; the row drives two calendar events (file-lock deadline + release date). When the publisher actually marks a book published, the existing KDP / Etsy flows take over and the roadmap row's `status` advances. The roadmap deliberately does NOT push files to KDP or list things on Etsy — those stay human-in-loop because of the 10-business-day KDP review window and Etsy's listing rules.

## Section 1 — Schema (`publishing_roadmap`)

### Migration

`web.ui/backend/migrations/0007_publishing_roadmap.sql`:

```sql
-- Migration 0007 — publishing roadmap (planned KDP + Etsy releases).
-- Spec: docs/superpowers/specs/2026-05-29-publishing-roadmap-design.md

CREATE TABLE IF NOT EXISTS publishing_roadmap (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  kind                TEXT NOT NULL CHECK(kind IN ('kdp','etsy')),
  slug                TEXT NOT NULL,
  title               TEXT NOT NULL,
  target_release_date TEXT NOT NULL,
  status              TEXT NOT NULL CHECK(status IN ('planned','building','built','scheduled','published','skipped')),
  source              TEXT NOT NULL CHECK(source IN ('reuse','build')),
  niche               TEXT,
  rationale           TEXT,
  file_lock_date      TEXT,
  kdp_book_id         INTEGER REFERENCES kdp_books(id),
  etsy_listing_id     INTEGER REFERENCES etsy_listings(id),
  notes               TEXT,
  created_at          TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at          TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(kind, slug, target_release_date)
);
CREATE INDEX IF NOT EXISTS idx_roadmap_date ON publishing_roadmap(target_release_date);
CREATE INDEX IF NOT EXISTS idx_roadmap_status ON publishing_roadmap(status);
```

### Field semantics

- `kind` — `'kdp'` for paperback releases, `'etsy'` for digital download / wall art listings.
- `slug` — canonical kebab-case slug. For KDP it matches `kdp_books.slug` when an entry exists for an already-built book. For new builds, slug is reserved here before the local book directory exists.
- `title` — working title; editable independently of `kdp_books.title` so the roadmap can carry a planned rename.
- `target_release_date` — ISO `yyyy-mm-dd`. The day Amazon / Etsy should be live.
- `status` lifecycle:
  - `planned` — slot is reserved on the calendar, no work started.
  - `building` — work in progress (mostly for `source='build'` rows).
  - `built` — manuscript / asset is ready locally; awaiting KDP upload or Etsy listing.
  - `scheduled` — uploaded to KDP with scheduled release set OR Etsy draft staged for the planned date.
  - `published` — live on Amazon / Etsy. Set when the matching `kdp_books.status` or `etsy_listings.status` flips to published / active.
  - `skipped` — slot was reviewed and dropped; kept in the table for historical context, hidden from the calendar by default.
- `source` — `'reuse'` (one of the 30 already-built KDP books) or `'build'` (new manuscript that doesn't exist yet).
- `niche` — free-form tag for grouping in the UI: `'faith'`, `'cottagecore'`, `'senior-large-print'`, `'travel'`, `'holiday-halloween'`, etc.
- `rationale` — one-line "why this slot" the importer carries from the YAML; useful for the modal.
- `file_lock_date` — computed once on insert as `target_release_date - 15 calendar days` (10 business days KDP review + 5-day scheduled-release file lock, per KDP help G202173620). Stored, not derived, so the calendar can show it as a separate marker.
- `kdp_book_id` / `etsy_listing_id` — nullable FK back to the existing tables. Populated by the importer when a matching row exists, and by the status-flip handler when the publisher marks a book published.
- `notes` — free-form, surfaced in the modal.

### Status auto-advancement (out of explicit user action)

When the KDP `mark-published` route (existing) runs for a book, the route also looks up `publishing_roadmap WHERE kind='kdp' AND slug=:slug AND status NOT IN ('published','skipped')`. Matching rows get `status='published'` and `kdp_book_id` back-filled to the published book's id. Both updates run inside the same `db.transaction(...)` so a crash can't desync them.

Same logic for Etsy: when the syncer flips a listing's status to `active` for the first time, it looks up any roadmap row with `kind='etsy'` whose slug matches the listing's `sku_id` (Etsy listings carry a `sku_id` field that matches our internal slug for shop-created listings) and advances it similarly.

This is the only automatic write to the table outside the importer / modal. Everything else is explicit.

## Section 2 — Endpoint + calendar aggregator

### Routes

New module `web.ui/backend/roadmap/routes.js` exporting `createRoadmapRouter()`:

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/roadmap` | List rows. Query params: `?kind=kdp|etsy`, `?status=planned,building`, `?from=YYYY-MM-DD`, `?to=YYYY-MM-DD`. Returns `{rows: PublishingRoadmapRow[]}`. |
| `POST` | `/api/roadmap` | Insert one row. Body: `{kind, slug, title, target_release_date, status, source, niche?, rationale?, notes?}`. `file_lock_date` is auto-computed server-side. Returns `{row: PublishingRoadmapRow}`. Returns 409 on UNIQUE collision. |
| `PUT` | `/api/roadmap/:id` | Partial update. Body: any of `{status, target_release_date, title, niche, rationale, notes}`. If `target_release_date` changes, recompute `file_lock_date`. |
| `DELETE` | `/api/roadmap/:id` | Hard delete. Used rarely; usually flip to `skipped` instead. |

Mount in `server.js` next to the existing KDP / Etsy / Pinterest route mounts.

### Calendar aggregator extension

`web.ui/backend/calendar/aggregator.js` gets one new query branch that reads from `publishing_roadmap WHERE status != 'skipped'` within the requested `[from, to)` window. Each non-skipped row emits **two events**:

1. **Release event** at `target_release_date`:
   ```js
   {
     date: row.target_release_date,
     kind: 'roadmap.release',
     source_kind: 'publishing.roadmap',
     source_id: row.id,
     title: `${row.kind.toUpperCase()}: ${row.title}`,
     url: '/calendar', // modal opens inline; no separate detail page
     extra: { roadmap_status: row.status, source: row.source, niche: row.niche }
   }
   ```

2. **Lock event** at `file_lock_date` (when non-null and within window):
   ```js
   {
     date: row.file_lock_date,
     kind: 'roadmap.lock',
     source_kind: 'publishing.roadmap',
     source_id: row.id,
     title: `Lock file: ${row.title}`,
     url: '/calendar',
     extra: { roadmap_status: row.status, target_release_date: row.target_release_date }
   }
   ```

The aggregator already produces a unified sorted stream; the new branch slots in next to the existing kdp / etsy / reminders / pinterest queries. Total integration footprint: ~30 lines in `aggregator.js`.

## Section 3 — Calendar UI + importer

### Calendar UI changes

`web.ui/frontend-react/src/pages/Calendar.tsx`:

- **New event colors:** purple (`#7c3aed`) for `roadmap.release`, lighter purple dashed (`#a78bfa`, dashed border) for `roadmap.lock`. Distinct from the existing KDP green / Etsy orange / reminders red / pinterest blue.
- **Legend** at the top of the calendar grid gains two new entries: "Planned release" and "File lock deadline".
- **Click handler:** clicking either event opens a new `<RoadmapDetailModal />` (the existing kdp / etsy / reminder events navigate to their respective detail routes; roadmap events drill into a modal instead because there's no per-row detail page yet).

### Roadmap detail modal

New component `web.ui/frontend-react/src/components/RoadmapDetailModal.tsx`. Renders:

- Header: kind badge (`KDP` or `ETSY`), title, slug, niche.
- Status pill with a dropdown to advance: `planned → building → built → scheduled → published`. Also a `skipped` option in a danger color.
- Date row: `target_release_date` (editable date picker), computed `file_lock_date` (read-only, recomputes on date change).
- Source: `reuse` or `build` (read-only after creation).
- Rationale: read-only.
- Notes: textarea, saves on blur.
- Links: if `kdp_book_id` is set, "Open in KDP catalog" link to `/kdp/{slug}`. If `etsy_listing_id` is set, "Open Etsy listing" link to the etsy.com URL.
- "Mark skipped" button (with confirm) — hides the row from default calendar view.

All edits POST through `PUT /api/roadmap/:id`. On success, the modal stays open and the calendar refetches via the existing SSE bus (or a manual refresh trigger if SSE isn't wired for the roadmap event yet).

### Importer

New script `scripts/import_roadmap.mjs`:

- Reads `docs/superpowers/roadmap/2026-h2-pocket-rooster-press.yml`.
- For each YAML entry, POSTs to `http://127.0.0.1:5000/api/roadmap`.
- Idempotent via the `(kind, slug, target_release_date)` UNIQUE constraint — on a 409, the script does a follow-up `PUT` with the same body fields (less `target_release_date`).
- Logs progress to stdout: `[1/30] kdp/fathers-day-variety-dad → 201 created`.
- Exits non-zero if any row fails.

### YAML format

`docs/superpowers/roadmap/2026-h2-pocket-rooster-press.yml`:

```yaml
# Pocket Rooster Press — H2 2026 publishing roadmap.
# Derived from the deep-research output 2026-05-29 + brand-fit decisions.
# Edit by hand; re-run scripts/import_roadmap.mjs to upsert into the dashboard.
entries:
  - kind: kdp
    slug: fathers-day-variety-dad
    title: "Father's Day Variety Pack for Dad"
    target_release_date: '2026-06-14'
    status: planned
    source: reuse
    niche: holiday-fathers-day
    rationale: 'Father''s Day Jun 21; file must lock today.'
  - kind: kdp
    slug: backyard-birdwatcher
    title: 'Backyard Birdwatcher'
    target_release_date: '2026-06-22'
    status: planned
    source: reuse
    niche: hobbyist
    rationale: 'Summer birdwatching peak, no holiday rush.'
  # ... 28 more entries for the rest of 2026 ...
```

The full YAML is generated as part of the implementation plan from the roadmap table the publisher already approved.

## Section 4 — Out of scope (explicit)

- Auto-creating `kdp_books` rows for `source='build'` entries. The existing KDP filesystem scanner picks new books up once the local book directory is built. The roadmap row stays in `building` until that happens.
- Auto-publishing to KDP on `target_release_date`. KDP scheduled release is configured manually in the KDP web UI; the roadmap surfaces "lock file by X" as a calendar reminder but does not push files.
- Auto-listing on Etsy. Same reasoning — Etsy listing creation stays in the seller's hands.
- Email or Slack reminders 15 days before `file_lock_date`. Trivial follow-up via the existing `reminders` table once the roadmap is in place.
- A separate roadmap editor page. The modal + the YAML file together are the editing surface for v1. A full CRUD UI is a future enhancement.
- Multi-year roadmap visualization. The calendar handles months at a time; year-at-a-glance is out of scope.
- Status auto-advancement from `built → scheduled` (would require polling KDP for scheduled-release state). Manual flip via the modal for v1.

## Section 5 — Tests

### Backend

- `__tests__/roadmap/repo.test.js`: insert, list with each filter, update with `target_release_date` change recomputes `file_lock_date`, UNIQUE constraint enforced.
- `__tests__/roadmap/routes.test.js`: each route happy path + validation errors (missing fields → 400, UNIQUE collision → 409, unknown id → 404).
- `__tests__/calendar/aggregator.test.js`: extend with cases that seed `publishing_roadmap` rows and assert two events per row, lock event suppressed when outside window, `skipped` rows hidden.
- `__tests__/kdp/routes.test.js`: extend `mark-published` to assert the matching roadmap row flips to `status='published'` and `kdp_book_id` is populated.

### Frontend

- `RoadmapDetailModal.test.tsx`: renders the row, status dropdown advances via PUT, mark-skipped flow, date change triggers `file_lock_date` recompute.
- `Calendar.test.tsx` extension: renders roadmap events with the correct colors + legend entries, clicking a roadmap event opens the modal.

### Importer

- `scripts/__tests__/import_roadmap.test.mjs`: reads a sample YAML with 3 entries, mocks fetch, asserts 3 POSTs with the correct bodies, asserts a 409 → PUT fallback works.

## Section 6 — Risks

- **Date drift between calendar and reality.** If the publisher misses a `file_lock_date`, the calendar keeps showing the planned release date until manually edited. Mitigation: the lock-event dot turns red when `Date.now() > file_lock_date && status !== 'scheduled'`. Pure CSS rule on the event marker; no backend change.
- **Importer overwrites manual edits.** If the publisher edits a row in the modal and then re-runs the importer with stale YAML, the importer's PUT clobbers the edits. Mitigation: importer only PUTs fields whose YAML value differs from the DB; never re-sets `status`, `notes`, or `kdp_book_id` unless the YAML explicitly carries them. Document this in the importer header comment.
- **Calendar density.** 30 roadmap entries × 2 events each = 60 dots over 7 months. The existing calendar grid is a month view; ~9 events per month. Manageable. If it gets cluttered we add a per-event-kind filter pill, but YAGNI for v1.
- **Status sync race.** If KDP's `mark-published` flips both `kdp_books.status` and `publishing_roadmap.status` in two separate UPDATE statements, a crash between them leaves the roadmap stale. Wrap both updates in the same `db.transaction(...)`. Trivial.
- **No external test for the YAML schema.** A malformed YAML entry could crash the importer mid-run. Mitigation: importer validates each entry against an inline JSON schema before POSTing, and logs the bad entry without aborting the whole run.
