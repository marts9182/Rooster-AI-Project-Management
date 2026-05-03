# Copilot Bootstrap Prompt — kdp-puzzle-press

Paste the prompt below into GitHub Copilot Chat (Agent mode) inside a fresh, empty repo named `kdp-puzzle-press`. It is fully self-contained — no prior conversation context required.

---

## THE PROMPT (copy everything between the lines)

---

You are bootstrapping a brand-new Python repository called **`kdp-puzzle-press`**. This is the production pipeline for **Pocket Rooster Press**, an Amazon KDP puzzle-book imprint (sub-brand of the "Rooster" brand family alongside the Hero Rooster mobile game). The pipeline must generate print-ready PDF interiors and covers for self-published paperback puzzle books.

Build the entire scaffolding now: folder structure, dependency files, base modules with working stub implementations, config, tests, and a README. Do not ask clarifying questions — every decision below is locked. Use modern Python idioms (3.11+), type hints everywhere, and prefer small, composable modules over large ones.

### Project goals

Produce three launch books, then scale the winner into a 5-volume series:

1. **Travel Sudoku — Pocket Edition Vol. 1** — 6x9 paperback, 120 sudoku puzzles across 4 difficulty tiers (30 each: easy/medium/hard/expert), 140-150 pages.
2. **Cryptograms of Ancient Wisdom** — 6x9 paperback, 100 cryptograms with substitution cipher + 1 hint letter. Quote pool is **public-domain only**: Marcus Aurelius (*Meditations*), Lao Tzu (*Tao Te Ching*), Aesop's fables, Benjamin Franklin proverbs. **Do NOT use Bible verses, Shakespeare, modern lyrics, or any living-author content** in this book.
3. **Gardener's Word Search — Large Print** — 8.5x11 paperback, 80 word searches with themed sections (vegetables, herbs, flowers, tools, pests, seasons). 18-22pt body text, 0.75" gutter.

### Brand identity (use throughout copyright pages, back matter, README)

- Imprint: **Pocket Rooster Press**
- Tagline: "Puzzles with personality."
- Cross-promo line for back matter: "From the makers of Hero Rooster."
- Typography for covers/PDFs: **Playfair Display** (titles) + **Lato** (body) — both free Google Fonts; download via `requirements.txt` step or commit to `assets/fonts/`.
- Per-series color palettes (hex) — use these in cover templates:
  - Travel Sudoku: teal `#1F4E5F` / sand `#E8C7A0` / ivory `#FAF6EE`
  - Cryptograms: oxblood `#6B2C2C` / parchment `#EDE0C8` / ink `#1A1A1A`
  - Gardener's: forest `#2E5D3A` / terracotta `#C97B5A` / cream `#F5EFE0`

### Folder structure to create

```
kdp-puzzle-press/
  README.md
  pyproject.toml                    # project metadata, dependencies, ruff/black/pytest config
  .gitignore                        # Python + VS Code + output PDFs
  .python-version                   # 3.11
  src/
    pocket_rooster_press/
      __init__.py
      config.py                     # trim sizes, margins, font paths, palettes as constants
      generators/
        __init__.py
        base.py                     # abstract Puzzle + PuzzleSet base classes
        sudoku.py                   # uses py-sudoku; 4 difficulty tiers; unique-solution validation
        word_search.py              # 15x15 default grid, 8 directions, profanity blacklist on fill letters
        crossword.py                # uses genxword; symmetric grid; orphan-cell check
        cryptogram.py               # A-Z substitution cipher + 1 hint letter; hard mode uses all 26 letters
      themes/
        __init__.py
        loader.py                   # JSON loader with schema validation
        data/
          gardening_words.json      # sections: vegetables, herbs, flowers, tools, pests, seasons
          ancient_wisdom_quotes.json # entries tagged by source: aurelius/laotzu/aesop/franklin
          travel_sudoku_metadata.json
      layout/
        __init__.py
        pdf_builder.py              # ReportLab; KDP-spec PDF; embedded fonts; 300dpi
        templates.py                # template_6x9_pocket + template_85x11_largeprint
        book_assembler.py           # title, copyright, intro, instructions, puzzles, answer key, back matter
      covers/
        __init__.py
        cover_builder.py            # ReportLab cover w/ dynamic spine width (page count × paper thickness)
        mascot/                     # placeholder for rooster mascot art (color + B&W variants)
          README.md                 # describes expected files: rooster_color.png, rooster_bw.png, rooster_seal.svg
      books/
        __init__.py
        travel_sudoku_v1.py         # builds Book 1 end-to-end
        ancient_wisdom_cryptograms.py # builds Book 2
        gardeners_word_search.py    # builds Book 3
      cli.py                        # `python -m pocket_rooster_press build <book-id>`
  tests/
    __init__.py
    test_sudoku.py                  # asserts unique solution, difficulty distribution
    test_word_search.py             # asserts all words placed, no profanity in fill
    test_crossword.py               # asserts symmetric grid, no orphans
    test_cryptogram.py              # asserts clean decrypt, hint letter present
    test_pdf_builder.py             # asserts PDF opens, page count matches, embedded fonts
    test_themes_loader.py           # asserts JSON schema validation works
  metadata/
    listing_template.md             # KDP listing template: title, subtitle, 7 keywords, 2 categories, description
    travel_sudoku_v1_listing.md
    ancient_wisdom_cryptograms_listing.md
    gardeners_word_search_listing.md
  output/                           # .gitignored — generated PDFs land here
    .gitkeep
  scripts/
    setup_fonts.py                  # downloads Playfair Display + Lato from Google Fonts to assets/fonts/
  assets/
    fonts/                          # .gitignored except .gitkeep
      .gitkeep
    word_blacklist.txt              # profanity blacklist for word-search fill (start with a basic list)
  docs/
    KDP_SPEC.md                     # KDP technical requirements: trim, margins, bleed, DPI, fonts, ISBN
    BUILD_PROCESS.md                # how to generate a book end-to-end
    VERIFICATION.md                 # programmatic + manual + market verification checks
```

### Dependencies (pin in pyproject.toml)

```
python = ">=3.11"
reportlab = "^4.2"
pillow = "^10.4"
py-sudoku = "^1.0"
genxword = "^1.0"          # if unavailable on PyPI, fall back to a pure-python crossword fill stub with a TODO
jsonschema = "^4.23"
click = "^8.1"             # for the CLI

[dev]
pytest = "^8.0"
pytest-cov = "^5.0"
ruff = "^0.6"
black = "^24.0"
mypy = "^1.11"
```

### Locked technical decisions (do not deviate)

- **PDF format:** ReportLab output, embedded fonts, 300 DPI, B&W interior, PDF/X-1a-compatible.
- **Trim & margins:**
  - 6x9 pocket: 0.625" inner / 0.375" outer / 0.5" top/bottom margins.
  - 8.5x11 large-print: 0.75" inner gutter / 0.5" outer / 0.5" top/bottom; body text 18-22pt.
- **Difficulty progression:** all books place easy puzzles first, hardest last.
- **Answer key:** every book has a back-matter answer key — non-negotiable.
- **ISBN:** none assigned in code; KDP issues free ones at publish time.
- **Pricing target (in metadata only):** $6.99-$8.99 paperback.
- **Sudoku grid size at 6x9:** target 3.5" square minimum for readability.
- **Word search grid size:** 15x15 default, 8-direction placement; reject puzzles where any word from the input list fails to place.
- **Cryptogram cipher:** simple A-Z substitution; one letter is shown as a "hint." Hard mode requires the cipher to use all 26 letters at least once across the encoded text.
- **Public-domain enforcement:** the cryptogram theme JSON must include a `source` field per entry; validate at load time that source is in the allowed set `{"aurelius", "laotzu", "aesop", "franklin"}` for the Ancient Wisdom book. Fail loudly otherwise.

### Verification — implement these tests

**Programmatic (in `tests/`):**
1. `test_sudoku.py` — every generated puzzle has exactly one solution (validate with the solver). Difficulty tiers produce roughly the right clue counts.
2. `test_word_search.py` — every input word appears in the grid at least once at correct coords; random fill contains zero blacklisted substrings.
3. `test_crossword.py` — grid is symmetric; no orphan cells; every clue has a unique answer.
4. `test_cryptogram.py` — applying the cipher key decrypts to the original quote; hint letter is present and visible; hard-mode puzzles cover all 26 letters.
5. `test_pdf_builder.py` — output PDF opens, has the expected page count, has embedded fonts.
6. `test_themes_loader.py` — JSON files pass schema validation; cryptogram source allowlist is enforced.

### CLI to implement

```bash
python -m pocket_rooster_press build travel-sudoku-v1
python -m pocket_rooster_press build ancient-wisdom-cryptograms
python -m pocket_rooster_press build gardeners-word-search
python -m pocket_rooster_press build all
```

Each build command outputs `output/<book-id>/interior.pdf` and `output/<book-id>/cover.pdf`.

### Stub guidance

- For each generator, write a **working** implementation if straightforward (sudoku via `py-sudoku`, cryptogram via random A-Z mapping). For crossword, if `genxword` is unavailable, leave a clearly-marked `TODO(crossword)` stub that returns a tiny 5x5 hand-coded sample so the rest of the pipeline still runs end-to-end.
- For mascot art, write a placeholder ReportLab function that draws a simple circle with text "POCKET ROOSTER PRESS" so cover generation works before real art is dropped in.
- Theme JSON files: seed `ancient_wisdom_quotes.json` with **at least 20 real public-domain quotes** (5 each from Aurelius, Lao Tzu, Aesop, Franklin) so Book 2 builds runnable. Seed `gardening_words.json` with at least 8 themed sections of 15-20 words each. Seed `travel_sudoku_metadata.json` with title/subtitle/intro copy.

### README.md must include

- Imprint description + brand family
- Quickstart: clone, install, `python -m pocket_rooster_press build all`
- Folder structure overview
- How to add a new book (steps: theme JSON → book module → metadata → CLI entry)
- KDP technical specs summary
- Verification checklist (programmatic + manual proof-copy + launch metrics)
- Note about font installation (`python scripts/setup_fonts.py`)
- License: `Proprietary — all generated puzzle content © Pocket Rooster Press; underlying source quotes public domain.`

### After scaffolding

Run `pytest` and confirm all tests pass (or are clearly marked as expected-to-fail TODOs for the crossword stub). Run `ruff check .` and `black --check .` and ensure clean. Print a summary at the end: created files, passing tests, and the exact next 3 commands the user should run.

**Begin now. Create everything in one continuous pass.**

---

## How to use

1. Create a new empty GitHub repo named `kdp-puzzle-press` (private to start).
2. Clone it locally.
3. Open in VS Code, open Copilot Chat, switch to **Agent mode**.
4. Paste everything between the horizontal rules above as a single message.
5. Let Copilot run end-to-end. Review the diff before committing.
6. Drop in your real Hero Rooster mascot art at `src/pocket_rooster_press/covers/mascot/` when ready.

## Tips for getting better results

- If Copilot stops mid-scaffold, reply: "Continue. Finish all remaining files in the spec."
- If a generator algorithm comes back too primitive, reply: "Improve the [sudoku/word_search/...] generator: [specific issue]."
- Once scaffold passes tests, move to per-book content work in separate focused chats — don't try to do polish + content + algorithms all in one session.
