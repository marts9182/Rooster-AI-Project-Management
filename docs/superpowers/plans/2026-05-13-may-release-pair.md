# May 2026 KDP Release Pair Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and ship two KDP puzzle books in May 2026 — a Father's Day Variety Puzzle Book (mixed Sudoku/Word Search/Cryptograms/Kakuro) and Futoshiki Large Print for Seniors Vol. 1.

**Architecture:** Two new book modules consume existing generators and a shared set of new infrastructure: (1) Futoshiki rendering added to `pdf_builder.py`, (2) section-divider rendering added to `pdf_builder.py`, (3) a new `assemble_mixed_puzzle_book` method on `BookAssembler`, (4) a new `assemble_futoshiki_book` method, and (5) a new `scripts/build_four_grid_hero.py` cover renderer. All work stays inside the locked playful cover theme.

**Tech Stack:** Python 3.11+, pytest, ReportLab (PDF), Pillow (PNG), PyPDF2/pypdfium2 (PDF inspection), the existing `pocket_rooster_press` package.

**Spec:** [docs/superpowers/specs/2026-05-13-may-release-pair-design.md](docs/superpowers/specs/2026-05-13-may-release-pair-design.md)

**Conventions:**
- All paths under `projects/kdp-puzzle-press/` unless noted otherwise.
- Tests use pytest with plain assertions (matching `tests/test_sudoku.py` style).
- Commit after every passing task. Use Conventional Commits prefix (`feat:`, `test:`, `fix:`, `chore:`).
- All commit messages end with the Co-Authored-By line per repo convention.

---

## ⚠️ Plan Corrections (verified post-Phase-0 reading of actual code)

The plan body below was drafted from a prior Explore agent's notes that turned out to contain material errors. **These corrections override anything in the task bodies that conflicts.**

**Repo layout** — nested-repos setup:
- **Outer repo** (`c:/Sandbox/AIProjectManagement/Rooster-AI-Project-Management`) holds `docs/superpowers/plans/...` and `docs/superpowers/specs/...`. Plan/spec/spike-result commits land here.
- **Inner repo** (`projects/kdp-puzzle-press/`) is its own git repo (excluded from outer via `.gitignore`). All Python source, tests, metadata, output, and cover scripts commit here. You must `cd projects/kdp-puzzle-press` before any `git add`/`git commit` of book/code work.

**Imports:**
- `TEMPLATE_85X11_LARGEPRINT`, `TEMPLATE_6X9_POCKET`, and the `PageTemplate` class come from `pocket_rooster_press.layout.templates` — **not** from `config`.
- `OUTPUT_DIR`, the `PALETTE_*` constants (19 already shipped: `PALETTE_KAKURO`, `PALETTE_GRANDPARENT_GIFT`, etc.), `IMPRINT_TAGLINE`, font paths, and the `ColorPalette` dataclass come from `pocket_rooster_press.config`.

**`PDFBuilder` constructor — actual signature:**
```python
PDFBuilder(template: PageTemplate, output_path: Path, *, imprint_tagline: str | None = None)
```
**No palette argument.** Palettes are exclusively a `CoverBuilder` concern. Every place in the plan that says `PDFBuilder(template, palette, path)` is wrong — drop the palette argument. Interior PDF styling is driven by the fonts registered in `pdf_builder.py` and the per-method drawing code.

**`BookAssembler` and palettes:** `BookConfig` does not need `metadata={"palette": PALETTE_X}` — drop that pattern from Book A and Book B modules. The palette is passed only to `CoverBuilder` at the cover-build step.

**Consequence for Tasks 1.4–1.7:** new `build_futoshiki_book`, `_draw_section_header`, `assemble_futoshiki_book`, and `assemble_mixed_puzzle_book` methods do **not** thread a palette through. They use existing interior styling. If a future variety book wants a different interior tint, that's a separate refactor — out of scope here.

**Phase 0 results so far:**
- **S1 outcome:** **(C)** — no section-page rendering exists at all (`_draw_section_header` absent; no `section`/`divider`/`header` methods in `pdf_builder.py`; `build_sudoku_book` uses `_draw_text_page` inline for difficulty intros). Task 1.5 builds it from scratch as planned.
- **S2 outcome:** **(B)** — no Futoshiki rendering exists in `pdf_builder.py` (none of `build_futoshiki_book`, `_draw_futoshiki_puzzle`, `_draw_futoshiki_page`, `_draw_futoshiki_solution`, `_draw_futoshiki_answer_key` present; `[m for m in dir(builder) if "futoshiki" in m]` returns `[]`). Generator output shape confirmed as planned: `FutoshikiPuzzle(size=6, givens={} (count=0), inequalities=[Inequality(r1, c1, r2, c2), ...] (count=60 for full-ineq bank puzzle), solution=list[list[int]] 6×6)`. `puzzle.difficulty` is `Difficulty.EASY`; `puzzle.metadata` includes `size`, `seed`, `base_id`, `symmetry_op`, `ineq_count`, `givens_count`. Task 1.4 proceeds as planned. Note: `data/futoshiki_bank.json` does not exist yet — spike used an inline temp bank (same pattern as `test_futoshiki.py`); `scripts/build_futoshiki_bank.py` must be run before Task 1.4 integration tests.
- **S3 outcome:** TBD (Task 0.3 next)

---

## Phase 0 — Discovery Spikes (Day 1, May 14)

Two facts in the spec are unverified: whether `pdf_builder.py` has any Futoshiki support, and whether section dividers exist for mixed-puzzle books. Phase 0 confirms both, in <1 day, before any production work. If either spike reveals >1 day of work, stop and replan.

### Task 0.1: Spike S1 — Section Divider Capability

**Files:**
- Create: `projects/kdp-puzzle-press/tests/spike_s1_section_divider.py` (throwaway — delete or convert after spike)

- [ ] **Step 1: Write a probe that tries to render a 4-section divider PDF**

```python
# projects/kdp-puzzle-press/tests/spike_s1_section_divider.py
"""SPIKE S1: Can pdf_builder render section dividers between puzzle types?

Goal: produce a 4-page PDF where each page is a section title page
(e.g., 'Sudoku for Sharp Dads') with the same look-and-feel as the
existing difficulty section headers in build_sudoku_book.
"""
from pathlib import Path
from pocket_rooster_press.layout.pdf_builder import PDFBuilder
from pocket_rooster_press.config import TEMPLATE_85X11_LARGEPRINT, PALETTE_GRANDPARENT_GIFT

def main():
    builder = PDFBuilder(TEMPLATE_85X11_LARGEPRINT, PALETTE_GRANDPARENT_GIFT,
                         Path("output/spike_s1.pdf"))
    # Inspect what render methods exist; try calling private _draw_section_header
    # (if it exists) directly through a wrapper.
    print("Public render methods:", [m for m in dir(builder) if m.startswith("build_")])
    print("Private draw methods:", [m for m in dir(builder) if m.startswith("_draw_")])

if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Run the probe and inspect output**

```bash
cd projects/kdp-puzzle-press
python tests/spike_s1_section_divider.py
```

Expected outcomes (one of three):
- (A) A `_draw_section_header` or `_draw_section_divider` method exists → wire it to a public path; finish in 1 hour.
- (B) `build_sudoku_book` has section headers between difficulties but they're inlined → extract to a public `render_section_divider(title, accent_color)` method in Task 1.4.
- (C) No section-page rendering exists at all → Task 1.4 builds it from scratch (still <1 day).

- [ ] **Step 3: Document the outcome in the plan checkpoint**

Append to `docs/superpowers/plans/2026-05-13-may-release-pair.md` under "Spike Results":

```
S1 outcome: [A/B/C] — [one-line explanation]
Decision: [keep Task 1.5 as planned / scope reduces to wrapper / scope expands to full impl]
```

- [ ] **Step 4: Commit**

```bash
git add projects/kdp-puzzle-press/tests/spike_s1_section_divider.py \
        docs/superpowers/plans/2026-05-13-may-release-pair.md
git commit -m "spike: S1 — section divider capability probe"
```

---

### Task 0.2: Spike S2 — Futoshiki Rendering Capability

**Files:**
- Create: `projects/kdp-puzzle-press/tests/spike_s2_futoshiki_render.py`

- [ ] **Step 1: Write a probe that tries to render one Futoshiki puzzle to PDF**

```python
# projects/kdp-puzzle-press/tests/spike_s2_futoshiki_render.py
"""SPIKE S2: Does pdf_builder render Futoshiki puzzles with inequality glyphs?"""
from pathlib import Path
from pocket_rooster_press.generators.futoshiki import FutoshikiGenerator
from pocket_rooster_press.generators.base import Difficulty
from pocket_rooster_press.layout.pdf_builder import PDFBuilder
from pocket_rooster_press.config import TEMPLATE_85X11_LARGEPRINT, PALETTE_KAKURO

def main():
    gen = FutoshikiGenerator()
    puzzle = gen.generate(Difficulty.EASY, seed=1, size=6, symmetry_seed=0)
    print("Puzzle content type:", type(puzzle.content).__name__)
    print("Has inequalities:", hasattr(puzzle.content, "inequalities"))

    builder = PDFBuilder(TEMPLATE_85X11_LARGEPRINT, PALETTE_KAKURO,
                         Path("output/spike_s2.pdf"))
    # Try the obvious method names
    for method_name in ("build_futoshiki_book", "_draw_futoshiki_puzzle"):
        print(f"{method_name}:", hasattr(builder, method_name))

if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Run the probe**

```bash
cd projects/kdp-puzzle-press
python tests/spike_s2_futoshiki_render.py
```

Expected outcome (per Explore findings): **No Futoshiki support exists.** Task 1.4 must build `_draw_futoshiki_puzzle()` and `build_futoshiki_book()` from scratch.

- [ ] **Step 3: Estimate the rendering work**

Skim `_draw_kakuro_puzzle` and `_render_kakuro_grid` in `pdf_builder.py` — those are the closest analogues (grid + glyphs in inter-cell positions). Confirm Futoshiki renderer is <1 day. The inequality glyphs (`<`, `>`, `∨`, `∧`) need to be placed at the midpoint between two adjacent cells; orientation is determined by `Inequality.r1, c1, r2, c2`.

- [ ] **Step 4: Document outcome**

Append to plan under "Spike Results":

```
S2 outcome: No Futoshiki rendering exists. Task 1.4 builds full _draw_futoshiki_puzzle()
and build_futoshiki_book() following the kakuro pattern. Estimated 4-6 hours.
Decision: Proceed with Phase 1.
```

- [ ] **Step 5: Commit**

```bash
git add projects/kdp-puzzle-press/tests/spike_s2_futoshiki_render.py \
        docs/superpowers/plans/2026-05-13-may-release-pair.md
git commit -m "spike: S2 — Futoshiki render capability probe"
```

---

### Task 0.3: Spike S3 — Four-Grid Cover Composition at Thumbnail Size

**Files:**
- Create: `projects/kdp-puzzle-press/tests/spike_s3_four_grid_thumbnail.py`

- [ ] **Step 1: Write a low-fidelity thumbnail mock**

```python
# projects/kdp-puzzle-press/tests/spike_s3_four_grid_thumbnail.py
"""SPIKE S3: Does the four-grid collage composition read clearly at 200x300px?"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

CREAM_BG = (251, 243, 226)
INK_TEAL = (31, 79, 102)
BRASS = (202, 164, 87)
CORAL = (216, 108, 92)

def make_thumb(out_path: Path, w: int = 200, h: int = 300):
    img = Image.new("RGB", (w, h), CREAM_BG)
    d = ImageDraw.Draw(img)
    # Header
    d.text((10, 8), "★ Father's Day Edition ★", fill=CORAL)
    d.text((30, 22), "Puzzle Book for Dad", fill=INK_TEAL)
    # 2x2 collage
    pad, gap = 20, 8
    grid_w = (w - 2*pad - gap) // 2
    grid_h = (h - 90 - gap) // 2
    accents = [(CORAL, BRASS), (BRASS, CORAL), (INK_TEAL, BRASS), (INK_TEAL, CORAL)]
    labels = ["SUDOKU", "WORD SEARCH", "CRYPTOGRAM", "KAKURO"]
    for i, (border, shadow) in enumerate(accents):
        r, c = divmod(i, 2)
        x = pad + c * (grid_w + gap)
        y = 60 + r * (grid_h + gap)
        # Shadow
        d.rectangle([x+3, y+3, x+grid_w+3, y+grid_h+3], fill=shadow)
        # Tile border + body
        d.rectangle([x, y, x+grid_w, y+grid_h], outline=border, fill=CREAM_BG, width=2)
        # Fake grid lines
        for k in range(1, 5):
            d.line([x + k*grid_w//5, y, x + k*grid_w//5, y+grid_h], fill=INK_TEAL)
            d.line([x, y + k*grid_h//5, x+grid_w, y + k*grid_h//5], fill=INK_TEAL)
        # Label below
        d.text((x + grid_w//2 - 20, y + grid_h + 2), labels[i], fill=BRASS)
    img.save(out_path)

if __name__ == "__main__":
    out = Path("output/spike_s3_thumb.png")
    out.parent.mkdir(exist_ok=True, parents=True)
    make_thumb(out)
    print(f"Wrote {out}")
```

- [ ] **Step 2: Generate and visually inspect**

```bash
cd projects/kdp-puzzle-press
python tests/spike_s3_four_grid_thumbnail.py
```

Open `output/spike_s3_thumb.png` and confirm at actual size (200×300px): four tiles distinguishable, labels readable, palette pops against cream background. If yes, Task 2.2 proceeds. If no, revise composition (larger tile/label ratio, fewer tiles, or fall back to Direction A single-hero cover).

- [ ] **Step 3: Document outcome**

Append to plan:

```
S3 outcome: [readable / needs revision / fall back to Direction A]
Decision: [proceed with build_four_grid_hero.py as planned / revise / use single-hero cover]
```

- [ ] **Step 4: Commit**

```bash
git add projects/kdp-puzzle-press/tests/spike_s3_four_grid_thumbnail.py \
        docs/superpowers/plans/2026-05-13-may-release-pair.md \
        projects/kdp-puzzle-press/output/spike_s3_thumb.png
git commit -m "spike: S3 — four-grid cover composition thumbnail proof"
```

---

## Phase 1 — Foundation (Shared Infrastructure)

After Phase 0 spikes confirm scope, build the shared pieces both books need.

### Task 1.1: Add `fingerprint_futoshiki` to registry

The uniqueness registry has fingerprints for sudoku, word-search, cryptogram, and kakuro. Futoshiki needs one so Book B's puzzles can register and avoid future collisions when Vol. 2 ships.

**Files:**
- Modify: `projects/kdp-puzzle-press/src/pocket_rooster_press/registry.py`
- Create: `projects/kdp-puzzle-press/tests/test_registry_futoshiki.py`

- [ ] **Step 1: Write the failing test**

```python
# projects/kdp-puzzle-press/tests/test_registry_futoshiki.py
"""Tests for Futoshiki fingerprinting in the puzzle uniqueness registry."""
from pocket_rooster_press.generators.futoshiki import Inequality
from pocket_rooster_press.registry import fingerprint_futoshiki

def test_fingerprint_stable_for_same_puzzle():
    size = 5
    givens = {(0, 0): 3}
    ineqs = [Inequality(0, 0, 0, 1), Inequality(1, 0, 2, 0)]
    fp1 = fingerprint_futoshiki(size, givens, ineqs)
    fp2 = fingerprint_futoshiki(size, dict(givens), list(ineqs))
    assert fp1 == fp2
    assert len(fp1) == 64  # sha256 hex

def test_fingerprint_differs_on_ineq_change():
    size = 5
    givens = {}
    base = [Inequality(0, 0, 0, 1)]
    other = [Inequality(0, 0, 1, 0)]
    assert fingerprint_futoshiki(size, givens, base) != fingerprint_futoshiki(size, givens, other)

def test_fingerprint_differs_on_size():
    ineqs = [Inequality(0, 0, 0, 1)]
    assert fingerprint_futoshiki(5, {}, ineqs) != fingerprint_futoshiki(6, {}, ineqs)

def test_fingerprint_ignores_input_ordering():
    """Same inequalities in different order must produce the same fingerprint."""
    size = 5
    a = [Inequality(0, 0, 0, 1), Inequality(1, 1, 1, 2)]
    b = [Inequality(1, 1, 1, 2), Inequality(0, 0, 0, 1)]
    assert fingerprint_futoshiki(size, {}, a) == fingerprint_futoshiki(size, {}, b)
```

- [ ] **Step 2: Run test, confirm it fails**

```bash
cd projects/kdp-puzzle-press
pytest tests/test_registry_futoshiki.py -v
```

Expected: `ImportError` or `AttributeError: module 'pocket_rooster_press.registry' has no attribute 'fingerprint_futoshiki'`.

- [ ] **Step 3: Add `fingerprint_futoshiki` to `registry.py`**

Add at the end of `registry.py` (preserving existing imports — add only what's needed):

```python
# ---- Futoshiki ----

def fingerprint_futoshiki(
    size: int,
    givens: dict[tuple[int, int], int],
    inequalities: "Iterable[Any]",  # list[Inequality] — Any to avoid hard import
) -> str:
    """Hash a Futoshiki puzzle's structural identity.

    Canonical form: size + sorted givens + sorted inequalities (as tuples).
    Two puzzles with the same size, same givens, and same inequality set
    produce the same fingerprint regardless of input order.
    """
    givens_canon = sorted((r, c, v) for (r, c), v in givens.items())
    ineq_canon = sorted(
        (ineq.r1, ineq.c1, ineq.r2, ineq.c2) for ineq in inequalities
    )
    payload = json.dumps(
        {"size": size, "givens": givens_canon, "ineq": ineq_canon},
        sort_keys=True,
        separators=(",", ":"),
    )
    return _sha256(payload)
```

- [ ] **Step 4: Run test, confirm it passes**

```bash
pytest tests/test_registry_futoshiki.py -v
```

Expected: all 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add projects/kdp-puzzle-press/src/pocket_rooster_press/registry.py \
        projects/kdp-puzzle-press/tests/test_registry_futoshiki.py
git commit -m "feat(registry): fingerprint_futoshiki for Futoshiki uniqueness"
```

---

### Task 1.2: Add `PALETTE_FATHERS_DAY_DAD` palette

**Files:**
- Modify: `projects/kdp-puzzle-press/src/pocket_rooster_press/config.py`

- [ ] **Step 1: Add the palette dict**

Locate the existing palette definitions section in `config.py` (alongside `PALETTE_KAKURO`, `PALETTE_GRANDPARENT_GIFT`, etc.). Add:

```python
PALETTE_FATHERS_DAY_DAD = ColorPalette(
    name="fathers-day-dad",
    primary=Color(0.122, 0.310, 0.400),    # #1F4F66 deep teal
    accent=Color(0.847, 0.424, 0.361),     # #D86C5C coral (slightly warmer)
    secondary=Color(0.792, 0.643, 0.341),  # #CAA457 brass
    bg_top=Color(0.984, 0.953, 0.886),     # #FBF3E2 cream
    bg_bottom=Color(0.941, 0.902, 0.820),  # #F0E6D1 cream deep
    cell_fill=Color(0.976, 0.941, 0.867),  # #F9F0DD cell cream
)
```

> Note: Match the actual `ColorPalette` dataclass fields used by sibling palettes. If the dataclass uses different field names, adapt — but keep the hex values shown.

- [ ] **Step 2: Smoke-import the palette**

```bash
cd projects/kdp-puzzle-press
python -c "from pocket_rooster_press.config import PALETTE_FATHERS_DAY_DAD; print(PALETTE_FATHERS_DAY_DAD.name)"
```

Expected output: `fathers-day-dad`

- [ ] **Step 3: Commit**

```bash
git add projects/kdp-puzzle-press/src/pocket_rooster_press/config.py
git commit -m "feat(config): PALETTE_FATHERS_DAY_DAD playful warm-coral variant"
```

---

### Task 1.3: Add `PALETTE_FUTOSHIKI` palette

**Files:**
- Modify: `projects/kdp-puzzle-press/src/pocket_rooster_press/config.py`

- [ ] **Step 1: Add the palette**

```python
PALETTE_FUTOSHIKI = ColorPalette(
    name="futoshiki",
    primary=Color(0.094, 0.290, 0.380),    # #18495F teal (cooler than default)
    accent=Color(0.847, 0.424, 0.361),     # #D86C5C coral
    secondary=Color(0.792, 0.643, 0.341),  # #CAA457 brass
    bg_top=Color(0.984, 0.953, 0.886),     # #FBF3E2 cream
    bg_bottom=Color(0.941, 0.902, 0.820),  # #F0E6D1 cream deep
    cell_fill=Color(0.976, 0.941, 0.867),  # #F9F0DD
)
```

- [ ] **Step 2: Smoke-import**

```bash
python -c "from pocket_rooster_press.config import PALETTE_FUTOSHIKI; print(PALETTE_FUTOSHIKI.name)"
```

Expected: `futoshiki`

- [ ] **Step 3: Commit**

```bash
git add projects/kdp-puzzle-press/src/pocket_rooster_press/config.py
git commit -m "feat(config): PALETTE_FUTOSHIKI cool-teal playful variant"
```

---

### Task 1.4: Add Futoshiki PDF rendering (`_draw_futoshiki_puzzle` + `build_futoshiki_book`)

**Files:**
- Modify: `projects/kdp-puzzle-press/src/pocket_rooster_press/layout/pdf_builder.py`
- Create: `projects/kdp-puzzle-press/tests/test_pdf_builder_futoshiki.py`

- [ ] **Step 1: Write the failing test**

```python
# projects/kdp-puzzle-press/tests/test_pdf_builder_futoshiki.py
"""Tests for Futoshiki PDF rendering."""
from pathlib import Path
from pocket_rooster_press.config import PALETTE_FUTOSHIKI, TEMPLATE_85X11_LARGEPRINT
from pocket_rooster_press.generators.base import Difficulty
from pocket_rooster_press.generators.futoshiki import FutoshikiGenerator
from pocket_rooster_press.layout.pdf_builder import PDFBuilder
from pypdf import PdfReader

def test_build_futoshiki_book_produces_valid_pdf(tmp_path):
    gen = FutoshikiGenerator()
    puzzles = [gen.generate(Difficulty.EASY, seed=i, size=5, symmetry_seed=0)
               for i in range(1, 5)]
    out = tmp_path / "test_futoshiki.pdf"
    builder = PDFBuilder(TEMPLATE_85X11_LARGEPRINT, PALETTE_FUTOSHIKI, out)
    result = builder.build_futoshiki_book(
        title="Test Futoshiki Book",
        puzzles=puzzles,
        intro_text="Welcome to Futoshiki",
    )
    assert result.exists()
    reader = PdfReader(str(result))
    # Title + copyright + intro + 4 puzzles (1-up) + ~1 answer page + back ≈ 8-12 pages
    assert 6 <= len(reader.pages) <= 14

def test_build_futoshiki_book_supports_multi_up(tmp_path):
    gen = FutoshikiGenerator()
    puzzles = [gen.generate(Difficulty.EASY, seed=i, size=5, symmetry_seed=0)
               for i in range(1, 9)]  # 8 5x5 puzzles
    out = tmp_path / "test_futoshiki_4up.pdf"
    builder = PDFBuilder(TEMPLATE_85X11_LARGEPRINT, PALETTE_FUTOSHIKI, out)
    result = builder.build_futoshiki_book(
        title="Test",
        puzzles=puzzles,
        intro_text="Intro",
        puzzles_per_page=4,  # 4-up layout for small grids
    )
    assert result.exists()
    reader = PdfReader(str(result))
    # 8 puzzles at 4-up = 2 puzzle pages + front matter
    assert 4 <= len(reader.pages) <= 10
```

- [ ] **Step 2: Run test, confirm failure**

```bash
cd projects/kdp-puzzle-press
pytest tests/test_pdf_builder_futoshiki.py -v
```

Expected: `AttributeError: 'PDFBuilder' object has no attribute 'build_futoshiki_book'`.

- [ ] **Step 3: Implement `_draw_futoshiki_puzzle` and `build_futoshiki_book` in `pdf_builder.py`**

Add (next to `_draw_kakuro_puzzle` and `build_kakuro_book` — those are the structural analogues):

```python
def _draw_futoshiki_puzzle(
    self,
    c: "canvas.Canvas",
    puzzle: Any,
    puzzle_num: int,
    page_num: int,
    cell_size: float | None = None,
    origin_x: float | None = None,
    origin_y: float | None = None,
) -> None:
    """Render a single Futoshiki puzzle.

    The puzzle.content is a FutoshikiPuzzle with size, givens, inequalities.
    Inequality glyphs (<, >, ∧, ∨) are drawn in the inter-cell gutters.
    Args origin_x/origin_y/cell_size let multi-up layouts pin grids manually;
    when None, the grid is centered on the page.
    """
    fp = puzzle.content
    n = fp.size
    cell = cell_size or _compute_default_cell_size(self.template, n)
    if origin_x is None or origin_y is None:
        gx, gy = self._center_grid(n, cell)
    else:
        gx, gy = origin_x, origin_y

    # Title above grid (only when full-page; skip in multi-up)
    if cell_size is None:
        c.setFont(self._title_font, 14)
        c.drawCentredString(self.template.width / 2, gy + n * cell + 30,
                            f"Puzzle {puzzle_num}")

    # Draw cells
    primary = self.palette.primary
    c.setStrokeColorRGB(primary.red, primary.green, primary.blue)
    c.setLineWidth(1.2)
    for r in range(n):
        for col in range(n):
            x = gx + col * cell
            y = gy + (n - 1 - r) * cell  # PDF y-axis grows upward
            c.rect(x, y, cell, cell, stroke=1, fill=0)
            # Givens
            val = fp.givens.get((r, col))
            if val is not None:
                c.setFont(self._body_font, cell * 0.55)
                c.drawCentredString(x + cell / 2, y + cell * 0.28, str(val))

    # Draw inequality glyphs in inter-cell gutters
    accent = self.palette.accent
    c.setFillColorRGB(accent.red, accent.green, accent.blue)
    c.setFont(self._body_font, cell * 0.45)
    for ineq in fp.inequalities:
        glyph, mx, my = _glyph_for_inequality(ineq, n, gx, gy, cell)
        c.drawCentredString(mx, my, glyph)
    c.setFillColorRGB(0, 0, 0)  # reset

    # Footer page number
    c.setFont(self._body_font, 9)
    c.drawCentredString(self.template.width / 2, 25, str(page_num))


def _glyph_for_inequality(ineq: Any, n: int, gx: float, gy: float, cell: float):
    """Return (glyph_char, x_center, y_center) for an inequality between two cells.

    Convention: ineq.r1,c1 < ineq.r2,c2 (canonically). Horizontal pair → '<' or '>';
    vertical pair → '∧' (small above) or '∨' (small below).
    """
    r1, c1, r2, c2 = ineq.r1, ineq.c1, ineq.r2, ineq.c2
    # Compute midpoint between two adjacent cells
    cx1 = gx + (c1 + 0.5) * cell
    cy1 = gy + (n - 1 - r1 + 0.5) * cell
    cx2 = gx + (c2 + 0.5) * cell
    cy2 = gy + (n - 1 - r2 + 0.5) * cell
    mx = (cx1 + cx2) / 2
    my = (cy1 + cy2) / 2
    if r1 == r2:  # horizontal — cells side-by-side
        glyph = "<" if c1 < c2 else ">"
    else:  # vertical
        # ineq is "small < large" (r1,c1) < (r2,c2)
        # In screen coords, top row is smaller r, but PDF y grows upward
        if r1 < r2:    # small cell is upper, large is lower
            glyph = "∨"  # pointing down toward larger
        else:
            glyph = "∧"
    return glyph, mx, my


def build_futoshiki_book(
    self,
    title: str,
    puzzles: list[Any],
    intro_text: str = "",
    section_titles: list[str] | None = None,
    section_boundaries: list[int] | None = None,
    puzzles_per_page: int = 1,
) -> Path:
    """Render a Futoshiki book PDF.

    Args:
        section_titles: ordered titles for difficulty/size sections (e.g.,
            ["Warm-up 5x5", "Steady 6x6", ...]).
        section_boundaries: cumulative puzzle counts marking section ends
            (e.g., [30, 70, 100, 120] for 30+40+30+20).
        puzzles_per_page: 1 for full-page, 2 for half-page, 4 for quarter-page.
    """
    c = canvas.Canvas(str(self.output_path), pagesize=(self.template.width, self.template.height))
    self._draw_title_page(c, title)
    c.showPage()
    self._draw_copyright_page(c)
    c.showPage()
    if intro_text:
        self._draw_intro_page(c, intro_text)
        c.showPage()

    sections = section_titles or [""]
    boundaries = section_boundaries or [len(puzzles)]

    puzzle_idx = 0
    page_num = 1
    for sec_title, end_idx in zip(sections, boundaries):
        if sec_title:
            self._draw_section_header(c, sec_title)  # added in Task 1.5
            c.showPage()
        while puzzle_idx < end_idx:
            batch = puzzles[puzzle_idx : min(puzzle_idx + puzzles_per_page, end_idx)]
            self._draw_futoshiki_page(c, batch, puzzle_idx + 1, page_num,
                                      puzzles_per_page)
            c.showPage()
            puzzle_idx += len(batch)
            page_num += 1

    # Answer key
    self._draw_futoshiki_answer_key(c, puzzles)
    c.save()
    return self.output_path


def _draw_futoshiki_page(self, c, batch, start_num, page_num, per_page):
    """Render up to `per_page` Futoshiki puzzles on one page."""
    if per_page == 1:
        self._draw_futoshiki_puzzle(c, batch[0], start_num, page_num)
    elif per_page in (2, 4):
        # 2-up: two grids stacked vertically; 4-up: 2x2 grid of grids
        positions = self._multi_up_positions(per_page)
        cell = _compute_multi_up_cell_size(self.template, batch[0].content.size, per_page)
        for i, puzzle in enumerate(batch):
            ox, oy = positions[i]
            self._draw_futoshiki_puzzle(c, puzzle, start_num + i, page_num,
                                        cell_size=cell, origin_x=ox, origin_y=oy)
        # Footer
        c.setFont(self._body_font, 9)
        c.drawCentredString(self.template.width / 2, 25, str(page_num))
    else:
        raise ValueError(f"Unsupported puzzles_per_page: {per_page}")


def _draw_futoshiki_answer_key(self, c, puzzles):
    """Render compact 4-up solution grids."""
    c.setFont(self._title_font, 18)
    c.drawCentredString(self.template.width / 2,
                        self.template.height - 60, "Answer Key")
    # 4 solutions per page, packed
    per_page = 4
    cell = _compute_multi_up_cell_size(self.template, puzzles[0].content.size, per_page)
    positions = self._multi_up_positions(per_page, top_offset=120)
    for i in range(0, len(puzzles), per_page):
        if i > 0:
            c.showPage()
            c.setFont(self._title_font, 18)
            c.drawCentredString(self.template.width / 2,
                                self.template.height - 60, "Answer Key (cont.)")
        for j, puzzle in enumerate(puzzles[i : i + per_page]):
            ox, oy = positions[j]
            self._draw_futoshiki_solution(c, puzzle, i + j + 1, cell, ox, oy)
    c.showPage()


def _draw_futoshiki_solution(self, c, puzzle, num, cell, ox, oy):
    """Render a single solved Futoshiki grid (compact)."""
    fp = puzzle.content
    n = fp.size
    c.setFont(self._body_font, cell * 0.4)
    c.drawString(ox, oy + n * cell + 8, f"#{num}")
    primary = self.palette.primary
    c.setStrokeColorRGB(primary.red, primary.green, primary.blue)
    c.setLineWidth(0.8)
    for r in range(n):
        for col in range(n):
            x = ox + col * cell
            y = oy + (n - 1 - r) * cell
            c.rect(x, y, cell, cell, stroke=1, fill=0)
            val = fp.solution[r][col]
            c.setFont(self._body_font, cell * 0.55)
            c.drawCentredString(x + cell / 2, y + cell * 0.28, str(val))
```

Helper functions to add (top of `pdf_builder.py` near other helpers):

```python
def _compute_default_cell_size(template, n: int) -> float:
    """Center a single Futoshiki grid on the page, leaving generous margins."""
    page_w = template.width
    page_h = template.height
    max_grid_w = page_w * 0.7
    max_grid_h = page_h * 0.55
    return min(max_grid_w / n, max_grid_h / n)


def _compute_multi_up_cell_size(template, n: int, per_page: int) -> float:
    """Compute cell size for n-grid puzzles laid out per_page on one page."""
    cols = 1 if per_page == 2 else 2
    rows = per_page // cols
    avail_w = template.width * 0.85 / cols
    avail_h = (template.height - 140) / rows
    return min(avail_w / n, avail_h / n) * 0.85


# Add as a method on PDFBuilder:
def _multi_up_positions(self, per_page: int, top_offset: float = 80):
    """Return (x, y) origin coordinates for each grid in a multi-up layout."""
    w, h = self.template.width, self.template.height
    if per_page == 2:
        # Stacked vertically
        return [(w * 0.15, h * 0.55 - top_offset),
                (w * 0.15, h * 0.15)]
    if per_page == 4:
        # 2x2
        return [(w * 0.08, h * 0.55 - top_offset),
                (w * 0.52, h * 0.55 - top_offset),
                (w * 0.08, h * 0.10),
                (w * 0.52, h * 0.10)]
    raise ValueError(f"Unsupported per_page: {per_page}")


def _center_grid(self, n: int, cell: float) -> tuple[float, float]:
    """Center a single n×n grid on the page; return bottom-left origin (gx, gy)."""
    w = self.template.width
    h = self.template.height
    gx = (w - n * cell) / 2
    gy = (h - n * cell) / 2 - 20
    return gx, gy
```

- [ ] **Step 4: Run test, confirm pass**

```bash
pytest tests/test_pdf_builder_futoshiki.py -v
```

Expected: both tests PASS. Open one generated PDF (under pytest tmp_path) visually to confirm inequality glyphs render in the right gutters.

- [ ] **Step 5: Visual sanity check**

```bash
python -c "
from pathlib import Path
from pocket_rooster_press.config import PALETTE_FUTOSHIKI, TEMPLATE_85X11_LARGEPRINT
from pocket_rooster_press.generators.base import Difficulty
from pocket_rooster_press.generators.futoshiki import FutoshikiGenerator
from pocket_rooster_press.layout.pdf_builder import PDFBuilder

gen = FutoshikiGenerator()
puzzles = [gen.generate(Difficulty.EASY, seed=i, size=5, symmetry_seed=0) for i in range(1, 5)]
out = Path('output/visual_futoshiki.pdf')
out.parent.mkdir(exist_ok=True)
builder = PDFBuilder(TEMPLATE_85X11_LARGEPRINT, PALETTE_FUTOSHIKI, out)
builder.build_futoshiki_book(title='Visual Check', puzzles=puzzles, intro_text='Intro')
print(f'wrote {out}')
"
```

Open `output/visual_futoshiki.pdf`. Verify (1) cells are crisp, (2) inequality glyphs sit in gutters not inside cells, (3) given digits are centered, (4) answer key page renders 4-up solutions.

- [ ] **Step 6: Commit**

```bash
git add projects/kdp-puzzle-press/src/pocket_rooster_press/layout/pdf_builder.py \
        projects/kdp-puzzle-press/tests/test_pdf_builder_futoshiki.py
git commit -m "feat(pdf): Futoshiki rendering (puzzle, multi-up, answer key)"
```

---

### Task 1.5: Add `_draw_section_header` public path

This depends on Spike S1 outcome. Three branches:

**If S1 outcome (A): a `_draw_section_header` method already exists internally** → just promote it to public (`render_section_divider`) and add one test. Skip to Step 4 below using the existing method.

**If S1 outcome (B): section header logic is inlined in `build_sudoku_book`** → extract it.

**If S1 outcome (C): no section page rendering exists** → build it from scratch as below.

The plan below assumes (C). Adapt scope downward if (A) or (B).

**Files:**
- Modify: `projects/kdp-puzzle-press/src/pocket_rooster_press/layout/pdf_builder.py`
- Create: `projects/kdp-puzzle-press/tests/test_pdf_builder_section_header.py`

- [ ] **Step 1: Write failing test**

```python
# projects/kdp-puzzle-press/tests/test_pdf_builder_section_header.py
"""Tests for section divider rendering."""
from pathlib import Path
from pocket_rooster_press.config import PALETTE_FATHERS_DAY_DAD, TEMPLATE_85X11_LARGEPRINT
from pocket_rooster_press.layout.pdf_builder import PDFBuilder
from pypdf import PdfReader
from reportlab.pdfgen import canvas

def test_draw_section_header_renders_one_page(tmp_path):
    out = tmp_path / "section_test.pdf"
    builder = PDFBuilder(TEMPLATE_85X11_LARGEPRINT, PALETTE_FATHERS_DAY_DAD, out)
    c = canvas.Canvas(str(out), pagesize=(builder.template.width, builder.template.height))
    builder._draw_section_header(c, "Sudoku for Sharp Dads")
    c.showPage()
    c.save()
    reader = PdfReader(str(out))
    assert len(reader.pages) == 1
    # Confirm the section title text appears in the PDF
    text = reader.pages[0].extract_text() or ""
    assert "Sudoku for Sharp Dads" in text
```

- [ ] **Step 2: Run, confirm fails**

```bash
pytest tests/test_pdf_builder_section_header.py -v
```

Expected: `AttributeError: '_draw_section_header'` or `AssertionError`.

- [ ] **Step 3: Add `_draw_section_header` to `pdf_builder.py`**

```python
def _draw_section_header(self, c: "canvas.Canvas", title: str,
                         subtitle: str | None = None) -> None:
    """Render a full-page section divider in the book's palette."""
    w, h = self.template.width, self.template.height
    # Background tint (cream)
    bg = self.palette.bg_top
    c.setFillColorRGB(bg.red, bg.green, bg.blue)
    c.rect(0, 0, w, h, stroke=0, fill=1)

    # Centered title
    primary = self.palette.primary
    c.setFillColorRGB(primary.red, primary.green, primary.blue)
    c.setFont(self._title_font, 36)
    c.drawCentredString(w / 2, h / 2 + 20, title)

    # Decorative rule in accent
    accent = self.palette.accent
    c.setStrokeColorRGB(accent.red, accent.green, accent.blue)
    c.setLineWidth(2.5)
    c.line(w / 2 - 60, h / 2, w / 2 + 60, h / 2)

    if subtitle:
        c.setFont(self._body_font, 14)
        c.drawCentredString(w / 2, h / 2 - 30, subtitle)

    c.setFillColorRGB(0, 0, 0)
```

- [ ] **Step 4: Run test, confirm pass**

```bash
pytest tests/test_pdf_builder_section_header.py -v
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add projects/kdp-puzzle-press/src/pocket_rooster_press/layout/pdf_builder.py \
        projects/kdp-puzzle-press/tests/test_pdf_builder_section_header.py
git commit -m "feat(pdf): _draw_section_header for mixed-puzzle book dividers"
```

---

### Task 1.6: Add `assemble_futoshiki_book` to `BookAssembler`

**Files:**
- Modify: `projects/kdp-puzzle-press/src/pocket_rooster_press/layout/book_assembler.py`
- Create: `projects/kdp-puzzle-press/tests/test_assembler_futoshiki.py`

- [ ] **Step 1: Write failing test**

```python
# projects/kdp-puzzle-press/tests/test_assembler_futoshiki.py
from pathlib import Path
from pocket_rooster_press.config import TEMPLATE_85X11_LARGEPRINT
from pocket_rooster_press.generators.base import Difficulty
from pocket_rooster_press.generators.futoshiki import FutoshikiGenerator
from pocket_rooster_press.layout.book_assembler import BookAssembler, BookConfig

def test_assemble_futoshiki_book(tmp_path):
    gen = FutoshikiGenerator()
    puzzles = [gen.generate(Difficulty.EASY, seed=i, size=5, symmetry_seed=0)
               for i in range(1, 9)]
    config = BookConfig(
        book_id="test-futoshiki",
        title="Test Futoshiki",
        template=TEMPLATE_85X11_LARGEPRINT,
        output_dir=tmp_path,
        intro_text="Test intro",
    )
    assembler = BookAssembler(config)
    interior = assembler.assemble_futoshiki_book(
        puzzles,
        section_titles=["Warm-up 5x5"],
        section_boundaries=[8],
        puzzles_per_page=4,
    )
    assert interior.exists()
    assert interior.suffix == ".pdf"
```

- [ ] **Step 2: Run, confirm fails**

```bash
pytest tests/test_assembler_futoshiki.py -v
```

Expected: `AttributeError: 'BookAssembler' object has no attribute 'assemble_futoshiki_book'`.

- [ ] **Step 3: Add the assembler method**

In `book_assembler.py`, add next to the other `assemble_*_book` methods:

```python
def assemble_futoshiki_book(
    self,
    puzzles: list[Puzzle],
    section_titles: list[str] | None = None,
    section_boundaries: list[int] | None = None,
    puzzles_per_page: int = 1,
) -> Path:
    """Assemble a Futoshiki puzzle book PDF.

    Section titles and boundaries are 1-1 lists describing difficulty/size
    tiers (e.g., ["Warm-up 5x5","Steady 6x6"] with boundaries [30, 70]).
    """
    output = self.output_dir / "interior.pdf"
    palette = self.config.metadata.get("palette") or PALETTE_FUTOSHIKI
    builder = PDFBuilder(self.config.template, palette, output)
    builder.imprint_tagline = self._resolve_imprint_tagline()
    return builder.build_futoshiki_book(
        title=self.config.title,
        puzzles=puzzles,
        intro_text=self.config.intro_text,
        section_titles=section_titles,
        section_boundaries=section_boundaries,
        puzzles_per_page=puzzles_per_page,
    )
```

Add the import at the top of `book_assembler.py`:

```python
from pocket_rooster_press.config import PALETTE_FUTOSHIKI
```

- [ ] **Step 4: Run, confirm pass**

```bash
pytest tests/test_assembler_futoshiki.py -v
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add projects/kdp-puzzle-press/src/pocket_rooster_press/layout/book_assembler.py \
        projects/kdp-puzzle-press/tests/test_assembler_futoshiki.py
git commit -m "feat(assembler): assemble_futoshiki_book"
```

---

### Task 1.7: Add `assemble_mixed_puzzle_book` to `BookAssembler`

This is the first orchestration method that walks heterogeneous puzzle blocks (sudoku → word search → cryptograms → kakuro) and stitches their PDFs together with section dividers between blocks.

Approach: build one PDF per puzzle block using existing assembler methods, then **merge PDFs using `pypdf`** (already in deps for `PdfReader`). Insert a single-page section-divider PDF between blocks.

**Files:**
- Modify: `projects/kdp-puzzle-press/src/pocket_rooster_press/layout/book_assembler.py`
- Create: `projects/kdp-puzzle-press/tests/test_assembler_mixed.py`

- [ ] **Step 1: Write failing test**

```python
# projects/kdp-puzzle-press/tests/test_assembler_mixed.py
"""Tests for mixed-puzzle book assembly (the Father's Day Variety pattern)."""
from pathlib import Path
from pocket_rooster_press.config import TEMPLATE_85X11_LARGEPRINT
from pocket_rooster_press.generators.base import Difficulty
from pocket_rooster_press.generators.sudoku import SudokuGenerator
from pocket_rooster_press.generators.cryptogram import CryptogramGenerator
from pocket_rooster_press.generators.kakuro import KakuroGenerator
from pocket_rooster_press.generators.word_search import WordSearchGenerator
from pocket_rooster_press.layout.book_assembler import BookAssembler, BookConfig
from pypdf import PdfReader

def test_assemble_mixed_puzzle_book(tmp_path):
    sud = SudokuGenerator()
    ws = WordSearchGenerator()
    cry = CryptogramGenerator()
    kak = KakuroGenerator()
    blocks = [
        {"kind": "sudoku", "title": "Sudoku for Sharp Dads",
         "puzzles": sud.generate_set({Difficulty.EASY: 2})},
        {"kind": "word_search", "title": "Word Search for Workshop Days",
         "sections": {"Garage": [ws.generate(Difficulty.EASY,
                                             words=["WRENCH","DRILL","CLAMP","SAW",
                                                    "VICE","BOLT","NUT","HAMMER"])]}},
        {"kind": "cryptogram", "title": "Cryptograms",
         "puzzles": [cry.generate(Difficulty.EASY,
                                  quote="A father's a treasure.",
                                  attribution="Anonymous")]},
        {"kind": "kakuro", "title": "Kakuro",
         "puzzles": kak.generate_set({Difficulty.EASY: 2})},
    ]
    config = BookConfig(
        book_id="test-mixed",
        title="Test Mixed Book",
        template=TEMPLATE_85X11_LARGEPRINT,
        output_dir=tmp_path,
        intro_text="Welcome",
    )
    assembler = BookAssembler(config)
    interior = assembler.assemble_mixed_puzzle_book(blocks)
    assert interior.exists()
    reader = PdfReader(str(interior))
    # Front matter + 4 section dividers + puzzles + back ≈ at least 10 pages
    assert len(reader.pages) >= 10
```

- [ ] **Step 2: Run, confirm fails**

```bash
pytest tests/test_assembler_mixed.py -v
```

Expected: `AttributeError: 'BookAssembler' object has no attribute 'assemble_mixed_puzzle_book'`.

- [ ] **Step 3: Implement `assemble_mixed_puzzle_book`**

In `book_assembler.py`:

```python
def assemble_mixed_puzzle_book(
    self,
    blocks: list[dict],
    front_matter: str | None = None,
) -> Path:
    """Assemble a variety book that mixes multiple puzzle types.

    `blocks` is an ordered list. Each block is a dict:
      {"kind": "sudoku"|"word_search"|"cryptogram"|"kakuro",
       "title": "Section title rendered on divider page",
       "puzzles": list[Puzzle]  (or "sections" for word_search),
       "puzzles_per_page": int (optional, default 1)}

    Returns the path to the assembled interior PDF.
    """
    from pypdf import PdfWriter, PdfReader
    from reportlab.pdfgen import canvas

    output = self.output_dir / "interior.pdf"
    palette = self.config.metadata.get("palette")
    if palette is None:
        from pocket_rooster_press.config import PALETTE_GRANDPARENT_GIFT
        palette = PALETTE_GRANDPARENT_GIFT

    writer = PdfWriter()

    # ---- Front matter (title + copyright + intro) ----
    fm_path = self.output_dir / "_fm.pdf"
    fm_builder = PDFBuilder(self.config.template, palette, fm_path)
    fm_builder.imprint_tagline = self._resolve_imprint_tagline()
    fm_builder._render_front_matter_only(self.config.title,
                                         front_matter or self.config.intro_text)
    for p in PdfReader(str(fm_path)).pages:
        writer.add_page(p)

    # ---- Per-block: divider page + puzzle pages ----
    for i, block in enumerate(blocks, start=1):
        # Divider
        divider_path = self.output_dir / f"_div_{i}.pdf"
        d_builder = PDFBuilder(self.config.template, palette, divider_path)
        c = canvas.Canvas(str(divider_path),
                          pagesize=(self.config.template.width, self.config.template.height))
        d_builder._draw_section_header(c, block["title"])
        c.showPage()
        c.save()
        for p in PdfReader(str(divider_path)).pages:
            writer.add_page(p)

        # Puzzle block
        block_path = self.output_dir / f"_blk_{i}.pdf"
        b_builder = PDFBuilder(self.config.template, palette, block_path)
        b_builder.imprint_tagline = self._resolve_imprint_tagline()
        kind = block["kind"]
        if kind == "sudoku":
            b_builder.build_sudoku_book(title="", puzzles=block["puzzles"],
                                        intro_text="", skip_front_matter=True)
        elif kind == "word_search":
            b_builder.build_word_search_book(title="", sections=block["sections"],
                                             intro_text="", skip_front_matter=True)
        elif kind == "cryptogram":
            b_builder.build_cryptogram_book(title="", puzzles=block["puzzles"],
                                            intro_text="", skip_front_matter=True)
        elif kind == "kakuro":
            b_builder.build_kakuro_book(title="", puzzles=block["puzzles"],
                                        intro_text="", skip_front_matter=True)
        else:
            raise ValueError(f"Unknown block kind: {kind}")
        for p in PdfReader(str(block_path)).pages:
            writer.add_page(p)

    with output.open("wb") as f:
        writer.write(f)

    # Clean up scratch files
    for stub in self.output_dir.glob("_*.pdf"):
        stub.unlink()
    return output
```

> Note: the `build_*_book` methods do not currently accept `skip_front_matter`. **Adding this parameter is part of this task.** Update each `build_*_book` signature to accept `skip_front_matter: bool = False` and gate the title-page / copyright / intro rendering on `not skip_front_matter`. Also expose `_render_front_matter_only(title, intro)` as a public-ish method on `PDFBuilder` that calls the existing title/copyright/intro rendering helpers.

- [ ] **Step 4: Run, confirm pass**

```bash
pytest tests/test_assembler_mixed.py -v
```

Expected: PASS.

- [ ] **Step 5: Visual sanity check**

Open the generated PDF (`tmp_path` from pytest) — confirm: title page → copyright → intro → divider "Sudoku for Sharp Dads" → 2 sudoku puzzle pages → divider "Word Search for Workshop Days" → 1 word search puzzle → and so on.

- [ ] **Step 6: Commit**

```bash
git add projects/kdp-puzzle-press/src/pocket_rooster_press/layout/book_assembler.py \
        projects/kdp-puzzle-press/src/pocket_rooster_press/layout/pdf_builder.py \
        projects/kdp-puzzle-press/tests/test_assembler_mixed.py
git commit -m "feat(assembler): assemble_mixed_puzzle_book for variety books"
```

---

## Phase 2 — Four-Grid Cover Renderer

### Task 2.1: Extract shared per-grid render helpers (or duplicate cleanly)

Per Explore: `scripts/build_real_grid_hero.py` has all the per-grid rendering inlined. We have two options:

- **Option A**: Extract `_render_sudoku_tile(img, draw, x, y, w, h, puzzle, palette)`, `_render_word_search_tile`, etc. into a new module `src/pocket_rooster_press/covers/grid_tiles.py`. Then both scripts import from there.
- **Option B**: Copy-paste the relevant code into the new script.

Option A is cleaner and serves the rest of the catalog. Use it unless `build_real_grid_hero.py` is structurally tangled in a way that makes extraction risky — in which case fall back to B and revisit later.

**Files:**
- Create: `projects/kdp-puzzle-press/src/pocket_rooster_press/covers/grid_tiles.py`
- Modify: `projects/kdp-puzzle-press/scripts/build_real_grid_hero.py` (import from new module)
- Create: `projects/kdp-puzzle-press/tests/test_grid_tiles.py`

- [ ] **Step 1: Write failing test**

```python
# projects/kdp-puzzle-press/tests/test_grid_tiles.py
"""Tests for shared puzzle-tile renderers used by cover hero scripts."""
from PIL import Image, ImageDraw
from pocket_rooster_press.covers.grid_tiles import (
    render_sudoku_tile, render_word_search_tile,
    render_cryptogram_tile, render_kakuro_tile,
    TILE_PALETTE_PLAYFUL,
)

def test_render_sudoku_tile_does_not_crash():
    img = Image.new("RGB", (200, 200), (255, 255, 255))
    draw = ImageDraw.Draw(img)
    sample_board = [[0]*9 for _ in range(9)]
    sample_board[0][0] = 5
    render_sudoku_tile(draw, x=10, y=10, w=180, h=180,
                       board=sample_board, palette=TILE_PALETTE_PLAYFUL)
    # Confirm pixels were drawn (not all white)
    assert any(img.getpixel((x, y)) != (255, 255, 255)
               for x in range(10, 190) for y in range(10, 190))

def test_render_word_search_tile_does_not_crash():
    img = Image.new("RGB", (200, 200), (255, 255, 255))
    draw = ImageDraw.Draw(img)
    grid = [["A", "B", "C", "D", "E"]] * 5
    render_word_search_tile(draw, x=10, y=10, w=180, h=180,
                            grid=grid, palette=TILE_PALETTE_PLAYFUL)
    assert any(img.getpixel((x, y)) != (255, 255, 255)
               for x in range(10, 190) for y in range(10, 190))
```

- [ ] **Step 2: Run, confirm fails**

```bash
pytest tests/test_grid_tiles.py -v
```

Expected: `ImportError: cannot import name 'render_sudoku_tile' from 'pocket_rooster_press.covers.grid_tiles'`.

- [ ] **Step 3: Create `grid_tiles.py`**

Move per-grid render logic from `scripts/build_real_grid_hero.py` into a new module. Pseudocode for the public API:

```python
# projects/kdp-puzzle-press/src/pocket_rooster_press/covers/grid_tiles.py
"""Shared puzzle-tile renderers for cover hero images.

Both scripts/build_real_grid_hero.py (single-hero) and
scripts/build_four_grid_hero.py (2x2 collage) call these to render
real puzzle data into PIL tiles.
"""
from __future__ import annotations
from dataclasses import dataclass
from PIL import ImageDraw, ImageFont

@dataclass(frozen=True)
class TilePalette:
    bg: tuple[int, int, int]
    cell: tuple[int, int, int]
    ink: tuple[int, int, int]
    digit_brass: tuple[int, int, int]
    digit_coral: tuple[int, int, int]
    digit_teal: tuple[int, int, int]

TILE_PALETTE_PLAYFUL = TilePalette(
    bg=(251, 243, 226),
    cell=(249, 240, 221),
    ink=(31, 79, 102),
    digit_brass=(202, 164, 87),
    digit_coral=(216, 108, 92),
    digit_teal=(31, 79, 102),
)

def render_sudoku_tile(draw: ImageDraw.ImageDraw,
                      x: int, y: int, w: int, h: int,
                      board: list[list[int]],
                      palette: TilePalette = TILE_PALETTE_PLAYFUL,
                      fill_ratio: float = 0.7,
                      font: ImageFont.FreeTypeFont | None = None) -> None:
    """Render a Sudoku grid into the box (x, y, x+w, y+h).

    fill_ratio = how much of the board's given digits to render (0 = empty, 1 = full).
    Digit colors rotate brass → coral → teal.
    """
    # [Implementation: 9x9 grid with thicker lines at 3x3 boundaries, digits at center]
    ...

def render_word_search_tile(draw: ImageDraw.ImageDraw,
                           x: int, y: int, w: int, h: int,
                           grid: list[list[str]],
                           palette: TilePalette = TILE_PALETTE_PLAYFUL,
                           font: ImageFont.FreeTypeFont | None = None) -> None:
    """Render a word-search grid (letters in cells)."""
    ...

def render_cryptogram_tile(draw: ImageDraw.ImageDraw,
                          x: int, y: int, w: int, h: int,
                          ciphertext: str,
                          palette: TilePalette = TILE_PALETTE_PLAYFUL,
                          font: ImageFont.FreeTypeFont | None = None) -> None:
    """Render a cryptogram tile (encoded letters above blank lines)."""
    ...

def render_kakuro_tile(draw: ImageDraw.ImageDraw,
                      x: int, y: int, w: int, h: int,
                      layout: list[list],
                      palette: TilePalette = TILE_PALETTE_PLAYFUL,
                      font: ImageFont.FreeTypeFont | None = None) -> None:
    """Render a kakuro tile (clue triangles + answer cells with some digits)."""
    ...
```

Copy the actual rendering code from `build_real_grid_hero.py` into these functions, parameterizing the (x, y, w, h) origin.

- [ ] **Step 4: Update `build_real_grid_hero.py` to import**

Replace its inline rendering with calls to the new module. Keep the script's CLI behavior unchanged.

- [ ] **Step 5: Run tests + verify script still works**

```bash
pytest tests/test_grid_tiles.py -v
python scripts/build_real_grid_hero.py kakuro-quiet-minds
```

Expected: tests PASS; script still produces a valid hero PNG (diff visually with git's previous version if possible).

- [ ] **Step 6: Commit**

```bash
git add projects/kdp-puzzle-press/src/pocket_rooster_press/covers/grid_tiles.py \
        projects/kdp-puzzle-press/scripts/build_real_grid_hero.py \
        projects/kdp-puzzle-press/tests/test_grid_tiles.py
git commit -m "refactor(covers): extract shared puzzle-tile renderers to grid_tiles module"
```

---

### Task 2.2: Build `scripts/build_four_grid_hero.py`

**Files:**
- Create: `projects/kdp-puzzle-press/scripts/build_four_grid_hero.py`
- Create: `projects/kdp-puzzle-press/tests/test_four_grid_hero.py`

- [ ] **Step 1: Write failing test**

```python
# projects/kdp-puzzle-press/tests/test_four_grid_hero.py
from pathlib import Path
from PIL import Image
import subprocess

def test_four_grid_hero_produces_8x11_png(tmp_path):
    out = tmp_path / "test_hero.png"
    # CLI invocation: python scripts/build_four_grid_hero.py <book_id> --out <path>
    result = subprocess.run(
        ["python", "scripts/build_four_grid_hero.py", "test-fathers-day-variety",
         "--out", str(out)],
        cwd="projects/kdp-puzzle-press",
        capture_output=True, text=True,
    )
    assert result.returncode == 0, result.stderr
    assert out.exists()
    img = Image.open(out)
    # Should match 8.5x11 front panel aspect (1024x1336 = ~1:1.304)
    assert img.size == (1024, 1336)
```

- [ ] **Step 2: Run, confirm fails**

```bash
cd projects/kdp-puzzle-press
pytest tests/test_four_grid_hero.py -v
```

Expected: file-not-found or returncode != 0.

- [ ] **Step 3: Implement `build_four_grid_hero.py`**

```python
# projects/kdp-puzzle-press/scripts/build_four_grid_hero.py
"""Render a 2x2 collage of real puzzle grids as a cover hero PNG.

Usage:
    python scripts/build_four_grid_hero.py fathers-day-variety-dad
    python scripts/build_four_grid_hero.py fathers-day-variety-dad --out path/to/hero.png

The four tiles are Sudoku (top-left), Word Search (top-right),
Cryptogram (bottom-left), Kakuro (bottom-right). Each tile is a
real puzzle from the corresponding generator.
"""
from __future__ import annotations
import argparse
from pathlib import Path
import random
from PIL import Image, ImageDraw, ImageFont

from pocket_rooster_press.covers.grid_tiles import (
    render_sudoku_tile, render_word_search_tile,
    render_cryptogram_tile, render_kakuro_tile,
    TILE_PALETTE_PLAYFUL,
)
from pocket_rooster_press.generators.base import Difficulty
from pocket_rooster_press.generators.sudoku import SudokuGenerator
from pocket_rooster_press.generators.word_search import WordSearchGenerator
from pocket_rooster_press.generators.cryptogram import CryptogramGenerator
from pocket_rooster_press.generators.kakuro import KakuroGenerator

# Constants
W, H = 1024, 1336  # 8.5x11 front panel
CREAM_TOP = (251, 243, 226)
CREAM_BOTTOM = (240, 230, 209)
TEAL = (31, 79, 102)
BRASS = (202, 164, 87)
CORAL = (216, 108, 92)
LABEL_FG = BRASS

TILE_ACCENTS = [
    {"border": CORAL, "shadow": BRASS, "rotation": -2},   # Sudoku
    {"border": BRASS, "shadow": CORAL, "rotation": 2},    # Word Search
    {"border": TEAL,  "shadow": BRASS, "rotation": 1},    # Cryptogram
    {"border": TEAL,  "shadow": CORAL, "rotation": -1},   # Kakuro
]
TILE_LABELS = ["SUDOKU", "WORD SEARCH", "CRYPTOGRAM", "KAKURO"]


def _make_gradient_background(w: int, h: int) -> Image.Image:
    img = Image.new("RGB", (w, h), CREAM_TOP)
    for y in range(h):
        t = y / h
        r = int(CREAM_TOP[0] * (1 - t) + CREAM_BOTTOM[0] * t)
        g = int(CREAM_TOP[1] * (1 - t) + CREAM_BOTTOM[1] * t)
        b = int(CREAM_TOP[2] * (1 - t) + CREAM_BOTTOM[2] * t)
        ImageDraw.Draw(img).line([(0, y), (w, y)], fill=(r, g, b))
    return img


def _draw_confetti(draw: ImageDraw.ImageDraw, w: int, h: int, seed: int = 42):
    """Scatter brass/coral/teal dots around the edges."""
    rng = random.Random(seed)
    palette = [BRASS, CORAL, TEAL]
    for _ in range(40):
        x = rng.randint(0, w)
        y = rng.randint(0, h)
        # Avoid the center band where tiles live
        if 100 < x < w - 100 and 250 < y < h - 250:
            continue
        r = rng.choice([4, 5, 6, 7])
        color = rng.choice(palette)
        draw.ellipse([x - r, y - r, x + r, y + r], fill=color)


def _draw_tile(canvas_img: Image.Image, tile_idx: int, x: int, y: int,
               tile_w: int, tile_h: int, content: dict):
    accent = TILE_ACCENTS[tile_idx]
    # Render tile content onto a transparent buffer at 4x for crisp rotation
    buf = Image.new("RGBA", (tile_w, tile_h), (0, 0, 0, 0))
    bd = ImageDraw.Draw(buf)
    # Shadow rect
    bd.rectangle([6, 6, tile_w + 6, tile_h + 6], fill=accent["shadow"])
    # Tile bg + border
    bd.rectangle([0, 0, tile_w, tile_h], fill=CREAM_TOP, outline=accent["border"], width=4)
    # Puzzle content (inset by 10px)
    inset = 14
    inner_x, inner_y = inset, inset
    inner_w, inner_h = tile_w - 2 * inset, tile_h - 2 * inset
    renderer = content["renderer"]
    renderer(bd, x=inner_x, y=inner_y, w=inner_w, h=inner_h, **content["kwargs"])
    # Rotate
    rotated = buf.rotate(accent["rotation"], resample=Image.BICUBIC, expand=False)
    canvas_img.paste(rotated, (x - 6, y - 6), rotated)


def _draw_label_below(draw: ImageDraw.ImageDraw, label: str,
                      cx: float, y_below: float, font: ImageFont.FreeTypeFont):
    # Background pill on cream so the label "sits on" the tile
    bbox = draw.textbbox((0, 0), label, font=font)
    tw = bbox[2] - bbox[0]
    th = bbox[3] - bbox[1]
    pad_x, pad_y = 6, 2
    draw.rectangle([cx - tw/2 - pad_x, y_below - pad_y,
                    cx + tw/2 + pad_x, y_below + th + pad_y], fill=CREAM_TOP)
    draw.text((cx - tw/2, y_below), label, fill=LABEL_FG, font=font)


def build_hero(out_path: Path, seed: int = 42) -> Path:
    img = _make_gradient_background(W, H)
    draw = ImageDraw.Draw(img)

    # Title block
    try:
        title_font = ImageFont.truetype("Playfair Display Bold.ttf", 78)
        sub_font = ImageFont.truetype("Lato-Italic.ttf", 30)
        label_font = ImageFont.truetype("Lato-Bold.ttf", 22)
    except Exception:
        title_font = ImageFont.load_default()
        sub_font = ImageFont.load_default()
        label_font = ImageFont.load_default()

    # Pre-generate sample puzzles
    sud = SudokuGenerator()
    sample_sud = sud.generate(Difficulty.EASY)
    ws = WordSearchGenerator()
    sample_ws = ws.generate(Difficulty.EASY,
                           words=["DAD", "POP", "FISH", "GOLF", "GRILL",
                                  "TOOL", "GARAGE", "BBQ"])
    cry = CryptogramGenerator()
    sample_cry = cry.generate(Difficulty.EASY,
                             quote="It is easier to build strong children",
                             attribution="F. Douglass")
    kak = KakuroGenerator()
    sample_kak = kak.generate(Difficulty.EASY)

    # Confetti
    _draw_confetti(draw, W, H, seed=seed)

    # Eyebrow line
    draw.text((W/2 - 200, 60), "★ Father's Day Edition ★", fill=CORAL, font=sub_font)
    # Title
    title_text = "Puzzle Book for Dad"
    bbox = draw.textbbox((0, 0), title_text, font=title_font)
    draw.text(((W - (bbox[2] - bbox[0]))/2, 120), title_text, fill=TEAL, font=title_font)

    # Tile grid
    margin_x = 90
    margin_top = 260
    margin_bottom = 220
    label_band = 50
    tile_gap = 30
    grid_area_h = H - margin_top - margin_bottom
    grid_area_w = W - 2 * margin_x
    tile_w = (grid_area_w - tile_gap) // 2
    tile_h = (grid_area_h - tile_gap - 2 * label_band) // 2

    contents = [
        {"renderer": render_sudoku_tile, "kwargs": {"board": sample_sud.content,
                                                    "palette": TILE_PALETTE_PLAYFUL}},
        {"renderer": render_word_search_tile, "kwargs": {"grid": sample_ws.content,
                                                         "palette": TILE_PALETTE_PLAYFUL}},
        {"renderer": render_cryptogram_tile, "kwargs": {"ciphertext": sample_cry.content,
                                                        "palette": TILE_PALETTE_PLAYFUL}},
        {"renderer": render_kakuro_tile, "kwargs": {"layout": sample_kak.content,
                                                    "palette": TILE_PALETTE_PLAYFUL}},
    ]

    for i in range(4):
        r, col = divmod(i, 2)
        tx = margin_x + col * (tile_w + tile_gap)
        ty = margin_top + r * (tile_h + tile_gap + label_band)
        _draw_tile(img, i, tx, ty, tile_w, tile_h, contents[i])
        _draw_label_below(draw, TILE_LABELS[i],
                          cx=tx + tile_w / 2, y_below=ty + tile_h + 14,
                          font=label_font)

    # Footer line
    footer_text = "Sudoku · Word Search · Cryptograms · Kakuro"
    bbox = draw.textbbox((0, 0), footer_text, font=sub_font)
    draw.text(((W - (bbox[2] - bbox[0]))/2, H - 130), footer_text, fill=TEAL, font=sub_font)
    sub2 = "100+ Large-Print Puzzles · Pocket Rooster Press"
    bbox = draw.textbbox((0, 0), sub2, font=label_font)
    draw.text(((W - (bbox[2] - bbox[0]))/2, H - 80), sub2, fill=BRASS, font=label_font)

    out_path.parent.mkdir(parents=True, exist_ok=True)
    img.save(out_path)
    return out_path


def main():
    p = argparse.ArgumentParser()
    p.add_argument("book_id", help="Book slug (e.g., fathers-day-variety-dad)")
    p.add_argument("--out", type=Path, default=None,
                   help="Output PNG path (default: assets/generated/wraps/<book_id>.png)")
    p.add_argument("--seed", type=int, default=42)
    args = p.parse_args()

    out = args.out or Path("assets/generated/wraps") / f"{args.book_id}.png"
    build_hero(out, seed=args.seed)
    print(f"wrote {out}")


if __name__ == "__main__":
    main()
```

- [ ] **Step 4: Run test + visual check**

```bash
pytest tests/test_four_grid_hero.py -v
python scripts/build_four_grid_hero.py fathers-day-variety-dad --out /tmp/hero_check.png
```

Expected: test PASSES. Open `/tmp/hero_check.png` — confirm at full-size and at 200×300 thumbnail size that all four tiles are distinguishable, labels readable, palette pops.

- [ ] **Step 5: Commit**

```bash
git add projects/kdp-puzzle-press/scripts/build_four_grid_hero.py \
        projects/kdp-puzzle-press/tests/test_four_grid_hero.py
git commit -m "feat(covers): build_four_grid_hero.py for variety-book covers"
```

---

## Phase 3 — Theme Content (Deliverables, Not TDD)

These are content-curation tasks, not code. No tests. Each task produces a reviewable artifact. Treat as a content review gate before Phase 4 starts puzzle generation.

### Task 3.1: Curate 25 dad-themed cryptogram quotes

**Files:**
- Create: `projects/kdp-puzzle-press/src/pocket_rooster_press/themes/data/fathers_day_dad_quotes.json`

- [ ] **Step 1: Draft 40 candidate quotes**

Sources (all public-domain):
- Mark Twain (1835–1910)
- Theodore Roosevelt (1858–1919) — fatherly wisdom
- Benjamin Franklin (1706–1790)
- Ralph Waldo Emerson (1803–1882)
- Henry Ward Beecher (1813–1887)
- Aesop's Fables (Public domain translations)
- Anonymous proverbs

For dad humor, draft 10 originals matching the Erma Bombeck / Dave Barry tone (gentle observational humor) and credit as "Pocket Rooster Press original" with attribution `null` — verify before publish that they don't infringe.

Target ranges:
- 15 fatherly wisdom (Roosevelt, Twain, Franklin, etc.)
- 10 gentle humor (originals + anonymous proverbs)
- Length 5–15 words (cryptogram-friendly)
- Quotes must contain ≥ 12 unique letters of the alphabet (so the cipher has signal)

- [ ] **Step 2: Cut to best 25**

Criteria:
1. Tone fits "from your dad" gift moment (not bitter, not preachy, not edgy)
2. Attribution verifiably public domain (author died before 1929)
3. ≥ 12 unique letters
4. No duplicates against existing cryptogram books — check by canonicalizing each quote with `registry.canonical_quote(text)` then comparing to `data/published-puzzles.json` quote fingerprints

- [ ] **Step 3: Write JSON**

```json
{
  "$schema": "../_quotes.schema.json",
  "theme": "fathers_day_dad",
  "quotes": [
    {"text": "It is hard to believe that a man is telling the truth when you know that you would lie if you were in his place.",
     "attribution": "H. L. Mencken",
     "category": "wisdom",
     "license": "public_domain"},
    {"text": "Children begin by loving their parents; as they grow older they judge them; sometimes they forgive them.",
     "attribution": "Oscar Wilde",
     "category": "wisdom",
     "license": "public_domain"}
    // ... 23 more
  ]
}
```

- [ ] **Step 4: Verify uniqueness against existing books**

```bash
cd projects/kdp-puzzle-press
python -c "
import json
from pocket_rooster_press.registry import canonical_quote
with open('src/pocket_rooster_press/themes/data/fathers_day_dad_quotes.json') as f:
    new_quotes = [q['text'] for q in json.load(f)['quotes']]
with open('data/published-puzzles.json') as f:
    pub = json.load(f)
existing_canons = {canonical_quote(t) for t in pub.get('quotes', [])}
collisions = [t for t in new_quotes if canonical_quote(t) in existing_canons]
print('Collisions:', collisions)
assert not collisions, 'Duplicate quotes against existing catalog'
print('All 25 new quotes are unique.')
"
```

Expected: no collisions reported.

- [ ] **Step 5: Commit**

```bash
git add projects/kdp-puzzle-press/src/pocket_rooster_press/themes/data/fathers_day_dad_quotes.json
git commit -m "content: 25 Father's Day cryptogram quotes (public-domain mix)"
```

---

### Task 3.2: Build 30 dad-themed word lists

**Files:**
- Create: `projects/kdp-puzzle-press/src/pocket_rooster_press/themes/data/fathers_day_dad_words.json`

- [ ] **Step 1: Draft word-list categories**

Pick 30 categories, ~18–22 words each. Suggested: Workshop, Toolbox, Garage, Lawn Care, Coffee Time, Classic Cars, Pickup Trucks, Fishing Gear, Tackle Box, Golf, Baseball, Football Sunday, BBQ Day, Grill Master, Spice Rack, Whiskey Bar, Beer Garden, Hardware Store, Hammer & Nails, Workshop Saturday, Sunday Drive, Hunting Trip, Camping Out, RV Life, Dad Jokes, Newspaper, Recliner, Remote Control, Saturday Chores, Sunday Football.

Word list quality bar:
- 8–14 letters each — long enough to feel substantive, short enough to fit a 15×15 grid
- No proper nouns unless universally recognizable
- No words from other published books (avoid duplicates)
- No words flagged by the word_search generator's profanity blacklist

- [ ] **Step 2: Write JSON**

```json
{
  "$schema": "../_wordlists.schema.json",
  "theme": "fathers_day_dad",
  "lists": [
    {"name": "Workshop", "words": ["WRENCH", "HAMMER", "SCREWDRIVER", "PLIERS",
                                    "DRILL", "SAW", "VICE", "CLAMP", "TAPE",
                                    "LEVEL", "SQUARE", "RULER", "BENCH",
                                    "TOOLBELT", "SHELF", "HOOK", "PEG", "NAIL"]},
    {"name": "Coffee Time", "words": ["MUG", "BREW", "BEAN", "ROAST", "GRIND",
                                       "STEAM", "CREAM", "SUGAR", "FILTER",
                                       "DRIP", "MORNING", "PAPER", "QUIET",
                                       "WARM", "AROMA", "SIP", "REFILL"]}
    // ... 28 more lists
  ]
}
```

- [ ] **Step 3: Validate against profanity filter**

```bash
python -c "
import json
from pocket_rooster_press.generators.word_search import _PROFANITY_BLOCKLIST
with open('src/pocket_rooster_press/themes/data/fathers_day_dad_words.json') as f:
    lists = json.load(f)['lists']
flagged = []
for lst in lists:
    for w in lst['words']:
        if any(p in w.upper() for p in _PROFANITY_BLOCKLIST):
            flagged.append((lst['name'], w))
print('Flagged:', flagged)
assert not flagged
print(f'All {sum(len(l[\"words\"]) for l in lists)} words pass.')
"
```

Expected: no flags.

- [ ] **Step 4: Commit**

```bash
git add projects/kdp-puzzle-press/src/pocket_rooster_press/themes/data/fathers_day_dad_words.json
git commit -m "content: 30 dad-themed word lists for Father's Day variety book"
```

---

### Task 3.3: Write Book A intro page text

**Files:**
- Create: `projects/kdp-puzzle-press/src/pocket_rooster_press/themes/data/fathers_day_dad_intro.txt`

- [ ] **Step 1: Write the intro (≤150 words)**

The intro lives on page 3 (after title + copyright). Tone: warm, gift-moment, not jokey, not preachy. Mention what's inside, who it's for, and a sign-off from "Pocket Rooster Press."

Example draft (refine as you write):

```
For the Dad who reads the paper before the day starts,
who fixes things before they break, who keeps the gas tank full
and the punchlines coming.

Inside you'll find 100 generously-sized puzzles — sudoku
to keep the mind sharp, word searches for unhurried evenings,
cryptograms with quotes worth pausing over, and a handful of
kakuros for the days you're feeling adventurous.

Take your time. There's no rush.

From all of us at Pocket Rooster Press —
Happy Father's Day.
```

- [ ] **Step 2: Commit**

```bash
git add projects/kdp-puzzle-press/src/pocket_rooster_press/themes/data/fathers_day_dad_intro.txt
git commit -m "content: Father's Day Variety book intro page"
```

---

### Task 3.4: Write Futoshiki Seniors intro + how-to-play + cheat-sheet

**Files:**
- Create: `projects/kdp-puzzle-press/src/pocket_rooster_press/themes/data/futoshiki_seniors_v1_intro.txt`
- Create: `projects/kdp-puzzle-press/src/pocket_rooster_press/themes/data/futoshiki_seniors_v1_howto.txt`
- Create: `projects/kdp-puzzle-press/src/pocket_rooster_press/themes/data/futoshiki_seniors_v1_cheatsheet.txt`

- [ ] **Step 1: Write the intro (≤150 words)**

```
Welcome to Futoshiki.

If you enjoy sudoku, you'll feel at home here. Futoshiki is a
Japanese puzzle of Latin squares — fill the grid with the numbers
1 through N so that no number repeats in any row or column.

The twist is the inequalities: the little arrows between cells
("<" and ">") tell you which neighbor is greater.

This volume starts gentle and gets gradually trickier. The 5×5
warm-ups are friendly, the 8×8 challenges will keep you company
through a long afternoon. Take your time, and welcome aboard.

— Pocket Rooster Press
```

- [ ] **Step 2: Write the 2-page how-to-play**

A worked 5×5 example showing one full solve: start state, two reasoning steps, finished grid. Include the key insight: an inequality chain like `1 < a < b < 5` constrains `a, b` to `{2,3,4}`.

Write as plain prose with ASCII grid diagrams. ~400 words total, fitting on two pages with diagrams.

- [ ] **Step 3: Write the rules cheat-sheet**

A one-page reference: bullet rules + glyph legend (`<`, `>`, `∧`, `∨`) + grid-size reminder.

- [ ] **Step 4: Commit**

```bash
git add projects/kdp-puzzle-press/src/pocket_rooster_press/themes/data/futoshiki_seniors_v1_*.txt
git commit -m "content: Futoshiki Seniors V1 intro + how-to-play + cheat-sheet"
```

---

## Phase 4 — Book A: Father's Day Variety

### Task 4.1: Create Book A theme-data wrapper

**Files:**
- Create: `projects/kdp-puzzle-press/src/pocket_rooster_press/themes/fathers_day_dad.py`

- [ ] **Step 1: Write the loader module**

```python
# projects/kdp-puzzle-press/src/pocket_rooster_press/themes/fathers_day_dad.py
"""Loader for Father's Day Dad theme data (quotes + word lists + intro)."""
from __future__ import annotations
from dataclasses import dataclass
from pathlib import Path
import json

_DATA_DIR = Path(__file__).parent / "data"

@dataclass(frozen=True)
class Quote:
    text: str
    attribution: str | None
    category: str

@dataclass(frozen=True)
class WordList:
    name: str
    words: tuple[str, ...]

def load_quotes() -> list[Quote]:
    with (_DATA_DIR / "fathers_day_dad_quotes.json").open() as f:
        data = json.load(f)
    return [Quote(text=q["text"], attribution=q.get("attribution"),
                  category=q["category"])
            for q in data["quotes"]]

def load_word_lists() -> list[WordList]:
    with (_DATA_DIR / "fathers_day_dad_words.json").open() as f:
        data = json.load(f)
    return [WordList(name=l["name"], words=tuple(l["words"]))
            for l in data["lists"]]

def load_intro() -> str:
    return (_DATA_DIR / "fathers_day_dad_intro.txt").read_text(encoding="utf-8")
```

- [ ] **Step 2: Smoke-test**

```bash
cd projects/kdp-puzzle-press
python -c "
from pocket_rooster_press.themes.fathers_day_dad import load_quotes, load_word_lists, load_intro
print(f'{len(load_quotes())} quotes')
print(f'{len(load_word_lists())} word lists')
print(f'intro {len(load_intro())} chars')
"
```

Expected: `25 quotes / 30 word lists / intro ~XXX chars`.

- [ ] **Step 3: Commit**

```bash
git add projects/kdp-puzzle-press/src/pocket_rooster_press/themes/fathers_day_dad.py
git commit -m "feat(themes): fathers_day_dad theme data loader"
```

---

### Task 4.2: Create Book A book module with tests

**Files:**
- Create: `projects/kdp-puzzle-press/src/pocket_rooster_press/books/fathers_day_variety_dad.py`
- Create: `projects/kdp-puzzle-press/tests/test_book_fathers_day_variety_dad.py`

- [ ] **Step 1: Write failing test**

```python
# projects/kdp-puzzle-press/tests/test_book_fathers_day_variety_dad.py
from pathlib import Path
from pypdf import PdfReader

def test_book_a_build(tmp_path):
    from pocket_rooster_press.books.fathers_day_variety_dad import build
    interior, cover = build(output_dir=tmp_path)
    assert interior.exists()
    assert cover.exists()
    reader = PdfReader(str(interior))
    # Target ~108 pages, accept 100-124
    assert 100 <= len(reader.pages) <= 124, f"Page count {len(reader.pages)} out of target range"

def test_book_a_uniqueness_registered(tmp_path):
    from pocket_rooster_press.books.fathers_day_variety_dad import build
    # Build twice in fresh dirs; both should succeed (idempotent generation)
    interior1, _ = build(output_dir=tmp_path / "a")
    interior2, _ = build(output_dir=tmp_path / "b")
    assert interior1 != interior2
```

- [ ] **Step 2: Run, confirm fails**

```bash
pytest tests/test_book_fathers_day_variety_dad.py -v
```

Expected: ImportError.

- [ ] **Step 3: Write the book module**

```python
# projects/kdp-puzzle-press/src/pocket_rooster_press/books/fathers_day_variety_dad.py
"""Father's Day Variety Puzzle Book for Dad — Large Print (8.5x11, ~108 pages).

100+ puzzles across Sudoku, Word Search, Cryptograms, Kakuro.
First multi-puzzle-type book to use the mixed-puzzle assembler.
"""
from __future__ import annotations
from pathlib import Path
from pypdf import PdfReader

from pocket_rooster_press.config import (
    TEMPLATE_85X11_LARGEPRINT, PALETTE_FATHERS_DAY_DAD,
)
from pocket_rooster_press.covers.cover_builder import CoverBuilder, hero_image_for
from pocket_rooster_press.generators.base import Difficulty
from pocket_rooster_press.generators.sudoku import SudokuGenerator
from pocket_rooster_press.generators.word_search import WordSearchGenerator
from pocket_rooster_press.generators.cryptogram import CryptogramGenerator
from pocket_rooster_press.generators.kakuro import KakuroGenerator
from pocket_rooster_press.layout.book_assembler import BookAssembler, BookConfig
from pocket_rooster_press.themes.fathers_day_dad import (
    load_quotes, load_word_lists, load_intro,
)

BOOK_ID = "fathers-day-variety-dad"
TITLE = "Father's Day Puzzle Book for Dad"
SUBTITLE = "Large-Print Sudoku, Word Search, Cryptograms & Kakuro — 100+ Puzzles"

OUTPUT_DIR = Path("output")


def _build_sudoku_block(count_easy: int = 10, count_medium: int = 15,
                        count_hard: int = 10) -> list:
    gen = SudokuGenerator()
    return gen.generate_set({
        Difficulty.EASY: count_easy,
        Difficulty.MEDIUM: count_medium,
        Difficulty.HARD: count_hard,
    })


def _build_word_search_block(word_lists: list) -> dict:
    gen = WordSearchGenerator()
    sections: dict[str, list] = {}
    # 30 puzzles across 30 lists, 1 puzzle per list
    for wl in word_lists[:30]:
        puzzle = gen.generate(Difficulty.MEDIUM, words=list(wl.words))
        sections[wl.name] = sections.get(wl.name, []) + [puzzle]
    return sections


def _build_cryptogram_block(quotes: list) -> list:
    gen = CryptogramGenerator()
    return [gen.generate(Difficulty.EASY, quote=q.text,
                         attribution=q.attribution or "Anonymous")
            for q in quotes[:25]]


def _build_kakuro_block(count: int = 10) -> list:
    gen = KakuroGenerator()
    return gen.generate_set({Difficulty.EASY: 6, Difficulty.MEDIUM: 4})


def build(output_dir: Path = OUTPUT_DIR) -> tuple[Path, Path]:
    quotes = load_quotes()
    word_lists = load_word_lists()
    intro = load_intro()

    config = BookConfig(
        book_id=BOOK_ID,
        title=TITLE,
        template=TEMPLATE_85X11_LARGEPRINT,
        output_dir=output_dir,
        intro_text=intro,
        metadata={"palette": PALETTE_FATHERS_DAY_DAD},
    )
    assembler = BookAssembler(config)

    blocks = [
        {"kind": "sudoku", "title": "Sudoku for Sharp Dads",
         "puzzles": _build_sudoku_block()},
        {"kind": "word_search", "title": "Word Search for Workshop Days",
         "sections": _build_word_search_block(word_lists)},
        {"kind": "cryptogram", "title": "Cryptograms — Quotes Worth Pausing Over",
         "puzzles": _build_cryptogram_block(quotes)},
        {"kind": "kakuro", "title": "Kakuro — For the Adventurous Hours",
         "puzzles": _build_kakuro_block()},
    ]
    interior = assembler.assemble_mixed_puzzle_book(blocks)

    cover_path = output_dir / BOOK_ID / "cover.pdf"
    page_count = len(PdfReader(str(interior)).pages)
    cover_builder = CoverBuilder(
        TEMPLATE_85X11_LARGEPRINT, PALETTE_FATHERS_DAY_DAD, cover_path,
        theme="playful", kind="puzzle",
    )
    cover = cover_builder.build(
        TITLE,
        subtitle=SUBTITLE,
        page_count=page_count,
        series_label="Pocket Rooster Press · Father's Day Edition",
        hero_image_path=hero_image_for(BOOK_ID),
        back_bullets=[
            "100+ large-print puzzles — sudoku, word search, cryptograms, kakuro",
            "Carefully curated dad-humor and fatherly-wisdom cryptogram quotes",
            "A thoughtful Father's Day gift for any dad or grandpa",
            "All solutions in the back of the book",
        ],
    )

    return interior, cover


if __name__ == "__main__":
    interior, cover = build()
    print(f"Interior: {interior}")
    print(f"Cover:    {cover}")
```

- [ ] **Step 4: Generate the cover hero first**

```bash
cd projects/kdp-puzzle-press
python scripts/build_four_grid_hero.py fathers-day-variety-dad
```

Expected: `assets/generated/wraps/fathers-day-variety-dad.png` exists.

- [ ] **Step 5: Run test**

```bash
pytest tests/test_book_fathers_day_variety_dad.py -v
```

Expected: PASS. If page count is out of range, tune block sizes in the helper functions (`_build_sudoku_block` etc.) per the spec's puzzle-count fallback levers (drop word search to 28; drop sudoku-hard to 8).

- [ ] **Step 6: Commit**

```bash
git add projects/kdp-puzzle-press/src/pocket_rooster_press/books/fathers_day_variety_dad.py \
        projects/kdp-puzzle-press/tests/test_book_fathers_day_variety_dad.py
git commit -m "feat(book): Father's Day Variety Puzzle Book for Dad module"
```

---

### Task 4.3: Internal QA pass for Book A

- [ ] **Step 1: Build the production PDF**

```bash
cd projects/kdp-puzzle-press
python -m pocket_rooster_press.books.fathers_day_variety_dad
```

Expected: `output/fathers-day-variety-dad/interior.pdf` and `output/fathers-day-variety-dad/cover.pdf` exist.

- [ ] **Step 2: Page-count check**

```bash
python -c "
from pypdf import PdfReader
r = PdfReader('output/fathers-day-variety-dad/interior.pdf')
print(f'Interior: {len(r.pages)} pages')
"
```

Expected: between 100 and 124 pages, target 108.

- [ ] **Step 3: Visual QA — open the PDF**

Open `output/fathers-day-variety-dad/interior.pdf` and visually verify:
- Title + copyright + intro page
- Divider page "Sudoku for Sharp Dads" with playful palette
- 35 sudoku pages (large print readable)
- Divider page "Word Search for Workshop Days"
- 30 word-search pages, each with word list and grid
- Divider page "Cryptograms"
- ~13 cryptogram pages (2-up)
- Divider page "Kakuro"
- ~5 kakuro pages (2-up)
- Answer key section
- Back matter / about

Open `output/fathers-day-variety-dad/cover.pdf` at 150 DPI and confirm:
- Four-grid collage visible
- "★ Father's Day Edition ★" eyebrow
- Title in playful teal
- All four labels readable below tiles
- Confetti dots scattered

- [ ] **Step 4: Profanity sanity check on word-search letter fills**

```bash
python -c "
import re
from pypdf import PdfReader
from pocket_rooster_press.generators.word_search import _PROFANITY_BLOCKLIST
text = ''
for p in PdfReader('output/fathers-day-variety-dad/interior.pdf').pages:
    text += (p.extract_text() or '')
text_up = re.sub(r'[^A-Z]', '', text.upper())
flagged = [p for p in _PROFANITY_BLOCKLIST if p in text_up]
print('Flagged:', flagged)
assert not flagged, 'Profanity found in interior text!'
print('No profanity in puzzle text.')
"
```

Expected: no flags.

- [ ] **Step 5: Commit a QA-passed marker (optional)**

```bash
git tag book-a-qa-passed
```

---

### Task 4.4: Write Book A metadata JSON

**Files:**
- Create: `projects/kdp-puzzle-press/metadata/fathers_day_variety_dad.json`

- [ ] **Step 1: Copy a sibling metadata file as template**

```bash
cp projects/kdp-puzzle-press/metadata/large_print_sudoku_grandparents.json \
   projects/kdp-puzzle-press/metadata/fathers_day_variety_dad.json
```

- [ ] **Step 2: Edit fields**

Open the file and replace:

| Field | New value |
|---|---|
| `book_id` | `"fathers-day-variety-dad"` |
| `title` | `"Father's Day Puzzle Book for Dad"` |
| `subtitle` | `"Large-Print Sudoku, Word Search, Cryptograms & Kakuro — 100+ Puzzles for Hours of Relaxation"` |
| `series.name` | `"Pocket Rooster Press · Father's Day Editions"` |
| `series.volume` | `1` |
| `bisac` | `[{"code": "GAM015000", "label": "GAMES & ACTIVITIES / Puzzles / General"}, {"code": "GAM011000", "label": "GAMES & ACTIVITIES / Word & Word Search"}, {"code": "NON000000", "label": "HOLIDAYS / Father's Day"}]` (verify exact BISAC codes — Father's Day may not have its own code; use closest available) |
| `kdp_browse_categories` | `["Books > Crafts, Hobbies & Home > Crafts & Hobbies > Games > Puzzles & Games > Activity Books", "Books > Humor & Entertainment > Puzzles & Games > Sudoku"]` |
| `keywords` | `["fathers day gifts from daughter", "fathers day gifts from son", "puzzle book for dad", "large print puzzle book for adults", "sudoku word search cryptogram book", "fathers day gift for grandpa", "activity book for men"]` |
| `pricing.list_prices.amazon_com_USD` | `9.99` |
| `pricing.royalty_plan` | `"60% (Standard)"` |
| `page_count_target` | `108` |

- [ ] **Step 3: Validate JSON parses**

```bash
python -c "
import json
with open('projects/kdp-puzzle-press/metadata/fathers_day_variety_dad.json') as f:
    m = json.load(f)
assert m['book_id'] == 'fathers-day-variety-dad'
print('OK')
"
```

- [ ] **Step 4: Commit**

```bash
git add projects/kdp-puzzle-press/metadata/fathers_day_variety_dad.json
git commit -m "meta: KDP listing metadata for Father's Day Variety Dad"
```

---

## Phase 5 — Book B: Futoshiki Seniors Vol. 1

### Task 5.1: Create Book B theme-data loader

**Files:**
- Create: `projects/kdp-puzzle-press/src/pocket_rooster_press/themes/futoshiki_seniors_v1.py`

- [ ] **Step 1: Write loader**

```python
# projects/kdp-puzzle-press/src/pocket_rooster_press/themes/futoshiki_seniors_v1.py
"""Loader for Futoshiki Seniors V1 theme data."""
from __future__ import annotations
from pathlib import Path

_DATA_DIR = Path(__file__).parent / "data"

def load_intro() -> str:
    return (_DATA_DIR / "futoshiki_seniors_v1_intro.txt").read_text(encoding="utf-8")

def load_howto() -> str:
    return (_DATA_DIR / "futoshiki_seniors_v1_howto.txt").read_text(encoding="utf-8")

def load_cheatsheet() -> str:
    return (_DATA_DIR / "futoshiki_seniors_v1_cheatsheet.txt").read_text(encoding="utf-8")
```

- [ ] **Step 2: Smoke-test**

```bash
python -c "
from pocket_rooster_press.themes.futoshiki_seniors_v1 import load_intro, load_howto, load_cheatsheet
print(f'intro={len(load_intro())} howto={len(load_howto())} cheat={len(load_cheatsheet())}')
"
```

- [ ] **Step 3: Commit**

```bash
git add projects/kdp-puzzle-press/src/pocket_rooster_press/themes/futoshiki_seniors_v1.py
git commit -m "feat(themes): futoshiki_seniors_v1 content loader"
```

---

### Task 5.2: Create Book B book module with tests

**Files:**
- Create: `projects/kdp-puzzle-press/src/pocket_rooster_press/books/futoshiki_seniors_v1.py`
- Create: `projects/kdp-puzzle-press/tests/test_book_futoshiki_seniors_v1.py`

- [ ] **Step 1: Write failing test**

```python
# projects/kdp-puzzle-press/tests/test_book_futoshiki_seniors_v1.py
from pathlib import Path
from pypdf import PdfReader

def test_book_b_build(tmp_path):
    from pocket_rooster_press.books.futoshiki_seniors_v1 import build
    interior, cover = build(output_dir=tmp_path)
    assert interior.exists()
    assert cover.exists()
    pages = len(PdfReader(str(interior)).pages)
    assert 100 <= pages <= 124, f"Page count {pages} out of target range"

def test_book_b_puzzle_uniqueness(tmp_path):
    """Every Futoshiki puzzle in the book should have a distinct fingerprint."""
    from pocket_rooster_press.books.futoshiki_seniors_v1 import _generate_all_puzzles
    from pocket_rooster_press.registry import fingerprint_futoshiki
    puzzles = _generate_all_puzzles()
    fps = set()
    for p in puzzles:
        fp = fingerprint_futoshiki(p.content.size, p.content.givens,
                                   p.content.inequalities)
        assert fp not in fps, f"Duplicate puzzle: {fp}"
        fps.add(fp)
    assert len(fps) == len(puzzles)
```

- [ ] **Step 2: Run, confirm fails**

```bash
pytest tests/test_book_futoshiki_seniors_v1.py -v
```

Expected: ImportError.

- [ ] **Step 3: Write the book module**

```python
# projects/kdp-puzzle-press/src/pocket_rooster_press/books/futoshiki_seniors_v1.py
"""Futoshiki Large Print for Seniors, Vol. 1 (8.5x11, ~108 pages).

120 puzzles graded 5x5 -> 8x8. First Futoshiki book in the catalog;
establishes the series for Vol. 2.
"""
from __future__ import annotations
from pathlib import Path
from pypdf import PdfReader

from pocket_rooster_press.config import (
    TEMPLATE_85X11_LARGEPRINT, PALETTE_FUTOSHIKI,
)
from pocket_rooster_press.covers.cover_builder import CoverBuilder, hero_image_for
from pocket_rooster_press.generators.base import Difficulty
from pocket_rooster_press.generators.futoshiki import FutoshikiGenerator
from pocket_rooster_press.layout.book_assembler import BookAssembler, BookConfig
from pocket_rooster_press.themes.futoshiki_seniors_v1 import (
    load_intro, load_howto, load_cheatsheet,
)

BOOK_ID = "futoshiki-seniors-v1"
TITLE = "Futoshiki Large Print for Seniors"
SUBTITLE = "120 Number-Logic Puzzles to Sharpen the Mind — Volume 1"

OUTPUT_DIR = Path("output")


def _generate_all_puzzles() -> list:
    gen = FutoshikiGenerator()
    puzzles: list = []
    sections = [
        {"size": 5, "count": 30, "difficulty": Difficulty.EASY},
        {"size": 6, "count": 40, "difficulty": Difficulty.EASY},
        {"size": 7, "count": 30, "difficulty": Difficulty.MEDIUM},
        {"size": 8, "count": 20, "difficulty": Difficulty.HARD},
    ]
    seed = 1
    for s in sections:
        for sym in range(s["count"]):
            p = gen.generate(s["difficulty"], seed=seed,
                            size=s["size"], symmetry_seed=sym % 8)
            puzzles.append(p)
            seed += 1
    return puzzles


def build(output_dir: Path = OUTPUT_DIR) -> tuple[Path, Path]:
    intro = load_intro() + "\n\n" + load_howto() + "\n\n" + load_cheatsheet()
    puzzles = _generate_all_puzzles()

    config = BookConfig(
        book_id=BOOK_ID,
        title=TITLE,
        template=TEMPLATE_85X11_LARGEPRINT,
        output_dir=output_dir,
        intro_text=intro,
        metadata={"palette": PALETTE_FUTOSHIKI},
    )
    assembler = BookAssembler(config)
    interior = assembler.assemble_futoshiki_book(
        puzzles,
        section_titles=["Warm-up · 5x5", "Steady · 6x6",
                        "Sharpen · 7x7", "Challenge · 8x8"],
        section_boundaries=[30, 70, 100, 120],
        puzzles_per_page=1,  # multi-up handled inside builder by size if needed
    )

    cover_path = output_dir / BOOK_ID / "cover.pdf"
    page_count = len(PdfReader(str(interior)).pages)
    cover_builder = CoverBuilder(
        TEMPLATE_85X11_LARGEPRINT, PALETTE_FUTOSHIKI, cover_path,
        theme="playful", kind="puzzle",
    )
    cover = cover_builder.build(
        TITLE,
        subtitle=SUBTITLE,
        page_count=page_count,
        series_label="Pocket Rooster Press · Large Print",
        hero_image_path=hero_image_for(BOOK_ID),
        back_bullets=[
            "120 Futoshiki puzzles graded easy to hard, 5x5 to 8x8",
            "Generous large print designed for senior readers",
            "Full how-to-play with worked example — beginners welcome",
            "All solutions in the back of the book",
        ],
    )

    return interior, cover


if __name__ == "__main__":
    interior, cover = build()
    print(f"Interior: {interior}")
    print(f"Cover:    {cover}")
```

- [ ] **Step 4: Generate the cover hero**

The single-grid hero uses the existing `build_real_grid_hero.py` script. If that script doesn't yet know about Futoshiki book IDs, add a Futoshiki branch:

```bash
cd projects/kdp-puzzle-press
python scripts/build_real_grid_hero.py futoshiki-seniors-v1
```

If the script errors with `unknown niche`, edit `scripts/build_real_grid_hero.py` to add a `futoshiki-seniors-v1` entry in the `NICHES` dict (use `{"trace_color": CORAL, "confetti_palette": [BRASS, CORAL, INK_TEAL]}`) and add a render path that calls a new `render_futoshiki_tile` (which you'll need to add to `grid_tiles.py` — it's the only puzzle type that doesn't have a tile renderer yet, by parallel to the other types).

- [ ] **Step 5: Run test**

```bash
pytest tests/test_book_futoshiki_seniors_v1.py -v
```

Expected: both tests PASS.

- [ ] **Step 6: Commit**

```bash
git add projects/kdp-puzzle-press/src/pocket_rooster_press/books/futoshiki_seniors_v1.py \
        projects/kdp-puzzle-press/tests/test_book_futoshiki_seniors_v1.py \
        projects/kdp-puzzle-press/src/pocket_rooster_press/covers/grid_tiles.py \
        projects/kdp-puzzle-press/scripts/build_real_grid_hero.py
git commit -m "feat(book): Futoshiki Seniors V1 module + Futoshiki tile renderer"
```

---

### Task 5.3: Internal QA pass for Book B

- [ ] **Step 1: Build the production PDF**

```bash
cd projects/kdp-puzzle-press
python -m pocket_rooster_press.books.futoshiki_seniors_v1
```

- [ ] **Step 2: Page-count check**

```bash
python -c "
from pypdf import PdfReader
r = PdfReader('output/futoshiki-seniors-v1/interior.pdf')
print(f'Interior: {len(r.pages)} pages')
"
```

Expected: 100–124, target 108.

- [ ] **Step 3: Visual QA**

Open `output/futoshiki-seniors-v1/interior.pdf` and verify:
- Title, copyright, intro
- 2-page how-to-play with worked example
- 1-page rules cheat-sheet
- Section divider "Warm-up · 5x5"
- 30 warm-up puzzles (consider 4-up layout if pages overshoot)
- Divider "Steady · 6x6"
- 40 steady puzzles
- Divider "Sharpen · 7x7"
- 30 sharpen puzzles
- Divider "Challenge · 8x8"
- 20 challenge puzzles
- Answer key — every puzzle's solution rendered

Open cover and verify single playful-themed Futoshiki hero with inequality glyphs visible.

- [ ] **Step 4: Validate every puzzle's solution is correct**

```bash
python -c "
from pocket_rooster_press.books.futoshiki_seniors_v1 import _generate_all_puzzles
from pocket_rooster_press.generators.futoshiki import FutoshikiGenerator
gen = FutoshikiGenerator()
puzzles = _generate_all_puzzles()
for i, p in enumerate(puzzles, 1):
    assert gen.validate(p), f'Puzzle #{i} failed validation'
print(f'All {len(puzzles)} puzzles validate.')
"
```

Expected: all 120 puzzles validate.

- [ ] **Step 5: Tag**

```bash
git tag book-b-qa-passed
```

---

### Task 5.4: Write Book B metadata JSON

**Files:**
- Create: `projects/kdp-puzzle-press/metadata/futoshiki_seniors_v1.json`

- [ ] **Step 1: Copy sibling as template**

```bash
cp projects/kdp-puzzle-press/metadata/large_print_sudoku_grandparents.json \
   projects/kdp-puzzle-press/metadata/futoshiki_seniors_v1.json
```

- [ ] **Step 2: Edit fields**

| Field | Value |
|---|---|
| `book_id` | `"futoshiki-seniors-v1"` |
| `title` | `"Futoshiki Large Print for Seniors"` |
| `subtitle` | `"120 Number-Logic Puzzles to Sharpen the Mind — Volume 1"` |
| `series.name` | `"Futoshiki Large Print for Seniors"` |
| `series.volume` | `1` |
| `bisac` | `[{"code": "GAM015000", "label": "GAMES & ACTIVITIES / Puzzles / Logic"}, {"code": "GAM006000", "label": "GAMES & ACTIVITIES / Sudoku"}]` |
| `kdp_browse_categories` | `["Books > Humor & Entertainment > Puzzles & Games > Logic & Brain Teasers", "Books > Health, Fitness & Dieting > Aging"]` |
| `keywords` | `["futoshiki puzzle book", "large print logic puzzles for seniors", "brain games for seniors", "number puzzles large print", "latin square puzzles", "logic puzzle book large print", "sudoku alternative puzzle book"]` |
| `pricing.list_prices.amazon_com_USD` | `9.99` |
| `page_count_target` | `108` |

- [ ] **Step 3: Validate**

```bash
python -c "
import json
with open('projects/kdp-puzzle-press/metadata/futoshiki_seniors_v1.json') as f:
    m = json.load(f)
assert m['book_id'] == 'futoshiki-seniors-v1'
print('OK')
"
```

- [ ] **Step 4: Commit**

```bash
git add projects/kdp-puzzle-press/metadata/futoshiki_seniors_v1.json
git commit -m "meta: KDP listing metadata for Futoshiki Seniors V1"
```

---

## Phase 6 — Final QA + Release

These are manual steps the engineer performs after all code/content tasks pass. Not TDD, just a checklist.

### Task 6.1: Run the full test suite

- [ ] **Step 1: Run all tests**

```bash
cd projects/kdp-puzzle-press
pytest -v
```

Expected: ALL tests PASS, no skips, no warnings about deprecated patterns.

- [ ] **Step 2: Run linter / type checker if the project has one**

Check `pyproject.toml` for `ruff`/`mypy`/`pylint`. If present:

```bash
ruff check .
mypy src
```

Fix any new issues introduced by these changes.

- [ ] **Step 3: Tag**

```bash
git tag may-release-pair-qa-passed
```

---

### Task 6.2: KDP upload checklist (manual, owner-driven)

This is not engineering work. The plan's job ends with the QA-passed tag; the human owner then performs:

**For each book:**
1. Log into KDP at https://kdp.amazon.com
2. Click "Create paperback"
3. Enter title, subtitle, author = "Pocket Rooster Press", series fields per metadata JSON
4. Enter description (build from metadata's intro + key bullets; ~4000 chars max)
5. Enter 7 keywords per metadata JSON
6. Select 2 browse categories per metadata JSON
7. Set "Adult content" = No
8. Upload interior PDF (`output/<book_id>/interior.pdf`)
9. Upload cover PDF (`output/<book_id>/cover.pdf`)
10. Preview — confirm bleed, spine width, page count match what KDP calculated
11. Set US price $9.99 (royalty plan: 60% Standard, Expanded Distribution: Off)
12. Submit for review

**Deadlines:**
- Book A: live by May 23
- Book B: live by May 28

**Post-launch:**
- Monitor Author Central for review notifications
- Launch PPC at $10–20/day per book starting on live date

---

## Spike Results (filled in during Phase 0)

```
S1 outcome: (C) — No section-page rendering exists at all; _draw_text_page is used inline in build_sudoku_book for difficulty intros but there is no _draw_section_header, _draw_section_divider, or any public/private method for section divider pages.
Decision: scope expands to full impl — Task 1.5 builds render_section_divider from scratch (estimated <1 day).
S2 outcome: TBD (write during execution)
S3 outcome: TBD (write during execution)
```

---

## Plan completion criteria

All of the following true:

- [ ] Phase 0 spikes ran, results recorded
- [ ] All `pytest` tests pass (Phases 1, 2, 4.2, 5.2)
- [ ] `output/fathers-day-variety-dad/interior.pdf` and `cover.pdf` exist and pass visual QA
- [ ] `output/futoshiki-seniors-v1/interior.pdf` and `cover.pdf` exist and pass visual QA
- [ ] `metadata/fathers_day_variety_dad.json` and `metadata/futoshiki_seniors_v1.json` parse as valid JSON and match the canonical schema
- [ ] Page counts in target range (100–124, ideally 108)
- [ ] No profanity in interior word-search fills
- [ ] All 120 Futoshiki puzzles validate via `gen.validate(p)`
- [ ] No duplicate fingerprints across the new books or against existing published catalog
- [ ] Git tag `may-release-pair-qa-passed` set
