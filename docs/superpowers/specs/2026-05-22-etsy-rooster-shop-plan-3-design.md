# Etsy Rooster Shop — Plan 3 Design

**Status:** Approved 2026-05-22.

**Goal:** Hit $200/month Etsy revenue by 2026-08-22 (90 days from today) by adding ~25 new listings that leverage existing pipelines, with minimal new code (~½ day of glue work).

**Strategy:** Zero-dev-heavy volume play. Catalog expansion across three existing-pipeline-friendly SKU types, supplemented by one extra full coloring-book listing. Defer all new-pipeline SKU types (paper packs, affirmation cards, etc.) to Plan 4 once we see which Plan 3 SKU types stick.

**Research basis:** Top niches identified via free public web research (Google Trends, Pinterest chatter, industry blog roundups; Etsy search counts unavailable due to bot blocking). Top 5 candidates by composite score were: cottagecore single-page coloring (87), themed mandala coloring sets (82), digital paper packs (78), wall art quote sets (76), affirmation cards (68). Plan 3 picks the three with cleanest existing-pipeline fit; defers paper packs and affirmation cards.

---

## Listing mix

| Type | Count | Price range | Pipeline | Marginal cost |
|---|---|---|---|---|
| Single-page themed coloring packs | 12 | $4.99 (multi-page) / $1.99 (single) | Extract subset PDF from existing KDP books | $0 |
| Wall art quote sets (6-print bundles) | 8-10 | $9.99-$11.99 | Nano Banana Pro × 6 prompts per set | ~$2-3 total ($0.04/image × 60) |
| Cricut SVG bundles | 2-3 | $7.99-$9.99 | Existing mandala SVG generator + bundle script | $0 |
| Full Cute Cats coloring book (Plan 2a-style) | 1 | $6.99 | Existing coloring book pipeline (unchanged) | $0 |
| **Total** | **23-26** | — | — | **~$3 API + ~$5 publish fees** |

**Revenue math:**
- Base case: 25 listings × 1.5 sales/mo × ~$7 avg = ~$260/mo
- Worst case: 25 listings × 1 sale/mo × $7 = ~$175/mo (triggers Phase 2 reactive moves)
- Higher-priced wall art sets ($10-12) tilt the math favorably when even a few sell

---

## SKU Type A: Single-page themed coloring packs (12 listings)

### Concept

Extract themed mini-packs (typically 10 pages) from existing KDP coloring books. Lower price = impulse buy; theme specificity = better SEO than a generalist 40-45 page book.

### Source books

- `bold-easy-cottagecore-mushrooms-v1` — 45 pages, currently the live Etsy listing
- `bold-easy-songbirds-v1` — 40 pages, currently drafted on Etsy
- `bold-easy-cute-cats-v1` — page count to confirm during implementation
- `bold-easy-cozy-christmas-v1` — held for Plan 4 (Oct-Nov seasonal window)
- `bold-easy-cozy-halloween-v1` — held for Plan 4 (Aug-Oct seasonal window)

### Listings

| # | Title | Source | Pages | Price |
|---|---|---|---|---|
| 1 | Cottagecore Mushroom Mini-Pack #1 | mushrooms-v1 (pages 1-10) | 10 | $4.99 |
| 2 | Cottagecore Mushroom Mini-Pack #2 | mushrooms-v1 (pages 11-20) | 10 | $4.99 |
| 3 | Cottagecore Garden & Botanical Pack | mushrooms-v1 (pages 21-30) | 10 | $4.99 |
| 4 | Cottagecore Mushroom Cottage Scenes | mushrooms-v1 (pages 31-40) | 10 | $4.99 |
| 5 | Songbirds Mini-Pack: Cardinals & Bluebirds | songbirds-v1 (thematic subset) | 10 | $4.99 |
| 6 | Songbirds Mini-Pack: Backyard Visitors | songbirds-v1 (thematic subset) | 10 | $4.99 |
| 7 | Songbirds Mini-Pack: Sparrows & Wrens | songbirds-v1 (thematic subset) | 10 | $4.99 |
| 8 | Cute Cats Mini-Pack #1 | cute-cats-v1 (first subset) | 10 | $4.99 |
| 9 | Cute Cats Mini-Pack #2 | cute-cats-v1 (second subset) | 10 | $4.99 |
| 10 | Single-Image: Detailed Mushroom Cottage | mushrooms-v1 (single page) | 1 | $1.99 |
| 11 | Single-Image: Hummingbird Garden | songbirds-v1 (single page) | 1 | $1.99 |
| 12 | Single-Image: Sleepy Cat by Fireplace | cute-cats-v1 (single page) | 1 | $1.99 |

### Per-listing assets

- Mini-pack PDF (selected pages from source book, repackaged with brand cover + footer)
- 3-4 preview PNGs (mosaic of included pages)
- Product video via Plan 2e (page-flip treatment, 0.7s per page)

### Thematic subset selection (songbirds)

Page-by-page assignment to "Cardinals & Bluebirds", "Backyard Visitors", "Sparrows & Wrens" subsets is done by:
1. Inspecting the songbird book's existing page index (each page has a bird name label)
2. Manual curation into 3 thematic groups of 10 pages each (10 remaining pages may be cherry-picked into mini-packs or held back)

### Mini-pack PDF differs from full book PDF in

- Smaller page count
- Different cover/title
- Same brand footer
- Same license terms
- Same 300 DPI quality

---

## SKU Type B: Wall art quote sets (8-10 listings)

### Concept

6-print gallery bundles. Cottagecore aesthetic + calm/nostalgic short quotes anchored in slowness, plants, mornings, quiet. Each set targets a specific room or vibe.

### Listings

| Set | Theme | Sample quote direction | Price |
|---|---|---|---|
| Cottagecore Kitchen | Herbs, jars, teapots | "Tea and quiet hours" / "Slow stirred soup" | $9.99 |
| Cottagecore Reading Nook | Books, candles, mugs | "Just one more chapter" / "Read slow" | $9.99 |
| Garden Cottage | Mushrooms, ferns, wildflowers | "Bloom where you wander" / "Soft seasons" | $9.99 |
| Songbird Series | Detailed botanical bird illustrations | "Sing morning" / "Quiet feathers" | $11.99 |
| Forest & Woodland | Mossy trees, mushrooms, ferns | "Step softly" / "Walk in green" | $9.99 |
| Bathroom & Spa | Florals, calm botanicals | "Soak quietly" / "Soft water" | $9.99 |
| Cozy Bedroom | Soft florals, dawn light | "Slow waking" / "Linen mornings" | $9.99 |
| Tea Garden | Cups, teapots, herbs | "Steep slowly" / "One cup, one breath" | $9.99 |
| Mushroom Specialty Set | All mushroom variations | (no text, illustration-only) | $11.99 |
| Botanical Apothecary | Dried herbs, jars, labels | "Garden grown" / "Tincture and time" | $11.99 |

### Per-set assets

- 6 different printable images at 3 sizes each (8×10, 11×14, 16×20)
- Packaged as ZIP with `instructions.pdf` (existing pattern from Plan 2c)
- 3-4 preview PNGs (mosaic of the 6 prints)
- Product video via Plan 2e (slow zoom on each print, ~1.5s per print = ~9s total)

### Quote-bank governance

For sets that include text:
1. LLMListingAuthor drafts ~30 candidate quotes per set from a brand-voice prompt
2. User spot-approves 6 (or asks for re-draft)
3. Generator renders 6 prints with approved quotes baked into the Nano Banana Pro prompts

This keeps editorial control with the user while avoiding 60+ quotes of manual writing. Reject anything that smells like Hallmark / "Live laugh love" / generic motivational.

### Generation parameters

- 4K (3072×4096) at 3:4 portrait, same as Plan 2c
- Center-cropped + LANCZOS-upscaled to print sizes 8×10, 11×14, 16×20 at 300 DPI JPG

---

## SKU Type C: Cricut SVG bundles (2-3 listings)

### Concept

Bundle 15-25 SVG cut files per purchase. Higher perceived value than single SVGs (which race to $1.50 each). Salvages the Plan 2d motif library which couldn't work at mandala-petal scale but reads fine at Cricut cutting scale (3-6 inches per silhouette).

### Listings

| Bundle | Content | Count | Price |
|---|---|---|---|
| Cottagecore Botanical SVG Bundle | Mushroom, fern, flower, leaf, acorn silhouettes from Plan 2d motif library | 20 | $7.99 |
| Geometric Mandala SVG Bundle | 15 mandala variations (different seeds, ring counts, petal arrangements) | 15 | $7.99 |
| Mixed Cottagecore Cut Files | 12 mandalas + 12 simple motifs | 24 | $9.99 |

### Per-listing assets

- ZIP file containing N individual `.svg` files (each Cricut-ready)
- 1 combined preview PNG (tiled grid showing all designs in the bundle)
- 2-3 detail preview PNGs (close-ups of a few designs)
- Product video via Plan 2e (static hold or zoom on the combined preview)

### Plan 2d motif salvage notes

The cottagecore motif primitives (mushroom, fern, leaf, flower, acorn) failed as mandala petals at 80px scale — they read as wheels, stars, cones. **At Cricut cutting scale (3-6 inches), they read fine as standalone shapes.** The unsellable composition was small-motif-tiled-in-rings; the salvage is small-motif-as-standalone-cut-file. Existing motif primitives are reused without modification.

---

## SKU Type D: Full Cute Cats coloring book (1 listing)

### Concept

Parallel to the existing live Cottagecore Mushroom coloring book and the drafted Songbird coloring book. Runs the existing Plan 2a pipeline unchanged.

### Listing

- Title: Bold & Easy Cute Cats Coloring Book (~40 pages, exact count TBD from source)
- Price: $6.99
- Pipeline: `etsy-rooster generate coloring --book=bold-easy-cute-cats-v1` (existing)

### Notes

- Assumes the `bold-easy-cute-cats-v1` source KDP book is finished and ready to convert
- If the source isn't ready, this listing slips to Plan 4

---

## Required pipeline extensions

All work is glue around existing pipelines, not new pipelines.

| Task | Files affected | Estimate |
|---|---|---|
| Single-page extraction (`coloring/page_extractor.py` + CLI wiring) — pull selected page ranges from a built KDP PDF into a mini-pack PDF with brand cover/footer | new file + cli.py | 2h |
| Multi-image poster set (`poster_set/` builder + extended Node script) — invoke generate_posters.mjs with N prompts, zip the 6 size-variant bundles, generate one combined mosaic preview | new Python module + extended Node | 3h |
| SVG bundle script (`svg_render/svg_bundler.py`) — zip N existing SVGs from the generator, render tiled preview PNG | new file | 1h |
| Niche prompts (`prompts/coloring_pack.json`, `prompts/wall_art_set.json`, `prompts/svg_bundle.json`) — LLMListingAuthor prompt JSONs for the new niches | 3 new JSONs | 1h |
| Full Cute Cats book listing | No new code (existing pipeline) | 0h |

**Total: ~7h, fits in a day with buffer.**

---

## Pipeline reuse map

Each Plan 3 listing flows through this sequence:

1. **Generate assets** — new extractor (Type A) / multi-image poster builder (Type B) / SVG bundler (Type C) / existing coloring pipeline (Type D)
2. **`author-metadata`** — LLMListingAuthor uses the new niche prompts to draft title/tags/description
3. **`publish`** — PublishOrchestrator creates Etsy draft listing, uploads primary file + previews
4. **`generate video --sku-id=N`** — Plan 2e attaches a product video
5. **Manual** — assign section + craft_type + Publish via Etsy dashboard

Every Plan 3 listing ships with a video from day 1.

---

## Phasing

| Phase | Window | Listings shipped | Focus |
|---|---|---|---|
| 1 | Weeks 1-2 (May 22 – Jun 5) | 12 single-page coloring packs + full Cute Cats book = 13 | Highest leverage on existing KDP assets |
| 2 | Weeks 3-4 (Jun 6 – Jun 19) | 8-10 wall art quote sets | Most $-per-sale upside |
| 3 | Weeks 5-6 (Jun 20 – Jul 3) | 2-3 Cricut SVG bundles + finalize/publish the 3 existing drafts | Catalog completion |
| 4 | Weeks 7-12 (Jul 4 – Aug 22) | 0 new shipped; refresh + monitor + scale winners | Iterate based on real Etsy data |

---

## Success metrics + cull triggers

| Gate | Date | Threshold | Action if hit | Action if missed |
|---|---|---|---|---|
| Day 30 | Jun 22 | ≥3 sales OR ≥200 views | Continue ramp | Refresh tags + title on bottom-quartile listings via LLMListingAuthor; consider $1/day Etsy Ads on top-favorited listing |
| Day 60 | Jul 22 | ≥10 sales OR ≥800 views | Identify 1-2 best-selling themes; ship 5 more in those themes | If 0 sales: pause ramp, A/B test pricing on 3 listings ($3.99 / $4.99 / $5.99) before adding more |
| Day 90 | Aug 22 | ≥29 sales = $200/mo | Plan 4: scale winners, build paper pack pipeline as next type | Triage: which SKU type underperformed? Cut losses, double down on what worked |

---

## Out of scope (deferred)

- **Digital paper packs** — ~1 day pipeline build; reserved for Plan 4 if Plan 3 SKU types validate
- **Affirmation cards / oracle deck** — Plan 4+ once paper pack pipeline exists
- **Halloween/Christmas seasonal listings** — Plan 4 (timed for Aug for Halloween, Oct for Christmas; slots in mid-Plan-3 if needed)
- **Etsy Ads spend** — start at $0; ramp only if Day-30 gate is missed
- **Wedding / Canva templates** — explicitly skipped per research (peak season already past, Canva Pro support burden)
- **Embroidery / cross-stitch patterns** — explicitly skipped per research (specialized mega-competitors)
- **Themed-mandala coloring sets via geometric composition** — known unsellable per Plan 2d learning; would require Nano Banana Pro generation path (deferred to Plan 4)
- **`--replace` flag for video re-upload** — known deferred-debt item from Plan 2e

---

## Risks + mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| Etsy algorithm doesn't surface new shop's listings (SEO maturity is months) | High | Tight niche keywords (long-tail), product videos on every listing, sales velocity from first-buyer-friend orders if needed |
| Single-page packs cannibalize the full book sale | Low | Mini-packs (10 pages) vs full book (40-45 pages) target different buyers (impulse vs completionist); differentiate in listing copy |
| All 25 listings get reviewed at "0 sales after 30 days" → no signal | Medium | Already planned: tag/title refresh at Day 30 if no sales |
| Quote sets feel AI-generated and lose buyers | Medium | LLM drafts → human approval gate; reject generic motivational |
| Research could not pull Etsy search counts (403 blocked) | Medium | Signals are from third-party roundups + Trends + Pinterest; recommend user spot-check 2-3 top niches via Erank free tier before committing all 25 listings |
| Cute Cats KDP source book is not finished | Low-Med | Verify before Phase 1; if not ready, that listing slips to Plan 4 |

---

## Open questions for implementer

1. **Cute Cats source book status** — does `bold-easy-cute-cats-v1` exist and have the expected page count? If not, slip that listing.
2. **Songbird subset assignment** — confirm 30 of the 40 songbird pages cleanly partition into 3 themed groups; cherry-pick the remaining 10.
3. **Per-listing Etsy Ads budget** — defaults to $0; revisit at Day 30 gate.
4. **Quote-set approval flow** — does the user want CLI-driven quote approval (read terminal, type "approve" or "redraft") or just an emailed list to approve async? Default: write candidates to a text file the user reviews, then a second CLI invocation generates with approved set.

---

## Implementation handoff

This spec defines what to ship. The next step is to invoke `writing-plans` to produce a detailed task-by-task implementation plan covering the four pipeline-extension tasks (single-page extraction, multi-image poster set, SVG bundler, niche prompts) plus a runbook for the 23-26 listings.
