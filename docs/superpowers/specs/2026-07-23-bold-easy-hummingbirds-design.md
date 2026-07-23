# Bold & Easy Hummingbirds — Volume 1 · Design Spec

**Date:** 2026-07-23
**Status:** Design approved (brainstorming); ready for implementation planning.
**Imprint:** Pocket Rooster Press
**book_id:** `bold-easy-hummingbirds-v1`
**Origin:** First Etsy sale was the `single-hummingbird-garden` page (Ruby-throated Hummingbird at honeysuckle, bold line art). This spec expands that proven single page into a full dual-format hummingbird coloring book.

---

## 1. Goal & strategy

Build **one 40-design hummingbird coloring book** and ship it to **both** channels from a single asset set:

- **Etsy first** (fast revenue + live conversion data): full-book PDF, four themed mini-packs, and a curated set of ~15 single-page listings.
- **Amazon KDP after** (evergreen paperback, gift market): 8.5×11 paperback, launched once Etsy validates and ideally timed for the spring / Mother's Day 2027 peak.

This reuses the existing Songbirds pipeline end to end — the only net-new work is the prompt bank, the generated art, and the listing copy.

### Positioning (decided)
**Species + flowers, large-print.** Combine the two proven market angles:
- **Large-print / senior-friendly execution** — thick outlines, large open fill regions, one bird per page, minimal clutter, 8.5×11. Broadest gift market (adult children buying for parents/grandparents 65+), lowest-competition long-tail keywords.
- **Named real species + their nectar flowers** — the naturalist/gardener differentiator that keeps the book from being a generic "bold & easy" clone and gives a clean series engine.

### Why this wins (from market research, 2026)
- "Bold & easy" is ~40% of the top-50 Amazon coloring bestsellers — a booming, not fading, style.
- Hummingbird demand is evergreen, but **most hummingbird coloring books are still the older intricate/realistic style**; only ~2 dedicated "bold & easy hummingbird" books exist. The style has barely colonized this subject → real opening.
- The single page that already sold **is** the recommended product (large-print bold line + species + nectar flower), so we're scaling a validated concept, not guessing.
- Competition note: differentiate on **content** (named species + specific nectar plants + large-print senior angle), not on the "bold & easy" label alone. The one close competitor (GB Liber "Field & Feather," 45 designs) under-markets the flower-pairing + species-label hook.

---

## 2. Product specification

| Attribute | Value |
|---|---|
| Title | **Bold & Easy Hummingbirds** |
| Subtitle | *40 Large-Print Coloring Designs of Hummingbirds & the Flowers They Love — Real Species for Adults, Seniors & Bird Lovers (Volume 1)* |
| Series | Bold & Easy Hummingbirds · Volume 1 (sibling to Bold & Easy Songbirds) |
| Trim | 8.5 × 11 in (`TEMPLATE_85X11_LARGEPRINT`) |
| Designs | 40, single-sided |
| Page count | ~86 (matches Songbirds band) |
| Interior | Black & white line art, 1-bit |
| Style | "Bold-and-easy-with-good-detail," **tuned larger/simpler** than Songbirds for the senior large-print angle: thick 5–7px outer outlines, thinner 2–3px inner detail, but fewer/larger internal fill regions per page |
| Kind | `kind="coloring"` (cascades genre defaults) |
| Palette | `PALETTE_BIRDWATCHER` (matches the natural-history shelf aesthetic; reused from Songbirds) |

### Style guardrails (inherited from Songbirds prompt bank)
One hummingbird as the dominant subject (60–75% of frame) — with the single deliberate exception of the two-bird finale (design 40) — species-accurate proportions/posture, paired with **one** clear nectar flower or simple setting. Pure white background, all outlines closed, generous open white space inside shapes, portrait orientation. No shading/gradients/hatching/greyscale, no text/numbers/watermark, no human figures. Black line art on white only.

### Naturalist hook without cluttering the art
Art pages stay **text-free** (markers-friendly). The naturalist/birder value is delivered in **front matter**: an illustrated **"Hummingbirds in This Book" index/checklist** — species name + its featured flower — which also serves as a strong Amazon "Look Inside" selling point. (Alternative considered and rejected for v1: per-page captions, which fight the clean large-print look.)

---

## 3. Content plan — the 40 designs

Variety comes from different flowers, poses, and settings (hovering, perched, at a feeder, bathing, in flight) across ~16 real species. Four sections of 10. **Designs 1 and 2 reuse the already-generated Songbirds hummingbird art** (Ruby-throated at honeysuckle = the page that sold; Anna's at a feeder).

Each entry below is prompt-ready at the "subject" level; the implementation step wraps these in the shared `style_preamble` in the prompt-bank JSON.

### Section A — Backyard Visitors (common species, feeder/garden)
1. **Ruby-throated Hummingbird** hovering at a trumpet-shaped honeysuckle flower, wings spread in motion lines, long needle beak, four small leaves on the vine. *(reuse — the sold page)*
2. **Anna's Hummingbird** perched on the rim of a small glass nectar feeder, body upright, tail down, one nectar drop at the spout. *(reuse)*
3. **Rufous Hummingbird** hovering at a red bee balm (bergamot) bloom, wings in motion, tail fanned.
4. **Black-chinned Hummingbird** perched on a thin garden stake beside a tall salvia spike with three open florets.
5. **Allen's Hummingbird** hovering at a single orange monkeyflower, body angled forward.
6. **Costa's Hummingbird** perched on a chuparosa branch, a couple of tubular desert-honeysuckle blooms beside it.
7. **Broad-tailed Hummingbird** hovering at a nodding blue columbine, spurred petals clearly drawn.
8. **Calliope Hummingbird** (very small) perched on a slender twig next to a penstemon stalk with two bell flowers.
9. **Ruby-throated Hummingbird** perched on a shepherd's-hook feeder pole, a classic bottle nectar feeder hanging below.
10. **Anna's Hummingbird** bathing at a broad leaf cupping a large water droplet, a fuchsia branch arching above.

### Section B — Hummingbirds & Their Flowers (signature bird + plant pairings)
11. **Ruby-throated Hummingbird** at a trumpet vine (Campsis) cluster, three large trumpet blooms.
12. **Broad-tailed Hummingbird** at a scarlet penstemon spike, several tubular flowers.
13. **Anna's Hummingbird** at a pineapple-sage / red salvia spike.
14. **Rufous Hummingbird** at an orange columbine, hovering below the nodding bloom.
15. **Black-chinned Hummingbird** at a desert willow blossom on a slender branch.
16. **Costa's Hummingbird** at an ocotillo flower spike, tall and tipped with tubular blooms.
17. **Calliope Hummingbird** at an Indian paintbrush cluster.
18. **Allen's Hummingbird** at a California fuchsia (zauschneria) with pendant tubular flowers.
19. **Ruby-throated Hummingbird** at a cardinal flower (Lobelia cardinalis) spike.
20. **Broad-billed Hummingbird** at an agave flower stalk, hovering at the tubular florets.

### Section C — In the Garden (flower-forward cottage-garden scenes)
21. Hummingbird at a **hanging fuchsia basket**, two pendant blooms in the foreground.
22. Hummingbird at **coral bells (heuchera)** airy flower sprays.
23. Hummingbird at a **morning glory** trumpet on a twining vine.
24. Hummingbird at a single large **hibiscus** bloom with prominent stamen column.
25. Hummingbird at **petunia** blossoms spilling from a pot rim.
26. Hummingbird at a **foxglove** spike, several bell flowers.
27. Hummingbird at a **lantana** flower cluster.
28. Hummingbird at a **red hot poker (kniphofia)** torch bloom.
29. Hummingbird at a **zinnia** with a broad flat flower face.
30. Hummingbird at **nasturtium** blooms trailing over a low garden wall.

*(Section C species assignment: rotate plausible garden species — Ruby-throated, Anna's, Rufous, Black-chinned — across the ten so the "species-accurate" promise holds; finalized in the prompt bank.)*

### Section D — Showstoppers (dramatic / exotic species for visual variety)
31. **Broad-billed Hummingbird** perched in profile showing its striking bill, beside a salvia.
32. **Rivoli's (Magnificent) Hummingbird** hovering at a tall penstemon.
33. **Blue-throated Mountaingem** perched on a mossy branch, tail long and squared.
34. **Buff-bellied Hummingbird** at a Turk's cap bloom.
35. **Violet-crowned Hummingbird** at an agave stalk.
36. **Sword-billed Hummingbird** (Andean) at a long pendant passionflower — dramatic ultra-long bill.
37. **Booted Racket-tail** hovering at a fuchsia — dramatic racket-tipped tail feathers.
38. **Marvelous Spatuletail** at a mountain wildflower — dramatic spatuled tail.
39. **Fiery-throated Hummingbird** at a tropical heliconia / bromeliad bract.
40. **Two hummingbirds** meeting at a single large trumpet flower — a two-bird finale page.

---

## 4. Front matter & intro

- Title page + copyright/imprint page (standard `assemble_coloring_book`).
- **Intro** (`INTRO` constant) — warm, senior-friendly, in the Pocket Rooster Press voice; mentions large-print bold lines, real species + their flowers, single-sided pages, "color the ruby throat any color you like."
- **"Hummingbirds in This Book"** illustrated index/checklist (species + featured flower). Doubles as the Look-Inside hook.

---

## 5. Etsy product ladder (launches first)

One 40-design asset set → four tiers (all via the existing `etsy_rooster` pipeline; the pack extractor is the version fixed 2026-07-23):

| Tier | Contents | Price (launch) | Notes |
|---|---|---|---|
| Full-book PDF | all 40 pages | $6.99–8.99 | flagship digital listing |
| Themed mini-packs (×4) | the four sections, 10 pages each | ~$4.99 each | `extract_page_subset` with correct design indices |
| Curated singles (~15) | best-selling / most-searchable species+flower pages | $1.99–2.99 each | led by the proven Ruby-throated; **expand by performance** |
| Existing single | `single-hummingbird-garden` | unchanged | same asset, still selling — leave live |

- **Curated ~15 singles** chosen for search intent: named species (Ruby-throated, Anna's, Rufous, Broad-tailed, Calliope, Allen's, Costa's) and strong flower pairings (trumpet vine, bee balm, salvia, columbine, fuchsia, cardinal flower). Remaining designs are added as singles based on Etsy conversion data.
- **Deferred lever (NOT in v1):** grayscale/"dark" pre-shaded versions as a light+dark up-sell. Sells well on Etsy but is a separate art render — held for v1.1 to keep this launch focused.
- Each Etsy listing gets previews + page-flip video via the existing builders; **every rendered page is visually verified before listing copy is authored** (per the "never blind content picks" rule).

---

## 6. KDP paperback (follows Etsy)

Metadata mirrors the Songbirds pattern:

- **Pricing:** $9.99 launch (current 60%-royalty floor) → **$11.99** after ~30 reviews.
- **Categories:** *Books > Crafts, Hobbies & Home > … > Drawing > Pencil Drawings*; *Books > Sports & Outdoors > Nature & Ecology > Birdwatching*.
- **BISAC:** NON026000 (Non-classifiable) + SEL036000 (Self-Help / Creativity).
- **7 keywords** (research-derived, no title-word repeats): large-print coloring for seniors / low vision; bird-lover gift for grandma/mom; easy coloring for beginners thick lines; garden flowers + nectar plants (trumpet vine, salvia, columbine); stress relief / relaxation; hummingbird gifts for women / grandmother; simple big designs single-sided ("colouring" UK spelling).
- **AI disclosure:** `images = AI-Generated` (Gemini Nano Banana Pro), hand-edited before publish. Private KDP flag, not shown to readers.
- **Cross-sell:** launch alongside Bold & Easy Songbirds for Amazon "Frequently Bought Together."

---

## 7. Build pipeline (existing machinery)

New `book_id: bold-easy-hummingbirds-v1`. Steps:

1. **Book module** — copy `books/bold_easy_songbirds_v1.py` → `books/bold_easy_hummingbirds_v1.py`; set `BOOK_ID`, `TITLE`, `SUBTITLE`, `INTRO`, `DESIGN_COUNT=40`, `THEME_TAGS`, back-cover bullets, `series_label`. `kind="coloring"`.
2. **Prompt bank** — `data/coloring_prompts/bold-easy-hummingbirds-v1.json`: shared `style_preamble` (Songbirds base, tuned for larger fill regions + hummingbird proportions) + the 40 subjects from §3, in four `section`s.
3. **Register** the book_id in `cli.py`.
4. **Generate art** (out-of-band): `node web.ui/backend/scripts/generate_coloring_interiors.mjs bold-easy-hummingbirds-v1` (Gemini, 4K PNGs).
5. **Process** to 1-bit B&W: `python scripts/process_coloring_pages.py bold-easy-hummingbirds-v1`.
6. **Build** interior + cover PDFs: `python -m pocket_rooster_press.books.bold_easy_hummingbirds_v1`.
7. **Verify** every processed page visually.
8. **KDP metadata** — `metadata/bold_easy_hummingbirds_v1.json` + `_listing.md` (copy Songbirds, edit).
9. **Etsy derive** — `kdp_importer.load_coloring_niche` → full PDF + mini-packs + curated singles + previews + videos → author + publish listings.

**Cover:** birdwatcher palette, AI-rendered hero hummingbird, decoration-only (reserve top ~430px + bottom ~160px of the 1024×1336 hero for wrap typography, per the hero rule). The hero species is chosen from whichever design tests best on Etsy singles.

---

## 8. Timeline & sequencing

- **Now → early fall 2026:** build the 40 designs; launch the full Etsy ladder + curated singles.
- **After Etsy validation (weeks):** submit KDP paperback; aim live for **Q4 2026 holiday gifting** and, primarily, **spring / Mother's Day 2027**.
- Hummingbirds are evergreen, so an off-peak Etsy launch is fine; the spring 2027 wave is the paperback's main event.

---

## 9. Success metrics & risks

**Success signals**
- Etsy: sales velocity on the full PDF + which species/flower singles convert (a live A/B test). That data selects (a) the KDP cover hero species and (b) the Volume 2 lineup.
- KDP: review accumulation and Best Seller Rank in Birdwatching / Pencil Drawings; move price to $11.99 after ~30 reviews.

**Risks & mitigations**
- *Art consistency / species accuracy (Gemini variance):* the mandatory per-page verify step; regenerate off-model pages before listing.
- *Competition (Field & Feather et al.):* differentiate on the flower-pairing + named-species index + senior large-print angle; don't compete on the bare "bold & easy" term.
- *Off-peak launch:* mitigated by evergreen demand + singles funnel; time the KDP push to spring 2027.
- *Listing sprawl (singles):* start at ~15 curated, expand only on performance.

---

## 10. Out of scope for v1

- Grayscale / "dark" pre-shaded editions (v1.1 Etsy up-sell).
- Volume 2 (regional/western or seasonal) — one prompt-bank refresh away once V1 validates.
- Per-page captions on art pages.
