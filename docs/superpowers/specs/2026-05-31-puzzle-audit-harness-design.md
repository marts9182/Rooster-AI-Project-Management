# Puzzle Audit Harness — Design

**Status:** Draft for plan
**Date:** 2026-05-31
**Owner:** Marts / Claude

## Problem

The Pocket Rooster Press catalog includes seven puzzle types — sudoku, futoshiki, kakuro, crossword, cryptogram, word search, word snake — each with its own generator under `src/pocket_rooster_press/generators/`. Today only **sudoku** has a post-build audit (`scripts/audit_puzzles.py`: uniqueness, 180° symmetry, technique-tier match). The other six rely on the generator's own `validate()` method, which can hide its own bugs (the same code generates and approves).

This means a puzzle book can pass the build pipeline and be promoted to `output/kdp-ready/` with:

- Non-unique sudoku puzzles (multiple valid solutions)
- Kakuro grids with isolated white cells
- Crosswords with orphan letters that don't cross any other word
- Cryptograms where the substitution maps a letter to itself
- Word searches whose listed words aren't actually placed in the grid
- Word snakes whose path has dead ends

Each defect is a refund-worthy buyer complaint. We need an independent post-build audit that catches them all, gates promotion to `output/kdp-ready/`, and applies pen-and-paper-puzzler best-practice standards (not just minimal solvability).

## Goals

1. Every generated puzzle is verified solvable (has at least one solution) and unique (has exactly one solution) by an **independent** solver — not the generator's own validation pass.
2. Every puzzle satisfies the per-type conventions a serious puzzle-book reviewer would expect (symmetry, no isolated cells, crossing density, no letter-to-itself mappings, etc.).
3. The audit runs automatically as part of `python -m pocket_rooster_press build <slug>` and fails the build on any violation, keeping the book in `output/draft/` instead of promoting to `output/kdp-ready/`.
4. The audit produces a machine-readable JSON report alongside `puzzles.json` so the Publishing Ops Dashboard can surface pass/fail status per book.
5. Adding a new puzzle type later requires writing one new auditor module and registering it — no changes to the build CLI or report schema.

## Non-goals

- Auditing coloring books, journals, log books, or any image-/template-driven content. They have no puzzles to verify; the existing `audit_pdfs.py` covers PDF-level checks.
- Auditing cover art, metadata, or listing copy.
- Auto-regenerating failing puzzles. The audit reports; humans (or a separate fix workflow) regenerate.
- Retroactively re-auditing the 12 currently-published books in this spec. That's a separate followup, covered briefly in Migration below.

## Approach: Hybrid Auditor Registry + Per-Type Modules

We add a new `auditors/` package that mirrors the existing `registry.py` pattern for books. Each puzzle type gets one auditor class. A central registry dispatches by puzzle kind.

### Module layout

```
src/pocket_rooster_press/auditors/
  __init__.py                # re-exports AuditorRegistry, AuditReport, Auditor
  base.py                    # Auditor ABC + AuditReport / PuzzleAuditEntry dataclasses
  registry.py                # AuditorRegistry maps kind -> Auditor class
  sudoku.py                  # SudokuAuditor (logic migrated from scripts/audit_puzzles.py)
  futoshiki.py               # FutoshikiAuditor
  kakuro.py                  # KakuroAuditor
  crossword.py               # CrosswordAuditor
  cryptogram.py              # CryptogramAuditor
  word_search.py             # WordSearchAuditor
  word_snake.py              # WordSnakeAuditor

tests/auditors/
  __init__.py
  test_base.py               # AuditReport JSON round-trip
  test_registry.py           # every Kind has a registered Auditor
  test_sudoku.py
  test_futoshiki.py
  test_kakuro.py
  test_crossword.py
  test_cryptogram.py
  test_word_search.py
  test_word_snake.py
```

### Auditor ABC

```python
# auditors/base.py
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any

@dataclass
class PuzzleAuditEntry:
    """One puzzle's audit result. Per-type fields go in `details`."""
    index: int                          # 1-based index in the book
    difficulty: str                     # e.g. "easy" | "medium" | ...
    is_solvable: bool                   # has at least one solution
    is_unique: bool                     # has exactly one solution
    meets_standards: bool               # all per-type best-practice gates passed
    passed: bool                        # is_solvable AND is_unique AND meets_standards
    failures: list[str] = field(default_factory=list)  # short codes, e.g. ["asymmetric", "two_letter_word"]
    details: dict[str, Any] = field(default_factory=dict)  # per-type extras

@dataclass
class AuditReport:
    book_slug: str
    puzzle_kind: str                    # "sudoku" | "kakuro" | ...
    puzzles: list[PuzzleAuditEntry]
    totals: dict[str, int]              # checked, passed, failed,
                                        # solvability_failures, uniqueness_failures,
                                        # standards_failures
    def to_json(self) -> dict: ...      # serializes to the v1 schema below

class Auditor(ABC):
    """Audit one puzzle of a specific kind."""
    KIND: str                           # class attr, e.g. "sudoku"

    @abstractmethod
    def audit_puzzle(self, content: Any, solution: Any, difficulty: str) -> PuzzleAuditEntry: ...

    def audit_book(self, puzzles_json: dict) -> AuditReport:
        """Default impl: iterate puzzles, dispatch to audit_puzzle, aggregate totals."""
        # concrete iteration loop here
```

### Registry

```python
# auditors/registry.py
class AuditorRegistry:
    _registry: dict[str, type[Auditor]] = {}

    @classmethod
    def register(cls, auditor_cls: type[Auditor]) -> type[Auditor]:
        cls._registry[auditor_cls.KIND] = auditor_cls
        return auditor_cls

    @classmethod
    def get(cls, kind: str) -> Auditor:
        if kind not in cls._registry:
            raise KeyError(f"No auditor registered for kind {kind!r}")
        return cls._registry[kind]()
```

Each per-type module registers itself at import time:

```python
# auditors/sudoku.py
from .base import Auditor, PuzzleAuditEntry
from .registry import AuditorRegistry

@AuditorRegistry.register
class SudokuAuditor(Auditor):
    KIND = "sudoku"
    def audit_puzzle(self, content, solution, difficulty):
        ...
```

`auditors/__init__.py` imports every per-type module to trigger registration.

## Per-Type Check Menu

Every auditor verifies the two **solvability gates** (`is_solvable`, `is_unique`) plus all the **best-standards gates** below. A book passes only if every puzzle passes every gate.

### Sudoku (migrated from existing audit_puzzles.py)

Solvability gates:
- `is_solvable` — backtracking solver finds at least one valid 9×9 filling
- `is_unique` — exactly one solution exists (existing `UniquenessChecker`)

Best-standards gates:
- `symmetric_180` — clue placement is 180° rotationally symmetric
- `technique_tier_match` — `TechniqueGrader` rates the puzzle in one of the allowed tiers for its declared difficulty (uses existing `DIFFICULTY_TIER_MAP`)

### Futoshiki

Solvability gates:
- `is_solvable` — constraint-propagation solver finds at least one valid filling
- `is_unique` — exactly one solution under the propagation+search solver

Best-standards gates:
- `deducible_without_guess` — solver reaches the unique solution using only pure deduction (no backtracking required). Implemented by running a no-guess propagation solver; if it completes, gate passes.
- `constraint_balance` — `>` and `<` constraint counts are within ±20% of each other (avoids puzzles that lean heavily one direction)
- `not_fully_given` — no row or column has all cells pre-filled

### Kakuro

Solvability gates:
- `is_solvable` — solver finds at least one valid combination of sums
- `is_unique` — exactly one solution

Best-standards gates:
- `no_isolated_cells` — every white cell is part of at least one horizontal AND one vertical run of length ≥ 2 (no orphan cells answering to a single 1-cell clue)
- `valid_combos` — every (sum, length) clue has at least one valid combo of distinct digits 1-9 that sums to it; reject any clue with zero combos

### Crossword

Solvability gates:
- `is_solvable` — every clue's expected answer fits the grid skeleton (cell count + crossings) and uses letters consistent with all crossing words
- `is_unique` — given the clues, exactly one fill is possible

Best-standards gates:
- `every_cell_crosses` — every white cell is part of both an Across and a Down word ≥ 2 cells (no orphan letters; American-style convention)
- `symmetric_180` — black-cell pattern is 180° rotationally symmetric (NYT-standard)
- `no_two_letter_words` — every word is ≥ 3 letters
- `min_word_count` — grid contains at least the convention floor for its size (e.g. 15×15 → 70 words minimum)

### Cryptogram

Solvability gates:
- `is_solvable` — substitution cipher can be inverted; running the inverse on ciphertext yields the declared plaintext exactly
- `is_unique` — the substitution is bijective (each plaintext letter maps to exactly one ciphertext letter and vice versa)

Best-standards gates:
- `no_self_map` — no letter maps to itself (purist convention; avoids freebie clues)
- `all_letters_used_in_alphabet` — every ciphertext letter that appears in the puzzle maps to a real plaintext letter (no orphan substitutions)
- `source_recognizable` — plaintext length ≥ 30 chars (long enough that frequency analysis is feasible) and contains at least 6 unique letters

### Word Search

Solvability gates:
- `is_solvable` — every word in the declared word list is actually placed in the grid (searches all 8 directions: 4 orthogonal + 4 diagonal)
- `is_unique` — every listed word has exactly one placement (avoids ambiguity for puzzlers who count finds)

Best-standards gates:
- `no_false_positives` — no dictionary word ≥ 4 letters (from a configurable common-word list) is accidentally formed in filler letters or word-overlap regions, other than the listed targets
- `filler_letter_frequency` — filler letter distribution roughly matches English letter frequency (chi-squared test against English frequencies, p > 0.05). Prevents obviously machine-generated grids that read as alphabet soup.

### Word Snake

Solvability gates:
- `is_solvable` — the encoded path through the grid spells the declared theme words in order, with each word's last letter adjacent (4-connected) to the next word's first letter
- `is_unique` — the path is the only path through the grid that spells the declared sequence

Best-standards gates:
- `single_visit` — the path visits each grid cell exactly once (no revisits)
- `no_dead_ends` — the path terminates only at the last word's last letter, not mid-grid in a position where a continuation was possible but unused
- `all_words_in_theme` — every word in the declared sequence belongs to the book's declared theme list (avoids drift from the cover/title)

## Report Schema (v1)

Written to `<book_output_dir>/audit.json` next to `puzzles.json`:

```json
{
  "schema_version": "1.0",
  "book_slug": "kakuro-quiet-minds",
  "puzzle_kind": "kakuro",
  "audited_at": "2026-05-31T18:00:00Z",
  "puzzles": [
    {
      "index": 1,
      "difficulty": "easy",
      "is_solvable": true,
      "is_unique": true,
      "meets_standards": true,
      "passed": true,
      "failures": [],
      "details": {"no_isolated_cells": true, "valid_combos": true}
    },
    {
      "index": 2,
      "difficulty": "easy",
      "is_solvable": true,
      "is_unique": false,
      "meets_standards": true,
      "passed": false,
      "failures": ["non_unique"],
      "details": {"no_isolated_cells": true, "valid_combos": true, "solution_count": 2}
    }
  ],
  "totals": {
    "checked": 80,
    "passed": 79,
    "failed": 1,
    "solvability_failures": 0,
    "uniqueness_failures": 1,
    "standards_failures": 0
  }
}
```

The schema is intentionally identical-in-shape across all 7 puzzle kinds. Per-type extras land in `details`. Existing sudoku-only `audit.json` files from `scripts/audit_puzzles.py` get migrated to this schema in the sudoku auditor's first run (back-compat: the old field set is a strict subset of the new one, so re-running on existing books produces a superset).

## puzzles.json contract update

Every book's `puzzles.json` must include a top-level `kind` field:

```json
{
  "kind": "kakuro",
  "puzzles": [...]
}
```

Books that already write `puzzles.json` get a one-line patch in each book module to include `kind`. The change is mechanical and covered by the implementation plan.

## Build CLI Integration

In `src/pocket_rooster_press/cli.py`, the `build` command grows a post-build audit step:

```python
@cli.command()
@click.argument("slug")
@click.option("--skip-audit", is_flag=True, help="Skip post-build audit (dev only)")
def build(slug: str, skip_audit: bool) -> None:
    # ... existing build logic writes output/draft/<slug>/ ...

    if skip_audit:
        click.secho("WARNING: --skip-audit set; book NOT promoted to kdp-ready", fg="yellow")
        return

    puzzles_json = read_json(draft_dir / "puzzles.json")
    auditor = AuditorRegistry.get(puzzles_json["kind"])
    report = auditor.audit_book(puzzles_json)
    write_json(draft_dir / "audit.json", report.to_json())

    if report.totals["failed"] > 0:
        click.secho(
            f"AUDIT FAILED: {report.totals['failed']}/{report.totals['checked']} "
            f"puzzles failed. Book stays in output/draft/.",
            fg="red",
        )
        sys.exit(1)

    promote_to_kdp_ready(slug)
    click.secho(f"Book {slug} promoted to output/kdp-ready/", fg="green")
```

The `--skip-audit` flag exists for development iteration only. It always logs a yellow warning and never promotes the book.

## scripts/audit_puzzles.py — repurposed

The existing sudoku-only script gets a generalized version:

```
# Audit one book by slug
python scripts/audit_puzzles.py --book <slug>

# Audit every book in output/kdp-ready/
python scripts/audit_puzzles.py --all

# Existing --kdp-ready-root override stays for tests
python scripts/audit_puzzles.py --book <slug> --kdp-ready-root /tmp/output
```

The script reads `puzzles.json`, dispatches to `AuditorRegistry.get(kind)`, writes JSON to stdout (and to `audit.json` if `--write` is passed). Exit code 0 if all puzzles pass; 1 if any fail; 2 on hard errors (file not found, malformed JSON, no auditor for kind).

The existing `_is_180_symmetric` and sudoku-specific helpers move into `auditors/sudoku.py`. The script becomes a thin dispatcher.

## Test Strategy

### Per-auditor unit tests

Each `tests/auditors/test_<type>.py` includes hand-built puzzle fixtures:
- **Happy path** — a puzzle known to pass every gate → assert `passed == True`
- **Non-unique fixture** — a puzzle with two valid solutions → assert `is_unique == False`, `failures == ["non_unique"]`
- **Per-best-standards fixtures** — one fixture per best-standards gate, each engineered to fail exactly that gate; assert the right code lands in `failures`

Expected size: 6-10 tests per auditor → ~50-70 new tests.

### Cross-cutting tests

- `test_base.py` — `AuditReport.to_json()` round-trips; `PuzzleAuditEntry` defaults work; `Auditor.audit_book` aggregates totals correctly
- `test_registry.py` — every `Kind` (constant pulled from the 7 generator modules) has a registered auditor; unknown kind raises `KeyError`

### Integration test

`tests/test_build_audit_integration.py` — runs `python -m pocket_rooster_press build <slug>` (via subprocess, against a small fixture book of each kind) and asserts:
- `audit.json` exists in the output dir
- `audit.json["totals"]["failed"] == 0` for a known-good fixture
- Build exits non-zero and book stays in `output/draft/` for a known-bad fixture
- `--skip-audit` always promotes (regardless of underlying puzzle validity) and prints the warning

### Regression test

`tests/test_audit_puzzles_cli.py` (existing) gets extended: confirm migrated sudoku auditor produces output that is a strict **superset** of the old fields, so any external consumer reading the old fields keeps working.

## Migration Plan

The 12 currently-published books were built without this audit. We expect SOME to fail purist checks on first run.

After the harness ships:
1. Run `python scripts/audit_puzzles.py --all > catalog-audit-2026-05-31.json`
2. For each failing book, file a followup with: `book_slug`, list of failing checks, count of failing puzzles, and a recommendation (regenerate vs. relax that specific check for that book's tier).
3. Each followup is its own scoped fix — out of this spec.

The harness itself ships with a clean slate: its tests use hand-built fixtures, not live books. The catalog migration is a separate workstream.

## Risks & Open Questions

**Risk 1: Standards-gate flakiness on edge cases.** E.g., a kakuro grid with one isolated cell that's actually intentional (a "freebie" clue). Mitigation: every per-type best-standards gate can be relaxed for a specific book by adding `audit.relax: ["no_isolated_cells"]` to the book module's metadata. The auditor reads this, downgrades that gate to a warning (logged but not blocking). Not in v1; flag for future revision if it becomes needed.

**Risk 2: Word-search false-positive check requires a dictionary.** The `no_false_positives` gate needs a common-word list. Decision: ship a curated word list at `src/pocket_rooster_press/auditors/data/common_words_en.txt` — top ~5,000 English words length ≥ 4 (sourced from a public-domain frequency list such as `google-10000-english`, trimmed to length ≥ 4 and lowercased). Reproducible across Windows/Linux/macOS (no reliance on `/usr/share/dict/words`), version-controlled, and reviewable. The exact source file and trim recipe land in the implementation plan.

**Risk 3: Solver runtime on hard puzzles.** Sudoku's `UniquenessChecker` can be slow on expert puzzles. Each per-type solver should cap at 5 seconds per puzzle and emit `failures: ["audit_timeout"]` if it exceeds — slow puzzles still fail rather than hanging the build.

**Open question: Coloring-book "puzzles"?** Currently out of scope (no puzzles). If we later add a "find the differences" coloring page, we'd add a new auditor. Out of this spec.

## Acceptance Criteria

1. Every puzzle kind in `src/pocket_rooster_press/generators/` has a corresponding auditor in `src/pocket_rooster_press/auditors/`.
2. `AuditorRegistry.get(kind)` dispatches correctly for all 7 kinds; unknown kind raises `KeyError`.
3. `python -m pocket_rooster_press build <slug>` writes `audit.json` next to `puzzles.json` and fails the build on any audit failure (book stays in `output/draft/`).
4. `--skip-audit` flag works as documented (warning logged, book NOT promoted).
5. `scripts/audit_puzzles.py --book <slug>` and `--all` produce v1-schema JSON to stdout, exit 0 on all-pass, 1 on any-fail, 2 on hard errors.
6. Test suite: ≥50 new tests passing; existing `test_audit_puzzles_cli.py` still green.
7. Catalog-wide audit run (`--all`) succeeds without crashes; per-book failures are reported but don't gate the harness itself shipping.
