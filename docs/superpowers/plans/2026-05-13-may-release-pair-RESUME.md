# May 2026 Release Pair — Resume Notes (2026-05-13 EOD)

Paused end of day 2026-05-13. Resume tomorrow from here.

**Plan:** [2026-05-13-may-release-pair.md](2026-05-13-may-release-pair.md)
**Spec:** [../specs/2026-05-13-may-release-pair-design.md](../specs/2026-05-13-may-release-pair-design.md)

---

## What's done ✅ (16 commits on `main`)

### Outer repo (`Rooster-AI-Project-Management`)
- Spec committed
- Plan committed with Plan Corrections preamble
- All 3 spike result notes in plan

### Inner repo (`projects/kdp-puzzle-press` — its own git repo!)
- **Phase 0:** 3 discovery spikes complete (S1=C, S2=B, S3=A)
- **Phase 1:** 7 infrastructure tasks done
  - `fingerprint_futoshiki` in registry (+ Important fixes: type hint, dedupe)
  - `PALETTE_FATHERS_DAY_DAD` + `PALETTE_FUTOSHIKI` in config
  - `_draw_futoshiki_puzzle` + `build_futoshiki_book` in pdf_builder (with **Critical fix:** Unicode `∨/∧` → ASCII `v/^`, glyphs were invisible in registered fonts; multi-up validation; dead-code removal; page-parity fix)
  - `_draw_section_header` for variety-book section dividers
  - `assemble_futoshiki_book` + `assemble_mixed_puzzle_book` on `BookAssembler`
- **Phase 2:** Cover renderer (Tasks 2.1–2.2)
  - `covers/grid_tiles.py` — shared rect-parameterized tile renderers (sudoku/word_search/cryptogram/kakuro)
  - `scripts/build_four_grid_hero.py` — 2×2 collage cover script
  - Full test suite 201/201 passing after Phase 2
- **Phase 3:** Content curation done
  - 25 Father's Day cryptogram quotes (15 verified public-domain + 5 anonymous folk + 5 Pocket Rooster originals — implementer was strict about attribution, skipped misattributed Twain etc.)
  - 30 dad-themed word lists, 599 unique words across 600 slots
  - Father's Day intro page + Futoshiki intro/howto/cheatsheet
- **Phase 4 — Book A complete:**
  - `output/fathers-day-variety-dad/interior.pdf` — **123 pages**, all 4 section titles present in extracted text
  - `output/fathers-day-variety-dad/cover.pdf` — **with four-grid hero** (initially fell back to mascot; I caught it and regenerated the hero PNG, then rebuilt cover)
  - `metadata/fathers_day_variety_dad.json` — KDP listing copy committed
  - 3 end-to-end tests passing
- **Phase 5 — Book B BUILT BUT NEEDS REBUILD:**
  - Current built version uses sizes **4×4 / 5×5 / 6×6** (157 pages, 120 puzzles, all validate)
  - **User explicitly directed: "I want 7x7 and 8x8 figure it out"** — needs rebuild with original spec mapping (5×5 / 6×6 / 7×7 / 8×8)

---

## What's running 🔄

**Background task `bj8s20z31`:** Bank rebuild with sizes 4–8 at `--scale 0.5`.

- 7×7 density 0.50 → 0.75 (committed in `1fcc47e`)
- 8×8 added at density 0.80 (committed in `1fcc47e`)
- Process PIDs: bash 1256, python 1258 (alive at EOD)

Expected outcome: `data/futoshiki_bank.json` gets all 5 sizes (currently has 4-6 only). With density bumps, 7×7 should be tractable this time (previous 0.50 was >10 min/puzzle).

**If overnight the build finishes:** bank file updated; Book B rebuild ready to dispatch.

**If still stuck:** kill it, try `--sizes 7 8 --scale 0.3` or higher density (`0.85`) for 7×7, OR run a partial rebuild that only adds size 7 and 8 to the existing 4-6 bank file (would need a small script tweak — bank-builder currently overwrites).

---

## Tomorrow's plan — pick up here

### Step 1: Check bank build status
```bash
cat "C:/Users/marts/AppData/Local/Temp/claude/c--Sandbox-AIProjectManagement-Rooster-AI-Project-Management/4ff40109-8641-4a19-ac8a-4dd2cc0526ac/tasks/bj8s20z31.output" | tail -50
ls -la "c:/Sandbox/AIProjectManagement/Rooster-AI-Project-Management/projects/kdp-puzzle-press/data/futoshiki_bank.json"
```

Three outcomes:

| State | Action |
|---|---|
| Bank file has 5 sizes (4,5,6,7,8) | Proceed to Step 2 |
| Bank file still 4–6 only, process dead with error | Investigate error in output, re-run with `--sizes 7 8 --scale 0.3` |
| Process still running | Let it finish (could be hours for 7×7 still), or kill and use higher density |

Verify bank has all sizes:
```python
import json
b = json.load(open("projects/kdp-puzzle-press/data/futoshiki_bank.json"))
by_size = {}
for p in b["puzzles"]:
    by_size[p["size"]] = by_size.get(p["size"], 0) + 1
print(by_size)  # want at least: {4:5, 5:5, 6:5, 7:3, 8:3}
```

### Step 2: Regenerate Book B with sizes 5–8 mapping

The existing `src/pocket_rooster_press/books/futoshiki_seniors_v1.py` uses sizes 4/5/6. Update it to the user's preferred 5/6/7/8 mapping per the original spec:

| Section | Size | Count |
|---|---|---|
| Warm-up · 5×5 | 5 | 30 |
| Steady · 6×6 | 6 | 40 |
| Sharpen · 7×7 | 7 | 30 |
| Challenge · 8×8 | 8 | 20 |
| **Total** | | **120** |

Edit `_generate_all_puzzles()` accordingly. Update tests for new sizes. Update section titles list and boundaries `[30, 70, 100, 120]`.

Then rebuild and re-QA:
```bash
cd projects/kdp-puzzle-press
python -m pocket_rooster_press.books.futoshiki_seniors_v1
pytest tests/test_book_futoshiki_seniors_v1.py -v
```

Check:
- All 120 puzzles validate (`gen.validate(p)`)
- All 120 have distinct fingerprints (registry uniqueness)
- Page count documented (will likely grow vs 157 because 7×7 and 8×8 puzzles are bigger and use more vertical space)

### Step 3: Optional — Book B cover hero

Currently falls back to mascot-front. Two options:
- Leave fallback (acceptable — still uses playful PALETTE_FUTOSHIKI)
- Add a `build_real_grid_hero.py` dispatcher entry for `futoshiki-seniors-v1` so it generates a single real-grid Futoshiki hero. This requires adding a `render_futoshiki_tile` to `grid_tiles.py` (parallel to the other 4 types).

User's instruction "lets make it stand out" was about Book A's cover. Book B can ship with mascot fallback for v1 and get a proper hero in v2 if needed.

### Step 4: Phase 6 — Final QA + KDP upload handoff

- Run full test suite: `cd projects/kdp-puzzle-press && pytest -v`
- Verify both books in `output/`:
  - `fathers-day-variety-dad/interior.pdf` + `cover.pdf`
  - `futoshiki-seniors-v1/interior.pdf` + `cover.pdf`
- Print final summary: page counts, file sizes, metadata files
- User uploads to KDP manually (not engineering work)

---

## Files touched this session

**Outer repo:** docs/superpowers/plans/, docs/superpowers/specs/, .gitignore (.superpowers/ added)

**Inner repo (`projects/kdp-puzzle-press`):** 16 commits across registry, config, layout/pdf_builder, layout/book_assembler, covers/grid_tiles, themes/(loaders + data), books/(both new books), metadata/, scripts/, tests/. Specific files listed in the per-task commits — `git log --oneline -20` in the inner repo shows them all.

**Important nested-repo note:** `projects/kdp-puzzle-press/` is its own git repo (excluded from outer via `.gitignore`). All Python source, tests, metadata, output, and cover scripts commit there. The outer repo only holds `docs/superpowers/{plans,specs}/...`. Always `cd projects/kdp-puzzle-press` before `git add`/`git commit` of book/code work.

---

## Open quality concerns to address before launch

1. **Cryptogram tile in four-grid cover** uses a Caesar +13 simulation (not the real cipher) because `grid_tiles.py` doesn't receive the cipher map. Cosmetically fine for a cover, but technically inaccurate. Low priority.
2. **Book B cover** falls back to mascot — see Step 3 above. User wanted "stand out" for Book A; Book B fallback is acceptable for v1.
3. **Book A page count is 123** — within target band 100–124, target was 108. Acceptable; if we want to hit 108 exactly, the levers documented in spec §3.2 are: drop word search to 28 puzzles, then drop sudoku-hard to 8.
4. **Book B page count will likely exceed 108** with 7×7 and 8×8 at 1-up — possibly 180–200 pages. Print cost at $0.012/page above 108 — adds maybe $0.85–1.10 per copy. Adjust pricing if needed or use multi-up for 5×5 to claw pages back (`puzzles_per_page=2` for 5×5 warmup).
