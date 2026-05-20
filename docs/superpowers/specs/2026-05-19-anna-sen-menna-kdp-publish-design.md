# Anna Sen Mennä — KDP Publish Design

*Folk horror novel publication. Pen name: Seven Martin. Real name on KDP tax/payment: Shane Martin.*

*Date: 2026-05-19*

---

## Goal

Take the existing folk horror manuscript at [projects/kdp-puzzle-press/first_book/files/](../../../projects/kdp-puzzle-press/first_book/files/) from current draft (~33k words, summarized in places) to a KDP-published paperback + ebook under the pen name **Seven Martin**, with proper cover, metadata, and interior packaging.

This is *not* a puzzle/coloring book. None of the `pocket_rooster_press` book-builder infrastructure applies. The deliverables are a Word/PDF print interior, an EPUB/KPF ebook, and a paperback cover wrap — produced as standalone files outside the puzzle-book pipeline.

## Current State (as of 2026-05-19)

**Manuscript:** Full 22-chapter draft, ~33,000 words. Title page byline currently reads "Shane Martin" (will change to Seven Martin). Ends on planned hook line "I can hear it now." Reads as a complete arc but several scenes are summarized rather than dramatized; horror beats land softer than the outline intends.

**Outline:** [`novel_outline_working.md`](../../../projects/kdp-puzzle-press/first_book/files/novel_outline_working.md) — 330 lines covering premise, characters, setting (Kivijärvi, MI — fictional U.P. iron-range town), the buried wrong (1919 killing of Mindemoyen), horror engine, lore document, and the original 27-chapter skeleton (5 chapters were consolidated in the 22-chapter draft).

**Existing files:**
- `anna_sen_menna_kdp_ebook.html` — clean serif HTML, page-break CSS, 22 chapters with `chapter-number` / `chapter-title` heads. Not yet a real EPUB.
- `anna_sen_menna_kdp_print.docx` — 123KB Word file, presumably matches the HTML.
- `chapter_01_draft.md` + `chapter_01_revised.md` — stale; draft has moved past them.

**What is missing:** revision/expansion to novel length, cover, KDP metadata, front/back matter, a real EPUB, ISBN decision, pricing, and submission.

## Decisions Locked

| Decision | Choice |
|---|---|
| Manuscript gate before publishing | Full revision: diagnostic pass → chapter-by-chapter expansion to "scarier and longer" |
| Sensitivity reader | **Skipped** (user's explicit call 2026-05-19, noted despite outline flagging as "non-negotiable") |
| Title approach | Keep `Anna Sen Mennä` as primary. English subtitle: **`A Folk Horror Novel`** (genre-anchoring for Amazon discovery; place-anchoring "A Novel of the Upper Peninsula" considered but lower discovery weight) |
| Byline | Pen name **Seven Martin** on the book (title page, cover, KDP author field). Legal name **Shane Martin** on KDP tax/payment account |
| Word-count target | 65,000–80,000 (avoids "novella" complaints in Amazon reviews; avoids padding for a contained literary horror) |
| Revision sequence | Diagnostic pass first (per-chapter map), user reviews, then chapter-by-chapter expansion with the user in the loop chapter by chapter |
| Pipeline reuse | None. The `pocket_rooster_press` pipeline is puzzle/coloring-book-shaped. Novel uses standalone Word + KDP Kindle Create / standalone EPUB |

## Project Phases

### Phase 0 — Tonight (2026-05-19)
- Write this design doc (this file)
- Produce the **diagnostic pass**: a per-chapter map of what's summarized, where dread drops, where the outline promised scenes that the draft skips, where the horror beats are undersold, and how much expansion each chapter is likely to need
- Save the diagnostic next to the manuscript at `first_book/files/REVISION_DIAGNOSTIC.md`
- Update the `kdp-catalog-status` memory to note "Anna Sen Mennä — in revision, target Q3 2026"
- Update CHECKPOINT memory so tomorrow's session has a clean resume target

### Phase 1 — Revision (the long pole, weeks)
- User reviews the diagnostic, makes structural calls (which dropped chapters to restore, which scenes to cut, etc.)
- Chapter-by-chapter expansion + horror amplification:
  - Convert summary → scene
  - Slow pace at supernatural beats (radio cutting out, hand under the ice, three knocks, footprints in the snow, lake's voice through the wall) — let dread land before it's named
  - Compound sensory specificity (cold, smell, sound, the body's response) — folk horror lives in the body
  - Strip narration during scares to Aino's perception only
  - Let scenes end on the held breath, not the exhale
  - Restore the dropped chapters from the 27→22 consolidation that pull weight (likely candidates: Snowmobiler death, Town Meeting at the Finnish Hall)
  - Lengthen the interior chapters where Aino's armor slips (Ch 10, Ch 13, Ch 24, Ch 27)
- Cadence: one chapter per work session, user reviews each chapter's expansion before moving to the next. Voice-driven prose at this length cannot be batched.
- Word-count target: 65–80k

### Phase 2 — Final polish (after Phase 1)
- Full-manuscript continuity check (Aili dies when Aino is 15; rupture at 19; the four families; the carved beam; the ledger dates)
- Line-edit pass for prose rhythm and voice consistency
- Copyedit pass (typos, grammar, Finnish-language spellings, place names)
- Optional: user-engaged human beta reader pass (deferred decision)

### Phase 3 — Cover (paperback wrap + ebook front)
- Concept: literary folk horror cover. Restrained typography. Atmospheric, not garish. **Not** the playful puzzle-book cover language (cream/teal/brass/coral) used elsewhere in this repo.
- Direction starting point: moody U.P. winter — frozen lake, dark pines, a sauna silhouette by the shore at dusk, with restrained serif typography and a desaturated palette (deep blues, bone whites, charcoal, a single warm accent — kiuas stove ember red). Comp aesthetics to study: *The Hollow Kind*, *The Bewitching*, *Mexican Gothic*.
- Deliverables:
  - Front cover only, 1600×2560, RGB, for ebook
  - Full paperback wrap (front + spine + back) at KDP's calculated dimensions. Spine width depends on final page count (a 70k-word book at 5×8 trim is ~280 pages → ~0.63" spine in 60# cream)
  - Back cover blurb (~150 words) + small author bio + (optional) author photo / silhouette
- Tooling: most likely DALL-E or Midjourney for the hero art, then composed in a layout tool (PIL/Photoshop) for typography overlay and KDP-spec wrap. The existing `cover_builder.py` in `pocket_rooster_press` is puzzle-book-shaped and not suitable — we'll build the wrap fresh.

### Phase 4 — Front & back matter
Front matter (in this order):
- Title page
- Copyright page (year, pen name, all-rights-reserved, fictional disclaimer, ISBN)
- Dedication (optional — user decision)
- (No TOC for a novel by convention, unless user prefers)

Back matter:
- About the Author (pen name bio — keep oblique, this is a debut)
- (Optional) Acknowledgments
- (Optional) "Also by Seven Martin" placeholder if user plans the series

### Phase 5 — KDP metadata
- Title: `Anna Sen Mennä`
- Subtitle: `A Folk Horror Novel`
- Author: `Seven Martin`
- Description (~3500-char Amazon-formatted HTML blurb, hook-led)
- Keywords (7 slots): folk horror, literary horror, Upper Peninsula, Finnish American, generational guilt, haunted lake, settler reckoning *(refine during Phase 5)*
- Categories (3 slots): pick from KDP browse paths — Literary Fiction > Horror, Horror > Occult, Horror > Ghosts
- BISAC codes: FIC015000 (Horror), FIC019000 (Literary), FIC056000 (Cultural Heritage)
- Age range / audience: Adult
- Pricing: paperback $14.99 (typical for ~280pp literary genre); ebook $4.99 with KDP Select 70% royalty
- KDP Select enrollment: yes (90-day exclusivity for Kindle Unlimited inclusion + promotional levers)

### Phase 6 — Interior files
- Print: Word `.docx` formatted to KDP 5×8 trim, 0.5" gutter, 1pt safe area, headers (author name / title alternating), page numbers, scene-break ornaments. Convert to PDF via Word's PDF/A export for KDP upload. The existing `anna_sen_menna_kdp_print.docx` is a starting point — re-flow at the end against final manuscript.
- Ebook: rebuild from final manuscript. Two options:
  - **A (Recommended):** Kindle Create — Amazon's free tool, imports Word, produces `.kpf` for direct KDP upload, handles reflowable text, Kindle-friendly nav. Lowest friction.
  - **B:** Hand-build EPUB from the HTML file. More control, more work. Unnecessary unless we want specific typographic effects Kindle Create can't do.

### Phase 7 — ISBN
- **Recommendation:** Use KDP's free ISBN for the paperback. Trade-off: KDP becomes the imprint of record (publisher line in the metadata reads "Independently Published"). Pen name still owns the book. If we want to publish under "Pocket Rooster Press" as the imprint, we buy a Bowker ISBN ($125 for one, $295 for ten). For a debut horror novel under a pen name where the imprint doesn't carry brand value, free KDP ISBN is correct.
- Ebook does not need an ISBN; KDP assigns an ASIN.

### Phase 8 — Submit + verify
- Upload paperback files (cover + interior PDF) to KDP, run their previewer
- Order paperback proof, verify physical copy
- Upload ebook (KPF) to KDP, preview in Kindle Previewer
- Hit publish on both. KDP review typically 24–72 hours.

## Out of Scope (for this iteration)

- Audiobook narration (ACX is a separate pipeline; defer until paperback has traction)
- Hardcover edition (KDP supports it but spine math + cover wrap is a separate deliverable; defer)
- Book launch / marketing strategy (ARC reviewers, NetGalley, etc.) — deferred to a launch-planning brainstorm later
- The sequel hooked at Ch 27 — that's book two, not this project
- Sensitivity reader engagement — explicitly skipped by user 2026-05-19

## Risks Acknowledged

- **Sensitivity reader skipped.** Book centrally depicts the 1919 killing of an Anishinaabe woman (Mindemoyen) by Finnish settlers and includes an Ojibwe elder character. Reputational risk on book-Twitter / Goodreads is real. User has weighed this and chosen to proceed. Documented here so the choice is on the record.
- **Word-count growth uncertainty.** The 65–80k target assumes the diagnostic finds expandable summarized scenes. If the manuscript turns out to be denser than it reads, growth may stall earlier; if looser, may overshoot. Diagnostic will give the real number.
- **Pen-name discoverability.** "Seven Martin" has no platform. KDP discovery for a debut depends entirely on metadata, categories, and the cover. Plan accommodates this with category choices in Phase 5.

## How to Resume

Tomorrow morning, read in this order:
1. This file (overview + locked decisions)
2. `first_book/files/REVISION_DIAGNOSTIC.md` (the per-chapter map produced tonight)
3. `first_book/files/novel_outline_working.md` (the bible — for any continuity questions)
4. The ebook HTML at `first_book/files/anna_sen_menna_kdp_ebook.html` (the actual manuscript)

Then pick a chapter to expand. Suggested start: whichever chapter the diagnostic flagged as "most summarized, most expandable, biggest horror payoff" — that's where the visible improvement-per-hour will be highest, which is a good morale lever for the start of a long revision.
