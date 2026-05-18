# Etsy Rooster Shop — Design Spec

**Date:** 2026-05-18
**Status:** Draft, pending user review
**Author:** Pocket Rooster Press team

## Summary

Build an automated Etsy shop that sells procedurally-generated digital products (Cricut-cuttable mandala SVGs and printable posters), branded as a sister storefront to Pocket Rooster Press. The pipeline generates art, authors Etsy-compliant listing metadata, publishes drafts via the Etsy Open API v3, and relies on Etsy's native digital-download auto-delivery for fulfillment. No personalization, no print-on-demand, no order-side automation in v1.

## Goals

- Validate end-to-end automation: generate → list → sell → auto-deliver.
- Ship 80 listings (50 mandalas + 30 posters) on launch day with consistent brand identity.
- Reuse Pocket Rooster Press brand assets (palette, rooster logo, CoverBuilder typography) so the shop visually descends from the books.
- Establish a foundation that supports adding personalized SKUs (Tier 2) and physical POD posters (Tier 3) without rearchitecture.

## Non-Goals (v1)

- Personalized SVGs / monograms with buyer-supplied names (Tier 2).
- Physical poster fulfillment via Printful or other POD (Tier 3).
- Niches beyond mandalas and posters (monograms, layered word art, generative line art).
- Pinterest auto-pinning — already paused on API approval per existing project memory.
- Customer-service automation (Etsy convos remain manual).
- Email capture / cross-promotion from KDP book back-matter.
- Direct LLM-authored SVG output (LLMs produce unreliable vector geometry for commercial sale).

## Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Product type | Cricut/Silhouette cut files + printable posters | User intent; both procedurally generable |
| Niches v1 | Mandalas + posters | Two highest-fit niches for code generation and existing IP |
| Niches deferred | Monograms, word art, generative line art | Need personalization or different generation approach |
| Brand relationship | Sister shop under Pocket Rooster Press identity | Halo from KDP reviews; shared rooster brand |
| Automation tier | Tier 1 only — hands-off digital | Smallest scope to prove the loop |
| Implementation language | Python | Reuses CoverBuilder typography; sibling to `kdp-puzzle-press` |
| Project location | `projects/etsy-rooster-shop/` | Monorepo sibling to KDP project |
| Image model | Nano Banana Pro (`gemini-3-pro-image-preview`) | Already in production use for KDP covers — commercial license already accepted |
| Mandala generation | Pure deterministic Python | Math-perfect; AI vectors fail Cricut cut requirements |
| Poster generation | Nano Banana raster art + CoverBuilder vector typography | Best per-poster quality; reuses existing typography skills |
| Listing copy | LLM (Gemini Pro or Anthropic) | Both available; A/B in implementation |

## Architecture

```
Existing Pocket Rooster Press (KDP)            NEW: projects/etsy-rooster-shop/
─────────────────────────────────              ──────────────────────────────────
puzzle generators                              ┌─ svg_render ────────────────┐
coloring generators                            │   MandalaGenerator          │
CoverBuilder ◄─── shared brand kit ────────►   │   PosterGenerator (calls    │
journal templates                              │     Nano Banana + uses      │
                                               │     CoverBuilder typography)│
                                               └─────────┬───────────────────┘
                                                         ▼
                                               ┌─ listing_authoring ─────────┐
                                               │ LLM → title/tags/desc/price │
                                               └─────────┬───────────────────┘
                                                         ▼
                                               ┌─ catalog_db (sqlite) ───────┐
                                               │ SKU lifecycle source of truth│
                                               └─────────┬───────────────────┘
                                                         ▼
                                               ┌─ etsy_client (API v3) ──────┐
                                               │ create listing + upload     │
                                               │ images + attach digital file│
                                               └─────────┬───────────────────┘
                                                         ▼
                                                  Etsy auto-delivers
                                                  files to buyers
```

Generators output a generic `SvgArtifact` bundle (master SVG + preview PNGs + optional layered/PDF variants). The catalog DB is the single source of truth for SKU state; the Etsy API is just an output target. Listing authoring is a separate step that can be rerun without regenerating art.

## Components

### 1. `svg_render/` — SVG and raster generation

- `MandalaGenerator(params: MandalaParams) → SvgArtifact`
  - Pure deterministic Python: radial symmetry, ring count, motif library, stroke styles.
  - Parameter sweeps produce N variations from one config.
  - `validate()` asserts closed paths, sensible viewBox, no zero-area shapes — required for clean Cricut cuts.
- `PosterGenerator(theme, copy, palette) → SvgArtifact`
  - Calls `NanoBananaClient` for raster art layer (PNG, up to 4K at one of 9:16, 3:4, 1:1).
  - Calls into shared CoverBuilder typography for vector text overlay.
  - Composites into final deliverable bundle: high-res PNG (primary), print-ready PDF, and SVG with embedded raster + vector text (bonus).
- `SvgArtifact` dataclass — `{ master_svg, preview_pngs, layered_svgs?, pdf?, sku, dimensions, theme_tags }`. `preview_pngs` is a list of 4 thumbnails sized for Etsy's listing image slots: hero, scale reference, palette swatch, in-context mockup.

### 2. `nano_banana_client/` — Gemini 3 Pro Image wrapper (Python)

- Mirrors `web.ui/backend/agents/ImageGenerationService.js` behavior in Python via the `google-generativeai` SDK.
- Model: `gemini-3-pro-image-preview`.
- Allowed aspect ratios: `1:1`, `16:9`, `9:16`, `4:3`, `3:4`.
- Allowed resolutions: `1K`, `2K`, `4K` (Pro tier).
- Writes generated PNGs to a local output directory; returns `{filename, path, bytes, model}`.
- Reads API key from `.env` (same key the Node backend uses).

### 3. `listing_authoring/` — Metadata builder

- `LLMListingAuthor.author(artifact, niche) → ListingDraft`.
- Niche-specific prompts (`mandala-prompt.md`, `poster-prompt.md`) constrained to Etsy field limits: title ≤140 chars, exactly 13 tags ≤20 chars each, description with required sections (what's included, file formats, license, printing tips).
- Backend swappable between Gemini Pro and Anthropic Claude.
- Uses prompt caching on the niche prompt + brand voice block.

### 4. `catalog_db/` — SQLite store

- Tables:
  - `sku` — id, niche, generator_params_json, created_at
  - `artifact_files` — sku_id, kind (svg|png|pdf|layered), path, hash
  - `listing_metadata` — sku_id, title, tags_json, description, price, materials_json
  - `etsy_listing` — sku_id, etsy_listing_id, state, listed_at, last_synced_at
  - `ops_log` — timestamped events for debugging
- Single-file SQLite at `data/catalog.db` (gitignored). Migrations hand-rolled — small enough.

### 5. `etsy_client/` — Etsy Open API v3 wrapper

- OAuth2 PKCE flow; refresh token stored in `~/.etsy-rooster/token.json` (gitignored).
- Methods: `create_draft_listing`, `upload_listing_image`, `upload_digital_file`, `activate_listing`, `get_listing`, `get_orders_since`.
- Rate-limit aware (Etsy: 10 req/sec, 10K/day). Exponential backoff on 429.
- Supports `--env=sandbox` for integration testing.

### 6. `publisher_cli/` — Orchestration CLI

- `etsy-rooster generate mandala --count 50`
- `etsy-rooster generate poster --theme gardening --count 25`
- `etsy-rooster author-metadata --niche mandala --batch latest`
- `etsy-rooster preview --batch latest` — opens local HTML gallery for visual review.
- `etsy-rooster publish --dry-run` then `--live` — pushes to Etsy as drafts.
- `etsy-rooster review` — interactive approval gate for STAGED listings.
- `etsy-rooster audit` — pulls Etsy state, reconciles against catalog DB.
- `etsy-rooster auth` — runs OAuth2 flow, persists refresh token.

### 7. `pocket_rooster_brand/` — Shared brand kit

- Factored out of `kdp-puzzle-press`. Single source of truth for:
  - Color palette (cream / teal / brass / coral)
  - Rooster logo (in vector and raster forms)
  - Typography stack (matches existing CoverBuilder)
  - Thumbnail watermark assets
- Both `kdp-puzzle-press` and `etsy-rooster-shop` import from this package.

### Boundaries

- Generators **never** call the Etsy API. They write artifacts to disk + insert SKU rows.
- `etsy_client` **never** generates art. It reads from the catalog DB.
- LLM **never** invents technical fields (taxonomy_id, materials list). Those derive from the niche config.

## SKU Lifecycle

```
       (no row)
          │  generate
          ▼
    ┌──────────┐
    │ DRAFTED  │  art + files on disk, sku row exists, no metadata yet
    └─────┬────┘
          │  author-metadata
          ▼
    ┌──────────┐
    │ AUTHORED │  title/tags/desc/price set, ready to push
    └─────┬────┘
          │  publish (creates Etsy draft listing, uploads images + digital file)
          ▼
    ┌──────────┐
    │ STAGED   │  exists on Etsy as a draft, not visible to buyers
    └─────┬────┘
          │  activate (manual review gate)
          ▼
    ┌──────────┐
    │ LIVE     │  buyers can purchase, Etsy auto-delivers digital file
    └─────┬────┘
          │  retire (sales dropped, refresh metadata, or seasonal)
          ▼
    ┌──────────┐
    │ RETIRED  │  delisted, files retained
    └──────────┘
```

The manual STAGED → LIVE gate exists because Etsy charges $0.20/listing for 4 months. Auto-publishing 80 unreviewed listings = $16 of fees on potentially off-brand titles. The `etsy-rooster review` command opens a local web preview of all STAGED listings; the user can approve all, fix titles inline, or reject individually before bulk activation. In v2, once the LLM authoring is trusted, this gate can drop to opt-in.

### Failure modes

- **Generator failure** — validation fails, params invalid. Logged to `ops_log`; SKU stays in DRAFTED; visible via `etsy-rooster audit --status drafted --age 7d`.
- **LLM authoring failure** — refused, malformed JSON, missing required fields. Retry with structured output schema; on third failure, mark `AUTHORED_FAILED` for human authoring.
- **Etsy API failure** — rate limit, auth expired, taxonomy invalid. Exponential backoff; persistent failure logs error; SKU stays in AUTHORED.
- **Token expiry** — refresh token rotated on each call; if rotation fails, CLI prints one-line instruction to run `etsy-rooster auth`.
- **Idempotency** — every `publish` checks the catalog DB first; if SKU already has an `etsy_listing_id`, it's a no-op unless `--force-recreate`.

## Testing Strategy

### Unit tests (fast, dense coverage)
- `MandalaGenerator` / `PosterGenerator` — golden-file SVG/PNG output for fixed param seeds. Validation methods unit-tested with crafted bad SVGs.
- `ListingDraft` builder — structural assertions (title length, exactly 13 tags, each tag ≤20 chars, no banned characters). LLM call mocked.
- `catalog_db` — in-memory SQLite, exercise every state transition.
- `NanoBananaClient` — HTTP mocked; verify request shape (model, aspect ratio, resolution, prompt), verify response handling.

### Integration tests (slow, narrow)
- End-to-end through STAGED using Etsy's sandbox API. One mandala + one poster through the full pipeline, asserting the listing exists on sandbox with correct fields. Runs nightly in CI, not per-commit.
- LLM authoring smoke test — one real Anthropic/Gemini call per niche, asserts the response parses and meets schema. Marked `@pytest.mark.live`, skipped in normal CI.
- Nano Banana smoke test — one real image generation call. Marked `@pytest.mark.live`.

### Visual regression (manual but cheap)
- `etsy-rooster preview --batch latest` writes an HTML gallery to disk; eyeball before approving a batch. Same pattern as existing `preview_pdfs.py` in `kdp-puzzle-press`.

### Test data
- Fixed seed catalog: 5 mandala param-sets + 5 poster themes checked into `tests/fixtures/`. Same SKUs every run. Golden files regenerated explicitly via `pytest --update-goldens`.

### Out of test scope
- Etsy algorithm response to listings (observable only via sales data).
- Subjective LLM output quality (caught by the visual review gate).
- Long-running token refresh (manual reauth on failure is acceptable for solo operation).

## v1 Acceptance Criteria

v1 ships when all of the following are true:

**Catalog**
- 50 unique mandala SKUs generated, validated, authored, staged on Etsy as drafts. (May be sourced from fewer base param sets with variation sweeps — uniqueness is judged visually, not by param-set count.)
- 30 unique poster SKUs generated (Nano Banana art + Python typography), validated, authored, staged on Etsy as drafts.
- All 80 reviewed in local HTML gallery and bulk-activated.

**Pipeline**
- `etsy-rooster generate` works for both niches.
- `etsy-rooster author-metadata` calls the chosen LLM and produces Etsy-compliant listing JSON.
- `etsy-rooster publish --dry-run` and `--live` work against Etsy sandbox AND production.
- `etsy-rooster review` opens local gallery.
- `etsy-rooster audit` reconciles DB ↔ Etsy.

**Brand**
- `pocket_rooster_brand/` shared package factored out; KDP code imports from it; nothing duplicated.
- Etsy shop banner + profile copy reflect Pocket Rooster Press identity.

**Operations**
- One end-to-end test sale: friend buys an SKU, confirms Etsy auto-delivered the file, confirms file opens cleanly in Inkscape; mandala file confirmed to import into Cricut Design Space.

## Open Risks & TODOs

1. **Nano Banana 4K ceiling for large poster formats.** 4K = ~3840×2160. At 300 DPI that's ~12.8"×7.2" of true printable area. Posters listed as 18×24 or larger need an upscaler (Real-ESRGAN or similar) in the pipeline. Decide upscaler choice during implementation.
2. **Etsy SEO learning curve.** First 80 listings will have mediocre titles/tags. Plan to iterate metadata after week 4 based on sales/impression data.
3. **$16 in Etsy listing fees** for 80 drafts at $0.20 each. Trivial but real.
4. **OAuth2 setup ceremony.** Etsy API requires a one-time developer app registration + manual approval. Build this in week 1 of implementation, not week 4.
5. **Shop name is a one-way door.** Decide before publishing: "Pocket Rooster Press" (matches brand exactly) vs "Pocket Rooster Studio" (signals craft/decor angle, less book-coded).
6. **Listing-copy LLM choice.** Decide Gemini Pro vs Anthropic for `listing_authoring` during implementation — both backends are pluggable.

## Roadmap Beyond v1

- **v1.5 — Analytics.** Pull Etsy orders nightly, attribute to SKUs, identify top performers, archive bottom performers. Drives the "what to generate next" decision.
- **v2 — Personalization (Tier 2).** Order webhook + on-demand generator for monograms and named SVGs. Add the monograms + layered-word-art niches.
- **v3 — Print-on-demand (Tier 3).** Printful integration for physical poster fulfillment. Add generative-line-art niche.

## Parking Lot (not in v1, not yet on roadmap)

- Direct LLM-authored SVGs for posters (option from brainstorming). Revisit if Imagen/Nano Banana cost ever becomes a constraint.
- Pinterest auto-pinning (already paused on API approval per existing project memory).
- Email capture from KDP book back-matter (separate KDP-side workstream).
- Customer service automation (manual Etsy convos in v1).
