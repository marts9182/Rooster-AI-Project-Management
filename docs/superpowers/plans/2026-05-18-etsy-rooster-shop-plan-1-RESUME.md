# EOD 2026-05-18 — Etsy Rooster Shop resume notes

Session paused for the night. Plan 1's code is fully complete; the live test
sale is blocked on Etsy approving the developer app. Pick up tomorrow with
section "What to do first."

## State of the work

**Outer repo** (`Rooster-AI-Project-Management`, branch `main`) tracks the
spec, plan, and these notes. Recent commits:
- `e90ccaa` (nested repo) — pre-live-run fixes
- `5af722f` (nested repo) — black + ruff cleanup
- `56ce895` (outer) — Plan 1 doc
- `6f5d3fa` (outer) — design spec

**Nested repo** (`projects/etsy-rooster-shop/`, branch `main`) is its own
git repo (outer repo gitignores `projects/`). HEAD: `e90ccaa`.

**Test state:** 53 unit tests pass, 2 deselected (live tests skipped by
default via `addopts = -m 'not live'`).

## What Plan 1 delivered

All 15 tasks committed:

1. Project scaffolding (`projects/etsy-rooster-shop/`)
2. Catalog DB (SQLite, 5-state lifecycle: DRAFTED → AUTHORED → STAGED → LIVE → RETIRED)
3. `SvgArtifact` dataclass
4. SVG cut-file validator (closed paths, viewBox, no zero-area)
5. Deterministic mandala generator (parametric, golden-file tested)
6. PNG rasterizer (Pillow-only after dropping cairosvg)
7. `ListingDraft` (Etsy field validation: 140-char title, 13 tags, etc.)
8. `LLMListingAuthor` with 3-attempt retry
9. Gemini Pro adapter (`gemini-2.5-pro`, deferred live smoke test)
10. Etsy OAuth2 PKCE flow + interactive bootstrap script
11. `EtsyClient` wrapper (mocked HTTP, 429 retry)
12. `PublishOrchestrator` (DB + EtsyClient glue, idempotent)
13. `click` CLI: `generate / author-metadata / publish / audit`
14. End-to-end Etsy integration test (`tests/integration/test_e2e_sandbox.py`,
    `@pytest.mark.live`)
15. README polished, status = "Plan 1 complete"

Pre-live-run fixes (commit `e90ccaa`):
- `validate_svg` now actually called from `render_artifact` (was dead code)
- Token refresh wired into `cli publish` (uses `is_expired()` + `refresh_token`)
- Removed misleading `--env=sandbox` flag (Etsy has no sandbox)
- Added "Known gates before first live run" section to README

## What's blocking the live run

**Single gate: Etsy must approve the developer app.**

User submitted the dev-app application 2026-05-18; Etsy status was "Pending
review" at end of day. Personal-use apps usually approve within 24h.

App identifiers (already captured in `.env`):
- Shop name: PocketRoosterPress
- ETSY_SHOP_ID: 66064739
- ETSY_KEYSTRING: 6ehof3o08c00gotsh7xt3q7k (currently rejected with
  "API key not found or not active")
- Shared secret: user has it, not in this doc

## What to do first tomorrow

1. **Check Etsy app status.** Open <https://www.etsy.com/developers/your-apps>.
   If "Approved" → proceed. If still "Pending" → wait, work on Plan 2 in
   parallel.

2. **Verify the keystring works.** Run:
   ```bash
   curl -s -H "x-api-key: 6ehof3o08c00gotsh7xt3q7k" \
     "https://openapi.etsy.com/v3/application/seller-taxonomy/nodes" \
     -o C:/Users/marts/AppData/Local/Temp/etsy_taxonomy.json && \
     head -c 80 C:/Users/marts/AppData/Local/Temp/etsy_taxonomy.json
   ```
   Expected: starts with `{"count":` or similar JSON. If still "API key not
   found or not active", the app is not approved yet.

3. **Look up the right taxonomy_id.** Once the keystring is live, the
   taxonomy JSON in step 2 contains the full tree. Find the leaf node for
   "Digital Prints" or "SVG Cut Files" (Etsy may have either or both under
   "Craft Supplies & Tools > Patterns, Tutorials & How-To"). Note the
   numeric `id`. We currently hard-code `68` (the root) as a placeholder in
   two spots:
   - `projects/etsy-rooster-shop/src/etsy_rooster/cli.py`
     (PublishOrchestrator construction)
   - `projects/etsy-rooster-shop/tests/integration/test_e2e_sandbox.py`

4. **Run the OAuth bootstrap (one-time).** From the project root:
   ```bash
   cd projects/etsy-rooster-shop
   python scripts/etsy_oauth_setup.py
   ```
   Browser opens → user clicks "Allow Access" → token saved to
   `~/.etsy-rooster/token.json`.

5. **Run the live integration test:**
   ```bash
   cd projects/etsy-rooster-shop
   pytest tests/integration/test_e2e_sandbox.py -v -m live -s
   ```
   On success: prints the new draft listing ID + URL to inspect in the
   Etsy seller dashboard.

6. **Manually inspect the draft on Etsy.** Open
   <https://www.etsy.com/your/shops/me/draft-listings>. Confirm:
   - Title is sensible (Gemini-authored).
   - 13 tags present, all ≤20 chars.
   - Mandala preview image rendered correctly.
   - SVG file is attached as a digital download.
   - Open the SVG locally in Inkscape/Cricut Design Space to confirm it
     loads cleanly.

7. **Delete the test draft on Etsy** to keep the shop tidy for Plan 3
   bulk-listing.

## After the live test passes

Plan 1 is truly complete. Move to **Plan 2** authoring:

- Niches: posters via Nano Banana Pro raster art + CoverBuilder typography
- Refactor `pocket_rooster_brand/` out of `kdp-puzzle-press`
- Address the Plan-2-blocking items from the final code review (below)

## Deferred technical debt (Plan 2 should fix)

From the cross-cutting Opus review of Plan 1, these are documented but not
addressed yet:

1. **`theme_tags` are dropped between generator and LLM in the CLI path.**
   The unit test passes them; `cli.author-metadata` does not. Persist them
   on the SKU row in Plan 2.

2. **`CatalogDB._conn` accessed directly from 3 places**
   (`cli.audit`, `cli.publish` lazily, `publish/orchestrator.py`). Add
   public methods: `list_skus(state=None)`, `get_listing_metadata(sku_id)`,
   `get_etsy_listing(sku_id)`.

3. **No `re-author` path.** `set_listing_metadata` requires DRAFTED state.
   If Gemini produces a listing the user dislikes, no way to redo without
   manual DB surgery.

4. **No recovery from half-published draft.** `PublishOrchestrator.publish`
   writes `etsy_listing` row only after all 3 API calls succeed. If
   `upload_listing_image` fails after `create_draft_listing`, the Etsy
   draft is orphaned and the next `publish` will create a duplicate.
   Record `listing_id` immediately after creation.

5. **`CatalogDB.retire()` missing.** STAGED → RETIRED and LIVE → RETIRED
   are valid transitions but no public method. Needed when Plan 3 archives
   bottom-performing listings.

6. **Mandala PNG renderer round-trips through SVG parsing.** `_svg_to_png`
   parses the just-generated SVG via ElementTree instead of rendering from
   `MandalaParams` directly. Refactor to render straight from params.

7. **`set_listing_metadata` re-call would IntegrityError** before the
   state check fires (PRIMARY KEY on `sku_id`). Better error path or
   `INSERT OR REPLACE`.

8. **`google-generativeai` is end-of-life.** Migrate to `google-genai`
   in Plan 2. Current pipeline works but a server-side change could break
   the live path.

9. **`assert sku_id is not None` in `create_sku`** — stripped under
   `python -O`. Convert to `if/raise` for paranoia.

10. **CLI test coverage gap.** Only `--help` and `generate mandala`
    are tested. `author-metadata`, `publish`, and `audit` have no
    CLI-level tests.

11. **`datetime.utcnow()` deprecation warnings** in `catalog_db._now()`.
    Switch to `datetime.now(UTC).strftime(...)`.

## Where things live (quick map)

| What | Where |
|---|---|
| Design spec | `docs/superpowers/specs/2026-05-18-etsy-rooster-shop-design.md` |
| Plan 1 doc | `docs/superpowers/plans/2026-05-18-etsy-rooster-shop-plan-1-mandala-sandbox-slice.md` |
| Etsy account setup runbook | `projects/etsy-rooster-shop/SETUP.md` |
| This resume note | `docs/superpowers/plans/2026-05-18-etsy-rooster-shop-plan-1-RESUME.md` |
| Project code | `projects/etsy-rooster-shop/` (nested git repo) |
| Mandala generator | `projects/etsy-rooster-shop/src/etsy_rooster/svg_render/mandala_generator.py` |
| Etsy client + OAuth | `projects/etsy-rooster-shop/src/etsy_rooster/etsy/` |
| CLI | `projects/etsy-rooster-shop/src/etsy_rooster/cli.py` |
| OAuth bootstrap script | `projects/etsy-rooster-shop/scripts/etsy_oauth_setup.py` |
| Integration test (live, deferred) | `projects/etsy-rooster-shop/tests/integration/test_e2e_sandbox.py` |
