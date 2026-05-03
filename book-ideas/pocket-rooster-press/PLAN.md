# Pocket Rooster Press — KDP Puzzle Book Publishing Plan

**Status:** Plan locked, awaiting implementation.
**Created:** 2026-04-27 planning session.
**Future code location:** `projects/kdp-puzzle-press/`
**Companion doc:** [MARKET-RESEARCH.md](./MARKET-RESEARCH.md)

---

## Brand Identity (LOCKED)

- **Imprint name:** Pocket Rooster Press
- **Parent brand family:** Rooster → Hero Rooster (mobile game, see `projects/heroRooster/`) + Pocket Rooster Press (puzzle book imprint)
- **Mascot:** Hero Rooster character, restyled scholarly — reading glasses + holding a quill, in a circle seal (B&W-friendly for spines)
- **Tagline:** "Puzzles with personality."
- **Cross-promo:** "From the makers of Hero Rooster" line + QR code to game on back cover (bidirectional funnel)
- **Future sub-line:** "Big Rooster Large Print" for 8.5x11 senior-targeted books
- **Typography:** Playfair Display (titles) + Lato (body) — both free Google Fonts
- **Per-series palettes:**
  - Travel Sudoku: teal `#1F4E5F` / sand `#E8C7A0` / ivory `#FAF6EE`
  - Cryptograms: oxblood `#6B2C2C` / parchment `#EDE0C8` / ink `#1A1A1A`
  - Gardener's: forest `#2E5D3A` / terracotta `#C97B5A` / cream `#F5EFE0`

## Domain & Handle Availability (verified 2026-04-27)

All open — register before any cover art goes public (~$12 total):
- `pocketroosterpress.com` — available at Namecheap/Whois
- Instagram `@pocketroosterpress` — unclaimed
- Etsy shop `pocketroosterpress` — unclaimed
- Also available: `.org`, `.net`, `.shop`, `.io`

---

## Three Launch Books (LOCKED)

### Book 1: Travel Sudoku — Pocket Edition Vol. 1
- Trim: **6x9 paperback**
- Content: 120 sudoku puzzles, 4 difficulty tiers (30 each: easy/medium/hard/expert)
- Page count target: 140-150 pages
- Cover theme: travel/suitcase + sudoku grid motif (teal/sand palette)
- Price: $6.99
- Tests: generic-but-themed mass appeal

### Book 2: Cryptograms of Ancient Wisdom
- Trim: **6x9 paperback**
- Content: 100 cryptograms with substitution cipher + 1 hint letter
- **Quote pool (LOCKED):** Marcus Aurelius (*Meditations*) + Lao Tzu (*Tao Te Ching*) + Aesop's fables + Benjamin Franklin proverbs
- Public-domain only — no Bible (reserved for separate faith-based book), no living authors
- Cover theme: oxblood/parchment, classical motifs
- Price: $6.99-$7.99
- Tests: premium niche positioning

### Book 3: Gardener's Word Search — Large Print
- Trim: **8.5x11 paperback** (large print — senior-friendly)
- Content: 80 word searches, themed sections (vegetables, herbs, flowers, tools, pests, seasons, etc.)
- 18-22pt body text, generous 0.75" gutter
- Cover theme: forest/terracotta, garden illustration
- Price: $7.99-$8.99
- Tests: hobbyist gift-market

---

## Production Pipeline (Python, free tools)

**Repo location:** `projects/kdp-puzzle-press/`

```
kdp-puzzle-press/
  generators/
    word_search.py      # 15x15 grid, 8 directions, profanity blacklist on fill
    sudoku.py           # py-sudoku lib, 4 difficulty tiers, unique-solution validation
    crossword.py        # genxword lib, autofill from word/clue list
    cryptogram.py       # A-Z substitution cipher, 1 hint letter, all-26-letters check (hard mode)
  themes/
    gardening_words.json
    ancient_wisdom_quotes.json    # Aurelius/Lao Tzu/Aesop/Franklin
    travel_sudoku_metadata.json
    ...
  layout/
    pdf_builder.py      # ReportLab, supports 2 templates:
                        #   - template_6x9 (pocket)
                        #   - template_85x11_largeprint (18-22pt, 0.75" gutter)
    book_template.py    # title, copyright, intro, instructions, puzzles, answer key, back matter
  covers/
    cover_template.py   # ReportLab cover w/ spine width calc per page count
    mascot/             # rooster mascot art assets (color + B&W)
  output/               # generated PDFs ready for KDP
  metadata/
    listing_template.md # per-book: title, subtitle, 7 keywords, 2 categories, description
```

**Library choices (locked):**
- `py-sudoku` — sudoku gen + uniqueness check
- `genxword` — crossword autofill
- `reportlab` — print-ready PDF (300dpi, embedded fonts, B&W interior)
- `Pillow` — image handling
- Custom code — word search + cryptogram generators

**KDP technical requirements:**
- Embedded fonts, 300dpi, B&W interior (lower print cost = higher royalty)
- 6x9: ~0.625" inner / 0.375" outer margins
- 8.5x11 large print: 0.75" gutter, 0.5" outer
- ISBN: use **free KDP-assigned** for test books (don't buy own)

---

## Phased Execution Plan

### Phase 1 — Foundation (no code)
1. Create Amazon KDP account (kdp.amazon.com), tax interview (W-9 / W-8BEN), payment setup
2. Register `pocketroosterpress.com` + claim IG + Etsy handles (~$12)
3. Install Python 3.11+, ReportLab, Pillow, py-sudoku, genxword
4. Decide on AI-disclosure approach (KDP requires disclosing AI text/images on publish form)
5. Generate scholarly Hero Rooster mascot art (AI tool — DALL-E/SDXL, free options)

### Phase 2 — Build Pipeline
- Scaffold `projects/kdp-puzzle-press/` per structure above
- Implement four generators with verification tests
- Implement hybrid PDF builder (both templates)
- Implement cover builder with spine-width math

### Phase 3 — Produce Book #1 (Travel Sudoku)
- Generate 120 puzzles, build PDF, design cover
- Order 1 author proof copy ($4-5)
- Verify physical quality before publish

### Phase 4 — Produce Books #2 & #3 (parallel)
- Same template — swap content + theme + cover
- This is the leverage point

### Phase 5 — KDP Listings
- Title formula: `[Theme] [Puzzle Type] — [Format Modifier] | [Volume Promise]`
  - e.g. "Travel Sudoku Large Print: 120 Pocket-Size Puzzles for Adults & Seniors — Volume 1"
- 7 backend keywords (harvest from Amazon autocomplete, long-tail combos)
- 2 niche categories (least competitive in KDP picker)
- $6.99 paperback, "Expanded Distribution" off initially
- Submit, wait 24-72hrs review, order proof, then go live

### Phase 6 — Launch + Measure (60 days)
- Publish all 3 simultaneously (A/B test theme angles)
- No paid ads (under-budget); rely on organic + keyword optimization
- Weekly: track BSR, sales, reviews via KDP dashboard CSV
- 30 days: identify winner → start Vol 2 of that theme
- 60 days: 5-book series of the winning theme; kill losers

---

## Verification Strategy

**Programmatic (per puzzle):**
- Sudoku: every puzzle has exactly one solution (solver-validated)
- Word search: all words from list placed; profanity blacklist on random fill letters
- Crossword: every clue has unique answer; no orphan cells; symmetric grid
- Cryptogram: clean decrypt; one quote per puzzle; hard mode uses all 26 letters

**Per book (manual):**
- Open PDF in Adobe Reader → 300dpi check, embedded fonts, no missing glyphs
- KDP Previewer → no margin/bleed warnings
- Physical proof copy → print quality, gutter readability, ink density
- Read 5 random puzzles end-to-end → fun + solvable

**Per launch (market signals):**
- Page 1-3 ranking on primary keyword in 14 days
- First sale within 30 days (organic)
- First review within 60 days (request via KDP follow-up email)

---

## Decisions Locked

| Decision | Locked Value |
|---|---|
| Audience | Adults / seniors (large print) / niche hobbyists. Kids excluded. |
| Format | Hybrid: 6x9 for Sudoku + Cryptogram, 8.5x11 large-print for Word Search |
| Tooling | Python pipeline, free tools only |
| Volume | 3 test books → 5-volume series of winner |
| Budget | $0-50/mo (proof copies, ~$12 domain/handles) |
| AI art | Yes, with KDP disclosure |
| Pricing | $6.99-$8.99 paperback |
| ISBN | Free KDP-assigned (test phase) |
| Series strategy | Plan from day one; cover consistency for recognition |

---

## Open Items / Next Session Pickup

When resuming work in a new session:
1. Has the user registered the domain + handles yet?
2. Has the scholarly Hero Rooster mascot art been generated?
3. Is the user ready to scaffold `projects/kdp-puzzle-press/` and start coding generators?

Reference original game project: `projects/heroRooster/` — for mascot character reference and brand alignment.
