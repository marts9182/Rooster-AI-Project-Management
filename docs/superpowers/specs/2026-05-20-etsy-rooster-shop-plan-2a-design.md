# Etsy Rooster Shop — Plan 2a: Branding + Coloring Pages

**Status:** Design approved 2026-05-20. Awaiting implementation plan (writing-plans).

**Predecessor:** Plan 1 (mandala-only pipeline) validated live 2026-05-20.
**Successor sub-plans:** 2b (`pocket_rooster_brand` refactor), 2c (posters via Nano Banana Pro), then Plan 3 (bulk SKU rollout + public launch).

## Goal

Ship a polished Etsy shop home plus the first coloring-book listing so the shop has a real "launch moment" rather than a single orphan mandala listing. Proves the Plan 1 pipeline scales to a second SKU type.

## Scope

**In:**
- Shop branding (banner, icon, sections, About, announcement, policies) using palette **B**: teal `#1F4F66` + brass `#CAA457` + cream `#FBF3E2` — same identity as the KDP "playful" theme (kakuro, futoshiki, fathers-day, diabetes-senior).
- New coloring-book pipeline in `etsy-rooster-shop` that imports existing KDP rendered assets and packages them as Etsy-ready listings.
- First coloring listing live: Cottagecore Mushrooms (45-design PDF + 4 preview images + Gemini-authored copy).
- 3 Etsy shop sections: SVG Cut Files / Coloring Pages / Printable Posters.

**Out (later sub-plans):**
- Other 4 coloring books (cute cats, songbirds, cozy Christmas, cozy Halloween) — fast-follow in a "2a prime" iteration once the pipeline is proven.
- Posters via Nano Banana Pro raster generation (sub-plan 2c).
- `pocket_rooster_brand` package extraction from `kdp-puzzle-press` (sub-plan 2b).
- Adding `listings_d` OAuth scope for API-side delete (will be picked up when sub-plan 2c or Plan 3 needs the `retire()` flow).

## Pipeline shape

```
projects/kdp-puzzle-press/
  assets/processed/coloring/<book_id>/page_NN.png   ─┐
  src/pocket_rooster_press/books/<book_module>.py    ─┤
   (TITLE, SUBTITLE, INTRO, DESIGN_COUNT)            │
                                                     ▼
projects/etsy-rooster-shop/
  src/etsy_rooster/coloring/                ──→  PDF + 4 previews + ColoringNiche
  src/etsy_rooster/listing_authoring/       ──→  Gemini-authored title/tags/desc
  src/etsy_rooster/publish/orchestrator.py  ──→  Etsy draft listing (existing)
```

## Architecture & components

### New code in `projects/etsy-rooster-shop/`

```
src/etsy_rooster/coloring/
  __init__.py
  niche.py            # ColoringNiche dataclass: book_id, title, subtitle, intro,
                      #   theme_tags, design_count, source_dir
  kdp_importer.py     # loads ColoringNiche from a KDP book module + asset dir;
                      #   validates all NN PNGs exist, all are 1-bit B&W
  pdf_builder.py      # composes ColoringNiche → 46-page Etsy-edition PDF
                      #   (1 cover page + 45 design pages, subtle bottom footer
                      #   "Pocket Rooster Press · page N", no blanks)
  preview_builder.py  # composes ColoringNiche → 4 preview PNGs:
                      #   - grid_4x4.png (16 thumbnails of evenly-sampled designs)
                      #   - hero_01.png, hero_02.png, hero_03.png (full-size renders
                      #     of 3 standout designs, indices configurable per niche)

src/etsy_rooster/listing_authoring/
  prompts/coloring-page-prompt.md   # generic coloring prompt template

# extended (not new):
src/etsy_rooster/cli.py             # add `generate coloring --book=<book_id>` subcommand
src/etsy_rooster/listing_authoring/author.py
                                    # LLMListingAuthor picks prompt by niche:
                                    # "mandala" → mandala-prompt.md
                                    # "coloring" → coloring-page-prompt.md
src/etsy_rooster/config.py          # add KDP_ASSETS_DIR resolution

assets/shop/                        # NEW directory (gitignored if large)
  banner.png                        # 1200×300, palette B + wordmark
  icon.png                          # 500×500, palette B + wordmark mark
scripts/
  build_shop_assets.py              # one-shot: Pillow renders banner.png + icon.png

tests/
  test_coloring_niche.py
  test_coloring_kdp_importer.py
  test_coloring_pdf_builder.py
  test_coloring_preview_builder.py
  test_coloring_cli.py              # tests the generate-coloring subcommand
  # plus: extend the existing test_listing_authoring.py with cases that confirm
  #   LLMListingAuthor picks the right prompt by niche (mandala vs coloring)
```

### Cross-project dependency on KDP

The Etsy project reads **only** rendered asset files and book-module metadata constants from `kdp-puzzle-press`. It does **not** import any KDP Python code. This keeps the two projects loosely coupled.

- Configuration: new env var `KDP_ASSETS_DIR` pointing at the KDP project root. Defaults to `../kdp-puzzle-press/` (relative to the Etsy project root) for the common monorepo layout. Documented in `.env.example`.
- Asset layout the importer expects:
  - `<KDP_ASSETS_DIR>/assets/processed/coloring/<book_id>/page_01.png` through `page_NN.png` (1-bit B&W PNGs, KDP's threshold-processed outputs)
- Metadata layout the importer expects:
  - `<KDP_ASSETS_DIR>/src/pocket_rooster_press/books/<book_module>.py` — module-level constants `TITLE`, `SUBTITLE`, `INTRO`, `DESIGN_COUNT`, plus an optional `THEME_TAGS: list[str]` constant.
  - `THEME_TAGS` does not exist yet on the cottagecore-mushrooms module — sub-plan 2a will add it (small KDP-side edit, one tuple of strings per book).

The importer fails fast (raises `KdpAssetError`) if any expected file is missing, count is wrong, or PNGs aren't 1-bit. No silent fallback.

### CLI surface

```
etsy-rooster generate coloring --book=<book_id>
  → import KDP assets + metadata for <book_id>
  → build Etsy-edition PDF in data/coloring/<book_id>/cottagecore-mushrooms.pdf
  → build 4 preview PNGs in data/coloring/<book_id>/preview_*.png
  → INSERT sku row (niche="coloring", state=DRAFTED, params=niche metadata)
  → ATTACH pdf as kind="pdf", preview PNGs as kind="preview_png"

etsy-rooster author-metadata --sku-id=<N>
  (existing) LLMListingAuthor picks coloring-page-prompt.md when sku.niche=="coloring"

etsy-rooster publish --sku-id=<N>
  (existing) PublishOrchestrator unchanged. Uses coloring-page taxonomy_id
  (looked up at publish time, see Open Decisions).

etsy-rooster audit
  (existing) lists all SKUs across niches
```

### Reuse from Plan 1 (unchanged)

- `CatalogDB` — coloring SKUs land in the same `sku` table with `niche="coloring"`. No schema changes.
- `EtsyClient` — unchanged. Same `<keystring>:<shared_secret>` header pattern.
- `PublishOrchestrator` — unchanged. Same `upload_listing_image` for previews + `upload_digital_file` for the PDF.
- Token store at `~/.etsy-rooster/token.json` and OAuth flow — unchanged.

### Coloring-page Gemini prompt

`prompts/coloring-page-prompt.md` template:

```
You are writing an Etsy listing for a printable coloring-book PDF.

NICHE: {{niche_name}}
TITLE (book): {{title}}
SUBTITLE: {{subtitle}}
THEME TAGS: {{theme_tags}}
DESIGN COUNT: {{design_count}} (single-sided pages, no blanks)
INTRO (author voice): {{intro}}
AI DISCLOSURE: include a one-sentence disclosure that the line art was created with AI image tools and refined for clean printing, per Etsy's 2024 listing-quality policy.

Generate:
- title: ≤140 chars, keyword-front-loaded, must include 3+ THEME TAGS verbatim
- tags: exactly 13 tags, each ≤20 chars, all-lowercase, no duplicates, prioritize theme tags
- description: 6–10 sentences, friendly, mentions design count + page size (8.5×11) +
  "instant download" + "PDF for home printing" + how to use (print, color, frame) +
  AI disclosure sentence at the end + license: "for personal coloring use only"
- materials: ["PDF", "Digital Download", "AI Line Art"]
- price_usd: 6.99
```

`materials` includes `"AI Line Art"` to satisfy Etsy's disclosure-in-tags-or-materials best practice.

## Etsy seller-side configuration (manual, no code)

Done once via the Etsy dev dashboard / Shop Manager web UI by the user:

| Field | Value |
|---|---|
| Shop title (≤55) | "Pocket Rooster Press · printables for makers" |
| Shop announcement (≤160) | "Instant-download coloring books, SVG cut files, and printable wall art. New designs added regularly. — Pocket Rooster Press" |
| Banner | upload `assets/shop/banner.png` |
| Shop icon | upload `assets/shop/icon.png` |
| Shop sections | "SVG Cut Files", "Coloring Pages", "Printable Posters" |
| About story | drafted skeleton (see below) — user fills personal paragraph |
| Returns policy | "All sales final on digital downloads. If you have a problem with the file — corrupt download, wrong size, etc. — message me within 30 days and I'll send a replacement." |
| Member section | user's name + 1-line bio |

### About story skeleton

```
Pocket Rooster Press is a small imprint making printable products for people who
like to slow down and make things by hand.

[USER FILLS: 1–2 sentences about who you are and why you started the shop.]

Every design is delivered as an instant download — no waiting, no shipping.
Coloring books arrive as PDFs you print at home; SVG cut files work in Cricut,
Silhouette, and Inkscape; printable posters are 300-DPI files in several common
print sizes.

Designs are created with AI image tools and refined by hand for clean printing,
disclosed per Etsy's 2024 listing-quality policy. Thanks for supporting a small
shop.
```

### Banner + icon generation (`scripts/build_shop_assets.py`)

A one-shot Pillow script. Inputs: palette B hex codes hardcoded at top of file. Outputs:

- `banner.png` — 1200×300, teal background, brass-cream serif wordmark "Pocket Rooster Press" centered, small rooster glyph (Unicode 🐓 fallback) as rightside ornament at low opacity.
- `icon.png` — 500×500, cream background, teal ring around a brass "PR" monogram in a serif face.

Both are committed to `assets/shop/` (not gitignored — they're small static assets). User uploads via Etsy dashboard.

## Acceptance criteria

**Shop branding done when:**
- Banner and icon render and are uploaded to the Etsy shop (verified by visiting `https://www.etsy.com/shop/PocketRoosterPress` and seeing them)
- 3 sections visible on shop page in this order: SVG Cut Files, Coloring Pages, Printable Posters
- Shop title, announcement, About story, and returns policy all set (under their respective char limits)

**Coloring pipeline done when:**
- `etsy-rooster generate coloring --book=bold-easy-cottagecore-mushrooms-v1` completes without error
- Output: a 46-page PDF + 4 preview PNGs in `data/coloring/bold-easy-cottagecore-mushrooms-v1/`
- All new unit tests pass; existing 53 unit tests still pass
- Live integration test creates a real draft listing on the Etsy shop with all 4 preview images + PDF attached
- The created draft, when viewed in Etsy Shop Manager, appears under the "Coloring Pages" section after manual section assignment

**Plan 2a complete when:**
- Cottagecore Mushrooms listing is in `active` state (published, not draft) on the Etsy shop
- Shop home page renders correctly with B-palette banner, icon, and 3 sections

## Open decisions (resolve during implementation)

1. **Coloring-page taxonomy_id** — needs a live `/seller-taxonomy/nodes` lookup to confirm. Likely candidates: `6817` (Craft Supplies & Tools > Printables) or `6343` (Patterns & Blueprints, same as mandalas). Use the candidate where Etsy's "Recommended for digital coloring PDFs" surfacing fits best — check current top-selling coloring-PDF listings to see which they use.
2. **Hero page indices for previews** — which 3 of the 45 designs are the "standouts"? Default policy: pages 5, 20, 40 (evenly spaced). Override-able via an optional `HERO_INDICES` constant on the KDP book module if curation matters later.
3. **AI disclosure exact wording** — drafted above ("Designs are created with AI image tools and refined for clean printing, disclosed per Etsy's 2024 listing-quality policy.") but user may want to soften, harden, or shorten. Lives in the Gemini prompt template, so easy to tune in one place.

## Testing strategy

- **Unit tests** (target ≥10 new):
  - `ColoringNiche` dataclass construction and validation
  - `kdp_importer` happy path + each failure mode (missing PNG, wrong count, non-1-bit input, missing book module)
  - `pdf_builder` page count, footer presence, cover page presence, page order
  - `preview_builder` grid_4x4 dimensions + hero PNG dimensions + sampling logic
  - `LLMListingAuthor` picks the right prompt by niche (mandala vs coloring) — added to existing `test_listing_authoring.py`
  - CLI `generate coloring` end-to-end with mocked KDP assets

- **Live integration test** (skipped by default, marker `@pytest.mark.live`):
  - End-to-end: generate coloring → author metadata via real Gemini → publish to real Etsy as draft. Mirrors the Plan 1 `tests/integration/test_e2e_sandbox.py` pattern.

- **Manual verification**:
  - Open the generated PDF and confirm it prints correctly on US Letter
  - Open one preview PNG to confirm grid layout is readable
  - View the created draft in Etsy Shop Manager and confirm all images + PDF attached

## Out of scope (explicit, to prevent scope creep)

- No new Etsy API scopes (no `listings_d`).
- No changes to `EtsyClient`, `CatalogDB`, `PublishOrchestrator`, or the OAuth flow.
- No batch / bulk-publish CLI.
- No KDP-side changes beyond adding `THEME_TAGS` to the cottagecore-mushrooms book module.
- No CI/CD setup.
- No SEO analytics tooling (Erank, etc.) — defer to Plan 3.
