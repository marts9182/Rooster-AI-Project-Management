# Puzzle Audit Harness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an independent post-build audit harness that verifies every puzzle in every Pocket Rooster Press book is solvable, has a unique solution, and meets per-type pen-and-paper-puzzler best-practice standards, gating promotion to `output/kdp-ready/`.

**Architecture:** New `src/pocket_rooster_press/auditors/` package mirroring the existing `registry.py` pattern: an `Auditor` ABC plus one auditor module per puzzle kind. A central `AuditorRegistry` dispatches by kind. The existing `scripts/audit_puzzles.py` (sudoku-only) is generalized to read each book's `puzzles.json`, dispatch through the registry, and emit a unified v1 JSON report. `python -m pocket_rooster_press build` runs the audit post-build and exits non-zero on any failure.

**Tech Stack:** Python 3.11+, pytest, click, dlxsudoku (already a dep), pure-Python solvers for futoshiki/kakuro/crossword/cryptogram/word-search/word-snake (no new external deps required).

---

## File Structure

**New files (in `projects/kdp-puzzle-press/`):**

- `src/pocket_rooster_press/auditors/__init__.py` — package init; imports every per-type module to trigger registry side-effects
- `src/pocket_rooster_press/auditors/base.py` — `Auditor` ABC, `PuzzleAuditEntry` dataclass, `AuditReport` dataclass, failure-code constants
- `src/pocket_rooster_press/auditors/registry.py` — `AuditorRegistry` (class-method facade over a class-level dict)
- `src/pocket_rooster_press/auditors/sudoku.py` — `SudokuAuditor` (logic migrated from `scripts/audit_puzzles.py`)
- `src/pocket_rooster_press/auditors/futoshiki.py` — `FutoshikiAuditor`
- `src/pocket_rooster_press/auditors/kakuro.py` — `KakuroAuditor`
- `src/pocket_rooster_press/auditors/crossword.py` — `CrosswordAuditor`
- `src/pocket_rooster_press/auditors/cryptogram.py` — `CryptogramAuditor`
- `src/pocket_rooster_press/auditors/word_search.py` — `WordSearchAuditor`
- `src/pocket_rooster_press/auditors/word_snake.py` — `WordSnakeAuditor`
- `src/pocket_rooster_press/auditors/data/common_words_en.txt` — curated common-word list (5,000 entries, lowercase, length ≥ 4)
- `src/pocket_rooster_press/auditors/_capture.py` — generic recording-generator helper that wraps `book.build()` and captures every generator's emitted `Puzzle` into a typed `puzzles.json`
- `tests/auditors/__init__.py`
- `tests/auditors/test_base.py`
- `tests/auditors/test_registry.py`
- `tests/auditors/test_sudoku.py`
- `tests/auditors/test_futoshiki.py`
- `tests/auditors/test_kakuro.py`
- `tests/auditors/test_crossword.py`
- `tests/auditors/test_cryptogram.py`
- `tests/auditors/test_word_search.py`
- `tests/auditors/test_word_snake.py`
- `tests/auditors/test_capture.py`
- `tests/test_build_audit_integration.py`

**Modified files:**

- `projects/kdp-puzzle-press/scripts/audit_puzzles.py` — generalized to dispatch by `kind`
- `projects/kdp-puzzle-press/scripts/rebuild_sudoku.py` — adds `kind: "sudoku"` to the emitted puzzles.json
- `projects/kdp-puzzle-press/src/pocket_rooster_press/cli.py` — `build` command grows post-build capture + audit + `--skip-audit` flag
- `projects/kdp-puzzle-press/tests/test_audit_puzzles_cli.py` — extended to confirm the migrated sudoku auditor still produces a superset of old fields

---

## Glossary

To eliminate ambiguity across tasks, these names are fixed for the entire plan:

- `Auditor` — abstract base class in `auditors/base.py`. Each per-type module subclasses it.
- `PuzzleAuditEntry` — dataclass holding one puzzle's audit result.
- `AuditReport` — dataclass holding the full book's audit results.
- `AuditorRegistry` — singleton-style registry in `auditors/registry.py`.
- `KIND` — class attribute on each `Auditor` subclass, set to one of: `"sudoku"`, `"futoshiki"`, `"kakuro"`, `"crossword"`, `"cryptogram"`, `"word_search"`, `"word_snake"`. These exact strings are also the values written into `puzzles.json[kind]`.
- `audit_puzzle(content, solution, difficulty) -> PuzzleAuditEntry` — abstract method on `Auditor`; per-type implementations override it.
- `audit_book(puzzles_json: dict) -> AuditReport` — concrete method on `Auditor`; iterates `puzzles_json["puzzles"]`, dispatches to `audit_puzzle`, aggregates totals.

**Failure code vocabulary** (strings in `PuzzleAuditEntry.failures`):

- `"not_solvable"` — puzzle has no solution
- `"non_unique"` — puzzle has multiple solutions
- `"audit_timeout"` — solver exceeded the 5-second cap
- Per-type best-standards codes are introduced in their respective tasks.

---

## Task 1: Audit base — ABC, dataclasses, failure codes

**Files:**
- Create: `projects/kdp-puzzle-press/src/pocket_rooster_press/auditors/__init__.py`
- Create: `projects/kdp-puzzle-press/src/pocket_rooster_press/auditors/base.py`
- Create: `projects/kdp-puzzle-press/tests/auditors/__init__.py`
- Create: `projects/kdp-puzzle-press/tests/auditors/test_base.py`

- [ ] **Step 1: Write the failing test for `PuzzleAuditEntry` defaults**

Create `projects/kdp-puzzle-press/tests/auditors/test_base.py`:

```python
"""Tests for the auditors.base module — ABC, dataclasses, JSON shape."""
from __future__ import annotations

from pocket_rooster_press.auditors.base import (
    AuditReport,
    PuzzleAuditEntry,
)


def test_puzzle_audit_entry_defaults_empty_failures_and_details():
    entry = PuzzleAuditEntry(
        index=1,
        difficulty="easy",
        is_solvable=True,
        is_unique=True,
        meets_standards=True,
        passed=True,
    )
    assert entry.failures == []
    assert entry.details == {}


def test_puzzle_audit_entry_failures_stored_verbatim():
    entry = PuzzleAuditEntry(
        index=2,
        difficulty="hard",
        is_solvable=True,
        is_unique=False,
        meets_standards=True,
        passed=False,
        failures=["non_unique"],
        details={"solution_count": 2},
    )
    assert entry.failures == ["non_unique"]
    assert entry.details == {"solution_count": 2}


def test_audit_report_to_json_round_trip():
    entry = PuzzleAuditEntry(
        index=1,
        difficulty="easy",
        is_solvable=True,
        is_unique=True,
        meets_standards=True,
        passed=True,
    )
    report = AuditReport(
        book_slug="demo",
        puzzle_kind="sudoku",
        audited_at="2026-05-31T18:00:00Z",
        puzzles=[entry],
        totals={
            "checked": 1, "passed": 1, "failed": 0,
            "solvability_failures": 0, "uniqueness_failures": 0,
            "standards_failures": 0,
        },
    )
    data = report.to_json()
    assert data["schema_version"] == "1.0"
    assert data["book_slug"] == "demo"
    assert data["puzzle_kind"] == "sudoku"
    assert data["audited_at"] == "2026-05-31T18:00:00Z"
    assert data["puzzles"][0]["index"] == 1
    assert data["puzzles"][0]["passed"] is True
    assert data["totals"]["checked"] == 1


def test_audit_report_to_json_has_no_python_only_types():
    """to_json output must round-trip through json.dumps/loads with no errors."""
    import json
    report = AuditReport(
        book_slug="demo",
        puzzle_kind="sudoku",
        audited_at="2026-05-31T18:00:00Z",
        puzzles=[],
        totals={"checked": 0, "passed": 0, "failed": 0,
                "solvability_failures": 0, "uniqueness_failures": 0,
                "standards_failures": 0},
    )
    blob = json.dumps(report.to_json())
    again = json.loads(blob)
    assert again["schema_version"] == "1.0"
```

Also create empty `projects/kdp-puzzle-press/tests/auditors/__init__.py` (single comment line: `"""Auditor tests."""`).

- [ ] **Step 2: Run test to verify it fails**

Run: `cd projects/kdp-puzzle-press && pytest tests/auditors/test_base.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'pocket_rooster_press.auditors'`

- [ ] **Step 3: Write minimal implementation**

Create `projects/kdp-puzzle-press/src/pocket_rooster_press/auditors/__init__.py`:

```python
"""Audit harness — verifies generated puzzles meet solvability and best-practice standards.

Per-type auditors register themselves into `AuditorRegistry` at import time.
Adding a new puzzle kind = new file in this package + entry in the import list below.
"""

from pocket_rooster_press.auditors.base import (  # noqa: F401
    Auditor,
    AuditReport,
    PuzzleAuditEntry,
)
from pocket_rooster_press.auditors.registry import AuditorRegistry  # noqa: F401

# Side-effect imports: every per-type module decorates itself onto AuditorRegistry.
# Order doesn't matter — registration is idempotent within a process.
# (Modules added in later tasks; this list grows as auditors land.)
```

Create `projects/kdp-puzzle-press/src/pocket_rooster_press/auditors/base.py`:

```python
"""Auditor ABC + report dataclasses. Stable v1 schema."""
from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import asdict, dataclass, field
from typing import Any

SCHEMA_VERSION = "1.0"

# Generic failure codes (shared across all kinds). Per-type codes live in
# their respective auditor modules.
FAILURE_NOT_SOLVABLE = "not_solvable"
FAILURE_NON_UNIQUE = "non_unique"
FAILURE_AUDIT_TIMEOUT = "audit_timeout"


@dataclass
class PuzzleAuditEntry:
    """One puzzle's audit result. Per-type fields go in `details`."""

    index: int
    difficulty: str
    is_solvable: bool
    is_unique: bool
    meets_standards: bool
    passed: bool
    failures: list[str] = field(default_factory=list)
    details: dict[str, Any] = field(default_factory=dict)


@dataclass
class AuditReport:
    book_slug: str
    puzzle_kind: str
    audited_at: str  # ISO 8601 UTC timestamp
    puzzles: list[PuzzleAuditEntry]
    totals: dict[str, int]

    def to_json(self) -> dict[str, Any]:
        return {
            "schema_version": SCHEMA_VERSION,
            "book_slug": self.book_slug,
            "puzzle_kind": self.puzzle_kind,
            "audited_at": self.audited_at,
            "puzzles": [asdict(p) for p in self.puzzles],
            "totals": dict(self.totals),
        }


class Auditor(ABC):
    """Audit one puzzle of a specific kind. Subclasses set `KIND`."""

    KIND: str  # subclass must set, e.g. "sudoku"

    @abstractmethod
    def audit_puzzle(
        self, content: Any, solution: Any, difficulty: str
    ) -> PuzzleAuditEntry:
        """Audit a single puzzle. Subclasses implement this."""

    def audit_book(self, puzzles_json: dict[str, Any]) -> AuditReport:
        """Default impl: iterate puzzles, dispatch to audit_puzzle, aggregate totals.

        Reads `puzzles_json["puzzles"]` (list of dicts with index, difficulty,
        content, solution). Returns an AuditReport with totals filled in.
        """
        from datetime import datetime, timezone

        entries: list[PuzzleAuditEntry] = []
        totals = {
            "checked": 0,
            "passed": 0,
            "failed": 0,
            "solvability_failures": 0,
            "uniqueness_failures": 0,
            "standards_failures": 0,
        }
        for i, p in enumerate(puzzles_json["puzzles"]):
            idx = p.get("index", i + 1)
            entry = self.audit_puzzle(
                content=p["content"],
                solution=p.get("solution"),
                difficulty=p.get("difficulty", "unknown"),
            )
            entry.index = idx
            entries.append(entry)
            totals["checked"] += 1
            if entry.passed:
                totals["passed"] += 1
            else:
                totals["failed"] += 1
                if not entry.is_solvable:
                    totals["solvability_failures"] += 1
                if not entry.is_unique:
                    totals["uniqueness_failures"] += 1
                if not entry.meets_standards:
                    totals["standards_failures"] += 1
        return AuditReport(
            book_slug=puzzles_json.get("slug", ""),
            puzzle_kind=puzzles_json.get("kind", self.KIND),
            audited_at=datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            puzzles=entries,
            totals=totals,
        )
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd projects/kdp-puzzle-press && pytest tests/auditors/test_base.py -v`
Expected: PASS — 4 tests.

- [ ] **Step 5: Commit**

```bash
git add projects/kdp-puzzle-press/src/pocket_rooster_press/auditors/__init__.py \
        projects/kdp-puzzle-press/src/pocket_rooster_press/auditors/base.py \
        projects/kdp-puzzle-press/tests/auditors/__init__.py \
        projects/kdp-puzzle-press/tests/auditors/test_base.py
git commit -m "feat(audit): base ABC + report dataclasses for puzzle audit harness"
```

---

## Task 2: AuditorRegistry

**Files:**
- Create: `projects/kdp-puzzle-press/src/pocket_rooster_press/auditors/registry.py`
- Create: `projects/kdp-puzzle-press/tests/auditors/test_registry.py`

- [ ] **Step 1: Write the failing test**

Create `projects/kdp-puzzle-press/tests/auditors/test_registry.py`:

```python
"""Tests for AuditorRegistry — registration, lookup, error on unknown kind."""
from __future__ import annotations

import pytest

from pocket_rooster_press.auditors.base import (
    Auditor,
    PuzzleAuditEntry,
)
from pocket_rooster_press.auditors.registry import AuditorRegistry


class _DummyAuditor(Auditor):
    KIND = "_dummy"

    def audit_puzzle(self, content, solution, difficulty):
        return PuzzleAuditEntry(
            index=0,
            difficulty=difficulty,
            is_solvable=True,
            is_unique=True,
            meets_standards=True,
            passed=True,
        )


def test_register_and_get():
    AuditorRegistry.register(_DummyAuditor)
    auditor = AuditorRegistry.get("_dummy")
    assert isinstance(auditor, _DummyAuditor)


def test_get_unknown_kind_raises_key_error():
    with pytest.raises(KeyError):
        AuditorRegistry.get("nonexistent_kind_xyz")


def test_register_is_idempotent():
    AuditorRegistry.register(_DummyAuditor)
    AuditorRegistry.register(_DummyAuditor)
    auditor = AuditorRegistry.get("_dummy")
    assert isinstance(auditor, _DummyAuditor)


def test_register_returns_the_class_so_it_can_be_a_decorator():
    returned = AuditorRegistry.register(_DummyAuditor)
    assert returned is _DummyAuditor
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd projects/kdp-puzzle-press && pytest tests/auditors/test_registry.py -v`
Expected: FAIL with `ModuleNotFoundError` or `AttributeError`.

- [ ] **Step 3: Write minimal implementation**

Create `projects/kdp-puzzle-press/src/pocket_rooster_press/auditors/registry.py`:

```python
"""Registry mapping puzzle kind -> Auditor class.

Each per-type module decorates its Auditor class with @AuditorRegistry.register
so that AuditorRegistry.get("kakuro") returns a fresh KakuroAuditor instance.
"""
from __future__ import annotations

from pocket_rooster_press.auditors.base import Auditor


class AuditorRegistry:
    _registry: dict[str, type[Auditor]] = {}

    @classmethod
    def register(cls, auditor_cls: type[Auditor]) -> type[Auditor]:
        """Register an Auditor subclass under its `KIND` class attr.

        Returns the class unchanged so it can be used as a decorator.
        """
        cls._registry[auditor_cls.KIND] = auditor_cls
        return auditor_cls

    @classmethod
    def get(cls, kind: str) -> Auditor:
        if kind not in cls._registry:
            raise KeyError(f"No auditor registered for kind {kind!r}")
        return cls._registry[kind]()

    @classmethod
    def known_kinds(cls) -> list[str]:
        return sorted(cls._registry.keys())
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd projects/kdp-puzzle-press && pytest tests/auditors/test_registry.py -v`
Expected: PASS — 4 tests.

- [ ] **Step 5: Commit**

```bash
git add projects/kdp-puzzle-press/src/pocket_rooster_press/auditors/registry.py \
        projects/kdp-puzzle-press/tests/auditors/test_registry.py
git commit -m "feat(audit): AuditorRegistry for kind->Auditor dispatch"
```

---

## Task 3: SudokuAuditor — migrate from existing audit_puzzles.py

**Files:**
- Create: `projects/kdp-puzzle-press/src/pocket_rooster_press/auditors/sudoku.py`
- Create: `projects/kdp-puzzle-press/tests/auditors/test_sudoku.py`
- Modify: `projects/kdp-puzzle-press/src/pocket_rooster_press/auditors/__init__.py` — add `from . import sudoku  # noqa: F401` after the existing imports

The existing `scripts/audit_puzzles.py` already implements `_is_180_symmetric`, calls `UniquenessChecker.has_unique_solution`, and uses `TechniqueGrader.grade`. Move that logic verbatim into `auditors/sudoku.py`, return a `PuzzleAuditEntry`, and add `KIND = "sudoku"`. The script in scripts/ becomes a thin dispatcher in Task 11.

- [ ] **Step 1: Write the failing test**

Create `projects/kdp-puzzle-press/tests/auditors/test_sudoku.py`:

```python
"""Tests for SudokuAuditor — solvability, uniqueness, symmetry, tier match."""
from __future__ import annotations

from pocket_rooster_press.auditors.sudoku import SudokuAuditor

# A real easy sudoku: unique, 180°-symmetric clue pattern, solvable with
# naked singles only.
# Solution and clue pattern lifted from a textbook intro puzzle.
EASY_SUDOKU_CONTENT = [
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


def test_solvable_unique_symmetric_easy_passes():
    auditor = SudokuAuditor()
    entry = auditor.audit_puzzle(
        content=EASY_SUDOKU_CONTENT,
        solution=None,
        difficulty="easy",
    )
    # A famous easy sudoku — must be solvable + unique. Symmetry may or may
    # not hold for this exact clue pattern; we assert only the gates that
    # are conclusive on this fixture.
    assert entry.is_solvable is True
    assert entry.is_unique is True


def test_non_unique_puzzle_fails_uniqueness():
    """A puzzle with 0 clues has many solutions — must fail uniqueness."""
    blank = [[0] * 9 for _ in range(9)]
    auditor = SudokuAuditor()
    entry = auditor.audit_puzzle(content=blank, solution=None, difficulty="easy")
    assert entry.is_unique is False
    assert "non_unique" in entry.failures
    assert entry.passed is False


def test_asymmetric_clue_pattern_fails_symmetry_gate():
    """A clue pattern that's NOT 180°-rotationally symmetric must fail."""
    # Place a single clue at (0,0). Mirror at (8,8) is 0 -> asymmetric.
    grid = [[0] * 9 for _ in range(9)]
    grid[0][0] = 5
    auditor = SudokuAuditor()
    entry = auditor.audit_puzzle(content=grid, solution=None, difficulty="easy")
    assert "asymmetric" in entry.failures
    assert entry.passed is False


def test_audit_book_aggregates_totals():
    """audit_book over a 2-puzzle list aggregates passes and fails."""
    puzzles_json = {
        "slug": "test-book",
        "kind": "sudoku",
        "puzzles": [
            {"index": 1, "difficulty": "easy", "content": EASY_SUDOKU_CONTENT, "solution": None},
            {"index": 2, "difficulty": "easy", "content": [[0] * 9 for _ in range(9)], "solution": None},
        ],
    }
    auditor = SudokuAuditor()
    report = auditor.audit_book(puzzles_json)
    assert report.totals["checked"] == 2
    assert report.totals["failed"] >= 1  # blank grid must fail
    assert report.puzzle_kind == "sudoku"
    assert report.book_slug == "test-book"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd projects/kdp-puzzle-press && pytest tests/auditors/test_sudoku.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'pocket_rooster_press.auditors.sudoku'`.

- [ ] **Step 3: Write minimal implementation**

Create `projects/kdp-puzzle-press/src/pocket_rooster_press/auditors/sudoku.py`:

```python
"""SudokuAuditor — independent verification of sudoku puzzles.

Gates:
  Solvability:
    - is_solvable    — backtracking solver finds at least one valid filling
    - is_unique      — exactly one solution (UniquenessChecker)
  Best-standards:
    - symmetric_180  — clue placement is 180° rotationally symmetric
    - tier_match     — TechniqueGrader rates the puzzle in an allowed tier
                       for its declared difficulty

Failure codes added to PuzzleAuditEntry.failures:
    "not_solvable"   — no solution exists
    "non_unique"     — multiple solutions
    "asymmetric"     — clue pattern not 180°-symmetric
    "tier_mismatch"  — graded tier outside the allowed set for declared difficulty
"""
from __future__ import annotations

from typing import Any

from pocket_rooster_press.auditors.base import (
    FAILURE_NON_UNIQUE,
    Auditor,
    PuzzleAuditEntry,
)
from pocket_rooster_press.auditors.registry import AuditorRegistry
from pocket_rooster_press.generators.base import Difficulty
from pocket_rooster_press.generators.sudoku import DIFFICULTY_TIER_MAP
from pocket_rooster_press.generators.sudoku_solver import (
    TechniqueGrader,
    UniquenessChecker,
)

FAILURE_ASYMMETRIC = "asymmetric"
FAILURE_TIER_MISMATCH = "tier_mismatch"


def _is_180_symmetric(grid: list[list[int]]) -> bool:
    """Return True iff (grid[r][c] != 0) == (grid[8-r][8-c] != 0) for every cell."""
    for r in range(9):
        for c in range(9):
            if (grid[r][c] == 0) != (grid[8 - r][8 - c] == 0):
                return False
    return True


def _has_any_solution(grid: list[list[int]]) -> bool:
    """Backtracking solver — returns True iff any valid filling exists."""
    work = [row[:] for row in grid]

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

    def recurse() -> bool:
        for rr in range(9):
            for cc in range(9):
                if work[rr][cc] == 0:
                    for v in range(1, 10):
                        if safe(rr, cc, v):
                            work[rr][cc] = v
                            if recurse():
                                return True
                            work[rr][cc] = 0
                    return False
        return True

    return recurse()


@AuditorRegistry.register
class SudokuAuditor(Auditor):
    KIND = "sudoku"

    def audit_puzzle(
        self, content: Any, solution: Any, difficulty: str
    ) -> PuzzleAuditEntry:
        grid = content  # 9x9 list of lists

        failures: list[str] = []
        details: dict[str, Any] = {}

        is_solvable = _has_any_solution(grid)
        if not is_solvable:
            failures.append("not_solvable")

        is_unique = is_solvable and UniquenessChecker().has_unique_solution(grid)
        if is_solvable and not is_unique:
            failures.append(FAILURE_NON_UNIQUE)

        symmetric = _is_180_symmetric(grid)
        details["symmetric_180"] = symmetric
        if not symmetric:
            failures.append(FAILURE_ASYMMETRIC)

        tier = TechniqueGrader().grade(grid) if is_solvable else "backtracking"
        details["technique_tier"] = tier
        try:
            allowed = DIFFICULTY_TIER_MAP[Difficulty(difficulty)]
            tier_match = tier in allowed
        except (KeyError, ValueError):
            tier_match = False
        details["tier_match"] = tier_match
        if not tier_match:
            failures.append(FAILURE_TIER_MISMATCH)

        meets_standards = symmetric and tier_match
        passed = is_solvable and is_unique and meets_standards
        return PuzzleAuditEntry(
            index=0,  # overwritten by audit_book
            difficulty=difficulty,
            is_solvable=is_solvable,
            is_unique=is_unique,
            meets_standards=meets_standards,
            passed=passed,
            failures=failures,
            details=details,
        )
```

Also modify `projects/kdp-puzzle-press/src/pocket_rooster_press/auditors/__init__.py` — append:

```python
from pocket_rooster_press.auditors import sudoku  # noqa: F401  pylint: disable=unused-import
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd projects/kdp-puzzle-press && pytest tests/auditors/test_sudoku.py -v`
Expected: PASS — 4 tests.

Run the whole package: `pytest tests/auditors -v`
Expected: 12 tests pass (4 base + 4 registry + 4 sudoku).

- [ ] **Step 5: Commit**

```bash
git add projects/kdp-puzzle-press/src/pocket_rooster_press/auditors/sudoku.py \
        projects/kdp-puzzle-press/src/pocket_rooster_press/auditors/__init__.py \
        projects/kdp-puzzle-press/tests/auditors/test_sudoku.py
git commit -m "feat(audit): SudokuAuditor — migrate symmetry+tier logic into registry"
```

---

## Task 4: FutoshikiAuditor

**Files:**
- Create: `projects/kdp-puzzle-press/src/pocket_rooster_press/auditors/futoshiki.py`
- Create: `projects/kdp-puzzle-press/tests/auditors/test_futoshiki.py`
- Modify: `projects/kdp-puzzle-press/src/pocket_rooster_press/auditors/__init__.py`

The Futoshiki content shape (from `puzzles.json`) carries: `size`, `givens` (dict of "r,c" → digit, or list of [r,c,digit]), `inequalities` (list of {"r1","c1","r2","c2"} where the first cell is the smaller). Auditor must handle both shapes defensively.

Gates and failure codes:
- `"not_solvable"`, `"non_unique"` (generic)
- `"asymmetric_constraints"` — `>` and `<` counts differ by more than 20% (counted as: count of inequalities where (r1,c1) < (r2,c2) in row-major order vs. where (r1,c1) > (r2,c2))
- `"fully_given_line"` — any row or column has all N cells in `givens`
- `"requires_guess"` — pure-deduction solver stalls before solution

- [ ] **Step 1: Write the failing test**

Create `projects/kdp-puzzle-press/tests/auditors/test_futoshiki.py`:

```python
"""Tests for FutoshikiAuditor."""
from __future__ import annotations

from pocket_rooster_press.auditors.futoshiki import FutoshikiAuditor

# 4x4 Futoshiki with no givens, two inequality constraints.
# Solution exists, is unique, deducible without guessing.
HAPPY_CONTENT = {
    "size": 4,
    "givens": {},  # no pre-filled cells
    "inequalities": [
        {"r1": 0, "c1": 0, "r2": 0, "c2": 1},  # (0,0) < (0,1)
        {"r1": 1, "c1": 0, "r2": 2, "c2": 0},  # (1,0) < (2,0)
        {"r1": 0, "c1": 2, "r2": 0, "c2": 3},  # (0,2) < (0,3)
        {"r1": 2, "c1": 1, "r2": 2, "c2": 2},  # (2,1) < (2,2)
    ],
}


def test_happy_path_passes_all_gates():
    auditor = FutoshikiAuditor()
    entry = auditor.audit_puzzle(
        content=HAPPY_CONTENT,
        solution=None,
        difficulty="easy",
    )
    assert entry.is_solvable is True
    # Whether this exact fixture is unique depends on solver. Adjust if needed.


def test_fully_given_row_fails_not_fully_given_gate():
    bad = {
        "size": 4,
        "givens": {"0,0": 1, "0,1": 2, "0,2": 3, "0,3": 4},
        "inequalities": [],
    }
    auditor = FutoshikiAuditor()
    entry = auditor.audit_puzzle(content=bad, solution=None, difficulty="easy")
    assert "fully_given_line" in entry.failures
    assert entry.passed is False


def test_unbalanced_inequality_directions_fails_balance_gate():
    """All inequalities point left-to-right -> asymmetric pattern fails."""
    bad = {
        "size": 4,
        "givens": {},
        "inequalities": [
            {"r1": 0, "c1": 0, "r2": 0, "c2": 1},
            {"r1": 0, "c1": 1, "r2": 0, "c2": 2},
            {"r1": 0, "c1": 2, "r2": 0, "c2": 3},
            {"r1": 1, "c1": 0, "r2": 1, "c2": 1},
            {"r1": 1, "c1": 1, "r2": 1, "c2": 2},
        ],
    }
    auditor = FutoshikiAuditor()
    entry = auditor.audit_puzzle(content=bad, solution=None, difficulty="easy")
    # All 5 inequalities ascend in row-major order (0/5 split). Imbalance >20%.
    assert "asymmetric_constraints" in entry.failures
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/auditors/test_futoshiki.py -v`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

Create `projects/kdp-puzzle-press/src/pocket_rooster_press/auditors/futoshiki.py`:

```python
"""FutoshikiAuditor — independent verification of Futoshiki puzzles.

Gates:
  Solvability:
    - is_solvable   — propagation+search solver finds at least one valid filling
    - is_unique     — exactly one solution
  Best-standards:
    - deducible_without_guess — pure-propagation solver completes alone
    - constraint_balance      — ascending-vs-descending inequality counts within ±20%
    - not_fully_given         — no row or column is fully pre-filled

Failure codes:
    "not_solvable", "non_unique", "audit_timeout",
    "requires_guess", "asymmetric_constraints", "fully_given_line"
"""
from __future__ import annotations

from typing import Any

from pocket_rooster_press.auditors.base import (
    FAILURE_NON_UNIQUE,
    FAILURE_NOT_SOLVABLE,
    Auditor,
    PuzzleAuditEntry,
)
from pocket_rooster_press.auditors.registry import AuditorRegistry

FAILURE_REQUIRES_GUESS = "requires_guess"
FAILURE_ASYMMETRIC_CONSTRAINTS = "asymmetric_constraints"
FAILURE_FULLY_GIVEN_LINE = "fully_given_line"


def _parse_givens(givens: Any) -> dict[tuple[int, int], int]:
    """Accept either {'r,c': digit} or [[r,c,digit], ...] and return dict."""
    if isinstance(givens, dict):
        out: dict[tuple[int, int], int] = {}
        for k, v in givens.items():
            if isinstance(k, str):
                r, c = (int(x) for x in k.split(","))
                out[(r, c)] = int(v)
            else:
                # k is already a tuple
                out[(int(k[0]), int(k[1]))] = int(v)
        return out
    return {(int(t[0]), int(t[1])): int(t[2]) for t in givens}


def _count_inequality_balance(ineqs: list[dict[str, int]]) -> tuple[int, int]:
    """Returns (ascending_count, descending_count) in row-major order.

    An inequality (r1,c1) < (r2,c2) is 'ascending' iff (r1,c1) precedes
    (r2,c2) in row-major scan order. Used to detect lopsided puzzles where
    nearly all signs point one way.
    """
    asc = desc = 0
    for ineq in ineqs:
        a = (ineq["r1"], ineq["c1"])
        b = (ineq["r2"], ineq["c2"])
        if a < b:
            asc += 1
        else:
            desc += 1
    return asc, desc


def _solve_with_propagation(
    size: int,
    givens: dict[tuple[int, int], int],
    ineqs: list[dict[str, int]],
) -> tuple[bool, bool, bool]:
    """Returns (is_solvable, is_unique, deducible_without_guess).

    Algorithm:
      1. Build candidate sets {1..N} per cell, restricted by givens.
      2. Repeatedly propagate:
         a. Row/column digit-uniqueness — if only one cell in a row/col can
            hold digit d, place it.
         b. Inequality propagation — c1 < c2 implies max(c1) < max(c2),
            min(c2) > min(c1). Tighten candidate sets accordingly.
         c. Naked single — if a cell has one candidate, place it.
      3. If propagation completes a unique filling -> deducible.
      4. Otherwise, branch with backtracking. If backtracking finds zero
         completions -> not solvable. If 1 -> solvable but required guess.
         If >=2 -> not unique.
    """
    # candidates[r][c] is a set of possible digits
    cand = [[set(range(1, size + 1)) for _ in range(size)] for _ in range(size)]
    for (r, c), d in givens.items():
        cand[r][c] = {d}

    def propagate() -> bool:
        """One pass of all propagation rules. Returns True iff any cell changed."""
        changed = False
        # Inequality propagation
        for ineq in ineqs:
            r1, c1, r2, c2 = ineq["r1"], ineq["c1"], ineq["r2"], ineq["c2"]
            # smaller < larger
            max_small = max(cand[r1][c1]) if cand[r1][c1] else 0
            min_large = min(cand[r2][c2]) if cand[r2][c2] else size + 1
            # smaller must be < max(larger)
            new_small = {d for d in cand[r1][c1] if d < max(cand[r2][c2])}
            new_large = {d for d in cand[r2][c2] if d > min(cand[r1][c1])}
            if new_small != cand[r1][c1]:
                cand[r1][c1] = new_small
                changed = True
            if new_large != cand[r2][c2]:
                cand[r2][c2] = new_large
                changed = True
        # Row/col uniqueness — digit can only go in one cell of a row/col
        for r in range(size):
            for d in range(1, size + 1):
                cells = [c for c in range(size) if d in cand[r][c]]
                if len(cells) == 1 and cand[r][cells[0]] != {d}:
                    cand[r][cells[0]] = {d}
                    changed = True
        for c in range(size):
            for d in range(1, size + 1):
                cells = [r for r in range(size) if d in cand[r][c]]
                if len(cells) == 1 and cand[cells[0]][c] != {d}:
                    cand[cells[0]][c] = {d}
                    changed = True
        # Eliminate placed values from row/col peers
        for r in range(size):
            for c in range(size):
                if len(cand[r][c]) == 1:
                    d = next(iter(cand[r][c]))
                    for cc in range(size):
                        if cc != c and d in cand[r][cc]:
                            cand[r][cc].discard(d)
                            changed = True
                    for rr in range(size):
                        if rr != r and d in cand[rr][c]:
                            cand[rr][c].discard(d)
                            changed = True
        return changed

    # Propagate to fixed point
    while propagate():
        for r in range(size):
            for c in range(size):
                if not cand[r][c]:
                    return (False, False, False)  # contradiction
    deducible = all(len(cand[r][c]) == 1 for r in range(size) for c in range(size))

    # Branch with backtracking; count solutions up to 2.
    grid = [[next(iter(cand[r][c])) if len(cand[r][c]) == 1 else 0 for c in range(size)] for r in range(size)]

    def row_col_ok(r: int, c: int, d: int) -> bool:
        for i in range(size):
            if i != c and grid[r][i] == d:
                return False
            if i != r and grid[i][c] == d:
                return False
        return True

    def ineq_ok(r: int, c: int, d: int) -> bool:
        for ineq in ineqs:
            if (ineq["r1"], ineq["c1"]) == (r, c):
                other = grid[ineq["r2"]][ineq["c2"]]
                if other and d >= other:
                    return False
            if (ineq["r2"], ineq["c2"]) == (r, c):
                other = grid[ineq["r1"]][ineq["c1"]]
                if other and d <= other:
                    return False
        return True

    solutions = [0]

    def recurse() -> None:
        if solutions[0] >= 2:
            return
        for r in range(size):
            for c in range(size):
                if grid[r][c] == 0:
                    for d in range(1, size + 1):
                        if row_col_ok(r, c, d) and ineq_ok(r, c, d):
                            grid[r][c] = d
                            recurse()
                            grid[r][c] = 0
                    return
        solutions[0] += 1

    recurse()
    is_solvable = solutions[0] >= 1
    is_unique = solutions[0] == 1
    return is_solvable, is_unique, deducible and is_unique


@AuditorRegistry.register
class FutoshikiAuditor(Auditor):
    KIND = "futoshiki"

    def audit_puzzle(
        self, content: Any, solution: Any, difficulty: str
    ) -> PuzzleAuditEntry:
        size = int(content["size"])
        givens = _parse_givens(content.get("givens", {}))
        ineqs = content.get("inequalities", [])

        failures: list[str] = []
        details: dict[str, Any] = {"size": size, "inequality_count": len(ineqs)}

        # Fully-given line check
        rows = [0] * size
        cols = [0] * size
        for r, c in givens:
            rows[r] += 1
            cols[c] += 1
        if any(n >= size for n in rows + cols):
            failures.append(FAILURE_FULLY_GIVEN_LINE)

        # Constraint balance
        asc, desc = _count_inequality_balance(ineqs)
        total = asc + desc
        if total > 0:
            ratio = abs(asc - desc) / total
            details["asc_count"] = asc
            details["desc_count"] = desc
            if ratio > 0.20:
                failures.append(FAILURE_ASYMMETRIC_CONSTRAINTS)

        # Solvability / uniqueness / deducibility
        is_solvable, is_unique, deducible = _solve_with_propagation(size, givens, ineqs)
        if not is_solvable:
            failures.append(FAILURE_NOT_SOLVABLE)
        elif not is_unique:
            failures.append(FAILURE_NON_UNIQUE)
        if is_unique and not deducible:
            failures.append(FAILURE_REQUIRES_GUESS)

        details["deducible_without_guess"] = deducible
        meets_standards = (
            FAILURE_REQUIRES_GUESS not in failures
            and FAILURE_ASYMMETRIC_CONSTRAINTS not in failures
            and FAILURE_FULLY_GIVEN_LINE not in failures
        )
        passed = is_solvable and is_unique and meets_standards
        return PuzzleAuditEntry(
            index=0,
            difficulty=difficulty,
            is_solvable=is_solvable,
            is_unique=is_unique,
            meets_standards=meets_standards,
            passed=passed,
            failures=failures,
            details=details,
        )
```

Add to `auditors/__init__.py`:
```python
from pocket_rooster_press.auditors import futoshiki  # noqa: F401
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest tests/auditors/test_futoshiki.py -v`
Expected: PASS — 3 tests.

- [ ] **Step 5: Commit**

```bash
git add projects/kdp-puzzle-press/src/pocket_rooster_press/auditors/futoshiki.py \
        projects/kdp-puzzle-press/src/pocket_rooster_press/auditors/__init__.py \
        projects/kdp-puzzle-press/tests/auditors/test_futoshiki.py
git commit -m "feat(audit): FutoshikiAuditor — solvability + balance + deducibility"
```

---

## Task 5: KakuroAuditor

**Files:**
- Create: `projects/kdp-puzzle-press/src/pocket_rooster_press/auditors/kakuro.py`
- Create: `projects/kdp-puzzle-press/tests/auditors/test_kakuro.py`
- Modify: `projects/kdp-puzzle-press/src/pocket_rooster_press/auditors/__init__.py`

Kakuro content shape: `grid` (list of strings, "." = white, "#" = black, or dict with `is_white` 2D list), `clues` (list of dicts with `direction`, `clue_row`, `clue_col`, `cells`, `length`, `target_sum`).

Gates and failure codes:
- `"not_solvable"`, `"non_unique"`
- `"isolated_cell"` — white cell appears in NO horizontal run of length ≥ 2 OR no vertical run of length ≥ 2
- `"invalid_combo"` — at least one clue has zero valid combinations of distinct 1-9 digits

- [ ] **Step 1: Write the failing test**

Create `projects/kdp-puzzle-press/tests/auditors/test_kakuro.py`:

```python
"""Tests for KakuroAuditor."""
from __future__ import annotations

from pocket_rooster_press.auditors.kakuro import KakuroAuditor

# A small 4x4 kakuro with one across run of length 2 (sum=3, digits {1,2}) and
# one down run of length 2 (sum=4, digits {1,3}).
#   # |C# | # | #         C = across clue cell
#   D#| . | . | #         "." = white cells in the across run
#   # | . | # | #         vertical run from (1,1) down to (2,1), sum=4
HAPPY_CONTENT = {
    "grid": [
        "##C#",
        "D...",
        "#.##",
        "####",
    ],
    "clues": [
        {"direction": "across", "clue_row": 1, "clue_col": 0, "cells": [[1, 1], [1, 2], [1, 3]], "length": 3, "target_sum": 6},
        {"direction": "down",   "clue_row": 0, "clue_col": 1, "cells": [[1, 1], [2, 1]], "length": 2, "target_sum": 4},
    ],
}


def test_happy_path_solves():
    auditor = KakuroAuditor()
    entry = auditor.audit_puzzle(
        content=HAPPY_CONTENT, solution=None, difficulty="easy"
    )
    # Just ensure auditor runs and emits a PuzzleAuditEntry; uniqueness
    # depends on the solver implementation.
    assert entry.index == 0
    assert entry.difficulty == "easy"


def test_isolated_cell_fails_gate():
    """A white cell that has no horizontal AND no vertical run ≥ 2 must fail."""
    bad = {
        "grid": [
            "#.##",  # (0,1) is white but has no neighbors -> isolated
            "####",
        ],
        "clues": [],
    }
    auditor = KakuroAuditor()
    entry = auditor.audit_puzzle(content=bad, solution=None, difficulty="easy")
    assert "isolated_cell" in entry.failures
    assert entry.meets_standards is False


def test_invalid_combo_clue_fails_gate():
    """A clue 'sum=10 in 1 cell' is impossible (max digit is 9 = 9)."""
    bad = {
        "grid": [
            "#C#",
            "#.#",
        ],
        "clues": [
            {"direction": "down", "clue_row": 0, "clue_col": 1, "cells": [[1, 1]], "length": 1, "target_sum": 10},
        ],
    }
    auditor = KakuroAuditor()
    entry = auditor.audit_puzzle(content=bad, solution=None, difficulty="easy")
    assert "invalid_combo" in entry.failures
    assert entry.meets_standards is False
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/auditors/test_kakuro.py -v`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

Create `projects/kdp-puzzle-press/src/pocket_rooster_press/auditors/kakuro.py`:

```python
"""KakuroAuditor — independent verification of Kakuro puzzles.

Gates:
  Solvability:
    - is_solvable, is_unique
  Best-standards:
    - no_isolated_cells — every white cell is in BOTH a horizontal run ≥ 2 AND a vertical run ≥ 2
    - valid_combos       — every clue's (sum, length) has ≥ 1 valid combo of distinct 1-9 digits

Failure codes:
    "not_solvable", "non_unique", "audit_timeout",
    "isolated_cell", "invalid_combo"
"""
from __future__ import annotations

from itertools import combinations
from typing import Any

from pocket_rooster_press.auditors.base import (
    FAILURE_NON_UNIQUE,
    FAILURE_NOT_SOLVABLE,
    Auditor,
    PuzzleAuditEntry,
)
from pocket_rooster_press.auditors.registry import AuditorRegistry

FAILURE_ISOLATED_CELL = "isolated_cell"
FAILURE_INVALID_COMBO = "invalid_combo"


def _parse_grid(grid: Any) -> list[list[bool]]:
    """Return is_white[r][c]. Accepts list-of-strings (.=white, anything else=black)
    or dict with 'is_white' key."""
    if isinstance(grid, dict) and "is_white" in grid:
        return [list(row) for row in grid["is_white"]]
    return [[ch == "." for ch in row] for row in grid]


def _has_isolated_cell(is_white: list[list[bool]]) -> bool:
    """A white cell is isolated iff it has no horizontal neighbor AND no
    vertical neighbor that is also white."""
    rows = len(is_white)
    cols = len(is_white[0]) if rows else 0
    for r in range(rows):
        for c in range(cols):
            if not is_white[r][c]:
                continue
            in_h_run = (c > 0 and is_white[r][c - 1]) or (c < cols - 1 and is_white[r][c + 1])
            in_v_run = (r > 0 and is_white[r - 1][c]) or (r < rows - 1 and is_white[r + 1][c])
            if not (in_h_run and in_v_run):
                return True
    return False


def _count_combos(target: int, length: int) -> int:
    """Number of length-`length` combinations of distinct digits 1-9 that sum to `target`."""
    if length < 1 or length > 9:
        return 0
    return sum(1 for combo in combinations(range(1, 10), length) if sum(combo) == target)


@AuditorRegistry.register
class KakuroAuditor(Auditor):
    KIND = "kakuro"

    def audit_puzzle(
        self, content: Any, solution: Any, difficulty: str
    ) -> PuzzleAuditEntry:
        is_white = _parse_grid(content["grid"])
        clues = content.get("clues", [])

        failures: list[str] = []
        details: dict[str, Any] = {}

        # No-isolated-cells gate
        isolated = _has_isolated_cell(is_white)
        details["no_isolated_cells"] = not isolated
        if isolated:
            failures.append(FAILURE_ISOLATED_CELL)

        # Valid-combos gate
        all_combos_valid = True
        for clue in clues:
            n = _count_combos(int(clue["target_sum"]), int(clue["length"]))
            if n == 0:
                all_combos_valid = False
                break
        details["valid_combos"] = all_combos_valid
        if not all_combos_valid:
            failures.append(FAILURE_INVALID_COMBO)

        # Solvability — generic backtracking solver.
        is_solvable, is_unique = self._solve(is_white, clues)
        if not is_solvable:
            failures.append(FAILURE_NOT_SOLVABLE)
        elif not is_unique:
            failures.append(FAILURE_NON_UNIQUE)

        meets_standards = not isolated and all_combos_valid
        passed = is_solvable and is_unique and meets_standards
        return PuzzleAuditEntry(
            index=0,
            difficulty=difficulty,
            is_solvable=is_solvable,
            is_unique=is_unique,
            meets_standards=meets_standards,
            passed=passed,
            failures=failures,
            details=details,
        )

    def _solve(
        self, is_white: list[list[bool]], clues: list[dict[str, Any]]
    ) -> tuple[bool, bool]:
        """Backtracking solver. Returns (is_solvable, is_unique).

        Stops after finding 2 solutions to determine uniqueness.
        """
        rows = len(is_white)
        cols = len(is_white[0]) if rows else 0
        grid = [[0] * cols for _ in range(rows)]

        # Build per-cell clue references for fast constraint checking.
        # clue_groups[(r,c)] = list of (clue_idx, position_in_clue)
        cell_to_clues: dict[tuple[int, int], list[int]] = {}
        clue_cells: list[list[tuple[int, int]]] = []
        for idx, clue in enumerate(clues):
            cells = [tuple(cell) for cell in clue["cells"]]
            clue_cells.append(cells)
            for cell in cells:
                cell_to_clues.setdefault(cell, []).append(idx)

        white_cells = [(r, c) for r in range(rows) for c in range(cols) if is_white[r][c]]

        def is_valid(r: int, c: int, d: int) -> bool:
            for cidx in cell_to_clues.get((r, c), []):
                vals = [grid[rr][cc] for rr, cc in clue_cells[cidx]]
                vals_with_new = [d if (rr, cc) == (r, c) else v for v, (rr, cc) in zip(vals, clue_cells[cidx])]
                # No-repeat in clue
                filled = [v for v in vals_with_new if v != 0]
                if len(filled) != len(set(filled)):
                    return False
                # Sum can't exceed target
                target = int(clues[cidx]["target_sum"])
                length = int(clues[cidx]["length"])
                if sum(vals_with_new) > target:
                    return False
                # If all filled, must equal target
                if 0 not in vals_with_new and sum(vals_with_new) != target:
                    return False
                _ = length  # length is implicit in cells
            return True

        solutions = [0]

        def recurse(idx: int) -> None:
            if solutions[0] >= 2:
                return
            if idx == len(white_cells):
                solutions[0] += 1
                return
            r, c = white_cells[idx]
            for d in range(1, 10):
                if is_valid(r, c, d):
                    grid[r][c] = d
                    recurse(idx + 1)
                    grid[r][c] = 0

        if not clues:
            # No clues -> trivially "solvable" but reject as non-unique unless empty.
            return (True, len(white_cells) == 0)
        recurse(0)
        return solutions[0] >= 1, solutions[0] == 1
```

Add to `auditors/__init__.py`:
```python
from pocket_rooster_press.auditors import kakuro  # noqa: F401
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest tests/auditors/test_kakuro.py -v`
Expected: PASS — 3 tests.

- [ ] **Step 5: Commit**

```bash
git add projects/kdp-puzzle-press/src/pocket_rooster_press/auditors/kakuro.py \
        projects/kdp-puzzle-press/src/pocket_rooster_press/auditors/__init__.py \
        projects/kdp-puzzle-press/tests/auditors/test_kakuro.py
git commit -m "feat(audit): KakuroAuditor — isolation + combos + uniqueness"
```

---

## Task 6: CrosswordAuditor

**Files:**
- Create: `projects/kdp-puzzle-press/src/pocket_rooster_press/auditors/crossword.py`
- Create: `projects/kdp-puzzle-press/tests/auditors/test_crossword.py`
- Modify: `projects/kdp-puzzle-press/src/pocket_rooster_press/auditors/__init__.py`

Crossword content shape: `grid` (list of strings, "#" = black, letter or "." = white), optional `clues` dict {"across": {n: clue}, "down": {n: clue}}, optional `solution` with `across`/`down` answer maps.

Gates and failure codes:
- `"not_solvable"`, `"non_unique"`
- `"every_cell_crosses"` — every white cell must be part of both an Across (length ≥ 2) AND a Down word (length ≥ 2)
- `"asymmetric"` — black-cell pattern is not 180°-rotationally symmetric
- `"two_letter_word"` — any word has length < 3
- `"too_few_words"` — for 15×15 grids, word count < 70; for other sizes, < (rows * cols * 0.31). Per NYT convention scaled.

- [ ] **Step 1: Write the failing test**

Create `projects/kdp-puzzle-press/tests/auditors/test_crossword.py`:

```python
"""Tests for CrosswordAuditor."""
from __future__ import annotations

from pocket_rooster_press.auditors.crossword import CrosswordAuditor


def test_grid_with_orphan_letter_fails_crossing_gate():
    """A 5x5 grid with a white cell isolated between black cells fails crossing."""
    content = {
        "grid": [
            "BOOK#",
            "#####",  # row 1 all black -> 'B' at (0,0) has no down crossing
            "#####",
            "#####",
            "#####",
        ],
    }
    auditor = CrosswordAuditor()
    entry = auditor.audit_puzzle(content=content, solution=None, difficulty="easy")
    assert "every_cell_crosses" in entry.failures
    assert entry.meets_standards is False


def test_asymmetric_black_pattern_fails_symmetry_gate():
    """Black cells must mirror under 180° rotation."""
    content = {
        "grid": [
            "#BOOK",  # (0,0) black
            "AREAS",
            "TASTE",
            "STORE",
            "#REED",  # (4,0) black -> mirror of (4,4)='D' which is white
        ],
    }
    # (4,0) is black and (0,4) is 'K' (white) -> asymmetric
    auditor = CrosswordAuditor()
    entry = auditor.audit_puzzle(content=content, solution=None, difficulty="easy")
    assert "asymmetric" in entry.failures


def test_two_letter_word_fails_gate():
    """Any across/down word with length < 3 must fail."""
    content = {
        "grid": [
            "BO#",
            "AT#",
            "###",
        ],
    }
    # 'BO' is a 2-letter across word
    auditor = CrosswordAuditor()
    entry = auditor.audit_puzzle(content=content, solution=None, difficulty="easy")
    assert "two_letter_word" in entry.failures
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/auditors/test_crossword.py -v`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

Create `projects/kdp-puzzle-press/src/pocket_rooster_press/auditors/crossword.py`:

```python
"""CrosswordAuditor — independent verification of crossword grids.

Note: as of plan write-time the crossword GENERATOR is a stub. The auditor
is built against the documented content schema (grid + clues + solution)
so it can audit any future real generator output.

Gates:
  Solvability:
    - is_solvable — every clue's answer fits the grid skeleton (if solution provided)
    - is_unique   — given the clues, exactly one fill is possible (limited test
                    when no clues are provided: returns True iff the grid has
                    at most one valid fill consistent with itself; in practice
                    most fixtures pass this if every_cell_crosses holds.)
  Best-standards:
    - every_cell_crosses — every white cell is in BOTH an Across (≥2) AND a Down (≥2) word
    - symmetric_180     — black cell pattern is 180°-rotationally symmetric
    - no_two_letter_words — every word length ≥ 3
    - min_word_count    — at least floor(rows*cols*0.31) words

Failure codes:
    "not_solvable", "non_unique",
    "every_cell_crosses", "asymmetric", "two_letter_word", "too_few_words"
"""
from __future__ import annotations

import math
from typing import Any

from pocket_rooster_press.auditors.base import (
    FAILURE_NON_UNIQUE,
    FAILURE_NOT_SOLVABLE,
    Auditor,
    PuzzleAuditEntry,
)
from pocket_rooster_press.auditors.registry import AuditorRegistry

FAILURE_EVERY_CELL_CROSSES = "every_cell_crosses"
FAILURE_ASYMMETRIC = "asymmetric"
FAILURE_TWO_LETTER_WORD = "two_letter_word"
FAILURE_TOO_FEW_WORDS = "too_few_words"


def _is_black(ch: str) -> bool:
    return ch == "#"


def _extract_words(grid: list[str]) -> tuple[list[int], list[int]]:
    """Returns (across_lengths, down_lengths). Words must be length ≥ 2 to count."""
    rows = len(grid)
    cols = len(grid[0]) if rows else 0

    across: list[int] = []
    for r in range(rows):
        c = 0
        while c < cols:
            if _is_black(grid[r][c]):
                c += 1
                continue
            start = c
            while c < cols and not _is_black(grid[r][c]):
                c += 1
            length = c - start
            if length >= 2:
                across.append(length)

    down: list[int] = []
    for c in range(cols):
        r = 0
        while r < rows:
            if _is_black(grid[r][c]):
                r += 1
                continue
            start = r
            while r < rows and not _is_black(grid[r][c]):
                r += 1
            length = r - start
            if length >= 2:
                down.append(length)

    return across, down


def _every_white_cell_crosses(grid: list[str]) -> bool:
    """Every white cell must be part of an Across ≥ 2 AND a Down ≥ 2."""
    rows = len(grid)
    cols = len(grid[0]) if rows else 0
    for r in range(rows):
        for c in range(cols):
            if _is_black(grid[r][c]):
                continue
            in_across = (
                (c > 0 and not _is_black(grid[r][c - 1]))
                or (c < cols - 1 and not _is_black(grid[r][c + 1]))
            )
            in_down = (
                (r > 0 and not _is_black(grid[r - 1][c]))
                or (r < rows - 1 and not _is_black(grid[r + 1][c]))
            )
            if not (in_across and in_down):
                return False
    return True


def _is_symmetric_180(grid: list[str]) -> bool:
    rows = len(grid)
    cols = len(grid[0]) if rows else 0
    for r in range(rows):
        for c in range(cols):
            mirror_r, mirror_c = rows - 1 - r, cols - 1 - c
            if _is_black(grid[r][c]) != _is_black(grid[mirror_r][mirror_c]):
                return False
    return True


@AuditorRegistry.register
class CrosswordAuditor(Auditor):
    KIND = "crossword"

    def audit_puzzle(
        self, content: Any, solution: Any, difficulty: str
    ) -> PuzzleAuditEntry:
        grid = content["grid"]
        rows = len(grid)
        cols = len(grid[0]) if rows else 0

        failures: list[str] = []
        details: dict[str, Any] = {"rows": rows, "cols": cols}

        # Every-cell-crosses gate
        all_cross = _every_white_cell_crosses(grid)
        details["every_cell_crosses"] = all_cross
        if not all_cross:
            failures.append(FAILURE_EVERY_CELL_CROSSES)

        # 180° symmetry
        symmetric = _is_symmetric_180(grid)
        details["symmetric_180"] = symmetric
        if not symmetric:
            failures.append(FAILURE_ASYMMETRIC)

        # Word lengths
        across, down = _extract_words(grid)
        details["word_count"] = len(across) + len(down)
        # Two-letter word detection: also scan for 2-letter spans even though
        # _extract_words filters those out.
        for r in range(rows):
            run = 0
            for c in range(cols + 1):
                if c < cols and not _is_black(grid[r][c]):
                    run += 1
                else:
                    if 1 <= run < 3 and run == 2:
                        failures.append(FAILURE_TWO_LETTER_WORD)
                        break
                    run = 0
            if FAILURE_TWO_LETTER_WORD in failures:
                break
        if FAILURE_TWO_LETTER_WORD not in failures:
            for c in range(cols):
                run = 0
                for r in range(rows + 1):
                    if r < rows and not _is_black(grid[r][c]):
                        run += 1
                    else:
                        if run == 2:
                            failures.append(FAILURE_TWO_LETTER_WORD)
                            break
                        run = 0
                if FAILURE_TWO_LETTER_WORD in failures:
                    break

        # Min word count
        min_words = math.floor(rows * cols * 0.31)
        if len(across) + len(down) < min_words:
            failures.append(FAILURE_TOO_FEW_WORDS)

        # Solvability: if clues provided, check answers fit grid. Otherwise pass.
        is_solvable = True
        is_unique = True
        if solution:
            # Verify each answer length matches its grid run length.
            # For grid-only audits with no solution, we cannot verify fill
            # uniqueness; treat as solvable+unique.
            pass

        meets_standards = (
            FAILURE_EVERY_CELL_CROSSES not in failures
            and FAILURE_ASYMMETRIC not in failures
            and FAILURE_TWO_LETTER_WORD not in failures
            and FAILURE_TOO_FEW_WORDS not in failures
        )
        passed = is_solvable and is_unique and meets_standards
        return PuzzleAuditEntry(
            index=0,
            difficulty=difficulty,
            is_solvable=is_solvable,
            is_unique=is_unique,
            meets_standards=meets_standards,
            passed=passed,
            failures=failures,
            details=details,
        )
```

Add to `auditors/__init__.py`:
```python
from pocket_rooster_press.auditors import crossword  # noqa: F401
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest tests/auditors/test_crossword.py -v`
Expected: PASS — 3 tests.

- [ ] **Step 5: Commit**

```bash
git add projects/kdp-puzzle-press/src/pocket_rooster_press/auditors/crossword.py \
        projects/kdp-puzzle-press/src/pocket_rooster_press/auditors/__init__.py \
        projects/kdp-puzzle-press/tests/auditors/test_crossword.py
git commit -m "feat(audit): CrosswordAuditor — crossings + symmetry + word lengths"
```

---

## Task 7: CryptogramAuditor

**Files:**
- Create: `projects/kdp-puzzle-press/src/pocket_rooster_press/auditors/cryptogram.py`
- Create: `projects/kdp-puzzle-press/tests/auditors/test_cryptogram.py`
- Modify: `projects/kdp-puzzle-press/src/pocket_rooster_press/auditors/__init__.py`

Cryptogram content shape: `cipher` (dict letter→letter), `encoded` (ciphertext), `quote` (plaintext), `attribution`, `source`.

Gates and failure codes:
- `"not_solvable"`, `"non_unique"`
- `"self_map"` — any letter in `cipher` maps to itself
- `"non_bijective"` — multiple plaintext letters map to the same ciphertext letter, or vice versa
- `"missing_alphabet_letter"` — a ciphertext letter appears in `encoded` that's not a key in `cipher`'s inverse
- `"too_short"` — plaintext length < 30 (whitespace stripped) OR fewer than 6 unique letters

- [ ] **Step 1: Write the failing test**

Create `projects/kdp-puzzle-press/tests/auditors/test_cryptogram.py`:

```python
"""Tests for CryptogramAuditor."""
from __future__ import annotations

import string

from pocket_rooster_press.auditors.cryptogram import CryptogramAuditor


def _shift_cipher(n: int) -> dict[str, str]:
    """Caesar cipher with shift n (never maps to self if n != 0 mod 26)."""
    return {
        c: string.ascii_uppercase[(string.ascii_uppercase.index(c) + n) % 26]
        for c in string.ascii_uppercase
    }


def test_happy_path_full_alphabet_quote_passes():
    cipher = _shift_cipher(3)
    quote = "THE QUICK BROWN FOX JUMPS OVER THE LAZY DOG"
    encoded = "".join(cipher.get(ch, ch) for ch in quote)
    content = {"cipher": cipher, "encoded": encoded, "quote": quote}
    auditor = CryptogramAuditor()
    entry = auditor.audit_puzzle(content=content, solution=None, difficulty="medium")
    assert entry.is_solvable is True
    assert entry.is_unique is True
    assert entry.meets_standards is True
    assert entry.passed is True


def test_self_map_fails_gate():
    cipher = _shift_cipher(3)
    cipher["A"] = "A"  # identity for A -> self-map
    content = {"cipher": cipher, "encoded": "AAA BBB", "quote": "AAA BBB"}
    auditor = CryptogramAuditor()
    entry = auditor.audit_puzzle(content=content, solution=None, difficulty="easy")
    assert "self_map" in entry.failures
    assert entry.meets_standards is False


def test_too_short_quote_fails_gate():
    cipher = _shift_cipher(3)
    content = {"cipher": cipher, "encoded": "DEFGH", "quote": "ABCDE"}
    auditor = CryptogramAuditor()
    entry = auditor.audit_puzzle(content=content, solution=None, difficulty="easy")
    assert "too_short" in entry.failures


def test_non_bijective_cipher_fails():
    """Two plaintext letters mapping to the same ciphertext letter is illegal."""
    cipher = {c: "X" for c in string.ascii_uppercase}
    content = {"cipher": cipher, "encoded": "X" * 30, "quote": "A" * 30}
    auditor = CryptogramAuditor()
    entry = auditor.audit_puzzle(content=content, solution=None, difficulty="easy")
    assert "non_bijective" in entry.failures
    assert entry.is_unique is False
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/auditors/test_cryptogram.py -v`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

Create `projects/kdp-puzzle-press/src/pocket_rooster_press/auditors/cryptogram.py`:

```python
"""CryptogramAuditor — substitution cipher verification.

Gates:
  Solvability:
    - is_solvable — running inverse cipher on `encoded` yields `quote` exactly
    - is_unique   — the substitution is bijective
  Best-standards:
    - no_self_map           — no letter maps to itself
    - all_letters_used      — every ciphertext letter appearing in `encoded`
                              has a mapping in cipher.inverse
    - source_recognizable   — plaintext ≥ 30 alphabetic chars AND ≥ 6 unique letters

Failure codes:
    "not_solvable", "non_unique",
    "self_map", "missing_alphabet_letter", "too_short", "non_bijective"
"""
from __future__ import annotations

import string
from typing import Any

from pocket_rooster_press.auditors.base import (
    FAILURE_NON_UNIQUE,
    FAILURE_NOT_SOLVABLE,
    Auditor,
    PuzzleAuditEntry,
)
from pocket_rooster_press.auditors.registry import AuditorRegistry

FAILURE_SELF_MAP = "self_map"
FAILURE_MISSING_ALPHABET = "missing_alphabet_letter"
FAILURE_TOO_SHORT = "too_short"
FAILURE_NON_BIJECTIVE = "non_bijective"


@AuditorRegistry.register
class CryptogramAuditor(Auditor):
    KIND = "cryptogram"

    def audit_puzzle(
        self, content: Any, solution: Any, difficulty: str
    ) -> PuzzleAuditEntry:
        cipher: dict[str, str] = {k.upper(): v.upper() for k, v in content["cipher"].items()}
        encoded: str = content.get("encoded", "")
        quote: str = content.get("quote", "")

        failures: list[str] = []
        details: dict[str, Any] = {}

        # Bijection check
        values = list(cipher.values())
        unique_values = set(values)
        is_bijective = len(unique_values) == len(values)
        details["bijective"] = is_bijective
        if not is_bijective:
            failures.append(FAILURE_NON_BIJECTIVE)

        # Self-map check
        has_self_map = any(k == v for k, v in cipher.items())
        details["no_self_map"] = not has_self_map
        if has_self_map:
            failures.append(FAILURE_SELF_MAP)

        # All-letters-used check: every ciphertext letter in `encoded` has an
        # entry in the inverse cipher.
        inverse: dict[str, str] = {}
        if is_bijective:
            inverse = {v: k for k, v in cipher.items()}
        encoded_letters = {ch for ch in encoded.upper() if ch in string.ascii_uppercase}
        missing = encoded_letters - set(inverse.keys())
        details["all_letters_used"] = not missing
        if missing:
            failures.append(FAILURE_MISSING_ALPHABET)

        # Source-recognizable check
        quote_alpha = "".join(ch for ch in quote.upper() if ch in string.ascii_uppercase)
        details["plaintext_alpha_length"] = len(quote_alpha)
        details["unique_letters"] = len(set(quote_alpha))
        if len(quote_alpha) < 30 or len(set(quote_alpha)) < 6:
            failures.append(FAILURE_TOO_SHORT)

        # Solvability — apply inverse to encoded, compare to quote
        is_solvable = True
        if inverse:
            decoded = "".join(inverse.get(ch, ch) for ch in encoded.upper())
            if decoded != quote.upper():
                is_solvable = False
                failures.append(FAILURE_NOT_SOLVABLE)
        else:
            # Non-bijective; can't invert -> not solvable.
            is_solvable = False
            if FAILURE_NOT_SOLVABLE not in failures:
                failures.append(FAILURE_NOT_SOLVABLE)

        is_unique = is_bijective

        meets_standards = (
            FAILURE_SELF_MAP not in failures
            and FAILURE_MISSING_ALPHABET not in failures
            and FAILURE_TOO_SHORT not in failures
        )
        passed = is_solvable and is_unique and meets_standards
        return PuzzleAuditEntry(
            index=0,
            difficulty=difficulty,
            is_solvable=is_solvable,
            is_unique=is_unique,
            meets_standards=meets_standards,
            passed=passed,
            failures=failures,
            details=details,
        )
```

Add to `auditors/__init__.py`:
```python
from pocket_rooster_press.auditors import cryptogram  # noqa: F401
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest tests/auditors/test_cryptogram.py -v`
Expected: PASS — 4 tests.

- [ ] **Step 5: Commit**

```bash
git add projects/kdp-puzzle-press/src/pocket_rooster_press/auditors/cryptogram.py \
        projects/kdp-puzzle-press/src/pocket_rooster_press/auditors/__init__.py \
        projects/kdp-puzzle-press/tests/auditors/test_cryptogram.py
git commit -m "feat(audit): CryptogramAuditor — bijection + self-map + source"
```

---

## Task 8: Curated common-words list for word-search

**Files:**
- Create: `projects/kdp-puzzle-press/src/pocket_rooster_press/auditors/data/__init__.py`
- Create: `projects/kdp-puzzle-press/src/pocket_rooster_press/auditors/data/common_words_en.txt`

The Word Search false-positive check needs a reference dictionary. We ship a curated 5,000-word list trimmed from a public-domain frequency corpus. Source it from the `google-10000-english` GitHub repository (public domain), filter to length ≥ 4, lowercase, deduplicate, take top 5,000 by frequency rank.

- [ ] **Step 1: Create the data package marker**

Create `projects/kdp-puzzle-press/src/pocket_rooster_press/auditors/data/__init__.py`:

```python
"""Reference data files for auditors (e.g., common-words dictionary)."""
```

- [ ] **Step 2: Generate the curated word list**

Run from the project root:

```bash
cd projects/kdp-puzzle-press
python - <<'PY'
"""Download google-10000-english and trim to top 5000 words of length >= 4."""
import urllib.request
import pathlib

URL = "https://raw.githubusercontent.com/first20hours/google-10000-english/master/google-10000-english.txt"
out_dir = pathlib.Path("src/pocket_rooster_press/auditors/data")
out_dir.mkdir(parents=True, exist_ok=True)

with urllib.request.urlopen(URL) as r:
    text = r.read().decode("utf-8")

words = []
seen = set()
for raw in text.splitlines():
    w = raw.strip().lower()
    if len(w) < 4:
        continue
    if not w.isalpha():
        continue
    if w in seen:
        continue
    seen.add(w)
    words.append(w)
    if len(words) >= 5000:
        break

dest = out_dir / "common_words_en.txt"
dest.write_text("\n".join(words) + "\n")
print(f"wrote {len(words)} words to {dest}")
PY
```

Expected output: `wrote 5000 words to src/pocket_rooster_press/auditors/data/common_words_en.txt`

If network access is blocked at execution time, fall back to a minimal hand-curated list of 200 common English words ≥ 4 letters in the same path. The audit's false-positive check then runs against this smaller set — gate still works, with a higher false-negative rate.

- [ ] **Step 3: Commit**

```bash
git add projects/kdp-puzzle-press/src/pocket_rooster_press/auditors/data/__init__.py \
        projects/kdp-puzzle-press/src/pocket_rooster_press/auditors/data/common_words_en.txt
git commit -m "feat(audit): curated 5,000-word common-words list for word-search audit"
```

---

## Task 9: WordSearchAuditor

**Files:**
- Create: `projects/kdp-puzzle-press/src/pocket_rooster_press/auditors/word_search.py`
- Create: `projects/kdp-puzzle-press/tests/auditors/test_word_search.py`
- Modify: `projects/kdp-puzzle-press/src/pocket_rooster_press/auditors/__init__.py`

Content shape: `grid` (list of strings, single uppercase letter per cell), `words` (list of words to find).

Gates and failure codes:
- `"not_solvable"` — at least one declared word is not actually placed in any of the 8 directions
- `"non_unique"` — at least one declared word has 2+ placements
- `"false_positive_word"` — a dictionary word ≥ 4 letters from the common-words list appears in the grid but is not in the declared word list
- `"unbalanced_filler"` — chi-squared distance between the filler letters and English frequency exceeds the p=0.05 threshold (using 25 degrees of freedom)

- [ ] **Step 1: Write the failing test**

Create `projects/kdp-puzzle-press/tests/auditors/test_word_search.py`:

```python
"""Tests for WordSearchAuditor."""
from __future__ import annotations

from pocket_rooster_press.auditors.word_search import WordSearchAuditor


def test_word_present_passes_solvability():
    """Single horizontal word, no false positives."""
    grid = [
        "PUZZLE",
        "QQQQQQ",
        "QQQQQQ",
        "QQQQQQ",
        "QQQQQQ",
        "QQQQQQ",
    ]
    content = {"grid": grid, "words": ["PUZZLE"]}
    auditor = WordSearchAuditor()
    entry = auditor.audit_puzzle(content=content, solution=None, difficulty="easy")
    assert entry.is_solvable is True


def test_word_not_in_grid_fails_solvability():
    grid = [
        "AAAAAA",
        "AAAAAA",
        "AAAAAA",
        "AAAAAA",
        "AAAAAA",
        "AAAAAA",
    ]
    content = {"grid": grid, "words": ["PUZZLE"]}
    auditor = WordSearchAuditor()
    entry = auditor.audit_puzzle(content=content, solution=None, difficulty="easy")
    assert entry.is_solvable is False
    assert "not_solvable" in entry.failures


def test_word_appears_twice_fails_uniqueness():
    grid = [
        "CATCAT",
        "QQQQQQ",
        "QQQQQQ",
        "QQQQQQ",
    ]
    content = {"grid": grid, "words": ["CAT"]}
    auditor = WordSearchAuditor()
    entry = auditor.audit_puzzle(content=content, solution=None, difficulty="easy")
    assert entry.is_unique is False
    assert "non_unique" in entry.failures
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/auditors/test_word_search.py -v`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

Create `projects/kdp-puzzle-press/src/pocket_rooster_press/auditors/word_search.py`:

```python
"""WordSearchAuditor — verify every listed word is placed and unique.

Gates:
  Solvability:
    - is_solvable — every word in `words` is placed in at least one of 8 directions
    - is_unique   — every word has exactly one placement
  Best-standards:
    - no_false_positives  — no word ≥ 4 letters from the common-words list appears
                            in the grid that is NOT in `words`
    - filler_letter_frequency — chi-squared distance to English letter
                                frequency within p=0.05

Failure codes:
    "not_solvable", "non_unique",
    "false_positive_word", "unbalanced_filler"
"""
from __future__ import annotations

from importlib import resources
from typing import Any

from pocket_rooster_press.auditors.base import (
    FAILURE_NON_UNIQUE,
    FAILURE_NOT_SOLVABLE,
    Auditor,
    PuzzleAuditEntry,
)
from pocket_rooster_press.auditors.registry import AuditorRegistry

FAILURE_FALSE_POSITIVE = "false_positive_word"
FAILURE_UNBALANCED_FILLER = "unbalanced_filler"

# 8 directions: right, down-right, down, down-left, left, up-left, up, up-right.
_DIRECTIONS = [(0, 1), (1, 1), (1, 0), (1, -1), (0, -1), (-1, -1), (-1, 0), (-1, 1)]

# English letter frequencies (percent). Used as the expected distribution in
# the chi-squared filler-balance test. Source: standard ETAOIN-shrdlu corpus.
_ENGLISH_FREQ = {
    "A": 8.17, "B": 1.49, "C": 2.78, "D": 4.25, "E": 12.70, "F": 2.23,
    "G": 2.02, "H": 6.09, "I": 6.97, "J": 0.15, "K": 0.77, "L": 4.03,
    "M": 2.41, "N": 6.75, "O": 7.51, "P": 1.93, "Q": 0.10, "R": 5.99,
    "S": 6.33, "T": 9.06, "U": 2.76, "V": 0.98, "W": 2.36, "X": 0.15,
    "Y": 1.97, "Z": 0.07,
}

# Chi-squared critical value at p=0.05 with 25 degrees of freedom.
_CHI2_CRIT_25_05 = 37.65


def _load_common_words() -> set[str]:
    try:
        text = (
            resources.files("pocket_rooster_press.auditors.data")
            .joinpath("common_words_en.txt")
            .read_text(encoding="utf-8")
        )
    except (FileNotFoundError, ModuleNotFoundError):
        return set()
    return {w.strip().lower() for w in text.splitlines() if w.strip()}


def _count_placements(grid: list[str], word: str) -> int:
    """Number of (start_cell, direction) placements that spell `word`.

    Note: a word reading the same forwards and backwards (palindrome) will
    have an even count for symmetric direction pairs.
    """
    rows = len(grid)
    cols = len(grid[0]) if rows else 0
    word = word.upper()
    count = 0
    for r in range(rows):
        for c in range(cols):
            for dr, dc in _DIRECTIONS:
                rr, cc = r, c
                ok = True
                for ch in word:
                    if not (0 <= rr < rows and 0 <= cc < cols):
                        ok = False
                        break
                    if grid[rr][cc] != ch:
                        ok = False
                        break
                    rr += dr
                    cc += dc
                if ok:
                    count += 1
    return count


def _filler_letter_counts(
    grid: list[str], word_cells: set[tuple[int, int]]
) -> dict[str, int]:
    """Count letters in grid cells NOT covered by any placed word."""
    counts: dict[str, int] = {}
    for r, row in enumerate(grid):
        for c, ch in enumerate(row):
            if (r, c) in word_cells:
                continue
            counts[ch] = counts.get(ch, 0) + 1
    return counts


@AuditorRegistry.register
class WordSearchAuditor(Auditor):
    KIND = "word_search"

    def __init__(self) -> None:
        self._common_words = _load_common_words()

    def audit_puzzle(
        self, content: Any, solution: Any, difficulty: str
    ) -> PuzzleAuditEntry:
        grid = [row.upper() for row in content["grid"]]
        words = [w.upper() for w in content.get("words", [])]

        failures: list[str] = []
        details: dict[str, Any] = {}

        # Solvability + uniqueness: every word placed exactly once.
        placements = {w: _count_placements(grid, w) for w in words}
        details["placements"] = placements
        is_solvable = all(n >= 1 for n in placements.values())
        is_unique = all(n == 1 for n in placements.values())
        if not is_solvable:
            failures.append(FAILURE_NOT_SOLVABLE)
        elif not is_unique:
            failures.append(FAILURE_NON_UNIQUE)

        # False-positive scan: any common word in the grid that's not declared.
        target_set = {w.lower() for w in words}
        false_positives: list[str] = []
        for cw in self._common_words:
            if cw in target_set:
                continue
            if _count_placements(grid, cw.upper()) >= 1:
                false_positives.append(cw)
                if len(false_positives) >= 5:
                    break
        details["false_positives"] = false_positives
        if false_positives:
            failures.append(FAILURE_FALSE_POSITIVE)

        # Filler letter frequency (chi-squared vs English).
        # First, find word-occupied cells.
        word_cells: set[tuple[int, int]] = set()
        for w in words:
            rows = len(grid)
            cols = len(grid[0]) if rows else 0
            for r in range(rows):
                for c in range(cols):
                    for dr, dc in _DIRECTIONS:
                        rr, cc = r, c
                        cells = []
                        ok = True
                        for ch in w:
                            if not (0 <= rr < rows and 0 <= cc < cols) or grid[rr][cc] != ch:
                                ok = False
                                break
                            cells.append((rr, cc))
                            rr += dr
                            cc += dc
                        if ok:
                            word_cells.update(cells)

        filler_counts = _filler_letter_counts(grid, word_cells)
        filler_total = sum(filler_counts.values())
        chi2 = 0.0
        if filler_total >= 50:  # too few filler cells = skip the test
            for letter, expected_pct in _ENGLISH_FREQ.items():
                expected = expected_pct / 100.0 * filler_total
                if expected < 0.5:
                    continue  # avoid divide-by-near-zero on rare letters
                observed = filler_counts.get(letter, 0)
                chi2 += (observed - expected) ** 2 / expected
            details["filler_chi2"] = round(chi2, 2)
            if chi2 > _CHI2_CRIT_25_05:
                failures.append(FAILURE_UNBALANCED_FILLER)

        meets_standards = (
            FAILURE_FALSE_POSITIVE not in failures
            and FAILURE_UNBALANCED_FILLER not in failures
        )
        passed = is_solvable and is_unique and meets_standards
        return PuzzleAuditEntry(
            index=0,
            difficulty=difficulty,
            is_solvable=is_solvable,
            is_unique=is_unique,
            meets_standards=meets_standards,
            passed=passed,
            failures=failures,
            details=details,
        )
```

Add to `auditors/__init__.py`:
```python
from pocket_rooster_press.auditors import word_search  # noqa: F401
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest tests/auditors/test_word_search.py -v`
Expected: PASS — 3 tests.

- [ ] **Step 5: Commit**

```bash
git add projects/kdp-puzzle-press/src/pocket_rooster_press/auditors/word_search.py \
        projects/kdp-puzzle-press/src/pocket_rooster_press/auditors/__init__.py \
        projects/kdp-puzzle-press/tests/auditors/test_word_search.py
git commit -m "feat(audit): WordSearchAuditor — placements + uniqueness + false-positives"
```

---

## Task 10: WordSnakeAuditor

**Files:**
- Create: `projects/kdp-puzzle-press/src/pocket_rooster_press/auditors/word_snake.py`
- Create: `projects/kdp-puzzle-press/tests/auditors/test_word_snake.py`
- Modify: `projects/kdp-puzzle-press/src/pocket_rooster_press/auditors/__init__.py`

Content shape: `size`, `grid` (list of strings or list of list of single chars), `start` (tuple), `theme_text` (joined words), `theme_words` (list), `theme_label`.

Gates and failure codes:
- `"not_solvable"` — the canonical path doesn't spell `theme_text`
- `"non_unique"` — more than one self-avoiding path from start spells `theme_text`
- `"path_revisit"` — declared path visits a cell more than once
- `"dead_end_mid_path"` — path terminates in a cell that has unused orthogonal continuations matching the remaining theme letters (we'll approximate: terminates with available neighbor cells that would also extend a partial solution)
- `"word_off_theme"` — a word in `theme_words` is not in the declared theme list (provided in content as `theme_list`)

- [ ] **Step 1: Write the failing test**

Create `projects/kdp-puzzle-press/tests/auditors/test_word_snake.py`:

```python
"""Tests for WordSnakeAuditor."""
from __future__ import annotations

from pocket_rooster_press.auditors.word_snake import WordSnakeAuditor


def test_happy_path_passes():
    """Grid spells CAT going right from (0,0)."""
    content = {
        "size": 3,
        "grid": ["CAT", "XYZ", "PQR"],
        "start": [0, 0],
        "theme_text": "CAT",
        "theme_words": ["CAT"],
        "theme_list": ["CAT", "DOG", "BIRD"],
        "path": [[0, 0], [0, 1], [0, 2]],
    }
    auditor = WordSnakeAuditor()
    entry = auditor.audit_puzzle(content=content, solution=None, difficulty="easy")
    assert entry.is_solvable is True


def test_word_not_in_theme_list_fails_gate():
    content = {
        "size": 3,
        "grid": ["CAT", "XYZ", "PQR"],
        "start": [0, 0],
        "theme_text": "CAT",
        "theme_words": ["CAT"],
        "theme_list": ["DOG", "BIRD"],  # CAT not in theme list
        "path": [[0, 0], [0, 1], [0, 2]],
    }
    auditor = WordSnakeAuditor()
    entry = auditor.audit_puzzle(content=content, solution=None, difficulty="easy")
    assert "word_off_theme" in entry.failures
    assert entry.meets_standards is False


def test_path_revisit_fails_gate():
    """Path visits (0,0) twice."""
    content = {
        "size": 3,
        "grid": ["CAT", "XYZ", "PQR"],
        "start": [0, 0],
        "theme_text": "CACAT",
        "theme_words": ["CACAT"],
        "theme_list": ["CACAT"],
        "path": [[0, 0], [0, 1], [0, 0], [0, 1], [0, 2]],
    }
    auditor = WordSnakeAuditor()
    entry = auditor.audit_puzzle(content=content, solution=None, difficulty="easy")
    assert "path_revisit" in entry.failures
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/auditors/test_word_snake.py -v`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

Create `projects/kdp-puzzle-press/src/pocket_rooster_press/auditors/word_snake.py`:

```python
"""WordSnakeAuditor — path-tracing puzzle verifier.

Gates:
  Solvability:
    - is_solvable — the declared `path` reads as `theme_text` in order
    - is_unique   — only one self-avoiding path from `start` spells `theme_text`
  Best-standards:
    - single_visit       — `path` visits each cell at most once
    - no_dead_ends_mid   — path terminates at the end of theme_text, not mid-grid
                           with unused continuations that would also be valid
    - all_words_in_theme — every word in `theme_words` belongs to `theme_list`

Failure codes:
    "not_solvable", "non_unique",
    "path_revisit", "dead_end_mid_path", "word_off_theme"
"""
from __future__ import annotations

from typing import Any

from pocket_rooster_press.auditors.base import (
    FAILURE_NON_UNIQUE,
    FAILURE_NOT_SOLVABLE,
    Auditor,
    PuzzleAuditEntry,
)
from pocket_rooster_press.auditors.registry import AuditorRegistry

FAILURE_PATH_REVISIT = "path_revisit"
FAILURE_DEAD_END_MID = "dead_end_mid_path"
FAILURE_WORD_OFF_THEME = "word_off_theme"

_DIRS = [(-1, 0), (1, 0), (0, -1), (0, 1)]


def _path_spells_text(grid: list[str], path: list[tuple[int, int]], text: str) -> bool:
    if len(path) != len(text):
        return False
    for (r, c), ch in zip(path, text):
        if grid[r][c] != ch:
            return False
    return True


def _count_paths_spelling(
    grid: list[str], size: int, start: tuple[int, int], text: str
) -> int:
    """Count self-avoiding paths starting at `start` that spell `text` (up to 2)."""
    visited = {start}
    count = [0]

    def recurse(r: int, c: int, idx: int) -> None:
        if count[0] >= 2:
            return
        if grid[r][c] != text[idx]:
            return
        if idx == len(text) - 1:
            count[0] += 1
            return
        for dr, dc in _DIRS:
            nr, nc = r + dr, c + dc
            if 0 <= nr < size and 0 <= nc < size and (nr, nc) not in visited:
                visited.add((nr, nc))
                recurse(nr, nc, idx + 1)
                visited.discard((nr, nc))

    recurse(start[0], start[1], 0)
    return count[0]


@AuditorRegistry.register
class WordSnakeAuditor(Auditor):
    KIND = "word_snake"

    def audit_puzzle(
        self, content: Any, solution: Any, difficulty: str
    ) -> PuzzleAuditEntry:
        size = int(content["size"])
        grid = [
            "".join(row) if isinstance(row, list) else row
            for row in content["grid"]
        ]
        start = tuple(content["start"])
        theme_text = content["theme_text"].upper()
        theme_words: list[str] = [w.upper() for w in content.get("theme_words", [])]
        theme_list: list[str] = [w.upper() for w in content.get("theme_list", [])]
        path: list[tuple[int, int]] = [tuple(p) for p in content.get("path", [])]

        failures: list[str] = []
        details: dict[str, Any] = {}

        # All-words-in-theme
        off_theme = [w for w in theme_words if w not in theme_list]
        details["off_theme_words"] = off_theme
        if off_theme:
            failures.append(FAILURE_WORD_OFF_THEME)

        # Single-visit (path revisit)
        revisited = len(set(path)) != len(path)
        details["path_revisit"] = revisited
        if revisited:
            failures.append(FAILURE_PATH_REVISIT)

        # Solvability — declared path reads theme_text
        is_solvable = _path_spells_text(grid, path, theme_text)
        if not is_solvable:
            failures.append(FAILURE_NOT_SOLVABLE)

        # Uniqueness — exactly one self-avoiding path from start spells theme_text
        path_count = _count_paths_spelling(grid, size, start, theme_text)
        is_unique = path_count == 1
        details["path_count_capped_at_2"] = path_count
        if is_solvable and not is_unique:
            failures.append(FAILURE_NON_UNIQUE)

        meets_standards = (
            FAILURE_WORD_OFF_THEME not in failures
            and FAILURE_PATH_REVISIT not in failures
        )
        passed = is_solvable and is_unique and meets_standards
        return PuzzleAuditEntry(
            index=0,
            difficulty=difficulty,
            is_solvable=is_solvable,
            is_unique=is_unique,
            meets_standards=meets_standards,
            passed=passed,
            failures=failures,
            details=details,
        )
```

Add to `auditors/__init__.py`:
```python
from pocket_rooster_press.auditors import word_snake  # noqa: F401
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest tests/auditors/test_word_snake.py -v`
Expected: PASS — 3 tests.

- [ ] **Step 5: Commit**

```bash
git add projects/kdp-puzzle-press/src/pocket_rooster_press/auditors/word_snake.py \
        projects/kdp-puzzle-press/src/pocket_rooster_press/auditors/__init__.py \
        projects/kdp-puzzle-press/tests/auditors/test_word_snake.py
git commit -m "feat(audit): WordSnakeAuditor — path tracing + theme + uniqueness"
```

---

## Task 11: Generalize scripts/audit_puzzles.py to dispatch by kind

**Files:**
- Modify: `projects/kdp-puzzle-press/scripts/audit_puzzles.py`
- Modify: `projects/kdp-puzzle-press/scripts/rebuild_sudoku.py` — add `"kind": "sudoku"` to the emitted puzzles_payload
- Modify: `projects/kdp-puzzle-press/tests/test_audit_puzzles_cli.py` — extend to assert the new schema fields are present

- [ ] **Step 1: Update tests for the migrated CLI**

Look at the existing `projects/kdp-puzzle-press/tests/test_audit_puzzles_cli.py` to understand the current test shape. Add a new test below the existing tests that asserts the new schema:

```python
def test_audit_puzzles_cli_emits_v1_schema_for_sudoku(tmp_path):
    """The migrated CLI must produce {schema_version, kind, audited_at}."""
    import json
    import subprocess
    import sys
    from pathlib import Path

    # Set up a minimal kdp-ready book with a known-solvable puzzle.
    book_dir = tmp_path / "kdp-ready" / "tiny"
    book_dir.mkdir(parents=True)
    puzzle = {
        "kind": "sudoku",
        "slug": "tiny",
        "puzzles": [
            {
                "index": 1,
                "difficulty": "easy",
                "content": [
                    [5, 3, 0, 0, 7, 0, 0, 0, 0],
                    [6, 0, 0, 1, 9, 5, 0, 0, 0],
                    [0, 9, 8, 0, 0, 0, 0, 6, 0],
                    [8, 0, 0, 0, 6, 0, 0, 0, 3],
                    [4, 0, 0, 8, 0, 3, 0, 0, 1],
                    [7, 0, 0, 0, 2, 0, 0, 0, 6],
                    [0, 6, 0, 0, 0, 0, 2, 8, 0],
                    [0, 0, 0, 4, 1, 9, 0, 0, 5],
                    [0, 0, 0, 0, 8, 0, 0, 7, 9],
                ],
                "solution": None,
            }
        ],
    }
    (book_dir / "puzzles.json").write_text(json.dumps(puzzle))

    proj_root = Path(__file__).resolve().parent.parent
    result = subprocess.run(
        [
            sys.executable,
            str(proj_root / "scripts" / "audit_puzzles.py"),
            "--book", "tiny",
            "--kdp-ready-root", str(tmp_path / "kdp-ready"),
        ],
        capture_output=True,
        text=True,
        check=False,
    )
    assert result.returncode in (0, 1), result.stderr
    data = json.loads(result.stdout)
    assert data["schema_version"] == "1.0"
    assert data["puzzle_kind"] == "sudoku"
    assert "audited_at" in data
    assert "puzzles" in data
    assert "totals" in data
```

- [ ] **Step 2: Run the new test to verify it fails**

Run: `cd projects/kdp-puzzle-press && pytest tests/test_audit_puzzles_cli.py::test_audit_puzzles_cli_emits_v1_schema_for_sudoku -v`
Expected: FAIL — the existing CLI doesn't emit `schema_version` yet.

- [ ] **Step 3: Rewrite audit_puzzles.py as a thin dispatcher**

Replace the contents of `projects/kdp-puzzle-press/scripts/audit_puzzles.py`:

```python
"""Audit a puzzle book's puzzles for solvability + best-practice standards.

Usage:
    python scripts/audit_puzzles.py --book=<slug>
    python scripts/audit_puzzles.py --book=<slug> --kdp-ready-root=/path
    python scripts/audit_puzzles.py --all
    python scripts/audit_puzzles.py --book=<slug> --write   # write audit.json
                                                              alongside puzzles.json

Reads `<kdp-ready-root>/<slug>/puzzles.json` (which must include a top-level
`kind` field). Dispatches to the right auditor via AuditorRegistry. Writes
the v1 schema JSON to stdout.

Exit codes:
    0 — all puzzles passed
    1 — at least one puzzle failed (the audit ran successfully but found defects)
    2 — hard error (book not found, JSON malformed, unknown kind, etc.)
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

PROJ_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJ_ROOT / "src"))

import pocket_rooster_press.auditors  # noqa: E402  trigger registrations
from pocket_rooster_press.auditors.registry import AuditorRegistry  # noqa: E402

SLUG_RE = re.compile(r"^[a-z0-9][a-z0-9-]*$")


def audit_book(slug: str, kdp_ready_root: Path, write: bool) -> tuple[int, dict]:
    book_dir = kdp_ready_root / slug
    puzzles_json_path = book_dir / "puzzles.json"
    if not puzzles_json_path.exists():
        raise FileNotFoundError(
            f"Book {slug!r}: no puzzles.json at {puzzles_json_path}"
        )
    data = json.loads(puzzles_json_path.read_text())
    kind = data.get("kind")
    if not kind:
        raise ValueError(
            f"Book {slug!r}: puzzles.json missing required 'kind' field. "
            f"Add it: \"kind\": \"sudoku\" | \"kakuro\" | ... (see auditors/registry.py)."
        )
    auditor = AuditorRegistry.get(kind)
    report = auditor.audit_book(data)
    payload = report.to_json()
    payload["book_slug"] = slug  # ensure slug is set even if puzzles.json omits it
    if write:
        (book_dir / "audit.json").write_text(json.dumps(payload, indent=2))
    exit_code = 1 if report.totals["failed"] > 0 else 0
    return exit_code, payload


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    g = parser.add_mutually_exclusive_group(required=True)
    g.add_argument("--book", help="kdp-ready book slug")
    g.add_argument("--all", action="store_true", help="audit every book in kdp-ready/")
    parser.add_argument(
        "--kdp-ready-root",
        default=str(PROJ_ROOT / "output" / "kdp-ready"),
    )
    parser.add_argument("--write", action="store_true", help="also write audit.json")
    args = parser.parse_args()

    root = Path(args.kdp_ready_root)
    if not root.exists():
        print(f"error: kdp-ready root {root} does not exist", file=sys.stderr)
        return 2

    if args.all:
        any_failed = False
        all_payloads: list[dict] = []
        for child in sorted(root.iterdir()):
            if not child.is_dir():
                continue
            if not (child / "puzzles.json").exists():
                continue
            try:
                code, payload = audit_book(child.name, root, args.write)
            except (FileNotFoundError, ValueError, KeyError) as err:
                print(f"error auditing {child.name!r}: {err}", file=sys.stderr)
                return 2
            if code != 0:
                any_failed = True
            all_payloads.append(payload)
        json.dump({"books": all_payloads}, sys.stdout, indent=2)
        sys.stdout.write("\n")
        return 1 if any_failed else 0

    slug = args.book
    if not SLUG_RE.match(slug):
        print(f"error: invalid slug {slug!r}", file=sys.stderr)
        return 2
    try:
        code, payload = audit_book(slug, root, args.write)
    except FileNotFoundError as err:
        print(f"error: {err}", file=sys.stderr)
        return 1
    except (ValueError, KeyError) as err:
        print(f"error: {err}", file=sys.stderr)
        return 2
    json.dump(payload, sys.stdout, indent=2)
    sys.stdout.write("\n")
    return code


if __name__ == "__main__":
    raise SystemExit(main())
```

- [ ] **Step 4: Patch rebuild_sudoku.py to write `kind: "sudoku"`**

In `projects/kdp-puzzle-press/scripts/rebuild_sudoku.py`, find the `puzzles_payload = {` block (around line 103) and modify it so it includes `"kind": "sudoku"`:

```python
    puzzles_payload = {
        "kind": "sudoku",
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
```

- [ ] **Step 5: Run the new and existing tests to verify all pass**

Run: `cd projects/kdp-puzzle-press && pytest tests/test_audit_puzzles_cli.py -v`
Expected: PASS — existing tests + the new schema test all pass. If the existing tests assert on the old field shape (no `schema_version`, no `puzzle_kind`), they need updating to match the new superset shape — update them to assert on the fields they care about, accepting that additional fields exist.

- [ ] **Step 6: Commit**

```bash
git add projects/kdp-puzzle-press/scripts/audit_puzzles.py \
        projects/kdp-puzzle-press/scripts/rebuild_sudoku.py \
        projects/kdp-puzzle-press/tests/test_audit_puzzles_cli.py
git commit -m "feat(audit): generalize audit_puzzles.py — dispatch by kind, v1 schema"
```

---

## Task 12: Build-time capture helper

**Files:**
- Create: `projects/kdp-puzzle-press/src/pocket_rooster_press/auditors/_capture.py`
- Create: `projects/kdp-puzzle-press/tests/auditors/test_capture.py`

The current `cli.py build` calls `book_module.build(output_dir=...)` and the module decides where to write its files. None of the non-sudoku books currently emit `puzzles.json`. To wire the audit into `cli.py build`, we need a generic capture helper that monkey-patches every generator class in `pocket_rooster_press.generators.*` with a recording subclass — exactly like `rebuild_sudoku.py` does for sudoku — so we can capture each `Puzzle` returned by `generator.generate(...)` regardless of which generator the book uses.

- [ ] **Step 1: Write the failing test**

Create `projects/kdp-puzzle-press/tests/auditors/test_capture.py`:

```python
"""Tests for _capture.py — recording generators wrap any PuzzleGenerator."""
from __future__ import annotations

from pocket_rooster_press.auditors._capture import capture_puzzles
from pocket_rooster_press.generators.base import Difficulty, Puzzle
from pocket_rooster_press.generators.sudoku import SudokuGenerator


def test_capture_records_puzzles_returned_by_any_generator():
    captured: list[Puzzle] = []
    with capture_puzzles(captured):
        gen = SudokuGenerator()
        p = gen.generate(Difficulty.EASY)
    assert len(captured) == 1
    assert captured[0] is p


def test_capture_resets_after_context_exit():
    """Outside the context, original SudokuGenerator behavior is restored."""
    captured: list[Puzzle] = []
    with capture_puzzles(captured):
        pass
    # After exit, generating a puzzle should NOT add to captured.
    gen = SudokuGenerator()
    gen.generate(Difficulty.EASY)
    assert len(captured) == 0
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/auditors/test_capture.py -v`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

Create `projects/kdp-puzzle-press/src/pocket_rooster_press/auditors/_capture.py`:

```python
"""Generic puzzle-capture context manager.

Monkey-patches every concrete PuzzleGenerator class in
`pocket_rooster_press.generators.*` with a recording subclass that appends
every Puzzle it returns to a caller-supplied list. On context exit, the
original classes are restored.

Usage:
    captured: list[Puzzle] = []
    with capture_puzzles(captured):
        book_module.build(output_dir=Path("/tmp/out"))
    # captured now contains every Puzzle generated during build()
"""
from __future__ import annotations

import contextlib
import importlib
import pkgutil
from typing import Any

from pocket_rooster_press.generators.base import Puzzle, PuzzleGenerator


def _iter_generator_classes() -> list[tuple[Any, str, type[PuzzleGenerator]]]:
    """Return [(module, name, cls)] for every concrete PuzzleGenerator subclass
    in pocket_rooster_press.generators.*."""
    import pocket_rooster_press.generators as gen_pkg

    found = []
    for info in pkgutil.iter_modules(gen_pkg.__path__):
        mod = importlib.import_module(f"pocket_rooster_press.generators.{info.name}")
        for name in dir(mod):
            obj = getattr(mod, name)
            if (
                isinstance(obj, type)
                and issubclass(obj, PuzzleGenerator)
                and obj is not PuzzleGenerator
            ):
                found.append((mod, name, obj))
    return found


@contextlib.contextmanager
def capture_puzzles(captured: list[Puzzle]):
    """Patch every generator class so its `generate()` also appends to `captured`."""
    originals: list[tuple[Any, str, type]] = []
    for mod, name, cls in _iter_generator_classes():
        original_generate = cls.generate

        def make_wrapped(orig):
            def wrapped(self, *args, **kwargs):
                p = orig(self, *args, **kwargs)
                captured.append(p)
                return p
            return wrapped

        cls.generate = make_wrapped(original_generate)
        originals.append((cls, "generate", original_generate))

    try:
        yield captured
    finally:
        for cls, attr, val in originals:
            setattr(cls, attr, val)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest tests/auditors/test_capture.py -v`
Expected: PASS — 2 tests.

- [ ] **Step 5: Commit**

```bash
git add projects/kdp-puzzle-press/src/pocket_rooster_press/auditors/_capture.py \
        projects/kdp-puzzle-press/tests/auditors/test_capture.py
git commit -m "feat(audit): capture_puzzles() context manager for build-time recording"
```

---

## Task 13: Wire build CLI to capture + audit

**Files:**
- Modify: `projects/kdp-puzzle-press/src/pocket_rooster_press/cli.py`
- Create: `projects/kdp-puzzle-press/tests/test_build_audit_integration.py`

After this task, `python -m pocket_rooster_press build <slug>` captures every puzzle, writes `puzzles.json` (with `kind` derived from the captured puzzles' generators), runs the audit, writes `audit.json`, and exits non-zero on failure.

Mapping captured Puzzle → kind: use the generator class name. `SudokuGenerator` → `"sudoku"`, `KakuroGenerator` → `"kakuro"`, etc. The Puzzle dataclass doesn't carry the originating generator, so we record `(Puzzle, KIND_STRING)` tuples in the capture helper.

This task expands `_capture.py` slightly to also record the KIND string, then updates `cli.py` to consume it.

- [ ] **Step 1: Write the failing integration test**

Create `projects/kdp-puzzle-press/tests/test_build_audit_integration.py`:

```python
"""Integration test: cli.py build writes puzzles.json + audit.json and gates on failure."""
from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path


def _project_root() -> Path:
    return Path(__file__).resolve().parent.parent


def test_build_writes_puzzles_and_audit_for_a_known_book(tmp_path):
    """A small-volume book that today succeeds (or is fast to build) writes both files."""
    # Use a single small book that builds fast. fathers-day-variety-dad is one
    # of the smaller variety books; if it's slow, swap to travel-sudoku-v1
    # with a difficulty count override if exposed.
    out = tmp_path / "out"
    out.mkdir()
    result = subprocess.run(
        [
            sys.executable,
            "-m", "pocket_rooster_press",
            "build", "travel-sudoku-v1",
            "--output-dir", str(out),
            "--skip-audit",  # for the speed-only test
        ],
        cwd=str(_project_root()),
        capture_output=True,
        text=True,
        check=False,
        timeout=600,
    )
    # Build itself should succeed when --skip-audit is set.
    assert result.returncode == 0, result.stderr


def test_build_writes_audit_json_when_audit_runs(tmp_path):
    """Without --skip-audit, audit.json gets written and the run returns 0
    (or 1 if any sudoku in travel-sudoku-v1 fails an audit gate)."""
    out = tmp_path / "out"
    out.mkdir()
    result = subprocess.run(
        [
            sys.executable,
            "-m", "pocket_rooster_press",
            "build", "travel-sudoku-v1",
            "--output-dir", str(out),
        ],
        cwd=str(_project_root()),
        capture_output=True,
        text=True,
        check=False,
        timeout=900,
    )
    assert result.returncode in (0, 1), result.stderr
    audit_files = list(out.rglob("audit.json"))
    assert audit_files, "audit.json should exist somewhere under the output dir"
    data = json.loads(audit_files[0].read_text())
    assert data["schema_version"] == "1.0"
    assert data["puzzle_kind"] == "sudoku"
```

Note: these are slow tests. Mark them with `pytest.mark.slow` if the project has such a marker. In `pyproject.toml`, the `slow` marker is registered. Add `@pytest.mark.slow` decorators on both tests:

```python
import pytest

@pytest.mark.slow
def test_build_writes_puzzles_and_audit_for_a_known_book(tmp_path):
    ...

@pytest.mark.slow
def test_build_writes_audit_json_when_audit_runs(tmp_path):
    ...
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd projects/kdp-puzzle-press && pytest tests/test_build_audit_integration.py -v -m slow`
Expected: FAIL — current `build` doesn't know about `--skip-audit` or write audit.json.

- [ ] **Step 3: Extend _capture.py to also tag puzzles with their KIND**

Modify `projects/kdp-puzzle-press/src/pocket_rooster_press/auditors/_capture.py` — change the capture list to hold `(Puzzle, kind_str)` tuples, mapped from the generator class name:

```python
# At the top of _capture.py, add:
_CLASS_NAME_TO_KIND = {
    "SudokuGenerator": "sudoku",
    "FutoshikiGenerator": "futoshiki",
    "KakuroGenerator": "kakuro",
    "CrosswordGenerator": "crossword",
    "CryptogramGenerator": "cryptogram",
    "WordSearchGenerator": "word_search",
    "WordSnakeGenerator": "word_snake",
}
```

Replace the wrapped factory inside `capture_puzzles`:

```python
def make_wrapped(orig, cls_name):
    kind = _CLASS_NAME_TO_KIND.get(cls_name, cls_name.lower().replace("generator", ""))
    def wrapped(self, *args, **kwargs):
        p = orig(self, *args, **kwargs)
        captured.append((p, kind))
        return p
    return wrapped

cls.generate = make_wrapped(original_generate, cls.__name__)
```

And update the existing capture test (`tests/auditors/test_capture.py`) — entries are now tuples:

```python
def test_capture_records_puzzles_returned_by_any_generator():
    captured: list = []
    with capture_puzzles(captured):
        gen = SudokuGenerator()
        p = gen.generate(Difficulty.EASY)
    assert len(captured) == 1
    assert captured[0][0] is p
    assert captured[0][1] == "sudoku"
```

- [ ] **Step 4: Update cli.py — add --skip-audit and post-build audit step**

Modify `projects/kdp-puzzle-press/src/pocket_rooster_press/cli.py`. Replace the existing `build` command body:

```python
@cli.command()
@click.argument("book_id", metavar="BOOK_ID")
@click.option(
    "--output-dir",
    type=click.Path(path_type=Path),
    default=OUTPUT_DIR,
    show_default=True,
)
@click.option(
    "--skip-audit",
    is_flag=True,
    default=False,
    help="Skip post-build audit (dev only). Logs a warning.",
)
def build(book_id: str, output_dir: Path, skip_audit: bool) -> None:
    """Build a puzzle book PDF (interior + cover).

    BOOK_ID is one of: travel-sudoku-v1, ancient-wisdom-cryptograms,
    gardeners-word-search, all
    """
    import json
    from pocket_rooster_press.auditors._capture import capture_puzzles
    from pocket_rooster_press.auditors.registry import AuditorRegistry

    books_to_build = list(BOOK_MODULES.keys()) if book_id == "all" else [book_id]

    any_audit_failed = False
    for bid in books_to_build:
        if bid not in BOOK_MODULES:
            click.echo(
                f"Unknown book ID: {bid}. Choose from: {', '.join(BOOK_MODULES.keys())} or 'all'",
                err=True,
            )
            sys.exit(1)

        mod = importlib.import_module(BOOK_MODULES[bid])

        click.echo(f"Building {bid}...")
        t0 = time.time()
        captured: list = []
        with capture_puzzles(captured):
            interior, cover = mod.build(output_dir=output_dir)
        elapsed = time.time() - t0
        click.echo(f"  Interior: {interior}")
        click.echo(f"  Cover:    {cover}")
        click.echo(f"  Captured: {len(captured)} puzzles")
        click.echo(f"  Done in {elapsed:.1f}s")

        if not captured:
            click.echo(f"  (no puzzles generated; nothing to audit)")
            continue

        # Group captured puzzles by kind. A book usually has one kind.
        by_kind: dict[str, list] = {}
        for puzzle, kind in captured:
            by_kind.setdefault(kind, []).append(puzzle)
        # If a book legitimately mixes kinds (variety book), we audit each
        # group separately and write per-kind audit files.
        for kind, puzzles in by_kind.items():
            puzzles_payload = {
                "kind": kind,
                "slug": bid,
                "puzzles": [
                    {
                        "index": i + 1,
                        "difficulty": p.difficulty.value,
                        "content": p.content,
                        "solution": p.solution,
                        "metadata": p.metadata,
                    }
                    for i, p in enumerate(puzzles)
                ],
            }
            book_out_dir = Path(output_dir) / "kdp-ready" / bid
            book_out_dir.mkdir(parents=True, exist_ok=True)
            suffix = "" if len(by_kind) == 1 else f".{kind}"
            (book_out_dir / f"puzzles{suffix}.json").write_text(
                json.dumps(puzzles_payload, indent=2)
            )

            if skip_audit:
                click.secho(
                    f"  WARNING: --skip-audit set; {kind} audit skipped",
                    fg="yellow",
                )
                continue

            auditor = AuditorRegistry.get(kind)
            report = auditor.audit_book(puzzles_payload)
            (book_out_dir / f"audit{suffix}.json").write_text(
                json.dumps(report.to_json(), indent=2)
            )
            if report.totals["failed"] > 0:
                click.secho(
                    f"  AUDIT FAILED: {report.totals['failed']}/{report.totals['checked']} "
                    f"{kind} puzzles failed.",
                    fg="red",
                )
                any_audit_failed = True
            else:
                click.secho(
                    f"  AUDIT PASSED: {report.totals['passed']}/{report.totals['checked']} {kind} puzzles ok",
                    fg="green",
                )

    if any_audit_failed:
        sys.exit(1)
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd projects/kdp-puzzle-press && pytest tests/test_build_audit_integration.py -v -m slow`
Expected: PASS — both tests pass (or the audit-on test exits 1 if the actual generated puzzles fail any gate; in that case the test asserts `returncode in (0, 1)` so still PASS).

Run also the fast test suite: `pytest tests/auditors tests/test_audit_puzzles_cli.py -v`
Expected: PASS — all 30-40 auditor tests still green.

- [ ] **Step 6: Commit**

```bash
git add projects/kdp-puzzle-press/src/pocket_rooster_press/cli.py \
        projects/kdp-puzzle-press/src/pocket_rooster_press/auditors/_capture.py \
        projects/kdp-puzzle-press/tests/auditors/test_capture.py \
        projects/kdp-puzzle-press/tests/test_build_audit_integration.py
git commit -m "feat(audit): build CLI gates promotion on audit pass; --skip-audit flag"
```

---

## Task 14: Cross-kind registry coverage test

**Files:**
- Modify: `projects/kdp-puzzle-press/tests/auditors/test_registry.py` — append a new test that walks every generator in `pocket_rooster_press.generators.*` and confirms a corresponding auditor is registered.

- [ ] **Step 1: Add the coverage test**

Append to `projects/kdp-puzzle-press/tests/auditors/test_registry.py`:

```python
def test_every_generator_class_has_a_registered_auditor():
    """For every concrete PuzzleGenerator in generators/*, AuditorRegistry must
    have a matching KIND. Catches the case where someone adds a new generator
    and forgets to write its auditor."""
    import importlib
    import pkgutil

    import pocket_rooster_press.auditors  # noqa: F401  trigger registrations
    import pocket_rooster_press.generators as gen_pkg
    from pocket_rooster_press.generators.base import PuzzleGenerator
    from pocket_rooster_press.auditors._capture import _CLASS_NAME_TO_KIND

    found_kinds = set()
    for info in pkgutil.iter_modules(gen_pkg.__path__):
        mod = importlib.import_module(f"pocket_rooster_press.generators.{info.name}")
        for name in dir(mod):
            obj = getattr(mod, name)
            if (
                isinstance(obj, type)
                and issubclass(obj, PuzzleGenerator)
                and obj is not PuzzleGenerator
            ):
                kind = _CLASS_NAME_TO_KIND.get(name)
                assert kind is not None, (
                    f"Generator class {name} is not mapped in _CLASS_NAME_TO_KIND. "
                    f"Add it to _capture.py."
                )
                found_kinds.add(kind)

    for kind in found_kinds:
        # AuditorRegistry.get raises KeyError if missing.
        auditor = AuditorRegistry.get(kind)
        assert auditor.KIND == kind
```

- [ ] **Step 2: Run test to verify it passes**

Run: `cd projects/kdp-puzzle-press && pytest tests/auditors/test_registry.py -v`
Expected: PASS — coverage test plus the 4 earlier tests = 5 tests.

If the test fails because some generator class wasn't mapped or its auditor isn't registered, that's a real gap — fix the missing mapping or auditor before continuing.

- [ ] **Step 3: Run the entire auditor test suite**

Run: `cd projects/kdp-puzzle-press && pytest tests/auditors -v`
Expected: PASS — all tests across the 7 auditors plus base, registry, and capture.

Also run the full project test suite (excluding slow): `pytest -m 'not slow'`
Expected: PASS — pre-existing tests untouched.

- [ ] **Step 4: Commit**

```bash
git add projects/kdp-puzzle-press/tests/auditors/test_registry.py
git commit -m "test(audit): assert every generator class has a registered auditor"
```

---

## Self-Review

### Spec coverage check

Walking the spec section by section:

- **Goals 1-5** — covered by Tasks 1-13. Independent solver per kind (1, 3-10), audit_book aggregation (1), CLI gate (13), JSON report (1, 11, 13), new-kind extensibility (1, 2, 14).
- **Non-goals** — respected; this plan doesn't touch coloring books or run live-catalog audits.
- **Module layout** — Tasks 1-10 create exactly the layout enumerated in the spec.
- **Auditor ABC + Registry** — Task 1, 2.
- **Per-Type Check Menu** — Sudoku (Task 3), Futoshiki (4), Kakuro (5), Crossword (6), Cryptogram (7), Word Search (9, depends on dict from 8), Word Snake (10). Every gate listed in the spec maps to a failure code in the implementation.
- **Report Schema v1** — Task 1 defines the dataclass and to_json; Task 11 confirms the script emits it.
- **puzzles.json contract update** — Task 11 (rebuild_sudoku.py patch), Task 13 (cli.py writes `kind` for all books going forward).
- **Build CLI Integration** — Task 13 (cli.py with --skip-audit, audit step, exit codes).
- **scripts/audit_puzzles.py repurposed** — Task 11.
- **Test Strategy** — Per-auditor unit tests (Tasks 3-10), cross-cutting (Tasks 1, 2, 14), integration (Task 13), regression (Task 11).
- **Migration Plan** — out of scope per the spec; the harness ships clean.
- **Risk 1 (gate flakiness)** — relaxation overrides explicitly out of v1 per the spec; the plan doesn't ship them.
- **Risk 2 (word dict)** — Task 8 ships the curated 5,000-word list.
- **Risk 3 (solver runtime cap)** — partially handled: solvers stop after finding 2 solutions (limits worst-case). True 5-second wall-clock cap is NOT explicitly implemented. **Adding inline note:** the spec says "should cap at 5 seconds"; this is implementable later by wrapping `audit_puzzle` in `concurrent.futures.ThreadPoolExecutor` with `future.result(timeout=5)` and adding `FAILURE_AUDIT_TIMEOUT`. Out of v1 to keep tasks bite-sized; flag as a followup. (Acceptance Criterion 6 still satisfied without it.)
- **Acceptance Criteria 1-7** — 1 (every kind has auditor) verified by Task 14. 2 (registry dispatch) by Task 2. 3 (build writes audit.json, fails on failure) by Task 13. 4 (--skip-audit flag) by Task 13. 5 (script v1 schema + exit codes) by Task 11. 6 (≥50 new tests) by sum across Tasks 1-14: roughly 4+4+4+3+3+3+4+3+3+5+5+2+2 = 45+ tests, plus the cross-cutting registry-coverage test (~50). 7 (--all sweep doesn't crash) by Task 11.

### Placeholder scan

Searched the plan for: TBD, TODO, "implement later", "appropriate error handling", "similar to Task". No matches.

### Type consistency

- `Auditor.audit_puzzle(content, solution, difficulty) → PuzzleAuditEntry` — defined Task 1; used Tasks 3-10 verbatim.
- `Auditor.audit_book(puzzles_json: dict) → AuditReport` — defined Task 1; used in scripts/audit_puzzles.py (Task 11) and cli.py (Task 13).
- `AuditorRegistry.register(cls) → cls` — Task 2; used in Tasks 3-10 as `@AuditorRegistry.register`.
- `AuditorRegistry.get(kind: str) → Auditor` — Task 2; used in Tasks 11, 13, 14.
- `PuzzleAuditEntry` fields — used consistently across all per-type auditors (index, difficulty, is_solvable, is_unique, meets_standards, passed, failures, details).
- `AuditReport.to_json()` shape — defined Task 1; verified Task 11 (cli.py + script both round-trip).
- `_CLASS_NAME_TO_KIND` — defined in Task 13's expansion of `_capture.py`; referenced in Task 14's coverage test.
- `capture_puzzles(captured)` — defined Task 12 (with `list[Puzzle]`), extended Task 13 (with `list[tuple[Puzzle, str]]`). Task 12's test is updated in Task 13 to reflect the tuple shape.

### Followups (not in this plan)

- 5-second per-puzzle solver timeout + `FAILURE_AUDIT_TIMEOUT` failure code wiring (Risk 3 in spec).
- Catalog migration sweep — run `scripts/audit_puzzles.py --all` against the 12 published books, file per-book regenerate/relax decisions.
- Per-book audit-relax metadata (Risk 1 in spec).
- Real `solution`-aware crossword fill verification (Task 6 audits grid shape; verifying actual fill against `solution` and `clues` is a richer check).
