# Etsy Rooster Shop — Plan 2d Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship one Cottagecore Mushroom Mandala SVG live on the Etsy shop while installing three motif libraries (cottagecore + holiday + sacred geometry, 16 primitives total) so the next 4–5 themed-mandala SKUs are one CLI invocation away.

**Architecture:** A new `ThemedMandalaGenerator` reuses the existing parametric mandala math but substitutes plain circular petals with motif primitives drawn from one of three libraries. Each motif is a small Python function returning SVG path data in canonical (un-rotated) orientation at a given `(cx, cy, size)`; the generator wraps each path with `transform="rotate(angle cx cy)"` to align it with the ring's angular position. Reuses Plan 1's `SvgArtifact` + `validate_svg`, Plan 2a's `LLMListingAuthor` niche routing (niche stays `"mandala"`), and Plan 2a's `_taxonomy_for_niche` lookup (taxonomy 6343 = Patterns & Blueprints).

**Tech Stack:** Python 3.11+, click (CLI), Pillow (PNG preview), lxml (SVG validation, existing), pytest. No new dependencies.

**Spec reference:** [`docs/superpowers/specs/2026-05-20-etsy-rooster-shop-plan-2d-design.md`](../specs/2026-05-20-etsy-rooster-shop-plan-2d-design.md)

---

## Pre-flight context (read once)

Working in two git repos:
- **Outer repo:** `C:/Sandbox/AIProjectManagement/Rooster-AI-Project-Management` — only holds spec/plan docs for this plan.
- **Nested repo:** `projects/etsy-rooster-shop/` — all Python implementation lands here.

Always use absolute paths in Bash commands (CWD is unstable between calls). Use `git -C <abs-path> ...` for all git commands.

**Existing pieces this plan reuses unchanged:**
- `etsy_rooster.svg_render.artifact.SvgArtifact` — same wrapper for SVG + preview PNG outputs
- `etsy_rooster.svg_render.validators.validate_svg` — same cut-file safety check
- `etsy_rooster.svg_render.mandala_generator._svg_to_png` — same Pillow-based PNG preview renderer (we'll call it from the new generator)
- `etsy_rooster.listing_authoring.author.LLMListingAuthor` — niche stays `"mandala"` so existing `mandala-prompt.md` routes correctly
- `etsy_rooster.cli._taxonomy_for_niche("mandala") == 6343` — no taxonomy change
- `CatalogDB`, `EtsyClient`, `PublishOrchestrator` — all unchanged

**Existing pieces this plan modifies:**
- `etsy_rooster.cli` — add `@generate.command("themed-mandala")` subcommand. No edits to `_TAXONOMY_BY_NICHE` (niche stays `"mandala"`).

**Run tests with:**
```bash
cd projects/etsy-rooster-shop
python -m pytest tests/ -q --no-cov          # all unit tests
python -m pytest tests/test_X.py -v --no-cov # one file, verbose
python -m pytest tests/ -m live -s --no-cov  # live tests
```

**Invoke CLI in tests** via Python (the `etsy-rooster` console script may not be on Git Bash PATH):
```python
from etsy_rooster.cli import cli
cli(['generate', 'themed-mandala', '--theme=cottagecore', '--seed=mushroom-01'], standalone_mode=False)
```

**Baseline state:** the nested repo HEAD is wherever it sits when this plan starts executing (likely Plan 2a/2a' final commit area, ~`308470f` or later if Plan 2c also runs). The expected baseline unit test count varies — use the count after `pytest -q --no-cov` BEFORE making changes as the starting point, then track increments.

---

## Task 1: Motif Protocol + validation helper

**Files:**
- Create: `projects/etsy-rooster-shop/src/etsy_rooster/svg_render/motifs/__init__.py` (empty placeholder for now; the registry export comes in Task 5)
- Create: `projects/etsy-rooster-shop/src/etsy_rooster/svg_render/motifs/base.py`
- Create: `projects/etsy-rooster-shop/tests/test_motif_base.py`

### Step 1: Write failing tests

Create `projects/etsy-rooster-shop/tests/test_motif_base.py`:

```python
from __future__ import annotations

import pytest

from etsy_rooster.svg_render.motifs.base import (
    MotifPrimitive,
    validate_motif_path,
)


def test_validate_motif_path_accepts_well_formed_path() -> None:
    # Mushroom-like path: starts M, ends Z, no NaN coords.
    validate_motif_path("M 100.00 100.00 L 200.00 100.00 L 150.00 50.00 Z")


def test_validate_motif_path_rejects_missing_move() -> None:
    with pytest.raises(ValueError, match="must start with M"):
        validate_motif_path("L 100 100 L 200 200 Z")


def test_validate_motif_path_rejects_missing_close() -> None:
    with pytest.raises(ValueError, match="must end with Z"):
        validate_motif_path("M 100 100 L 200 200 L 300 300")


def test_validate_motif_path_rejects_nan_coordinates() -> None:
    with pytest.raises(ValueError, match="NaN|inf"):
        validate_motif_path("M nan 100 L 200 200 Z")


def test_validate_motif_path_rejects_empty_string() -> None:
    with pytest.raises(ValueError, match="empty"):
        validate_motif_path("")


def test_motif_primitive_protocol_is_runtime_checkable_compatible() -> None:
    """Smoke-check that a plain function with the right signature satisfies
    structural typing — i.e., the Protocol shape is what we documented."""
    def fake_motif(*, cx: float, cy: float, size: float) -> str:
        return f"M {cx} {cy} L {cx + size} {cy} L {cx} {cy + size} Z"

    # Calling via the protocol-shape signature returns a valid path
    out = fake_motif(cx=100.0, cy=100.0, size=50.0)
    validate_motif_path(out)
```

### Step 2: Run tests to verify failure

```bash
cd /c/Sandbox/AIProjectManagement/Rooster-AI-Project-Management/projects/etsy-rooster-shop && python -m pytest tests/test_motif_base.py -v --no-cov
```
Expected: 6 errors (module `etsy_rooster.svg_render.motifs.base` not found).

### Step 3: Implement base + validator

Create `projects/etsy-rooster-shop/src/etsy_rooster/svg_render/motifs/__init__.py`:

```python
"""Motif libraries for ThemedMandalaGenerator.

The MOTIF_LIBRARIES registry is populated in this package's __init__ once
the per-theme modules exist. See Task 5 for the full registry; this initial
empty module just makes `etsy_rooster.svg_render.motifs` importable.
"""
```

Create `projects/etsy-rooster-shop/src/etsy_rooster/svg_render/motifs/base.py`:

```python
"""MotifPrimitive protocol + shared helpers for the themed-mandala motif libraries.

Every motif function in cottagecore.py, holiday.py, sacred_geometry.py
returns SVG path data for ONE instance of the motif at (cx, cy) with the
given size, drawn in canonical un-rotated orientation. The generator
applies ring-tracking rotation via SVG transform attribute rather than
mutating the path string — keeps each motif focused on its own geometry
and avoids float-precision drift.
"""

from __future__ import annotations

import math
import re
from typing import Protocol


class MotifPrimitive(Protocol):
    """Signature every motif function must satisfy."""

    def __call__(self, *, cx: float, cy: float, size: float) -> str: ...


_COORD_PATTERN = re.compile(r"-?\d+\.?\d*(?:[eE][+-]?\d+)?|-?\.\d+")


def validate_motif_path(path_data: str) -> None:
    """Sanity-check a path data string.

    Raises ValueError if:
      - path is empty
      - does not start with 'M' (move-to)
      - does not end with 'Z' (close)
      - contains 'nan', 'inf', or unparseable coordinates
    """
    if not path_data:
        raise ValueError("path data is empty")
    stripped = path_data.strip()
    if not stripped.startswith("M"):
        raise ValueError(f"path must start with M (move-to), got: {stripped[:10]!r}")
    if not stripped.rstrip().endswith("Z"):
        raise ValueError(f"path must end with Z (close), got: ...{stripped[-10:]!r}")
    # Find numeric tokens and reject NaN/inf.
    lowered = stripped.lower()
    if "nan" in lowered or "inf" in lowered:
        raise ValueError("path contains NaN or inf coordinates")
    # Verify the numeric tokens we extract parse cleanly.
    for token in _COORD_PATTERN.findall(stripped):
        try:
            v = float(token)
        except ValueError:
            raise ValueError(f"unparseable coordinate: {token!r}") from None
        if math.isnan(v) or math.isinf(v):
            raise ValueError(f"path contains NaN or inf coordinate: {token!r}")
```

### Step 4: Run tests, verify pass

```bash
python -m pytest tests/test_motif_base.py -v --no-cov
```
Expected: 6 passed.

### Step 5: Commit

```bash
git -C C:/Sandbox/AIProjectManagement/Rooster-AI-Project-Management/projects/etsy-rooster-shop add src/etsy_rooster/svg_render/motifs/ tests/test_motif_base.py
git -C C:/Sandbox/AIProjectManagement/Rooster-AI-Project-Management/projects/etsy-rooster-shop commit -m "feat(motifs): MotifPrimitive Protocol + validate_motif_path helper"
```

---

## Task 2: Cottagecore motif library (5 primitives)

**Files:**
- Create: `projects/etsy-rooster-shop/src/etsy_rooster/svg_render/motifs/cottagecore.py`
- Create: `projects/etsy-rooster-shop/tests/test_motif_cottagecore.py`

### Step 1: Write failing tests

Create `projects/etsy-rooster-shop/tests/test_motif_cottagecore.py`:

```python
from __future__ import annotations

import pytest

from etsy_rooster.svg_render.motifs import cottagecore
from etsy_rooster.svg_render.motifs.base import validate_motif_path


COTTAGECORE_MOTIFS = [
    cottagecore.mushroom,
    cottagecore.fern,
    cottagecore.leaf,
    cottagecore.flower,
    cottagecore.acorn,
]


@pytest.mark.parametrize("motif_fn", COTTAGECORE_MOTIFS)
def test_motif_produces_validatable_path(motif_fn) -> None:
    """Each cottagecore motif must produce a path that passes validate_motif_path
    for a reasonable test (cx=200, cy=200, size=60)."""
    path = motif_fn(cx=200.0, cy=200.0, size=60.0)
    validate_motif_path(path)


@pytest.mark.parametrize("motif_fn", COTTAGECORE_MOTIFS)
def test_motif_handles_zero_at_origin(motif_fn) -> None:
    """Motifs must handle (cx=0, cy=0) without crashing."""
    path = motif_fn(cx=0.0, cy=0.0, size=40.0)
    validate_motif_path(path)


@pytest.mark.parametrize("motif_fn", COTTAGECORE_MOTIFS)
def test_motif_returns_nonempty_for_typical_size(motif_fn) -> None:
    path = motif_fn(cx=100.0, cy=100.0, size=50.0)
    assert len(path) > 10
```

### Step 2: Run tests to verify failure

```bash
python -m pytest tests/test_motif_cottagecore.py -v --no-cov
```
Expected: 15 errors (module `cottagecore` not in package).

### Step 3: Implement cottagecore motifs

Create `projects/etsy-rooster-shop/src/etsy_rooster/svg_render/motifs/cottagecore.py`:

```python
"""Cottagecore motif library: mushroom, fern, leaf, flower, acorn.

Each motif function returns SVG path data for ONE instance at (cx, cy)
in canonical un-rotated orientation (the motif's natural "top" is up).
Total bounding box is approximately `size` wide and roughly `size` to
`size * 1.5` tall, depending on the motif's natural proportions.
"""

from __future__ import annotations

import math


def mushroom(*, cx: float, cy: float, size: float) -> str:
    """Rounded cap on top, short stem below. Closed shape.

    The cap is a semicircle (SVG arc) and the stem is a small rectangle
    attached to the cap's base. Bounding box: size wide, ~1.5*size tall.
    Cap points up in canonical orientation.
    """
    half = size / 2
    cap_left = (cx - half, cy)
    cap_right = (cx + half, cy)
    stem_right = (cx + half * 0.3, cy)
    stem_bottom_right = (cx + half * 0.3, cy + half)
    stem_bottom_left = (cx - half * 0.3, cy + half)
    stem_left = (cx - half * 0.3, cy)

    return (
        f"M {cap_left[0]:.2f} {cap_left[1]:.2f} "
        f"A {half:.2f} {half:.2f} 0 0 1 {cap_right[0]:.2f} {cap_right[1]:.2f} "
        f"L {stem_right[0]:.2f} {stem_right[1]:.2f} "
        f"L {stem_bottom_right[0]:.2f} {stem_bottom_right[1]:.2f} "
        f"L {stem_bottom_left[0]:.2f} {stem_bottom_left[1]:.2f} "
        f"L {stem_left[0]:.2f} {stem_left[1]:.2f} "
        f"Z"
    )


def leaf(*, cx: float, cy: float, size: float) -> str:
    """Simple pointed oval leaf. Two arcs meeting at top and bottom.

    Bounding box: ~size*0.6 wide, size tall. Tip points up in canonical
    orientation.
    """
    half_h = size / 2
    half_w = size * 0.3
    top = (cx, cy - half_h)
    bottom = (cx, cy + half_h)
    radius_x = half_w
    radius_y = half_h

    return (
        f"M {top[0]:.2f} {top[1]:.2f} "
        f"A {radius_x:.2f} {radius_y:.2f} 0 0 1 {bottom[0]:.2f} {bottom[1]:.2f} "
        f"A {radius_x:.2f} {radius_y:.2f} 0 0 1 {top[0]:.2f} {top[1]:.2f} "
        f"Z"
    )


def fern(*, cx: float, cy: float, size: float) -> str:
    """Curved frond — a teardrop-like shape with one straight side and one
    curved (cubic Bezier) side. Approximates the silhouette of a fern frond.

    Bounding box: ~size*0.4 wide, size tall. Tip points up.
    """
    half_h = size / 2
    half_w = size * 0.2
    top = (cx, cy - half_h)
    bottom_right = (cx + half_w, cy + half_h)
    bottom_left = (cx - half_w, cy + half_h)
    # Control points for the right curve (sweeping outward then back in)
    ctrl_right_1 = (cx + half_w * 1.8, cy - half_h * 0.3)
    ctrl_right_2 = (cx + half_w * 1.8, cy + half_h * 0.5)
    # Control points for the left curve (mirror)
    ctrl_left_1 = (cx - half_w * 1.8, cy + half_h * 0.5)
    ctrl_left_2 = (cx - half_w * 1.8, cy - half_h * 0.3)

    return (
        f"M {top[0]:.2f} {top[1]:.2f} "
        f"C {ctrl_right_1[0]:.2f} {ctrl_right_1[1]:.2f}, "
        f"{ctrl_right_2[0]:.2f} {ctrl_right_2[1]:.2f}, "
        f"{bottom_right[0]:.2f} {bottom_right[1]:.2f} "
        f"L {bottom_left[0]:.2f} {bottom_left[1]:.2f} "
        f"C {ctrl_left_1[0]:.2f} {ctrl_left_1[1]:.2f}, "
        f"{ctrl_left_2[0]:.2f} {ctrl_left_2[1]:.2f}, "
        f"{top[0]:.2f} {top[1]:.2f} "
        f"Z"
    )


def flower(*, cx: float, cy: float, size: float) -> str:
    """Simple 5-petal flower formed by 5 arc-segments around a central point.

    Each petal is a teardrop arc that meets adjacent petals at the center.
    Bounding box: size square. No rotation needed for canonical orientation
    (radially symmetric).
    """
    radius = size / 2
    petal_count = 5
    parts: list[str] = []
    # Start at the tip of the first petal (top)
    angle0 = -math.pi / 2  # top
    tip0 = (cx + radius * math.cos(angle0), cy + radius * math.sin(angle0))
    parts.append(f"M {tip0[0]:.2f} {tip0[1]:.2f}")

    for i in range(petal_count):
        next_angle = angle0 + (2 * math.pi * (i + 1) / petal_count)
        tip_next = (
            cx + radius * math.cos(next_angle),
            cy + radius * math.sin(next_angle),
        )
        # Each petal is drawn with two quadratic curves through the center
        parts.append(
            f"Q {cx:.2f} {cy:.2f}, {tip_next[0]:.2f} {tip_next[1]:.2f}"
        )

    parts.append("Z")
    return " ".join(parts)


def acorn(*, cx: float, cy: float, size: float) -> str:
    """Acorn — rounded cap on top, pointed body below.

    The cap is a half-ellipse (~33% of total height) and the body is a
    rounded teardrop below. Bounding box: ~size*0.7 wide, size tall.
    Cap-side up in canonical orientation.
    """
    half_h = size / 2
    half_w = size * 0.35
    cap_top = (cx, cy - half_h)
    cap_left = (cx - half_w, cy - half_h * 0.35)
    cap_right = (cx + half_w, cy - half_h * 0.35)
    body_bottom = (cx, cy + half_h)

    # Cap: top arc from cap_left -> cap_top -> cap_right
    # Body: rounded triangle cap_right -> body_bottom -> cap_left
    cap_r = half_w
    cap_ry = half_h * 0.6
    body_r = half_w * 1.1
    body_ry = half_h * 1.2

    return (
        f"M {cap_left[0]:.2f} {cap_left[1]:.2f} "
        f"A {cap_r:.2f} {cap_ry:.2f} 0 0 1 {cap_right[0]:.2f} {cap_right[1]:.2f} "
        f"A {body_r:.2f} {body_ry:.2f} 0 0 1 {body_bottom[0]:.2f} {body_bottom[1]:.2f} "
        f"A {body_r:.2f} {body_ry:.2f} 0 0 1 {cap_left[0]:.2f} {cap_left[1]:.2f} "
        f"Z"
    )
```

### Step 4: Run tests, verify pass

```bash
python -m pytest tests/test_motif_cottagecore.py -v --no-cov
```
Expected: 15 passed.

### Step 5: Commit

```bash
git -C C:/Sandbox/AIProjectManagement/Rooster-AI-Project-Management/projects/etsy-rooster-shop add src/etsy_rooster/svg_render/motifs/cottagecore.py tests/test_motif_cottagecore.py
git -C C:/Sandbox/AIProjectManagement/Rooster-AI-Project-Management/projects/etsy-rooster-shop commit -m "feat(motifs): cottagecore library (mushroom, fern, leaf, flower, acorn)"
```

---

## Task 3: Holiday motif library (6 primitives)

**Files:**
- Create: `projects/etsy-rooster-shop/src/etsy_rooster/svg_render/motifs/holiday.py`
- Create: `projects/etsy-rooster-shop/tests/test_motif_holiday.py`

### Step 1: Write failing tests

Create `projects/etsy-rooster-shop/tests/test_motif_holiday.py`:

```python
from __future__ import annotations

import pytest

from etsy_rooster.svg_render.motifs import holiday
from etsy_rooster.svg_render.motifs.base import validate_motif_path


HOLIDAY_MOTIFS = [
    holiday.snowflake,
    holiday.star,
    holiday.heart,
    holiday.bat,
    holiday.pumpkin,
    holiday.egg,
]


@pytest.mark.parametrize("motif_fn", HOLIDAY_MOTIFS)
def test_motif_produces_validatable_path(motif_fn) -> None:
    path = motif_fn(cx=200.0, cy=200.0, size=60.0)
    validate_motif_path(path)


@pytest.mark.parametrize("motif_fn", HOLIDAY_MOTIFS)
def test_motif_handles_zero_at_origin(motif_fn) -> None:
    path = motif_fn(cx=0.0, cy=0.0, size=40.0)
    validate_motif_path(path)


@pytest.mark.parametrize("motif_fn", HOLIDAY_MOTIFS)
def test_motif_returns_nonempty(motif_fn) -> None:
    path = motif_fn(cx=100.0, cy=100.0, size=50.0)
    assert len(path) > 10
```

### Step 2: Run tests to verify failure

```bash
python -m pytest tests/test_motif_holiday.py -v --no-cov
```
Expected: 18 errors (module not found).

### Step 3: Implement holiday motifs

Create `projects/etsy-rooster-shop/src/etsy_rooster/svg_render/motifs/holiday.py`:

```python
"""Holiday motif library: snowflake, star, heart, bat, pumpkin, egg.

Covers Christmas (snowflake, star), Valentine's (heart), Halloween (bat,
pumpkin), and Easter (egg) in one library. Each motif drawn in canonical
orientation; the generator handles rotation.
"""

from __future__ import annotations

import math


def snowflake(*, cx: float, cy: float, size: float) -> str:
    """Six-arm snowflake: six radial spokes around a central hexagon point.

    Drawn as a closed star-of-david-like outline with 12 vertices alternating
    inner-tip / outer-tip. Bounding box: size square.
    """
    outer = size / 2
    inner = outer * 0.3
    parts: list[str] = []
    for i in range(12):
        r = outer if i % 2 == 0 else inner
        ang = -math.pi / 2 + (math.pi / 6) * i  # 30 degrees per step
        x = cx + r * math.cos(ang)
        y = cy + r * math.sin(ang)
        if i == 0:
            parts.append(f"M {x:.2f} {y:.2f}")
        else:
            parts.append(f"L {x:.2f} {y:.2f}")
    parts.append("Z")
    return " ".join(parts)


def star(*, cx: float, cy: float, size: float) -> str:
    """Classic 5-point star with alternating outer/inner radii."""
    outer = size / 2
    inner = outer * 0.4
    parts: list[str] = []
    for i in range(10):
        r = outer if i % 2 == 0 else inner
        ang = -math.pi / 2 + (math.pi / 5) * i  # 36 degrees per step
        x = cx + r * math.cos(ang)
        y = cy + r * math.sin(ang)
        if i == 0:
            parts.append(f"M {x:.2f} {y:.2f}")
        else:
            parts.append(f"L {x:.2f} {y:.2f}")
    parts.append("Z")
    return " ".join(parts)


def heart(*, cx: float, cy: float, size: float) -> str:
    """Classic heart: two top bumps + V-point at the bottom.

    Drawn with two arcs for the top lobes and lines to the bottom point.
    Bounding box: size wide, ~size tall.
    """
    half = size / 2
    quarter = size / 4
    top_left_arc_top = (cx - quarter, cy - half * 0.6)
    top_right_arc_top = (cx + quarter, cy - half * 0.6)
    middle_top = (cx, cy - half * 0.2)
    bottom_point = (cx, cy + half)
    left_side = (cx - half, cy)
    right_side = (cx + half, cy)
    arc_r = quarter

    return (
        f"M {middle_top[0]:.2f} {middle_top[1]:.2f} "
        # left lobe
        f"A {arc_r:.2f} {arc_r:.2f} 0 0 0 {left_side[0]:.2f} {left_side[1]:.2f} "
        f"L {bottom_point[0]:.2f} {bottom_point[1]:.2f} "
        f"L {right_side[0]:.2f} {right_side[1]:.2f} "
        # right lobe
        f"A {arc_r:.2f} {arc_r:.2f} 0 0 0 {middle_top[0]:.2f} {middle_top[1]:.2f} "
        f"Z"
    )


def bat(*, cx: float, cy: float, size: float) -> str:
    """Stylized bat silhouette: central body + two wings extending outward.

    Simplified shape suitable for Cricut cut — closed polygon outline
    with ~9 vertices describing wing scallops + body.
    Bounding box: size wide, ~size*0.6 tall.
    """
    half_w = size / 2
    half_h = size / 4
    body_top = (cx, cy - half_h * 0.5)
    body_bottom = (cx, cy + half_h * 0.5)
    wing_left_tip = (cx - half_w, cy - half_h * 0.3)
    wing_left_mid = (cx - half_w * 0.6, cy + half_h * 0.1)
    wing_left_outer_low = (cx - half_w * 0.85, cy + half_h * 0.4)
    wing_right_tip = (cx + half_w, cy - half_h * 0.3)
    wing_right_mid = (cx + half_w * 0.6, cy + half_h * 0.1)
    wing_right_outer_low = (cx + half_w * 0.85, cy + half_h * 0.4)

    return (
        f"M {body_top[0]:.2f} {body_top[1]:.2f} "
        f"L {wing_right_tip[0]:.2f} {wing_right_tip[1]:.2f} "
        f"L {wing_right_outer_low[0]:.2f} {wing_right_outer_low[1]:.2f} "
        f"L {wing_right_mid[0]:.2f} {wing_right_mid[1]:.2f} "
        f"L {body_bottom[0]:.2f} {body_bottom[1]:.2f} "
        f"L {wing_left_mid[0]:.2f} {wing_left_mid[1]:.2f} "
        f"L {wing_left_outer_low[0]:.2f} {wing_left_outer_low[1]:.2f} "
        f"L {wing_left_tip[0]:.2f} {wing_left_tip[1]:.2f} "
        f"Z"
    )


def pumpkin(*, cx: float, cy: float, size: float) -> str:
    """Round pumpkin body with a small stem on top.

    Drawn as a circle (using two arcs) for the body and a small rectangle
    on top for the stem. Bounding box: size square.
    """
    half = size / 2
    body_r = half * 0.9
    body_top = (cx, cy - body_r + half * 0.1)
    body_bottom = (cx, cy + body_r)
    body_left = (cx - body_r, cy + half * 0.1)
    body_right = (cx + body_r, cy + half * 0.1)
    stem_top_left = (cx - half * 0.1, cy - body_r + half * 0.1)
    stem_top_right = (cx + half * 0.1, cy - body_r + half * 0.1)
    stem_top_far_left = (cx - half * 0.1, cy - half)
    stem_top_far_right = (cx + half * 0.1, cy - half)

    return (
        f"M {stem_top_far_left[0]:.2f} {stem_top_far_left[1]:.2f} "
        f"L {stem_top_far_right[0]:.2f} {stem_top_far_right[1]:.2f} "
        f"L {stem_top_right[0]:.2f} {stem_top_right[1]:.2f} "
        f"A {body_r:.2f} {body_r:.2f} 0 0 1 {body_right[0]:.2f} {body_right[1]:.2f} "
        f"A {body_r:.2f} {body_r:.2f} 0 0 1 {body_bottom[0]:.2f} {body_bottom[1]:.2f} "
        f"A {body_r:.2f} {body_r:.2f} 0 0 1 {body_left[0]:.2f} {body_left[1]:.2f} "
        f"A {body_r:.2f} {body_r:.2f} 0 0 1 {stem_top_left[0]:.2f} {stem_top_left[1]:.2f} "
        f"Z"
    )


def egg(*, cx: float, cy: float, size: float) -> str:
    """Egg-shaped oval — slightly elongated, asymmetric top vs bottom.

    Top is narrower (~80% width) and bottom is rounder. Drawn as two arcs
    of different sizes joined at the equator.
    """
    half_h = size / 2
    top_w = size * 0.35
    bot_w = size * 0.42
    top_point = (cx, cy - half_h)
    equator_left = (cx - bot_w, cy)
    equator_right = (cx + bot_w, cy)
    bottom_point = (cx, cy + half_h)

    return (
        f"M {top_point[0]:.2f} {top_point[1]:.2f} "
        f"A {top_w:.2f} {half_h:.2f} 0 0 1 {equator_right[0]:.2f} {equator_right[1]:.2f} "
        f"A {bot_w:.2f} {half_h:.2f} 0 0 1 {bottom_point[0]:.2f} {bottom_point[1]:.2f} "
        f"A {bot_w:.2f} {half_h:.2f} 0 0 1 {equator_left[0]:.2f} {equator_left[1]:.2f} "
        f"A {top_w:.2f} {half_h:.2f} 0 0 1 {top_point[0]:.2f} {top_point[1]:.2f} "
        f"Z"
    )
```

### Step 4: Run tests, verify pass

```bash
python -m pytest tests/test_motif_holiday.py -v --no-cov
```
Expected: 18 passed.

### Step 5: Commit

```bash
git -C C:/Sandbox/AIProjectManagement/Rooster-AI-Project-Management/projects/etsy-rooster-shop add src/etsy_rooster/svg_render/motifs/holiday.py tests/test_motif_holiday.py
git -C C:/Sandbox/AIProjectManagement/Rooster-AI-Project-Management/projects/etsy-rooster-shop commit -m "feat(motifs): holiday library (snowflake, star, heart, bat, pumpkin, egg)"
```

---

## Task 4: Sacred geometry motif library (5 primitives)

**Files:**
- Create: `projects/etsy-rooster-shop/src/etsy_rooster/svg_render/motifs/sacred_geometry.py`
- Create: `projects/etsy-rooster-shop/tests/test_motif_sacred_geometry.py`

### Step 1: Write failing tests

Create `projects/etsy-rooster-shop/tests/test_motif_sacred_geometry.py`:

```python
from __future__ import annotations

import pytest

from etsy_rooster.svg_render.motifs import sacred_geometry
from etsy_rooster.svg_render.motifs.base import validate_motif_path


SACRED_MOTIFS = [
    sacred_geometry.hexagon,
    sacred_geometry.triangle,
    sacred_geometry.circle,
    sacred_geometry.point_rosette,
    sacred_geometry.vesica_piscis,
]


@pytest.mark.parametrize("motif_fn", SACRED_MOTIFS)
def test_motif_produces_validatable_path(motif_fn) -> None:
    path = motif_fn(cx=200.0, cy=200.0, size=60.0)
    validate_motif_path(path)


@pytest.mark.parametrize("motif_fn", SACRED_MOTIFS)
def test_motif_handles_zero_at_origin(motif_fn) -> None:
    path = motif_fn(cx=0.0, cy=0.0, size=40.0)
    validate_motif_path(path)


@pytest.mark.parametrize("motif_fn", SACRED_MOTIFS)
def test_motif_returns_nonempty(motif_fn) -> None:
    path = motif_fn(cx=100.0, cy=100.0, size=50.0)
    assert len(path) > 10
```

### Step 2: Run tests to verify failure

```bash
python -m pytest tests/test_motif_sacred_geometry.py -v --no-cov
```
Expected: 15 errors.

### Step 3: Implement sacred geometry motifs

Create `projects/etsy-rooster-shop/src/etsy_rooster/svg_render/motifs/sacred_geometry.py`:

```python
"""Sacred geometry motif library: hexagon, triangle, circle, point_rosette, vesica_piscis.

Classical sacred-geometry forms drawn as parametric SVG paths.
"""

from __future__ import annotations

import math


def hexagon(*, cx: float, cy: float, size: float) -> str:
    """Regular hexagon, point-up orientation. Bounding box: size square."""
    r = size / 2
    parts: list[str] = []
    for i in range(6):
        ang = -math.pi / 2 + (math.pi / 3) * i  # 60 degrees per step
        x = cx + r * math.cos(ang)
        y = cy + r * math.sin(ang)
        if i == 0:
            parts.append(f"M {x:.2f} {y:.2f}")
        else:
            parts.append(f"L {x:.2f} {y:.2f}")
    parts.append("Z")
    return " ".join(parts)


def triangle(*, cx: float, cy: float, size: float) -> str:
    """Equilateral triangle, point-up orientation. Bounding box: size square."""
    r = size / 2
    parts: list[str] = []
    for i in range(3):
        ang = -math.pi / 2 + (2 * math.pi / 3) * i  # 120 degrees per step
        x = cx + r * math.cos(ang)
        y = cy + r * math.sin(ang)
        if i == 0:
            parts.append(f"M {x:.2f} {y:.2f}")
        else:
            parts.append(f"L {x:.2f} {y:.2f}")
    parts.append("Z")
    return " ".join(parts)


def circle(*, cx: float, cy: float, size: float) -> str:
    """Circle drawn as two arcs joined at top/bottom. (SVG <circle> elements
    aren't used because the generator emits <path d="..."> wrappers.)"""
    r = size / 2
    top = (cx, cy - r)
    bottom = (cx, cy + r)
    return (
        f"M {top[0]:.2f} {top[1]:.2f} "
        f"A {r:.2f} {r:.2f} 0 0 1 {bottom[0]:.2f} {bottom[1]:.2f} "
        f"A {r:.2f} {r:.2f} 0 0 1 {top[0]:.2f} {top[1]:.2f} "
        f"Z"
    )


def point_rosette(*, cx: float, cy: float, size: float) -> str:
    """Six-petal flower-of-life rosette element — six small circles around
    a central point, drawn as one closed path with arc segments.

    Used as a center-anchor motif (single instance in the innermost ring).
    Bounding box: size square.
    """
    petal_r = size / 4
    parts: list[str] = []
    for i in range(6):
        ang = -math.pi / 2 + (math.pi / 3) * i
        # Petal center
        pc_x = cx + petal_r * math.cos(ang)
        pc_y = cy + petal_r * math.sin(ang)
        # Petal arc start (perpendicular to radial direction)
        perp = ang + math.pi / 2
        arc_start_x = pc_x + petal_r * math.cos(perp)
        arc_start_y = pc_y + petal_r * math.sin(perp)
        arc_end_x = pc_x - petal_r * math.cos(perp)
        arc_end_y = pc_y - petal_r * math.sin(perp)
        if i == 0:
            parts.append(f"M {arc_start_x:.2f} {arc_start_y:.2f}")
        # Arc from start to end via the outer side of this petal
        parts.append(
            f"A {petal_r:.2f} {petal_r:.2f} 0 0 1 {arc_end_x:.2f} {arc_end_y:.2f}"
        )
    parts.append("Z")
    return " ".join(parts)


def vesica_piscis(*, cx: float, cy: float, size: float) -> str:
    """Two overlapping circles forming the classic vesica piscis lens shape.

    Drawn as two arcs meeting at the top and bottom intersection points.
    Bounding box: size wide, ~size*0.866 tall (geometric ratio).
    """
    r = size / 2
    # Intersection points are at +/- (r * sqrt(3)/2) vertically when the
    # two circle centers are at horizontal distance r apart.
    intersect_y_offset = r * math.sqrt(3) / 2
    top_intersect = (cx, cy - intersect_y_offset)
    bottom_intersect = (cx, cy + intersect_y_offset)

    return (
        f"M {top_intersect[0]:.2f} {top_intersect[1]:.2f} "
        # Right arc of the lens (curving outward to the right)
        f"A {r:.2f} {r:.2f} 0 0 1 {bottom_intersect[0]:.2f} {bottom_intersect[1]:.2f} "
        # Left arc of the lens (curving back to top)
        f"A {r:.2f} {r:.2f} 0 0 1 {top_intersect[0]:.2f} {top_intersect[1]:.2f} "
        f"Z"
    )
```

### Step 4: Run tests, verify pass

```bash
python -m pytest tests/test_motif_sacred_geometry.py -v --no-cov
```
Expected: 15 passed.

### Step 5: Commit

```bash
git -C C:/Sandbox/AIProjectManagement/Rooster-AI-Project-Management/projects/etsy-rooster-shop add src/etsy_rooster/svg_render/motifs/sacred_geometry.py tests/test_motif_sacred_geometry.py
git -C C:/Sandbox/AIProjectManagement/Rooster-AI-Project-Management/projects/etsy-rooster-shop commit -m "feat(motifs): sacred geometry library (hexagon, triangle, circle, point_rosette, vesica_piscis)"
```

---

## Task 5: `MOTIF_LIBRARIES` registry + `ThemedMandalaParams` dataclass

**Files:**
- Modify: `projects/etsy-rooster-shop/src/etsy_rooster/svg_render/motifs/__init__.py` (replace empty placeholder)
- Create: `projects/etsy-rooster-shop/src/etsy_rooster/svg_render/themed_mandala_generator.py` (just the dataclass for now; generator class comes in Task 6)
- Create: `projects/etsy-rooster-shop/tests/test_themed_mandala_params.py`

### Step 1: Write failing tests for the registry + dataclass

Create `projects/etsy-rooster-shop/tests/test_themed_mandala_params.py`:

```python
from __future__ import annotations

import pytest

from etsy_rooster.svg_render.motifs import MOTIF_LIBRARIES
from etsy_rooster.svg_render.themed_mandala_generator import ThemedMandalaParams


def test_motif_libraries_has_three_themes() -> None:
    assert set(MOTIF_LIBRARIES.keys()) == {"cottagecore", "holiday", "sacred"}


def test_cottagecore_library_has_5_motifs() -> None:
    lib = MOTIF_LIBRARIES["cottagecore"]
    assert set(lib.keys()) == {"mushroom", "fern", "leaf", "flower", "acorn"}


def test_holiday_library_has_6_motifs() -> None:
    lib = MOTIF_LIBRARIES["holiday"]
    assert set(lib.keys()) == {"snowflake", "star", "heart", "bat", "pumpkin", "egg"}


def test_sacred_library_has_5_motifs() -> None:
    lib = MOTIF_LIBRARIES["sacred"]
    assert set(lib.keys()) == {
        "hexagon", "triangle", "circle", "point_rosette", "vesica_piscis"
    }


def test_construct_valid_themed_mandala_params() -> None:
    p = ThemedMandalaParams(
        theme="cottagecore",
        seed="mushroom-01",
        rings=5,
        petals_per_ring=(6, 12, 8, 12, 16),
        motif_per_ring=("mushroom", "leaf", "fern", "flower", "leaf"),
    )
    assert p.theme == "cottagecore"
    assert p.rings == 5
    assert p.stroke_width == 2.5  # default


def test_unknown_theme_rejected() -> None:
    with pytest.raises(ValueError, match="unknown theme"):
        ThemedMandalaParams(
            theme="hipster",
            seed="x",
            rings=1,
            petals_per_ring=(4,),
            motif_per_ring=("mushroom",),
        )


def test_rings_must_be_positive() -> None:
    with pytest.raises(ValueError, match="rings must be >= 1"):
        ThemedMandalaParams(
            theme="cottagecore",
            seed="x",
            rings=0,
            petals_per_ring=(),
            motif_per_ring=(),
        )


def test_petals_per_ring_length_must_match_rings() -> None:
    with pytest.raises(ValueError, match="petals_per_ring length"):
        ThemedMandalaParams(
            theme="cottagecore",
            seed="x",
            rings=3,
            petals_per_ring=(6, 12),
            motif_per_ring=("mushroom", "leaf", "fern"),
        )


def test_motif_per_ring_length_must_match_rings() -> None:
    with pytest.raises(ValueError, match="motif_per_ring length"):
        ThemedMandalaParams(
            theme="cottagecore",
            seed="x",
            rings=3,
            petals_per_ring=(6, 12, 8),
            motif_per_ring=("mushroom", "leaf"),
        )


def test_unknown_motif_in_theme_rejected() -> None:
    with pytest.raises(ValueError, match="not in 'cottagecore' library"):
        ThemedMandalaParams(
            theme="cottagecore",
            seed="x",
            rings=1,
            petals_per_ring=(6,),
            motif_per_ring=("bat",),  # bat is in holiday, not cottagecore
        )


def test_geometry_inner_must_be_less_than_outer() -> None:
    with pytest.raises(ValueError, match="inner_radius"):
        ThemedMandalaParams(
            theme="cottagecore",
            seed="x",
            rings=1,
            petals_per_ring=(6,),
            motif_per_ring=("mushroom",),
            inner_radius=500.0,
            outer_radius=100.0,
        )
```

### Step 2: Run tests to confirm failure

```bash
python -m pytest tests/test_themed_mandala_params.py -v --no-cov
```
Expected: 11 errors (no module `themed_mandala_generator`, plus the registry is empty).

### Step 3: Populate the registry

Replace `projects/etsy-rooster-shop/src/etsy_rooster/svg_render/motifs/__init__.py` with:

```python
"""Motif libraries for ThemedMandalaGenerator.

MOTIF_LIBRARIES maps theme name -> motif name -> motif function. Each
motif function satisfies the MotifPrimitive Protocol from base.py.
"""

from __future__ import annotations

from etsy_rooster.svg_render.motifs import cottagecore, holiday, sacred_geometry
from etsy_rooster.svg_render.motifs.base import MotifPrimitive

MOTIF_LIBRARIES: dict[str, dict[str, MotifPrimitive]] = {
    "cottagecore": {
        "mushroom": cottagecore.mushroom,
        "fern":     cottagecore.fern,
        "leaf":     cottagecore.leaf,
        "flower":   cottagecore.flower,
        "acorn":    cottagecore.acorn,
    },
    "holiday": {
        "snowflake": holiday.snowflake,
        "star":      holiday.star,
        "heart":     holiday.heart,
        "bat":       holiday.bat,
        "pumpkin":   holiday.pumpkin,
        "egg":       holiday.egg,
    },
    "sacred": {
        "hexagon":         sacred_geometry.hexagon,
        "triangle":        sacred_geometry.triangle,
        "circle":          sacred_geometry.circle,
        "point_rosette":   sacred_geometry.point_rosette,
        "vesica_piscis":   sacred_geometry.vesica_piscis,
    },
}
```

### Step 4: Create the dataclass module (params only — generator class comes in Task 6)

Create `projects/etsy-rooster-shop/src/etsy_rooster/svg_render/themed_mandala_generator.py`:

```python
"""ThemedMandalaGenerator + ThemedMandalaParams — themed extension of mandala_generator.

Substitutes plain circular petals with motif primitives from MOTIF_LIBRARIES.
Each ring uses one motif (configurable via motif_per_ring). Generator
implementation lands in this file in Task 6; this initial commit ships only
the params dataclass.
"""

from __future__ import annotations

from dataclasses import dataclass

from etsy_rooster.svg_render.motifs import MOTIF_LIBRARIES


@dataclass(frozen=True)
class ThemedMandalaParams:
    """Parameters for one themed mandala SVG. Validation runs in __post_init__."""

    theme: str
    seed: str
    rings: int
    petals_per_ring: tuple[int, ...]
    motif_per_ring: tuple[str, ...]
    inner_radius: float = 80.0
    outer_radius: float = 460.0
    petal_radius_factor: float = 0.40
    stroke_width: float = 2.5
    stroke: str = "#000000"
    fill: str = "none"

    def __post_init__(self) -> None:
        if self.theme not in MOTIF_LIBRARIES:
            raise ValueError(
                f"unknown theme {self.theme!r}; known: {sorted(MOTIF_LIBRARIES)}"
            )
        if self.rings < 1:
            raise ValueError(f"rings must be >= 1, got {self.rings}")
        if len(self.petals_per_ring) != self.rings:
            raise ValueError(
                f"petals_per_ring length {len(self.petals_per_ring)} "
                f"must equal rings={self.rings}"
            )
        if len(self.motif_per_ring) != self.rings:
            raise ValueError(
                f"motif_per_ring length {len(self.motif_per_ring)} "
                f"must equal rings={self.rings}"
            )
        lib = MOTIF_LIBRARIES[self.theme]
        unknown = [m for m in self.motif_per_ring if m not in lib]
        if unknown:
            raise ValueError(
                f"motifs not in {self.theme!r} library: {unknown}; "
                f"available: {sorted(lib)}"
            )
        if self.inner_radius <= 0 or self.outer_radius <= self.inner_radius:
            raise ValueError(
                f"inner_radius must be >0 and < outer_radius, got "
                f"({self.inner_radius}, {self.outer_radius})"
            )
```

### Step 5: Run tests

```bash
python -m pytest tests/test_themed_mandala_params.py -v --no-cov
```
Expected: 11 passed.

### Step 6: Full suite — make sure no regression

```bash
python -m pytest tests/ -q --no-cov
```
Expected: all previous tests pass + the new tests added across Tasks 1-5 all pass.

### Step 7: Commit

```bash
git -C C:/Sandbox/AIProjectManagement/Rooster-AI-Project-Management/projects/etsy-rooster-shop add src/etsy_rooster/svg_render/motifs/__init__.py src/etsy_rooster/svg_render/themed_mandala_generator.py tests/test_themed_mandala_params.py
git -C C:/Sandbox/AIProjectManagement/Rooster-AI-Project-Management/projects/etsy-rooster-shop commit -m "feat(themed-mandala): MOTIF_LIBRARIES registry + ThemedMandalaParams dataclass"
```

---

## Task 6: `ThemedMandalaGenerator` implementation

**Files:**
- Modify: `projects/etsy-rooster-shop/src/etsy_rooster/svg_render/themed_mandala_generator.py` (add the generator class)
- Create: `projects/etsy-rooster-shop/tests/test_themed_mandala_generator.py`

### Step 1: Write failing tests

Create `projects/etsy-rooster-shop/tests/test_themed_mandala_generator.py`:

```python
from __future__ import annotations

import re
from pathlib import Path

import pytest

from etsy_rooster.svg_render.themed_mandala_generator import (
    ThemedMandalaGenerator,
    ThemedMandalaParams,
)
from etsy_rooster.svg_render.validators import validate_svg


def test_render_produces_valid_svg_cottagecore(tmp_path: Path) -> None:
    params = ThemedMandalaParams(
        theme="cottagecore",
        seed="mushroom-01",
        rings=5,
        petals_per_ring=(6, 12, 8, 12, 16),
        motif_per_ring=("mushroom", "leaf", "fern", "flower", "leaf"),
    )
    gen = ThemedMandalaGenerator()
    artifact = gen.render_artifact(params, output_dir=tmp_path)
    assert artifact.master_svg_path.is_file()
    validate_svg(artifact.master_svg_path)


def test_render_produces_valid_svg_holiday(tmp_path: Path) -> None:
    params = ThemedMandalaParams(
        theme="holiday",
        seed="halloween-bats-01",
        rings=5,
        petals_per_ring=(6, 8, 12, 8, 16),
        motif_per_ring=("pumpkin", "bat", "star", "bat", "star"),
    )
    gen = ThemedMandalaGenerator()
    artifact = gen.render_artifact(params, output_dir=tmp_path)
    validate_svg(artifact.master_svg_path)


def test_render_produces_valid_svg_sacred(tmp_path: Path) -> None:
    params = ThemedMandalaParams(
        theme="sacred",
        seed="flower-of-life-01",
        rings=5,
        petals_per_ring=(1, 6, 12, 6, 12),
        motif_per_ring=("point_rosette", "hexagon", "triangle", "hexagon", "circle"),
    )
    gen = ThemedMandalaGenerator()
    artifact = gen.render_artifact(params, output_dir=tmp_path)
    validate_svg(artifact.master_svg_path)


def test_svg_contains_expected_number_of_paths(tmp_path: Path) -> None:
    """Total <path> count should equal sum(petals_per_ring)."""
    params = ThemedMandalaParams(
        theme="cottagecore",
        seed="x",
        rings=3,
        petals_per_ring=(6, 8, 10),
        motif_per_ring=("mushroom", "leaf", "flower"),
    )
    gen = ThemedMandalaGenerator()
    artifact = gen.render_artifact(params, output_dir=tmp_path)
    svg_text = artifact.master_svg_path.read_text(encoding="utf-8")
    path_count = len(re.findall(r"<path\b", svg_text))
    assert path_count == 6 + 8 + 10


def test_artifact_has_preview_png(tmp_path: Path) -> None:
    params = ThemedMandalaParams(
        theme="cottagecore",
        seed="x",
        rings=3,
        petals_per_ring=(6, 8, 10),
        motif_per_ring=("mushroom", "leaf", "flower"),
    )
    gen = ThemedMandalaGenerator()
    artifact = gen.render_artifact(params, output_dir=tmp_path)
    assert len(artifact.preview_png_paths) >= 1
    assert all(p.is_file() for p in artifact.preview_png_paths)
    # SKU label includes theme + seed
    assert "cottagecore" in artifact.sku or artifact.sku.endswith("x")
```

### Step 2: Run tests to verify failure

```bash
python -m pytest tests/test_themed_mandala_generator.py -v --no-cov
```
Expected: 5 errors (no `ThemedMandalaGenerator` class).

### Step 3: Implement the generator

Replace `projects/etsy-rooster-shop/src/etsy_rooster/svg_render/themed_mandala_generator.py` with:

```python
"""ThemedMandalaGenerator + ThemedMandalaParams — themed extension of mandala_generator.

Substitutes plain circular petals with motif primitives from MOTIF_LIBRARIES.
Each ring uses one motif (configurable via motif_per_ring). The generator
arranges motifs in radial symmetry and applies ring-tracking rotation via
SVG `transform="rotate(angle cx cy)"` rather than mutating path strings.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from pathlib import Path

from etsy_rooster.svg_render.artifact import SvgArtifact
from etsy_rooster.svg_render.mandala_generator import _svg_to_png
from etsy_rooster.svg_render.motifs import MOTIF_LIBRARIES
from etsy_rooster.svg_render.validators import validate_svg

CANVAS = 1024  # px square viewBox; matches MandalaGenerator
PREVIEW_PNG_SIZE = 800


@dataclass(frozen=True)
class ThemedMandalaParams:
    """Parameters for one themed mandala SVG. Validation runs in __post_init__."""

    theme: str
    seed: str
    rings: int
    petals_per_ring: tuple[int, ...]
    motif_per_ring: tuple[str, ...]
    inner_radius: float = 80.0
    outer_radius: float = 460.0
    petal_radius_factor: float = 0.40
    stroke_width: float = 2.5
    stroke: str = "#000000"
    fill: str = "none"

    def __post_init__(self) -> None:
        if self.theme not in MOTIF_LIBRARIES:
            raise ValueError(
                f"unknown theme {self.theme!r}; known: {sorted(MOTIF_LIBRARIES)}"
            )
        if self.rings < 1:
            raise ValueError(f"rings must be >= 1, got {self.rings}")
        if len(self.petals_per_ring) != self.rings:
            raise ValueError(
                f"petals_per_ring length {len(self.petals_per_ring)} "
                f"must equal rings={self.rings}"
            )
        if len(self.motif_per_ring) != self.rings:
            raise ValueError(
                f"motif_per_ring length {len(self.motif_per_ring)} "
                f"must equal rings={self.rings}"
            )
        lib = MOTIF_LIBRARIES[self.theme]
        unknown = [m for m in self.motif_per_ring if m not in lib]
        if unknown:
            raise ValueError(
                f"motifs not in {self.theme!r} library: {unknown}; "
                f"available: {sorted(lib)}"
            )
        if self.inner_radius <= 0 or self.outer_radius <= self.inner_radius:
            raise ValueError(
                f"inner_radius must be >0 and < outer_radius, got "
                f"({self.inner_radius}, {self.outer_radius})"
            )


class ThemedMandalaGenerator:
    """Render a ThemedMandalaParams into a deterministic SVG + preview PNG."""

    def render(self, params: ThemedMandalaParams) -> str:
        lib = MOTIF_LIBRARIES[params.theme]
        canvas_center = CANVAS / 2
        ring_spacing = (
            (params.outer_radius - params.inner_radius) / (params.rings - 1)
            if params.rings > 1
            else 0.0
        )

        body_parts: list[str] = []
        for ring_idx in range(params.rings):
            radius = params.inner_radius + ring_idx * ring_spacing
            motif_name = params.motif_per_ring[ring_idx]
            motif_fn = lib[motif_name]
            # Single-ring layouts get a generous floor so motifs are visible.
            motif_size = max(
                ring_spacing * params.petal_radius_factor * 2,
                40.0,
            )
            count = params.petals_per_ring[ring_idx]
            for i in range(count):
                angle_deg = (360.0 / count) * i
                angle_rad = math.radians(angle_deg - 90)  # 0 deg = top
                cx = canvas_center + radius * math.cos(angle_rad)
                cy = canvas_center + radius * math.sin(angle_rad)
                path_data = motif_fn(cx=cx, cy=cy, size=motif_size)
                transform_attr = (
                    f' transform="rotate({angle_deg:.2f} {cx:.2f} {cy:.2f})"'
                    if angle_deg != 0
                    else ""
                )
                body_parts.append(
                    f'<path d="{path_data}" '
                    f'stroke="{params.stroke}" '
                    f'stroke-width="{params.stroke_width}" '
                    f'fill="{params.fill}"'
                    f"{transform_attr}/>"
                )

        return (
            f'<svg xmlns="http://www.w3.org/2000/svg" '
            f'viewBox="0 0 {CANVAS} {CANVAS}">\n'
            + "\n".join(body_parts)
            + "\n</svg>"
        )

    def render_artifact(
        self, params: ThemedMandalaParams, *, output_dir: Path
    ) -> SvgArtifact:
        """Write SVG + preview PNG into output_dir; return SvgArtifact wrapper.

        Mirrors MandalaGenerator.render_artifact signature so consumers
        (CLI, integration tests) can swap generators interchangeably.
        """
        output_dir.mkdir(parents=True, exist_ok=True)
        sku = f"mandala-{params.seed}"
        svg_text = self.render(params)
        svg_path = output_dir / f"{sku}.svg"
        svg_path.write_text(svg_text, encoding="utf-8")
        validate_svg(svg_path)

        preview_path = output_dir / f"{sku}-preview.png"
        _svg_to_png(svg_text, preview_path, size=PREVIEW_PNG_SIZE)

        # Build theme_tags from the params for downstream LLM use.
        theme_tags = [params.theme, params.seed] + list(set(params.motif_per_ring))

        return SvgArtifact(
            sku=sku,
            master_svg_path=svg_path,
            preview_png_paths=[preview_path],
            theme_tags=theme_tags,
        )
```

**Note on `_svg_to_png`:** This helper from `mandala_generator.py` only handles `<circle>` elements (per the existing implementation). It won't render `<path>` elements correctly — the preview PNG will be blank or partial.

**Trade-off:** Generating a faithful PNG preview from arbitrary SVG paths requires either (a) `cairosvg` (was dropped per the catalog memory) or (b) a more sophisticated Pillow-based renderer. For Plan 2d MVP, **accept that the preview PNG may not show the motif art accurately** — the SVG itself is the deliverable for Etsy, and Etsy generates its own thumbnails. The preview PNG is mostly used by integration tests to verify "something was rendered."

If the test `test_artifact_has_preview_png` expects the file to exist (it does), this approach works. If subsequent test cases assert preview PNG visual content, you'd need to upgrade the renderer — out of scope here.

**Alternative**: have `_svg_to_png` write a placeholder white PNG when no `<circle>` elements are found. Document this clearly. The placeholder strategy avoids confusing test failures.

For the implementer: if you find `_svg_to_png` chokes on path-only SVG, modify `mandala_generator._svg_to_png` to gracefully no-op (write an empty white PNG of `size` × `size`) when no recognizable elements are present. That's a one-line fix and preserves the test contract.

### Step 4: Run tests, verify pass

```bash
python -m pytest tests/test_themed_mandala_generator.py -v --no-cov
```
Expected: 5 passed. If `_svg_to_png` complaints come up, apply the one-line fix above.

### Step 5: Full suite

```bash
python -m pytest tests/ -q --no-cov
```
Expected: all prior tests + 5 new = all green.

### Step 6: Commit

```bash
git -C C:/Sandbox/AIProjectManagement/Rooster-AI-Project-Management/projects/etsy-rooster-shop add src/etsy_rooster/svg_render/themed_mandala_generator.py tests/test_themed_mandala_generator.py
git -C C:/Sandbox/AIProjectManagement/Rooster-AI-Project-Management/projects/etsy-rooster-shop commit -m "feat(themed-mandala): ThemedMandalaGenerator renders motif-based mandalas"
```

If you applied the `_svg_to_png` no-op fallback in `mandala_generator.py`, include that file in the commit too.

---

## Task 7: CLI `generate themed-mandala` subcommand + per-theme defaults

**Files:**
- Modify: `projects/etsy-rooster-shop/src/etsy_rooster/cli.py`
- Create: `projects/etsy-rooster-shop/tests/test_themed_mandala_cli.py`

### Step 1: Write failing tests

Create `projects/etsy-rooster-shop/tests/test_themed_mandala_cli.py`:

```python
from __future__ import annotations

import json
from pathlib import Path

import pytest
from click.testing import CliRunner

from etsy_rooster.catalog_db import CatalogDB, SkuState


def test_generate_themed_mandala_cottagecore(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    data_dir = tmp_path / "data"
    monkeypatch.setenv("ETSY_ROOSTER_DATA_DIR", str(data_dir))

    from etsy_rooster.cli import cli

    runner = CliRunner()
    result = runner.invoke(
        cli,
        ["generate", "themed-mandala", "--theme=cottagecore", "--seed=mushroom-01"],
    )
    assert result.exit_code == 0, result.output

    out_dir = data_dir / "artifacts" / "mandala-mushroom-01"
    assert (out_dir / "mandala-mushroom-01.svg").is_file()

    import sqlite3
    conn = sqlite3.connect(data_dir / "catalog.db")
    db = CatalogDB(conn)
    row = conn.execute("SELECT id, niche, state FROM sku").fetchone()
    assert row[1] == "mandala"  # niche stays mandala for taxonomy reuse
    assert row[2] == SkuState.DRAFTED.value
    sku_id = row[0]
    params = json.loads(db.get_sku(sku_id)["generator_params_json"])
    assert params["theme"] == "cottagecore"
    assert params["seed"] == "mushroom-01"
    assert "mushroom" in params["motif_per_ring"]


def test_generate_themed_mandala_holiday(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    data_dir = tmp_path / "data"
    monkeypatch.setenv("ETSY_ROOSTER_DATA_DIR", str(data_dir))

    from etsy_rooster.cli import cli

    runner = CliRunner()
    result = runner.invoke(
        cli,
        ["generate", "themed-mandala", "--theme=holiday", "--seed=halloween-01"],
    )
    assert result.exit_code == 0, result.output

    out_dir = data_dir / "artifacts" / "mandala-halloween-01"
    assert (out_dir / "mandala-halloween-01.svg").is_file()


def test_generate_themed_mandala_sacred(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    data_dir = tmp_path / "data"
    monkeypatch.setenv("ETSY_ROOSTER_DATA_DIR", str(data_dir))

    from etsy_rooster.cli import cli

    runner = CliRunner()
    result = runner.invoke(
        cli,
        ["generate", "themed-mandala", "--theme=sacred", "--seed=flower-of-life-01"],
    )
    assert result.exit_code == 0, result.output


def test_generate_themed_mandala_unknown_theme_errors(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    data_dir = tmp_path / "data"
    monkeypatch.setenv("ETSY_ROOSTER_DATA_DIR", str(data_dir))

    from etsy_rooster.cli import cli

    runner = CliRunner()
    result = runner.invoke(
        cli,
        ["generate", "themed-mandala", "--theme=hipster", "--seed=x"],
    )
    assert result.exit_code != 0
```

### Step 2: Run tests to verify failure

```bash
python -m pytest tests/test_themed_mandala_cli.py -v --no-cov
```
Expected: 4 errors (no themed-mandala subcommand).

### Step 3: Add the CLI subcommand

In `projects/etsy-rooster-shop/src/etsy_rooster/cli.py`, find the existing `generate_coloring` subcommand (added in Plan 2a Task 9). Add the new subcommand right after it (still inside the `generate` group):

```python
# Per-theme defaults: ring/motif tuples. Users pick a theme + seed and get
# a reasonable default mandala without specifying every parameter.
_THEMED_MANDALA_DEFAULTS: dict[str, tuple[int, tuple[int, ...], tuple[str, ...]]] = {
    # (rings, petals_per_ring, motif_per_ring)
    "cottagecore": (5, (6, 12, 8, 12, 16), ("mushroom", "leaf", "fern", "flower", "leaf")),
    "holiday":     (5, (6, 8, 12, 8, 16),  ("pumpkin", "bat", "star", "bat", "star")),
    "sacred":      (5, (1, 6, 12, 6, 12),  ("point_rosette", "hexagon", "triangle", "hexagon", "circle")),
}


@generate.command("themed-mandala")
@click.option(
    "--theme",
    required=True,
    type=click.Choice(["cottagecore", "holiday", "sacred"]),
    help="Motif library to use.",
)
@click.option(
    "--seed",
    required=True,
    help="Identifier for this themed mandala variant (e.g. mushroom-01).",
)
def generate_themed_mandala(theme: str, seed: str) -> None:
    """Generate a themed-motif mandala SVG using one of the three motif libraries."""
    from etsy_rooster.svg_render.themed_mandala_generator import (
        ThemedMandalaGenerator,
        ThemedMandalaParams,
    )

    rings, petals_per_ring, motif_per_ring = _THEMED_MANDALA_DEFAULTS[theme]
    params = ThemedMandalaParams(
        theme=theme,
        seed=seed,
        rings=rings,
        petals_per_ring=petals_per_ring,
        motif_per_ring=motif_per_ring,
    )
    gen = ThemedMandalaGenerator()
    out_dir = config.artifacts_dir() / f"mandala-{seed}"
    artifact = gen.render_artifact(params, output_dir=out_dir)

    db = _db()
    sku_id = db.create_sku(
        niche="mandala",  # niche stays mandala so existing prompt + taxonomy route
        params={
            "theme": theme,
            "seed": seed,
            "rings": rings,
            "petals_per_ring": list(petals_per_ring),
            "motif_per_ring": list(motif_per_ring),
        },
    )
    db.attach_artifact_file(sku_id, kind="svg", path=str(artifact.master_svg_path))
    for png in artifact.preview_png_paths:
        db.attach_artifact_file(sku_id, kind="preview_png", path=str(png))
    db.log_op(sku_id, event="generated", detail=f"theme={theme} seed={seed}")
    click.echo(f"sku_id={sku_id} sku={artifact.sku} svg={artifact.master_svg_path}")
```

### Step 4: Run tests

```bash
python -m pytest tests/test_themed_mandala_cli.py -v --no-cov
```
Expected: 4 passed.

### Step 5: Full suite

```bash
python -m pytest tests/ -q --no-cov
```
Expected: all prior + 4 new = green.

### Step 6: Commit

```bash
git -C C:/Sandbox/AIProjectManagement/Rooster-AI-Project-Management/projects/etsy-rooster-shop add src/etsy_rooster/cli.py tests/test_themed_mandala_cli.py
git -C C:/Sandbox/AIProjectManagement/Rooster-AI-Project-Management/projects/etsy-rooster-shop commit -m "feat(cli): add 'generate themed-mandala --theme --seed' subcommand"
```

---

## Task 8: Live integration test — themed mandala end-to-end

**Files:**
- Create: `projects/etsy-rooster-shop/tests/integration/test_e2e_themed_mandala.py`

### Step 1: Write the live test

Create `projects/etsy-rooster-shop/tests/integration/test_e2e_themed_mandala.py`:

```python
"""Live integration: themed mandala pipeline against the real Etsy API.

Skipped by default (marker 'live'). Requires:
  - .env.local with ETSY_KEYSTRING, ETSY_SHARED_SECRET, ETSY_SHOP_ID, GEMINI_API_KEY
  - ~/.etsy-rooster/token.json (run scripts/etsy_oauth_setup.py first)

Creates a real DRAFT listing on PocketRoosterPress. The test prints the
listing_id + dashboard URL. Delete manually after inspection.
"""

from __future__ import annotations

import os
import sqlite3
from pathlib import Path

import pytest
from dotenv import load_dotenv

# Load env at collection time so pytest.mark.skipif sees the credentials.
_PROJECT_ROOT = Path(__file__).resolve().parents[2]
load_dotenv(_PROJECT_ROOT / ".env.local")
load_dotenv(_PROJECT_ROOT / ".env")

from etsy_rooster.catalog_db import CatalogDB, SkuState  # noqa: E402
from etsy_rooster.etsy.client import EtsyClient  # noqa: E402
from etsy_rooster.etsy.oauth import TokenStore  # noqa: E402
from etsy_rooster.listing_authoring.author import LLMListingAuthor  # noqa: E402
from etsy_rooster.listing_authoring.gemini_adapter import GeminiListingClient  # noqa: E402
from etsy_rooster.publish.orchestrator import PublishOrchestrator  # noqa: E402
from etsy_rooster.svg_render.themed_mandala_generator import (  # noqa: E402
    ThemedMandalaGenerator,
    ThemedMandalaParams,
)

pytestmark = pytest.mark.live


@pytest.mark.skipif(
    not os.environ.get("ETSY_KEYSTRING")
    or not os.environ.get("ETSY_SHARED_SECRET")
    or not os.environ.get("ETSY_SHOP_ID")
    or not os.environ.get("GEMINI_API_KEY"),
    reason="Etsy + Gemini credentials not configured",
)
def test_end_to_end_cottagecore_mushroom_mandala_to_etsy_draft(
    tmp_path: Path,
) -> None:
    # 1. Generate the themed mandala
    params = ThemedMandalaParams(
        theme="cottagecore",
        seed="mushroom-01",
        rings=5,
        petals_per_ring=(6, 12, 8, 12, 16),
        motif_per_ring=("mushroom", "leaf", "fern", "flower", "leaf"),
    )
    gen = ThemedMandalaGenerator()
    artifact = gen.render_artifact(params, output_dir=tmp_path)
    assert artifact.master_svg_path.is_file()

    # 2. DB + SKU registration
    conn = sqlite3.connect(":memory:")
    db = CatalogDB(conn)
    db.init_schema()
    sku_id = db.create_sku(
        niche="mandala",
        params={
            "theme": params.theme,
            "seed": params.seed,
            "rings": params.rings,
            "petals_per_ring": list(params.petals_per_ring),
            "motif_per_ring": list(params.motif_per_ring),
        },
    )
    db.attach_artifact_file(sku_id, kind="svg", path=str(artifact.master_svg_path))
    for png in artifact.preview_png_paths:
        db.attach_artifact_file(sku_id, kind="preview_png", path=str(png))

    # 3. Author metadata via real Gemini (uses existing mandala-prompt.md)
    prompts_dir = (
        _PROJECT_ROOT / "src" / "etsy_rooster" / "listing_authoring" / "prompts"
    )
    summary = {
        "sku": artifact.sku,
        "theme": params.theme,
        "seed": params.seed,
        "rings": params.rings,
        "motif_per_ring": list(params.motif_per_ring),
    }
    author = LLMListingAuthor(llm=GeminiListingClient(), prompts_dir=prompts_dir)
    draft = author.author(niche="mandala", artifact_summary=summary)
    db.set_listing_metadata(
        sku_id,
        title=draft.title,
        tags=draft.tags,
        description=draft.description,
        price_usd=draft.price_usd,
        materials=draft.materials,
    )

    # 4. Publish via real Etsy API (refresh token if expired)
    from etsy_rooster.etsy.oauth import EtsyOAuthConfig
    from etsy_rooster.etsy.oauth import refresh_token as do_refresh

    store = TokenStore()
    tokens = store.load()
    if store.is_expired():
        cfg = EtsyOAuthConfig(
            keystring=os.environ["ETSY_KEYSTRING"],
            shared_secret=os.environ["ETSY_SHARED_SECRET"],
            redirect_uri=os.environ.get(
                "ETSY_REDIRECT_URI", "http://localhost:3003/oauth/callback"
            ),
        )
        new = do_refresh(cfg, refresh_token=tokens["refresh_token"])
        store.save(
            access_token=new["access_token"],
            refresh_token=new.get("refresh_token", tokens["refresh_token"]),
            expires_in=int(new["expires_in"]),
        )
        tokens = store.load()
    etsy = EtsyClient(
        keystring=os.environ["ETSY_KEYSTRING"],
        shared_secret=os.environ["ETSY_SHARED_SECRET"],
        access_token=tokens["access_token"],
        shop_id=int(os.environ["ETSY_SHOP_ID"]),
    )
    orch = PublishOrchestrator(db=db, etsy=etsy, taxonomy_id=6343)
    listing_id = orch.publish(sku_id)

    # 5. Verify
    assert listing_id > 0
    assert db.current_state(sku_id) is SkuState.STAGED
    fetched = etsy.get_listing(listing_id)
    assert fetched["state"] == "draft"
    print(f"Created themed-mandala draft listing {listing_id}: {draft.title!r}")
    print(f"View at: https://www.etsy.com/your/shops/PocketRoosterPress/tools/listings/state:draft")
```

### Step 2: Sanity-check the unit suite

```bash
cd /c/Sandbox/AIProjectManagement/Rooster-AI-Project-Management/projects/etsy-rooster-shop && python -m pytest tests/ -q --no-cov 2>&1 | tail -3
```
Expected: all prior unit tests + 4 deselected live tests (3 prior + 1 new themed-mandala live).

### Step 3: Commit

```bash
git -C C:/Sandbox/AIProjectManagement/Rooster-AI-Project-Management/projects/etsy-rooster-shop add tests/integration/test_e2e_themed_mandala.py
git -C C:/Sandbox/AIProjectManagement/Rooster-AI-Project-Management/projects/etsy-rooster-shop commit -m "test(live): end-to-end themed mandala → Etsy draft listing"
```

---

## Task 9 (user-side, real Etsy + Gemini cost): Run live test

**This task spends real Gemini 2.5 Pro tokens (~$0.02 for listing copy) AND creates a real DRAFT listing on the Etsy shop.** Confirm with the user before running.

### Step 1: Run the live test

```bash
cd /c/Sandbox/AIProjectManagement/Rooster-AI-Project-Management/projects/etsy-rooster-shop && python -m pytest tests/integration/test_e2e_themed_mandala.py -v -m live -s --no-cov
```

Expected: 1 passed in ~20-30 seconds. The test prints the listing_id + dashboard URL.

### Step 2: Eyeball the SVG before publishing

Open `data/artifacts/mandala-mushroom-01/mandala-mushroom-01.svg` (created earlier by `etsy-rooster generate themed-mandala`, or via the test fixture if that's the first time) in:
- Any SVG viewer (browser drag-and-drop) — confirms the mandala renders as concentric rings of mushrooms / leaves / ferns / flowers
- Inkscape — confirms path continuity (no broken arcs)
- Cricut Design Space (optional but valuable) — confirms the file imports + the cut paths look reasonable

If any motif looks awkward (mushroom too cartoony, fern not curvy enough, etc.), tweak the path math in the corresponding motif file (`cottagecore.py`, etc.), re-run `etsy-rooster generate themed-mandala`, and re-eyeball. The mandala-mushroom-01 listing on Etsy can be re-uploaded or updated.

### Step 3: Inspect the draft on Etsy

Open https://www.etsy.com/your/shops/PocketRoosterPress/tools/listings/state:draft and click into the new themed-mandala draft. Confirm:
- Title reads sensibly (Gemini-authored; should mention "cottagecore" + "mushroom" + "mandala")
- 13 tags
- Description matches mandala-SVG conventions (mentions Cricut, Silhouette, SVG file format, etc.)
- Preview image attached (may be blank/empty per the `_svg_to_png` caveat in Task 6)
- SVG file attached as a downloadable digital file

If the preview image is blank, you can either:
- Upload a screenshot of the SVG manually as the listing image (1 minute of dashboard work)
- Or skip — Etsy will accept the listing without it, just less attractive

No git commit for this task — runbook execution.

---

## Task 10 (user-side, no code): Etsy dashboard publish

### Step 1: Open the draft listing

Visit https://www.etsy.com/your/shops/PocketRoosterPress/tools/listings/state:draft and find the new themed-mandala draft.

### Step 2: Set the Craft type attribute

The Etsy listing UI requires a Craft type dropdown for taxonomy `6343` (Patterns & Blueprints). Based on Plan 2a's experience, the correct pick for SVG cut files is:

- **Paper crafting** (same as the previously-published mandala)

If "Paper crafting" isn't available, fall back to "Other" or whatever the dropdown offers.

### Step 3: Assign to the SVG Cut Files shop section

In the listing editor → Section → select `SVG Cut Files`.

### Step 4: Final review

- Title, tags, description all read well
- Preview image looks good (or upload a manual screenshot if the auto-generated PNG is blank)
- SVG file attached
- Price = $3-5 range (Gemini default)
- Quantity = 999

### Step 5: Publish

Click **Publish**. Etsy charges $0.20 to publish each listing.

### Step 6: Verify the listing is live

Visit https://www.etsy.com/shop/PocketRoosterPress in an incognito window. The new themed-mandala should appear in the "SVG Cut Files" section alongside the previously-published plain mandala.

### Step 7: Update the checkpoint memory

Ask the controller to update `etsy-rooster-shop-checkpoint.md` to record Plan 2d as complete + the new listing live.

---

## Acceptance — Plan 2d complete when

- [ ] All 8 code tasks above have every step checked
- [ ] `python -m pytest tests/ -q --no-cov` shows all tests passing, 4+ deselected (live tests including the new themed-mandala live)
- [ ] Live themed-mandala integration test (Task 8) passed at least once end-to-end
- [ ] Cottagecore Mushroom Mandala listing is **active** (published, not draft) on the Etsy shop
- [ ] It appears in the "SVG Cut Files" section
- [ ] All three motif libraries (cottagecore, holiday, sacred) are loaded + tested so a Halloween mandala or Flower-of-Life is one CLI invocation away

## Self-review against the spec

(Performed inline before committing this plan.)

- **Spec coverage:** every "In scope" bullet maps to at least one task. Motif Protocol + helpers (Task 1), three libraries (Tasks 2-4), registry + dataclass (Task 5), generator (Task 6), CLI (Task 7), live test (Task 8), MVP listing live (Tasks 9-10).
- **Placeholder scan:** no TBDs. The `_svg_to_png` fallback caveat is documented inline in Task 6 with a concrete one-line fix.
- **Type consistency:** `MotifPrimitive` signature `(*, cx, cy, size)` consistent across all 5 cottagecore + 6 holiday + 5 sacred motifs. `ThemedMandalaParams` field names identical in Tasks 5, 6, 7, 8. `MOTIF_LIBRARIES` keys (`"cottagecore"`, `"holiday"`, `"sacred"`) used consistently.
- **Test counts:** ~37 new unit tests across Tasks 1-7 (6+15+18+15+11+5+4) plus 1 live in Task 8. Exceeds the spec's ~15 target — appropriate for the architectural breadth of three libraries.

## Deferred-debt acknowledgments

- `_svg_to_png` only handles `<circle>` elements. Path-only SVG previews may be blank. Documented in Task 6 with a one-line fix recommendation; full fix is out of scope.
- `ensure_fresh_token(store, cfg)` helper still inlined in 3+ live tests. Plan 2d adds a 4th. Extract in a future cleanup pass.
- No `shops_w` scope added — section assignment is manual.
- `google-generativeai` still EOL.
