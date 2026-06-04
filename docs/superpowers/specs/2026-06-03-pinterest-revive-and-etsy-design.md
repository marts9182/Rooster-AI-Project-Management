# Pinterest Revive + Etsy Source — Strategy & Design

**Date:** 2026-06-03
**Status:** Draft for review
**Approach:** A — unify Etsy into the existing source-agnostic pin pipeline

## Goal

Make the dashboard's Pinterest automation actually post, and make it drive
traffic to **both** the KDP catalog **and** the 30 active Etsy listings —
organically, with zero ad spend, and as hands-off as possible. The pipeline
already exists end to end; it has never successfully posted. This spec covers
(1) reviving it, (2) adding an Etsy pin source, and (3) the strategy layer
(theme/niche boards, a cold-account warm-up ramp, and UTM-tagged links).

## Background — what already exists

From the May 27 (`pinterest-api-pivot`) and May 29 (`pinterest-autonomous-feature`)
plans, the backend already has:

- `pinterest/poster.js` — worker that dequeues a due pending row and posts via
  the Pinterest v5 API.
- `pinterest/topup.js` — keeps ~30 days of pins queued per **published KDP book**.
- `pinterest/scheduler.js` — pure scheduler, jitters 3–5 pins/day in a 9am–9pm window.
- `pinterest/generator.js` + `templates/` + `palette.js` — renders pin PNGs.
- `pinterest/engagement.js` — pulls saves/clicks/impressions back per pin.
- `pinterest/api_client.js` + `api_oauth.js` — v5 client + token storage.
- `pinterest_queue` / `pinterest_history` tables; calendar + analytics UI.

**Why nothing has posted (diagnosed live 2026-06-03):**

1. The stored access token returns `401 code:2 "Authentication failed"` on every
   real call. `/api/pinterest/token-status` only inspects local expiry metadata,
   so it falsely reports `connected`.
2. The `pinterest_queue` is empty, so the poster has nothing to send.
3. Only KDP books are wired in; **Etsy listings are not pinned at all** — yet
   printables/coloring/SVG are Pinterest's strongest-converting categories.

## Locked design decisions (from brainstorming 2026-06-03)

- **Scope:** revive the KDP path **and** add the Etsy path.
- **Etsy pin imagery:** branded 2:3 templates with text overlay (not raw Etsy photos).
- **Boards:** organized **by theme/niche** (mixing KDP + Etsy by topic).
- **Attribution:** UTM-tagged destination links + Pinterest's built-in
  saves/clicks/impressions (no bespoke attribution dashboard in v1).
- **Cadence:** account **warm-up ramp** (~2/day → ~8/day over 4–6 weeks),
  because the account has never posted and aggressive cold posting risks a ban.
- **Ads:** out of scope — this is organic Pinterest marketing only.

## Section 1 — Phase 0: Revive (prerequisite, ships first)

Independent of the Etsy work; must land first so we can confirm a real pin.

### 1.1 Live token validation

- `api_client.js` gains nothing new; instead `routes.js` `/token-status` does a
  cheap live `GET /v5/user_account` (cached ~60s) and reports
  `{connected, live_ok, identity?, error?}`. The dashboard shows a red banner
  when `live_ok` is false, with the regenerate instructions.
- **User action (external, blocking):** regenerate the token from Pinterest's
  dev portal **Production** environment (not Sandbox) with scopes
  `boards:read/write pins:read/write user_accounts:read`, paste into
  `<repo-root>/.env.local` as `PINTEREST_ACCESS_TOKEN`, restart backend.
- *Acceptance:* `/api/pinterest/whoami` returns the account identity (HTTP 200).

### 1.2 Boards bootstrap

- New `pinterest/boards.js` exports `ensureBoards(apiClient, boardMap)`:
  idempotently lists existing boards, creates any missing theme/niche board via
  `POST /v5/boards`, returns a `niche → board_id` map persisted to
  `data/pinterest_boards.json`.
- Runs once on boot when `live_ok` and the file is missing/stale; also exposed
  as `POST /api/pinterest/boards/sync` for manual re-run.
- *Acceptance:* the niche boards exist on the live account; the map file is written.

### 1.3 Seed + verify first post

- A one-shot `POST /api/pinterest/post-now?queue_id=N` (dev/ops only, gated like
  the test routes) force-posts a single pending row immediately, bypassing the
  scheduler, so we can confirm an end-to-end real post before turning on cadence.
- *Acceptance:* one pin visible on the live Pinterest account linking to a live listing.

## Section 2 — Phase 1: Source-agnostic pin pipeline + Etsy source

### 2.1 Pin-source abstraction

Refactor the KDP-specific top-up into a provider interface so both catalogs feed
one queue. A **pin source** exposes:

```
listSyndicatableItems() -> [{
  source: 'kdp' | 'etsy',
  source_id,            // kdp slug | etsy_listing_id
  niche,                // routes to a board + UTM campaign
  title, hero_image_path,
  link_url,             // canonical destination (pre-UTM)
  tagline_pool          // optional per-item taglines
}]
```

- `KdpBookSource` — wraps the current published-KDP-book query (behavior unchanged).
- `EtsyListingSource` — reads **active** rows from
  `projects/etsy-rooster-shop/data/catalog.db` (path via `ROOSTER_ETSY_TOKEN_PATH`'s
  sibling / a new `ETSY_CATALOG_DB` env, defaulting to the known location). Maps
  each listing's niche → board, listing image → hero, listing URL → `link_url`.

`topup.js` `runOnce` iterates **all** registered sources, applying the existing
per-item target-runway + `uniqueness_hash` remix logic unchanged. The only change
is `kdp_book_id` becomes a generic `(source, source_id)` pair.

### 2.2 Schema migration

`migrations/0008_pinterest_multi_source.sql` (0006/0007 already exist):

```sql
ALTER TABLE pinterest_queue   ADD COLUMN source TEXT NOT NULL DEFAULT 'kdp';
ALTER TABLE pinterest_queue   ADD COLUMN source_id TEXT;     -- mirrors kdp_book_id for old rows
ALTER TABLE pinterest_queue   ADD COLUMN board_id TEXT;      -- resolved at enqueue
ALTER TABLE pinterest_history ADD COLUMN source TEXT NOT NULL DEFAULT 'kdp';
ALTER TABLE pinterest_history ADD COLUMN source_id TEXT;
-- backfill source_id from existing kdp_book_id
UPDATE pinterest_queue   SET source_id = CAST(kdp_book_id AS TEXT) WHERE source_id IS NULL AND kdp_book_id IS NOT NULL;
UPDATE pinterest_history SET source_id = CAST(kdp_book_id AS TEXT) WHERE source_id IS NULL AND kdp_book_id IS NOT NULL;
```

`kdp_book_id` is kept (nullable) for backward compatibility; new code reads/writes
`(source, source_id)`.

### 2.3 Branded Etsy templates

- `generator.js` already renders 2:3 branded pins for KDP. Add an `etsy` template
  variant (or parameterize the existing one) that overlays title + a CTA strip
  ("Instant download on Etsy") in the brand palette (teal `#1F4F66` / brass
  `#CAA457` / cream `#FBF3E2`) on the listing's hero image.
- Reuses the existing variant/palette/tagline remix axes for uniqueness.

### 2.4 UTM tagging

- New `pinterest/utm.js` `withUtm(url, {campaign})` appends
  `utm_source=pinterest&utm_medium=pin&utm_campaign=<niche>` (idempotent; respects
  existing query strings). Applied at enqueue for every `link_url`, KDP and Etsy.
- Amazon strips unknown query params harmlessly; Etsy Shop Stats attributes
  `pinterest` as a traffic source.

## Section 3 — Phase 2: Strategy layer

### 3.1 Theme/niche boards

- A `NICHE_BOARD_MAP` (config) maps each niche to a board title, e.g.
  `Large-Print Sudoku`, `Word Search Puzzles`, `Kakuro & Logic`, `Coloring Pages`,
  `Cottagecore SVG Cut Files`, `Printable Wall Art`. Both KDP and Etsy items route
  by niche, so a topic board contains book pins *and* matching printable pins.

### 3.2 Warm-up ramp scheduler

- `scheduler.js` gains an `accountAgeDays` input and a ramp curve:
  `perDayMax = min(8, 2 + floor(accountAgeDays / 5))`, `perDayMin = max(2, perDayMax-2)`.
  Account "age" = days since the first `pinterest_history.posted_at` (or since a
  configurable `PINTEREST_LAUNCH_DATE`). Week 1 ≈ 2/day, ramping to ≈ 8/day by week 6.
- Existing 3–5/day flat behavior becomes the curve's mid-point; env overrides
  (`PINTEREST_PER_DAY_MIN/MAX`) still win for manual control.

### 3.3 Attribution surface (lightweight)

- No new dashboard. The existing engagement worker + cadence/engagement views
  already show saves/clicks/impressions and degrade to "—" if trial mode 401s.
- UTM links make Pinterest visible in Etsy Shop Stats and (coarsely) in KDP
  reporting. v1 success = pins posting on cadence + non-zero Pinterest outbound
  clicks within 30 days.

## Section 4 — Out of scope (v1)

Paid/Promoted Pins · multi-account · A/B statistical testing · auto-boosting top
pins · other social networks · manual pin upload through the dashboard ·
bespoke sales-attribution dashboard · cross-source pin dedupe beyond the existing
per-item `uniqueness_hash`.

## Testing strategy

- **`EtsyListingSource`**: returns only active listings; maps niche→board, image→hero,
  URL→link; handles a missing catalog DB gracefully (empty list + worker warning).
- **`topup.runOnce` multi-source**: tops up KDP and Etsy independently to per-item
  target; idempotent on repeat; one source failing doesn't kill the other.
- **migration 0006**: backfills `source_id` from `kdp_book_id`; old rows still post.
- **`utm.withUtm`**: appends params, idempotent, preserves existing query string.
- **`scheduler` ramp**: perDay grows with `accountAgeDays`, capped at 8; env override wins.
- **`boards.ensureBoards`**: idempotent (no dup boards), writes the map file, tolerates
  a board that already exists.
- **`/token-status` live check**: reports `live_ok:false` + error on a 401; `true` on 200.

## Risks

- **Token still 401s after regeneration** → blocks everything; mitigated by the live
  `/token-status` banner pinpointing the exact failure (the May checkpoint's error
  decoder maps `code:2/3/6`).
- **Pinterest spam-flags the cold account** → mitigated by the warm-up ramp + jitter.
- **Etsy catalog DB path drift** (it lives in a sibling project) → mitigated by an
  explicit `ETSY_CATALOG_DB` env with a sensible default + graceful-empty handling.
- **Trial-mode analytics 401** → engagement worker already self-disables and the UI
  degrades to "—"; cadence/Recent views are unaffected.

## Dependencies / sequencing

1. **Phase 0** (revive) — needs the user's token regeneration; ship + verify first.
2. **Phase 1** (Etsy source + migration) — independent of cadence tuning.
3. **Phase 2** (boards map + ramp + UTM) — layered on top; UTM should land with Phase 1
   so the very first real posts are already tagged.
