---
title: Sudoku Quality Rework
date: 2026-05-26
status: design
supersedes: projects/kdp-puzzle-press/src/pocket_rooster_press/generators/sudoku.py (py-sudoku-based)
---

# Sudoku Quality Rework — Design

## 1. Motivation

The current sudoku generator at [projects/kdp-puzzle-press/src/pocket_rooster_press/generators/sudoku.py](../../projects/kdp-puzzle-press/src/pocket_rooster_press/generators/sudoku.py) wraps the `py-sudoku` package. Three defects make its output unsuitable for sale:

- **Uniqueness not verified.** `validate()` only confirms "a solution exists" via `solve()`. It does not check for multiple solutions. The library's random removal can leave puzzles with two or more valid completions, which print readers experience as "no logical path" / "the answer key disagrees with mine."
- **No symmetry.** Cells are removed randomly. The clue pattern reads asymmetric next to any newspaper- or book-quality puzzle, which uses 180° rotational symmetry as a strong convention.
- **No technique-tier difficulty grading.** Difficulty is set purely by clue count via `_DIFF_MAP`. Nothing guarantees an Easy puzzle is solvable by naked-singles alone, or that any puzzle is reachable by logic without guessing.

Three live SKUs ship the broken puzzles per [kdp-catalog-status-2026-05-17](../../memory/kdp-catalog-status-2026-05-17.md):

- `large-print-sudoku-grandparents` (80 puzzles: 40 Easy + 30 Medium + 10 Hard)
- `travel-sudoku-v1` (puzzle count per book module)
- `travel-sudoku-v2`

These are live customer-impact issues. Negative reviews citing "this puzzle has multiple solutions" or "the answer key is wrong" are an existential brand risk for a young KDP imprint.

## 2. Locked decisions

These were settled during brainstorming and are not open for renegotiation in implementation:

- **Generator approach: hand-rolled with `dlxsudoku` for uniqueness checking.** Custom filled-grid generator + custom symmetric removal loop + `dlxsudoku.DLXSudoku.solve()` for the uniqueness check (returns multiple solutions when they exist) + custom technique grader. No reliance on `py-sudoku`'s difficulty calibration.
- **Republish strategy: pull-and-replace via KDP content update on existing ASINs.** Same titles, same covers, same metadata; just new interior PDFs. If KDP flags the content swap as a major change and rejects, fall back to a v2 ASIN release. This preserves reviews and sales velocity in the common case.
- **Audit lives on `/kdp/:slug` inline.** No separate puzzles page in v1. The KDP detail page surfaces a `PuzzleAuditCard` with status chip + per-puzzle breakdown + Re-audit button. Audit results persist on the `kdp_books` row.
- **Single-puzzle-type scope.** This rework covers sudoku only. Cryptograms / word search / futoshiki / kakuro generators may have analogous defects; each needs its own design.
- **Pull-and-replace, not v2-alongside.** User explicitly chose pull-and-replace; KDP's "Update manuscript" flow on a live ASIN is the primary path.

## 3. Architecture

### 3.1 Generator stages

Three composable units, each with a single responsibility and independently testable:

```
SudokuGenerator.generate(difficulty)
    ├─ stage 1: filled_grid()         → 9×9 fully-valid Latin square
    │   └─ Las-Vegas backtracking; seeded
    ├─ stage 2: remove_symmetric(grid, target_clue_count)
    │   └─ pair cells via (r,c) ↔ (8-r, 8-c); blank both; verify unique
    │      with dlxsudoku; restore on failure; loop until target or stuck
    └─ stage 3: grade_technique(puzzle)
        └─ tiered solver: naked singles → +hidden singles →
           +locked candidates → +naked pairs → +naked triples →
           backtracking fallback. Returns highest tier reached.
           Difficulty must match request; else regenerate.
```

### 3.2 Backend module map

Under `projects/kdp-puzzle-press/src/pocket_rooster_press/`:

| File | Responsibility |
|---|---|
| `generators/sudoku.py` | Full rewrite. Orchestrates the three stages. Exposes `SudokuGenerator(PuzzleGenerator)` with the same public interface as today. |
| `generators/sudoku_filled.py` | Stage 1. Produces a random valid filled 9×9 grid via Las-Vegas backtracking. Pure function. |
| `generators/sudoku_solver.py` | Stage 2 helper + stage 3. Wraps `dlxsudoku` for uniqueness; implements the 5-tier technique solver. |
| `generators/sudoku.py::SudokuGenerator.validate(puzzle)` | Re-verifies uniqueness + 180° symmetry. Stronger than today. |
| `scripts/audit_puzzles.py` | New CLI: `python scripts/audit_puzzles.py --book=<slug>` reads the book's existing puzzle source (puzzles serialized in the interior render pipeline) OR regenerates from the book module, runs uniqueness + symmetry + technique-tier checks, prints JSON of per-puzzle audit. |
| `scripts/rebuild_sudoku.py` | New CLI: `python scripts/rebuild_sudoku.py --book=<slug>` regenerates the book's interior PDF using the new generator. Same page count target, same layout, same cover. Drops result in `output/kdp-ready/<slug>/interior.pdf`. |

### 3.3 Dashboard extension (`web.ui/backend/` and frontend)

| File | Responsibility |
|---|---|
| `web.ui/backend/migrations/0002_puzzle_audit.sql` | Adds three columns to `kdp_books`: `puzzle_audit_status`, `puzzle_audit_at`, `puzzle_audit_summary_json`. |
| `web.ui/backend/kdp/audit_routes.js` | New `POST /api/kdp/books/:slug/audit-puzzles` route. Shells out to `python projects/kdp-puzzle-press/scripts/audit_puzzles.py --book=<slug>`, captures JSON stdout, writes to row, emits SSE `kdp:audit-complete`. |
| `web.ui/frontend-react/src/components/PuzzleAuditCard.tsx` | Renders status chip (`✓ Passed` / `✗ Failed` / `⬜ Unchecked`), last audit date, Re-audit button, collapsible per-puzzle breakdown (uniqueness ✓, symmetry ✓, technique tier label). |
| `web.ui/frontend-react/src/api/kdp.ts` | Extends `KdpBook` interface with the three audit fields; adds `auditPuzzles(slug): Promise<void>` calling the new endpoint. |

## 4. Data model changes

```sql
-- 0002_puzzle_audit.sql
ALTER TABLE kdp_books ADD COLUMN puzzle_audit_status TEXT
    CHECK (puzzle_audit_status IS NULL OR puzzle_audit_status IN ('unchecked','passed','failed'));
ALTER TABLE kdp_books ADD COLUMN puzzle_audit_at TEXT;
ALTER TABLE kdp_books ADD COLUMN puzzle_audit_summary_json TEXT;
```

Audit summary JSON shape (one entry per puzzle in the book):

```json
{
  "puzzles": [
    {
      "index": 1,
      "difficulty": "easy",
      "clue_count": 42,
      "is_unique": true,
      "symmetric_180": true,
      "technique_tier": "naked_singles",
      "match_difficulty": true
    }
    /* ... one entry per puzzle ... */
  ],
  "totals": {
    "checked": 80,
    "passed": 80,
    "failed": 0,
    "uniqueness_failures": 0,
    "symmetry_failures": 0,
    "tier_mismatches": 0
  }
}
```

Books with no puzzle content (coloring books, novels) keep `puzzle_audit_status = NULL` and the audit card does not render.

## 5. Generator stage detail

### 5.1 Filled grid generator (`sudoku_filled.py`)

```python
def filled_grid(rng: random.Random) -> list[list[int]]:
    """Return a fully-filled 9x9 valid sudoku via randomized backtracking."""
    grid = [[0]*9 for _ in range(9)]
    if not _fill(grid, rng):
        raise RuntimeError("filled_grid: backtracking exhausted (should be impossible)")
    return grid
```

Backtracking picks the next empty cell, shuffles digits 1-9 with `rng.shuffle`, tries each in order, recurses. Standard Las-Vegas approach. Expected wall time: < 5 ms per grid.

### 5.2 Symmetric removal (`sudoku.py`)

```python
def remove_symmetric(
    grid: list[list[int]],
    target_clues: int,
    solver: UniquenessChecker,
    rng: random.Random,
    max_failed_attempts: int = 50,
) -> list[list[int]]:
    """Iteratively blank symmetric cell pairs while preserving unique solution."""
    puzzle = [row[:] for row in grid]
    cells = [(r, c) for r in range(9) for c in range(9)]
    rng.shuffle(cells)
    failures = 0
    while cells and _clue_count(puzzle) > target_clues and failures < max_failed_attempts:
        r, c = cells.pop()
        r2, c2 = 8 - r, 8 - c
        if puzzle[r][c] == 0:
            continue  # already blanked via its pair
        prev_a, prev_b = puzzle[r][c], puzzle[r2][c2]
        puzzle[r][c] = 0
        puzzle[r2][c2] = 0
        if solver.has_unique_solution(puzzle):
            failures = 0
        else:
            puzzle[r][c] = prev_a
            puzzle[r2][c2] = prev_b
            failures += 1
    return puzzle
```

The center cell `(4,4)` is its own pair — handled correctly by setting it once.

### 5.3 Uniqueness checker (`sudoku_solver.py`)

Wraps `dlxsudoku`:

```python
class UniquenessChecker:
    def has_unique_solution(self, grid: list[list[int]]) -> bool:
        solver = DLXSudoku(grid)
        solver.solve()
        # dlxsudoku.solutions is the list of all solutions found.
        return len(solver.solutions) == 1
```

`dlxsudoku` is fast (Dancing Links). Expected wall time: 1-5 ms per uniqueness check; total removal-loop cost stays well under 1s per puzzle.

### 5.4 Technique grader (`sudoku_solver.py`)

Five-tier deterministic solver. Each tier extends the previous:

| Tier | Techniques | Mapped difficulty |
|---|---|---|
| `naked_singles` | Naked single only | Easy |
| `hidden_singles` | + hidden single | Medium |
| `locked_candidates` | + pointing pairs / box-line reduction | Hard (lower) |
| `naked_pairs` | + naked pair / naked triple in row/col/box | Hard (upper) |
| `naked_triples` | + naked triple (rare) | Expert |
| `backtracking` | Fallback search | Expert (extreme — should be rare) |

The grader runs the cheapest tier first; if it makes progress, continue; if it stalls, escalate one tier; record the highest tier that contributed. A puzzle solvable purely with naked + hidden singles grades as `hidden_singles`. A puzzle that requires `backtracking` is dropped (we never ship "guess required" puzzles in v1).

If the requested difficulty doesn't match the grader's verdict (Easy puzzle graded as `hidden_singles`), the orchestrator regenerates. Cap regeneration attempts at 20 per puzzle; if it still fails, surface the failure to the caller (don't ship the wrong tier).

### 5.5 Generator orchestrator (`sudoku.py::SudokuGenerator.generate`)

```python
DIFFICULTY_TIER_MAP = {
    Difficulty.EASY:    {"naked_singles"},
    Difficulty.MEDIUM:  {"naked_singles", "hidden_singles"},
    Difficulty.HARD:    {"naked_singles", "hidden_singles", "locked_candidates", "naked_pairs"},
    Difficulty.EXPERT:  {"naked_singles", "hidden_singles", "locked_candidates", "naked_pairs", "naked_triples"},
}

CLUE_RANGES = {
    Difficulty.EASY:   (38, 48),
    Difficulty.MEDIUM: (30, 40),
    Difficulty.HARD:   (26, 32),
    Difficulty.EXPERT: (22, 26),
}

def generate(self, difficulty, **kwargs):
    seed = secrets.randbits(63)
    rng = random.Random(seed)
    for attempt in range(20):
        full = filled_grid(rng)
        target = rng.randint(*CLUE_RANGES[difficulty])
        puzzle = remove_symmetric(full, target, self.solver, rng)
        if not self.solver.has_unique_solution(puzzle):
            continue  # safety net; should never fire
        tier = grade_technique(puzzle)
        if tier in DIFFICULTY_TIER_MAP[difficulty]:
            return Puzzle(
                difficulty=difficulty,
                content=puzzle,
                solution=full,
                metadata={
                    "clue_count": _clue_count(puzzle),
                    "seed": seed,
                    "technique_tier": tier,
                    "is_unique": True,
                    "symmetric": True,
                },
            )
    raise RuntimeError(f"Failed to generate {difficulty.value} puzzle in 20 attempts")
```

## 6. Test strategy

`tests/test_sudoku.py` is overhauled. Old tests are dropped; new tests assert the real quality contract:

| Test | Asserts |
|---|---|
| `test_uniqueness_thousand_puzzles` | Generate 250 puzzles per difficulty (1000 total); each has exactly one solution per an independent solver (use `dlxsudoku` to double-check). |
| `test_symmetry_180_thousand_puzzles` | Same 1000 puzzles; each pair `(r,c)` and `(8-r, 8-c)` has the same blank-or-clue state. |
| `test_technique_tier_matches_difficulty` | Each puzzle grades into its declared difficulty band per `DIFFICULTY_TIER_MAP`. |
| `test_no_backtracking_required` | No puzzle's grade is `backtracking`. |
| `test_clue_count_in_range` | Clue count within the declared range per difficulty. |
| `test_round_trip_serialization` | Serialize puzzle to JSON, parse, re-verify unique + symmetric. |
| `test_performance` | Generating 100 Medium puzzles completes in < 60 seconds on the user's machine. Skip on CI. |
| `tests/test_sudoku_solver.py::test_uniqueness_known_puzzles` | A bank of known-unique and known-multi-solution sudoku grids; verify `has_unique_solution` agrees. |
| `tests/test_sudoku_solver.py::test_technique_tier_known_puzzles` | A bank of puzzles with known minimum technique requirements; verify the grader agrees. |

CI runs all tests except `test_performance` (which is local-only).

## 7. Republish workflow

Driven from the dashboard once the new generator ships.

```
For each broken sudoku SKU (large-print-sudoku-grandparents, travel-sudoku-v1, travel-sudoku-v2):

  1. Run `python projects/kdp-puzzle-press/scripts/rebuild_sudoku.py --book=<slug>`
        └─ Regenerates the interior PDF using the new generator.
           Same page count, same layout. Cover untouched.
  2. Run `python projects/kdp-puzzle-press/scripts/audit_puzzles.py --book=<slug>`
        └─ Confirms 100% pass (uniqueness + symmetry + tier match).
  3. Dashboard's audit field updates to `passed` with the per-puzzle JSON.
  4. User uploads the new interior PDF to KDP via "Edit eBook content"
     or "Edit paperback content" → Upload manuscript on the live ASIN.
  5. KDP review (typically 24-72h):
        ✓ Approved → existing ASIN now ships corrected puzzles.
                     Dashboard's `notes` field gets "Content update approved <date>".
        ✗ Rejected as major change → user creates a new ASIN
                     (`large-print-sudoku-grandparents-v2`). Dashboard's
                     audit field shows the old ASIN as `passed` but flags
                     `republish_status: pending_v2` in notes. Spec follow-up
                     handles v2 launch playbook (covers, listing copy).
```

The dashboard does not automate the KDP upload (no API). It tracks the audit state and surfaces "Re-audit" / "Mark uploaded" buttons.

## 8. Errors, security, observability

- The new `POST /api/kdp/books/:slug/audit-puzzles` endpoint spawns a Python subprocess. Validate `slug` against `^[a-z0-9][a-z0-9-]*$` to prevent command injection. Pass slug as `argv`, never via shell.
- Subprocess timeout: 5 minutes. Beyond that, mark audit as `failed` with reason `audit_timeout`.
- Subprocess stderr captured into the audit summary's `error` field on non-zero exit.
- The audit summary JSON is up to ~10 KB per book (80 puzzles × ~120 bytes each). Well under SQLite TEXT limits.
- SSE channel: `kdp:audit-started` (broadcast on POST), `kdp:audit-complete` (broadcast when subprocess exits).
- Audit failures are not the same as worker errors: `setWorkerError` is not called. Failures are recorded in the row and emitted via SSE, but the dashboard's tray icon does not turn red on an audit failure.

## 9. Testing strategy (dashboard side)

- `web.ui/backend/__tests__/kdp/audit_routes.test.js` — supertest against a fake Python subprocess (inject a `pythonRunner` factory; tests pass canned stdout JSON).
- `web.ui/frontend-react/src/__tests__/PuzzleAuditCard.test.tsx` — renders status chips, click Re-audit calls API, collapses/expands per-puzzle list.

## 10. Migration plan

Three commits, each shippable:

1. **`feat(sudoku): rewrite generator with uniqueness + 180° symmetry + technique grader`**
    - All changes under `projects/kdp-puzzle-press/`. New `sudoku.py`, `sudoku_filled.py`, `sudoku_solver.py`. Overhauled `test_sudoku.py`. New `test_sudoku_solver.py`. CLI scripts `audit_puzzles.py` and `rebuild_sudoku.py`. `pyproject.toml` adds `dlxsudoku` dep.

2. **`feat(audit): dashboard puzzle-audit extension`**
    - Migration `0002_puzzle_audit.sql`. New `audit_routes.js` + tests. Extended `KdpBook` type. New `PuzzleAuditCard.tsx` + tests.

3. **`chore(sudoku): regenerate 3 live sudoku books with verified puzzles`**
    - Runs `rebuild_sudoku.py` for each of the 3 SKUs. Commits the new `interior.pdf` files under `projects/kdp-puzzle-press/output/kdp-ready/<slug>/`. Audits each via the dashboard endpoint (one-off manual run) and verifies `passed`. User manually uploads to KDP next.

## 11. Out of scope for v1

- Auditing cryptograms, word search, futoshiki, kakuro generators. Each needs its own design.
- Automating KDP's "Upload manuscript" step — no public API.
- v2 ASIN launch automation if KDP rejects the content update.
- Backporting audits to older / unbuilt puzzle SKUs that aren't currently live.
- Generating puzzles in parallel. Single-threaded is fast enough (10 puzzles/s of Medium).

## 12. Open questions

None at design close. All load-bearing decisions are locked in §2.

## 13. Related memories

- [[kdp-catalog-status-2026-05-17]] — three live sudoku SKUs are affected.
- [[etsy-rooster-shop-checkpoint]] — Etsy is unaffected; the broken puzzles only ship via KDP.
