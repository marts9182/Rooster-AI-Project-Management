# Etsy Rooster Shop — Plan 2d: Themed Motif Mandalas (Cottagecore + Holiday + Sacred Geometry)

**Status:** Design approved 2026-05-20. Awaiting implementation plan (writing-plans).

**Predecessors:** Plans 1, 2a, 2a' (Songbird + plain mandala drafts), 2c (posters spec). All earlier sub-plans shipped infrastructure this plan reuses.

**Successor sub-plans:** Plan 2d' fast-follows (Halloween, Christmas, Valentine, Easter, Sacred Geometry MVPs — each is one CLI invocation after this plan ships). Plan 2b (`pocket_rooster_brand` refactor) still queued. Plan 3 (validate-then-scale).

## Goal

Populate the SVG Cut Files shop section with **one** Cottagecore Mushroom Mandala live listing — a themed extension of the existing parametric mandala — while shipping three motif libraries (cottagecore, holiday, sacred geometry) in code so the next 4–5 SVG listings across themes are 5-minute fast-follows.

This sub-plan establishes the **themed motif architecture** that future SVG niches will extend, the same way Plan 2a established the coloring-book architecture.

## Scope

**In:**
- New `ThemedMandalaGenerator` class + `ThemedMandalaParams` dataclass in `etsy_rooster.svg_render`
- Three motif libraries:
  - **Cottagecore** — `mushroom`, `fern`, `leaf`, `flower`, `acorn`
  - **Holiday** — `snowflake`, `star`, `heart`, `bat`, `pumpkin`, `egg`
  - **Sacred Geometry** — `hexagon`, `triangle`, `circle`, `point_rosette`, `vesica_piscis`
- Motif primitive protocol + helpers (`base.py`): SVG path rotation, scaling, validation
- New CLI subcommand: `etsy-rooster generate themed-mandala --theme=<t> --seed=<s>`
- One Cottagecore Mushroom Mandala live on Etsy as the MVP listing
- Live integration test exercising the cottagecore theme end-to-end

**Out (later fast-follows / sub-plans):**
- Other 4+ MVP listings (Halloween / Christmas / Valentine / Easter / Flower of Life) — code ships, listings don't
- AI-generated or autotraced motifs (everything in 2d is hand-coded SVG path math)
- Motif customization UI (motifs are picked at the CLI; no interactive editor)
- `pocket_rooster_brand` shared package refactor (Plan 2b)
- Etsy `shops_w` scope for programmatic section assignment
- Migrating `google-generativeai` → `google-genai`
- New motif primitives beyond the 16 listed (5 cottagecore + 6 holiday + 5 sacred)

## Pipeline shape

```
ThemedMandalaParams(theme="cottagecore", seed="mushroom-01",
                    rings=5,
                    petals_per_ring=(6, 12, 8, 12, 16),
                    motif_per_ring=("mushroom", "leaf", "fern", "flower", "leaf"))
                                                              │
                                                              ▼
ThemedMandalaGenerator + cottagecore motif library     ──►   SVG (radial-symmetric
                                                              arrangement of motifs)
                                                              │
   ▼                                                          │
existing SvgArtifact + validate_svg + PNG preview            │
                                                              ▼
existing LLMListingAuthor (niche="mandala",                Gemini-authored
prompt selects mandala-prompt.md)                          title/tags/desc
                                                              │
                                                              ▼
existing PublishOrchestrator (taxonomy 6343 via             Etsy draft
_taxonomy_for_niche("mandala"))                             listing
```

## Architecture & components

### New code in `projects/etsy-rooster-shop/`

```
src/etsy_rooster/svg_render/
  themed_mandala_generator.py     # NEW. ThemedMandalaGenerator + ThemedMandalaParams.
  motifs/
    __init__.py                   # NEW. MOTIF_LIBRARIES registry exported here.
    base.py                       # NEW. MotifPrimitive Protocol + rotate_path_around
                                  #   + scale_path + validate_motif_path helpers.
    cottagecore.py                # NEW. 5 motif functions.
    holiday.py                    # NEW. 6 motif functions.
    sacred_geometry.py            # NEW. 5 motif functions.

# Modified
src/etsy_rooster/cli.py           # Add @generate.command("themed-mandala") subcommand.

tests/
  test_themed_mandala_generator.py
  test_motif_primitives.py        # Parametric test over MOTIF_LIBRARIES — every
                                  # primitive must produce a well-formed path.
  test_themed_mandala_cli.py
```

### Motif primitive contract (`motifs/base.py`)

```python
from typing import Protocol

class MotifPrimitive(Protocol):
    """Signature every motif function must satisfy.

    Returns the SVG path data string ("M x y L ... Z") for ONE instance
    of the motif at the given center + size, drawn in its CANONICAL
    UN-ROTATED orientation. Rotation is applied by the generator via the
    SVG `transform="rotate(deg cx cy)"` attribute on the wrapping `<path>`
    element — keeps each motif function focused on its own geometry and
    avoids float-precision drift from manual path rotation.
    """
    def __call__(self, *, cx: float, cy: float, size: float) -> str: ...
```

Helpers in `base.py`:

- `validate_motif_path(path_data: str) -> None` — sanity-check that the path starts with `M`, ends with `Z`, and contains no NaN/inf coordinates. Raises `ValueError` on failure. Used in tests via a parametric sweep over every motif in `MOTIF_LIBRARIES`.

### `ThemedMandalaParams` dataclass

```python
from dataclasses import dataclass
from etsy_rooster.svg_render.motifs import MOTIF_LIBRARIES

@dataclass(frozen=True)
class ThemedMandalaParams:
    theme: str                                # "cottagecore" | "holiday" | "sacred"
    seed: str                                 # identifier (e.g. "mushroom-01")
    rings: int                                # how many concentric rings
    petals_per_ring: tuple[int, ...]          # motif count per ring
    motif_per_ring: tuple[str, ...]           # motif name per ring (from theme's library)
    inner_radius: float = 80.0
    outer_radius: float = 460.0
    petal_radius_factor: float = 0.40         # tighter than plain mandala (0.45) — motifs need whitespace
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
            raise ValueError("inner_radius must be >0 and < outer_radius")
```

### `MOTIF_LIBRARIES` registry (`motifs/__init__.py`)

```python
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

### Example motif: `cottagecore.mushroom`

```python
def mushroom(*, cx: float, cy: float, size: float) -> str:
    """Rounded cap on top, short stem below. Closed shape suitable for Cricut cut.

    The cap is a semicircle (SVG arc) and the stem is a small rectangle attached
    to the cap's base. Total bounding box is approximately `size` wide and
    `size * 1.5` tall. Drawn in canonical orientation (cap pointing up);
    rotation is applied by the generator via SVG transform attribute.
    """
    half = size / 2
    cap_left  = (cx - half, cy)
    cap_right = (cx + half, cy)
    stem_right         = (cx + half * 0.3, cy)
    stem_bottom_right  = (cx + half * 0.3, cy + half)
    stem_bottom_left   = (cx - half * 0.3, cy + half)
    stem_left          = (cx - half * 0.3, cy)

    return (
        f"M {cap_left[0]:.2f} {cap_left[1]:.2f} "
        f"A {half:.2f} {half:.2f} 0 0 1 {cap_right[0]:.2f} {cap_right[1]:.2f} "
        f"L {stem_right[0]:.2f} {stem_right[1]:.2f} "
        f"L {stem_bottom_right[0]:.2f} {stem_bottom_right[1]:.2f} "
        f"L {stem_bottom_left[0]:.2f} {stem_bottom_left[1]:.2f} "
        f"L {stem_left[0]:.2f} {stem_left[1]:.2f} "
        f"Z"
    )
```

Other motifs follow the same pattern (10–30 LOC of SVG path math each). The implementation plan task list will include explicit per-motif designs.

### `ThemedMandalaGenerator` render flow

```python
def render(self, params: ThemedMandalaParams) -> str:
    lib = MOTIF_LIBRARIES[params.theme]
    canvas_center = CANVAS / 2
    ring_spacing = (
        (params.outer_radius - params.inner_radius) / (params.rings - 1)
        if params.rings > 1 else 0
    )

    body_parts: list[str] = []
    for ring_idx in range(params.rings):
        radius = params.inner_radius + ring_idx * ring_spacing
        motif_fn = lib[params.motif_per_ring[ring_idx]]
        motif_size = max(
            ring_spacing * params.petal_radius_factor * 2,
            20.0,  # floor so single-ring layouts still produce visible motifs
        )
        count = params.petals_per_ring[ring_idx]
        for i in range(count):
            angle_deg = (360.0 / count) * i
            angle_rad = math.radians(angle_deg - 90)  # 0 deg = top of mandala
            cx = canvas_center + radius * math.cos(angle_rad)
            cy = canvas_center + radius * math.sin(angle_rad)
            path_data = motif_fn(cx=cx, cy=cy, size=motif_size)
            transform_attr = (
                f' transform="rotate({angle_deg:.2f} {cx:.2f} {cy:.2f})"'
                if angle_deg != 0 else ""
            )
            body_parts.append(
                f'<path d="{path_data}" '
                f'stroke="{params.stroke}" '
                f'stroke-width="{params.stroke_width}" '
                f'fill="{params.fill}"'
                f'{transform_attr}/>'
            )

    svg = (
        f'<svg xmlns="http://www.w3.org/2000/svg" '
        f'viewBox="0 0 {CANVAS} {CANVAS}">\n'
        + "\n".join(body_parts)
        + "\n</svg>"
    )
    return svg
```

Mirrors `MandalaGenerator.render` closely. The `SvgArtifact` wrapping + PNG preview generation + `validate_svg` call all match the existing pattern.

### Reuse from prior plans (unchanged)

- `SvgArtifact` dataclass — same wrapper for produced file paths
- `validate_svg` — same cut-file safety check (closed paths, viewBox, no zero-area)
- `LLMListingAuthor` with `mandala-prompt.md` — niche stays `"mandala"`, existing prompt routing works
- `_taxonomy_for_niche("mandala") == 6343` — no new taxonomy entry needed
- `CatalogDB`, `EtsyClient`, `PublishOrchestrator` — all unchanged

### CLI surface

```
etsy-rooster generate themed-mandala --theme=cottagecore --seed=mushroom-01
  → constructs ThemedMandalaParams with theme-appropriate defaults
    (the CLI ships per-theme default motif_per_ring + petals_per_ring tuples
    so the user picks a theme + seed without specifying every parameter)
  → renders SVG + preview PNG via ThemedMandalaGenerator
  → INSERT sku row (niche="mandala", state=DRAFTED, params=dict(params))
  → ATTACH svg as kind="svg", preview PNG as kind="preview_png"

etsy-rooster author-metadata --sku-id=N    # existing, uses mandala-prompt.md
etsy-rooster publish --sku-id=N             # existing, taxonomy 6343
```

Default `motif_per_ring` per theme (baked into the CLI):

| Theme | rings | petals_per_ring | motif_per_ring |
|---|---|---|---|
| cottagecore | 5 | (6, 12, 8, 12, 16) | (mushroom, leaf, fern, flower, leaf) |
| holiday (Halloween default) | 5 | (6, 8, 12, 8, 16) | (pumpkin, bat, star, bat, star) |
| sacred | 5 | (1, 6, 12, 6, 12) | (point_rosette, hexagon, triangle, hexagon, circle) |

Future flexibility: the CLI can accept `--motif-per-ring=mushroom,leaf,...` and `--petals-per-ring=6,12,...` overrides for power users. Out of scope for the MVP.

## The Cottagecore Mushroom Mandala MVP

### Design parameters

```python
ThemedMandalaParams(
    theme="cottagecore",
    seed="mushroom-01",
    rings=5,
    petals_per_ring=(6, 12, 8, 12, 16),
    motif_per_ring=("mushroom", "leaf", "fern", "flower", "leaf"),
    inner_radius=80.0,
    outer_radius=460.0,
    petal_radius_factor=0.40,
    stroke_width=2.5,
    stroke="#000000",
    fill="none",
)
```

**Visual logic:**

- **Inner ring of 6 mushrooms** — large feature element, the visual anchor
- **Ring 2: 12 leaves** — delicate transition layer
- **Ring 3: 8 ferns** — medium-density ring of curving fronds for rhythm
- **Ring 4: 12 flowers** — outer-mid decorative ring, balances ring 2's leaves
- **Outer ring: 16 leaves** — densest ring, makes the mandala feel "full" at the edge
- **5 rings** matches the plain mandala default (same cut complexity / difficulty class for Cricut buyers)
- **`petal_radius_factor=0.40`** is slightly tighter than the plain mandala's 0.45 — complex motifs need more whitespace to read cleanly when cut

### Listing copy

Plan 2a's Critical fix means the SKU's params flow into Gemini's `artifact_summary` at top level:

```json
{
  "sku": "mandala-mushroom-01",
  "theme": "cottagecore",
  "seed": "mushroom-01",
  "rings": 5,
  "motif_per_ring": ["mushroom", "leaf", "fern", "flower", "leaf"]
}
```

The existing `mandala-prompt.md` instructs Gemini to write Etsy listings for procedurally generated mandala SVG cut files. Adding theme + motif info to the summary nudges title/tag/description into cottagecore vocabulary without requiring a new prompt template.

Expected output shape: a title like *"Cottagecore Mushroom Mandala SVG Cut File, Woodland Botanical Cricut Design, Forest Mandala Vinyl Decal, Boho Nature Wall Art, Digital Download"*. Tags drawn from cottagecore + mandala SVG keyword space. Description follows the existing pattern (what it is, what files, compatible machines, license, no refunds for digital).

## Acceptance criteria

**Code done when:**
- `etsy-rooster generate themed-mandala --theme=cottagecore --seed=mushroom-01` produces a valid SVG + preview PNG in `data/artifacts/mandala-mushroom-01/`
- The SVG passes `validate_svg` (closed paths, viewBox present, no zero-area paths)
- All three motif libraries compile + each primitive produces a well-formed path (parametric test iterates `MOTIF_LIBRARIES`)
- ≥15 new unit tests pass; existing 87+ tests still pass
- Live integration test creates a real DRAFT listing on the Etsy shop

**Plan 2d complete when:**
- The Cottagecore Mushroom Mandala listing is in `active` state on the Etsy shop
- It appears in the "SVG Cut Files" section alongside the previously published plain mandala
- The three motif libraries (cottagecore, holiday, sacred) are loaded + tested so a Halloween mandala or Flower-of-Life is one CLI invocation away (no further engineering required for fast-follows)

## Open decisions (resolve during implementation)

1. **Visual quality of cottagecore motifs** — mushroom/fern/leaf/flower/acorn path math is described conceptually but exact curve choices are aesthetic. The implementer should generate a sample SVG early and have the user eyeball it. If a motif looks awkward (too cartoony, too geometric, too detailed for cut, etc.), iterate the path math before locking it in.
2. **Motif rotation tracks ring angle vs always upright** — the design rotates each motif to point outward (`rotation_deg=angle`). For some motifs (mushroom, leaf) this looks natural. For others (heart, pumpkin) all-upright might read better. Decide per-motif during implementation, possibly via a per-library `default_rotation: bool` flag.
3. **Acorn primitive** — included in the cottagecore library but not used in the MVP `motif_per_ring`. Ships in the library for a future "fall cottagecore" listing (e.g., `--seed=acorn-01` with different ring config).
4. **Cricut "validation" beyond `validate_svg`** — current validator checks viewBox + closed paths + no zero-area. It does NOT check for self-intersections or cut-line continuity issues that would jam a Cricut blade. Consider adding self-intersection detection if first-listing buyer feedback suggests it matters. Out of scope for MVP.

## Testing strategy

**Unit tests** (target ~15 new):
- `ThemedMandalaParams` construction + validation (each failure mode: unknown theme, ring/petal/motif length mismatch, unknown motif name, geometry invariants)
- Each motif primitive: returns a non-empty string starting with `M` and ending with `Z`, with no NaN coordinates (parametric test over `MOTIF_LIBRARIES`)
- `rotate_path_around` produces a transform-wrapped result that re-rotates cleanly
- `ThemedMandalaGenerator.render` for cottagecore + holiday + sacred produces valid SVG that passes `validate_svg`
- CLI `generate themed-mandala` end-to-end with each theme

**Live integration test** (`@pytest.mark.live`):
- End-to-end: generate cottagecore mushroom mandala → author via real Gemini → publish to real Etsy as draft. Mirrors `tests/integration/test_e2e_sandbox.py` + the coloring live test pattern.

**Manual verification:**
- Open the produced SVG locally in Inkscape and confirm it renders the expected concentric-rings-of-mushrooms-and-leaves composition
- Open the SVG in Cricut Design Space (or a free online SVG viewer) and confirm path continuity
- View the created draft in Etsy Shop Manager and confirm preview image + SVG download attached

## Out of scope (explicit, to prevent scope creep)

- More than one MVP listing (Halloween, Christmas, etc. are fast-follow CLI invocations after this plan ships)
- AI-generated or autotraced motifs (everything is hand-coded SVG path math)
- Custom motif uploader / GUI editor
- New OAuth scopes (no `shops_w`, no `listings_d`)
- `pocket_rooster_brand` shared package refactor
- Migrating `google-generativeai` → `google-genai`
- Self-intersection or advanced cut-line validation beyond the existing `validate_svg`
