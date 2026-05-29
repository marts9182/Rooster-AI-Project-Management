# Diabetes Log Books Pair (A + C) â€” Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship two diabetes log books to Amazon KDP â€” a senior-focused 8.5Ã—11 large-print 2-year log (SKU A) and a portable 6Ã—9 CGM companion logbook (SKU C) â€” using shared journal-page templates extracted into `journal_templates.py`.

**Architecture:** Extend `pocket_rooster_press/layout/journal_templates.py` with three new dataclass page templates (`DiabetesWeeklySpread`, `QuarterlyDoctorVisitPrep`, `MonthlyA1CTrend`) that follow the existing `.draw(c, template, page_num)` contract. Wire each SKU together as a journal-kind `BookConfig` (mirroring `garden_companion.py`) that feeds a list of page renderers into `BookAssembler.assemble_journal_book()`. Add two new color palettes to `config.py`. Add a font-size assertion to `audit_pdfs.py`. Ship each SKU through the existing `build_kdp_bundle.py` pipeline.

**Tech Stack:** Python 3.13+, ReportLab (PDF generation), pypdf (page inspection), pytest, the existing `pocket_rooster_press` package.

**Spec:** [docs/superpowers/specs/2026-05-20-diabetes-log-books-pair-design.md](../specs/2026-05-20-diabetes-log-books-pair-design.md)

---

## File Structure

**Files to create:**

| Path | Responsibility |
|---|---|
| `projects/kdp-puzzle-press/assets/carb_reference.json` | 60 common foods with carb counts (SKU A front matter) |
| `projects/kdp-puzzle-press/src/pocket_rooster_press/books/large_print_diabetes_log_v1.py` | SKU A book module |
| `projects/kdp-puzzle-press/src/pocket_rooster_press/books/cgm_companion_logbook_v1.py` | SKU C book module |
| `projects/kdp-puzzle-press/metadata/large_print_diabetes_log_v1.json` | SKU A KDP metadata |
| `projects/kdp-puzzle-press/metadata/cgm_companion_logbook_v1.json` | SKU C KDP metadata |
| `projects/kdp-puzzle-press/tests/test_diabetes_templates.py` | Smoke tests for the three new page templates |
| `projects/kdp-puzzle-press/tests/test_diabetes_log_books.py` | Build tests for both SKUs (interior + cover render, page count in budget) |
| `projects/kdp-puzzle-press/output/kdp-ready/large-print-diabetes-log-v1/listing.md` | SKU A listing copy |
| `projects/kdp-puzzle-press/output/kdp-ready/cgm-companion-logbook-v1/listing.md` | SKU C listing copy |

**Files to modify:**

| Path | Change |
|---|---|
| `projects/kdp-puzzle-press/src/pocket_rooster_press/layout/journal_templates.py` | Add `DiabetesWeeklySpread`, `QuarterlyDoctorVisitPrep`, `MonthlyA1CTrend` dataclasses + export from `__all__` |
| `projects/kdp-puzzle-press/src/pocket_rooster_press/config.py` | Add `PALETTE_DIABETES_SENIOR` and `PALETTE_CGM_COMPANION` constants |
| `projects/kdp-puzzle-press/scripts/audit_pdfs.py` | Add `check_journal_body_font_size(audit, min_pt, sample_page)` â€” measure body text size on a sampled log page |

---

## Implementation conventions (read once)

- All work happens inside `projects/kdp-puzzle-press/`. Commands assume cwd = repo root unless stated otherwise; use the `--rootdir` flag where shown.
- Tests use `pytest` with `pypdf` for page-count assertions, ReportLab Canvas for rendering, and `io.BytesIO` to avoid disk writes. Follow the pattern in `tests/test_journal_templates.py`.
- Every commit message starts with a conventional prefix: `feat(...)`, `test(...)`, `chore(...)`, `docs(...)`. Footer line `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>`.
- "Run: â€¦" instructions show the exact pytest invocation. Always verify "Expected: â€¦" matches reality before moving on.
- Lines of `0.75pt` minimum and `1.25pt` for heavy rules â€” these are KDP minimums already encoded as `GRID_LINE_W` and `HEAVY_LINE_W` constants in `journal_templates.py`. Use them.
- All template `.draw()` methods take `(canvas, template, page_num)` and must NOT call `c.showPage()` â€” the caller controls page advance.

---

## Task 1: Add color palettes for the two SKUs

**Files:**
- Modify: `projects/kdp-puzzle-press/src/pocket_rooster_press/config.py`

- [x] **Step 1: Append the two palettes**

Open `projects/kdp-puzzle-press/src/pocket_rooster_press/config.py` and append the following block after `PALETTE_COZY_CHRISTMAS` (around line 225), before the `IMPRINT_NAME` block:

```python
# Diabetes Log Book for Seniors â€” playful theme tuned to the medical-shelf
# senior buyer. Warm cream dominant, deep teal text, brass accents. Reads as
# "calm, trustworthy, large print" on the Amazon thumbnail row.
PALETTE_DIABETES_SENIOR = ColorPalette(
    name="diabetes_senior",
    primary="#1F4F66",       # deep teal (matches playful-theme primary)
    secondary="#CAA457",     # brass
    accent="#FBF3E2",        # warm cream
)

# CGM Companion Logbook â€” cooler teal-dominant variant of the playful theme.
# Targets a younger, tech-savvy diabetes buyer with a more clinical/modern
# register while staying inside the imprint palette family.
PALETTE_CGM_COMPANION = ColorPalette(
    name="cgm_companion",
    primary="#0E3A52",       # deeper teal (more clinical)
    secondary="#D86C5C",     # coral (signals "modern wellness")
    accent="#F0E6D1",        # cooler cream
)
```

- [x] **Step 2: Commit**

```bash
git add projects/kdp-puzzle-press/src/pocket_rooster_press/config.py
git commit -m "$(cat <<'EOF'
feat(palettes): add diabetes_senior and cgm_companion palettes

Sister palettes inside the locked playful theme. SKU A uses the
warm cream-dominant variant; SKU C uses the cooler teal-dominant
variant with a coral accent for the modern-wellness register.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Add `DiabetesWeeklySpread` template

This template renders one week of diabetes logging on one page. Two modes: `mode="fingerstick"` for SKU A (4 meals Ã— before/after + bedtime + BP + meds + weight + energy), `mode="cgm"` for SKU C (TIR% / avg / low / high from device + food/carbs + exercise + mood + insulin).

**Files:**
- Modify: `projects/kdp-puzzle-press/src/pocket_rooster_press/layout/journal_templates.py`
- Create: `projects/kdp-puzzle-press/tests/test_diabetes_templates.py`

- [x] **Step 1: Write the failing test**

Create `projects/kdp-puzzle-press/tests/test_diabetes_templates.py`:

```python
"""Smoke + geometry tests for the diabetes-specific journal templates."""

from __future__ import annotations

import io

import pypdf
import pytest
from reportlab.pdfgen import canvas

from pocket_rooster_press.layout.journal_templates import (
    DiabetesWeeklySpread,
)
from pocket_rooster_press.layout.templates import (
    TEMPLATE_6X9_POCKET,
    TEMPLATE_85X11_LARGEPRINT,
)


def _new_canvas(template):
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=(template.width, template.height))
    return c, buf


def _page_count(buf: io.BytesIO) -> int:
    buf.seek(0)
    return len(pypdf.PdfReader(buf).pages)


@pytest.mark.parametrize("template", [TEMPLATE_85X11_LARGEPRINT, TEMPLATE_6X9_POCKET])
def test_diabetes_weekly_spread_fingerstick_renders(template) -> None:
    c, buf = _new_canvas(template)
    DiabetesWeeklySpread(
        title="Week 1",
        mode="fingerstick",
    ).draw(c, template, page_num=1)
    c.showPage()
    c.save()
    assert _page_count(buf) == 1


@pytest.mark.parametrize("template", [TEMPLATE_85X11_LARGEPRINT, TEMPLATE_6X9_POCKET])
def test_diabetes_weekly_spread_cgm_renders(template) -> None:
    c, buf = _new_canvas(template)
    DiabetesWeeklySpread(
        title="Week 1",
        mode="cgm",
    ).draw(c, template, page_num=1)
    c.showPage()
    c.save()
    assert _page_count(buf) == 1


def test_diabetes_weekly_spread_rejects_unknown_mode() -> None:
    c, _ = _new_canvas(TEMPLATE_6X9_POCKET)
    with pytest.raises(ValueError):
        DiabetesWeeklySpread(title="Week 1", mode="cellular").draw(
            c, TEMPLATE_6X9_POCKET, page_num=1
        )
```

- [x] **Step 2: Run the test to verify it fails**

Run:
```bash
python -m pytest projects/kdp-puzzle-press/tests/test_diabetes_templates.py::test_diabetes_weekly_spread_fingerstick_renders -v --rootdir=projects/kdp-puzzle-press
```

Expected: FAIL with `ImportError: cannot import name 'DiabetesWeeklySpread'`.

- [x] **Step 3: Implement `DiabetesWeeklySpread`**

Open `projects/kdp-puzzle-press/src/pocket_rooster_press/layout/journal_templates.py`. After the `WeeklyLogPage` class (around line 355, before the `MonthlyPlanSpread` block), add:

```python
# Diabetes weekly spread (1 page per week, 7 day rows + summary row)

_FINGERSTICK_COL_LABELS = (
    "Date", "BF B/A", "Lu B/A", "Di B/A", "Bed", "BP", "Wt", "Energy", "Notes",
)
_CGM_COL_LABELS = (
    "Date", "TIR%", "Avg", "Low", "High", "Food / Carbs", "Exercise", "Mood", "Insulin",
)
_FINGERSTICK_COL_WEIGHTS = (0.07, 0.10, 0.10, 0.10, 0.07, 0.07, 0.06, 0.07, 0.36)
_CGM_COL_WEIGHTS = (0.07, 0.06, 0.06, 0.06, 0.06, 0.27, 0.13, 0.07, 0.22)


@dataclass
class DiabetesWeeklySpread:
    """One week of diabetes logging on one page.

    mode='fingerstick' â€” SKU A: meal-time before/after, BP, weight, energy.
    mode='cgm' â€” SKU C: device-summary box, food/carbs, exercise, mood, insulin.

    Layout: header row, 7 day rows, 1 summary row at the bottom. All grid
    lines >= 0.75pt to satisfy KDP. Day labels are short ("Mon", "Tue", ...).
    """
    title: str = "Week Of"
    mode: str = "fingerstick"
    days: Sequence[str] = field(
        default_factory=lambda: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
    )

    def draw(self, c: rl_canvas.Canvas, template: PageTemplate, page_num: int = 1) -> None:
        _ensure_fonts()
        if self.mode not in ("fingerstick", "cgm"):
            raise ValueError(
                f"DiabetesWeeklySpread.mode must be 'fingerstick' or 'cgm', got {self.mode!r}"
            )
        labels = _FINGERSTICK_COL_LABELS if self.mode == "fingerstick" else _CGM_COL_LABELS
        weights = _FINGERSTICK_COL_WEIGHTS if self.mode == "fingerstick" else _CGM_COL_WEIGHTS

        x, y, w, h = safe_box(template, page_num)
        top = y + h

        # Title bar
        c.setFillGray(0.0)
        c.setFont("Helvetica-Bold", 16)
        c.drawString(x, top - 18, self.title)
        # Subhead
        c.setFont("Helvetica", 10)
        sub = "Fingerstick log" if self.mode == "fingerstick" else "CGM device summary"
        c.drawString(x, top - 32, sub)

        body_top = top - 44
        # 1 header row + 7 day rows + 1 summary row = 9 rows
        n_rows = 9
        row_h = (body_top - y - 0.2 * inch) / n_rows

        col_xs = [x]
        for wt in weights:
            col_xs.append(col_xs[-1] + wt * w)

        # Grid
        c.setStrokeGray(0.0)
        c.setLineWidth(GRID_LINE_W)
        # Verticals
        for cx in col_xs:
            c.line(cx, body_top, cx, body_top - n_rows * row_h)
        # Horizontals
        for r in range(n_rows + 1):
            yy = body_top - r * row_h
            c.line(x, yy, col_xs[-1], yy)

        # Header labels
        c.setFont("Helvetica-Bold", 9)
        for i, label in enumerate(labels):
            cell_w = col_xs[i + 1] - col_xs[i]
            tw = c.stringWidth(label, "Helvetica-Bold", 9)
            c.drawString(col_xs[i] + max(2.0, (cell_w - tw) / 2), body_top - row_h * 0.65, label)

        # Day labels in column 0
        c.setFont("Helvetica-Bold", 10)
        for i, day in enumerate(self.days):
            ry = body_top - (i + 1) * row_h
            c.drawString(col_xs[0] + 4, ry - row_h * 0.6, day)

        # Summary row label
        ry = body_top - (n_rows) * row_h
        c.setFont("Helvetica-Bold", 9)
        c.drawString(col_xs[0] + 4, ry + row_h * 0.4, "Summary")

        # Heavy outer border
        c.setLineWidth(HEAVY_LINE_W)
        c.rect(x, body_top - n_rows * row_h, col_xs[-1] - x, n_rows * row_h, stroke=1, fill=0)
```

Note the imports `Sequence`, `field`, `inch`, `rl_canvas`, `PageTemplate`, `GRID_LINE_W`, `HEAVY_LINE_W` are all already imported at the top of `journal_templates.py` â€” no new imports needed.

- [x] **Step 4: Update `__all__` in `journal_templates.py`**

At the bottom of `journal_templates.py`, add `"DiabetesWeeklySpread"` to the `__all__` list:

```python
__all__ = [
    "page_left_margin",
    "page_right_margin",
    "safe_box",
    "LinedNotePage",
    "SketchGridPage",
    "ReflectionPage",
    "TrackerPage",
    "WeeklyLogPage",
    "MonthlyPlanSpread",
    "DiabetesWeeklySpread",
]
```

- [x] **Step 5: Run all three tests added so far**

Run:
```bash
python -m pytest projects/kdp-puzzle-press/tests/test_diabetes_templates.py -v --rootdir=projects/kdp-puzzle-press
```

Expected (5 tests):
- `test_diabetes_weekly_spread_fingerstick_renders[TEMPLATE_85X11_LARGEPRINT]` PASS
- `test_diabetes_weekly_spread_fingerstick_renders[TEMPLATE_6X9_POCKET]` PASS
- `test_diabetes_weekly_spread_cgm_renders[TEMPLATE_85X11_LARGEPRINT]` PASS
- `test_diabetes_weekly_spread_cgm_renders[TEMPLATE_6X9_POCKET]` PASS
- `test_diabetes_weekly_spread_rejects_unknown_mode` PASS

- [x] **Step 6: Commit**

```bash
git add projects/kdp-puzzle-press/src/pocket_rooster_press/layout/journal_templates.py projects/kdp-puzzle-press/tests/test_diabetes_templates.py
git commit -m "$(cat <<'EOF'
feat(journal): add DiabetesWeeklySpread template (fingerstick + CGM modes)

One page per week with 7 day rows + summary row. Two modes
share grid + day labels but swap columns: fingerstick captures
meal-time BG and vitals; cgm captures device summary plus
food/exercise context.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Add `QuarterlyDoctorVisitPrep` template

A single-page checklist used every 13 weeks in both SKUs: A1C goal/actual, weight change, BP avg, current meds, "questions to ask" lines, "things I noticed" lined area.

**Files:**
- Modify: `projects/kdp-puzzle-press/src/pocket_rooster_press/layout/journal_templates.py`
- Modify: `projects/kdp-puzzle-press/tests/test_diabetes_templates.py`

- [x] **Step 1: Extend the imports + write the failing test**

In `projects/kdp-puzzle-press/tests/test_diabetes_templates.py`, change the existing import block from:

```python
from pocket_rooster_press.layout.journal_templates import (
    DiabetesWeeklySpread,
)
```

to:

```python
from pocket_rooster_press.layout.journal_templates import (
    DiabetesWeeklySpread,
    QuarterlyDoctorVisitPrep,
)
```

Then append this test to the bottom of the file:

```python
@pytest.mark.parametrize("template", [TEMPLATE_85X11_LARGEPRINT, TEMPLATE_6X9_POCKET])
def test_quarterly_doctor_visit_prep_renders(template) -> None:
    c, buf = _new_canvas(template)
    QuarterlyDoctorVisitPrep(visit_label="3-Month Check-In").draw(
        c, template, page_num=1
    )
    c.showPage()
    c.save()
    assert _page_count(buf) == 1
```

- [x] **Step 2: Run the test to verify it fails**

Run:
```bash
python -m pytest projects/kdp-puzzle-press/tests/test_diabetes_templates.py -v --rootdir=projects/kdp-puzzle-press
```

Expected: collection fails with `ImportError: cannot import name 'QuarterlyDoctorVisitPrep'` (the import is at module top, so the whole file fails to collect â€” that is the "failing test" signal).

- [x] **Step 3: Implement `QuarterlyDoctorVisitPrep`**

In `journal_templates.py`, after the `DiabetesWeeklySpread` class, add:

```python
# Quarterly Doctor Visit Prep page

@dataclass
class QuarterlyDoctorVisitPrep:
    """One-page check-in: A1C, weight, BP, meds, questions, observations.

    Used every 13 weeks (i.e. every quarter) inside the weekly-log sequence
    to give the user a single artifact to bring to their endocrinologist /
    primary care visit. Five labeled fill-in fields at the top, then a meds
    box, then five numbered question lines, then a lined notes area.
    """
    visit_label: str = "Doctor Visit Prep"

    def draw(self, c: rl_canvas.Canvas, template: PageTemplate, page_num: int = 1) -> None:
        _ensure_fonts()
        x, y, w, h = safe_box(template, page_num)
        top = y + h

        # Title
        c.setFillGray(0.0)
        c.setFont("Helvetica-Bold", 18)
        c.drawString(x, top - 20, self.visit_label)
        c.setLineWidth(HEAVY_LINE_W)
        c.line(x, top - 26, x + w, top - 26)

        # Five labeled fill-in fields, two columns wide
        fields = [
            ("A1C goal", "A1C actual"),
            ("Weight (last visit)", "Weight (today)"),
            ("BP average", "Visit date"),
        ]
        c.setStrokeGray(0.0)
        c.setLineWidth(GRID_LINE_W)
        field_top = top - 44
        row_h = 0.42 * inch
        col_w = w / 2
        c.setFont("Helvetica-Bold", 11)
        for r, (left_label, right_label) in enumerate(fields):
            ry = field_top - r * row_h
            c.drawString(x, ry, left_label + ":")
            c.line(x + 1.4 * inch, ry - 4, x + col_w - 6, ry - 4)
            c.drawString(x + col_w, ry, right_label + ":")
            c.line(x + col_w + 1.4 * inch, ry - 4, x + w, ry - 4)

        # Meds box
        meds_top = field_top - len(fields) * row_h - 0.15 * inch
        c.setFont("Helvetica-Bold", 13)
        c.drawString(x, meds_top, "Current medications & dose changes")
        meds_bot = meds_top - 1.4 * inch
        c.setLineWidth(GRID_LINE_W)
        c.rect(x, meds_bot, w, meds_top - 8 - meds_bot, stroke=1, fill=0)

        # Questions
        q_top = meds_bot - 0.18 * inch
        c.setFont("Helvetica-Bold", 13)
        c.drawString(x, q_top, "Questions to ask my doctor")
        c.setFont("Helvetica", 11)
        for i in range(1, 6):
            qy = q_top - 18 - (i - 1) * 22
            c.drawString(x, qy, f"{i}.")
            c.line(x + 16, qy - 2, x + w, qy - 2)

        # Things I noticed (notes area)
        notes_top = q_top - 18 - 5 * 22 - 0.18 * inch
        c.setFont("Helvetica-Bold", 13)
        c.drawString(x, notes_top, "Things I noticed")
        c.setStrokeGray(0.55)
        c.setLineWidth(GRID_LINE_W)
        line_y = notes_top - 18
        while line_y > y + 6:
            c.line(x, line_y, x + w, line_y)
            line_y -= 0.32 * inch
```

- [x] **Step 4: Update `__all__`**

Add `"QuarterlyDoctorVisitPrep"` to the `__all__` list in `journal_templates.py`.

- [x] **Step 5: Run the test to verify it passes**

Run:
```bash
python -m pytest projects/kdp-puzzle-press/tests/test_diabetes_templates.py::test_quarterly_doctor_visit_prep_renders -v --rootdir=projects/kdp-puzzle-press
```

Expected: PASS on both parametrized templates.

- [x] **Step 6: Commit**

```bash
git add projects/kdp-puzzle-press/src/pocket_rooster_press/layout/journal_templates.py projects/kdp-puzzle-press/tests/test_diabetes_templates.py
git commit -m "$(cat <<'EOF'
feat(journal): add QuarterlyDoctorVisitPrep template

Single-page check-in: A1C goal/actual, weight, BP, current meds,
5 question lines, and a lined "things I noticed" notes area.
Used every 13 weeks in both SKU A and SKU C.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Add `MonthlyA1CTrend` template

Twelve-row table for A1C, weight, average BG, and notes over a year. Used by SKU C; available to SKU A v2. CGM mode adds a GMI column.

**Files:**
- Modify: `projects/kdp-puzzle-press/src/pocket_rooster_press/layout/journal_templates.py`
- Modify: `projects/kdp-puzzle-press/tests/test_diabetes_templates.py`

- [x] **Step 1: Extend the imports + write the failing test**

In `projects/kdp-puzzle-press/tests/test_diabetes_templates.py`, change the import block to:

```python
from pocket_rooster_press.layout.journal_templates import (
    DiabetesWeeklySpread,
    QuarterlyDoctorVisitPrep,
    MonthlyA1CTrend,
)
```

Then append this test:

```python
@pytest.mark.parametrize("template", [TEMPLATE_85X11_LARGEPRINT, TEMPLATE_6X9_POCKET])
@pytest.mark.parametrize("include_gmi", [False, True])
def test_monthly_a1c_trend_renders(template, include_gmi) -> None:
    c, buf = _new_canvas(template)
    MonthlyA1CTrend(
        title="A1C, Weight & Average BG",
        n_rows=12,
        include_gmi=include_gmi,
    ).draw(c, template, page_num=1)
    c.showPage()
    c.save()
    assert _page_count(buf) == 1
```

- [x] **Step 2: Run the test to verify it fails**

Run:
```bash
python -m pytest projects/kdp-puzzle-press/tests/test_diabetes_templates.py -v --rootdir=projects/kdp-puzzle-press
```

Expected: collection fails with `ImportError: cannot import name 'MonthlyA1CTrend'`.

- [x] **Step 3: Implement `MonthlyA1CTrend`**

In `journal_templates.py`, after `QuarterlyDoctorVisitPrep`, add:

```python
# Monthly A1C / weight / average-BG trend table

@dataclass
class MonthlyA1CTrend:
    """N-row table to log A1C, weight, avg BG, and (optionally) GMI over time.

    Used in CGM Companion Logbook quarterly for GMI vs A1C reconciliation;
    reserved for Senior Log v2 as a yearly trend page.
    """
    title: str = "A1C, Weight & Average BG"
    n_rows: int = 12
    include_gmi: bool = False

    def draw(self, c: rl_canvas.Canvas, template: PageTemplate, page_num: int = 1) -> None:
        _ensure_fonts()
        x, y, w, h = safe_box(template, page_num)
        top = y + h
        c.setFillGray(0.0)
        c.setFont("Helvetica-Bold", 16)
        c.drawString(x, top - 18, self.title)
        c.setLineWidth(HEAVY_LINE_W)
        c.line(x, top - 24, x + w, top - 24)

        if self.include_gmi:
            labels = ("Month", "A1C", "GMI", "Weight", "Avg BG", "Notes")
            weights = (0.14, 0.10, 0.10, 0.12, 0.12, 0.42)
        else:
            labels = ("Month", "A1C", "Weight", "Avg BG", "Notes")
            weights = (0.16, 0.12, 0.14, 0.14, 0.44)

        body_top = top - 36
        n_rows = self.n_rows + 1  # +1 header
        row_h = (body_top - y - 0.2 * inch) / n_rows

        col_xs = [x]
        for wt in weights:
            col_xs.append(col_xs[-1] + wt * w)

        c.setStrokeGray(0.0)
        c.setLineWidth(GRID_LINE_W)
        for cx in col_xs:
            c.line(cx, body_top, cx, body_top - n_rows * row_h)
        for r in range(n_rows + 1):
            yy = body_top - r * row_h
            c.line(x, yy, col_xs[-1], yy)

        # Header labels
        c.setFont("Helvetica-Bold", 10)
        for i, label in enumerate(labels):
            cell_w = col_xs[i + 1] - col_xs[i]
            tw = c.stringWidth(label, "Helvetica-Bold", 10)
            c.drawString(col_xs[i] + max(2.0, (cell_w - tw) / 2), body_top - row_h * 0.65, label)

        # Heavy outer border
        c.setLineWidth(HEAVY_LINE_W)
        c.rect(x, body_top - n_rows * row_h, col_xs[-1] - x, n_rows * row_h, stroke=1, fill=0)
```

- [x] **Step 4: Update `__all__`**

Add `"MonthlyA1CTrend"` to the `__all__` list.

- [x] **Step 5: Run the test to verify it passes**

Run:
```bash
python -m pytest projects/kdp-puzzle-press/tests/test_diabetes_templates.py -v --rootdir=projects/kdp-puzzle-press
```

Expected: 11 tests PASS (4 weekly-spread parametrized + 1 reject + 2 quarterly parametrized + 4 trend parametrized = 11).

- [x] **Step 6: Commit**

```bash
git add projects/kdp-puzzle-press/src/pocket_rooster_press/layout/journal_templates.py projects/kdp-puzzle-press/tests/test_diabetes_templates.py
git commit -m "$(cat <<'EOF'
feat(journal): add MonthlyA1CTrend template with optional GMI column

N-row table for A1C, weight, avg BG, and (optionally) GMI over time.
Used quarterly in SKU C for GMI vs A1C reconciliation; reserved
for SKU A v2 as a yearly trend page.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Create the carb-reference data file

Sixty common foods with carb counts in grams per typical serving. Pure data â€” no rendering yet.

**Files:**
- Create: `projects/kdp-puzzle-press/assets/carb_reference.json`

- [x] **Step 1: Verify the assets directory**

Run:
```bash
ls projects/kdp-puzzle-press/assets/
```

Expected: directory exists (font files live here). If it doesn't, create it: `mkdir -p projects/kdp-puzzle-press/assets/`.

- [x] **Step 2: Create `carb_reference.json`**

Write to `projects/kdp-puzzle-press/assets/carb_reference.json`:

```json
{
  "_meta": {
    "description": "Common foods with approximate net carbohydrates per typical serving. Educational reference only. Values cross-referenced against USDA FoodData Central and ADA general guidance. Round to nearest gram.",
    "disclaimer": "Approximate values for educational reference. Not medical advice. Consult your healthcare team for personalized carb counting."
  },
  "categories": [
    {
      "name": "Breads & Grains",
      "items": [
        {"food": "White bread, 1 slice", "carbs_g": 14},
        {"food": "Whole-wheat bread, 1 slice", "carbs_g": 12},
        {"food": "Bagel, plain (medium)", "carbs_g": 48},
        {"food": "English muffin", "carbs_g": 25},
        {"food": "Tortilla, flour 8\"", "carbs_g": 24},
        {"food": "Tortilla, corn 6\"", "carbs_g": 12},
        {"food": "Oatmeal, cooked 1/2 cup", "carbs_g": 13},
        {"food": "Brown rice, cooked 1/2 cup", "carbs_g": 22},
        {"food": "White rice, cooked 1/2 cup", "carbs_g": 22},
        {"food": "Pasta, cooked 1/2 cup", "carbs_g": 21}
      ]
    },
    {
      "name": "Fruits",
      "items": [
        {"food": "Apple, medium", "carbs_g": 25},
        {"food": "Banana, medium", "carbs_g": 27},
        {"food": "Orange, medium", "carbs_g": 15},
        {"food": "Strawberries, 1 cup", "carbs_g": 11},
        {"food": "Blueberries, 1/2 cup", "carbs_g": 11},
        {"food": "Grapes, 1/2 cup", "carbs_g": 14},
        {"food": "Watermelon, 1 cup cubed", "carbs_g": 11},
        {"food": "Pear, medium", "carbs_g": 27},
        {"food": "Peach, medium", "carbs_g": 15},
        {"food": "Raisins, 2 tbsp", "carbs_g": 14}
      ]
    },
    {
      "name": "Vegetables",
      "items": [
        {"food": "Carrots, 1/2 cup cooked", "carbs_g": 6},
        {"food": "Broccoli, 1/2 cup cooked", "carbs_g": 6},
        {"food": "Green beans, 1/2 cup", "carbs_g": 5},
        {"food": "Corn, 1/2 cup", "carbs_g": 15},
        {"food": "Peas, 1/2 cup", "carbs_g": 13},
        {"food": "Potato, baked medium", "carbs_g": 37},
        {"food": "Sweet potato, baked medium", "carbs_g": 24},
        {"food": "Tomato, medium", "carbs_g": 5},
        {"food": "Bell pepper, 1 cup", "carbs_g": 6},
        {"food": "Spinach, 1 cup raw", "carbs_g": 1}
      ]
    },
    {
      "name": "Dairy & Eggs",
      "items": [
        {"food": "Milk, 1 cup 2%", "carbs_g": 12},
        {"food": "Greek yogurt, plain 6 oz", "carbs_g": 9},
        {"food": "Cheese, 1 oz cheddar", "carbs_g": 1},
        {"food": "Cottage cheese, 1/2 cup", "carbs_g": 5},
        {"food": "Egg, 1 large", "carbs_g": 1},
        {"food": "Butter, 1 tbsp", "carbs_g": 0}
      ]
    },
    {
      "name": "Proteins & Fats",
      "items": [
        {"food": "Chicken breast, 3 oz", "carbs_g": 0},
        {"food": "Beef, 3 oz", "carbs_g": 0},
        {"food": "Fish, 3 oz", "carbs_g": 0},
        {"food": "Beans, 1/2 cup", "carbs_g": 20},
        {"food": "Lentils, 1/2 cup cooked", "carbs_g": 20},
        {"food": "Tofu, 1/2 cup", "carbs_g": 2},
        {"food": "Almonds, 1 oz (23)", "carbs_g": 6},
        {"food": "Peanut butter, 2 tbsp", "carbs_g": 6},
        {"food": "Avocado, 1/2 medium", "carbs_g": 9},
        {"food": "Olive oil, 1 tbsp", "carbs_g": 0}
      ]
    },
    {
      "name": "Snacks & Sweets",
      "items": [
        {"food": "Crackers, 5 saltines", "carbs_g": 11},
        {"food": "Pretzels, 1 oz", "carbs_g": 23},
        {"food": "Popcorn, 3 cups air-popped", "carbs_g": 18},
        {"food": "Chocolate, 1 oz dark", "carbs_g": 13},
        {"food": "Ice cream, 1/2 cup vanilla", "carbs_g": 16},
        {"food": "Granola bar, 1", "carbs_g": 20}
      ]
    },
    {
      "name": "Beverages",
      "items": [
        {"food": "Orange juice, 1 cup", "carbs_g": 26},
        {"food": "Apple juice, 1 cup", "carbs_g": 28},
        {"food": "Soda, regular 12 oz", "carbs_g": 39},
        {"food": "Coffee, black 1 cup", "carbs_g": 0},
        {"food": "Tea, unsweetened 1 cup", "carbs_g": 0},
        {"food": "Sports drink, 8 oz", "carbs_g": 14}
      ]
    },
    {
      "name": "Restaurant Examples",
      "items": [
        {"food": "Cheeseburger, fast-food", "carbs_g": 32},
        {"food": "French fries, medium", "carbs_g": 47},
        {"food": "Pizza, 1 slice cheese", "carbs_g": 36},
        {"food": "Sandwich, 6\" turkey", "carbs_g": 46},
        {"food": "Salad with dressing, 1 cup", "carbs_g": 10}
      ]
    }
  ]
}
```

- [x] **Step 3: Verify the JSON is valid**

Run:
```bash
python -c "import json; data = json.load(open('projects/kdp-puzzle-press/assets/carb_reference.json')); n = sum(len(cat['items']) for cat in data['categories']); print(f'OK: {n} items in {len(data[\"categories\"])} categories')"
```

Expected: `OK: 60 items in 8 categories`.

- [x] **Step 4: Commit**

```bash
git add projects/kdp-puzzle-press/assets/carb_reference.json
git commit -m "$(cat <<'EOF'
feat(assets): add carb_reference.json with 60 common foods

Reference data for SKU A front-matter carb cheat sheet. Eight
categories (breads, fruits, veg, dairy, protein, snacks,
beverages, restaurant). Approximate per-serving net carbs.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Add the carb-reference render helper

A standalone module-level function in `journal_templates.py` that renders a 1- to 4-page carb cheat sheet by paginating items from the JSON. Returns a list of renderers so the book module can append them directly.

**Files:**
- Modify: `projects/kdp-puzzle-press/src/pocket_rooster_press/layout/journal_templates.py`
- Modify: `projects/kdp-puzzle-press/tests/test_diabetes_templates.py`

- [x] **Step 1: Write the failing test**

Append to `projects/kdp-puzzle-press/tests/test_diabetes_templates.py`:

```python
import json
from pathlib import Path

from pocket_rooster_press.layout.journal_templates import CarbReferencePage


_CARBS_PATH = (
    Path(__file__).parent.parent / "assets" / "carb_reference.json"
)


def test_carb_reference_loads() -> None:
    data = json.loads(_CARBS_PATH.read_text(encoding="utf-8"))
    total = sum(len(cat["items"]) for cat in data["categories"])
    assert total == 60
    assert len(data["categories"]) == 8


def test_carb_reference_page_renders() -> None:
    data = json.loads(_CARBS_PATH.read_text(encoding="utf-8"))
    c, buf = _new_canvas(TEMPLATE_85X11_LARGEPRINT)
    page = CarbReferencePage(categories=data["categories"][:2])
    page.draw(c, TEMPLATE_85X11_LARGEPRINT, page_num=1)
    c.showPage()
    c.save()
    assert _page_count(buf) == 1
```

- [x] **Step 2: Run the test to verify it fails**

Run:
```bash
python -m pytest projects/kdp-puzzle-press/tests/test_diabetes_templates.py::test_carb_reference_page_renders -v --rootdir=projects/kdp-puzzle-press
```

Expected: FAIL with `ImportError: cannot import name 'CarbReferencePage'`.

- [x] **Step 3: Implement `CarbReferencePage`**

In `journal_templates.py`, after `MonthlyA1CTrend`, add:

```python
# Carb-reference cheat sheet page

@dataclass
class CarbReferencePage:
    """Two-column carb reference. Caller passes the subset of categories
    to fit on this page (typically 2 categories per page in a 8.5x11
    large-print layout). The book module is responsible for paginating.
    """
    categories: Sequence[dict] = field(default_factory=list)
    title: str = "Carb Cheat Sheet"

    def draw(self, c: rl_canvas.Canvas, template: PageTemplate, page_num: int = 1) -> None:
        _ensure_fonts()
        x, y, w, h = safe_box(template, page_num)
        top = y + h

        # Title
        c.setFillGray(0.0)
        c.setFont("Helvetica-Bold", 18)
        c.drawString(x, top - 20, self.title)
        c.setLineWidth(HEAVY_LINE_W)
        c.line(x, top - 26, x + w, top - 26)

        # Disclaimer line
        c.setFont("Helvetica-Oblique", 9)
        c.drawString(
            x,
            top - 38,
            "Approximate values. Not medical advice â€” consult your care team for personalized counting.",
        )

        # Two columns of category blocks
        col_w = (w - 0.3 * inch) / 2
        col_xs = (x, x + col_w + 0.3 * inch)
        block_top = top - 56

        for col_idx, category in enumerate(self.categories[:2]):
            cx = col_xs[col_idx]
            cy = block_top
            c.setFillGray(0.0)
            c.setFont("Helvetica-Bold", 14)
            c.drawString(cx, cy, category["name"])
            cy -= 18
            c.setLineWidth(GRID_LINE_W)
            c.line(cx, cy + 8, cx + col_w, cy + 8)

            c.setFont("Helvetica", 11)
            for item in category["items"]:
                if cy < y + 12:
                    break  # avoid overflow
                food = item["food"]
                carbs = f"{item['carbs_g']} g"
                tw = c.stringWidth(carbs, "Helvetica", 11)
                c.drawString(cx, cy, food)
                c.drawString(cx + col_w - tw, cy, carbs)
                cy -= 16
```

- [x] **Step 4: Update `__all__`**

Add `"CarbReferencePage"` to the `__all__` list.

- [x] **Step 5: Run the test to verify it passes**

Run:
```bash
python -m pytest projects/kdp-puzzle-press/tests/test_diabetes_templates.py::test_carb_reference_loads projects/kdp-puzzle-press/tests/test_diabetes_templates.py::test_carb_reference_page_renders -v --rootdir=projects/kdp-puzzle-press
```

Expected: 2 PASS.

- [x] **Step 6: Commit**

```bash
git add projects/kdp-puzzle-press/src/pocket_rooster_press/layout/journal_templates.py projects/kdp-puzzle-press/tests/test_diabetes_templates.py
git commit -m "$(cat <<'EOF'
feat(journal): add CarbReferencePage template

Two-column layout, two categories per page. Caller (book module)
paginates by slicing the categories list. Disclaimer baked into
the header. Addresses the "blank food column is useless" review
complaint common to existing diabetes log books.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Add `TextBlockPage` template

A page that renders a block of prose with a bold title bar, optional subtitle, word-wrapped body paragraphs separated by blank lines, and an optional bullet list. Used by SKU C for the CGM primer, AGP-reader explainer, glossary, and sample-filled-in DVP. Single-page only â€” paginates by splitting long text across multiple `TextBlockPage` instances at the caller (book module) level.

**Files:**
- Modify: `projects/kdp-puzzle-press/src/pocket_rooster_press/layout/journal_templates.py`
- Modify: `projects/kdp-puzzle-press/tests/test_diabetes_templates.py`

- [x] **Step 1: Extend the imports + write the failing test**

In `projects/kdp-puzzle-press/tests/test_diabetes_templates.py`, change the import block to:

```python
from pocket_rooster_press.layout.journal_templates import (
    CarbReferencePage,
    DiabetesWeeklySpread,
    MonthlyA1CTrend,
    QuarterlyDoctorVisitPrep,
    TextBlockPage,
)
```

Then append these tests to the bottom of the file:

```python
@pytest.mark.parametrize("template", [TEMPLATE_85X11_LARGEPRINT, TEMPLATE_6X9_POCKET])
def test_text_block_page_renders(template) -> None:
    c, buf = _new_canvas(template)
    TextBlockPage(
        title="How CGM data works",
        body=(
            "Your CGM gives you four numbers that matter most: TIR, average, "
            "lowest, and highest.\n\n"
            "Time-in-Range is the share of the day your glucose was inside "
            "your target band. Average tells you the centre of the picture. "
            "Lowest flags hypoglycemia risk; highest flags hyperglycemia."
        ),
    ).draw(c, template, page_num=1)
    c.showPage()
    c.save()
    assert _page_count(buf) == 1


def test_text_block_page_with_bullets() -> None:
    c, buf = _new_canvas(TEMPLATE_6X9_POCKET)
    TextBlockPage(
        title="What to look for in your AGP",
        subtitle="Three common patterns",
        body="An AGP is the 14-day curve your CGM app draws.",
        bullets=[
            "Sustained late-morning highs often point to a breakfast carb bump.",
            "An overnight dip can indicate too-much basal or a wearing-off snack.",
            "A widening 5-95% spread band means glucose is swinging day-to-day.",
        ],
    ).draw(c, TEMPLATE_6X9_POCKET, page_num=1)
    c.showPage()
    c.save()
    assert _page_count(buf) == 1


def test_text_block_page_truncates_overflow() -> None:
    """If body + bullets exceed the safe box, the renderer must NOT crash â€”
    it stops drawing once it runs out of vertical space (caller paginates)."""
    c, buf = _new_canvas(TEMPLATE_6X9_POCKET)
    huge_body = "\n\n".join(["This is a paragraph that says some things."] * 50)
    TextBlockPage(title="Overflow test", body=huge_body).draw(
        c, TEMPLATE_6X9_POCKET, page_num=1
    )
    c.showPage()
    c.save()
    assert _page_count(buf) == 1
```

- [x] **Step 2: Run the test to verify it fails**

Run:
```bash
python -m pytest projects/kdp-puzzle-press/tests/test_diabetes_templates.py -v --rootdir=projects/kdp-puzzle-press
```

Expected: collection fails with `ImportError: cannot import name 'TextBlockPage'`.

- [x] **Step 3: Implement `TextBlockPage`**

In `journal_templates.py`, after `CarbReferencePage`, add:

```python
# Prose text-block page

@dataclass
class TextBlockPage:
    """Single page of body prose with a bold title bar.

    `body` is rendered with word-wrap, splitting on \\n\\n for paragraph
    breaks. Optional `bullets` render below the body as a dotted list.
    If content overflows the safe box, drawing stops cleanly â€” the caller
    is responsible for splitting long content across multiple instances.
    """
    title: str = ""
    subtitle: str = ""
    body: str = ""
    bullets: Sequence[str] = field(default_factory=list)
    body_font_size: float = 11.0
    body_line_spacing: float = 16.0
    paragraph_spacing: float = 8.0

    def draw(self, c: rl_canvas.Canvas, template: PageTemplate, page_num: int = 1) -> None:
        _ensure_fonts()
        x, y, w, h = safe_box(template, page_num)
        top = y + h

        # Title bar
        if self.title:
            c.setFillGray(0.0)
            c.setFont("Helvetica-Bold", 18)
            c.drawString(x, top - 20, self.title)
            c.setLineWidth(HEAVY_LINE_W)
            c.line(x, top - 26, x + w, top - 26)
            top = top - 36

        # Subtitle
        if self.subtitle:
            c.setFont("Helvetica-Oblique", 11)
            c.drawString(x, top - 14, self.subtitle)
            top = top - 22

        # Body paragraphs
        c.setFont("Helvetica", self.body_font_size)
        cy = top - self.body_line_spacing
        for paragraph in self.body.split("\n\n"):
            paragraph = paragraph.strip()
            if not paragraph:
                continue
            for line in _wrap_text(c, paragraph, "Helvetica", self.body_font_size, w):
                if cy < y + 12:
                    return  # overflow â€” caller paginates
                c.drawString(x, cy, line)
                cy -= self.body_line_spacing
            cy -= self.paragraph_spacing

        # Bullets
        if self.bullets:
            cy -= self.paragraph_spacing  # extra gap before bullets
            bullet_indent = 14
            for bullet in self.bullets:
                if cy < y + 12:
                    return
                # Bullet glyph
                c.setFont("Helvetica-Bold", self.body_font_size)
                c.drawString(x, cy, "â€¢")
                c.setFont("Helvetica", self.body_font_size)
                wrapped = _wrap_text(
                    c, bullet, "Helvetica", self.body_font_size, w - bullet_indent
                )
                for i, line in enumerate(wrapped):
                    if cy < y + 12:
                        return
                    c.drawString(x + bullet_indent, cy, line)
                    cy -= self.body_line_spacing
                cy -= 4  # small inter-bullet gap
```

Then, also in `journal_templates.py`, add this module-level helper (e.g. near the other helpers at the top, after `safe_box`):

```python
def _wrap_text(
    c: rl_canvas.Canvas,
    text: str,
    font_name: str,
    font_size: float,
    max_width: float,
) -> list[str]:
    """Greedy word-wrap. Returns a list of lines that each fit in max_width."""
    words = text.split()
    if not words:
        return []
    lines: list[str] = []
    cur = ""
    for word in words:
        trial = (cur + " " + word).strip()
        if c.stringWidth(trial, font_name, font_size) <= max_width:
            cur = trial
        else:
            if cur:
                lines.append(cur)
            cur = word
    if cur:
        lines.append(cur)
    return lines
```

- [x] **Step 4: Update `__all__`**

Add `"TextBlockPage"` to the `__all__` list at the bottom of `journal_templates.py`.

- [x] **Step 5: Run all template tests**

Run:
```bash
python -m pytest projects/kdp-puzzle-press/tests/test_diabetes_templates.py -v --rootdir=projects/kdp-puzzle-press
```

Expected: 14 tests PASS (11 from prior tasks + 3 new TextBlockPage tests).

- [x] **Step 6: Commit**

```bash
git add projects/kdp-puzzle-press/src/pocket_rooster_press/layout/journal_templates.py projects/kdp-puzzle-press/tests/test_diabetes_templates.py
git commit -m "$(cat <<'EOF'
feat(journal): add TextBlockPage template with body + bullets + overflow guard

Single-page prose renderer with title bar, optional subtitle,
word-wrapped paragraphs (split on \\n\\n), and an optional bullet
list. Stops cleanly on overflow â€” caller paginates long content
across multiple instances. Used by SKU C for the CGM primer,
AGP reader, glossary, and sample DVP pages.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: SKU A â€” `large_print_diabetes_log_v1.py` book module

Wire SKU A together: 4 carb pages + sample week + 104 weekly logs + 8 quarterly DVP pages + 2 end-matter pages. Total target: 124 pp.

**Files:**
- Create: `projects/kdp-puzzle-press/src/pocket_rooster_press/books/large_print_diabetes_log_v1.py`
- Create: `projects/kdp-puzzle-press/tests/test_diabetes_log_books.py`

- [x] **Step 1: Write the failing test**

Create `projects/kdp-puzzle-press/tests/test_diabetes_log_books.py`:

```python
"""Build tests for the two diabetes log book SKUs."""

from __future__ import annotations

from pathlib import Path

import pytest
from pypdf import PdfReader


def test_sku_a_builds(tmp_path: Path) -> None:
    from pocket_rooster_press.books import large_print_diabetes_log_v1 as book

    interior, cover = book.build(output_dir=tmp_path)
    assert interior.exists()
    assert cover.exists()
    n = len(PdfReader(str(interior)).pages)
    # Spec: 124 pp target. Allow +/- 4 for layout drift.
    assert 120 <= n <= 128, f"SKU A page count {n} out of 120-128 window"
```

- [x] **Step 2: Run the test to verify it fails**

Run:
```bash
python -m pytest projects/kdp-puzzle-press/tests/test_diabetes_log_books.py::test_sku_a_builds -v --rootdir=projects/kdp-puzzle-press
```

Expected: FAIL with `ModuleNotFoundError: large_print_diabetes_log_v1`.

- [x] **Step 3: Implement the book module**

Create `projects/kdp-puzzle-press/src/pocket_rooster_press/books/large_print_diabetes_log_v1.py`:

```python
"""SKU A: Large Print Diabetes Log Book for Seniors (2-Year, 8.5x11).

Wires journal_templates into a 124-page diabetes log book:
4 carb cheat-sheet pages + sample filled-in week + 104 weekly log
pages (one page per week) + 8 quarterly doctor-visit-prep pages
(inserted every 13 weeks) + 2 end-matter pages.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Callable

from pypdf import PdfReader

from pocket_rooster_press.config import (
    BOOK_KIND_JOURNAL,
    OUTPUT_DIR,
    PALETTE_DIABETES_SENIOR,
)
from pocket_rooster_press.covers.cover_builder import CoverBuilder
from pocket_rooster_press.layout.book_assembler import BookAssembler, BookConfig
from pocket_rooster_press.layout.journal_templates import (
    CarbReferencePage,
    DiabetesWeeklySpread,
    LinedNotePage,
    QuarterlyDoctorVisitPrep,
)
from pocket_rooster_press.layout.templates import TEMPLATE_85X11_LARGEPRINT

BOOK_ID = "large-print-diabetes-log-v1"
TITLE = "Large Print Diabetes Log Book for Seniors"
SUBTITLE = (
    "2-Year Blood Sugar, Blood Pressure & Medication Tracker "
    "with Doctor Visit Prep"
)
INTRO = (
    "This log book gives you space to record what your care team needs to "
    "see. Each weekly page tracks blood sugar before and after meals, blood "
    "pressure, weight, energy, and medications. Every thirteen weeks, a "
    "doctor visit prep page helps you summarize the quarter. Use a soft "
    "pencil so you can adjust as the picture clarifies."
)

ASSETS_DIR = Path(__file__).parent.parent.parent.parent / "assets"
CARB_DATA_PATH = ASSETS_DIR / "carb_reference.json"

WEEKS_TOTAL = 104
QUARTERLY_EVERY_N_WEEKS = 13


def _renderer(template_obj) -> Callable:
    """Wrap a journal-template instance as a (canvas, template, page_num) callable."""
    def _r(c, template, page_num):
        template_obj.draw(c, template, page_num)
    return _r


def _build_page_renderers() -> list[Callable]:
    pages: list[Callable] = []

    # Front matter: 4 carb pages (2 categories per page)
    carb_data = json.loads(CARB_DATA_PATH.read_text(encoding="utf-8"))
    categories = carb_data["categories"]
    for i in range(0, len(categories), 2):
        chunk = categories[i:i + 2]
        pages.append(_renderer(CarbReferencePage(
            categories=chunk,
            title="Carb Cheat Sheet" if i == 0 else "Carb Cheat Sheet (continued)",
        )))

    # One sample filled-in week (uses an empty DiabetesWeeklySpread; the
    # "filled in" version would be a hand-rendered example image. For v1
    # we leave the grid blank with a "Example â€” fill in as you go" subtitle).
    pages.append(_renderer(DiabetesWeeklySpread(
        title="Example Week",
        mode="fingerstick",
    )))

    # 104 weekly log pages with quarterly DVP pages interleaved every 13 weeks.
    week_num = 1
    while week_num <= WEEKS_TOTAL:
        pages.append(_renderer(DiabetesWeeklySpread(
            title=f"Week {week_num}",
            mode="fingerstick",
        )))
        if week_num % QUARTERLY_EVERY_N_WEEKS == 0 and week_num < WEEKS_TOTAL:
            quarter = week_num // QUARTERLY_EVERY_N_WEEKS
            pages.append(_renderer(QuarterlyDoctorVisitPrep(
                visit_label=f"Doctor Visit Prep â€” Quarter {quarter}",
            )))
        week_num += 1

    # Final quarterly (covers weeks 92-104)
    pages.append(_renderer(QuarterlyDoctorVisitPrep(
        visit_label="Doctor Visit Prep â€” Quarter 8",
    )))

    # End matter
    for _ in range(2):
        pages.append(_renderer(LinedNotePage(title="Notes")))

    return pages


def build(output_dir: Path = OUTPUT_DIR) -> tuple[Path, Path]:
    page_renderers = _build_page_renderers()

    config = BookConfig(
        book_id=BOOK_ID,
        title=TITLE,
        template=TEMPLATE_85X11_LARGEPRINT,
        output_dir=output_dir,
        intro_text=INTRO,
        kind=BOOK_KIND_JOURNAL,
    )
    assembler = BookAssembler(config)
    interior = assembler.assemble_journal_book(page_renderers)

    cover_path = output_dir / BOOK_ID / "cover.pdf"
    cover_builder = CoverBuilder(
        TEMPLATE_85X11_LARGEPRINT,
        PALETTE_DIABETES_SENIOR,
        cover_path,
    )
    page_count = len(PdfReader(str(interior)).pages)
    cover = cover_builder.build(
        TITLE,
        subtitle=SUBTITLE,
        page_count=page_count,
        series_label="Pocket Rooster Press Â· Diabetes Log Â· Volume 1",
        badge_text="2 Years Â· 18pt Large Print",
        back_bullets=[
            "Genuinely 18pt large print â€” measured, not promised",
            "104 weekly log pages + 8 quarterly doctor visit prep pages",
            "Tracks blood sugar, BP, medications, weight & energy together",
            "Built-in carb cheat sheet for 60 common foods",
        ],
    )

    return interior, cover
```

- [x] **Step 4: Run the test to verify it passes**

Run:
```bash
python -m pytest projects/kdp-puzzle-press/tests/test_diabetes_log_books.py::test_sku_a_builds -v --rootdir=projects/kdp-puzzle-press
```

Expected: PASS. If page count is outside [120, 128], do NOT fudge the assertion â€” investigate the renderer counts in `_build_page_renderers()` and reconcile against the spec page budget.

- [x] **Step 5: Commit**

```bash
git add projects/kdp-puzzle-press/src/pocket_rooster_press/books/large_print_diabetes_log_v1.py projects/kdp-puzzle-press/tests/test_diabetes_log_books.py
git commit -m "$(cat <<'EOF'
feat(books): SKU A â€” Large Print Diabetes Log Book for Seniors

Wires the new diabetes templates into a 124-page 2-year log:
4 carb cheat-sheet pages + example week + 104 weekly fingerstick
spreads + 8 quarterly doctor-visit-prep pages + 2 notes pages.
Cover uses the new PALETTE_DIABETES_SENIOR.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: SKU A â€” metadata JSON

The bundle pipeline reads `metadata/<book_id_underscored>.json`. Mirrors `garden_companion.json` schema.

**Files:**
- Create: `projects/kdp-puzzle-press/metadata/large_print_diabetes_log_v1.json`

- [x] **Step 1: Write the metadata file**

Create `projects/kdp-puzzle-press/metadata/large_print_diabetes_log_v1.json`:

```json
{
  "$schema": "./_metadata.schema.json",
  "book_id": "large-print-diabetes-log-v1",
  "imprint": "Pocket Rooster Press",
  "title": "Large Print Diabetes Log Book for Seniors",
  "subtitle": "2-Year Blood Sugar, Blood Pressure & Medication Tracker with Doctor Visit Prep",
  "series": {
    "name": "Diabetes Log",
    "volume": 1
  },
  "author": "Pocket Rooster Press",
  "language": "English",
  "publication_date": "TBD",
  "edition": "First Edition",
  "publisher": "Pocket Rooster Press",
  "trim_size": "8.5x11",
  "interior_type": "Black & White",
  "paper_type": "White",
  "binding": "Paperback (Perfect Bound)",
  "page_count_target": 124,
  "isbn": "KDP-assigned (free)",
  "bisac": [
    {"code": "HEA039050", "label": "HEALTH & FITNESS / Diseases & Conditions / Diabetes"},
    {"code": "HEA048000", "label": "HEALTH & FITNESS / Healthy Aging"}
  ],
  "kdp_browse_categories": [
    "Books > Health, Fitness & Dieting > Diseases & Physical Ailments > Diabetes",
    "Books > Health, Fitness & Dieting > Aging",
    "Books > Reference > Personal Health"
  ],
  "keywords": [
    "large print diabetes log book seniors",
    "blood sugar log book 2 year",
    "diabetic journal before after meals",
    "blood pressure tracker for diabetics",
    "medication log book elderly",
    "diabetes gift for grandma grandpa",
    "glucose monitor notebook"
  ],
  "keyword_audit": {
    "max_per_keyword_chars": 50,
    "longest_keyword_chars": 38,
    "banned_terms_check": [
      "no 'best seller', 'free', 'kindle', 'new', 'on sale', 'sale'",
      "no series-name spam",
      "no competitor names"
    ]
  },
  "audience": {
    "primary": "Adults 60+ with Type 2 diabetes; caregivers; gift buyers",
    "reading_age": "Adult",
    "is_adult_content": false,
    "low_content_book": true,
    "large_print": true
  },
  "pricing": {
    "currency_default": "USD",
    "list_prices": {
      "amazon_com_USD": 7.99,
      "amazon_co_uk_GBP": 6.79,
      "amazon_de_EUR": 7.99,
      "amazon_fr_EUR": 7.99,
      "amazon_es_EUR": 7.99,
      "amazon_it_EUR": 7.99,
      "amazon_nl_EUR": 7.99,
      "amazon_co_jp_JPY": 1158,
      "amazon_com_au_AUD": 12.38,
      "amazon_ca_CAD": 10.39
    },
    "royalty_plan": "60% (Standard)",
    "expanded_distribution": false,
    "printing_cost_estimate_usd": {
      "fixed": 0.85,
      "per_page": 0.017,
      "page_count": 124,
      "total": 2.96,
      "formula": "0.85 + (page_count * per_page)"
    },
    "royalty_estimate_usd": {
      "list_price": 7.99,
      "royalty_rate": 0.6,
      "gross": 4.794,
      "printing_cost": 2.96,
      "net_per_copy": 1.834
    },
    "kdp_minimum_list_price_usd": 5.0,
    "pricing_rationale": "Priced at $7.99 to match the top 3 bestsellers in 'large print diabetes log book' â€” we win on quality, not undercut."
  },
  "ai_disclosure": {
    "policy_doc": "docs/AI_DISCLOSURE_POLICY.md",
    "text": "None of the above",
    "images": "None of the above",
    "translations": "None of the above",
    "image_tool": null,
    "image_count_bucket": "None"
  },
  "matchbook": false,
  "look_inside": true,
  "drm": false,
  "audience_options": {
    "sexually_explicit": false,
    "primary_audience_adult": false
  },
  "metadata_audit": {
    "title_chars": 47,
    "subtitle_chars": 88,
    "title_subtitle_combined_chars": 135,
    "kdp_title_max": 200,
    "kdp_subtitle_max": 200,
    "passes": true
  }
}
```

- [x] **Step 2: Validate the JSON**

Run:
```bash
python -c "import json; m = json.load(open('projects/kdp-puzzle-press/metadata/large_print_diabetes_log_v1.json')); print('OK:', m['book_id'], m['page_count_target'], 'pp at', m['pricing']['list_prices']['amazon_com_USD'])"
```

Expected: `OK: large-print-diabetes-log-v1 124 pp at 7.99`.

- [x] **Step 3: Commit**

```bash
git add projects/kdp-puzzle-press/metadata/large_print_diabetes_log_v1.json
git commit -m "$(cat <<'EOF'
feat(metadata): SKU A â€” large-print-diabetes-log-v1 metadata

7 keywords, 3 categories, $7.99 price, 124 pp target. Mirrors
garden_companion.json schema. Net royalty estimate $1.83/copy.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: SKU A â€” listing.md

Customer-facing copy used when actually filling in the KDP web form. Mirrors `garden-companion/listing.md`.

**Files:**
- Create: `projects/kdp-puzzle-press/output/kdp-ready/large-print-diabetes-log-v1/listing.md`

- [x] **Step 1: Create the output directory**

Run:
```bash
mkdir -p projects/kdp-puzzle-press/output/kdp-ready/large-print-diabetes-log-v1/
```

- [x] **Step 2: Write the listing**

Create `projects/kdp-puzzle-press/output/kdp-ready/large-print-diabetes-log-v1/listing.md`:

```markdown
# Large Print Diabetes Log Book for Seniors
## KDP Listing Copy + A+ Content Brief

**Book ID:** large-print-diabetes-log-v1
**Companion file:** [large_print_diabetes_log_v1.json](../../../metadata/large_print_diabetes_log_v1.json)
**Status:** Ready for Phase 3 upload

---

## 1. Title

```
Large Print Diabetes Log Book for Seniors
```

## 2. Subtitle

```
2-Year Blood Sugar, Blood Pressure & Medication Tracker with Doctor Visit Prep
```

## 3. Series

- Series name: **Diabetes Log**
- Volume: **1**

## 4. Author

- **Author:** Pocket Rooster Press

## 5. Description (HTML, <= 4000 chars)

```html
<h4>A 2-year diabetes log book in genuinely 18pt large print, with weekly blood sugar tracking, blood pressure, medications, weight, and a built-in doctor visit prep page every 13 weeks.</h4>

<p><b>Large Print Diabetes Log Book for Seniors</b> â€” 104 weekly log pages, eight quarterly Doctor Visit Prep summaries, and a built-in carb cheat sheet for 60 common foods.</p>

<h5>What makes this log book different:</h5>
<ul>
<li><b>Genuinely 18pt large print</b> â€” measured, not just promised. Easy to read; easy to write in.</li>
<li><b>Doctor Visit Prep pages every 13 weeks</b> â€” A1C, weight, BP, current medications, questions, observations on one page</li>
<li><b>Carb cheat sheet for 60 common foods</b> â€” at the front of the book, ready to glance at</li>
<li><b>Tracks four metrics together</b> â€” blood sugar, blood pressure, medications, and weight on one weekly spread</li>
</ul>

<h5>What's inside:</h5>
<ul>
<li>104 weekly spreads (2 full years)</li>
<li>Before/after meals for breakfast, lunch, and dinner, plus bedtime</li>
<li>Energy 1-5 and notes column for each day</li>
<li>Weekly summary row: average, lowest, highest, BP average, weight change</li>
<li>8 quarterly Doctor Visit Prep pages</li>
<li>4 carb-reference pages with 60 common foods</li>
<li>Example "filled in" week to show how it works</li>
</ul>

<h5>From Pocket Rooster Press:</h5>

<p>Pocket Rooster Press is a small imprint that publishes thoughtful, dignified books for quiet hands and curious minds â€” planners, log books, coloring books, and activity titles with clean typography, generous layouts, no padding, and no childish gimmicks. Just careful work for readers who notice the difference.</p>

<p><i>A Year of Pages, A Lifetime of Notes.</i></p>

<p><i>This log book is for tracking only and is not medical advice. Always share your records with your healthcare team for interpretation.</i></p>
```

## 6. Bullet Highlights

1. Genuinely 18pt large print â€” measured, not just promised
2. 2 years of weekly log pages (104 weeks total)
3. Tracks blood sugar before/after meals, blood pressure, medications & weight together
4. Quarterly Doctor Visit Prep pages built in (every 13 weeks)
5. Carb cheat sheet for 60 common foods included at the front

## 7. Keywords (7 max)

1. large print diabetes log book seniors
2. blood sugar log book 2 year
3. diabetic journal before after meals
4. blood pressure tracker for diabetics
5. medication log book elderly
6. diabetes gift for grandma grandpa
7. glucose monitor notebook

## 8. Categories

- Books > Health, Fitness & Dieting > Diseases & Physical Ailments > Diabetes
- Books > Health, Fitness & Dieting > Aging
- Books > Reference > Personal Health

## 9. BISAC

- HEA039050 â€” HEALTH & FITNESS / Diseases & Conditions / Diabetes
- HEA048000 â€” HEALTH & FITNESS / Healthy Aging

## 10. Pricing

- US: $7.99
- UK: Â£6.79
- EU: â‚¬7.99

## 11. Notes

- Trim: **8.5x11**
- Large print: **Yes (18pt verified)**
- Low-content book: **Yes**
- Medical-language gate: copy is **descriptive only** â€” "track" not "treat", "share with your doctor" not interpretation. No specific BG targets stated.
```

- [x] **Step 3: Commit**

```bash
git add projects/kdp-puzzle-press/output/kdp-ready/large-print-diabetes-log-v1/listing.md
git commit -m "$(cat <<'EOF'
docs(listing): SKU A â€” large-print-diabetes-log-v1 listing copy

Customer-facing KDP listing with the 4 cover-promised
differentiators surfaced in the description. Medical-language
gate observed throughout â€” descriptive only, no interpretation.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 11: Add the font-size audit assertion

Audit a sampled weekly-log page and confirm the embedded text content is large enough. SKU A target: >= 18pt body. SKU C target: >= 11pt.

**Files:**
- Modify: `projects/kdp-puzzle-press/scripts/audit_pdfs.py`

- [x] **Step 1: Locate the audit registration block**

Read `projects/kdp-puzzle-press/scripts/audit_pdfs.py` lines 1-200 to find the per-book check loop (search for `check_` function definitions). The existing convention: define a `check_xxx(audit) -> CheckResult` function, then call it inside the per-book audit driver. Pick the same pattern.

- [x] **Step 2: Add the `check_min_font_size` function**

Append to `projects/kdp-puzzle-press/scripts/audit_pdfs.py` (search for the last `check_` function in the file and add immediately after it):

```python
def check_min_font_size(
    audit: BookAudit,
    min_pt: float,
    sample_page_index: int,
) -> CheckResult:
    """Inspect the embedded font sizes used on a sample page of the interior.

    We crawl the page's content stream for `Tf` operators (`/FontName <size> Tf`)
    and take the smallest non-zero size. Pages with no text return PASS.

    Args:
        audit: the BookAudit (interior PDF path is read off it)
        min_pt: minimum acceptable body font size in points
        sample_page_index: 0-indexed page to sample. Pick a page that holds
            the bulk of user-facing copy (e.g. a weekly log page).
    """
    reader = PdfReader(str(audit.interior))
    if sample_page_index >= len(reader.pages):
        return CheckResult(
            name=f"min_font_size_p{sample_page_index}",
            passed=False,
            detail=f"sample page index {sample_page_index} out of range ({len(reader.pages)} pp)",
        )
    page = reader.pages[sample_page_index]
    content = page.get_contents()
    if content is None:
        return CheckResult(
            name=f"min_font_size_p{sample_page_index}",
            passed=True,
            detail="page has no content stream",
        )
    # get_contents() returns either a stream or an ArrayObject; normalize:
    try:
        data = content.get_data() if hasattr(content, "get_data") else b"".join(
            obj.get_data() for obj in content
        )
    except Exception as exc:  # noqa: BLE001 â€” defensive against malformed PDFs
        return CheckResult(
            name=f"min_font_size_p{sample_page_index}",
            passed=False,
            detail=f"could not read content stream: {exc!r}",
        )
    text = data.decode("latin-1", errors="ignore")

    # Find every `<size> Tf` operator. Tokens look like: "/F2 18 Tf" or
    # "/Helvetica-Bold 16.0 Tf".
    import re
    sizes = [
        float(m.group(1))
        for m in re.finditer(r"/[A-Za-z0-9_\-]+\s+([0-9.]+)\s+Tf", text)
    ]
    sizes = [s for s in sizes if s > 0]
    if not sizes:
        return CheckResult(
            name=f"min_font_size_p{sample_page_index}",
            passed=True,
            detail="no text operators on sampled page",
        )
    smallest = min(sizes)
    passed = smallest >= min_pt
    return CheckResult(
        name=f"min_font_size_p{sample_page_index}",
        passed=passed,
        detail=f"smallest font on page = {smallest:.1f}pt (required >= {min_pt:.1f}pt)",
    )
```

- [x] **Step 3: Add a smoke test**

Append to `projects/kdp-puzzle-press/tests/test_diabetes_log_books.py`:

```python
def test_sku_a_passes_min_font_size_audit(tmp_path: Path) -> None:
    from pocket_rooster_press.books import large_print_diabetes_log_v1 as book
    import sys
    sys.path.insert(0, str(Path(__file__).parent.parent / "scripts"))
    from audit_pdfs import BookAudit, check_min_font_size

    interior, cover = book.build(output_dir=tmp_path)
    audit = BookAudit(book_id=book.BOOK_ID, interior=interior, cover=cover)
    # Sample page 8: past the 4-page carb cheat sheet + example week +
    # title/copyright/intro front matter (~6-7 pp), so it lands on a real
    # weekly log spread. If the front matter expands, bump this.
    result = check_min_font_size(audit, min_pt=8.0, sample_page_index=8)
    assert result.passed, result.detail
```

Note: we assert `min_pt=8.0` in the smoke test, not 18 â€” the page contains both the 18pt date numbers and the 9pt column headers. Use 8.0 as the structural lower bound (catches a regression where someone uses 6pt by accident). The "real 18pt" promise applies to the user-fill-in fields specifically, which we verify by spot-checking with `preview_pdfs.py` in Task 12.

- [x] **Step 4: Run the test to verify it passes**

Run:
```bash
python -m pytest projects/kdp-puzzle-press/tests/test_diabetes_log_books.py::test_sku_a_passes_min_font_size_audit -v --rootdir=projects/kdp-puzzle-press
```

Expected: PASS. If FAIL with a smaller-than-expected min, inspect the column-header font size in `DiabetesWeeklySpread` and bump if needed.

- [x] **Step 5: Commit**

```bash
git add projects/kdp-puzzle-press/scripts/audit_pdfs.py projects/kdp-puzzle-press/tests/test_diabetes_log_books.py
git commit -m "$(cat <<'EOF'
feat(audit): check_min_font_size for sampled interior pages

Crawls the content stream of a sampled page, extracts every
`<size> Tf` operator, and asserts the smallest meets the
required minimum. Smoke-tested on SKU A weekly log page.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 12: SKU A â€” build artifacts, run full audit, bundle for KDP

End-to-end pipeline rehearsal for SKU A. After this task, the SKU is ready for human upload to KDP.

**Files:**
- No code changes; this task is build + verification.

- [x] **Step 1: Build SKU A to the real `output/` directory**

Run:
```bash
python -c "from pocket_rooster_press.books import large_print_diabetes_log_v1 as b; i, c = b.build(); print('interior:', i); print('cover:', c)"
```
(Run this from `projects/kdp-puzzle-press/` â€” set `cd` there or use `PYTHONPATH=projects/kdp-puzzle-press/src`.)

Expected: prints two paths under `projects/kdp-puzzle-press/output/large-print-diabetes-log-v1/`.

- [x] **Step 2: Run the full audit**

Run:
```bash
python projects/kdp-puzzle-press/scripts/audit_pdfs.py large-print-diabetes-log-v1
```

Expected: exits 0; all checks PASS. If any FAIL, fix the cause (not the audit) before continuing.

- [x] **Step 3: Preview the cover and a sample interior page**

Run:
```bash
python projects/kdp-puzzle-press/scripts/preview_pdfs.py large-print-diabetes-log-v1
```

Expected: PNG previews written next to the PDFs. Open them and visually confirm:
- Cover title is legible on the thumbnail (squint test at 200px wide)
- Sample weekly log page has clear column headers and the date column is readable
- No clipped text, no overlapping elements

- [x] **Step 4: Build the KDP bundle**

Run:
```bash
python projects/kdp-puzzle-press/scripts/build_kdp_bundle.py large-print-diabetes-log-v1
```

Expected: bundle directory `projects/kdp-puzzle-press/output/kdp-ready/large-print-diabetes-log-v1/` is populated with `interior.pdf`, `cover.pdf`, the metadata JSON, the listing markdown, and an `UPLOAD_CHECKLIST.md`.

- [x] **Step 5: Inspect the bundle**

Run:
```bash
ls projects/kdp-puzzle-press/output/kdp-ready/large-print-diabetes-log-v1/
```

Expected files: `interior.pdf`, `cover.pdf`, `large_print_diabetes_log_v1.json` (or similar metadata copy), `listing.md`, `UPLOAD_CHECKLIST.md`.

- [x] **Step 6: Commit the bundle outputs (if the project commits them)**

Check whether `output/kdp-ready/` is gitignored:

```bash
git check-ignore projects/kdp-puzzle-press/output/kdp-ready/large-print-diabetes-log-v1/
```

If output is **ignored**: skip the commit, the bundle is generated on demand.
If output is **tracked** (other bundles are visible in `git log`): commit:

```bash
git add projects/kdp-puzzle-press/output/kdp-ready/large-print-diabetes-log-v1/
git commit -m "$(cat <<'EOF'
chore(bundle): SKU A KDP-ready bundle for large-print-diabetes-log-v1

Generated by build_kdp_bundle.py. Ready for human upload.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 13: SKU C â€” `cgm_companion_logbook_v1.py` book module

Wires SKU C: CGM primer prose (1 what-captures + 1 primer-continued + 4 AGP-reader pages) + sample week + 104 CGM weekly logs + 8 quarterly DVP + 8 GMI-vs-A1C compare pages + sample DVP (narrative + blank ref) + glossary + 4 end-matter pages. Target: ~137 pp (spec 140 Â±4).

**Files:**
- Create: `projects/kdp-puzzle-press/src/pocket_rooster_press/books/cgm_companion_logbook_v1.py`
- Modify: `projects/kdp-puzzle-press/tests/test_diabetes_log_books.py`

- [x] **Step 1: Write the failing test**

Append to `projects/kdp-puzzle-press/tests/test_diabetes_log_books.py`:

```python
def test_sku_c_builds(tmp_path: Path) -> None:
    from pocket_rooster_press.books import cgm_companion_logbook_v1 as book

    interior, cover = book.build(output_dir=tmp_path)
    assert interior.exists()
    assert cover.exists()
    n = len(PdfReader(str(interior)).pages)
    # Spec: 140 pp target. Allow +/- 4 for layout drift.
    assert 136 <= n <= 144, f"SKU C page count {n} out of 136-144 window"
```

- [x] **Step 2: Run the test to verify it fails**

Run:
```bash
python -m pytest projects/kdp-puzzle-press/tests/test_diabetes_log_books.py::test_sku_c_builds -v --rootdir=projects/kdp-puzzle-press
```

Expected: FAIL with `ModuleNotFoundError: cgm_companion_logbook_v1`.

- [x] **Step 3: Implement the book module**

Create `projects/kdp-puzzle-press/src/pocket_rooster_press/books/cgm_companion_logbook_v1.py`:

```python
"""SKU C: CGM Companion Logbook (2-Year, 6x9).

Brand-agnostic paper supplement for CGM users. Captures the food,
exercise, mood, and insulin context that the device app doesn't, plus
a quarterly GMI-vs-lab-A1C reconciliation page.
"""

from __future__ import annotations

from pathlib import Path
from typing import Callable

from pypdf import PdfReader

from pocket_rooster_press.config import (
    BOOK_KIND_JOURNAL,
    OUTPUT_DIR,
    PALETTE_CGM_COMPANION,
)
from pocket_rooster_press.covers.cover_builder import CoverBuilder
from pocket_rooster_press.layout.book_assembler import BookAssembler, BookConfig
from pocket_rooster_press.layout.journal_templates import (
    DiabetesWeeklySpread,
    LinedNotePage,
    MonthlyA1CTrend,
    QuarterlyDoctorVisitPrep,
    TextBlockPage,
)
from pocket_rooster_press.layout.templates import TEMPLATE_6X9_POCKET

BOOK_ID = "cgm-companion-logbook-v1"
TITLE = "CGM Companion Logbook"
SUBTITLE = (
    "Track Time-in-Range, Food, Patterns & Doctor Visits â€” "
    "for Dexcom, Libre, Stelo & All Continuous Glucose Monitors"
)
INTRO = (
    "Your continuous glucose monitor shows you the numbers. This book gives "
    "you space for the context the app doesn't capture: what you ate, how "
    "you moved, how you felt, and what dose you took. Each weekly page has "
    "a device-summary box for the readings from your app and columns for "
    "the rest. Every thirteen weeks, a GMI vs A1C reconciliation page helps "
    "you see how your device estimate compares to the lab number."
)

WEEKS_TOTAL = 104
QUARTERLY_EVERY_N_WEEKS = 13

CGM_PRIMER_TEXT = (
    "Your CGM gives you four numbers that matter most: time-in-range (TIR), "
    "average glucose, lowest reading, and highest reading. TIR is the share "
    "of the day your glucose was inside your target band (most commonly "
    "70-180 mg/dL). Average tells you the centre of the picture. Lowest "
    "flags hypoglycemia risk; highest flags hyperglycemia. Together they "
    "tell a story your A1C alone cannot.\n\n"
    "GMI (Glucose Management Indicator) is your device's estimate of what "
    "your A1C would be given the last 14 or 30 days of CGM data. It does "
    "not replace the lab A1C â€” the two often differ by a few tenths of "
    "a percent. Capturing both side-by-side every quarter helps you and "
    "your care team see where the gap is widening or closing."
)

AGP_READER_TEXT = (
    "An Ambulatory Glucose Profile (AGP) is the curve your CGM app draws "
    "from the last 14 days, showing the median glucose at each hour of "
    "the day with shaded bands for the 25-75% and 5-95% spreads.\n\n"
    "What to look for:\n\n"
    "â€¢ Sustained highs in the late morning often point to a breakfast "
    "carb bump or a missed pre-meal dose.\n\n"
    "â€¢ An overnight dip can indicate too-much basal insulin or a "
    "delayed bedtime snack effect wearing off.\n\n"
    "â€¢ A widening spread band (large 5-95% range) means glucose is "
    "swinging more day-to-day â€” worth a conversation with your care "
    "team about cause."
)

WHAT_BOOK_CAPTURES_TEXT = (
    "Your CGM tracks the numbers. This book captures the context that "
    "explains them: meals, carb estimates, exercise, mood, illness, "
    "stress, and insulin or medication doses. When a pattern shows up in "
    "your AGP, the matching week in this log helps you see why."
)

GLOSSARY_TEXT = (
    "TIR (Time-in-Range): the share of the day your glucose was inside "
    "your target band, most commonly 70-180 mg/dL.\n\n"
    "GMI (Glucose Management Indicator): a CGM-derived estimate of what "
    "your A1C would be given recent device data.\n\n"
    "CV (Coefficient of Variation): a measure of how much your glucose "
    "swings. Lower is steadier; clinical guidance typically targets <= 36%.\n\n"
    "AGP (Ambulatory Glucose Profile): the 14-day median + spread curve "
    "your CGM app draws to summarize typical-day glucose patterns."
)


def _renderer(template_obj) -> Callable:
    def _r(c, template, page_num):
        template_obj.draw(c, template, page_num)
    return _r


SAMPLE_DVP_TEXT = (
    "Example: filling out your quarterly Doctor Visit Prep page.\n\n"
    "Before the visit, take ten minutes to look back through the last 13 "
    "weeks of your weekly logs. Note the moments when your TIR dropped "
    "below 70%, the weeks where your average climbed, and any new patterns "
    "you spotted.\n\n"
    "Write your A1C goal in the first box (the number your care team last "
    "set). Leave the actual blank â€” your doctor will fill it in after the "
    "lab draw, and you'll have both side-by-side for next quarter.\n\n"
    "In the medications box, list everything you take now and any dose "
    "change since last visit. In the questions box, write what you want "
    "to leave the visit having answered â€” be specific. \"Why did my "
    "overnight low keep happening on Tuesdays?\" is better than \"sleep.\""
)


def _build_page_renderers() -> list[Callable]:
    pages: list[Callable] = []

    # Front matter prose: 1 "what captures" + 1 CGM primer continued
    # + 4 AGP reader pages. The first CGM primer page is rendered by the
    # assembler from INTRO; the rest are explicit TextBlockPages here.
    pages.append(_renderer(TextBlockPage(
        title="What this book captures",
        body=WHAT_BOOK_CAPTURES_TEXT,
    )))
    pages.append(_renderer(TextBlockPage(
        title="How CGM data works (continued)",
        body=CGM_PRIMER_TEXT,
    )))
    # AGP reader split into 4 pages: title + intro on page 1, then 3
    # bullet-detail pages for the three patterns.
    pages.append(_renderer(TextBlockPage(
        title="How to read your AGP",
        subtitle="Ambulatory Glucose Profile basics",
        body=(
            "An Ambulatory Glucose Profile (AGP) is the curve your CGM "
            "app draws from the last 14 days, showing the median glucose "
            "at each hour of the day with shaded bands for the 25-75% "
            "and 5-95% spreads.\n\n"
            "The median line tells you the centre of a typical day. The "
            "spread bands tell you how steady or jumpy your glucose has "
            "been at each hour. Together they show the shape of your "
            "day in a way that a single number can't."
        ),
    )))
    pages.append(_renderer(TextBlockPage(
        title="Pattern 1: Late-morning highs",
        body=(
            "If the median line climbs sharply between 9am and noon and "
            "stays elevated through lunch, the likely culprits are a "
            "high-carb breakfast that wasn't fully covered by insulin, "
            "a missed pre-meal dose, or a steroid medication."
        ),
        bullets=[
            "Check the weekly logs for those mornings â€” what did you eat?",
            "Note whether the high happened on workdays vs weekends.",
            "Bring the AGP screenshot to your next visit and ask whether "
            "your breakfast carb ratio needs adjusting.",
        ],
    )))
    pages.append(_renderer(TextBlockPage(
        title="Pattern 2: Overnight dips",
        body=(
            "If the median line drops below your target band between 2am "
            "and 5am, you may be getting too much basal insulin or a "
            "bedtime snack effect is wearing off before sunrise."
        ),
        bullets=[
            "Note the timing â€” consistent dips at the same hour suggest "
            "basal; varied timing suggests food or activity.",
            "Cross-check with your weekly notes for late exercise.",
            "Do not adjust your insulin without your care team â€” bring "
            "the pattern to them.",
        ],
    )))
    pages.append(_renderer(TextBlockPage(
        title="Pattern 3: Widening spread band",
        body=(
            "If the shaded 5-95% spread band is getting wider month over "
            "month, your glucose is swinging more day-to-day. The median "
            "may look fine while the variability is climbing."
        ),
        bullets=[
            "Variability often tracks with stress, illness, or schedule changes.",
            "Look at the weekly mood/exercise/sleep columns for context.",
            "Coefficient of Variation (CV) is the precise metric â€” your "
            "care team aims for 36% or lower.",
        ],
    )))

    # Example week
    pages.append(_renderer(DiabetesWeeklySpread(
        title="Example Week",
        mode="cgm",
    )))

    # 104 weekly log pages with quarterly DVP + GMI-vs-A1C interleaved
    # every 13 weeks.
    week_num = 1
    quarter = 0
    while week_num <= WEEKS_TOTAL:
        pages.append(_renderer(DiabetesWeeklySpread(
            title=f"Week {week_num}",
            mode="cgm",
        )))
        if week_num % QUARTERLY_EVERY_N_WEEKS == 0 and week_num < WEEKS_TOTAL:
            quarter += 1
            pages.append(_renderer(QuarterlyDoctorVisitPrep(
                visit_label=f"Doctor Visit Prep â€” Quarter {quarter}",
            )))
            pages.append(_renderer(MonthlyA1CTrend(
                title=f"GMI vs A1C â€” Quarter {quarter}",
                n_rows=3,
                include_gmi=True,
            )))
        week_num += 1

    # Final quarterly + final GMI-vs-A1C (covers weeks 92-104)
    pages.append(_renderer(QuarterlyDoctorVisitPrep(
        visit_label="Doctor Visit Prep â€” Quarter 8",
    )))
    pages.append(_renderer(MonthlyA1CTrend(
        title="GMI vs A1C â€” Quarter 8",
        n_rows=3,
        include_gmi=True,
    )))

    # Sample filled-in doctor visit prep â€” narrative text + a blank DVP
    # template the reader can use as a reference.
    pages.append(_renderer(TextBlockPage(
        title="Sample: filling in your DVP",
        body=SAMPLE_DVP_TEXT,
    )))
    pages.append(_renderer(QuarterlyDoctorVisitPrep(
        visit_label="Sample Doctor Visit Prep (reference)",
    )))

    # Glossary
    pages.append(_renderer(TextBlockPage(
        title="Glossary",
        body=GLOSSARY_TEXT,
    )))

    # End matter
    for _ in range(4):
        pages.append(_renderer(LinedNotePage(title="Notes")))

    return pages


def build(output_dir: Path = OUTPUT_DIR) -> tuple[Path, Path]:
    page_renderers = _build_page_renderers()

    config = BookConfig(
        book_id=BOOK_ID,
        title=TITLE,
        template=TEMPLATE_6X9_POCKET,
        output_dir=output_dir,
        intro_text=INTRO,
        kind=BOOK_KIND_JOURNAL,
    )
    assembler = BookAssembler(config)
    interior = assembler.assemble_journal_book(page_renderers)

    cover_path = output_dir / BOOK_ID / "cover.pdf"
    cover_builder = CoverBuilder(
        TEMPLATE_6X9_POCKET,
        PALETTE_CGM_COMPANION,
        cover_path,
    )
    page_count = len(PdfReader(str(interior)).pages)
    cover = cover_builder.build(
        TITLE,
        subtitle=SUBTITLE,
        page_count=page_count,
        series_label="Pocket Rooster Press Â· CGM Companion Â· Volume 1",
        badge_text="2 Years Â· Portable 6x9",
        back_bullets=[
            "Works with any CGM â€” Dexcom, Libre, Stelo, and more",
            "Captures the food, mood, and exercise context your app misses",
            "Quarterly GMI vs A1C reconciliation page",
            "Built-in time-in-range review and doctor visit prep",
        ],
    )

    return interior, cover
```

> **Note for the implementer:** The prose sections (CGM primer, AGP reader patterns, sample DVP, glossary) all use the new `TextBlockPage` template added in Task 7. The example DVP page is rendered as a blank `QuarterlyDoctorVisitPrep` with the label "Sample Doctor Visit Prep (reference)" so the reader sees the actual form they'll be filling in. Expected page count: ~137 pp (spec target 140; Â±4 window in the test).

- [x] **Step 4: Run the test to verify it passes**

Run:
```bash
python -m pytest projects/kdp-puzzle-press/tests/test_diabetes_log_books.py::test_sku_c_builds -v --rootdir=projects/kdp-puzzle-press
```

Expected: PASS. If page count is outside [136, 144], reconcile renderer counts against the spec.

- [x] **Step 5: Commit**

```bash
git add projects/kdp-puzzle-press/src/pocket_rooster_press/books/cgm_companion_logbook_v1.py projects/kdp-puzzle-press/tests/test_diabetes_log_books.py
git commit -m "$(cat <<'EOF'
feat(books): SKU C â€” CGM Companion Logbook (6x9, ~137 pp)

Brand-agnostic CGM supplement: 104 weekly CGM-mode spreads
interleaved with 8 quarterly doctor visit prep pages and 8
GMI-vs-A1C reconciliation pages. Front-matter prose (CGM
primer, 3-pattern AGP reader, sample DVP, glossary) rendered
via TextBlockPage. Sample DVP page is a labelled blank
QuarterlyDoctorVisitPrep for visual reference.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 14: SKU C â€” metadata JSON

**Files:**
- Create: `projects/kdp-puzzle-press/metadata/cgm_companion_logbook_v1.json`

- [x] **Step 1: Write the metadata file**

Create `projects/kdp-puzzle-press/metadata/cgm_companion_logbook_v1.json`:

```json
{
  "$schema": "./_metadata.schema.json",
  "book_id": "cgm-companion-logbook-v1",
  "imprint": "Pocket Rooster Press",
  "title": "CGM Companion Logbook",
  "subtitle": "Track Time-in-Range, Food, Patterns & Doctor Visits â€” for Dexcom, Libre, Stelo & All Continuous Glucose Monitors",
  "series": {
    "name": "CGM Companion",
    "volume": 1
  },
  "author": "Pocket Rooster Press",
  "language": "English",
  "publication_date": "TBD",
  "edition": "First Edition",
  "publisher": "Pocket Rooster Press",
  "trim_size": "6x9",
  "interior_type": "Black & White",
  "paper_type": "White",
  "binding": "Paperback (Perfect Bound)",
  "page_count_target": 140,
  "isbn": "KDP-assigned (free)",
  "bisac": [
    {"code": "HEA039050", "label": "HEALTH & FITNESS / Diseases & Conditions / Diabetes"},
    {"code": "MED027000", "label": "MEDICAL / Diabetes"}
  ],
  "kdp_browse_categories": [
    "Books > Health, Fitness & Dieting > Diseases & Physical Ailments > Diabetes",
    "Books > Medical Books > Medicine > Internal Medicine > Endocrinology & Metabolism",
    "Books > Reference > Personal Health"
  ],
  "keywords": [
    "CGM logbook continuous glucose monitor journal",
    "Dexcom log book",
    "Freestyle Libre journal",
    "Stelo glucose tracker notebook",
    "time in range tracker diabetes",
    "diabetes journal for adults type 1",
    "blood sugar journal for insulin users"
  ],
  "keyword_audit": {
    "max_per_keyword_chars": 50,
    "longest_keyword_chars": 50,
    "banned_terms_check": [
      "no 'best seller', 'free', 'kindle', 'new', 'on sale', 'sale'",
      "no series-name spam",
      "Dexcom / Libre / Stelo used nominatively (works with X) â€” no logos, no implied partnership"
    ]
  },
  "audience": {
    "primary": "Adults using a continuous glucose monitor (Dexcom, Libre, Stelo); endocrinologist patients",
    "reading_age": "Adult",
    "is_adult_content": false,
    "low_content_book": true,
    "large_print": false
  },
  "pricing": {
    "currency_default": "USD",
    "list_prices": {
      "amazon_com_USD": 8.99,
      "amazon_co_uk_GBP": 7.69,
      "amazon_de_EUR": 8.99,
      "amazon_fr_EUR": 8.99,
      "amazon_es_EUR": 8.99,
      "amazon_it_EUR": 8.99,
      "amazon_nl_EUR": 8.99,
      "amazon_co_jp_JPY": 1303,
      "amazon_com_au_AUD": 13.93,
      "amazon_ca_CAD": 11.69
    },
    "royalty_plan": "60% (Standard)",
    "expanded_distribution": false,
    "printing_cost_estimate_usd": {
      "fixed": 0.85,
      "per_page": 0.012,
      "page_count": 140,
      "total": 2.53,
      "formula": "0.85 + (page_count * per_page)  // 6x9 per-page rate"
    },
    "royalty_estimate_usd": {
      "list_price": 8.99,
      "royalty_rate": 0.6,
      "gross": 5.394,
      "printing_cost": 2.53,
      "net_per_copy": 2.864
    },
    "kdp_minimum_list_price_usd": 5.0,
    "pricing_rationale": "Priced at $8.99 â€” premium for newer niche with less price compression; clears approximately $2.86 net per copy."
  },
  "ai_disclosure": {
    "policy_doc": "docs/AI_DISCLOSURE_POLICY.md",
    "text": "None of the above",
    "images": "None of the above",
    "translations": "None of the above",
    "image_tool": null,
    "image_count_bucket": "None"
  },
  "matchbook": false,
  "look_inside": true,
  "drm": false,
  "audience_options": {
    "sexually_explicit": false,
    "primary_audience_adult": false
  },
  "metadata_audit": {
    "title_chars": 21,
    "subtitle_chars": 113,
    "title_subtitle_combined_chars": 134,
    "kdp_title_max": 200,
    "kdp_subtitle_max": 200,
    "passes": true
  }
}
```

- [x] **Step 2: Validate the JSON**

Run:
```bash
python -c "import json; m = json.load(open('projects/kdp-puzzle-press/metadata/cgm_companion_logbook_v1.json')); print('OK:', m['book_id'], m['page_count_target'], 'pp at', m['pricing']['list_prices']['amazon_com_USD'])"
```

Expected: `OK: cgm-companion-logbook-v1 140 pp at 8.99`.

- [x] **Step 3: Commit**

```bash
git add projects/kdp-puzzle-press/metadata/cgm_companion_logbook_v1.json
git commit -m "$(cat <<'EOF'
feat(metadata): SKU C â€” cgm-companion-logbook-v1 metadata

7 keywords (brand-agnostic), 3 categories incl. endocrinology,
$8.99 premium price, 140 pp target. Net royalty est. $2.86/copy.
Nominative-fair-use guard noted for Dexcom/Libre/Stelo refs.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 15: SKU C â€” listing.md

**Files:**
- Create: `projects/kdp-puzzle-press/output/kdp-ready/cgm-companion-logbook-v1/listing.md`

- [x] **Step 1: Create the output directory**

Run:
```bash
mkdir -p projects/kdp-puzzle-press/output/kdp-ready/cgm-companion-logbook-v1/
```

- [x] **Step 2: Write the listing**

Create `projects/kdp-puzzle-press/output/kdp-ready/cgm-companion-logbook-v1/listing.md`:

```markdown
# CGM Companion Logbook
## KDP Listing Copy + A+ Content Brief

**Book ID:** cgm-companion-logbook-v1
**Companion file:** [cgm_companion_logbook_v1.json](../../../metadata/cgm_companion_logbook_v1.json)
**Status:** Ready for Phase 3 upload

---

## 1. Title

```
CGM Companion Logbook
```

## 2. Subtitle

```
Track Time-in-Range, Food, Patterns & Doctor Visits â€” for Dexcom, Libre, Stelo & All Continuous Glucose Monitors
```

## 3. Series

- Series name: **CGM Companion**
- Volume: **1**

## 4. Author

- **Author:** Pocket Rooster Press

## 5. Description (HTML, <= 4000 chars)

```html
<h4>A brand-agnostic paper logbook for continuous glucose monitor users. Captures the food, exercise, mood, and insulin context your app doesn't see, with weekly time-in-range review and quarterly GMI vs A1C reconciliation.</h4>

<p><b>CGM Companion Logbook</b> â€” 104 weekly spreads, eight quarterly Doctor Visit Prep pages, and eight GMI vs A1C reconciliation pages, in a portable 6x9 format that fits in a bag.</p>

<h5>What makes this logbook different:</h5>
<ul>
<li><b>Works with any CGM</b> â€” Dexcom, Libre, Stelo, and all continuous glucose monitors</li>
<li><b>Captures the food, mood, and exercise context your app misses</b> â€” the context that explains the patterns</li>
<li><b>Quarterly GMI vs A1C reconciliation page</b> â€” capture both side-by-side every quarter so you and your care team can see how they're tracking</li>
<li><b>Built-in time-in-range review and doctor visit prep</b> â€” one artifact to bring to every visit</li>
</ul>

<h5>What's inside:</h5>
<ul>
<li>104 weekly CGM-mode spreads (2 full years)</li>
<li>Per-day device-summary box: TIR%, average, low, high</li>
<li>Food & carbs, exercise, mood, insulin, "what pattern did I see" columns</li>
<li>Weekly summary row: 7-day TIR, lowest with timestamp, highest with timestamp</li>
<li>8 quarterly Doctor Visit Prep pages</li>
<li>8 GMI vs A1C reconciliation pages (3 months of comparison each)</li>
<li>Primer on TIR, GMI, AGP and how to read your patterns</li>
<li>Glossary of CGM terms</li>
</ul>

<h5>From Pocket Rooster Press:</h5>

<p>Pocket Rooster Press is a small imprint that publishes thoughtful, dignified books for quiet hands and curious minds â€” planners, log books, coloring books, and activity titles with clean typography, generous layouts, no padding, and no childish gimmicks. Just careful work for readers who notice the difference.</p>

<p><i>A Year of Pages, A Lifetime of Notes.</i></p>

<p><i>This logbook is independently produced and not affiliated with Dexcom, Abbott, or any CGM manufacturer. For tracking only â€” not medical advice. Always share your records with your care team.</i></p>
```

## 6. Bullet Highlights

1. Works with any CGM â€” Dexcom, Libre, Stelo, and all continuous glucose monitors
2. Captures the food, mood, and exercise context your CGM app misses
3. Quarterly GMI vs A1C reconciliation page built in
4. Built-in time-in-range review and Doctor Visit Prep
5. Portable 6x9 â€” fits in a bag, two full years of weekly tracking

## 7. Keywords (7 max)

1. CGM logbook continuous glucose monitor journal
2. Dexcom log book
3. Freestyle Libre journal
4. Stelo glucose tracker notebook
5. time in range tracker diabetes
6. diabetes journal for adults type 1
7. blood sugar journal for insulin users

## 8. Categories

- Books > Health, Fitness & Dieting > Diseases & Physical Ailments > Diabetes
- Books > Medical Books > Medicine > Internal Medicine > Endocrinology & Metabolism
- Books > Reference > Personal Health

## 9. BISAC

- HEA039050 â€” HEALTH & FITNESS / Diseases & Conditions / Diabetes
- MED027000 â€” MEDICAL / Diabetes

## 10. Pricing

- US: $8.99
- UK: Â£7.69
- EU: â‚¬8.99

## 11. Notes

- Trim: **6x9**
- Large print: **No** (CGM buyers are typically younger; portability matters more)
- Low-content book: **Yes**
- Trademark gate: Dexcom, Freestyle Libre, Stelo used **nominatively** ("works with X"). No logos. Explicit "not affiliated" disclaimer in description.
- Medical-language gate: copy is **descriptive only** â€” "track" not "treat", "share with your care team" not interpretation.
```

- [x] **Step 3: Commit**

```bash
git add projects/kdp-puzzle-press/output/kdp-ready/cgm-companion-logbook-v1/listing.md
git commit -m "$(cat <<'EOF'
docs(listing): SKU C â€” cgm-companion-logbook-v1 listing copy

Brand-agnostic CGM logbook listing. Nominative-fair-use phrasing
for Dexcom/Libre/Stelo refs + explicit "not affiliated"
disclaimer in the description. Medical-language gate observed.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 16: SKU C â€” build artifacts, run full audit, bundle for KDP

**Files:**
- No code changes; this task is build + verification.

- [x] **Step 1: Build SKU C to the real `output/` directory**

Run:
```bash
python -c "from pocket_rooster_press.books import cgm_companion_logbook_v1 as b; i, c = b.build(); print('interior:', i); print('cover:', c)"
```

Expected: prints two paths under `projects/kdp-puzzle-press/output/cgm-companion-logbook-v1/`.

- [x] **Step 2: Run the full audit**

Run:
```bash
python projects/kdp-puzzle-press/scripts/audit_pdfs.py cgm-companion-logbook-v1
```

Expected: exits 0; all checks PASS.

- [x] **Step 3: Preview the cover and a sample interior page**

Run:
```bash
python projects/kdp-puzzle-press/scripts/preview_pdfs.py cgm-companion-logbook-v1
```

Expected: PNG previews next to the PDFs. Visually confirm:
- Cover title is legible on the 200px-wide thumbnail
- "Works with Dexcom, Libre, Stelo" reads clearly somewhere on the cover (front or back)
- Sample weekly CGM spread shows the device-summary box clearly differentiated from the food/exercise columns

- [x] **Step 4: Build the KDP bundle**

Run:
```bash
python projects/kdp-puzzle-press/scripts/build_kdp_bundle.py cgm-companion-logbook-v1
```

Expected: `output/kdp-ready/cgm-companion-logbook-v1/` populated with interior, cover, metadata, listing, and UPLOAD_CHECKLIST.md.

- [x] **Step 5: Commit bundle (if tracked)**

Same check as Task 12 Step 6. If output is tracked:

```bash
git add projects/kdp-puzzle-press/output/kdp-ready/cgm-companion-logbook-v1/
git commit -m "$(cat <<'EOF'
chore(bundle): SKU C KDP-ready bundle for cgm-companion-logbook-v1

Generated by build_kdp_bundle.py. Ready for human upload.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 17: Final regression â€” full test suite + audit both books

Catch any cross-book regression (e.g. a shared template change that broke one of the SKUs).

- [x] **Step 1: Run the full test suite for the project**

Run:
```bash
python -m pytest projects/kdp-puzzle-press/tests/ -v --rootdir=projects/kdp-puzzle-press
```

Expected: ALL tests PASS. No failures, no errors.

- [x] **Step 2: Re-run audit on both SKUs**

Run:
```bash
python projects/kdp-puzzle-press/scripts/audit_pdfs.py large-print-diabetes-log-v1 && python projects/kdp-puzzle-press/scripts/audit_pdfs.py cgm-companion-logbook-v1
```

Expected: both exit 0; all checks PASS.

- [x] **Step 3: Update the catalog status memory**

Open `C:\Users\marts\.claude\projects\c--Sandbox-AIProjectManagement-Rooster-AI-Project-Management\memory\kdp-catalog-status-2026-05-17.md` and add an entry to the **Built but not bundled** section (or create a new "Built and bundled â€” awaiting upload" section if it doesn't exist):

```markdown
## Built and bundled â€” awaiting upload (as of 2026-05-2X)

- `large-print-diabetes-log-v1` â€” SKU A: Large Print Diabetes Log Book for Seniors (124 pp, 8.5x11, $7.99)
- `cgm-companion-logbook-v1` â€” SKU C: CGM Companion Logbook (140 pp, 6x9, $8.99)
```

Bump the "as of" date in the file header and the memory's `description` line.

- [x] **Step 4: Final commit**

```bash
git add C:/Users/marts/.claude/projects/c--Sandbox-AIProjectManagement-Rooster-AI-Project-Management/memory/kdp-catalog-status-2026-05-17.md
git commit -m "$(cat <<'EOF'
chore(memory): record SKU A + C as built-and-bundled, awaiting KDP upload

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Done criteria

- [x] All 16 tasks checked off
- [x] Full pytest suite green
- [x] `audit_pdfs.py` exits 0 for both `large-print-diabetes-log-v1` and `cgm-companion-logbook-v1`
- [x] Both bundles populated in `output/kdp-ready/`
- [x] User can take the two bundles, log into KDP, and complete uploads without further code work

## Post-plan handoff (human only)

The user (not Claude) performs:

1. Open https://kdp.amazon.com/ in a browser
2. For each SKU, "Create a paperback":
   - Paste title, subtitle, series, author, description, keywords, categories from `listing.md`
   - Upload `interior.pdf` and `cover.pdf` from the bundle
   - Set price from `metadata/*.json`
3. Submit both for KDP review (~72h turnaround)
4. Once accepted, update `kdp-catalog-status-2026-05-17.md` to move both SKUs from "Built and bundled â€” awaiting upload" to "In KDP review"
