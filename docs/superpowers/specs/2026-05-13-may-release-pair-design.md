# May 2026 KDP Release Pair — Design

**Date:** 2026-05-13
**Imprint:** Pocket Rooster Press
**Author:** Brainstormed with Claude (Opus 4.7)
**Status:** Approved by user; ready for implementation plan

---

## 1. Problem statement

Pocket Rooster Press has 22 SKUs in production across Sudoku, Word Search, Cryptograms, Kakuro, and one Cottagecore Mushroom coloring book. Two generators — **Futoshiki** and **Word Snake** — are code-complete (as of 2026-05-11) but have no shipped book modules yet.

The user wants two more book releases this month (May 2026), targeting **high demand and low supply**.

Two structural facts shape the decision:

1. **Father's Day 2026 is Sunday June 21.** Amazon's Father's Day Sale runs **May 28 – June 15**, and Amazon's A10 algorithm pre-indexes seasonal terms 4–8 weeks ahead. To capture organic ranking, a Father's Day SKU must be **live by ~June 1**. This is the only seasonal lever for the next 60 days.
2. **Only books built on existing generators can credibly ship in two weeks.** Nonograms, Hashi, cryptic crosswords, logic-grid puzzles are all genuinely underserved per the research but each requires 1–3 weeks of new generator engineering. They are deferred to Q3.

## 2. Decision: ship two SKUs in May 2026

| # | SKU | Strategic role | Live by |
|---|---|---|---|
| **A** | Father's Day Variety Puzzle Book for Dad — Large Print | Seasonal hero — captures the only seasonal window of the next 60 days | **May 23** |
| **B** | Futoshiki Large Print for Seniors — Vol. 1 | Foundation evergreen — establishes Futoshiki as a series; low competition (~400 SKUs) | **May 28** |

**Why this pairing (one seasonal + one evergreen):**

- Book A rides a high-demand window using 100% existing generators. Theme content (dad-humor cryptogram quotes, dad-themed word lists) is the long pole, not code.
- Book B is the cushion. The Futoshiki generator is already verified-unique, so the build is just a book module, a how-to-play page, and a cover. If anything blows up on Book A's deadline, Book B's slack absorbs it.
- Both are inside your locked **playful theme** (cream / teal / brass / coral with real puzzle grids).

**What we deliberately are NOT shipping this cycle (and why):**

- **Father's Day Coloring Book for Dad.** Dad-themed bold-and-easy AI art is unvalidated; the Cottagecore Mushroom proof-of-concept covers botanical, not mechanical (tools, cars, BBQ). Don't risk the deadline on it.
- **Word Snake Vol. 1.** No Amazon search demand for the term. Category-creation play; needs TikTok marketing, not organic launch. Deferred to Q3.
- **Nonograms / Hashi / cryptic crosswords / logic-grid puzzles.** No generators yet. Deferred to Q3.
- **Crossword.** Generator is a stub. Not this cycle.
- **Dark Academia coloring (<50 competitors — highest-EV evergreen).** Deferred to post-Father's-Day so we don't split focus from the seasonal deadline.
- **Cover-system or palette overhaul.** Stay inside the locked playful direction.

## 3. Book A — Father's Day Variety Puzzle Book for Dad

**Working title:** *Father's Day Puzzle Book for Dad: Large-Print Sudoku, Word Search, Cryptograms & Kakuro — 100+ Puzzles for Hours of Relaxation*

**Persona:** Generic Dad / Grandpa (widest funnel, captures both buyer intents without splintering keywords).

### 3.1 Format

- 8.5×11 large print
- **Target 108–120 pages** (108 is the print-cost-flat ceiling; above that, each page adds ~$0.012 in print cost. We aim for 108 and accept up to 120 if layout density requires it.)
- $9.99 list price (60% royalty cliff floor)
- BISAC: Crafts & Hobbies / Games / Puzzles; secondary Holidays / Father's Day

### 3.2 Puzzle composition (100 puzzles)

| Type | Count | Difficulty mix | Layout density | Page footprint |
|---|---|---|---|---|
| Sudoku | 35 | 10 easy / 15 medium / 10 hard | 1 per page (large print 9×9) | 35 pages |
| Word Search | 30 | All medium-large grids | 1 per page | 30 pages |
| Cryptograms | 25 | Easy hint pattern (1 letter revealed) | 2 per page (text-heavy, fits comfortably at large-print size) | 13 pages |
| Kakuro | 10 | Easy–medium | 2 per page (sized 5×5 to 7×7, large-print readable at half-page) | 5 pages |

**Page budget (target 108):**

| Block | Pages |
|---|---|
| Front matter (title, copyright, intro page, TOC) | 4 |
| Section dividers (one per puzzle type) | 4 |
| Sudoku puzzles | 35 |
| Word Search puzzles | 30 |
| Cryptogram puzzles (2-up) | 13 |
| Kakuro puzzles (2-up) | 5 |
| Solutions (compact 4-up for sudoku/word-search; 8-up for cryptograms/kakuro) | ~16 |
| Back matter (about, other titles) | 1 |
| **Total** | **~108** |

Solutions are deliberately compact (4-up grids per page; multi-up for cryptograms/kakuro) to keep total under 108. If the layout overshoots, the first lever is dropping word search to 28 puzzles; the second is dropping sudoku-hard to 8.

### 3.3 Theme content (the long pole)

| Asset | Quantity | Source approach |
|---|---|---|
| Dad-themed word lists | 30 lists × 18–22 words each | Curated dad-life vocabulary (BBQ, Tools, Fishing, Golf, Garage, Lawn, Workshop, Coffee, Recliner, Newspaper, Classic Cars, Grilling, etc.). Reuse existing word-list infra. |
| Cryptogram quotes | 25 quotes | Mix: ~10 Erma Bombeck / Dave Barry-style public-domain dad humor; ~10 fatherly wisdom (Teddy Roosevelt, Ben Franklin, Mark Twain, Emerson — all public-domain); ~5 generic warm sayings. Hand-curated for tone. Reuse harvest from existing cryptogram SKUs where possible. |
| Section dividers | 4 (one per puzzle type) | "Sudoku for Sharp Dads," "Word Search for Workshop Days," etc. |
| Front matter | 1 introduction page | "From Pocket Rooster Press to your dad" warm intro, ~150 words |

### 3.4 Cover — Four-Grid Variety Collage (Direction B)

- Playful palette: cream bg (`#FBF3E2` → `#F0E6D1` gradient), deep teal (`#1F4F66`), brass (`#CAA457`), coral (`#D86C5C`)
- 2×2 collage of four mini puzzle grids — one per puzzle type — each in real puzzle data (no AI art)
- Each tile uses one accent for its border and another for its 3-px drop shadow (brass/coral/teal rotation); tiles tilt ±1–2° for playfulness
- Tiny uppercase labels under each tile: SUDOKU / WORD SEARCH / CRYPTOGRAM / KAKURO
- "Pocket Rooster Press" imprint top in brass; "★ Father's Day Edition ★" topline in coral
- Title "Puzzle Book for Dad" in Playfair Display
- Confetti dots (brass + coral + teal) scattered around
- No badge in upper-right (per locked memo)
- Hero aspect matches 8.5×11 front panel: 1024×1336

### 3.5 KDP listing keywords (7 slots)

1. fathers day gifts from daughter
2. fathers day gifts from son
3. puzzle book for dad
4. large print puzzle book for adults
5. sudoku word search cryptogram book
6. fathers day gift for grandpa
7. activity book for men

## 4. Book B — Futoshiki Large Print for Seniors, Vol. 1

**Working title:** *Futoshiki Large Print for Seniors: 120 Number-Logic Puzzles to Sharpen the Mind — Volume 1*

"Vol. 1" is deliberate — buyers hunt sequels on KDP and `kakuro_quiet_minds` proves the senior-positioned logic-puzzle pattern works for this imprint.

### 4.1 Format

- 8.5×11 large print (consistent with `large_print_sudoku_grandparents` and senior-targeted SKUs)
- **Target 108–120 pages** (Futoshiki grids are small at 5×5 and 6×6, so multi-up layouts are realistic without losing senior-readability)
- $9.99 list price (60% royalty cliff floor)
- BISAC: Crafts & Hobbies / Games / Logic & Brain Teasers

### 4.2 Puzzle composition (120 puzzles graded easy → hard)

| Section | Count | Grid size | Layout density | Page footprint |
|---|---|---|---|---|
| Warm-up | 30 | 5×5 | 4 per page (tiny grids, still large-print at quarter-page) | 8 pages |
| Steady | 40 | 6×6 | 2 per page | 20 pages |
| Sharpen | 30 | 7×7 | 1 per page | 30 pages |
| Challenge | 20 | 8×8 | 1 per page | 20 pages |

All sizes stay inside the generator's verified-unique base bank (75 base × 8 symmetries = 600/size per the May 11 generator status).

**Page budget (target 108):**

| Block | Pages |
|---|---|
| Front matter (title, copyright, intro, 2-page how-to-play, rules cheat-sheet) | 6 |
| Section dividers (one per difficulty tier) | 4 |
| Warm-up puzzles (4-up) | 8 |
| Steady puzzles (2-up) | 20 |
| Sharpen puzzles (1-up) | 30 |
| Challenge puzzles (1-up) | 20 |
| Solutions (compact 4-up for 7×7/8×8; 8-up for smaller) | ~18 |
| Back matter (about, also-from-press) | 2 |
| **Total** | **~108** |

If the layout overshoots, the first lever is dropping section dividers; the second is dropping warm-up to 24 puzzles.

### 4.3 Front matter (~6 pages — conversion-critical for an unfamiliar puzzle type)

- 1 page introduction ("Welcome to Futoshiki — Latin squares with a twist")
- 2 pages how-to-play with a worked example
- 1 page rules cheat-sheet
- Copyright + ISBN

The how-to-play section is the conversion hook for Futoshiki specifically. Cold buyers skim the Amazon "Look Inside" preview — without a clear how-to-play, they bounce.

### 4.4 Cover — Single Futoshiki Hero (playful direction, Direction A from cover mockups)

- Same playful palette as Book A
- One partially-solved 6×6 Futoshiki grid as the hero, with inequality symbols (`<` `>` `∨` `∧`) clearly visible — the visual signature that distinguishes Futoshiki from Sudoku on the search row
- 70% solution fill, 4° tilt, brass+coral+teal digit rotation per existing convention
- "FUTOSHIKI" in bold Playfair, "Large Print for Seniors" subtitle in italic Lato
- Volume number in coral roundel bottom-right
- No badge

### 4.5 KDP listing keywords

1. futoshiki puzzle book
2. large print logic puzzles for seniors
3. brain games for seniors
4. number puzzles large print
5. latin square puzzles
6. logic puzzle book large print
7. sudoku alternative puzzle book

### 4.6 Why no Father's Day subtitle on Book B

The variety book already owns the Father's Day keyword cluster. Splitting the query across two SKUs cannibalizes — Amazon's A10 rewards a clear "this book = this query" signal. Keep Futoshiki pure-evergreen and let it build series authority on its own keywords. Mention "Great Father's Day gift!" in A+ content body copy only.

## 5. Code architecture

### 5.1 New code units (each one file, single responsibility)

| Unit | What it does | Boundary |
|---|---|---|
| `src/pocket_rooster_press/books/fathers_day_variety_dad.py` | Orchestrates all 4 generators for Book A. Calls the assembler with the new section-divider pattern. References theme content. | Standard book-module convention. ~150 lines like existing book modules. |
| `src/pocket_rooster_press/books/futoshiki_seniors_v1.py` | Orchestrates the Futoshiki generator. Calls the assembler. References how-to-play prose. | Same convention. ~100 lines. First book to consume the Futoshiki generator. |
| `scripts/build_four_grid_hero.py` | Renders the 2×2 collage hero PNG by stitching four real puzzle grids (one per type), playful palette, brass/coral/teal accents, tiny labels under each tile, slight per-tile rotation | Separate from `scripts/build_real_grid_hero.py` because the multi-grid composition is a different problem (per-tile rotation, label rendering, palette accent rotation). Both scripts call the same per-grid renderer underneath; extract that renderer to a shared module if it isn't already. |
| `src/pocket_rooster_press/themes/data/fathers_day_dad/` | 30 word lists + 25 cryptogram quotes + intro prose for Book A | Data only — no code |
| `src/pocket_rooster_press/themes/data/futoshiki_seniors_v1/` | Intro + 2-page how-to-play + rules cheat-sheet prose for Book B | Data only — no code |

### 5.2 Spikes (Day 1, before any production work)

Two 1-hour spikes go first because they de-risk the timeline:

**Spike S1 — Mixed-puzzle section dividers in `pdf_builder.py`.** Render an 8-page mock (2 sudoku, 2 word search, 2 cryptograms, 2 kakuro) with section dividers between types. If the assembler doesn't currently support section-divider pages, the fix is local: add `render_section_divider(title, palette)` to `pdf_builder.py` and have `book_assembler.py` call it when the book module declares sections. Stop-the-line if this spike reveals >1 day of work.

**Spike S2 — Futoshiki inequality glyphs in `pdf_builder.py`.** Render one Futoshiki page end-to-end. The generator emits inequality constraints between cells; the renderer must draw `<` / `>` / `∨` / `∧` glyphs in the inter-cell gutter. If this isn't wired yet, add it as a small, focused renderer extension. Stop-the-line if it's >1 day of work.

**Spike S3 — Four-grid collage cover proof.** 5-page mock at thumbnail size to confirm the composition reads clearly at 200×300 px (Amazon search-row size). Fallback if the script is bigger than expected: ship Book A with the single-hero cover (Direction A) and revisit the collage for Vol. 2.

### 5.3 Additive config

- `config.py`: add `PALETTE_FATHERS_DAY_DAD` (cream/teal/brass/coral with slightly warmer coral)
- `config.py`: add `PALETTE_FUTOSHIKI` (same family, cooler teal-dominant)
- Both are dict additions; no behavior change to existing palettes
- `kind="puzzle"` for both books — no new kind values needed

### 5.4 Metadata (data only)

- `metadata/fathers_day_variety_dad.json` — KDP listing copy, BISAC codes, keywords, A+ content blocks, description with bullets
- `metadata/futoshiki_seniors_v1.json` — same shape, evergreen positioning

### 5.5 Targeted refactor only — no opportunistic cleanup

If S1 or S2 reveal that `pdf_builder.py` needs new responsibilities (section dividers, inequality glyphs), make those changes local and minimal. Do not rework the rest of the builder. Stay focused on what serves this release.

## 6. Day-by-day timeline (May 13 → May 28)

| Days | Window | Work |
|---|---|---|
| **May 13** | Today | Lock spec, write design doc, commit |
| **May 14** | Spike day | S1 + S2 + S3 (4-grid cover proof). Identify any `pdf_builder.py` gaps. Stop-the-line if any spike >1 day. |
| **May 15–16** | Theme content | 25 dad cryptogram quotes + 30 word lists + Book A intro + Book B how-to-play prose. Content reviewed before generation. |
| **May 17** | Book A generation | Generate all 100 puzzles. Uniqueness registry check. PDF assembly. Internal QA: solutions validate, no profanity, large-print readability. |
| **May 18** | Book A cover + listing | Four-grid collage cover render. Full wrap PDF + 150-DPI PNG preview. KDP listing copy. |
| **May 19** | Book A upload | Upload to KDP, submit for review. |
| **May 20–21** | Book B build | 120 Futoshiki puzzles graded 5×5→8×8. PDF assembly with how-to-play. Internal QA. Single-grid hero cover render. |
| **May 22** | Book B listing + upload | KDP listing copy (evergreen). Upload, submit. |
| **May 23–25** | KDP review window | Book A goes live. Smoke-test listing. Set $9.99 price. |
| **May 26–28** | Book B live + PPC | Book B live. PPC ramp $10–20/day on Father's Day keywords (Book A) and senior-logic-puzzle keywords (Book B). Amazon's Father's Day Sale opens May 28. |

**Slack:** Book A finishes 5 days before Father's Day Sale opens; Book B finishes 3 days before month-end. Both buffers are intentional.

## 7. Risks

| Risk | Impact | Likelihood | Mitigation |
|---|---|---|---|
| `pdf_builder.py` doesn't support Futoshiki inequality glyphs | High — blocks Book B | Medium | Day-1 spike S2; if >1 day, defer Book B's KDP submission by 2 days (still in May). |
| `pdf_builder.py` doesn't support section dividers for mixed-puzzle books | Medium — Book A still ships, less polished | Medium | Day-1 spike S1; fallback is plain title-page dividers. |
| Dad cryptogram quote curation drags (tone, public-domain verification) | Medium — slips Book A by 1–2 days | Medium | Write 40 candidate quotes, cut to best 25. Reuse harvest from existing cryptogram SKUs (`ancient_wisdom_cryptograms`). |
| Four-grid collage cover script larger than expected | Low–Medium | Low–Medium | Fallback to single-hero cover (Direction A) so cover engineering doesn't block the deadline. |
| KDP review delay (Amazon-side) | Medium | Low | Upload Book A by May 19 → 7-day buffer before Father's Day Sale opens May 28. |
| Book A theme content feels generic / AI-written | High — bad reviews compound | Medium | Hand-curate quotes; word lists go through a human read-through; intro page is written, not generated. |
| Futoshiki demand softer than estimated (no clean search-volume data) | Medium | Medium | Treat Book B as a 6-month foundation asset, not a hero. Even at low absolute volume it builds series authority and internal catalog links. |

## 8. Success criteria

**Build success (by May 28):**

- ✓ Both books pass internal QA (every solution validated, no uniqueness violations, large-print readable)
- ✓ Both books live on KDP at $9.99
- ✓ Book A live by May 23, Book B live by May 28
- ✓ A+ content uploaded for both

**Market success (60 days post-launch, measured 2026-07-22):**

- *Book A:* ≥50 sales during the Father's Day window (May 28 – June 21). Stretch: top-50 in "Father's Day Gifts" sub-category.
- *Book B:* ≥20 sales in the 60-day window. Top-100 in "Logic Puzzles" Amazon BSR. Vol. 2 decision based on review quality.
- *Both:* ≥4.0 star average; no quality complaints in reviews.

If Book A under-performs the Father's Day window, the cover or keyword strategy is the lever to tune for 2027. If Book B under-performs with strong reviews, it's a marketing problem (TikTok demo, paid spend), not a product problem.

## 9. Out of scope for this spec (parking lot)

Listed only so it's clear what we're *not* committing to here:

- Q3 2026: Word Snake Vol. 1 with TikTok demo strategy; first Nonograms generator
- Q3 2026: Dark Academia coloring book (<50 competitors per KDPEasy)
- Q4 2026: Father's Day Variety Vol. 2 (refined based on Vol. 1 reviews); Futoshiki Seniors Vol. 2
- Cryptic crosswords US launch (generation requires linguistic AI work)
- Hidden pictures / spot-the-difference / extreme dot-to-dot (different illustration pipelines, not puzzle-generator pipelines)

## 10. Research sources

Detailed citations from the May 13 research pass are in the conversation transcript. Key data anchors:

- [KDPEasy: Logic Puzzle Books for KDP](https://www.kdpeasy.com/blog/logic-puzzle-books-kdp-guide) — Futoshiki ~400 competing SKUs; Sudoku 30,000+
- [KDPEasy: Best Coloring Book Niches 2026](https://www.kdpeasy.com/blog/best-coloring-book-niches-kdp) — Dark Academia <50 competitors; cottagecore <200
- [KDPEasy: 2026 Royalty Rates Guide](https://www.kdpeasy.com/guides/2026-kdp-royalty-rates) — $9.99 cliff unchanged; 108-page print-cost-flat sweet spot
- [SFShaw: KDP Algorithm Changes 2026](https://sfshaw.com/2026/04/15/amazon-kdp-algorithm-changes-2026-guide/) — A10 seasonal pre-indexing 4–8 weeks ahead
- [DealSeek: Amazon Father's Day Sale 2026](https://dealseek.com/blog/amazon-fathers-day-sale-2026) — sale runs May 28 – June 15
