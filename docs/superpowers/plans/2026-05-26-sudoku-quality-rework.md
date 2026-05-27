# Sudoku Quality Rework Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the broken sudoku generator with one that produces puzzles with verified unique solutions, 180° rotational symmetry, and difficulty matched to required solving techniques; add a per-book audit field to the dashboard; regenerate the 3 live sudoku SKUs.

**Architecture:** Three commits. (1) New Python generator under `projects/kdp-puzzle-press/`: filled-grid generator + symmetric removal loop + 5-tier technique grader + `dlxsudoku`-backed uniqueness checks. (2) Dashboard SQLite migration 0002 adds 3 columns to `kdp_books`; new `/api/kdp/books/:slug/audit-puzzles` endpoint shells to a Python audit CLI; new `<PuzzleAuditCard>` on `/kdp/:slug`. (3) Rebuild interiors for `large-print-sudoku-grandparents`, `travel-sudoku-v1`, `travel-sudoku-v2`; audit each; user uploads to KDP manually.

**Tech Stack:** Python 3.14, `dlxsudoku` (new dep), pytest, Node 18+, Express, better-sqlite3, React 19 + TypeScript, Vitest, supertest.

**Spec reference:** [`docs/superpowers/specs/2026-05-26-sudoku-quality-rework-design.md`](../specs/2026-05-26-sudoku-quality-rework-design.md)

---

## Pre-flight context (read once)

Repo root is `C:/Sandbox/AIProjectManagement/Rooster-AI-Project-Management`. All paths in this plan are repo-relative unless noted.

**Python package (kdp-puzzle-press):**
```bash
cd projects/kdp-puzzle-press
pip install -e ".[dev]"             # if not already installed
pytest -q                            # full test run
pytest tests/test_sudoku.py -q       # one file
pytest -m "not slow" -q              # CI mode (skip the perf test)
```

**Backend (web.ui/backend):**
```bash
cd web.ui/backend
npm test                                          # full vitest run
npx vitest run __tests__/kdp/audit_routes.test.js # one file
```

**Frontend (web.ui/frontend-react):**
```bash
cd web.ui/frontend-react
npm test                                                        # vitest
npx vitest run src/__tests__/PuzzleAuditCard.test.tsx           # one file
```

**Existing infrastructure this plan extends (do NOT modify):**

- `projects/kdp-puzzle-press/src/pocket_rooster_press/generators/base.py` — defines `Difficulty(Enum)`, `Puzzle(dataclass)`, `PuzzleGenerator(ABC)`. The new `SudokuGenerator` must subclass `PuzzleGenerator` with the same `generate(difficulty, **kwargs) -> Puzzle` and `validate(puzzle) -> bool` signatures.
- `projects/kdp-puzzle-press/src/pocket_rooster_press/books/large_print_sudoku_grandparents.py`, `books/travel_sudoku_v1.py`, `books/travel_sudoku_v2.py` — three book modules that already import `from pocket_rooster_press.generators.sudoku import SudokuGenerator`. They will continue to work unchanged after the rewrite.
- `web.ui/backend/db.js` exports `openDb()` + `_resetForTests()`. Migrations under `web.ui/backend/migrations/*.sql` run automatically on first `openDb()` call.
- `web.ui/backend/events.js` exports `recordEvent(kind, payload)`, `subscribe(fn)`, `replayRecent(n)`, `_resetSubscribersForTests()`.
- `web.ui/backend/kdp/routes.js` already mounts `/api/kdp/books*` and exports `createKdpRouter(opts)` and `router`. We will create a **new** router file `audit_routes.js` and mount it next to the existing one (do not bolt the audit route inside `createKdpRouter`; keep the modules independent so tests stay focused).
- `web.ui/frontend-react/src/api/kdp.ts` exports `KdpBook`, `KdpDetail`, `ApiError`, `getBook`, `listBooks`, etc. We will extend `KdpBook` and add `auditPuzzles(slug)`.
- `web.ui/frontend-react/src/pages/KdpDetail.tsx` already renders book detail. We will mount `<PuzzleAuditCard>` below the metadata grid.

**Output layout for KDP-ready sudoku books** (current state):
```
projects/kdp-puzzle-press/output/kdp-ready/<slug>/
    interior.pdf
    cover.pdf
    listing.md, metadata.json, ...
```
After Commit 1, `rebuild_sudoku.py` adds `puzzles.json` next to `interior.pdf`.

**Verify before starting:**
```bash
python -c "import dlxsudoku" ; echo $?
```
Expected after Task 1: `0`. Before Task 1: `ModuleNotFoundError` (exit 1).

```bash
node -e "import('./web.ui/backend/db.js').then(({openDb})=>{const db=openDb();console.log(db.prepare(\"PRAGMA table_info(kdp_books)\").all().map(c=>c.name));});"
```
Expected before Task 13: list includes `id, slug, title, ..., notes, created_at, updated_at` but NOT `puzzle_audit_status`.
Expected after Task 13: also includes `puzzle_audit_status, puzzle_audit_at, puzzle_audit_summary_json`.

---

## File structure

**New Python source files (Commit 1):**
- `projects/kdp-puzzle-press/src/pocket_rooster_press/generators/sudoku_filled.py` — Las-Vegas backtracking filled-grid generator.
- `projects/kdp-puzzle-press/src/pocket_rooster_press/generators/sudoku_solver.py` — `UniquenessChecker` + 5-tier `TechniqueGrader`.
- `projects/kdp-puzzle-press/scripts/audit_puzzles.py` — CLI emitting per-puzzle JSON.
- `projects/kdp-puzzle-press/scripts/rebuild_sudoku.py` — CLI that runs a sudoku book module's `build()` and writes `puzzles.json` alongside `interior.pdf`.

**Modified Python source files:**
- `projects/kdp-puzzle-press/src/pocket_rooster_press/generators/sudoku.py` — full rewrite (removes `py-sudoku` dependence).
- `projects/kdp-puzzle-press/pyproject.toml` — add `dlxsudoku` runtime dep, drop `py-sudoku` after rewrite lands.

**New Python test files:**
- `projects/kdp-puzzle-press/tests/test_sudoku_filled.py`
- `projects/kdp-puzzle-press/tests/test_sudoku_solver.py`
- `projects/kdp-puzzle-press/tests/test_audit_puzzles_cli.py`
- `projects/kdp-puzzle-press/tests/test_rebuild_sudoku_cli.py`

**Overhauled Python test files:**
- `projects/kdp-puzzle-press/tests/test_sudoku.py` — replaces the existing weak tests.

**New backend source files (Commit 2):**
- `web.ui/backend/migrations/0002_puzzle_audit.sql`
- `web.ui/backend/kdp/audit_routes.js`

**New backend test files:**
- `web.ui/backend/__tests__/kdp/audit_routes.test.js`
- `web.ui/backend/__tests__/migrations_0002.test.js`

**Modified backend files:**
- `web.ui/backend/server.js` — mount the new audit router.

**New frontend source files (Commit 2):**
- `web.ui/frontend-react/src/components/PuzzleAuditCard.tsx`

**New frontend test files:**
- `web.ui/frontend-react/src/__tests__/PuzzleAuditCard.test.tsx`
- `web.ui/frontend-react/src/__tests__/kdp_api_audit.test.ts`

**Modified frontend files:**
- `web.ui/frontend-react/src/api/kdp.ts` — extend `KdpBook`, add `auditPuzzles(slug)`.
- `web.ui/frontend-react/src/pages/KdpDetail.tsx` — mount `<PuzzleAuditCard>`.

**Regenerated content (Commit 3):**
- `projects/kdp-puzzle-press/output/kdp-ready/large-print-sudoku-grandparents/interior.pdf` + `puzzles.json`
- `projects/kdp-puzzle-press/output/kdp-ready/travel-sudoku-v1/interior.pdf` + `puzzles.json`
- `projects/kdp-puzzle-press/output/kdp-ready/travel-sudoku-v2/interior.pdf` + `puzzles.json`

---

## Commit 1 — Generator rewrite

End-of-phase commit message: `feat(sudoku): rewrite generator with uniqueness + 180° symmetry + technique grader`

### Task 1: Swap `py-sudoku` for `dlxsudoku` dep

**Files:**
- Modify: `projects/kdp-puzzle-press/pyproject.toml`

- [ ] **Step 1: Confirm current state**

Run: `python -c "import dlxsudoku" 2>&1 | head -1`
Expected: `ModuleNotFoundError: No module named 'dlxsudoku'`

- [ ] **Step 2: Add `dlxsudoku` to dependencies**

Open `projects/kdp-puzzle-press/pyproject.toml`. In the `[project] dependencies = [ ... ]` block, **add** the line `    "dlxsudoku>=1.0,<2",`. **Leave `py-sudoku` in place for now** — we will remove it at the end of Task 9 once the new generator no longer imports it. The updated dependencies list should read:

```toml
dependencies = [
    "reportlab>=4.2,<5",
    "Pillow>=11.0,<12",
    "py-sudoku>=1.0,<2",
    "dlxsudoku>=1.0,<2",
    "jsonschema>=4.23,<5",
    "click>=8.1,<9",
    "pypdf>=5.0,<7",
]
```

- [ ] **Step 3: Install & verify**

```bash
cd projects/kdp-puzzle-press
pip install -e ".[dev]"
python -c "from dlxsudoku import Sudoku as DLXSudoku; s = DLXSudoku('530070000600195000098000060800060003400803001700020006060000280000419005000080079'); s.solve(); print(s.solution_str)"
```
Expected: a single 81-character string of digits 1-9 (the known solved board for the famous "easy 1" puzzle).

- [ ] **Step 4: Confirm `dlxsudoku` Sudoku constructor signature**

`dlxsudoku.Sudoku` accepts either an 81-char string or a `9x9` list of lists. Solutions are read from `solver.solution_str` after `solver.solve()`. There is also `solver.solutions` (list of all completions; populated when more than one exists). The class name we will use in our code is `from dlxsudoku.sudoku import Sudoku as DLXSudoku`.

Run: `python -c "from dlxsudoku.sudoku import Sudoku as DLXSudoku; print(DLXSudoku.__init__.__doc__)"`
Expected: no error (the import resolves). If the import path differs in the installed version, run `python -c "import dlxsudoku; help(dlxsudoku)"` and adjust the import line everywhere it appears in Tasks 3 and 11; record the actual import path here before continuing.

- [ ] **Step 5: Stage but do NOT commit yet**

```bash
git add projects/kdp-puzzle-press/pyproject.toml
```
The Commit 1 message lands at the end of Task 12.

---

### Task 2: `sudoku_filled.py` — Las-Vegas backtracking filled grid

**Files:**
- Create: `projects/kdp-puzzle-press/src/pocket_rooster_press/generators/sudoku_filled.py`
- Test: `projects/kdp-puzzle-press/tests/test_sudoku_filled.py`

- [ ] **Step 1: Write the failing test**

```python
# tests/test_sudoku_filled.py
"""Tests for the filled-grid backtracking generator."""

import random

import pytest

from pocket_rooster_press.generators.sudoku_filled import filled_grid


def _is_valid_full_grid(grid: list[list[int]]) -> bool:
    """Return True iff every row, column, and 3x3 box is exactly {1..9}."""
    target = set(range(1, 10))
    for r in range(9):
        if set(grid[r]) != target:
            return False
    for c in range(9):
        if {grid[r][c] for r in range(9)} != target:
            return False
    for br in range(0, 9, 3):
        for bc in range(0, 9, 3):
            box = {grid[r][c] for r in range(br, br + 3) for c in range(bc, bc + 3)}
            if box != target:
                return False
    return True


def test_filled_grid_is_9x9_of_ints():
    rng = random.Random(42)
    grid = filled_grid(rng)
    assert len(grid) == 9
    for row in grid:
        assert len(row) == 9
        assert all(isinstance(v, int) for v in row)


def test_filled_grid_is_valid_sudoku():
    rng = random.Random(42)
    grid = filled_grid(rng)
    assert _is_valid_full_grid(grid)


def test_filled_grid_seeded_determinism():
    """Same seed → same grid. Different seeds → (almost certainly) different."""
    g1 = filled_grid(random.Random(123))
    g2 = filled_grid(random.Random(123))
    g3 = filled_grid(random.Random(124))
    assert g1 == g2
    assert g1 != g3


def test_filled_grid_variety_across_seeds():
    seen = set()
    for seed in range(20):
        g = filled_grid(random.Random(seed))
        seen.add(tuple(tuple(row) for row in g))
    # 20 independent seeds should produce 20 distinct grids.
    assert len(seen) == 20
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd projects/kdp-puzzle-press && pytest tests/test_sudoku_filled.py -q`
Expected: `ModuleNotFoundError: No module named 'pocket_rooster_press.generators.sudoku_filled'` (4 errors).

- [ ] **Step 3: Write the implementation**

```python
# src/pocket_rooster_press/generators/sudoku_filled.py
"""Stage 1: random valid filled 9x9 sudoku via Las-Vegas backtracking."""

from __future__ import annotations

import random


def _first_empty(grid: list[list[int]]) -> tuple[int, int] | None:
    for r in range(9):
        for c in range(9):
            if grid[r][c] == 0:
                return r, c
    return None


def _is_safe(grid: list[list[int]], r: int, c: int, v: int) -> bool:
    for i in range(9):
        if grid[r][i] == v or grid[i][c] == v:
            return False
    br, bc = (r // 3) * 3, (c // 3) * 3
    for rr in range(br, br + 3):
        for cc in range(bc, bc + 3):
            if grid[rr][cc] == v:
                return False
    return True


def _fill(grid: list[list[int]], rng: random.Random) -> bool:
    cell = _first_empty(grid)
    if cell is None:
        return True
    r, c = cell
    digits = list(range(1, 10))
    rng.shuffle(digits)
    for v in digits:
        if _is_safe(grid, r, c, v):
            grid[r][c] = v
            if _fill(grid, rng):
                return True
            grid[r][c] = 0
    return False


def filled_grid(rng: random.Random) -> list[list[int]]:
    """Return a fully-filled 9x9 valid sudoku via randomized backtracking.

    Wall time: <5 ms per grid on commodity hardware.
    """
    grid = [[0] * 9 for _ in range(9)]
    if not _fill(grid, rng):
        raise RuntimeError("filled_grid: backtracking exhausted (should be impossible)")
    return grid
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd projects/kdp-puzzle-press && pytest tests/test_sudoku_filled.py -q`
Expected: `4 passed`.

- [ ] **Step 5: Stage**

```bash
git add projects/kdp-puzzle-press/src/pocket_rooster_press/generators/sudoku_filled.py \
        projects/kdp-puzzle-press/tests/test_sudoku_filled.py
```

---

### Task 3: `sudoku_solver.py::UniquenessChecker`

**Files:**
- Create: `projects/kdp-puzzle-press/src/pocket_rooster_press/generators/sudoku_solver.py`
- Test: `projects/kdp-puzzle-press/tests/test_sudoku_solver.py`

- [ ] **Step 1: Write the failing test**

```python
# tests/test_sudoku_solver.py
"""Tests for the uniqueness checker + technique grader."""

from pocket_rooster_press.generators.sudoku_solver import UniquenessChecker


# A canonical valid-unique-solution puzzle (Wikipedia's example easy sudoku).
KNOWN_UNIQUE: list[list[int]] = [
    [5, 3, 0, 0, 7, 0, 0, 0, 0],
    [6, 0, 0, 1, 9, 5, 0, 0, 0],
    [0, 9, 8, 0, 0, 0, 0, 6, 0],
    [8, 0, 0, 0, 6, 0, 0, 0, 3],
    [4, 0, 0, 8, 0, 3, 0, 0, 1],
    [7, 0, 0, 0, 2, 0, 0, 0, 6],
    [0, 6, 0, 0, 0, 0, 2, 8, 0],
    [0, 0, 0, 4, 1, 9, 0, 0, 5],
    [0, 0, 0, 0, 8, 0, 0, 7, 9],
]

# A puzzle with two solutions: a fully-filled valid grid with the top-left
# 2x2 block reduced to a single clue pair, leaving two ways to fill the rest.
# The known-multi example used here is a 17-clue grid with the last two
# clues removed (clue count = 15) which produces multiple completions.
KNOWN_MULTI: list[list[int]] = [
    [0, 0, 0, 0, 0, 0, 0, 1, 0],
    [4, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 2, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 5, 0, 4, 0, 7],
    [0, 0, 8, 0, 0, 0, 3, 0, 0],
    [0, 0, 1, 0, 9, 0, 0, 0, 0],
    [3, 0, 0, 4, 0, 0, 2, 0, 0],
    [0, 5, 0, 1, 0, 0, 0, 0, 0],
    [0, 0, 0, 8, 0, 6, 0, 0, 0],
]


def test_unique_solution_known_unique():
    checker = UniquenessChecker()
    assert checker.has_unique_solution(KNOWN_UNIQUE) is True


def test_unique_solution_known_multi():
    checker = UniquenessChecker()
    assert checker.has_unique_solution(KNOWN_MULTI) is False


def test_unique_solution_empty_grid_is_not_unique():
    """An empty 9x9 obviously has many completions."""
    checker = UniquenessChecker()
    empty = [[0] * 9 for _ in range(9)]
    assert checker.has_unique_solution(empty) is False
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd projects/kdp-puzzle-press && pytest tests/test_sudoku_solver.py -q`
Expected: `ModuleNotFoundError: No module named 'pocket_rooster_press.generators.sudoku_solver'`.

- [ ] **Step 3: Write the implementation (UniquenessChecker only — grader follows in Tasks 4-6)**

```python
# src/pocket_rooster_press/generators/sudoku_solver.py
"""Stage 2 helper (uniqueness) + Stage 3 (technique grading)."""

from __future__ import annotations

from typing import Iterable

from dlxsudoku.sudoku import Sudoku as DLXSudoku


def _grid_to_string(grid: list[list[int]]) -> str:
    """Encode a 9x9 grid as an 81-char string with '0' for blanks."""
    return "".join(str(v) for row in grid for v in row)


def _string_to_grid(s: str) -> list[list[int]]:
    return [[int(s[r * 9 + c]) for c in range(9)] for r in range(9)]


class UniquenessChecker:
    """Wraps dlxsudoku to ask: does this puzzle have exactly one completion?"""

    def has_unique_solution(self, grid: list[list[int]]) -> bool:
        s = _grid_to_string(grid)
        solver = DLXSudoku(s)
        # dlxsudoku.solve() populates .solution_str on success and raises if
        # the puzzle is unsolvable. We additionally need "is the solution
        # unique?" — checked via a second call to .solve() that, if the
        # underlying DLX search has a remaining alternative branch, will
        # find it. dlxsudoku exposes this through ``solver.solutions`` once
        # ``solve()`` has been invoked; for our purposes, a uniqueness
        # check counts the number of distinct completions found.
        try:
            solver.solve()
        except Exception:
            return False
        # Some dlxsudoku builds expose ``solutions`` as a list, others as a
        # generator. Normalise to a list of strings.
        sols: list[str] = []
        raw: Iterable = getattr(solver, "solutions", None) or []
        for sol in raw:
            if isinstance(sol, str):
                sols.append(sol)
            elif hasattr(sol, "to_oneliner"):
                sols.append(sol.to_oneliner())
            else:
                sols.append(str(sol))
        if not sols and getattr(solver, "solution_str", None):
            # Fall back to a manual count: brute-force search for a second
            # completion that disagrees with the first.
            first = solver.solution_str
            return not _has_second_completion(grid, first)
        return len(set(sols)) == 1


def _has_second_completion(grid: list[list[int]], first: str) -> bool:
    """Brute-force search for ANY completion that differs from `first`.

    Used as the uniqueness fallback when dlxsudoku does not expose multiple
    solutions natively. Stops at the first disagreement, so worst-case cost
    is one full search.
    """
    work = [row[:] for row in grid]
    target_grid = _string_to_grid(first)
    found = [False]

    def safe(r: int, c: int, v: int) -> bool:
        for i in range(9):
            if work[r][i] == v or work[i][c] == v:
                return False
        br, bc = (r // 3) * 3, (c // 3) * 3
        for rr in range(br, br + 3):
            for cc in range(bc, bc + 3):
                if work[rr][cc] == v:
                    return False
        return True

    def backtrack() -> None:
        if found[0]:
            return
        for r in range(9):
            for c in range(9):
                if work[r][c] == 0:
                    for v in range(1, 10):
                        if v == target_grid[r][c]:
                            continue  # we want to find a DIFFERENT solution
                        if safe(r, c, v):
                            work[r][c] = v
                            backtrack()
                            work[r][c] = 0
                            if found[0]:
                                return
                    # Also try the target digit so the search can complete
                    # this branch with a different choice elsewhere.
                    v = target_grid[r][c]
                    if safe(r, c, v):
                        work[r][c] = v
                        backtrack()
                        work[r][c] = 0
                    return
        # Reached a fully-filled grid without using `target_grid[r][c]` at
        # least once → it differs from `first`.
        for r in range(9):
            for c in range(9):
                if work[r][c] != target_grid[r][c]:
                    found[0] = True
                    return

    backtrack()
    return found[0]
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd projects/kdp-puzzle-press && pytest tests/test_sudoku_solver.py -q`
Expected: `3 passed`.

- [ ] **Step 5: Stage**

```bash
git add projects/kdp-puzzle-press/src/pocket_rooster_press/generators/sudoku_solver.py \
        projects/kdp-puzzle-press/tests/test_sudoku_solver.py
```

---

### Task 4: `TechniqueGrader._naked_singles_only`

**Files:**
- Modify: `projects/kdp-puzzle-press/src/pocket_rooster_press/generators/sudoku_solver.py`
- Modify: `projects/kdp-puzzle-press/tests/test_sudoku_solver.py`

- [ ] **Step 1: Add failing tests**

Append to `tests/test_sudoku_solver.py`:

```python
from pocket_rooster_press.generators.sudoku_solver import TechniqueGrader


# A puzzle widely known to be solvable using ONLY naked singles.
# 38 clues, all hidden digits are uniquely forced by row+col+box elimination.
EASY_NAKED_SINGLES_ONLY: list[list[int]] = [
    [0, 0, 3, 0, 2, 0, 6, 0, 0],
    [9, 0, 0, 3, 0, 5, 0, 0, 1],
    [0, 0, 1, 8, 0, 6, 4, 0, 0],
    [0, 0, 8, 1, 0, 2, 9, 0, 0],
    [7, 0, 0, 0, 0, 0, 0, 0, 8],
    [0, 0, 6, 7, 0, 8, 2, 0, 0],
    [0, 0, 2, 6, 0, 9, 5, 0, 0],
    [8, 0, 0, 2, 0, 3, 0, 0, 9],
    [0, 0, 5, 0, 1, 0, 3, 0, 0],
]


def test_naked_singles_only_solves_easy():
    grader = TechniqueGrader()
    solved, stalled = grader._naked_singles_only(EASY_NAKED_SINGLES_ONLY)
    assert stalled is False
    # All cells filled
    for row in solved:
        for v in row:
            assert 1 <= v <= 9


def test_naked_singles_only_stalls_on_hard():
    """The KNOWN_UNIQUE puzzle from Task 3 requires more than naked singles."""
    grader = TechniqueGrader()
    solved, stalled = grader._naked_singles_only(KNOWN_UNIQUE)
    assert stalled is True
    # At least one blank cell remains
    blanks = sum(1 for row in solved for v in row if v == 0)
    assert blanks > 0
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd projects/kdp-puzzle-press && pytest tests/test_sudoku_solver.py -q`
Expected: `ImportError: cannot import name 'TechniqueGrader'`.

- [ ] **Step 3: Add the class to `sudoku_solver.py`**

Append to `src/pocket_rooster_press/generators/sudoku_solver.py`:

```python
def _candidates(grid: list[list[int]], r: int, c: int) -> set[int]:
    """Return the set of digits that could legally go in (r,c)."""
    if grid[r][c] != 0:
        return set()
    used: set[int] = set()
    for i in range(9):
        used.add(grid[r][i])
        used.add(grid[i][c])
    br, bc = (r // 3) * 3, (c // 3) * 3
    for rr in range(br, br + 3):
        for cc in range(bc, bc + 3):
            used.add(grid[rr][cc])
    return set(range(1, 10)) - used


def _is_solved(grid: list[list[int]]) -> bool:
    return all(v != 0 for row in grid for v in row)


class TechniqueGrader:
    """Five-tier human-style solver. Returns the highest tier it reached."""

    TIERS = (
        "naked_singles",
        "hidden_singles",
        "locked_candidates",
        "naked_pairs",
        "naked_triples",
    )

    def _naked_singles_only(
        self, grid: list[list[int]]
    ) -> tuple[list[list[int]], bool]:
        """Solve as far as naked singles will take us.

        Returns:
            (solved_grid_so_far, stalled)
            stalled == True iff we made no progress on the last pass AND the
            grid is not yet solved.
        """
        work = [row[:] for row in grid]
        while True:
            progressed = False
            for r in range(9):
                for c in range(9):
                    if work[r][c] == 0:
                        cands = _candidates(work, r, c)
                        if len(cands) == 1:
                            work[r][c] = next(iter(cands))
                            progressed = True
            if not progressed:
                break
        return work, not _is_solved(work)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd projects/kdp-puzzle-press && pytest tests/test_sudoku_solver.py -q`
Expected: `5 passed`.

- [ ] **Step 5: Stage**

```bash
git add projects/kdp-puzzle-press/src/pocket_rooster_press/generators/sudoku_solver.py \
        projects/kdp-puzzle-press/tests/test_sudoku_solver.py
```

---

### Task 5: `TechniqueGrader._hidden_singles` + `_locked_candidates`

**Files:**
- Modify: `projects/kdp-puzzle-press/src/pocket_rooster_press/generators/sudoku_solver.py`
- Modify: `projects/kdp-puzzle-press/tests/test_sudoku_solver.py`

- [ ] **Step 1: Add failing tests**

Append to `tests/test_sudoku_solver.py`:

```python
# Hidden-singles puzzle: at least one box where a candidate appears in
# exactly one cell, even though that cell has 2+ raw candidates.
MEDIUM_HIDDEN_SINGLES: list[list[int]] = [
    [0, 0, 0, 2, 6, 0, 7, 0, 1],
    [6, 8, 0, 0, 7, 0, 0, 9, 0],
    [1, 9, 0, 0, 0, 4, 5, 0, 0],
    [8, 2, 0, 1, 0, 0, 0, 4, 0],
    [0, 0, 4, 6, 0, 2, 9, 0, 0],
    [0, 5, 0, 0, 0, 3, 0, 2, 8],
    [0, 0, 9, 3, 0, 0, 0, 7, 4],
    [0, 4, 0, 0, 5, 0, 0, 3, 6],
    [7, 0, 3, 0, 1, 8, 0, 0, 0],
]


def test_hidden_singles_unsticks_medium():
    grader = TechniqueGrader()
    # Naked singles alone stalls.
    _, stalled = grader._naked_singles_only(MEDIUM_HIDDEN_SINGLES)
    assert stalled is True
    # With hidden singles allowed, the run advances at least one extra cell.
    progress_made = grader._hidden_singles_pass(MEDIUM_HIDDEN_SINGLES)
    assert progress_made is True


def test_locked_candidates_no_progress_on_easy():
    """Locked candidates does not crash; on the easy puzzle (already solved
    by naked singles) it has nothing left to do."""
    grader = TechniqueGrader()
    work = [row[:] for row in EASY_NAKED_SINGLES_ONLY]
    # Run naked singles to completion first.
    work, _ = grader._naked_singles_only(work)
    # Locked candidates on a fully-solved grid is a no-op.
    progress = grader._locked_candidates_pass(work)
    assert progress is False
```

- [ ] **Step 2: Run tests to verify failure**

Run: `cd projects/kdp-puzzle-press && pytest tests/test_sudoku_solver.py -q`
Expected: `AttributeError: 'TechniqueGrader' object has no attribute '_hidden_singles_pass'`.

- [ ] **Step 3: Add the two pass methods to `TechniqueGrader`**

Append inside the `TechniqueGrader` class in `sudoku_solver.py`:

```python
    def _hidden_singles_pass(self, grid: list[list[int]]) -> bool:
        """One pass of hidden-singles deduction. Mutates `grid` in place.

        A hidden single is a digit that has exactly one possible cell in a
        given row, column, or 3x3 box. We solve that cell.

        Returns True iff at least one cell was filled.
        """
        progressed = False
        # Rows
        for r in range(9):
            row_cands = {c: _candidates(grid, r, c) for c in range(9) if grid[r][c] == 0}
            for d in range(1, 10):
                cells = [c for c, cs in row_cands.items() if d in cs]
                if len(cells) == 1:
                    c = cells[0]
                    if grid[r][c] == 0:
                        grid[r][c] = d
                        progressed = True
        # Columns
        for c in range(9):
            col_cands = {r: _candidates(grid, r, c) for r in range(9) if grid[r][c] == 0}
            for d in range(1, 10):
                cells = [r for r, cs in col_cands.items() if d in cs]
                if len(cells) == 1:
                    r = cells[0]
                    if grid[r][c] == 0:
                        grid[r][c] = d
                        progressed = True
        # Boxes
        for br in range(0, 9, 3):
            for bc in range(0, 9, 3):
                box_cands = {
                    (rr, cc): _candidates(grid, rr, cc)
                    for rr in range(br, br + 3)
                    for cc in range(bc, bc + 3)
                    if grid[rr][cc] == 0
                }
                for d in range(1, 10):
                    cells = [pos for pos, cs in box_cands.items() if d in cs]
                    if len(cells) == 1:
                        rr, cc = cells[0]
                        if grid[rr][cc] == 0:
                            grid[rr][cc] = d
                            progressed = True
        return progressed

    def _locked_candidates_pass(self, grid: list[list[int]]) -> bool:
        """Pointing pair / box-line reduction.

        For each box+digit pair: if the digit's candidate cells all lie in
        a single row (or single column), eliminate that digit from the rest
        of that row (or column) OUTSIDE the box. Returns True if any
        elimination unlocked a naked single this pass.
        """
        # Build a mutable candidates map: candidates[r][c] = set
        cands: list[list[set[int]]] = [
            [_candidates(grid, r, c) if grid[r][c] == 0 else set() for c in range(9)]
            for r in range(9)
        ]
        eliminations = 0
        for br in range(0, 9, 3):
            for bc in range(0, 9, 3):
                cells_in_box = [
                    (rr, cc)
                    for rr in range(br, br + 3)
                    for cc in range(bc, bc + 3)
                    if grid[rr][cc] == 0
                ]
                for d in range(1, 10):
                    holders = [(rr, cc) for (rr, cc) in cells_in_box if d in cands[rr][cc]]
                    if not holders:
                        continue
                    rows = {rr for (rr, _) in holders}
                    cols = {cc for (_, cc) in holders}
                    if len(rows) == 1:
                        only_r = next(iter(rows))
                        for cc in range(9):
                            if cc < bc or cc >= bc + 3:
                                if d in cands[only_r][cc]:
                                    cands[only_r][cc].discard(d)
                                    eliminations += 1
                    if len(cols) == 1:
                        only_c = next(iter(cols))
                        for rr in range(9):
                            if rr < br or rr >= br + 3:
                                if d in cands[rr][only_c]:
                                    cands[rr][only_c].discard(d)
                                    eliminations += 1
        # After eliminations, see whether any cell now has exactly one
        # candidate (i.e., locked-candidate unlocked a naked single).
        progressed = False
        for r in range(9):
            for c in range(9):
                if grid[r][c] == 0 and len(cands[r][c]) == 1:
                    grid[r][c] = next(iter(cands[r][c]))
                    progressed = True
        return progressed
```

- [ ] **Step 4: Run tests to verify pass**

Run: `cd projects/kdp-puzzle-press && pytest tests/test_sudoku_solver.py -q`
Expected: `7 passed`.

- [ ] **Step 5: Stage**

```bash
git add projects/kdp-puzzle-press/src/pocket_rooster_press/generators/sudoku_solver.py \
        projects/kdp-puzzle-press/tests/test_sudoku_solver.py
```

---

### Task 6: `TechniqueGrader._naked_pairs` + `_naked_triples` + `grade(puzzle)`

**Files:**
- Modify: `projects/kdp-puzzle-press/src/pocket_rooster_press/generators/sudoku_solver.py`
- Modify: `projects/kdp-puzzle-press/tests/test_sudoku_solver.py`

- [ ] **Step 1: Add failing tests**

Append to `tests/test_sudoku_solver.py`:

```python
def test_grade_easy_puzzle():
    grader = TechniqueGrader()
    tier = grader.grade(EASY_NAKED_SINGLES_ONLY)
    assert tier == "naked_singles"


def test_grade_medium_puzzle():
    grader = TechniqueGrader()
    tier = grader.grade(MEDIUM_HIDDEN_SINGLES)
    # Hidden singles is sufficient (it doesn't need locked candidates).
    assert tier in {"hidden_singles", "naked_singles"}


def test_grade_known_unique_at_least_hidden_singles():
    grader = TechniqueGrader()
    tier = grader.grade(KNOWN_UNIQUE)
    # The Wikipedia puzzle is widely classified as "medium".
    assert tier in {"hidden_singles", "locked_candidates", "naked_pairs"}


def test_grade_unsolvable_returns_backtracking():
    """A pathological puzzle that the logic-only grader cannot complete."""
    grader = TechniqueGrader()
    # An empty grid is the worst-case stall — no technique fills it.
    empty = [[0] * 9 for _ in range(9)]
    tier = grader.grade(empty)
    assert tier == "backtracking"
```

- [ ] **Step 2: Run tests to verify failure**

Run: `cd projects/kdp-puzzle-press && pytest tests/test_sudoku_solver.py -q`
Expected: `AttributeError: 'TechniqueGrader' object has no attribute 'grade'`.

- [ ] **Step 3: Add the remaining methods**

Append inside the `TechniqueGrader` class:

```python
    def _naked_pairs_pass(self, grid: list[list[int]]) -> bool:
        """Naked pairs across rows, columns, boxes.

        If two cells in the same unit share the same 2-candidate set, then
        those two digits cannot appear elsewhere in the unit. Eliminate
        them; then check for newly-unlocked naked singles.
        """
        cands: list[list[set[int]]] = [
            [_candidates(grid, r, c) if grid[r][c] == 0 else set() for c in range(9)]
            for r in range(9)
        ]

        def apply_pairs(positions: list[tuple[int, int]]) -> None:
            twos = [(p, cands[p[0]][p[1]]) for p in positions if len(cands[p[0]][p[1]]) == 2]
            for i, (p1, s1) in enumerate(twos):
                for p2, s2 in twos[i + 1 :]:
                    if s1 == s2:
                        for p in positions:
                            if p != p1 and p != p2:
                                cands[p[0]][p[1]] -= s1

        for r in range(9):
            apply_pairs([(r, c) for c in range(9) if grid[r][c] == 0])
        for c in range(9):
            apply_pairs([(r, c) for r in range(9) if grid[r][c] == 0])
        for br in range(0, 9, 3):
            for bc in range(0, 9, 3):
                apply_pairs(
                    [
                        (rr, cc)
                        for rr in range(br, br + 3)
                        for cc in range(bc, bc + 3)
                        if grid[rr][cc] == 0
                    ]
                )

        progressed = False
        for r in range(9):
            for c in range(9):
                if grid[r][c] == 0 and len(cands[r][c]) == 1:
                    grid[r][c] = next(iter(cands[r][c]))
                    progressed = True
        return progressed

    def _naked_triples_pass(self, grid: list[list[int]]) -> bool:
        """Naked triples (3 cells in a unit whose combined candidates form a 3-set)."""
        cands: list[list[set[int]]] = [
            [_candidates(grid, r, c) if grid[r][c] == 0 else set() for c in range(9)]
            for r in range(9)
        ]

        def apply_triples(positions: list[tuple[int, int]]) -> None:
            cells = [p for p in positions if 2 <= len(cands[p[0]][p[1]]) <= 3]
            n = len(cells)
            for i in range(n):
                for j in range(i + 1, n):
                    for k in range(j + 1, n):
                        union = (
                            cands[cells[i][0]][cells[i][1]]
                            | cands[cells[j][0]][cells[j][1]]
                            | cands[cells[k][0]][cells[k][1]]
                        )
                        if len(union) == 3:
                            triple = {cells[i], cells[j], cells[k]}
                            for p in positions:
                                if p not in triple:
                                    cands[p[0]][p[1]] -= union

        for r in range(9):
            apply_triples([(r, c) for c in range(9) if grid[r][c] == 0])
        for c in range(9):
            apply_triples([(r, c) for r in range(9) if grid[r][c] == 0])
        for br in range(0, 9, 3):
            for bc in range(0, 9, 3):
                apply_triples(
                    [
                        (rr, cc)
                        for rr in range(br, br + 3)
                        for cc in range(bc, bc + 3)
                        if grid[rr][cc] == 0
                    ]
                )

        progressed = False
        for r in range(9):
            for c in range(9):
                if grid[r][c] == 0 and len(cands[r][c]) == 1:
                    grid[r][c] = next(iter(cands[r][c]))
                    progressed = True
        return progressed

    def grade(self, puzzle: list[list[int]]) -> str:
        """Return the highest tier required to solve `puzzle` with logic.

        If logic alone is insufficient (the cheapest 5 techniques stall while
        the grid is still unsolved), returns ``"backtracking"`` — these
        puzzles are dropped by the orchestrator.
        """
        grid = [row[:] for row in puzzle]
        highest = "naked_singles"

        # Tier 1 — naked singles only.
        grid, stalled = self._naked_singles_only(grid)
        if _is_solved(grid):
            return highest

        # Tier 2 — + hidden singles.
        while not _is_solved(grid):
            advanced = self._hidden_singles_pass(grid)
            if advanced:
                highest = "hidden_singles"
                grid, _ = self._naked_singles_only(grid)
            else:
                break
        if _is_solved(grid):
            return highest

        # Tier 3 — + locked candidates.
        while not _is_solved(grid):
            advanced = self._locked_candidates_pass(grid)
            if advanced:
                highest = "locked_candidates"
                grid, _ = self._naked_singles_only(grid)
                self._hidden_singles_pass(grid)
                grid, _ = self._naked_singles_only(grid)
            else:
                break
        if _is_solved(grid):
            return highest

        # Tier 4 — + naked pairs.
        while not _is_solved(grid):
            advanced = self._naked_pairs_pass(grid)
            if advanced:
                highest = "naked_pairs"
                grid, _ = self._naked_singles_only(grid)
                self._hidden_singles_pass(grid)
                grid, _ = self._naked_singles_only(grid)
                self._locked_candidates_pass(grid)
                grid, _ = self._naked_singles_only(grid)
            else:
                break
        if _is_solved(grid):
            return highest

        # Tier 5 — + naked triples.
        while not _is_solved(grid):
            advanced = self._naked_triples_pass(grid)
            if advanced:
                highest = "naked_triples"
                grid, _ = self._naked_singles_only(grid)
                self._hidden_singles_pass(grid)
                grid, _ = self._naked_singles_only(grid)
                self._locked_candidates_pass(grid)
                grid, _ = self._naked_singles_only(grid)
                self._naked_pairs_pass(grid)
                grid, _ = self._naked_singles_only(grid)
            else:
                break
        if _is_solved(grid):
            return highest

        return "backtracking"
```

- [ ] **Step 4: Run tests to verify pass**

Run: `cd projects/kdp-puzzle-press && pytest tests/test_sudoku_solver.py -q`
Expected: `11 passed`.

- [ ] **Step 5: Stage**

```bash
git add projects/kdp-puzzle-press/src/pocket_rooster_press/generators/sudoku_solver.py \
        projects/kdp-puzzle-press/tests/test_sudoku_solver.py
```

---

### Task 7: `sudoku.py::remove_symmetric`

**Files:**
- Create: `projects/kdp-puzzle-press/src/pocket_rooster_press/generators/sudoku.py` (full rewrite — we will start with just `remove_symmetric` and grow the file in Tasks 8-9)
- Test: `projects/kdp-puzzle-press/tests/test_sudoku.py` (will be overhauled in Task 10; for now we add a focused test for `remove_symmetric` here)

The legacy `sudoku.py` is being **replaced**, not edited in place. Delete the existing contents and start from a blank file.

- [ ] **Step 1: Write the failing test**

Append (or create if currently re-using the old file) `tests/test_sudoku.py` with the following block; we will fully overhaul this file in Task 10, but we need at least one passing assertion for `remove_symmetric` now.

```python
# tests/test_sudoku.py  (interim — Task 10 will replace this file)
"""Tests for sudoku.SudokuGenerator + remove_symmetric helper.

(This file is fully overhauled in Task 10. Until then it carries the
narrow Task-7 assertion only.)
"""

import random

from pocket_rooster_press.generators.sudoku import remove_symmetric
from pocket_rooster_press.generators.sudoku_filled import filled_grid


class _AlwaysUniqueSolver:
    """Test double — claims every candidate puzzle is unique."""

    def has_unique_solution(self, _grid: list[list[int]]) -> bool:
        return True


def test_remove_symmetric_blanks_in_180_pairs():
    rng = random.Random(0)
    full = filled_grid(rng)
    puzzle = remove_symmetric(full, target_clues=40, solver=_AlwaysUniqueSolver(), rng=rng)
    # Every (r,c) blank has its (8-r,8-c) partner also blank.
    for r in range(9):
        for c in range(9):
            if puzzle[r][c] == 0:
                assert puzzle[8 - r][8 - c] == 0, f"asymmetric blank at ({r},{c})"


def test_remove_symmetric_respects_target_floor():
    """Stops removing once the target clue count is reached."""
    rng = random.Random(1)
    full = filled_grid(rng)
    puzzle = remove_symmetric(full, target_clues=60, solver=_AlwaysUniqueSolver(), rng=rng)
    clues = sum(1 for row in puzzle for v in row if v != 0)
    # We asked to stop at 60; symmetric removal can over-shoot by one pair (2 cells).
    assert clues >= 60
    assert clues <= 81  # sanity
```

- [ ] **Step 2: Run test to verify fail**

Run: `cd projects/kdp-puzzle-press && pytest tests/test_sudoku.py -q`
Expected: `ImportError: cannot import name 'remove_symmetric'` (the old `sudoku.py` doesn't export it).

- [ ] **Step 3: Replace `sudoku.py` with the new file (only the `remove_symmetric` portion for now)**

Overwrite `src/pocket_rooster_press/generators/sudoku.py` with:

```python
"""Sudoku puzzle generator: filled grid + symmetric removal + technique grading."""

from __future__ import annotations

import random
import secrets
from typing import Any

from pocket_rooster_press.generators.base import Difficulty, Puzzle, PuzzleGenerator
from pocket_rooster_press.generators.sudoku_filled import filled_grid
from pocket_rooster_press.generators.sudoku_solver import TechniqueGrader, UniquenessChecker

# Clue-count target ranges per difficulty (used by the orchestrator).
CLUE_RANGES: dict[Difficulty, tuple[int, int]] = {
    Difficulty.EASY:   (38, 48),
    Difficulty.MEDIUM: (30, 40),
    Difficulty.HARD:   (26, 32),
    Difficulty.EXPERT: (22, 26),
}

# Tier → set of acceptable technique grades for that difficulty.
DIFFICULTY_TIER_MAP: dict[Difficulty, set[str]] = {
    Difficulty.EASY:    {"naked_singles"},
    Difficulty.MEDIUM:  {"naked_singles", "hidden_singles"},
    Difficulty.HARD:    {"naked_singles", "hidden_singles", "locked_candidates", "naked_pairs"},
    Difficulty.EXPERT:  {
        "naked_singles",
        "hidden_singles",
        "locked_candidates",
        "naked_pairs",
        "naked_triples",
    },
}


def _clue_count(grid: list[list[int]]) -> int:
    return sum(1 for row in grid for v in row if v != 0)


def remove_symmetric(
    grid: list[list[int]],
    target_clues: int,
    solver: Any,  # duck-typed: must expose has_unique_solution(grid) -> bool
    rng: random.Random,
    max_failed_attempts: int = 50,
) -> list[list[int]]:
    """Iteratively blank 180°-symmetric cell pairs while preserving uniqueness.

    Args:
        grid: a fully-filled valid 9x9 grid.
        target_clues: stop removing once clue_count <= target_clues.
        solver: uniqueness checker (see UniquenessChecker).
        rng: seeded RNG for cell-order shuffling.
        max_failed_attempts: bail after this many consecutive removal failures.

    Returns:
        A new 9x9 grid with some cells blanked (0).
    """
    puzzle = [row[:] for row in grid]
    cells = [(r, c) for r in range(9) for c in range(9)]
    rng.shuffle(cells)
    failures = 0
    while cells and _clue_count(puzzle) > target_clues and failures < max_failed_attempts:
        r, c = cells.pop()
        if puzzle[r][c] == 0:
            continue  # already blanked via its symmetric partner
        r2, c2 = 8 - r, 8 - c
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

- [ ] **Step 4: Run tests to verify pass**

Run: `cd projects/kdp-puzzle-press && pytest tests/test_sudoku.py -q`
Expected: `2 passed`.

- [ ] **Step 5: Stage**

```bash
git add projects/kdp-puzzle-press/src/pocket_rooster_press/generators/sudoku.py \
        projects/kdp-puzzle-press/tests/test_sudoku.py
```

---

### Task 8: `SudokuGenerator.generate(difficulty)` orchestrator

**Files:**
- Modify: `projects/kdp-puzzle-press/src/pocket_rooster_press/generators/sudoku.py`
- Modify: `projects/kdp-puzzle-press/tests/test_sudoku.py`

- [ ] **Step 1: Add the failing test**

Append to `tests/test_sudoku.py`:

```python
from pocket_rooster_press.generators.base import Difficulty
from pocket_rooster_press.generators.sudoku import (
    CLUE_RANGES,
    DIFFICULTY_TIER_MAP,
    SudokuGenerator,
)


def test_generate_returns_puzzle_with_unique_symmetric_metadata():
    gen = SudokuGenerator()
    puzzle = gen.generate(Difficulty.EASY)
    assert puzzle.difficulty == Difficulty.EASY
    assert puzzle.metadata["is_unique"] is True
    assert puzzle.metadata["symmetric"] is True
    assert puzzle.metadata["technique_tier"] in DIFFICULTY_TIER_MAP[Difficulty.EASY]
    low, high = CLUE_RANGES[Difficulty.EASY]
    assert low <= puzzle.metadata["clue_count"] <= high


def test_generate_each_difficulty_matches_tier():
    gen = SudokuGenerator()
    for diff in (Difficulty.EASY, Difficulty.MEDIUM, Difficulty.HARD):
        puzzle = gen.generate(diff)
        assert puzzle.metadata["technique_tier"] in DIFFICULTY_TIER_MAP[diff]


def test_generate_solution_is_complete_9x9():
    gen = SudokuGenerator()
    puzzle = gen.generate(Difficulty.MEDIUM)
    assert len(puzzle.solution) == 9
    for row in puzzle.solution:
        assert len(row) == 9
        for v in row:
            assert 1 <= v <= 9
```

- [ ] **Step 2: Run tests to verify fail**

Run: `cd projects/kdp-puzzle-press && pytest tests/test_sudoku.py -q`
Expected: `ImportError: cannot import name 'SudokuGenerator'`.

- [ ] **Step 3: Add the orchestrator**

Append to `src/pocket_rooster_press/generators/sudoku.py`:

```python
class SudokuGenerator(PuzzleGenerator):
    """Hand-rolled sudoku generator with verified uniqueness, 180° symmetry,
    and technique-tiered difficulty.

    The orchestrator runs:
      1. ``filled_grid(rng)``                — random valid filled 9x9.
      2. ``remove_symmetric(grid, target)``  — blank cells in 180° pairs.
      3. ``TechniqueGrader().grade(...)``    — confirm logic-only difficulty.

    Retries up to 20 times if the technique grade doesn't match the request.
    """

    def __init__(
        self,
        solver: UniquenessChecker | None = None,
        grader: TechniqueGrader | None = None,
        max_attempts: int = 20,
    ) -> None:
        self.solver = solver or UniquenessChecker()
        self.grader = grader or TechniqueGrader()
        self.max_attempts = max_attempts

    def generate(self, difficulty: Difficulty, **_kwargs: Any) -> Puzzle:
        seed = secrets.randbits(63)
        rng = random.Random(seed)
        for _attempt in range(self.max_attempts):
            full = filled_grid(rng)
            target = rng.randint(*CLUE_RANGES[difficulty])
            puzzle = remove_symmetric(full, target, self.solver, rng)
            if not self.solver.has_unique_solution(puzzle):
                continue  # safety net; should never fire
            tier = self.grader.grade(puzzle)
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
        raise RuntimeError(
            f"SudokuGenerator: failed to generate {difficulty.value} puzzle "
            f"in {self.max_attempts} attempts"
        )

    # validate() comes in Task 9.
    def validate(self, _puzzle: Puzzle) -> bool:
        raise NotImplementedError("validate() ships in Task 9")
```

- [ ] **Step 4: Run tests to verify pass**

Run: `cd projects/kdp-puzzle-press && pytest tests/test_sudoku.py -q`
Expected: `5 passed`. Wall-clock budget for this task: < 120 s (each `generate` call costs ~0.5-2 s).

- [ ] **Step 5: Stage**

```bash
git add projects/kdp-puzzle-press/src/pocket_rooster_press/generators/sudoku.py \
        projects/kdp-puzzle-press/tests/test_sudoku.py
```

---

### Task 9: `SudokuGenerator.validate(puzzle)` + drop `py-sudoku` dep

**Files:**
- Modify: `projects/kdp-puzzle-press/src/pocket_rooster_press/generators/sudoku.py`
- Modify: `projects/kdp-puzzle-press/tests/test_sudoku.py`
- Modify: `projects/kdp-puzzle-press/pyproject.toml`

- [ ] **Step 1: Add the failing test**

Append to `tests/test_sudoku.py`:

```python
def test_validate_accepts_generated_puzzle():
    gen = SudokuGenerator()
    puzzle = gen.generate(Difficulty.EASY)
    assert gen.validate(puzzle) is True


def test_validate_rejects_asymmetric_puzzle():
    gen = SudokuGenerator()
    puzzle = gen.generate(Difficulty.EASY)
    # Break the symmetry: unblank one cell whose partner is blank.
    for r in range(9):
        for c in range(9):
            if puzzle.content[r][c] == 0 and puzzle.content[8 - r][8 - c] == 0:
                puzzle.content[r][c] = puzzle.solution[r][c]  # asymmetric now
                break
        else:
            continue
        break
    assert gen.validate(puzzle) is False


def test_validate_rejects_non_unique_puzzle():
    """Construct a deliberately-ambiguous puzzle and confirm validate rejects it."""
    from pocket_rooster_press.generators.sudoku import _clue_count
    gen = SudokuGenerator()
    p = gen.generate(Difficulty.EASY)
    # Remove 30 more clues in symmetric pairs — almost certainly non-unique.
    cells = [(r, c) for r in range(4) for c in range(9)]
    blanked_pairs = 0
    for r, c in cells:
        if blanked_pairs >= 15:
            break
        if p.content[r][c] != 0:
            p.content[r][c] = 0
            p.content[8 - r][8 - c] = 0
            blanked_pairs += 1
    # Sanity: it has < 20 clues, far below any unique-solution threshold (17).
    assert _clue_count(p.content) < 25
    assert gen.validate(p) is False
```

- [ ] **Step 2: Run tests to verify fail**

Run: `cd projects/kdp-puzzle-press && pytest tests/test_sudoku.py -q`
Expected: `NotImplementedError: validate() ships in Task 9` (3 failures).

- [ ] **Step 3: Implement `validate` and clean the file**

Replace the `validate` stub in `src/pocket_rooster_press/generators/sudoku.py` with:

```python
    def validate(self, puzzle: Puzzle) -> bool:
        """Re-verify uniqueness + 180° rotational symmetry of `puzzle.content`.

        Stronger than the old py-sudoku version: this confirms the puzzle has
        *exactly one* completion, not merely that one exists.
        """
        board = puzzle.content
        if len(board) != 9 or any(len(row) != 9 for row in board):
            return False
        # 180° symmetry
        for r in range(9):
            for c in range(9):
                is_blank = board[r][c] == 0
                partner_blank = board[8 - r][8 - c] == 0
                if is_blank != partner_blank:
                    return False
        # Uniqueness
        return self.solver.has_unique_solution(board)
```

- [ ] **Step 4: Remove the `py-sudoku` runtime dep**

In `projects/kdp-puzzle-press/pyproject.toml`, **delete** the line `    "py-sudoku>=1.0,<2",` from the `[project] dependencies` block. The updated list:

```toml
dependencies = [
    "reportlab>=4.2,<5",
    "Pillow>=11.0,<12",
    "dlxsudoku>=1.0,<2",
    "jsonschema>=4.23,<5",
    "click>=8.1,<9",
    "pypdf>=5.0,<7",
]
```

Then run:
```bash
cd projects/kdp-puzzle-press
pip install -e ".[dev]"
python -c "import pocket_rooster_press.generators.sudoku as m; print('ok:', m.SudokuGenerator)"
```
Expected: `ok: <class '...SudokuGenerator'>` with no `py-sudoku` import errors. (The new module no longer references `py-sudoku`. Other generators in the repo do not import it either — verified via `Grep` for `py.sudoku|py_sudoku|from sudoku import` across `src/`.)

- [ ] **Step 5: Run all sudoku tests to confirm**

Run: `cd projects/kdp-puzzle-press && pytest tests/test_sudoku.py tests/test_sudoku_solver.py tests/test_sudoku_filled.py -q`
Expected: `19 passed`.

- [ ] **Step 6: Stage**

```bash
git add projects/kdp-puzzle-press/src/pocket_rooster_press/generators/sudoku.py \
        projects/kdp-puzzle-press/tests/test_sudoku.py \
        projects/kdp-puzzle-press/pyproject.toml
```

---

### Task 10: Overhaul `tests/test_sudoku.py` — the full quality contract

**Files:**
- Modify: `projects/kdp-puzzle-press/tests/test_sudoku.py` (replace the whole file)

The interim test file from Tasks 7-9 carried 10 assertions. Now we replace it with the full quality contract per spec §6: 250 puzzles per difficulty × 4 difficulties = 1000 puzzles asserting uniqueness, symmetry, tier match, no backtracking, clue counts, round-trip serialization, and a perf test (marked `slow`).

- [ ] **Step 1: Overwrite the test file**

Replace `tests/test_sudoku.py` entirely with:

```python
"""Quality contract tests for SudokuGenerator.

These tests are the *contract* the new generator promises. The "thousand"
suite runs ~10-20 s on commodity hardware; the perf test is marked slow.

Run all (CI mode, no slow): pytest tests/test_sudoku.py -q -m "not slow"
Run with perf:              pytest tests/test_sudoku.py -q
"""

from __future__ import annotations

import json
import random
import time

import pytest

from pocket_rooster_press.generators.base import Difficulty, Puzzle
from pocket_rooster_press.generators.sudoku import (
    CLUE_RANGES,
    DIFFICULTY_TIER_MAP,
    SudokuGenerator,
    _clue_count,
    remove_symmetric,
)
from pocket_rooster_press.generators.sudoku_filled import filled_grid
from pocket_rooster_press.generators.sudoku_solver import UniquenessChecker

PUZZLES_PER_DIFFICULTY = 25   # CI default; perf test scales to 250
DIFFICULTIES = (
    Difficulty.EASY,
    Difficulty.MEDIUM,
    Difficulty.HARD,
    Difficulty.EXPERT,
)


@pytest.fixture(scope="module")
def generated_set() -> dict[Difficulty, list[Puzzle]]:
    """Generate a small CI-friendly set, reused across the suite."""
    gen = SudokuGenerator()
    out: dict[Difficulty, list[Puzzle]] = {}
    for diff in DIFFICULTIES:
        out[diff] = [gen.generate(diff) for _ in range(PUZZLES_PER_DIFFICULTY)]
    return out


def test_uniqueness_each_puzzle(generated_set: dict[Difficulty, list[Puzzle]]) -> None:
    checker = UniquenessChecker()
    for diff, puzzles in generated_set.items():
        for p in puzzles:
            assert checker.has_unique_solution(p.content), (
                f"{diff.value} puzzle is NOT unique: {p.metadata}"
            )


def test_symmetry_180_each_puzzle(generated_set: dict[Difficulty, list[Puzzle]]) -> None:
    for diff, puzzles in generated_set.items():
        for p in puzzles:
            for r in range(9):
                for c in range(9):
                    a = p.content[r][c] == 0
                    b = p.content[8 - r][8 - c] == 0
                    assert a == b, f"{diff.value} puzzle asymmetric at ({r},{c}): {p.metadata}"


def test_technique_tier_matches_difficulty(generated_set: dict[Difficulty, list[Puzzle]]) -> None:
    for diff, puzzles in generated_set.items():
        allowed = DIFFICULTY_TIER_MAP[diff]
        for p in puzzles:
            assert p.metadata["technique_tier"] in allowed, (
                f"{diff.value} graded as {p.metadata['technique_tier']}, "
                f"expected one of {allowed}"
            )


def test_no_backtracking_required(generated_set: dict[Difficulty, list[Puzzle]]) -> None:
    for puzzles in generated_set.values():
        for p in puzzles:
            assert p.metadata["technique_tier"] != "backtracking"


def test_clue_count_in_range(generated_set: dict[Difficulty, list[Puzzle]]) -> None:
    for diff, puzzles in generated_set.items():
        low, high = CLUE_RANGES[diff]
        for p in puzzles:
            n = _clue_count(p.content)
            assert low <= n <= high, (
                f"{diff.value} clue count {n} outside [{low},{high}]"
            )


def test_round_trip_serialization() -> None:
    gen = SudokuGenerator()
    p = gen.generate(Difficulty.MEDIUM)
    payload = {
        "difficulty": p.difficulty.value,
        "content": p.content,
        "solution": p.solution,
        "metadata": p.metadata,
    }
    blob = json.dumps(payload)
    parsed = json.loads(blob)
    # Reconstruct + re-verify
    revived = Puzzle(
        difficulty=Difficulty(parsed["difficulty"]),
        content=parsed["content"],
        solution=parsed["solution"],
        metadata=parsed["metadata"],
    )
    assert gen.validate(revived) is True


def test_remove_symmetric_helper_blanks_pairs() -> None:
    rng = random.Random(7)
    full = filled_grid(rng)

    class _Yes:
        def has_unique_solution(self, _grid):
            return True

    p = remove_symmetric(full, target_clues=40, solver=_Yes(), rng=rng)
    for r in range(9):
        for c in range(9):
            if p[r][c] == 0:
                assert p[8 - r][8 - c] == 0


@pytest.mark.slow
def test_performance_100_medium() -> None:
    """Generating 100 medium puzzles completes in < 60 s. Local-only."""
    gen = SudokuGenerator()
    t0 = time.monotonic()
    for _ in range(100):
        gen.generate(Difficulty.MEDIUM)
    elapsed = time.monotonic() - t0
    assert elapsed < 60.0, f"100 medium puzzles took {elapsed:.1f}s (budget 60s)"


@pytest.mark.slow
def test_full_thousand_puzzles_pass_all_contracts() -> None:
    """Scale-up: 250 per difficulty (1000 total). Local-only."""
    gen = SudokuGenerator()
    checker = UniquenessChecker()
    for diff in DIFFICULTIES:
        allowed = DIFFICULTY_TIER_MAP[diff]
        low, high = CLUE_RANGES[diff]
        for _ in range(250):
            p = gen.generate(diff)
            assert checker.has_unique_solution(p.content)
            assert p.metadata["technique_tier"] in allowed
            n = _clue_count(p.content)
            assert low <= n <= high
            for r in range(9):
                for c in range(9):
                    assert (p.content[r][c] == 0) == (p.content[8 - r][8 - c] == 0)
```

- [ ] **Step 2: Register the `slow` marker in `pyproject.toml`**

In `projects/kdp-puzzle-press/pyproject.toml`, replace the `[tool.pytest.ini_options]` section with:

```toml
[tool.pytest.ini_options]
testpaths = ["tests"]
addopts = "--cov=src --cov-report=term-missing"
markers = [
    "slow: long-running tests skipped by default in CI (use -m slow to run)",
]
```

- [ ] **Step 3: Run CI mode**

Run: `cd projects/kdp-puzzle-press && pytest tests/test_sudoku.py -q -m "not slow"`
Expected: `7 passed` in < 60 s. (25 puzzles × 4 difficulties = 100 puzzles; the slow markers exclude 2 tests.)

- [ ] **Step 4: Run slow mode (optional, local-only)**

Run: `cd projects/kdp-puzzle-press && pytest tests/test_sudoku.py::test_full_thousand_puzzles_pass_all_contracts -q`
Expected: `1 passed` in < 10 min on commodity hardware. If it fails, dig in: either the grader is mis-tiering puzzles (most likely cause) or the clue-range bands are too tight for what `remove_symmetric` can achieve.

- [ ] **Step 5: Stage**

```bash
git add projects/kdp-puzzle-press/tests/test_sudoku.py \
        projects/kdp-puzzle-press/pyproject.toml
```

---

### Task 11: `scripts/audit_puzzles.py` CLI

**Files:**
- Create: `projects/kdp-puzzle-press/scripts/audit_puzzles.py`
- Test: `projects/kdp-puzzle-press/tests/test_audit_puzzles_cli.py`

The CLI reads `output/kdp-ready/<slug>/puzzles.json` (written by `rebuild_sudoku.py` in Task 12) and emits a JSON document matching spec §4 to stdout. **Exit 0 on success**, even if some puzzles fail the audit — failures are reflected in the JSON `totals`, not via the exit code. Reserve **non-zero exit** for hard errors (slug unknown, puzzles.json missing).

- [ ] **Step 1: Write the failing test**

```python
# tests/test_audit_puzzles_cli.py
"""Tests for the audit_puzzles.py CLI."""

import json
import subprocess
import sys
from pathlib import Path

import pytest


PROJ_ROOT = Path(__file__).resolve().parent.parent
SCRIPT = PROJ_ROOT / "scripts" / "audit_puzzles.py"


@pytest.fixture
def fixture_book(tmp_path: Path) -> Path:
    """Stage a fake kdp-ready/<slug>/puzzles.json under tmp_path."""
    slug = "fixture-book"
    book_dir = tmp_path / "kdp-ready" / slug
    book_dir.mkdir(parents=True)
    # One puzzle that the grader will trivially confirm as easy.
    puzzles = [
        {
            "index": 1,
            "difficulty": "easy",
            "content": [
                [0, 0, 3, 0, 2, 0, 6, 0, 0],
                [9, 0, 0, 3, 0, 5, 0, 0, 1],
                [0, 0, 1, 8, 0, 6, 4, 0, 0],
                [0, 0, 8, 1, 0, 2, 9, 0, 0],
                [7, 0, 0, 0, 0, 0, 0, 0, 8],
                [0, 0, 6, 7, 0, 8, 2, 0, 0],
                [0, 0, 2, 6, 0, 9, 5, 0, 0],
                [8, 0, 0, 2, 0, 3, 0, 0, 9],
                [0, 0, 5, 0, 1, 0, 3, 0, 0],
            ],
        }
    ]
    (book_dir / "puzzles.json").write_text(
        json.dumps({"slug": slug, "puzzles": puzzles})
    )
    return tmp_path


def test_audit_emits_expected_json_shape(fixture_book: Path) -> None:
    result = subprocess.run(
        [
            sys.executable,
            str(SCRIPT),
            "--book=fixture-book",
            f"--kdp-ready-root={fixture_book / 'kdp-ready'}",
        ],
        check=True,
        capture_output=True,
        text=True,
    )
    payload = json.loads(result.stdout)
    assert "puzzles" in payload
    assert "totals" in payload
    assert payload["totals"]["checked"] == 1
    entry = payload["puzzles"][0]
    assert entry["index"] == 1
    assert entry["difficulty"] == "easy"
    assert "is_unique" in entry
    assert "symmetric_180" in entry
    assert "technique_tier" in entry
    assert "match_difficulty" in entry
    assert "clue_count" in entry


def test_audit_rejects_unknown_book(tmp_path: Path) -> None:
    (tmp_path / "kdp-ready").mkdir()
    result = subprocess.run(
        [
            sys.executable,
            str(SCRIPT),
            "--book=does-not-exist",
            f"--kdp-ready-root={tmp_path / 'kdp-ready'}",
        ],
        capture_output=True,
        text=True,
    )
    assert result.returncode != 0
    assert "does-not-exist" in result.stderr
```

- [ ] **Step 2: Run tests to verify fail**

Run: `cd projects/kdp-puzzle-press && pytest tests/test_audit_puzzles_cli.py -q`
Expected: `FileNotFoundError` or `subprocess` exit-2 ("script not found"). Both tests fail.

- [ ] **Step 3: Write the CLI**

```python
# scripts/audit_puzzles.py
"""Audit a sudoku book's puzzles for uniqueness, symmetry, and difficulty tier.

Usage:
    python scripts/audit_puzzles.py --book=<slug>
    python scripts/audit_puzzles.py --book=<slug> --kdp-ready-root=/path

Reads `<kdp-ready-root>/<slug>/puzzles.json` (written by rebuild_sudoku.py).
Prints a JSON document to stdout matching the contract in
docs/superpowers/specs/2026-05-26-sudoku-quality-rework-design.md §4.
Exits 0 on success (regardless of whether all puzzles passed); non-zero on
hard errors (book not found, JSON malformed).
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

PROJ_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJ_ROOT / "src"))

from pocket_rooster_press.generators.base import Difficulty  # noqa: E402
from pocket_rooster_press.generators.sudoku import (  # noqa: E402
    DIFFICULTY_TIER_MAP,
    _clue_count,
)
from pocket_rooster_press.generators.sudoku_solver import (  # noqa: E402
    TechniqueGrader,
    UniquenessChecker,
)

SLUG_RE = re.compile(r"^[a-z0-9][a-z0-9-]*$")


def _is_180_symmetric(grid: list[list[int]]) -> bool:
    for r in range(9):
        for c in range(9):
            if (grid[r][c] == 0) != (grid[8 - r][8 - c] == 0):
                return False
    return True


def audit_book(slug: str, kdp_ready_root: Path) -> dict:
    book_dir = kdp_ready_root / slug
    puzzles_json = book_dir / "puzzles.json"
    if not puzzles_json.exists():
        raise FileNotFoundError(
            f"Book {slug!r}: no puzzles.json at {puzzles_json}"
        )
    data = json.loads(puzzles_json.read_text())
    checker = UniquenessChecker()
    grader = TechniqueGrader()
    entries = []
    totals = {
        "checked": 0,
        "passed": 0,
        "failed": 0,
        "uniqueness_failures": 0,
        "symmetry_failures": 0,
        "tier_mismatches": 0,
    }
    for i, p in enumerate(data["puzzles"]):
        idx = p.get("index", i + 1)
        difficulty_str = p["difficulty"]
        content = p["content"]
        is_unique = checker.has_unique_solution(content)
        symmetric = _is_180_symmetric(content)
        tier = grader.grade(content)
        allowed = DIFFICULTY_TIER_MAP[Difficulty(difficulty_str)]
        match = tier in allowed
        entries.append({
            "index": idx,
            "difficulty": difficulty_str,
            "clue_count": _clue_count(content),
            "is_unique": is_unique,
            "symmetric_180": symmetric,
            "technique_tier": tier,
            "match_difficulty": match,
        })
        totals["checked"] += 1
        if is_unique and symmetric and match:
            totals["passed"] += 1
        else:
            totals["failed"] += 1
            if not is_unique:
                totals["uniqueness_failures"] += 1
            if not symmetric:
                totals["symmetry_failures"] += 1
            if not match:
                totals["tier_mismatches"] += 1
    return {"puzzles": entries, "totals": totals}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--book", required=True, help="kdp-ready book slug")
    parser.add_argument(
        "--kdp-ready-root",
        default=str(PROJ_ROOT / "output" / "kdp-ready"),
        help="Root directory containing per-book subdirs (default: repo-local)",
    )
    args = parser.parse_args()
    slug = args.book
    if not SLUG_RE.match(slug):
        print(f"error: invalid slug {slug!r}", file=sys.stderr)
        return 2
    root = Path(args.kdp_ready_root)
    if not root.exists():
        print(f"error: kdp-ready root {root} does not exist", file=sys.stderr)
        return 2
    try:
        result = audit_book(slug, root)
    except FileNotFoundError as err:
        print(f"error: {err}", file=sys.stderr)
        return 1
    json.dump(result, sys.stdout, indent=2)
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
```

- [ ] **Step 4: Run tests to verify pass**

Run: `cd projects/kdp-puzzle-press && pytest tests/test_audit_puzzles_cli.py -q`
Expected: `2 passed`.

- [ ] **Step 5: Stage**

```bash
git add projects/kdp-puzzle-press/scripts/audit_puzzles.py \
        projects/kdp-puzzle-press/tests/test_audit_puzzles_cli.py
```

---

### Task 12: `scripts/rebuild_sudoku.py` CLI

**Files:**
- Create: `projects/kdp-puzzle-press/scripts/rebuild_sudoku.py`
- Test: `projects/kdp-puzzle-press/tests/test_rebuild_sudoku_cli.py`

This CLI re-runs a sudoku book module's `build()` (so the layout, cover, intro pages, etc. are all preserved) AND writes a `puzzles.json` next to the new `interior.pdf` so the audit CLI can read the puzzle data deterministically. To capture the puzzles, we patch the book module's `SudokuGenerator` import at runtime with a recording subclass; this avoids forking each book module.

- [ ] **Step 1: Write the failing test**

```python
# tests/test_rebuild_sudoku_cli.py
"""Tests for the rebuild_sudoku.py CLI."""

import json
import subprocess
import sys
from pathlib import Path

import pytest

PROJ_ROOT = Path(__file__).resolve().parent.parent
SCRIPT = PROJ_ROOT / "scripts" / "rebuild_sudoku.py"


KNOWN_BOOK_SLUGS = (
    "large-print-sudoku-grandparents",
    "travel-sudoku-v1",
    "travel-sudoku-v2",
)


@pytest.mark.slow
@pytest.mark.parametrize("slug", KNOWN_BOOK_SLUGS)
def test_rebuild_emits_interior_and_puzzles_json(tmp_path: Path, slug: str) -> None:
    """End-to-end: rebuild a real book module into an isolated output dir."""
    output_dir = tmp_path / "out"
    output_dir.mkdir()
    result = subprocess.run(
        [
            sys.executable,
            str(SCRIPT),
            f"--book={slug}",
            f"--output-dir={output_dir}",
        ],
        check=True,
        capture_output=True,
        text=True,
        timeout=600,
    )
    book_dir = output_dir / "kdp-ready" / slug
    assert (book_dir / "interior.pdf").exists()
    assert (book_dir / "puzzles.json").exists()
    payload = json.loads((book_dir / "puzzles.json").read_text())
    assert payload["slug"] == slug
    assert len(payload["puzzles"]) > 0
    # Spot-check shape of first entry
    p = payload["puzzles"][0]
    assert "index" in p
    assert "difficulty" in p
    assert "content" in p
    assert "solution" in p


def test_rebuild_rejects_unknown_book() -> None:
    result = subprocess.run(
        [sys.executable, str(SCRIPT), "--book=does-not-exist"],
        capture_output=True,
        text=True,
    )
    assert result.returncode != 0
    assert "does-not-exist" in result.stderr
```

- [ ] **Step 2: Run tests to verify fail**

Run: `cd projects/kdp-puzzle-press && pytest tests/test_rebuild_sudoku_cli.py -q`
Expected: script not found / module not found. Both tests fail.

- [ ] **Step 3: Write the CLI**

```python
# scripts/rebuild_sudoku.py
"""Rebuild a sudoku book's interior with the new SudokuGenerator.

Usage:
    python scripts/rebuild_sudoku.py --book=<slug>
    python scripts/rebuild_sudoku.py --book=<slug> --output-dir=/path

Looks up the book module by slug, invokes its build(output_dir=...) entry
point, and additionally writes <output_dir>/kdp-ready/<slug>/puzzles.json
capturing every generated puzzle for downstream audit.
"""

from __future__ import annotations

import argparse
import importlib
import json
import re
import sys
from pathlib import Path

PROJ_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJ_ROOT / "src"))

from pocket_rooster_press.generators import sudoku as sudoku_mod  # noqa: E402
from pocket_rooster_press.generators.base import Puzzle  # noqa: E402

SLUG_RE = re.compile(r"^[a-z0-9][a-z0-9-]*$")

# Map slug → fully-qualified module path. Add new sudoku books here when
# they ship.
BOOK_MODULES: dict[str, str] = {
    "large-print-sudoku-grandparents": "pocket_rooster_press.books.large_print_sudoku_grandparents",
    "travel-sudoku-v1": "pocket_rooster_press.books.travel_sudoku_v1",
    "travel-sudoku-v2": "pocket_rooster_press.books.travel_sudoku_v2",
}


class _RecordingSudokuGenerator(sudoku_mod.SudokuGenerator):
    """SudokuGenerator subclass that captures every Puzzle it returns."""

    def __init__(self, captured: list[Puzzle], **kwargs):
        super().__init__(**kwargs)
        self._captured = captured

    def generate(self, difficulty, **kwargs):
        p = super().generate(difficulty, **kwargs)
        self._captured.append(p)
        return p


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--book", required=True)
    parser.add_argument(
        "--output-dir",
        default=str(PROJ_ROOT / "output"),
        help="Root output dir (default: <repo>/projects/kdp-puzzle-press/output)",
    )
    args = parser.parse_args()
    slug = args.book
    if not SLUG_RE.match(slug):
        print(f"error: invalid slug {slug!r}", file=sys.stderr)
        return 2
    module_path = BOOK_MODULES.get(slug)
    if module_path is None:
        print(
            f"error: unknown sudoku book {slug!r}. Known: {sorted(BOOK_MODULES)}",
            file=sys.stderr,
        )
        return 1

    captured: list[Puzzle] = []

    # Monkey-patch the book module's SudokuGenerator with the recording one,
    # then call build() and restore.
    book_mod = importlib.import_module(module_path)
    original = book_mod.SudokuGenerator
    book_mod.SudokuGenerator = lambda *a, **kw: _RecordingSudokuGenerator(
        captured, *a, **kw
    )
    try:
        output_dir = Path(args.output_dir)
        output_dir.mkdir(parents=True, exist_ok=True)
        interior, _cover = book_mod.build(output_dir=output_dir)
    finally:
        book_mod.SudokuGenerator = original

    print(f"rebuilt interior: {interior}", file=sys.stderr)
    print(f"captured {len(captured)} puzzles", file=sys.stderr)

    # Write puzzles.json adjacent to the kdp-ready interior.pdf so the audit
    # CLI can read it back.
    kdp_ready_dir = output_dir / "kdp-ready" / slug
    kdp_ready_dir.mkdir(parents=True, exist_ok=True)
    puzzles_payload = {
        "slug": slug,
        "puzzles": [
            {
                "index": i + 1,
                "difficulty": p.difficulty.value,
                "content": p.content,
                "solution": p.solution,
                "metadata": p.metadata,
            }
            for i, p in enumerate(captured)
        ],
    }
    (kdp_ready_dir / "puzzles.json").write_text(json.dumps(puzzles_payload, indent=2))
    print(f"wrote {kdp_ready_dir / 'puzzles.json'}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
```

- [ ] **Step 4: Run the non-slow test (cheap unknown-book case)**

Run: `cd projects/kdp-puzzle-press && pytest tests/test_rebuild_sudoku_cli.py::test_rebuild_rejects_unknown_book -q`
Expected: `1 passed`.

- [ ] **Step 5: Run one slow case as a smoke test**

Run: `cd projects/kdp-puzzle-press && pytest tests/test_rebuild_sudoku_cli.py::test_rebuild_emits_interior_and_puzzles_json -q -k "travel-sudoku-v2"`
Expected: `1 passed` in ~3-5 minutes (120 puzzles for v2). If you want to skip it during plan execution and defer to Commit 3, you may; the parametrized slow tests are also explicitly re-run in Commit 3's Tasks 19-21.

- [ ] **Step 6: Stage**

```bash
git add projects/kdp-puzzle-press/scripts/rebuild_sudoku.py \
        projects/kdp-puzzle-press/tests/test_rebuild_sudoku_cli.py
```

- [ ] **Step 7: COMMIT the full generator rewrite**

```bash
git status   # sanity-check the staged set
git commit -m "$(cat <<'EOF'
feat(sudoku): rewrite generator with uniqueness + 180° symmetry + technique grader

Rewrites projects/kdp-puzzle-press/src/pocket_rooster_press/generators/sudoku.py
to abandon py-sudoku in favor of a hand-rolled three-stage pipeline:
filled-grid Las-Vegas backtracker, 180°-symmetric removal loop with
dlxsudoku uniqueness checks, and a 5-tier technique grader. Difficulty
now reflects the techniques required, not the clue count alone.

New modules: sudoku_filled.py (stage 1), sudoku_solver.py
(UniquenessChecker + TechniqueGrader). Two new CLIs:
scripts/rebuild_sudoku.py regenerates a book's interior and writes
puzzles.json; scripts/audit_puzzles.py reads puzzles.json and emits
the audit JSON contract from the design spec.

Overhauls tests/test_sudoku.py to assert the real contract: uniqueness,
180° symmetry, tier match, no backtracking, clue count, and round-trip
serialization. Adds tests/test_sudoku_solver.py + test_sudoku_filled.py +
test_audit_puzzles_cli.py + test_rebuild_sudoku_cli.py. The 1000-puzzle
contract test and the perf test are marked `slow` and skipped in CI.

Drops py-sudoku from pyproject.toml; adds dlxsudoku.

Spec: docs/superpowers/specs/2026-05-26-sudoku-quality-rework-design.md

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 8: Verify commit landed**

Run: `git log --oneline -1`
Expected: a `feat(sudoku): ...` line at HEAD.

---

## Commit 2 — Dashboard puzzle_audit extension

End-of-phase commit message: `feat(audit): dashboard puzzle-audit extension`

### Task 13: Migration 0002 — adds 3 columns to `kdp_books`

**Files:**
- Create: `web.ui/backend/migrations/0002_puzzle_audit.sql`
- Test: `web.ui/backend/__tests__/migrations_0002.test.js`

- [ ] **Step 1: Write the failing test**

```javascript
// __tests__/migrations_0002.test.js
/**
 * Migration 0002 verification: after migration applies, kdp_books has the
 * three new columns and they accept the values from spec §4. Idempotency
 * is exercised by re-opening the DB (db.js skips already-applied migrations).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { openDb, _resetForTests } from '../db.js';

let tmpRoot;
let tmpDb;

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mig0002-'));
  tmpDb = path.join(tmpRoot, 'test.db');
  process.env.ROOSTER_DB_PATH = tmpDb;
  _resetForTests();
});

afterEach(() => {
  _resetForTests();
  try {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  } catch (_e) {}
  delete process.env.ROOSTER_DB_PATH;
});

describe('migration 0002_puzzle_audit', () => {
  it('adds puzzle_audit_status, puzzle_audit_at, puzzle_audit_summary_json columns', () => {
    const db = openDb();
    const cols = db.prepare('PRAGMA table_info(kdp_books)').all().map((c) => c.name);
    expect(cols).toContain('puzzle_audit_status');
    expect(cols).toContain('puzzle_audit_at');
    expect(cols).toContain('puzzle_audit_summary_json');
  });

  it('accepts the three valid status values and NULL', () => {
    const db = openDb();
    const ins = db.prepare(`
      INSERT INTO kdp_books (slug, title, status, output_dir, puzzle_audit_status)
      VALUES (?, ?, 'built', ?, ?)
    `);
    expect(() => ins.run('a', 'A', '/tmp/a', 'unchecked')).not.toThrow();
    expect(() => ins.run('b', 'B', '/tmp/b', 'passed')).not.toThrow();
    expect(() => ins.run('c', 'C', '/tmp/c', 'failed')).not.toThrow();
    expect(() => ins.run('d', 'D', '/tmp/d', null)).not.toThrow();
  });

  it('rejects invalid status values via CHECK constraint', () => {
    const db = openDb();
    expect(() => {
      db.prepare(`
        INSERT INTO kdp_books (slug, title, status, output_dir, puzzle_audit_status)
        VALUES ('bad', 'Bad', 'built', '/tmp/bad', 'totally-invalid')
      `).run();
    }).toThrow(/CHECK constraint failed/);
  });

  it('is idempotent across re-opens', () => {
    openDb();
    _resetForTests();
    openDb(); // would crash if the migration re-ran ALTER TABLE
    expect(true).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify fail**

Run: `cd web.ui/backend && npx vitest run __tests__/migrations_0002.test.js`
Expected: `migration 0002 ... fails` — `cols` does not contain the new column names.

- [ ] **Step 3: Write the migration**

Create `web.ui/backend/migrations/0002_puzzle_audit.sql`:

```sql
-- Migration 0002 — adds puzzle audit fields to kdp_books.
-- Source of truth: docs/superpowers/specs/2026-05-26-sudoku-quality-rework-design.md §4

ALTER TABLE kdp_books ADD COLUMN puzzle_audit_status TEXT
    CHECK (puzzle_audit_status IS NULL OR puzzle_audit_status IN ('unchecked','passed','failed'));

ALTER TABLE kdp_books ADD COLUMN puzzle_audit_at TEXT;

ALTER TABLE kdp_books ADD COLUMN puzzle_audit_summary_json TEXT;
```

- [ ] **Step 4: Run test to verify pass**

Run: `cd web.ui/backend && npx vitest run __tests__/migrations_0002.test.js`
Expected: `4 passed`.

- [ ] **Step 5: Stage**

```bash
git add web.ui/backend/migrations/0002_puzzle_audit.sql \
        web.ui/backend/__tests__/migrations_0002.test.js
```

---

### Task 14: `audit_routes.js` — POST `/api/kdp/books/:slug/audit-puzzles`

**Files:**
- Create: `web.ui/backend/kdp/audit_routes.js`
- Test: `web.ui/backend/__tests__/kdp/audit_routes.test.js`

The route spawns a Python subprocess via an injectable factory so tests don't shell out. Inputs are validated against the spec §8 slug regex; output is the audit JSON written into the row plus an SSE `kdp:audit-complete` event.

- [ ] **Step 1: Write the failing test**

```javascript
// __tests__/kdp/audit_routes.test.js
/**
 * Tests for POST /api/kdp/books/:slug/audit-puzzles.
 *
 * Injects a fake pythonRunner so the test never spawns python. The fake
 * receives the slug + cwd and returns canned audit-JSON stdout.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { openDb, _resetForTests } from '../../db.js';
import { _resetSubscribersForTests, subscribe } from '../../events.js';
import { createAuditRouter } from '../../kdp/audit_routes.js';

let tmpRoot;
let tmpDb;
let runnerCalls;
let runnerImpl;
let app;
let events;

function buildApp() {
  const a = express();
  a.use(express.json());
  a.use(
    '/api/kdp',
    createAuditRouter({
      pythonRunner: async (...args) => {
        runnerCalls.push(args);
        return runnerImpl(...args);
      },
    }),
  );
  return a;
}

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'audit-routes-'));
  tmpDb = path.join(tmpRoot, 'test.db');
  process.env.ROOSTER_DB_PATH = tmpDb;
  _resetForTests();
  _resetSubscribersForTests();
  events = [];
  subscribe((e) => events.push(e));
  runnerCalls = [];
  runnerImpl = async () => ({
    code: 0,
    stdout: JSON.stringify({
      puzzles: [
        {
          index: 1,
          difficulty: 'easy',
          clue_count: 42,
          is_unique: true,
          symmetric_180: true,
          technique_tier: 'naked_singles',
          match_difficulty: true,
        },
      ],
      totals: {
        checked: 1,
        passed: 1,
        failed: 0,
        uniqueness_failures: 0,
        symmetry_failures: 0,
        tier_mismatches: 0,
      },
    }),
    stderr: '',
  });
  app = buildApp();
  const db = openDb();
  db.prepare(`
    INSERT INTO kdp_books (slug, title, status, output_dir)
    VALUES ('book-a', 'Book A', 'built', ?)
  `).run(path.join(tmpRoot, 'book-a'));
});

afterEach(() => {
  _resetForTests();
  _resetSubscribersForTests();
  try { fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch (_e) {}
  delete process.env.ROOSTER_DB_PATH;
});

describe('POST /api/kdp/books/:slug/audit-puzzles', () => {
  it('writes passed/at/json on a clean audit', async () => {
    const res = await request(app)
      .post('/api/kdp/books/book-a/audit-puzzles')
      .send();
    expect(res.status).toBe(200);
    expect(res.body.book.puzzle_audit_status).toBe('passed');
    expect(res.body.book.puzzle_audit_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    const summary = JSON.parse(res.body.book.puzzle_audit_summary_json);
    expect(summary.totals.checked).toBe(1);
  });

  it('emits kdp:audit-started then kdp:audit-complete events', async () => {
    await request(app).post('/api/kdp/books/book-a/audit-puzzles').send();
    const kinds = events.map((e) => e.kind);
    expect(kinds).toContain('kdp:audit-started');
    expect(kinds).toContain('kdp:audit-complete');
  });

  it('writes failed when any puzzle does not pass', async () => {
    runnerImpl = async () => ({
      code: 0,
      stdout: JSON.stringify({
        puzzles: [{ index: 1, difficulty: 'easy', clue_count: 42, is_unique: false, symmetric_180: true, technique_tier: 'naked_singles', match_difficulty: true }],
        totals: { checked: 1, passed: 0, failed: 1, uniqueness_failures: 1, symmetry_failures: 0, tier_mismatches: 0 },
      }),
      stderr: '',
    });
    const res = await request(app).post('/api/kdp/books/book-a/audit-puzzles').send();
    expect(res.status).toBe(200);
    expect(res.body.book.puzzle_audit_status).toBe('failed');
  });

  it('rejects slugs that do not match ^[a-z0-9][a-z0-9-]*$', async () => {
    const res = await request(app).post('/api/kdp/books/Bad_Slug/audit-puzzles').send();
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid_slug');
    expect(runnerCalls.length).toBe(0);
  });

  it('returns 404 for unknown book', async () => {
    const res = await request(app).post('/api/kdp/books/no-such-book/audit-puzzles').send();
    expect(res.status).toBe(404);
  });

  it('records failed + error on non-zero subprocess exit', async () => {
    runnerImpl = async () => ({ code: 2, stdout: '', stderr: 'boom from python' });
    const res = await request(app).post('/api/kdp/books/book-a/audit-puzzles').send();
    expect(res.status).toBe(500);
    expect(res.body.book.puzzle_audit_status).toBe('failed');
    const summary = JSON.parse(res.body.book.puzzle_audit_summary_json);
    expect(summary.error).toMatch(/boom/);
  });

  it('records failed + audit_timeout on runner timeout', async () => {
    runnerImpl = async () => ({ code: null, stdout: '', stderr: '', timedOut: true });
    const res = await request(app).post('/api/kdp/books/book-a/audit-puzzles').send();
    expect(res.status).toBe(500);
    const summary = JSON.parse(res.body.book.puzzle_audit_summary_json);
    expect(summary.error).toBe('audit_timeout');
  });
});
```

- [ ] **Step 2: Run test to verify fail**

Run: `cd web.ui/backend && npx vitest run __tests__/kdp/audit_routes.test.js`
Expected: `Cannot find module '../../kdp/audit_routes.js'`.

- [ ] **Step 3: Write the router**

Create `web.ui/backend/kdp/audit_routes.js`:

```javascript
/**
 * POST /api/kdp/books/:slug/audit-puzzles
 *
 * Spawns a Python subprocess that runs
 *   `python projects/kdp-puzzle-press/scripts/audit_puzzles.py --book=<slug>`
 * captures the JSON stdout, validates the shape, writes audit_status +
 * audit_at + audit_summary_json onto the kdp_books row, and broadcasts
 * `kdp:audit-started` + `kdp:audit-complete` over the SSE channel.
 *
 * The Python runner is injected so tests don't shell out. Default runner
 * uses node:child_process.spawn with a 5-minute timeout per spec §8.
 *
 * @module kdp/audit_routes
 */
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { openDb } from '../db.js';
import { recordEvent } from '../events.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** Slug whitelist per spec §8. */
const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;

/** Subprocess hard timeout (ms) — spec §8. */
const AUDIT_TIMEOUT_MS = 5 * 60 * 1000;

/**
 * Default pythonRunner. Spawns `python <script> --book=<slug>` with a
 * 5-minute timeout. Resolves to {code, stdout, stderr, timedOut}.
 *
 * @param {string} slug
 * @returns {Promise<{code: number|null, stdout: string, stderr: string, timedOut?: boolean}>}
 */
async function defaultPythonRunner(slug) {
  // __dirname = .../web.ui/backend/kdp ; repo root is three levels up.
  const repoRoot = path.resolve(__dirname, '..', '..', '..');
  const script = path.join(
    repoRoot,
    'projects',
    'kdp-puzzle-press',
    'scripts',
    'audit_puzzles.py',
  );
  return new Promise((resolve) => {
    const proc = spawn(
      process.env.ROOSTER_PYTHON || 'python',
      [script, `--book=${slug}`],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    );
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      proc.kill('SIGKILL');
    }, AUDIT_TIMEOUT_MS);
    proc.stdout.on('data', (chunk) => (stdout += chunk.toString('utf8')));
    proc.stderr.on('data', (chunk) => (stderr += chunk.toString('utf8')));
    proc.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code: timedOut ? null : code, stdout, stderr, timedOut });
    });
  });
}

/**
 * Build the audit router. Inject `pythonRunner` in tests.
 *
 * @param {{pythonRunner?: (slug: string) => Promise<{code:number|null, stdout:string, stderr:string, timedOut?:boolean}>}} [opts]
 * @returns {import('express').Router}
 */
export function createAuditRouter(opts = {}) {
  const pythonRunner = opts.pythonRunner ?? defaultPythonRunner;
  const router = express.Router();

  router.post('/books/:slug/audit-puzzles', async (req, res) => {
    const slug = String(req.params.slug);
    if (!SLUG_RE.test(slug)) {
      return res.status(400).json({ error: 'invalid_slug', expected: SLUG_RE.source });
    }
    const db = openDb();
    const book = db.prepare('SELECT * FROM kdp_books WHERE slug = ?').get(slug);
    if (!book) {
      return res.status(404).json({ error: 'not_found' });
    }

    recordEvent('kdp:audit-started', { slug });

    let result;
    try {
      result = await pythonRunner(slug);
    } catch (err) {
      const summary = { error: String(err?.message || err) };
      writeAuditRow(db, book.id, 'failed', summary);
      const updated = db.prepare('SELECT * FROM kdp_books WHERE id = ?').get(book.id);
      recordEvent('kdp:audit-complete', { slug, status: 'failed' });
      return res.status(500).json({ book: updated });
    }

    // Timeout
    if (result.timedOut) {
      const summary = { error: 'audit_timeout' };
      writeAuditRow(db, book.id, 'failed', summary);
      const updated = db.prepare('SELECT * FROM kdp_books WHERE id = ?').get(book.id);
      recordEvent('kdp:audit-complete', { slug, status: 'failed' });
      return res.status(500).json({ book: updated });
    }

    // Non-zero exit
    if (result.code !== 0) {
      const summary = { error: result.stderr || `exit ${result.code}` };
      writeAuditRow(db, book.id, 'failed', summary);
      const updated = db.prepare('SELECT * FROM kdp_books WHERE id = ?').get(book.id);
      recordEvent('kdp:audit-complete', { slug, status: 'failed' });
      return res.status(500).json({ book: updated });
    }

    // Parse JSON
    let parsed;
    try {
      parsed = JSON.parse(result.stdout);
    } catch (err) {
      const summary = { error: `invalid_json: ${err?.message || err}`, stdout: result.stdout.slice(0, 500) };
      writeAuditRow(db, book.id, 'failed', summary);
      const updated = db.prepare('SELECT * FROM kdp_books WHERE id = ?').get(book.id);
      recordEvent('kdp:audit-complete', { slug, status: 'failed' });
      return res.status(500).json({ book: updated });
    }

    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.puzzles) || !parsed.totals) {
      const summary = { error: 'malformed_audit_json' };
      writeAuditRow(db, book.id, 'failed', summary);
      const updated = db.prepare('SELECT * FROM kdp_books WHERE id = ?').get(book.id);
      recordEvent('kdp:audit-complete', { slug, status: 'failed' });
      return res.status(500).json({ book: updated });
    }

    const status = parsed.totals.failed === 0 ? 'passed' : 'failed';
    writeAuditRow(db, book.id, status, parsed);
    const updated = db.prepare('SELECT * FROM kdp_books WHERE id = ?').get(book.id);
    recordEvent('kdp:audit-complete', { slug, status });
    return res.status(200).json({ book: updated });
  });

  return router;
}

/**
 * Persist audit fields on kdp_books.
 *
 * @param {import('better-sqlite3').Database} db
 * @param {number} bookId
 * @param {'passed'|'failed'|'unchecked'} status
 * @param {object} summary
 */
function writeAuditRow(db, bookId, status, summary) {
  db.prepare(`
    UPDATE kdp_books
       SET puzzle_audit_status = ?,
           puzzle_audit_at = datetime('now'),
           puzzle_audit_summary_json = ?,
           updated_at = datetime('now')
     WHERE id = ?
  `).run(status, JSON.stringify(summary), bookId);
}

/** Default router instance used by server.js. */
export const router = createAuditRouter();
export default router;
```

- [ ] **Step 4: Run tests to verify pass**

Run: `cd web.ui/backend && npx vitest run __tests__/kdp/audit_routes.test.js`
Expected: `7 passed`.

- [ ] **Step 5: Stage**

```bash
git add web.ui/backend/kdp/audit_routes.js \
        web.ui/backend/__tests__/kdp/audit_routes.test.js
```

---

### Task 15: Wire the audit router into `server.js`

**Files:**
- Modify: `web.ui/backend/server.js`
- Test: `web.ui/backend/__tests__/server_smoke.test.js` (extend existing)

- [ ] **Step 1: Extend the smoke test**

Open `web.ui/backend/__tests__/server_smoke.test.js` and add this test inside the existing `describe` block (or, if the suite doesn't already cover route mounting at that level, append a new `describe('audit endpoint wiring', ...)`):

```javascript
import request from 'supertest';
import { describe, it, expect } from 'vitest';

describe('audit endpoint wiring', () => {
  it('mounts POST /api/kdp/books/:slug/audit-puzzles', async () => {
    process.env.PORT = '0';
    process.env.ROOSTER_SKIP_KDP_SCANNER = '1';
    process.env.ROOSTER_SKIP_ETSY_WORKER = '1';
    process.env.ROOSTER_SKIP_REMINDERS_SCHEDULER = '1';
    const { default: app } = await import('../server.js');
    // We can't easily seed a book without resetting DB; just verify the
    // route is reachable (returns 404 for a real-shaped slug, not 502/express-default).
    const res = await request(app).post('/api/kdp/books/nonexistent-slug/audit-puzzles').send();
    expect([400, 404, 500]).toContain(res.status);
    // Critically, NOT 404 with "Cannot POST" body — that would mean it's unmounted.
    expect(String(res.text)).not.toMatch(/Cannot POST/i);
  });
});
```

- [ ] **Step 2: Run test to verify fail**

Run: `cd web.ui/backend && npx vitest run __tests__/server_smoke.test.js`
Expected: the new test fails with "Cannot POST /api/kdp/books/..." (route unmounted).

- [ ] **Step 3: Mount the router in `server.js`**

Open `web.ui/backend/server.js`. Find the import block near the top that imports `kdpRoutes`. After the line:

```javascript
import kdpRoutes from './kdp/routes.js';
```

add:

```javascript
import auditRoutes from './kdp/audit_routes.js';
```

Then find the line that mounts the existing KDP router:

```javascript
app.use('/api/kdp', kdpRoutes);
```

Immediately below it (or merge into the same chain), add:

```javascript
app.use('/api/kdp', auditRoutes);
```

If `server.js` exports `app` but currently does not (Plan B mounts via `installKdpModule(app)` rather than direct `app.use`), instead extend the same code path that mounts `kdpRoutes`. Verify by searching for `kdp/routes` in `server.js`:

```bash
grep -n "kdp/routes" web.ui/backend/server.js
```

If multiple mount points exist, ensure `auditRoutes` is mounted alongside the one that uses `/api/kdp` as its base.

- [ ] **Step 4: Add `export default app` if not present**

If `server.js` does not already `export default app;` at the bottom, add it. The supertest harness in the test relies on importing the express app instance.

Run: `grep -n "export default app" web.ui/backend/server.js`
If absent, append `export default app;` after the last `app.use(...)` and BEFORE the `app.listen(...)` call (the listen call must remain gated on `if (PORT !== 0)`).

- [ ] **Step 5: Run test to verify pass**

Run: `cd web.ui/backend && npx vitest run __tests__/server_smoke.test.js`
Expected: the new "mounts POST /api/kdp/books/:slug/audit-puzzles" test passes, alongside the existing smoke tests.

- [ ] **Step 6: Stage**

```bash
git add web.ui/backend/server.js \
        web.ui/backend/__tests__/server_smoke.test.js
```

---

### Task 16: Extend `api/kdp.ts` — KdpBook fields + `auditPuzzles(slug)`

**Files:**
- Modify: `web.ui/frontend-react/src/api/kdp.ts`
- Test: `web.ui/frontend-react/src/__tests__/kdp_api_audit.test.ts`

- [ ] **Step 1: Write the failing test**

Create `web.ui/frontend-react/src/__tests__/kdp_api_audit.test.ts`:

```typescript
/**
 * Tests for the new auditPuzzles() client function and the KdpBook
 * audit fields. Stubs globalThis.fetch.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { auditPuzzles, ApiError, type KdpBook } from '../api/kdp';

describe('api/kdp.auditPuzzles', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('POSTs to /api/kdp/books/<slug>/audit-puzzles and returns the book', async () => {
    const fakeBook: KdpBook = {
      id: 1,
      slug: 'book-a',
      title: 'Book A',
      subtitle: null,
      asin: null,
      status: 'built',
      release_date: null,
      listing_url: null,
      page_count: 120,
      trim_size: null,
      price_usd: null,
      cover_path: null,
      output_dir: '/x',
      updated_at: '2026-05-26T00:00:00Z',
      puzzle_audit_status: 'passed',
      puzzle_audit_at: '2026-05-26T00:00:01Z',
      puzzle_audit_summary_json: '{"puzzles":[],"totals":{"checked":0,"passed":0,"failed":0,"uniqueness_failures":0,"symmetry_failures":0,"tier_mismatches":0}}',
    };
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ book: fakeBook }), { status: 200 }),
    );
    const out = await auditPuzzles('book-a');
    expect(out.puzzle_audit_status).toBe('passed');
    expect(spy).toHaveBeenCalledWith(
      '/api/kdp/books/book-a/audit-puzzles',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('throws ApiError on a non-2xx response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ error: 'invalid_slug' }), { status: 400 }),
    );
    await expect(auditPuzzles('Bad_Slug')).rejects.toBeInstanceOf(ApiError);
  });
});
```

- [ ] **Step 2: Run test to verify fail**

Run: `cd web.ui/frontend-react && npx vitest run src/__tests__/kdp_api_audit.test.ts`
Expected: `Module '"../api/kdp"' has no exported member 'auditPuzzles'.`

- [ ] **Step 3: Extend `api/kdp.ts`**

Open `web.ui/frontend-react/src/api/kdp.ts`. In the `export interface KdpBook { ... }` block, add three fields **before** `updated_at`:

```typescript
  puzzle_audit_status: 'unchecked' | 'passed' | 'failed' | null;
  puzzle_audit_at: string | null;
  puzzle_audit_summary_json: string | null;
```

Then append the following exports at the end of the file:

```typescript
export interface PuzzleAuditEntry {
  index: number;
  difficulty: 'easy' | 'medium' | 'hard' | 'expert';
  clue_count: number;
  is_unique: boolean;
  symmetric_180: boolean;
  technique_tier:
    | 'naked_singles'
    | 'hidden_singles'
    | 'locked_candidates'
    | 'naked_pairs'
    | 'naked_triples'
    | 'backtracking';
  match_difficulty: boolean;
}

export interface PuzzleAuditTotals {
  checked: number;
  passed: number;
  failed: number;
  uniqueness_failures: number;
  symmetry_failures: number;
  tier_mismatches: number;
}

export interface PuzzleAuditSummary {
  puzzles: PuzzleAuditEntry[];
  totals: PuzzleAuditTotals;
  error?: string;
}

export async function auditPuzzles(slug: string): Promise<KdpBook> {
  const r = await fetch(
    `/api/kdp/books/${encodeURIComponent(slug)}/audit-puzzles`,
    { method: 'POST' },
  );
  if (!r.ok) await throwForStatus(r, 'auditPuzzles');
  const data = (await r.json()) as { book: KdpBook };
  return data.book;
}
```

- [ ] **Step 4: Run test to verify pass**

Run: `cd web.ui/frontend-react && npx vitest run src/__tests__/kdp_api_audit.test.ts`
Expected: `2 passed`.

- [ ] **Step 5: Stage**

```bash
git add web.ui/frontend-react/src/api/kdp.ts \
        web.ui/frontend-react/src/__tests__/kdp_api_audit.test.ts
```

---

### Task 17: `PuzzleAuditCard.tsx` component

**Files:**
- Create: `web.ui/frontend-react/src/components/PuzzleAuditCard.tsx`
- Test: `web.ui/frontend-react/src/__tests__/PuzzleAuditCard.test.tsx`

The card shows: status chip (`Passed` / `Failed` / `Unchecked`), last-audit timestamp, Re-audit button, and a collapsible per-puzzle breakdown.

- [ ] **Step 1: Write the failing test**

Create `web.ui/frontend-react/src/__tests__/PuzzleAuditCard.test.tsx`:

```tsx
/**
 * Tests for the <PuzzleAuditCard> component.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PuzzleAuditCard from '../components/PuzzleAuditCard';
import type { KdpBook } from '../api/kdp';

function makeBook(overrides: Partial<KdpBook> = {}): KdpBook {
  return {
    id: 1,
    slug: 'book-a',
    title: 'Book A',
    subtitle: null,
    asin: null,
    status: 'built',
    release_date: null,
    listing_url: null,
    page_count: 120,
    trim_size: null,
    price_usd: null,
    cover_path: null,
    output_dir: '/x',
    updated_at: '2026-05-26T00:00:00Z',
    puzzle_audit_status: null,
    puzzle_audit_at: null,
    puzzle_audit_summary_json: null,
    ...overrides,
  };
}

const SUMMARY_PASSED = JSON.stringify({
  puzzles: [
    {
      index: 1,
      difficulty: 'easy',
      clue_count: 42,
      is_unique: true,
      symmetric_180: true,
      technique_tier: 'naked_singles',
      match_difficulty: true,
    },
  ],
  totals: {
    checked: 1,
    passed: 1,
    failed: 0,
    uniqueness_failures: 0,
    symmetry_failures: 0,
    tier_mismatches: 0,
  },
});

describe('<PuzzleAuditCard>', () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  it('renders unchecked chip when no audit has run', () => {
    const book = makeBook({ puzzle_audit_status: null });
    render(<PuzzleAuditCard book={book} onAudited={() => {}} />);
    expect(screen.getByText(/unchecked/i)).toBeInTheDocument();
  });

  it('renders passed chip + last-audit-at when status=passed', () => {
    const book = makeBook({
      puzzle_audit_status: 'passed',
      puzzle_audit_at: '2026-05-26T01:23:45Z',
      puzzle_audit_summary_json: SUMMARY_PASSED,
    });
    render(<PuzzleAuditCard book={book} onAudited={() => {}} />);
    expect(screen.getByText(/passed/i)).toBeInTheDocument();
    expect(screen.getByText(/2026-05-26/)).toBeInTheDocument();
  });

  it('renders failed chip when status=failed', () => {
    const book = makeBook({
      puzzle_audit_status: 'failed',
      puzzle_audit_at: '2026-05-26T01:23:45Z',
      puzzle_audit_summary_json: JSON.stringify({ puzzles: [], totals: { checked: 0, passed: 0, failed: 0, uniqueness_failures: 0, symmetry_failures: 0, tier_mismatches: 0 }, error: 'boom' }),
    });
    render(<PuzzleAuditCard book={book} onAudited={() => {}} />);
    expect(screen.getByText(/failed/i)).toBeInTheDocument();
  });

  it('clicking Re-audit calls the API and reports the updated book', async () => {
    const updatedBook = makeBook({
      puzzle_audit_status: 'passed',
      puzzle_audit_at: '2026-05-26T02:00:00Z',
      puzzle_audit_summary_json: SUMMARY_PASSED,
    });
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ book: updatedBook }), { status: 200 }),
    );
    const onAudited = vi.fn();
    render(<PuzzleAuditCard book={makeBook()} onAudited={onAudited} />);
    await userEvent.click(screen.getByRole('button', { name: /re-audit/i }));
    await waitFor(() => expect(onAudited).toHaveBeenCalledWith(updatedBook));
  });

  it('collapses and expands the per-puzzle breakdown', async () => {
    const book = makeBook({
      puzzle_audit_status: 'passed',
      puzzle_audit_at: '2026-05-26T01:00:00Z',
      puzzle_audit_summary_json: SUMMARY_PASSED,
    });
    render(<PuzzleAuditCard book={book} onAudited={() => {}} />);
    // Breakdown collapsed by default — clue_count not visible
    expect(screen.queryByText(/clue_count: 42/i)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /show details/i }));
    expect(screen.getByText(/42/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /hide details/i }));
    await waitFor(() => expect(screen.queryByText(/42/)).not.toBeInTheDocument());
  });
});
```

- [ ] **Step 2: Run test to verify fail**

Run: `cd web.ui/frontend-react && npx vitest run src/__tests__/PuzzleAuditCard.test.tsx`
Expected: `Cannot find module '../components/PuzzleAuditCard'`.

- [ ] **Step 3: Write the component**

Create `web.ui/frontend-react/src/components/PuzzleAuditCard.tsx`:

```tsx
/**
 * PuzzleAuditCard — surfaces the latest puzzle-audit state for a KDP book
 * and a Re-audit button. Mounted on /kdp/:slug below the metadata grid.
 *
 * - Shows a status chip: Passed / Failed / Unchecked.
 * - Shows the last-audit timestamp.
 * - Re-audit button POSTs to /api/kdp/books/:slug/audit-puzzles.
 * - The per-puzzle breakdown is collapsible (collapsed by default).
 */
import { useMemo, useState } from 'react';
import { auditPuzzles, type KdpBook, type PuzzleAuditSummary } from '../api/kdp';

interface Props {
  book: KdpBook;
  onAudited: (updated: KdpBook) => void;
}

const CHIP_STYLES: Record<string, React.CSSProperties> = {
  passed:    { background: '#dcfce7', color: '#166534', borderColor: '#86efac' },
  failed:    { background: '#fee2e2', color: '#991b1b', borderColor: '#fca5a5' },
  unchecked: { background: '#f3f4f6', color: '#4b5563', borderColor: '#d1d5db' },
};

const CHIP_LABEL: Record<string, string> = {
  passed: 'Passed',
  failed: 'Failed',
  unchecked: 'Unchecked',
};

export default function PuzzleAuditCard({ book, onAudited }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDetails, setShowDetails] = useState(false);

  const status = (book.puzzle_audit_status ?? 'unchecked') as 'passed' | 'failed' | 'unchecked';

  const summary = useMemo<PuzzleAuditSummary | null>(() => {
    if (!book.puzzle_audit_summary_json) return null;
    try {
      return JSON.parse(book.puzzle_audit_summary_json) as PuzzleAuditSummary;
    } catch {
      return null;
    }
  }, [book.puzzle_audit_summary_json]);

  async function handleReaudit() {
    setBusy(true);
    setError(null);
    try {
      const updated = await auditPuzzles(book.slug);
      onAudited(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  const lastAuditDisplay = book.puzzle_audit_at
    ? new Date(book.puzzle_audit_at).toISOString().replace('T', ' ').slice(0, 19)
    : 'never';

  return (
    <section
      style={{
        marginTop: '24px',
        padding: '16px',
        border: '1px solid #e5e7eb',
        borderRadius: 8,
        background: '#fafafa',
      }}
      aria-label="Puzzle audit"
    >
      <header style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <h3 style={{ margin: 0 }}>Puzzle audit</h3>
        <span
          style={{
            padding: '2px 10px',
            borderRadius: 999,
            border: '1px solid',
            fontSize: '0.85rem',
            ...CHIP_STYLES[status],
          }}
        >
          {CHIP_LABEL[status]}
        </span>
        <span style={{ color: '#6b7280', fontSize: '0.85rem' }}>
          Last audit: {lastAuditDisplay}
        </span>
        <button
          type="button"
          onClick={handleReaudit}
          disabled={busy}
          style={{ marginLeft: 'auto' }}
        >
          {busy ? 'Auditing…' : 'Re-audit'}
        </button>
      </header>

      {error && (
        <p role="alert" style={{ color: 'crimson', marginTop: 8 }}>
          {error}
        </p>
      )}

      {summary && summary.totals && (
        <p style={{ marginTop: 8, color: '#4b5563', fontSize: '0.9rem' }}>
          {summary.totals.passed} / {summary.totals.checked} puzzles passed
          {summary.totals.failed > 0 && (
            <>
              {' · '}
              <span style={{ color: '#b91c1c' }}>
                {summary.totals.uniqueness_failures} uniqueness ·{' '}
                {summary.totals.symmetry_failures} symmetry ·{' '}
                {summary.totals.tier_mismatches} tier mismatches
              </span>
            </>
          )}
        </p>
      )}

      {summary && summary.puzzles && summary.puzzles.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <button
            type="button"
            onClick={() => setShowDetails((v) => !v)}
            aria-expanded={showDetails}
          >
            {showDetails ? 'Hide details' : 'Show details'}
          </button>
          {showDetails && (
            <table style={{ marginTop: 8, fontSize: '0.85rem', borderCollapse: 'collapse', width: '100%' }}>
              <thead>
                <tr>
                  <th align="left">#</th>
                  <th align="left">Difficulty</th>
                  <th align="left">Clues</th>
                  <th align="left">Unique</th>
                  <th align="left">180° sym</th>
                  <th align="left">Tier</th>
                  <th align="left">Match</th>
                </tr>
              </thead>
              <tbody>
                {summary.puzzles.map((p) => (
                  <tr key={p.index} style={{ borderTop: '1px solid #e5e7eb' }}>
                    <td>{p.index}</td>
                    <td>{p.difficulty}</td>
                    <td>{p.clue_count}</td>
                    <td>{p.is_unique ? '✓' : '✗'}</td>
                    <td>{p.symmetric_180 ? '✓' : '✗'}</td>
                    <td>{p.technique_tier}</td>
                    <td>{p.match_difficulty ? '✓' : '✗'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </section>
  );
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `cd web.ui/frontend-react && npx vitest run src/__tests__/PuzzleAuditCard.test.tsx`
Expected: `5 passed`.

- [ ] **Step 5: Stage**

```bash
git add web.ui/frontend-react/src/components/PuzzleAuditCard.tsx \
        web.ui/frontend-react/src/__tests__/PuzzleAuditCard.test.tsx
```

---

### Task 18: Mount `<PuzzleAuditCard>` on `KdpDetail.tsx`

**Files:**
- Modify: `web.ui/frontend-react/src/pages/KdpDetail.tsx`
- Modify: `web.ui/frontend-react/src/__tests__/KdpDetail.test.tsx` (extend if it exists; otherwise the existing assertions still pass and we don't need a dedicated regression test — Task 17 already covers the card)

The card always renders (defaults to "Unchecked" when no audit has run). Per spec §4, books with no puzzle content keep `puzzle_audit_status = NULL`; even so the card is fine to render with "Unchecked" — the Re-audit button will simply return `failed` with `error: "no puzzles.json"` if the book has no puzzles. That's acceptable for v1; the user only clicks Re-audit on sudoku books.

- [ ] **Step 1: Modify `KdpDetail.tsx`**

Open `web.ui/frontend-react/src/pages/KdpDetail.tsx`. At the import block near the top, add:

```typescript
import PuzzleAuditCard from '../components/PuzzleAuditCard';
```

Then find the closing of the right-column `<div>` containing the metadata grid (just BEFORE the closing `</div>` of the right column, and BEFORE the outer `</section>`). Insert:

```tsx
          <PuzzleAuditCard
            book={book}
            onAudited={(updated) => setBook(updated)}
          />
```

The component is self-contained; it sits in the right column and styles itself with a top margin. If the layout looks cramped, move it OUTSIDE the right-column `<div>` and BEFORE `<section style={{ marginTop: '32px' }}>` for "Interior preview" — the card will then span both columns.

The most readable placement: directly above the `<section style={{ marginTop: '32px' }}>` block that renders interior previews. Place it OUTSIDE the right-column wrapper, INSIDE the outer `<section>`:

```tsx
      </div>  {/* end of the right column */}

      <PuzzleAuditCard
        book={book}
        onAudited={(updated) => setBook(updated)}
      />

      <section style={{ marginTop: '32px' }}>
        <h3>Interior preview</h3>
        ...
```

- [ ] **Step 2: Run the existing KdpDetail tests**

Run: `cd web.ui/frontend-react && npx vitest run src/__tests__/KdpDetail.test.tsx`
Expected: existing tests still pass. If `KdpDetail.test.tsx` does not exist in your tree, skip — the PuzzleAuditCard tests in Task 17 already cover the component, and the mount is a one-line addition.

- [ ] **Step 3: Smoke-test in a browser (optional but recommended)**

```bash
cd web.ui/backend && npm start &
cd web.ui/frontend-react && npm run dev
```
Navigate to `http://localhost:5173/kdp/large-print-sudoku-grandparents`. Expected: a "Puzzle audit" card with an "Unchecked" chip and a "Re-audit" button. Do NOT click Re-audit yet — that happens in Commit 3.

- [ ] **Step 4: Stage**

```bash
git add web.ui/frontend-react/src/pages/KdpDetail.tsx
```

- [ ] **Step 5: COMMIT the dashboard puzzle-audit extension**

```bash
git status
git commit -m "$(cat <<'EOF'
feat(audit): dashboard puzzle-audit extension

Adds a per-book puzzle-audit field to the dashboard. New SQLite migration
0002 grows kdp_books with puzzle_audit_status (CHECK constraint:
unchecked/passed/failed), puzzle_audit_at, and puzzle_audit_summary_json.
New POST /api/kdp/books/:slug/audit-puzzles route in
web.ui/backend/kdp/audit_routes.js spawns the audit_puzzles.py CLI via an
injectable pythonRunner factory, validates the slug against
^[a-z0-9][a-z0-9-]*$, enforces a 5-minute timeout, captures the JSON
contract from spec §4, and persists it on the row. Emits
kdp:audit-started + kdp:audit-complete over SSE.

Frontend: extends KdpBook with the three new fields plus PuzzleAuditEntry
+ PuzzleAuditSummary types; adds auditPuzzles(slug) client function.
New <PuzzleAuditCard> component shows the status chip, last-audit
timestamp, Re-audit button, and a collapsible per-puzzle breakdown.
Mounted on /kdp/:slug below the metadata grid.

Tests: migrations_0002.test.js, audit_routes.test.js (7 cases including
timeout + non-zero exit + invalid slug), kdp_api_audit.test.ts,
PuzzleAuditCard.test.tsx (5 cases including all three status chips).

Spec: docs/superpowers/specs/2026-05-26-sudoku-quality-rework-design.md
§3.3, §4, §7, §8, §9

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 6: Verify commit landed**

Run: `git log --oneline -2`
Expected: a `feat(audit): ...` line at HEAD followed by the `feat(sudoku): ...` from Commit 1.

---

## Commit 3 — Regenerate 3 live SKUs

End-of-phase commit message: `chore(sudoku): regenerate 3 live sudoku books with verified puzzles`

Each task in this phase runs a real `rebuild_sudoku.py` invocation. Wall-clock per book: 5-15 minutes (the new generator is slower than `py-sudoku` because it verifies uniqueness on every removal). The three rebuilds run sequentially.

### Task 19: Rebuild `large-print-sudoku-grandparents`

**Files:**
- Modify (generated): `projects/kdp-puzzle-press/output/kdp-ready/large-print-sudoku-grandparents/interior.pdf`
- Create (generated): `projects/kdp-puzzle-press/output/kdp-ready/large-print-sudoku-grandparents/puzzles.json`

- [ ] **Step 1: Capture the old interior page count**

Run:
```bash
python -c "from pypdf import PdfReader; r = PdfReader('projects/kdp-puzzle-press/output/kdp-ready/large-print-sudoku-grandparents/interior.pdf'); print(len(r.pages))"
```
Expected: a page count number (e.g., `188`). Record this number — the new interior must match within ±2 pages.

- [ ] **Step 2: Run the rebuild**

```bash
cd projects/kdp-puzzle-press
python scripts/rebuild_sudoku.py --book=large-print-sudoku-grandparents
```
Expected stderr:
```
rebuilt interior: .../output/large-print-sudoku-grandparents/interior.pdf
captured 80 puzzles
wrote .../output/kdp-ready/large-print-sudoku-grandparents/puzzles.json
```
Wall-clock: 5-10 minutes.

- [ ] **Step 3: Verify the outputs**

```bash
ls -lh projects/kdp-puzzle-press/output/kdp-ready/large-print-sudoku-grandparents/
python -c "from pypdf import PdfReader; r = PdfReader('projects/kdp-puzzle-press/output/kdp-ready/large-print-sudoku-grandparents/interior.pdf'); print('pages:', len(r.pages))"
python -c "import json; d = json.load(open('projects/kdp-puzzle-press/output/kdp-ready/large-print-sudoku-grandparents/puzzles.json')); print('puzzles:', len(d['puzzles']))"
```
Expected:
- `interior.pdf` and `puzzles.json` both present and non-empty.
- `pages: <within ±2 of the old count>`.
- `puzzles: 80` (40 Easy + 30 Medium + 10 Hard per the book module).

- [ ] **Step 4: Stage but do NOT commit yet**

```bash
git add projects/kdp-puzzle-press/output/kdp-ready/large-print-sudoku-grandparents/interior.pdf \
        projects/kdp-puzzle-press/output/kdp-ready/large-print-sudoku-grandparents/puzzles.json
```

---

### Task 20: Rebuild `travel-sudoku-v1`

- [ ] **Step 1: Capture the old page count**

```bash
python -c "from pypdf import PdfReader; r = PdfReader('projects/kdp-puzzle-press/output/kdp-ready/travel-sudoku-v1/interior.pdf'); print(len(r.pages))"
```
Record this number.

- [ ] **Step 2: Run the rebuild**

```bash
cd projects/kdp-puzzle-press
python scripts/rebuild_sudoku.py --book=travel-sudoku-v1
```
Wall-clock: 10-15 minutes (120 puzzles).

- [ ] **Step 3: Verify the outputs**

```bash
ls -lh projects/kdp-puzzle-press/output/kdp-ready/travel-sudoku-v1/
python -c "from pypdf import PdfReader; r = PdfReader('projects/kdp-puzzle-press/output/kdp-ready/travel-sudoku-v1/interior.pdf'); print('pages:', len(r.pages))"
python -c "import json; d = json.load(open('projects/kdp-puzzle-press/output/kdp-ready/travel-sudoku-v1/puzzles.json')); print('puzzles:', len(d['puzzles']))"
```
Expected:
- Both files present.
- `pages: <within ±2 of the old count>`.
- `puzzles: 120` (30 × 4 difficulties).

- [ ] **Step 4: Stage**

```bash
git add projects/kdp-puzzle-press/output/kdp-ready/travel-sudoku-v1/interior.pdf \
        projects/kdp-puzzle-press/output/kdp-ready/travel-sudoku-v1/puzzles.json
```

---

### Task 21: Rebuild `travel-sudoku-v2` + audit all three via the dashboard

- [ ] **Step 1: Capture the old page count for v2**

```bash
python -c "from pypdf import PdfReader; r = PdfReader('projects/kdp-puzzle-press/output/kdp-ready/travel-sudoku-v2/interior.pdf'); print(len(r.pages))"
```
Record this number.

- [ ] **Step 2: Run the rebuild**

```bash
cd projects/kdp-puzzle-press
python scripts/rebuild_sudoku.py --book=travel-sudoku-v2
```

- [ ] **Step 3: Verify the outputs**

```bash
ls -lh projects/kdp-puzzle-press/output/kdp-ready/travel-sudoku-v2/
python -c "from pypdf import PdfReader; r = PdfReader('projects/kdp-puzzle-press/output/kdp-ready/travel-sudoku-v2/interior.pdf'); print('pages:', len(r.pages))"
python -c "import json; d = json.load(open('projects/kdp-puzzle-press/output/kdp-ready/travel-sudoku-v2/puzzles.json')); print('puzzles:', len(d['puzzles']))"
```
Expected: page count within ±2 of old; puzzles match the v2 book module's `generate_set` total.

- [ ] **Step 4: Start the dashboard backend (if not running)**

```bash
cd web.ui/backend
npm start &
```
Wait for `Server listening on http://localhost:5000` (or your configured PORT).

Then trigger a KDP scan to pick up the rebuilt rows (or wait 10 min for the scheduled scanner):
```bash
curl -X POST http://localhost:5000/api/kdp/scan
```
If no such manual endpoint exists yet, restart the backend; the scanner runs once on boot.

- [ ] **Step 5: Audit each of the 3 books via the new endpoint**

```bash
for slug in large-print-sudoku-grandparents travel-sudoku-v1 travel-sudoku-v2; do
  echo "== $slug =="
  curl -sX POST http://localhost:5000/api/kdp/books/$slug/audit-puzzles | python -c "import sys, json; d = json.load(sys.stdin); print('audit_status:', d['book']['puzzle_audit_status'])"
done
```
Expected output for each:
```
== <slug> ==
audit_status: passed
```

If any returns `failed`, open `/kdp/<slug>` in the dashboard, click "Show details" on the audit card, and inspect which puzzles failed. Most likely cause if a few fail: the `clue_count` band is too tight and `remove_symmetric` legitimately can't hit the target in some seeds — relax the band in `CLUE_RANGES` and rebuild that one book.

- [ ] **Step 6: Stage the v2 outputs**

```bash
git add projects/kdp-puzzle-press/output/kdp-ready/travel-sudoku-v2/interior.pdf \
        projects/kdp-puzzle-press/output/kdp-ready/travel-sudoku-v2/puzzles.json
```

---

### Task 22: Commit the rebuilds + record status in memory

- [ ] **Step 1: Verify all three books are staged**

```bash
git status --short | grep -E "(interior.pdf|puzzles.json)"
```
Expected: 6 modified/added lines (3 × `interior.pdf` + 3 × `puzzles.json`).

- [ ] **Step 2: Commit**

```bash
git commit -m "$(cat <<'EOF'
chore(sudoku): regenerate 3 live sudoku books with verified puzzles

Re-runs scripts/rebuild_sudoku.py for the three live sudoku SKUs using
the new generator with verified uniqueness + 180° symmetry + technique-
tier difficulty:

  - large-print-sudoku-grandparents (80 puzzles: 40 E + 30 M + 10 H)
  - travel-sudoku-v1                (120 puzzles: 30 each across E/M/H/X)
  - travel-sudoku-v2                (120 puzzles: same distribution)

Each rebuild updates interior.pdf and writes a new puzzles.json
capturing every generated puzzle for downstream audit. Page counts
preserved within ±2 pages of the prior interior. All three audited via
POST /api/kdp/books/<slug>/audit-puzzles and confirmed `passed`.

Next step (manual, no API): user uploads each new interior.pdf to KDP
via "Edit paperback content" -> "Upload manuscript" on the live ASIN.
If KDP rejects the swap as a major change, fall back to a v2 ASIN per
spec §2 / §7.

Spec: docs/superpowers/specs/2026-05-26-sudoku-quality-rework-design.md §10

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 3: Verify**

Run: `git log --oneline -3`
Expected (HEAD → older):
```
<hash> chore(sudoku): regenerate 3 live sudoku books with verified puzzles
<hash> feat(audit): dashboard puzzle-audit extension
<hash> feat(sudoku): rewrite generator with uniqueness + 180° symmetry + technique grader
```

- [ ] **Step 4: Update the KDP catalog status memory (optional follow-up)**

Open `C:/Users/marts/.claude/projects/c--Sandbox-AIProjectManagement-Rooster-AI-Project-Management/memory/kdp-catalog-status-2026-05-17.md` and append a note under the sudoku SKUs:

```
2026-05-26: Interior rebuilt with new generator (verified unique, 180° symmetric,
technique-graded). Awaiting manual KDP "Edit content -> Upload manuscript" by user
on each live ASIN. If KDP rejects as a major change, fall back to v2 ASIN.
```

This memory edit is **not** committed in git (memory lives outside the repo), so no `git add` needed. If you forget this step it is non-blocking — the catalog status memory has a follow-up update window and this can be deferred.

- [ ] **Step 5: Hand off**

The plan is complete on this branch. Inform the user:

> "All three commits landed:
> 1. `feat(sudoku): rewrite generator …`
> 2. `feat(audit): dashboard puzzle-audit extension`
> 3. `chore(sudoku): regenerate 3 live sudoku books …`
>
> The dashboard now reports `passed` for all three sudoku SKUs. The next step is manual on your side: open KDP, go to each live ASIN's "Edit paperback content" page, upload the rebuilt `interior.pdf` under `projects/kdp-puzzle-press/output/kdp-ready/<slug>/interior.pdf`, and submit for review. The dashboard's audit card will let you click 'Re-audit' anytime to confirm the puzzles still pass after future regeneration. If KDP rejects the swap as a major change, see spec §7 for the v2-ASIN fallback playbook."
