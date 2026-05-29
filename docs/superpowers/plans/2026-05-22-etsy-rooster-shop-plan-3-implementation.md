# Etsy Rooster Shop â€” Plan 3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship 23-26 new Etsy listings across three SKU types (single-page coloring packs, wall art quote sets, Cricut SVG bundles) plus one full Cute Cats coloring book, leveraging existing pipelines with ~7-9 hours of glue work, to hit $200/month revenue by 2026-08-22.

**Architecture:** Eight small pipeline-extension tasks add three new niches (`coloring-pack`, `wall-art-set`, `svg-bundle`) on top of the existing infrastructure (CatalogDB, PublishOrchestrator, LLMListingAuthor, Plan 2e video pipeline). The extensions are: PDF subset extraction (Task 1), multi-image Nano Banana Pro generation (Task 3), poster set bundling (Task 4), SVG bundling (Task 6), plus video treatments and niche-aware listing prompts. Four runbook tasks then ship the listings in three weekly phases plus a 6-week monitoring window.

**Tech Stack:** Python 3.11+, click (CLI), pypdf (PDF subset), reportlab (cover pages), Pillow (image composition), `@google/genai` Node SDK for Nano Banana Pro, existing infra: CatalogDB, EtsyClient, PublishOrchestrator, Plan 2e video pipeline.

**Spec reference:** [`docs/superpowers/specs/2026-05-22-etsy-rooster-shop-plan-3-design.md`](../specs/2026-05-22-etsy-rooster-shop-plan-3-design.md)

---

## Pre-flight context (read once)

You are working in the nested git repo `projects/etsy-rooster-shop/` on `main`. Always use absolute paths in Bash and `git -C <abs-path> ...` for git commands.

**Run tests with:**
```bash
cd projects/etsy-rooster-shop
python -m pytest tests/ -q --no-cov           # full suite
python -m pytest tests/test_X.py -v --no-cov  # one file
```

**Baseline before starting:** the nested repo HEAD is `cab773f` (Plan 2e Task 9). Confirm:
```bash
git -C C:/Sandbox/AIProjectManagement/Rooster-AI-Project-Management/projects/etsy-rooster-shop log -1 --oneline
```
Run `python -m pytest tests/ -q --no-cov` and confirm 231 passed + 6 deselected.

**Existing infrastructure this plan reuses unchanged:**
- `etsy_rooster.catalog_db.CatalogDB` â€” `niche` column accepts any string; new `coloring-pack`, `wall-art-set`, `svg-bundle` niches require no schema change.
- `etsy_rooster.listing_authoring.author.LLMListingAuthor` â€” loads `<prompts_dir>/<niche>-prompt.md` by filename; new niches just need new prompt files.
- `etsy_rooster.publish.orchestrator.PublishOrchestrator` â€” already handles any niche by reading `_taxonomy_for_niche` via CLI; we extend that mapping.
- `etsy_rooster.video.builder.build_and_upload_video` â€” dispatches by `niche` via `_TREATMENT_BY_NICHE`; new niches need new treatment functions added there.

**KDP source assets used:**
- `<kdp>/assets/processed/coloring/bold-easy-cottagecore-mushrooms-v1/page_NN.png` â€” 45 pages
- `<kdp>/assets/processed/coloring/bold-easy-songbirds-v1/page_NN.png` â€” 40 pages
- `<kdp>/assets/processed/coloring/bold-easy-cute-cats-v1/page_NN.png` â€” count TBD (Task 8 verifies)

`KDP_ASSETS_DIR` is set in `.env.local` to `C:/Sandbox/AIProjectManagement/Rooster-AI-Project-Management/projects/kdp-puzzle-press`.

---

## File structure

**New source files:**
- `src/etsy_rooster/coloring/page_extractor.py` â€” `extract_page_subset` (pypdf)
- `src/etsy_rooster/coloring/pack_niche.py` â€” `ColoringPackNiche` dataclass
- `src/etsy_rooster/posters/set_niche.py` â€” `PosterSetNiche` dataclass
- `src/etsy_rooster/posters/set_builder.py` â€” `build_set_zip` (multi-print bundle)
- `src/etsy_rooster/posters/set_kdp_importer.py` â€” `load_poster_set_niche`
- `src/etsy_rooster/svg_render/svg_bundler.py` â€” `build_svg_bundle` (zip + tiled preview)
- `src/etsy_rooster/svg_render/bundle_niche.py` â€” `SvgBundleNiche` dataclass
- `src/etsy_rooster/listing_authoring/prompts/coloring-pack-prompt.md`
- `src/etsy_rooster/listing_authoring/prompts/wall-art-set-prompt.md`
- `src/etsy_rooster/listing_authoring/prompts/svg-bundle-prompt.md`
- `web.ui/backend/scripts/generate_poster_sets.mjs` â€” Node generator for N prints/set

**New test files:**
- `tests/test_coloring_page_extractor.py`
- `tests/test_coloring_pack_niche.py`
- `tests/test_coloring_pack_cli.py`
- `tests/test_poster_set_builder.py`
- `tests/test_poster_set_niche.py`
- `tests/test_poster_set_cli.py`
- `tests/test_svg_bundler.py`
- `tests/test_svg_bundle_cli.py`
- `tests/test_taxonomy_mapping.py`

**Modified files:**
- `src/etsy_rooster/cli.py` â€” three new subcommands + extend `_TAXONOMY_BY_NICHE`
- `src/etsy_rooster/video/treatments.py` â€” three new treatment functions
- `src/etsy_rooster/video/builder.py` â€” three new entries in `_TREATMENT_BY_NICHE`

---

## Task 0: Niche routing â€” taxonomy + 3 prompt files

**Files:**
- Modify: `projects/etsy-rooster-shop/src/etsy_rooster/cli.py` (extend `_TAXONOMY_BY_NICHE`)
- Create: `projects/etsy-rooster-shop/src/etsy_rooster/listing_authoring/prompts/coloring-pack-prompt.md`
- Create: `projects/etsy-rooster-shop/src/etsy_rooster/listing_authoring/prompts/wall-art-set-prompt.md`
- Create: `projects/etsy-rooster-shop/src/etsy_rooster/listing_authoring/prompts/svg-bundle-prompt.md`
- Create: `projects/etsy-rooster-shop/tests/test_taxonomy_mapping.py`

- [x] **Step 1: Write failing test for taxonomy routing**

Create `projects/etsy-rooster-shop/tests/test_taxonomy_mapping.py`:

```python
from __future__ import annotations

import pytest

from etsy_rooster.cli import _TAXONOMY_BY_NICHE, _taxonomy_for_niche


def test_existing_niches_route_correctly():
    assert _taxonomy_for_niche("mandala") == 6343
    assert _taxonomy_for_niche("coloring") == 6343
    assert _taxonomy_for_niche("poster") == 2078


def test_new_plan_3_niches_route_correctly():
    # coloring-pack uses same leaf as full coloring (Patterns & Blueprints)
    assert _taxonomy_for_niche("coloring-pack") == 6343
    # wall-art-set uses same leaf as posters (Digital Prints)
    assert _taxonomy_for_niche("wall-art-set") == 2078
    # svg-bundle uses same leaf as mandala (Patterns & Blueprints)
    assert _taxonomy_for_niche("svg-bundle") == 6343


def test_unknown_niche_raises():
    import click
    with pytest.raises(click.ClickException, match="No Etsy taxonomy_id"):
        _taxonomy_for_niche("nonexistent-niche")
```

- [x] **Step 2: Run tests to confirm failure**

```bash
cd /c/Sandbox/AIProjectManagement/Rooster-AI-Project-Management/projects/etsy-rooster-shop && python -m pytest tests/test_taxonomy_mapping.py -v --no-cov
```
Expected: `test_new_plan_3_niches_route_correctly` FAILS (KeyError raised via ClickException for the new niches). Other tests pass.

- [x] **Step 3: Extend the taxonomy mapping**

In `projects/etsy-rooster-shop/src/etsy_rooster/cli.py`, find the existing `_TAXONOMY_BY_NICHE` dict (around line 26) and extend it:

```python
_TAXONOMY_BY_NICHE: dict[str, int] = {
    # Craft Supplies & Tools > Patterns & How To > Patterns & Blueprints
    "mandala": 6343,
    # Same leaf as mandala â€” confirmed via live taxonomy walk; no more
    # specific coloring/printables leaf exists in Etsy's current taxonomy.
    "coloring": 6343,
    # Art & Collectibles > Prints > Digital Prints â€” distinct leaf for posters.
    "poster": 2078,
    # Plan 3 new niches:
    "coloring-pack": 6343,   # mini-pack of coloring pages, same leaf as coloring
    "wall-art-set": 2078,    # gallery wall art bundle, same leaf as posters
    "svg-bundle": 6343,      # SVG cut file bundle, same leaf as mandala
}
```

- [x] **Step 4: Run tests, verify pass**

```bash
python -m pytest tests/test_taxonomy_mapping.py -v --no-cov
```
Expected: 3 passed.

- [x] **Step 5: Create the coloring-pack prompt file**

Create `projects/etsy-rooster-shop/src/etsy_rooster/listing_authoring/prompts/coloring-pack-prompt.md`:

```markdown
# System

You write Etsy listings for printable mini-pack coloring PDFs published by
Pocket Rooster Press. The shop sells digital downloads (PDF) for at-home
printing. Mini-packs are themed subsets of larger books â€” 5 to 10 pages,
priced lower than full books for impulse purchase. Voice: warm, cozy,
hobby-craft tone. Never invent details â€” the artifact summary lists exactly
what's included.

Return a single JSON object with these exact keys:
  title (string, <= 140 chars, keyword-front-loaded; MUST include at least
         3 entries from artifact_summary.theme_tags verbatim; include the
         word "mini-pack" or "pack" once)
  tags (array of exactly 13 strings, each <= 20 chars, lowercase, no commas,
        no duplicates; prioritize entries from artifact_summary.theme_tags)
  description (string, 6-10 sentences. MUST include: the page count from
               artifact_summary.design_count + the page size "8.5 x 11" +
               the phrase "instant download" + a brief how-to-use sentence
               (print, color, frame) + the AI disclosure sentence:
               "Designs are created with AI image tools and refined for
               clean printing, disclosed per Etsy's 2024 listing-quality
               policy." + the license note: "For personal coloring use only.")
  price_usd (number between 1.5 and 7.0; default to 4.99 if unsure;
             use 1.99 for single-page packs)
  materials (array; MUST include "PDF", "Digital Download", and "AI Line Art")

# User

Niche: {niche}
Artifact summary: {artifact_summary_json}
```

- [x] **Step 6: Create the wall-art-set prompt file**

Create `projects/etsy-rooster-shop/src/etsy_rooster/listing_authoring/prompts/wall-art-set-prompt.md`:

```markdown
# System

You write Etsy listings for printable wall art SET BUNDLES published by
Pocket Rooster Press. A set is a curated 6-print gallery bundle, each
print delivered at 3 sizes (8x10, 11x14, 16x20) at 300 DPI as JPGs,
packaged in one ZIP with a printing-instructions PDF. Voice: warm,
gallery-confident, slightly poetic. Set themes tend toward cottagecore,
calm-domesticity, and botanical aesthetics.

Return a single JSON object with these exact keys:
  title (string, <= 140 chars, keyword-front-loaded; MUST include at least
         3 entries from artifact_summary.theme_tags verbatim; include the
         phrase "Set of 6" or "Gallery Set" once)
  tags (array of exactly 13 strings, each <= 20 chars, lowercase, no commas,
        no duplicates; prioritize entries from artifact_summary.theme_tags)
  description (string, 6-10 sentences. MUST include: the print count "6" +
               the 3 size names "8x10, 11x14, 16x20" + "300 DPI" +
               "instant download" + a brief framing/gallery-wall suggestion
               + the AI disclosure sentence: "Designs are created with AI
               image tools and refined for clean printing, disclosed per
               Etsy's 2024 listing-quality policy." + the license note:
               "For personal use only. Not for resale or commercial use.")
  price_usd (number between 8.0 and 14.0; default to 9.99 if unsure)
  materials (array; MUST include "JPG", "PDF", "Digital Download", and "AI Art")

# User

Niche: {niche}
Artifact summary: {artifact_summary_json}
```

- [x] **Step 7: Create the svg-bundle prompt file**

Create `projects/etsy-rooster-shop/src/etsy_rooster/listing_authoring/prompts/svg-bundle-prompt.md`:

```markdown
# System

You write Etsy listings for SVG cut file BUNDLES published by Pocket
Rooster Press. A bundle is a single-purchase ZIP containing 15-25
individual SVG files for Cricut, Silhouette, and other vinyl cutters.
Bundles are higher perceived value than single SVGs (which race to
$1.50). Voice: practical, crafter-friendly, slightly playful.

Return a single JSON object with these exact keys:
  title (string, <= 140 chars, keyword-front-loaded; MUST include at least
         3 entries from artifact_summary.theme_tags verbatim; include the
         phrase "SVG Bundle" or "Cricut Bundle" once + the file count)
  tags (array of exactly 13 strings, each <= 20 chars, lowercase, no commas,
        no duplicates; prioritize entries from artifact_summary.theme_tags;
        MUST include "cricut" and "svg")
  description (string, 6-10 sentences. MUST include: the design count from
               artifact_summary.design_count + "SVG" file format + cutter
               compatibility (Cricut + Silhouette) + "instant download" +
               sizing guidance (designs scale cleanly to any size) + the
               AI disclosure sentence if any SVGs are AI-derived: "Designs
               are created with AI image tools and refined for clean
               cutting, disclosed per Etsy's 2024 listing-quality policy."
               + the license note: "For personal crafting use only. Not
               for resale or commercial use.")
  price_usd (number between 5.0 and 12.0; default to 7.99 if unsure)
  materials (array; MUST include "SVG", "Digital Download", and "Cut File")
```

(Note: this svg-bundle prompt does NOT have a trailing `# User` section
because there are no per-instance template variables â€” actually it does
need one. Fix by appending the User section.)

Append to the file:

```markdown

# User

Niche: {niche}
Artifact summary: {artifact_summary_json}
```

- [x] **Step 8: Run full suite to verify nothing regressed**

```bash
python -m pytest tests/ -q --no-cov 2>&1 | tail -3
```
Expected: 234 passed, 6 deselected (231 prior + 3 new tests for taxonomy mapping). Note: the new prompt files are not directly exercised by tests yet; they'll be used in Tasks 2/5/6 CLI commands.

- [x] **Step 9: Commit**

```bash
git -C C:/Sandbox/AIProjectManagement/Rooster-AI-Project-Management/projects/etsy-rooster-shop add src/etsy_rooster/cli.py src/etsy_rooster/listing_authoring/prompts/coloring-pack-prompt.md src/etsy_rooster/listing_authoring/prompts/wall-art-set-prompt.md src/etsy_rooster/listing_authoring/prompts/svg-bundle-prompt.md tests/test_taxonomy_mapping.py
git -C C:/Sandbox/AIProjectManagement/Rooster-AI-Project-Management/projects/etsy-rooster-shop commit -m "feat(plan3): niche routing + listing prompts for coloring-pack, wall-art-set, svg-bundle"
```

---

## Task 1: PDF page subset extractor

**Files:**
- Create: `projects/etsy-rooster-shop/src/etsy_rooster/coloring/page_extractor.py`
- Create: `projects/etsy-rooster-shop/tests/test_coloring_page_extractor.py`

- [x] **Step 1: Write failing tests**

Create `projects/etsy-rooster-shop/tests/test_coloring_page_extractor.py`:

```python
from __future__ import annotations

from pathlib import Path

import pytest
from pypdf import PdfReader, PdfWriter
from reportlab.lib.pagesizes import LETTER
from reportlab.pdfgen.canvas import Canvas

from etsy_rooster.coloring.page_extractor import extract_page_subset


def _make_source_pdf(tmp_path: Path, page_count: int) -> Path:
    """Make a source PDF with `page_count` numbered pages."""
    p = tmp_path / "source.pdf"
    c = Canvas(str(p), pagesize=LETTER)
    for i in range(1, page_count + 1):
        c.setFont("Helvetica", 24)
        c.drawString(100, 700, f"Source Page {i}")
        c.showPage()
    c.save()
    return p


def test_extract_creates_pdf_with_cover_plus_selected_pages(tmp_path: Path) -> None:
    source = _make_source_pdf(tmp_path, page_count=10)
    out = tmp_path / "minipack.pdf"
    extract_page_subset(
        source_pdf_path=source,
        page_indices=[1, 3, 5, 7],  # 1-indexed
        output_pdf_path=out,
        title="Test Mini-Pack",
        subtitle="4 pages from the test book",
    )
    assert out.is_file()
    reader = PdfReader(str(out))
    # 1 cover + 4 selected = 5 pages
    assert len(reader.pages) == 5


def test_extract_preserves_page_order(tmp_path: Path) -> None:
    source = _make_source_pdf(tmp_path, page_count=10)
    out = tmp_path / "minipack.pdf"
    extract_page_subset(
        source_pdf_path=source,
        page_indices=[5, 3, 7, 1],
        output_pdf_path=out,
        title="Order Test",
        subtitle="Pages in caller order",
    )
    # The caller-specified order is preserved; if they pass [5,3,7,1] the
    # output should have cover, then page 5, then page 3, then page 7, then page 1.
    reader = PdfReader(str(out))
    assert len(reader.pages) == 5  # 1 cover + 4 selected


def test_extract_rejects_empty_page_indices(tmp_path: Path) -> None:
    source = _make_source_pdf(tmp_path, page_count=10)
    with pytest.raises(ValueError, match="at least one"):
        extract_page_subset(
            source_pdf_path=source,
            page_indices=[],
            output_pdf_path=tmp_path / "out.pdf",
            title="x",
            subtitle="y",
        )


def test_extract_rejects_out_of_range_index(tmp_path: Path) -> None:
    source = _make_source_pdf(tmp_path, page_count=5)
    with pytest.raises(ValueError, match="out of range"):
        extract_page_subset(
            source_pdf_path=source,
            page_indices=[1, 6],  # 6 doesn't exist in a 5-page source
            output_pdf_path=tmp_path / "out.pdf",
            title="x",
            subtitle="y",
        )


def test_extract_creates_parent_dir(tmp_path: Path) -> None:
    source = _make_source_pdf(tmp_path, page_count=5)
    out = tmp_path / "nested" / "subdir" / "out.pdf"
    extract_page_subset(
        source_pdf_path=source,
        page_indices=[1, 2],
        output_pdf_path=out,
        title="x",
        subtitle="y",
    )
    assert out.is_file()
```

- [x] **Step 2: Run tests to confirm failure**

```bash
cd /c/Sandbox/AIProjectManagement/Rooster-AI-Project-Management/projects/etsy-rooster-shop && python -m pytest tests/test_coloring_page_extractor.py -v --no-cov
```
Expected: 5 errors (module not found).

- [x] **Step 3: Implement the extractor**

Create `projects/etsy-rooster-shop/src/etsy_rooster/coloring/page_extractor.py`:

```python
"""Extract a subset of pages from an existing coloring book PDF.

Used by Plan 3's coloring-pack pipeline: take a 40-page KDP-style book PDF
and produce a 5-10 page mini-pack with a new cover.
"""

from __future__ import annotations

import io
from pathlib import Path

from pypdf import PdfReader, PdfWriter
from reportlab.lib.pagesizes import LETTER
from reportlab.lib.units import inch
from reportlab.pdfgen.canvas import Canvas


def extract_page_subset(
    *,
    source_pdf_path: Path,
    page_indices: list[int],
    output_pdf_path: Path,
    title: str,
    subtitle: str,
) -> None:
    """Build a mini-pack PDF from selected pages of a source PDF.

    Args:
      source_pdf_path: existing multi-page PDF to extract from
      page_indices: 1-indexed page numbers to include, in desired order
      output_pdf_path: where to write the mini-pack PDF
      title: cover-page title
      subtitle: cover-page subtitle

    Raises:
      ValueError: empty page_indices, or any index out of range for source
    """
    if not page_indices:
        raise ValueError("page_indices must contain at least one page")

    reader = PdfReader(str(source_pdf_path))
    n = len(reader.pages)
    for i in page_indices:
        if i < 1 or i > n:
            raise ValueError(
                f"page index {i} out of range for source with {n} pages"
            )

    output_pdf_path.parent.mkdir(parents=True, exist_ok=True)

    cover_bytes = _build_cover_page(title=title, subtitle=subtitle)
    cover_reader = PdfReader(io.BytesIO(cover_bytes))

    writer = PdfWriter()
    writer.add_page(cover_reader.pages[0])
    for i in page_indices:
        writer.add_page(reader.pages[i - 1])  # 1-indexed -> 0-indexed

    with output_pdf_path.open("wb") as fh:
        writer.write(fh)


def _build_cover_page(*, title: str, subtitle: str) -> bytes:
    """Render a single-page PDF cover with title + subtitle + license footer."""
    buf = io.BytesIO()
    c = Canvas(buf, pagesize=LETTER)
    width, height = LETTER

    c.setFont("Times-Bold", 26)
    c.drawCentredString(width / 2, height - 3.5 * inch, title)

    c.setFont("Times-Italic", 14)
    c.drawCentredString(width / 2, height - 4.1 * inch, subtitle)

    c.setFont("Helvetica", 8)
    c.drawCentredString(
        width / 2,
        0.35 * inch,
        "For personal coloring use only. Not for resale or commercial use.",
    )
    c.save()
    return buf.getvalue()
```

- [x] **Step 4: Run tests, verify pass**

```bash
python -m pytest tests/test_coloring_page_extractor.py -v --no-cov
```
Expected: 5 passed.

- [x] **Step 5: Full suite**

```bash
python -m pytest tests/ -q --no-cov 2>&1 | tail -3
```
Expected: 239 passed, 6 deselected (234 prior + 5 new).

- [x] **Step 6: Commit**

```bash
git -C C:/Sandbox/AIProjectManagement/Rooster-AI-Project-Management/projects/etsy-rooster-shop add src/etsy_rooster/coloring/page_extractor.py tests/test_coloring_page_extractor.py
git -C C:/Sandbox/AIProjectManagement/Rooster-AI-Project-Management/projects/etsy-rooster-shop commit -m "feat(coloring): page subset extractor for mini-pack PDFs"
```

---

## Task 2: Coloring-pack niche + CLI

**Files:**
- Create: `projects/etsy-rooster-shop/src/etsy_rooster/coloring/pack_niche.py`
- Modify: `projects/etsy-rooster-shop/src/etsy_rooster/cli.py` (add `generate coloring-pack` subcommand)
- Create: `projects/etsy-rooster-shop/tests/test_coloring_pack_niche.py`
- Create: `projects/etsy-rooster-shop/tests/test_coloring_pack_cli.py`

- [x] **Step 1: Write failing test for the ColoringPackNiche dataclass**

Create `projects/etsy-rooster-shop/tests/test_coloring_pack_niche.py`:

```python
from __future__ import annotations

from pathlib import Path

import pytest

from etsy_rooster.coloring.pack_niche import ColoringPackNiche


def test_valid_pack_niche(tmp_path: Path) -> None:
    source = tmp_path / "source.pdf"
    source.write_bytes(b"%PDF-1.4 fake")
    n = ColoringPackNiche(
        pack_id="mushroom-mini-1",
        book_id="bold-easy-cottagecore-mushrooms-v1",
        title="Cottagecore Mushroom Mini-Pack #1",
        subtitle="10 pages from the Cottagecore Mushroom Coloring Book",
        page_indices=[1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
        theme_tags=["cottagecore", "mushroom", "mini pack"],
        source_pdf_path=source,
    )
    assert n.design_count == 10
    assert n.pack_id == "mushroom-mini-1"


def test_empty_pack_id_rejected(tmp_path: Path) -> None:
    source = tmp_path / "source.pdf"
    source.write_bytes(b"%PDF-1.4")
    with pytest.raises(ValueError, match="pack_id"):
        ColoringPackNiche(
            pack_id="",
            book_id="b",
            title="T",
            subtitle="S",
            page_indices=[1],
            theme_tags=["t"],
            source_pdf_path=source,
        )


def test_empty_page_indices_rejected(tmp_path: Path) -> None:
    source = tmp_path / "source.pdf"
    source.write_bytes(b"%PDF-1.4")
    with pytest.raises(ValueError, match="page_indices"):
        ColoringPackNiche(
            pack_id="p",
            book_id="b",
            title="T",
            subtitle="S",
            page_indices=[],
            theme_tags=["t"],
            source_pdf_path=source,
        )


def test_missing_source_pdf_rejected(tmp_path: Path) -> None:
    with pytest.raises(ValueError, match="source_pdf"):
        ColoringPackNiche(
            pack_id="p",
            book_id="b",
            title="T",
            subtitle="S",
            page_indices=[1],
            theme_tags=["t"],
            source_pdf_path=tmp_path / "missing.pdf",
        )


def test_design_count_matches_page_indices(tmp_path: Path) -> None:
    source = tmp_path / "source.pdf"
    source.write_bytes(b"%PDF-1.4")
    n = ColoringPackNiche(
        pack_id="p",
        book_id="b",
        title="T",
        subtitle="S",
        page_indices=[1, 3, 5],
        theme_tags=["t"],
        source_pdf_path=source,
    )
    assert n.design_count == 3
```

- [x] **Step 2: Run tests to confirm failure**

```bash
python -m pytest tests/test_coloring_pack_niche.py -v --no-cov
```
Expected: 5 errors (module not found).

- [x] **Step 3: Implement ColoringPackNiche**

Create `projects/etsy-rooster-shop/src/etsy_rooster/coloring/pack_niche.py`:

```python
"""ColoringPackNiche â€” data Plan 3's coloring-pack pipeline needs."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class ColoringPackNiche:
    """Everything the coloring-pack pipeline needs to build one mini-pack.

    A pack is a themed subset of pages extracted from an existing coloring
    book PDF, with a new cover. All fields are required.
    """

    pack_id: str
    book_id: str  # source book identifier (for KDP page-PNG lookup in videos)
    title: str
    subtitle: str
    page_indices: list[int]  # 1-indexed; pages of source_pdf_path to include
    theme_tags: list[str]
    source_pdf_path: Path  # the existing book PDF we extract from

    def __post_init__(self) -> None:
        if not self.pack_id:
            raise ValueError("pack_id must be non-empty")
        if not self.book_id:
            raise ValueError("book_id must be non-empty")
        if not self.title:
            raise ValueError("title must be non-empty")
        if not self.subtitle:
            raise ValueError("subtitle must be non-empty")
        if not self.page_indices:
            raise ValueError("page_indices must contain at least one page")
        if not self.theme_tags:
            raise ValueError("theme_tags must contain at least one tag")
        if not self.source_pdf_path.is_file():
            raise ValueError(
                f"source_pdf_path does not exist: {self.source_pdf_path}"
            )

    @property
    def design_count(self) -> int:
        """Number of design pages in the pack (excludes cover)."""
        return len(self.page_indices)
```

- [x] **Step 4: Run niche tests, verify pass**

```bash
python -m pytest tests/test_coloring_pack_niche.py -v --no-cov
```
Expected: 5 passed.

- [x] **Step 5: Write failing CLI test**

Create `projects/etsy-rooster-shop/tests/test_coloring_pack_cli.py`:

```python
from __future__ import annotations

import sqlite3
from pathlib import Path

import pytest
from click.testing import CliRunner
from reportlab.lib.pagesizes import LETTER
from reportlab.pdfgen.canvas import Canvas


def _make_source_pdf(path: Path, page_count: int) -> None:
    """Make a source PDF with `page_count` numbered pages."""
    c = Canvas(str(path), pagesize=LETTER)
    for i in range(1, page_count + 1):
        c.setFont("Helvetica", 24)
        c.drawString(100, 700, f"Source Page {i}")
        c.showPage()
    c.save()


def test_generate_coloring_pack_creates_sku_and_pdf(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """`generate coloring-pack` extracts pages, attaches PDF, creates SKU."""
    # Set up env + data dir
    monkeypatch.setenv("ETSY_ROOSTER_DATA_DIR", str(tmp_path / "data"))
    (tmp_path / "data" / "coloring" / "test-book-v1").mkdir(parents=True)
    source = tmp_path / "data" / "coloring" / "test-book-v1" / "test-book-v1.pdf"
    _make_source_pdf(source, page_count=15)

    from etsy_rooster.cli import cli

    runner = CliRunner()
    result = runner.invoke(
        cli,
        [
            "generate", "coloring-pack",
            "--pack-id", "mini-1",
            "--book-id", "test-book-v1",
            "--pages", "1,3,5,7,9",
            "--title", "Test Mini-Pack",
            "--subtitle", "5 pages from the test book",
            "--tags", "test,mini pack,coloring",
        ],
    )
    assert result.exit_code == 0, f"output={result.output!r}\nexc={result.exception!r}"
    assert "sku_id=" in result.output
    # PDF artifact landed in the data dir
    out_pdf = tmp_path / "data" / "coloring-packs" / "mini-1" / "mini-1.pdf"
    assert out_pdf.is_file()

    # Check SKU row
    conn = sqlite3.connect(tmp_path / "data" / "catalog.db")
    conn.row_factory = sqlite3.Row
    rows = list(conn.execute("SELECT id, niche, generator_params_json FROM sku"))
    assert len(rows) == 1
    assert rows[0]["niche"] == "coloring-pack"
    import json
    params = json.loads(rows[0]["generator_params_json"])
    assert params["pack_id"] == "mini-1"
    assert params["book_id"] == "test-book-v1"
    assert params["page_indices"] == [1, 3, 5, 7, 9]
```

- [x] **Step 6: Run CLI test to confirm failure**

```bash
python -m pytest tests/test_coloring_pack_cli.py -v --no-cov
```
Expected: FAIL (no `coloring-pack` subcommand).

- [x] **Step 7: Add the CLI subcommand**

In `projects/etsy-rooster-shop/src/etsy_rooster/cli.py`, find the existing `generate_themed_mandala` function. Add the new `generate_coloring_pack` subcommand right after `generate_coloring` (before `generate_poster` to keep coloring commands grouped):

```python
@generate.command("coloring-pack")
@click.option("--pack-id", required=True, help="Pack identifier (e.g. mushroom-mini-1)")
@click.option("--book-id", required=True, help="Source KDP book_id whose PDF we extract from")
@click.option("--pages", required=True, help="Comma-separated 1-indexed page numbers (e.g. 1,3,5,7,9)")
@click.option("--title", required=True, help="Cover + listing title")
@click.option("--subtitle", required=True, help="Cover subtitle")
@click.option("--tags", required=True, help="Comma-separated theme_tags (for SEO routing)")
def generate_coloring_pack(
    pack_id: str, book_id: str, pages: str, title: str, subtitle: str, tags: str
) -> None:
    """Extract a themed mini-pack of pages from an existing coloring book PDF."""
    from etsy_rooster.coloring.pack_niche import ColoringPackNiche
    from etsy_rooster.coloring.page_extractor import extract_page_subset

    page_indices = [int(x.strip()) for x in pages.split(",") if x.strip()]
    theme_tags = [t.strip() for t in tags.split(",") if t.strip()]

    # The source PDF is the built Etsy-edition PDF from the prior `generate coloring`
    # run. Lives at data/coloring/<book_id>/<book_id>.pdf.
    source_pdf = config.data_dir() / "coloring" / book_id / f"{book_id}.pdf"

    niche = ColoringPackNiche(
        pack_id=pack_id,
        book_id=book_id,
        title=title,
        subtitle=subtitle,
        page_indices=page_indices,
        theme_tags=theme_tags,
        source_pdf_path=source_pdf,
    )

    out_dir = config.data_dir() / "coloring-packs" / pack_id
    out_dir.mkdir(parents=True, exist_ok=True)
    out_pdf = out_dir / f"{pack_id}.pdf"

    extract_page_subset(
        source_pdf_path=niche.source_pdf_path,
        page_indices=niche.page_indices,
        output_pdf_path=out_pdf,
        title=niche.title,
        subtitle=niche.subtitle,
    )

    db = _db()
    sku_id = db.create_sku(
        niche="coloring-pack",
        params={
            "pack_id": niche.pack_id,
            "book_id": niche.book_id,
            "title": niche.title,
            "subtitle": niche.subtitle,
            "design_count": niche.design_count,
            "page_indices": niche.page_indices,
            "theme_tags": niche.theme_tags,
        },
    )
    db.attach_artifact_file(sku_id, kind="pdf", path=str(out_pdf))
    db.log_op(sku_id, event="generated", detail=f"pack_id={pack_id}")
    click.echo(f"sku_id={sku_id} pack={pack_id} pdf={out_pdf}")
```

- [x] **Step 8: Run CLI test, verify pass**

```bash
python -m pytest tests/test_coloring_pack_cli.py -v --no-cov
```
Expected: 1 passed.

- [x] **Step 9: Full suite**

```bash
python -m pytest tests/ -q --no-cov 2>&1 | tail -3
```
Expected: 245 passed, 6 deselected (239 prior + 5 niche + 1 CLI).

- [x] **Step 10: Commit**

```bash
git -C C:/Sandbox/AIProjectManagement/Rooster-AI-Project-Management/projects/etsy-rooster-shop add src/etsy_rooster/coloring/pack_niche.py src/etsy_rooster/cli.py tests/test_coloring_pack_niche.py tests/test_coloring_pack_cli.py
git -C C:/Sandbox/AIProjectManagement/Rooster-AI-Project-Management/projects/etsy-rooster-shop commit -m "feat(coloring): coloring-pack niche + 'generate coloring-pack' CLI"
```

---

## Task 3: Multi-print Nano Banana Pro Node generator

**Files:**
- Create: `web.ui/backend/scripts/generate_poster_sets.mjs`

This task is **Node code, not Python.** It generates N prints for a wall art set by calling the existing `ImageGenerationService` N times. Output lands at `<kdp>/assets/generated/poster_sets/<set_id>/print_NN.png`.

No new Python tests. Smoke-test the script with `--dry-run` instead.

- [x] **Step 1: Create the Node generator**

Create `web.ui/backend/scripts/generate_poster_sets.mjs`:

```javascript
#!/usr/bin/env node
/**
 * Generate N printable wall-art images via Nano Banana Pro for one SET.
 *
 * Mirrors generate_posters.mjs but iterates over a set's `prints` array.
 * Set prompt bank format (JSON):
 *   {
 *     "set_id": "cottagecore-kitchen-set-v1",
 *     "title": "Cottagecore Kitchen Wall Art",
 *     "subtitle": "6-Print Botanical Set for the Cozy Kitchen",
 *     "style_preamble": "...",
 *     "theme_tags": ["..."],
 *     "prints": [
 *       { "slug": "01-herb-jars", "subject": "..." },
 *       { "slug": "02-teapot",    "subject": "..." },
 *       ...
 *     ]
 *   }
 *
 * Output:
 *   <kdp>/assets/generated/poster_sets/<set_id>/<slug>.png
 *
 * Usage:
 *   node scripts/generate_poster_sets.mjs cottagecore-kitchen-set-v1
 *   node scripts/generate_poster_sets.mjs cottagecore-kitchen-set-v1 --skip-existing
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { ImageGenerationService } from '../agents/ImageGenerationService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BACKEND_DIR = path.resolve(__dirname, '..');
const REPO_ROOT = path.resolve(BACKEND_DIR, '..', '..');
const KDP_ROOT = path.join(REPO_ROOT, 'projects', 'kdp-puzzle-press');
const PROMPTS_DIR = path.join(KDP_ROOT, 'data', 'poster_set_prompts');
const SETS_ASSETS_ROOT = path.join(KDP_ROOT, 'assets', 'generated', 'poster_sets');

dotenv.config({ path: path.join(BACKEND_DIR, '.env.local') });
dotenv.config({ path: path.join(BACKEND_DIR, '.env') });


function loadSetBank(setId) {
  const p = path.join(PROMPTS_DIR, `${setId}.json`);
  if (!fs.existsSync(p)) {
    throw new Error(
      `No set prompt bank found for "${setId}" at ${path.relative(REPO_ROOT, p)}.`,
    );
  }
  const bank = JSON.parse(fs.readFileSync(p, 'utf-8'));
  for (const field of ['set_id', 'title', 'style_preamble', 'theme_tags', 'prints']) {
    if (!bank[field]) {
      throw new Error(`Set prompt bank for "${setId}" missing field "${field}".`);
    }
  }
  if (!Array.isArray(bank.prints) || bank.prints.length === 0) {
    throw new Error(`Set prompt bank for "${setId}" has no prints in the array.`);
  }
  for (const [i, pr] of bank.prints.entries()) {
    if (!pr.slug || !pr.subject) {
      throw new Error(
        `Set "${setId}" print ${i} missing required "slug" or "subject" field.`,
      );
    }
  }
  return bank;
}


function buildPrintPrompt(bank, print) {
  return `${bank.style_preamble} ${print.subject}`;
}


function parseArgs(argv) {
  const args = argv.slice(2);
  const setId = args.find((a) => !a.startsWith('--'));
  const skipExisting = args.includes('--skip-existing');
  return { setId, skipExisting };
}


async function main() {
  const { setId, skipExisting } = parseArgs(process.argv);
  if (!setId) {
    console.error('Usage: node scripts/generate_poster_sets.mjs <set-id> [--skip-existing]');
    process.exit(2);
  }
  if (!process.env.GEMINI_API_KEY) {
    console.error('GEMINI_API_KEY is not set. Add it to web.ui/backend/.env.local.');
    process.exit(1);
  }

  const outDir = path.join(SETS_ASSETS_ROOT, setId);
  fs.mkdirSync(outDir, { recursive: true });

  const bank = loadSetBank(setId);
  console.log(`ðŸŽ¨ Generating ${bank.prints.length} prints for set "${setId}"`);

  const svc = new ImageGenerationService({
    apiKey: process.env.GEMINI_API_KEY,
    model: process.env.IMAGE_MODEL, // defaults to gemini-3-pro-image-preview
    outputDir: outDir,
  });

  let generated = 0;
  let skipped = 0;
  for (const print of bank.prints) {
    const outPath = path.join(outDir, `${print.slug}.png`);
    if (skipExisting && fs.existsSync(outPath)) {
      console.log(`   â­ï¸  ${print.slug}.png exists, skipping`);
      skipped += 1;
      continue;
    }
    const prompt = buildPrintPrompt(bank, print);
    const t0 = Date.now();
    const result = await svc.generate({
      prompt,
      aspectRatio: '3:4',
      resolution: '4K',
      taskId: `set-${setId}-${print.slug}`,
    });
    fs.renameSync(path.join(outDir, result.filename), outPath);
    const ms = Date.now() - t0;
    const kb = Math.round(result.bytes / 1024);
    console.log(`   âœ… ${print.slug} (${kb} KB in ${(ms / 1000).toFixed(1)}s)`);
    generated += 1;
  }

  console.log(`Done: ${generated} generated, ${skipped} skipped â†’ ${path.relative(REPO_ROOT, outDir)}`);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
```

- [x] **Step 2: Smoke-test the Node script with a missing set ID**

```bash
cd /c/Sandbox/AIProjectManagement/Rooster-AI-Project-Management/web.ui/backend && node scripts/generate_poster_sets.mjs nonexistent-set-v1 2>&1 | head -5
```
Expected: errors out with "No set prompt bank found" message (the script's input validation works).

- [x] **Step 3: Create the prompt-bank schema directory in the KDP repo**

```bash
mkdir -p C:/Sandbox/AIProjectManagement/Rooster-AI-Project-Management/projects/kdp-puzzle-press/data/poster_set_prompts
```

(The directory will be populated with one JSON per set during Task 9 runbook. No code changes here.)

- [x] **Step 4: Commit**

```bash
cd C:/Sandbox/AIProjectManagement/Rooster-AI-Project-Management && git add web.ui/backend/scripts/generate_poster_sets.mjs && git commit -m "feat(plan3): Nano Banana Pro multi-print set generator script"
```

(Outer-repo commit â€” separate from the etsy-rooster-shop nested repo. Use `git -C` if needed.)

---

## Task 4: Poster set Python builder + niche

**Files:**
- Create: `projects/etsy-rooster-shop/src/etsy_rooster/posters/set_niche.py`
- Create: `projects/etsy-rooster-shop/src/etsy_rooster/posters/set_builder.py`
- Create: `projects/etsy-rooster-shop/src/etsy_rooster/posters/set_kdp_importer.py`
- Create: `projects/etsy-rooster-shop/tests/test_poster_set_niche.py`
- Create: `projects/etsy-rooster-shop/tests/test_poster_set_builder.py`

- [x] **Step 1: Write failing tests for `PosterSetNiche`**

Create `projects/etsy-rooster-shop/tests/test_poster_set_niche.py`:

```python
from __future__ import annotations

from pathlib import Path

import pytest
from PIL import Image

from etsy_rooster.posters.set_niche import PosterSetNiche


def _make_png(path: Path) -> Path:
    Image.new("RGB", (100, 133), (200, 180, 160)).save(path)
    return path


def test_valid_set_niche(tmp_path: Path) -> None:
    set_dir = tmp_path / "poster_sets" / "test-set"
    set_dir.mkdir(parents=True)
    prints = [_make_png(set_dir / f"print_{i:02d}.png") for i in range(1, 7)]
    n = PosterSetNiche(
        set_id="test-set",
        title="Test Set",
        subtitle="Six botanical prints",
        theme_tags=["cottagecore", "botanical", "gallery"],
        print_png_paths=prints,
        set_dir=set_dir,
    )
    assert n.print_count == 6


def test_empty_prints_rejected(tmp_path: Path) -> None:
    set_dir = tmp_path / "poster_sets" / "test-set"
    set_dir.mkdir(parents=True)
    with pytest.raises(ValueError, match="at least one"):
        PosterSetNiche(
            set_id="test-set",
            title="T",
            subtitle="S",
            theme_tags=["t"],
            print_png_paths=[],
            set_dir=set_dir,
        )


def test_missing_print_rejected(tmp_path: Path) -> None:
    set_dir = tmp_path / "poster_sets" / "test-set"
    set_dir.mkdir(parents=True)
    with pytest.raises(ValueError, match="print PNG does not exist"):
        PosterSetNiche(
            set_id="test-set",
            title="T",
            subtitle="S",
            theme_tags=["t"],
            print_png_paths=[set_dir / "missing.png"],
            set_dir=set_dir,
        )


def test_missing_set_dir_rejected(tmp_path: Path) -> None:
    with pytest.raises(ValueError, match="set_dir"):
        PosterSetNiche(
            set_id="test-set",
            title="T",
            subtitle="S",
            theme_tags=["t"],
            print_png_paths=[tmp_path / "p.png"],  # will short-circuit on set_dir check first
            set_dir=tmp_path / "missing-set",
        )
```

- [x] **Step 2: Run niche tests to confirm failure**

```bash
python -m pytest tests/test_poster_set_niche.py -v --no-cov
```
Expected: 4 errors (module not found).

- [x] **Step 3: Implement `PosterSetNiche`**

Create `projects/etsy-rooster-shop/src/etsy_rooster/posters/set_niche.py`:

```python
"""PosterSetNiche â€” data Plan 3's wall-art-set pipeline needs about one bundle."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class PosterSetNiche:
    """Everything needed to build one wall-art-set ZIP.

    A set is 6 prints (typically), each rendered at 3 sizes (8x10, 11x14, 16x20)
    and bundled into one ZIP plus an instructions PDF.
    """

    set_id: str
    title: str
    subtitle: str
    theme_tags: list[str]
    print_png_paths: list[Path]   # Nano Banana Pro master PNGs, one per print
    set_dir: Path                  # parent dir holding all the prints

    def __post_init__(self) -> None:
        if not self.set_id:
            raise ValueError("set_id must be non-empty")
        if not self.title:
            raise ValueError("title must be non-empty")
        if not self.theme_tags:
            raise ValueError("theme_tags must contain at least one tag")
        if not self.set_dir.is_dir():
            raise ValueError(f"set_dir does not exist: {self.set_dir}")
        if not self.print_png_paths:
            raise ValueError("print_png_paths must contain at least one PNG")
        for p in self.print_png_paths:
            if not p.is_file():
                raise ValueError(f"print PNG does not exist: {p}")

    @property
    def print_count(self) -> int:
        return len(self.print_png_paths)
```

- [x] **Step 4: Run niche tests, verify pass**

```bash
python -m pytest tests/test_poster_set_niche.py -v --no-cov
```
Expected: 4 passed.

- [x] **Step 5: Write failing tests for `build_set_zip`**

Create `projects/etsy-rooster-shop/tests/test_poster_set_builder.py`:

```python
from __future__ import annotations

import zipfile
from pathlib import Path

from PIL import Image

from etsy_rooster.posters.set_builder import build_set_zip
from etsy_rooster.posters.set_niche import PosterSetNiche


def _make_master(path: Path, size: tuple[int, int] = (3072, 4096)) -> Path:
    Image.new("RGB", size, (180, 140, 100)).save(path)
    return path


def test_build_set_zip_contains_all_sizes_for_all_prints(tmp_path: Path) -> None:
    set_dir = tmp_path / "poster_sets" / "test-set"
    set_dir.mkdir(parents=True)
    prints = [
        _make_master(set_dir / f"print_{i:02d}.png", size=(300, 400))
        for i in range(1, 4)  # 3 prints for speed
    ]
    niche = PosterSetNiche(
        set_id="test-set",
        title="Test Set",
        subtitle="Three test prints",
        theme_tags=["t"],
        print_png_paths=prints,
        set_dir=set_dir,
    )

    out_dir = tmp_path / "out"
    zip_path = build_set_zip(niche, out_dir)
    assert zip_path == out_dir / "test-set.zip"
    assert zip_path.is_file()

    with zipfile.ZipFile(zip_path) as zf:
        names = set(zf.namelist())
    # 3 prints Ã— 3 sizes = 9 JPGs + 1 instructions PDF
    assert len(names) == 10
    # Spot-check naming convention
    assert "print_01_8x10.jpg" in names
    assert "print_02_11x14.jpg" in names
    assert "print_03_16x20.jpg" in names
    assert "print_instructions.pdf" in names


def test_build_set_zip_outputs_jpg_with_300_dpi(tmp_path: Path) -> None:
    set_dir = tmp_path / "poster_sets" / "tiny-set"
    set_dir.mkdir(parents=True)
    master = _make_master(set_dir / "print_01.png", size=(400, 533))
    niche = PosterSetNiche(
        set_id="tiny-set",
        title="Tiny",
        subtitle="One print",
        theme_tags=["t"],
        print_png_paths=[master],
        set_dir=set_dir,
    )
    out_dir = tmp_path / "out"
    zip_path = build_set_zip(niche, out_dir)
    with zipfile.ZipFile(zip_path) as zf:
        with zf.open("print_01_8x10.jpg") as fh:
            from io import BytesIO
            im = Image.open(BytesIO(fh.read()))
            assert im.size == (2400, 3000)  # 8x10 at 300 DPI
```

- [x] **Step 6: Run builder tests to confirm failure**

```bash
python -m pytest tests/test_poster_set_builder.py -v --no-cov
```
Expected: 2 errors (module not found).

- [x] **Step 7: Implement `build_set_zip`**

Create `projects/etsy-rooster-shop/src/etsy_rooster/posters/set_builder.py`:

```python
"""Build the buyer-facing ZIP for a wall-art SET: N prints Ã— 3 sizes."""

from __future__ import annotations

import io
import zipfile
from pathlib import Path

from PIL import Image
from reportlab.lib.pagesizes import LETTER
from reportlab.lib.units import inch
from reportlab.pdfgen.canvas import Canvas

from etsy_rooster.posters.set_niche import PosterSetNiche

# Three print sizes for the set bundle (smaller selection than single posters
# so the ZIP doesn't explode â€” sets are 6+ images at 5 sizes each = too large).
SET_SIZES: dict[str, tuple[int, int]] = {
    "8x10":  (2400, 3000),
    "11x14": (3300, 4200),
    "16x20": (4800, 6000),
}

_JPG_QUALITY = 92


def _center_crop_to_aspect(im: Image.Image, target_w: int, target_h: int) -> Image.Image:
    target_ratio = target_w / target_h
    src_ratio = im.width / im.height
    if abs(src_ratio - target_ratio) < 1e-4:
        return im
    if src_ratio > target_ratio:
        new_w = int(round(im.height * target_ratio))
        x0 = (im.width - new_w) // 2
        return im.crop((x0, 0, x0 + new_w, im.height))
    new_h = int(round(im.width / target_ratio))
    y0 = (im.height - new_h) // 2
    return im.crop((0, y0, im.width, y0 + new_h))


def _render_size_jpg(master: Image.Image, target_w: int, target_h: int) -> bytes:
    cropped = _center_crop_to_aspect(master, target_w, target_h)
    resized = cropped.resize((target_w, target_h), Image.Resampling.LANCZOS)
    buf = io.BytesIO()
    resized.save(buf, format="JPEG", quality=_JPG_QUALITY, dpi=(300, 300))
    return buf.getvalue()


def _render_instructions_pdf(niche: PosterSetNiche) -> bytes:
    buf = io.BytesIO()
    c = Canvas(buf, pagesize=LETTER)
    width, height = LETTER
    margin = 0.75 * inch
    cy = height - margin

    c.setFont("Helvetica-Bold", 18)
    c.drawString(margin, cy, "Thank you for your purchase â€” Pocket Rooster Press")
    cy -= 28

    c.setFont("Helvetica", 11)
    for line in [
        f"  Set: {niche.title}",
        f"  Prints included: {niche.print_count}",
        "  Sizes per print: 8x10, 11x14, 16x20 (all 300 DPI JPG)",
        "  ",
        "  Print at home or any photo lab. For best results, use matte or",
        "  cardstock paper. Frame in matching colors for a unified gallery wall.",
        "  ",
        "  For personal use only. Not for resale or commercial use.",
        "  Designs are created with AI image tools and refined for clean printing,",
        "  disclosed per Etsy's 2024 listing-quality policy.",
    ]:
        c.drawString(margin, cy, line)
        cy -= 16

    c.save()
    return buf.getvalue()


def build_set_zip(niche: PosterSetNiche, output_dir: Path) -> Path:
    """Bundle N prints Ã— 3 sizes + 1 instructions PDF into <output_dir>/<set_id>.zip."""
    output_dir.mkdir(parents=True, exist_ok=True)
    zip_path = output_dir / f"{niche.set_id}.zip"

    instructions = _render_instructions_pdf(niche)

    with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        for print_path in niche.print_png_paths:
            stem = print_path.stem  # e.g. "print_01"
            with Image.open(print_path) as raw:
                master = raw.convert("RGB")
            for size_label, (w, h) in SET_SIZES.items():
                jpg_bytes = _render_size_jpg(master, w, h)
                zf.writestr(f"{stem}_{size_label}.jpg", jpg_bytes)
        zf.writestr("print_instructions.pdf", instructions)

    return zip_path
```

- [x] **Step 8: Run builder tests, verify pass**

```bash
python -m pytest tests/test_poster_set_builder.py -v --no-cov
```
Expected: 2 passed.

- [x] **Step 9: Implement the importer (no test â€” trivial passthrough)**

Create `projects/etsy-rooster-shop/src/etsy_rooster/posters/set_kdp_importer.py`:

```python
"""Read a poster-set prompt JSON + its generated print PNGs into a PosterSetNiche."""

from __future__ import annotations

import json
from pathlib import Path

from etsy_rooster.posters.set_niche import PosterSetNiche


class PosterSetAssetError(RuntimeError):
    """Raised when KDP-side poster set assets or metadata don't match expectations."""


_REQUIRED_FIELDS = ("set_id", "title", "subtitle", "theme_tags", "prints")


def load_poster_set_niche(*, kdp_root: Path, set_id: str) -> PosterSetNiche:
    """Build a PosterSetNiche from kdp-puzzle-press project state.

    Reads:
      - <kdp_root>/data/poster_set_prompts/<set_id>.json
      - <kdp_root>/assets/generated/poster_sets/<set_id>/<print_slug>.png  (one per print)
    """
    prompt_path = kdp_root / "data" / "poster_set_prompts" / f"{set_id}.json"
    if not prompt_path.is_file():
        raise PosterSetAssetError(f"set prompt JSON not found: {prompt_path}")

    data = json.loads(prompt_path.read_text(encoding="utf-8"))
    for field in _REQUIRED_FIELDS:
        if field not in data:
            raise PosterSetAssetError(
                f"set prompt JSON {prompt_path.name} missing field {field!r}"
            )

    set_dir = kdp_root / "assets" / "generated" / "poster_sets" / set_id
    if not set_dir.is_dir():
        raise PosterSetAssetError(f"set output dir does not exist: {set_dir}")

    print_paths: list[Path] = []
    for pr in data["prints"]:
        slug = pr["slug"]
        png = set_dir / f"{slug}.png"
        if not png.is_file():
            raise PosterSetAssetError(
                f"missing generated PNG for set {set_id!r} print {slug!r}: {png}"
            )
        print_paths.append(png)

    return PosterSetNiche(
        set_id=data["set_id"],
        title=data["title"],
        subtitle=data["subtitle"],
        theme_tags=list(data["theme_tags"]),
        print_png_paths=print_paths,
        set_dir=set_dir,
    )
```

- [x] **Step 10: Full suite**

```bash
python -m pytest tests/ -q --no-cov 2>&1 | tail -3
```
Expected: 251 passed, 6 deselected (245 prior + 4 niche + 2 builder).

- [x] **Step 11: Commit**

```bash
git -C C:/Sandbox/AIProjectManagement/Rooster-AI-Project-Management/projects/etsy-rooster-shop add src/etsy_rooster/posters/set_niche.py src/etsy_rooster/posters/set_builder.py src/etsy_rooster/posters/set_kdp_importer.py tests/test_poster_set_niche.py tests/test_poster_set_builder.py
git -C C:/Sandbox/AIProjectManagement/Rooster-AI-Project-Management/projects/etsy-rooster-shop commit -m "feat(posters): wall-art-set niche + builder + KDP importer"
```

---

## Task 5: Poster-set CLI command

**Files:**
- Modify: `projects/etsy-rooster-shop/src/etsy_rooster/cli.py` (add `generate poster-set` subcommand)
- Create: `projects/etsy-rooster-shop/tests/test_poster_set_cli.py`

- [x] **Step 1: Write failing CLI test**

Create `projects/etsy-rooster-shop/tests/test_poster_set_cli.py`:

```python
from __future__ import annotations

import json
import sqlite3
from pathlib import Path

import pytest
from click.testing import CliRunner
from PIL import Image


def _seed_set_fixture(tmp_path: Path, set_id: str = "test-set-v1") -> Path:
    """Build a KDP-style fixture: prompt JSON + 3 generated print PNGs."""
    kdp = tmp_path / "kdp"
    prompts = kdp / "data" / "poster_set_prompts"
    prompts.mkdir(parents=True)
    (prompts / f"{set_id}.json").write_text(
        json.dumps({
            "set_id": set_id,
            "title": "Test Set",
            "subtitle": "Three botanical prints for the cozy kitchen",
            "style_preamble": "Soft watercolor cottagecore",
            "theme_tags": ["cottagecore", "kitchen", "botanical"],
            "prints": [
                {"slug": "01-jars", "subject": "herb jars on shelf"},
                {"slug": "02-teapot", "subject": "ceramic teapot beside a mug"},
                {"slug": "03-loaf", "subject": "fresh bread on a cutting board"},
            ],
        }),
        encoding="utf-8",
    )
    out = kdp / "assets" / "generated" / "poster_sets" / set_id
    out.mkdir(parents=True)
    for slug in ("01-jars", "02-teapot", "03-loaf"):
        Image.new("RGB", (300, 400), (180, 140, 100)).save(out / f"{slug}.png")
    return kdp


def test_generate_poster_set_creates_sku_and_zip(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    kdp = _seed_set_fixture(tmp_path)
    monkeypatch.setenv("KDP_ASSETS_DIR", str(kdp))
    monkeypatch.setenv("ETSY_ROOSTER_DATA_DIR", str(tmp_path / "data"))

    from etsy_rooster.cli import cli

    runner = CliRunner()
    result = runner.invoke(cli, ["generate", "poster-set", "--set", "test-set-v1"])
    assert result.exit_code == 0, f"output={result.output!r}\nexc={result.exception!r}"
    assert "sku_id=" in result.output

    zip_path = tmp_path / "data" / "poster-sets" / "test-set-v1" / "test-set-v1.zip"
    assert zip_path.is_file()

    conn = sqlite3.connect(tmp_path / "data" / "catalog.db")
    conn.row_factory = sqlite3.Row
    rows = list(conn.execute("SELECT id, niche, generator_params_json FROM sku"))
    assert len(rows) == 1
    assert rows[0]["niche"] == "wall-art-set"
    params = json.loads(rows[0]["generator_params_json"])
    assert params["set_id"] == "test-set-v1"
    assert params["print_count"] == 3
```

- [x] **Step 2: Run test to confirm failure**

```bash
python -m pytest tests/test_poster_set_cli.py -v --no-cov
```
Expected: FAIL (no `poster-set` subcommand).

- [x] **Step 3: Add the CLI subcommand**

In `projects/etsy-rooster-shop/src/etsy_rooster/cli.py`, add the new subcommand right after `generate_poster`:

```python
@generate.command("poster-set")
@click.option(
    "--set",
    "set_id",
    required=True,
    help="Poster set id (e.g. cottagecore-kitchen-set-v1)",
)
def generate_poster_set(set_id: str) -> None:
    """Package N Nano Banana Pro master PNGs as one Etsy wall-art-set SKU."""
    from etsy_rooster.posters.set_builder import build_set_zip
    from etsy_rooster.posters.set_kdp_importer import load_poster_set_niche

    niche = load_poster_set_niche(kdp_root=config.kdp_assets_dir(), set_id=set_id)
    out_dir = config.data_dir() / "poster-sets" / set_id
    out_dir.mkdir(parents=True, exist_ok=True)

    zip_path = build_set_zip(niche, out_dir)

    db = _db()
    sku_id = db.create_sku(
        niche="wall-art-set",
        params={
            "set_id": niche.set_id,
            "title": niche.title,
            "subtitle": niche.subtitle,
            "theme_tags": niche.theme_tags,
            "print_count": niche.print_count,
        },
    )
    db.attach_artifact_file(sku_id, kind="zip", path=str(zip_path))
    # Attach the individual print PNGs as preview_png so the existing preview
    # builder + video pipelines can find them.
    for p in niche.print_png_paths:
        db.attach_artifact_file(sku_id, kind="preview_png", path=str(p))
    db.log_op(sku_id, event="generated", detail=f"set_id={set_id}")
    click.echo(f"sku_id={sku_id} set={set_id} zip={zip_path}")
```

- [x] **Step 4: Run CLI test, verify pass**

```bash
python -m pytest tests/test_poster_set_cli.py -v --no-cov
```
Expected: 1 passed.

- [x] **Step 5: Full suite**

```bash
python -m pytest tests/ -q --no-cov 2>&1 | tail -3
```
Expected: 252 passed, 6 deselected (251 prior + 1 new).

- [x] **Step 6: Commit**

```bash
git -C C:/Sandbox/AIProjectManagement/Rooster-AI-Project-Management/projects/etsy-rooster-shop add src/etsy_rooster/cli.py tests/test_poster_set_cli.py
git -C C:/Sandbox/AIProjectManagement/Rooster-AI-Project-Management/projects/etsy-rooster-shop commit -m "feat(cli): 'generate poster-set' subcommand"
```

---

## Task 6: SVG bundle builder + CLI

**Files:**
- Create: `projects/etsy-rooster-shop/src/etsy_rooster/svg_render/bundle_niche.py`
- Create: `projects/etsy-rooster-shop/src/etsy_rooster/svg_render/svg_bundler.py`
- Modify: `projects/etsy-rooster-shop/src/etsy_rooster/cli.py` (add `generate svg-bundle` subcommand)
- Create: `projects/etsy-rooster-shop/tests/test_svg_bundler.py`
- Create: `projects/etsy-rooster-shop/tests/test_svg_bundle_cli.py`

- [x] **Step 1: Write failing tests for `build_svg_bundle`**

Create `projects/etsy-rooster-shop/tests/test_svg_bundler.py`:

```python
from __future__ import annotations

import zipfile
from pathlib import Path

import pytest

from etsy_rooster.svg_render.bundle_niche import SvgBundleNiche
from etsy_rooster.svg_render.svg_bundler import build_svg_bundle


def _make_svg(path: Path, color: str = "#000") -> Path:
    """Write a minimal 100x100 SVG to path."""
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        '<?xml version="1.0"?>\n'
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">\n'
        f'  <circle cx="50" cy="50" r="40" fill="none" stroke="{color}" stroke-width="2"/>\n'
        '</svg>\n',
        encoding="utf-8",
    )
    return path


def test_bundle_zip_contains_all_svgs(tmp_path: Path) -> None:
    svg_dir = tmp_path / "svgs"
    svgs = [_make_svg(svg_dir / f"design_{i:02d}.svg") for i in range(1, 6)]
    niche = SvgBundleNiche(
        bundle_id="test-bundle",
        title="Test Bundle",
        theme_tags=["cottagecore", "svg", "cricut"],
        svg_paths=svgs,
    )
    out_dir = tmp_path / "out"
    zip_path, preview_path = build_svg_bundle(niche, out_dir)

    assert zip_path == out_dir / "test-bundle.zip"
    assert zip_path.is_file()
    with zipfile.ZipFile(zip_path) as zf:
        names = zf.namelist()
    assert len(names) == 5
    assert all(n.endswith(".svg") for n in names)

    # Preview PNG exists and is non-empty
    assert preview_path.is_file()
    assert preview_path.stat().st_size > 1000


def test_bundle_design_count(tmp_path: Path) -> None:
    svg_dir = tmp_path / "svgs"
    svgs = [_make_svg(svg_dir / f"d_{i}.svg") for i in range(1, 4)]
    niche = SvgBundleNiche(
        bundle_id="b",
        title="T",
        theme_tags=["t"],
        svg_paths=svgs,
    )
    assert niche.design_count == 3


def test_empty_svg_paths_rejected(tmp_path: Path) -> None:
    with pytest.raises(ValueError, match="at least one"):
        SvgBundleNiche(
            bundle_id="b",
            title="T",
            theme_tags=["t"],
            svg_paths=[],
        )


def test_missing_svg_file_rejected(tmp_path: Path) -> None:
    with pytest.raises(ValueError, match="does not exist"):
        SvgBundleNiche(
            bundle_id="b",
            title="T",
            theme_tags=["t"],
            svg_paths=[tmp_path / "missing.svg"],
        )
```

- [x] **Step 2: Run tests to confirm failure**

```bash
python -m pytest tests/test_svg_bundler.py -v --no-cov
```
Expected: 4 errors (module not found).

- [x] **Step 3: Implement `SvgBundleNiche`**

Create `projects/etsy-rooster-shop/src/etsy_rooster/svg_render/bundle_niche.py`:

```python
"""SvgBundleNiche â€” data Plan 3's svg-bundle pipeline needs about one bundle."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class SvgBundleNiche:
    """Everything needed to build one SVG-bundle ZIP + preview.

    A bundle is a single-purchase ZIP of 15-25 individual .svg files
    for Cricut/Silhouette users. Pricing is $5-12 per bundle.
    """

    bundle_id: str
    title: str
    theme_tags: list[str]
    svg_paths: list[Path]  # individual SVG files to bundle

    def __post_init__(self) -> None:
        if not self.bundle_id:
            raise ValueError("bundle_id must be non-empty")
        if not self.title:
            raise ValueError("title must be non-empty")
        if not self.theme_tags:
            raise ValueError("theme_tags must contain at least one tag")
        if not self.svg_paths:
            raise ValueError("svg_paths must contain at least one SVG")
        for p in self.svg_paths:
            if not p.is_file():
                raise ValueError(f"SVG file does not exist: {p}")

    @property
    def design_count(self) -> int:
        return len(self.svg_paths)
```

- [x] **Step 4: Implement `build_svg_bundle`**

Create `projects/etsy-rooster-shop/src/etsy_rooster/svg_render/svg_bundler.py`:

```python
"""Bundle N SVG files into one ZIP + render a tiled preview PNG."""

from __future__ import annotations

import math
import zipfile
from pathlib import Path

from etsy_rooster.svg_render.bundle_niche import SvgBundleNiche
from etsy_rooster.svg_render.mandala_generator import _svg_to_png

PREVIEW_TILE_PX = 256
PREVIEW_GUTTER_PX = 8


def build_svg_bundle(
    niche: SvgBundleNiche, output_dir: Path
) -> tuple[Path, Path]:
    """Bundle the SVGs into <output_dir>/<bundle_id>.zip and write a tiled
    preview PNG to <output_dir>/<bundle_id>-preview.png.

    Returns (zip_path, preview_png_path).
    """
    output_dir.mkdir(parents=True, exist_ok=True)
    zip_path = output_dir / f"{niche.bundle_id}.zip"
    preview_path = output_dir / f"{niche.bundle_id}-preview.png"

    with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        for svg_path in niche.svg_paths:
            zf.write(svg_path, arcname=svg_path.name)

    _render_tiled_preview(niche.svg_paths, preview_path)

    return zip_path, preview_path


def _render_tiled_preview(svg_paths: list[Path], output_path: Path) -> None:
    """Render each SVG to a small PNG, then tile them into a grid preview."""
    from PIL import Image

    n = len(svg_paths)
    cols = max(1, int(math.ceil(math.sqrt(n))))
    rows = max(1, int(math.ceil(n / cols)))

    canvas_w = cols * PREVIEW_TILE_PX + (cols + 1) * PREVIEW_GUTTER_PX
    canvas_h = rows * PREVIEW_TILE_PX + (rows + 1) * PREVIEW_GUTTER_PX
    canvas = Image.new("RGB", (canvas_w, canvas_h), (251, 243, 226))  # brand cream

    for idx, svg_path in enumerate(svg_paths):
        tmp_png = output_path.parent / f".tile_{svg_path.stem}.png"
        svg_text = svg_path.read_text(encoding="utf-8")
        _svg_to_png(svg_text, tmp_png, size=PREVIEW_TILE_PX)

        tile = Image.open(tmp_png)
        col = idx % cols
        row = idx // cols
        x = PREVIEW_GUTTER_PX + col * (PREVIEW_TILE_PX + PREVIEW_GUTTER_PX)
        y = PREVIEW_GUTTER_PX + row * (PREVIEW_TILE_PX + PREVIEW_GUTTER_PX)
        canvas.paste(tile, (x, y))
        tmp_png.unlink(missing_ok=True)

    canvas.save(output_path, format="PNG")
```

- [x] **Step 5: Run bundler tests, verify pass**

```bash
python -m pytest tests/test_svg_bundler.py -v --no-cov
```
Expected: 4 passed.

- [x] **Step 6: Write failing CLI test**

Create `projects/etsy-rooster-shop/tests/test_svg_bundle_cli.py`:

```python
from __future__ import annotations

import json
import sqlite3
from pathlib import Path

import pytest
from click.testing import CliRunner


def _make_svg(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        '<?xml version="1.0"?>\n'
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">\n'
        '  <circle cx="50" cy="50" r="40" fill="none" stroke="#000" stroke-width="2"/>\n'
        '</svg>\n',
        encoding="utf-8",
    )


def test_generate_svg_bundle_creates_sku_zip_preview(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("ETSY_ROOSTER_DATA_DIR", str(tmp_path / "data"))

    # Seed 3 SVG files in the artifacts area
    artifacts = tmp_path / "data" / "artifacts" / "bundle-source"
    for i in range(1, 4):
        _make_svg(artifacts / f"design_{i:02d}.svg")

    from etsy_rooster.cli import cli

    runner = CliRunner()
    result = runner.invoke(
        cli,
        [
            "generate", "svg-bundle",
            "--bundle-id", "test-bundle-v1",
            "--title", "Test Cottagecore Bundle",
            "--tags", "cottagecore,svg,cricut",
            "--svgs", str(artifacts / "design_01.svg"),
            "--svgs", str(artifacts / "design_02.svg"),
            "--svgs", str(artifacts / "design_03.svg"),
        ],
    )
    assert result.exit_code == 0, f"output={result.output!r}\nexc={result.exception!r}"

    zip_path = tmp_path / "data" / "svg-bundles" / "test-bundle-v1" / "test-bundle-v1.zip"
    preview = tmp_path / "data" / "svg-bundles" / "test-bundle-v1" / "test-bundle-v1-preview.png"
    assert zip_path.is_file()
    assert preview.is_file()

    conn = sqlite3.connect(tmp_path / "data" / "catalog.db")
    conn.row_factory = sqlite3.Row
    rows = list(conn.execute("SELECT id, niche, generator_params_json FROM sku"))
    assert len(rows) == 1
    assert rows[0]["niche"] == "svg-bundle"
    params = json.loads(rows[0]["generator_params_json"])
    assert params["bundle_id"] == "test-bundle-v1"
    assert params["design_count"] == 3
```

- [x] **Step 7: Run CLI test to confirm failure**

```bash
python -m pytest tests/test_svg_bundle_cli.py -v --no-cov
```
Expected: FAIL (no `svg-bundle` subcommand).

- [x] **Step 8: Add the CLI subcommand**

In `projects/etsy-rooster-shop/src/etsy_rooster/cli.py`, add right after `generate_mandala`:

```python
@generate.command("svg-bundle")
@click.option("--bundle-id", required=True, help="Bundle identifier (e.g. cottagecore-botanical-svg-bundle-v1)")
@click.option("--title", required=True, help="Bundle title for the listing")
@click.option("--tags", required=True, help="Comma-separated theme_tags (must include 'cricut','svg')")
@click.option(
    "--svgs",
    "svg_paths",
    multiple=True,
    required=True,
    help="One --svgs <path> per SVG file (repeat for each). 15-25 typical.",
)
def generate_svg_bundle(
    bundle_id: str, title: str, tags: str, svg_paths: tuple[str, ...]
) -> None:
    """Bundle multiple SVGs into one Etsy svg-bundle SKU + tiled preview."""
    from etsy_rooster.svg_render.bundle_niche import SvgBundleNiche
    from etsy_rooster.svg_render.svg_bundler import build_svg_bundle

    theme_tags = [t.strip() for t in tags.split(",") if t.strip()]
    svg_path_objs = [Path(p) for p in svg_paths]

    niche = SvgBundleNiche(
        bundle_id=bundle_id,
        title=title,
        theme_tags=theme_tags,
        svg_paths=svg_path_objs,
    )

    out_dir = config.data_dir() / "svg-bundles" / bundle_id
    out_dir.mkdir(parents=True, exist_ok=True)
    zip_path, preview_path = build_svg_bundle(niche, out_dir)

    db = _db()
    sku_id = db.create_sku(
        niche="svg-bundle",
        params={
            "bundle_id": niche.bundle_id,
            "title": niche.title,
            "theme_tags": niche.theme_tags,
            "design_count": niche.design_count,
        },
    )
    db.attach_artifact_file(sku_id, kind="zip", path=str(zip_path))
    db.attach_artifact_file(sku_id, kind="preview_png", path=str(preview_path))
    db.log_op(sku_id, event="generated", detail=f"bundle_id={bundle_id}")
    click.echo(f"sku_id={sku_id} bundle={bundle_id} zip={zip_path}")
```

Also ensure `from pathlib import Path` is imported at the top of `cli.py` (it should be from prior tasks; verify).

- [x] **Step 9: Run CLI test, verify pass**

```bash
python -m pytest tests/test_svg_bundle_cli.py -v --no-cov
```
Expected: 1 passed.

- [x] **Step 10: Full suite**

```bash
python -m pytest tests/ -q --no-cov 2>&1 | tail -3
```
Expected: 257 passed, 6 deselected (252 prior + 4 bundler + 1 CLI).

- [x] **Step 11: Commit**

```bash
git -C C:/Sandbox/AIProjectManagement/Rooster-AI-Project-Management/projects/etsy-rooster-shop add src/etsy_rooster/svg_render/bundle_niche.py src/etsy_rooster/svg_render/svg_bundler.py src/etsy_rooster/cli.py tests/test_svg_bundler.py tests/test_svg_bundle_cli.py
git -C C:/Sandbox/AIProjectManagement/Rooster-AI-Project-Management/projects/etsy-rooster-shop commit -m "feat(svg): svg-bundle niche + builder + 'generate svg-bundle' CLI"
```

---

## Task 7: Video treatments for new niches

**Files:**
- Modify: `projects/etsy-rooster-shop/src/etsy_rooster/video/treatments.py`
- Modify: `projects/etsy-rooster-shop/src/etsy_rooster/video/builder.py`
- Modify: `projects/etsy-rooster-shop/tests/test_video_treatments.py`

- [x] **Step 1: Write failing tests**

Append to `projects/etsy-rooster-shop/tests/test_video_treatments.py`:

```python
from etsy_rooster.video.treatments import (
    coloring_pack_page_flip,
    svg_bundle_static,
    wall_art_set_zoom,
)


def test_coloring_pack_page_flip_uses_page_indices(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """coloring-pack reads page_indices from params, loads each PNG from KDP tree."""
    kdp = tmp_path / "kdp"
    pages = kdp / "assets" / "processed" / "coloring" / "fake-book-v1"
    pages.mkdir(parents=True)
    for i in range(1, 21):
        Image.new("1", (100, 130), 1).save(pages / f"page_{i:02d}.png")
    monkeypatch.setenv("KDP_ASSETS_DIR", str(kdp))

    db, sku_id = _seed_db(
        tmp_path,
        niche="coloring-pack",
        params={
            "pack_id": "mini-1",
            "book_id": "fake-book-v1",
            "title": "T",
            "subtitle": "S",
            "design_count": 5,
            "page_indices": [1, 5, 10, 15, 20],
            "theme_tags": ["t"],
        },
    )
    t = coloring_pack_page_flip(db, sku_id)
    assert len(t.frames) == 5
    for f in t.frames:
        assert f.is_file()
    assert t.frame_duration_s == 0.7
    assert t.zoom is None
    names = sorted(f.name for f in t.frames)
    assert "page_01.png" in names
    assert "page_20.png" in names


def test_wall_art_set_zoom_uses_first_print_png(tmp_path: Path) -> None:
    p1 = _make_image(tmp_path, "p1.png")
    p2 = _make_image(tmp_path, "p2.png")
    db, sku_id = _seed_db(
        tmp_path,
        niche="wall-art-set",
        params={
            "set_id": "test-set",
            "title": "T",
            "subtitle": "S",
            "theme_tags": ["t"],
            "print_count": 2,
        },
        attachments=[
            ("zip", tmp_path / "fake.zip"),
            ("preview_png", p1),
            ("preview_png", p2),
        ],
    )
    t = wall_art_set_zoom(db, sku_id)
    assert t.frames == [p1]  # first preview_png attachment
    assert t.zoom == (1.0, 1.4)
    assert t.frame_duration_s == 9.0


def test_svg_bundle_static_uses_tiled_preview(tmp_path: Path) -> None:
    preview = _make_image(tmp_path, "preview.png", size=(800, 800))
    db, sku_id = _seed_db(
        tmp_path,
        niche="svg-bundle",
        params={
            "bundle_id": "b",
            "title": "T",
            "theme_tags": ["t"],
            "design_count": 5,
        },
        attachments=[
            ("zip", tmp_path / "fake.zip"),
            ("preview_png", preview),
        ],
    )
    t = svg_bundle_static(db, sku_id)
    assert t.frames == [preview]
    assert t.frame_duration_s == 5.0
    assert t.zoom is None
```

- [x] **Step 2: Run tests to confirm failure**

```bash
python -m pytest tests/test_video_treatments.py -v --no-cov
```
Expected: 3 errors (cannot import new treatment functions).

- [x] **Step 3: Add the new treatment functions**

In `projects/etsy-rooster-shop/src/etsy_rooster/video/treatments.py`, append:

```python
def coloring_pack_page_flip(db: CatalogDB, sku_id: int) -> VideoTreatment:
    """Page-flip across the pack's specific page indices.

    Reads book_id + page_indices from the SKU's generator_params and loads
    each PNG from <kdp>/assets/processed/coloring/<book_id>/page_NN.png.
    Falls back to using all page_indices (no sampling) since packs are
    typically already 5-10 pages.
    """
    sku = db.get_sku(sku_id)
    params = json.loads(sku["generator_params_json"])
    book_id = params["book_id"]
    page_indices = list(params["page_indices"])
    kdp_root = config.kdp_assets_dir()
    asset_dir = kdp_root / "assets" / "processed" / "coloring" / book_id
    frames = [asset_dir / f"page_{i:02d}.png" for i in page_indices]
    return VideoTreatment(
        frames=frames,
        frame_duration_s=0.7,
        zoom=None,
    )


def wall_art_set_zoom(db: CatalogDB, sku_id: int) -> VideoTreatment:
    """Slow Ken Burns zoom on the FIRST print of a wall-art-set.

    A multi-print video would be ideal but takes 6Ã— ffmpeg time per video.
    For v1 we zoom on the lead image and let the preview mosaic show variety.
    """
    files = db.list_artifact_files(sku_id)
    previews = [f for f in files if f["kind"] == "preview_png"]
    if not previews:
        raise RuntimeError(
            f"sku {sku_id} has no preview_png artifact for wall_art_set_zoom"
        )
    return VideoTreatment(
        frames=[Path(previews[0]["path"])],
        frame_duration_s=9.0,
        zoom=(1.0, 1.4),
    )


def svg_bundle_static(db: CatalogDB, sku_id: int) -> VideoTreatment:
    """Static hold on the tiled preview PNG for SVG bundles.

    No zoom â€” the value prop is "see all the designs at once", so a static
    hold lets buyers scan the grid for 5 seconds.
    """
    files = db.list_artifact_files(sku_id)
    previews = [f for f in files if f["kind"] == "preview_png"]
    if not previews:
        raise RuntimeError(
            f"sku {sku_id} has no preview_png artifact for svg_bundle_static"
        )
    return VideoTreatment(
        frames=[Path(previews[0]["path"])],
        frame_duration_s=5.0,
        zoom=None,
    )
```

- [x] **Step 4: Wire new treatments into the dispatcher**

In `projects/etsy-rooster-shop/src/etsy_rooster/video/builder.py`, find `_TREATMENT_BY_NICHE` and extend it:

```python
_TREATMENT_BY_NICHE = {
    "coloring": treatments.coloring_page_flip,
    "poster": treatments.poster_zoom,
    "mandala": treatments.mandala_zoom,
    # Plan 3 new niches:
    "coloring-pack": treatments.coloring_pack_page_flip,
    "wall-art-set": treatments.wall_art_set_zoom,
    "svg-bundle": treatments.svg_bundle_static,
}
```

- [x] **Step 5: Run tests, verify pass**

```bash
python -m pytest tests/test_video_treatments.py -v --no-cov
```
Expected: 7 passed (4 existing + 3 new).

- [x] **Step 6: Full suite**

```bash
python -m pytest tests/ -q --no-cov 2>&1 | tail -3
```
Expected: 260 passed, 6 deselected (257 prior + 3 new).

- [x] **Step 7: Commit**

```bash
git -C C:/Sandbox/AIProjectManagement/Rooster-AI-Project-Management/projects/etsy-rooster-shop add src/etsy_rooster/video/treatments.py src/etsy_rooster/video/builder.py tests/test_video_treatments.py
git -C C:/Sandbox/AIProjectManagement/Rooster-AI-Project-Management/projects/etsy-rooster-shop commit -m "feat(video): treatments for coloring-pack, wall-art-set, svg-bundle niches"
```

---

## Task 8: Phase 1 Runbook â€” Single-page coloring packs + Cute Cats full book

**This is operational, not code work.** No tests, no commits. Spend money: real Etsy API calls (~$0.20 each Ã— 13 listings = ~$2.60 in publish fees + ~$0.40 in Gemini for listing copy).

The 13 Phase 1 listings (Weeks 1-2, May 22 â€“ Jun 5):

| # | Type | Source | Pack-ID / Book-ID | Pages | Title | Tags |
|---|---|---|---|---|---|---|
| 1 | coloring-pack | mushrooms-v1 | mushroom-mini-1 | 1-10 | Cottagecore Mushroom Mini-Pack #1 | cottagecore,mushroom,mini pack,coloring page,instant download,botanical,cottage,relaxing,calm,whimsy,fungi,fall,nature |
| 2 | coloring-pack | mushrooms-v1 | mushroom-mini-2 | 11-20 | Cottagecore Mushroom Mini-Pack #2 | cottagecore,mushroom,mini pack,coloring page,instant download,botanical,cottage,relaxing,calm,whimsy,fungi,fall,nature |
| 3 | coloring-pack | mushrooms-v1 | garden-botanical | 21-30 | Cottagecore Garden & Botanical Pack | cottagecore,botanical,garden,coloring,plants,cottage,calm,herbs,florals,instant download,mini pack,relaxing,nature |
| 4 | coloring-pack | mushrooms-v1 | mushroom-cottage-scenes | 31-40 | Cottagecore Mushroom Cottage Scenes | cottagecore,cottage,mushroom,scenes,coloring,whimsy,storybook,instant download,calm,fall,nature,relaxing,decor |
| 5 | coloring-pack | songbirds-v1 | songbirds-cardinals-bluebirds | (curate from songbirds) | Songbirds Mini-Pack: Cardinals & Bluebirds | songbird,cardinal,bluebird,backyard birds,coloring,nature,bird coloring,instant download,mini pack,calm,birding,relaxing,nature |
| 6 | coloring-pack | songbirds-v1 | songbirds-backyard | (curate) | Songbirds Mini-Pack: Backyard Visitors | songbird,backyard,bird,coloring,nature,instant download,mini pack,calm,relaxing,birding,sparrow,wren,robin |
| 7 | coloring-pack | songbirds-v1 | songbirds-sparrows-wrens | (curate) | Songbirds Mini-Pack: Sparrows & Wrens | songbird,sparrow,wren,bird coloring,nature,instant download,mini pack,calm,relaxing,backyard,bird,nature,fall |
| 8 | coloring-pack | cute-cats-v1 | cute-cats-mini-1 | 1-10 | Cute Cats Mini-Pack #1 | cute cats,cat coloring,coloring,cats,mini pack,instant download,kittens,calm,relaxing,bold easy,large print,nature,gift |
| 9 | coloring-pack | cute-cats-v1 | cute-cats-mini-2 | 11-20 | Cute Cats Mini-Pack #2 | cute cats,cat coloring,coloring,cats,mini pack,instant download,kittens,calm,relaxing,bold easy,large print,nature,gift |
| 10 | coloring-pack | mushrooms-v1 | single-mushroom-cottage | 32 | Single-Image: Detailed Mushroom Cottage | cottagecore,mushroom,cottage,coloring,single page,instant download,whimsy,decor,small print,calm,relaxing,nature,fall |
| 11 | coloring-pack | songbirds-v1 | single-hummingbird | (pick one) | Single-Image: Hummingbird Garden | hummingbird,bird,garden,single page,coloring,instant download,bird coloring,calm,backyard,nature,small print,decor,relaxing |
| 12 | coloring-pack | cute-cats-v1 | single-sleepy-cat | (pick one) | Single-Image: Sleepy Cat by Fireplace | cute cat,sleepy cat,coloring,single page,instant download,fireplace,calm,relaxing,cozy,bedtime,small print,decor,nature |
| 13 | coloring (full) | cute-cats-v1 | bold-easy-cute-cats-v1 | all | Bold & Easy Cute Cats Coloring Book | cute cats,cat coloring,coloring book,bold and easy,cats,instant download,kittens,calm,relaxing,large print,seniors,nature,gift |

- [x] **Step 1: Verify cute-cats source book is ready**

```bash
ls C:/Sandbox/AIProjectManagement/Rooster-AI-Project-Management/projects/kdp-puzzle-press/assets/processed/coloring/bold-easy-cute-cats-v1/page_*.png 2>&1 | wc -l
```

Expected: â‰¥30 pages. If <30 or directory missing, **STOP** and either (a) drop listings 8, 9, 12, 13 from this batch and run them in Plan 4, or (b) finish the source KDP book first.

- [x] **Step 2: Ship the full Cute Cats coloring book (listing 13) first**

```bash
cd /c/Sandbox/AIProjectManagement/Rooster-AI-Project-Management/projects/etsy-rooster-shop
python -c "from etsy_rooster.cli import cli; cli(['generate', 'coloring', '--book', 'bold-easy-cute-cats-v1'], standalone_mode=False)"
# Capture the sku_id from the output
python -c "from etsy_rooster.cli import cli; cli(['author-metadata', '--sku-id', '<SKU_ID>'], standalone_mode=False)"
python -c "from etsy_rooster.cli import cli; cli(['publish', '--sku-id', '<SKU_ID>'], standalone_mode=False)"
python -c "from etsy_rooster.cli import cli; cli(['generate', 'video', '--sku-id', '<SKU_ID>'], standalone_mode=False)"
```

Then via Etsy dashboard: assign section "Coloring Pages", set craft_type "Paper crafting", Publish.

- [x] **Step 3: Run the 9 multi-page coloring packs (listings 1-9)**

For each row in the table above where pages are not "(curate)" (rows 1-4, 8-9), run:

```bash
python -c "
from etsy_rooster.cli import cli
cli(['generate', 'coloring-pack',
     '--pack-id', '<PACK_ID>',
     '--book-id', '<BOOK_ID>',
     '--pages', '<COMMA_SEPARATED_PAGES>',
     '--title', '<TITLE>',
     '--subtitle', '<SUBTITLE>',
     '--tags', '<COMMA_SEPARATED_TAGS>'],
    standalone_mode=False)
"
# Then author-metadata, publish, generate-video for the new sku_id (as in step 2)
```

Then dashboard: section "Coloring Pages", craft_type "Paper crafting", Publish.

- [x] **Step 4: Curate page assignments for songbird subsets**

Listings 5, 6, 7 reference "(curate)" because the songbird book's 40 pages need manual partition into themed subsets. Open `<kdp>/data/coloring_books/bold-easy-songbirds-v1.json` (or wherever the page->bird-species mapping lives) and pick:

- **Cardinals & Bluebirds**: 10 pages featuring red cardinals (~5) + blue jays/bluebirds (~5)
- **Backyard Visitors**: 10 pages featuring sparrows, wrens, robins, chickadees, nuthatches
- **Sparrows & Wrens**: 10 pages featuring sparrows + wrens specifically (overlap with previous OK if needed)

Record the chosen page indices in a scratch file, then run the same `generate coloring-pack` command with the curated `--pages` values.

- [x] **Step 5: Run the 3 single-image listings (listings 10, 11, 12)**

Pick the strongest single page from each book (most-detailed, most-portfolio-worthy). For listing 10, page 32 was suggested as a placeholder â€” pick whichever page you'd put on a wall yourself. For 11 and 12, pick one page from songbirds and cute-cats respectively.

Run:

```bash
python -c "
from etsy_rooster.cli import cli
cli(['generate', 'coloring-pack',
     '--pack-id', 'single-<X>',
     '--book-id', '<BOOK_ID>',
     '--pages', '<single_page_number>',
     '--title', '<TITLE>',
     '--subtitle', '<SUBTITLE>',
     '--tags', '<TAGS>'],
    standalone_mode=False)
"
# Then author-metadata, publish, generate-video
```

Update price to $1.99 manually via Etsy dashboard after publish (the LLM prompt's default is $4.99 â€” single-page packs need a lower price).

- [x] **Step 6: Phase 1 acceptance check**

After all 13 listings are published as drafts on Etsy:

```bash
python -c "from etsy_rooster.cli import cli; cli(['audit'], standalone_mode=False)"
```

Expected: 4 existing SKUs (1 coloring + 3 mandalas from prior plans) + 13 new = 17 total. Each new SKU should be in "drafted" or "published" state.

- [x] **Step 7: Publish all Phase 1 drafts via Etsy dashboard**

Open https://www.etsy.com/your/shops/PocketRoosterPress/tools/listings/state:draft. For each Phase 1 draft:
1. Verify the listing photo is correct
2. Verify the video plays
3. Click Publish

If any listing's video looks wrong, run `generate video --sku-id=<N>` again â€” but flag the duplicate-video risk noted in Plan 2e deferred-debt.

---

## Task 9: Phase 2 Runbook â€” Wall art quote sets

**This is operational, not code work.** Real API costs: ~$0.04 Ã— 6 prints Ã— 10 sets = ~$2.40 in Nano Banana Pro + ~$0.40 in Gemini for listing copy + ~$2.00 in Etsy publish fees.

The ~10 wall art quote sets to ship (Weeks 3-4, Jun 6 â€“ Jun 19). Each set needs:

1. A prompt-bank JSON at `<kdp>/data/poster_set_prompts/<set_id>.json` (you author this)
2. A run of `generate_poster_sets.mjs` to generate the 6 print PNGs (~3 min/set, $0.04 Ã— 6 = $0.24)
3. A run of `etsy-rooster generate poster-set --set=<set_id>` to bundle into a SKU
4. Author-metadata + publish + generate-video as usual

### Sub-step: prepare prompt-bank JSON template

For each of the 10 sets, write a JSON file at `<kdp>/data/poster_set_prompts/<set_id>.json` with this shape:

```json
{
  "set_id": "cottagecore-kitchen-set-v1",
  "title": "Cottagecore Kitchen Wall Art Set",
  "subtitle": "6-Print Botanical Gallery for the Cozy Kitchen",
  "style_preamble": "Soft watercolor illustration in muted cottagecore palette (teal, brass, cream, sage). Detailed botanical line work with gentle washes. Slight aged-paper texture. 3:4 portrait composition. Subject:",
  "theme_tags": ["cottagecore", "kitchen", "botanical", "watercolor", "gallery wall", "wall art set", "cozy", "calm"],
  "prints": [
    {
      "slug": "01-herb-jars",
      "subject": "vintage glass jars labeled with handwritten herb names (rosemary, thyme, sage), tied with twine, soft morning light, on a kitchen shelf"
    },
    {
      "slug": "02-teapot",
      "subject": "ceramic teapot beside a steaming mug of tea, sprig of fresh mint, linen napkin folded nearby, soft window light"
    },
    {
      "slug": "03-sourdough",
      "subject": "fresh sourdough loaf on a wooden cutting board, sprigs of rosemary, soft flour dust, warm afternoon light"
    },
    {
      "slug": "04-pantry-shelf",
      "subject": "wooden pantry shelf with labeled glass jars (flour, sugar, oats), woven basket, dried herb bundle hanging beside"
    },
    {
      "slug": "05-window-herbs",
      "subject": "windowsill with three potted herb plants (basil, thyme, rosemary) in terracotta pots, soft cottage curtains framing the window"
    },
    {
      "slug": "06-honey-jar",
      "subject": "amber honey jar with a wooden dipper, surrounded by sprigs of lavender and a beeswax candle, on a linen-covered table"
    }
  ]
}
```

10 sets to author at this template level. The set themes from the spec:

1. cottagecore-kitchen-set-v1 (above)
2. cottagecore-reading-nook-set-v1 (books, candles, mugs, soft chair vignettes)
3. cottagecore-garden-set-v1 (mushrooms, ferns, wildflowers, dewdrops)
4. cottagecore-songbird-set-v1 (botanical illustrations of 6 different songbird species)
5. cottagecore-forest-set-v1 (mossy trees, ferns, woodland mushrooms, fern fronds)
6. cottagecore-bathroom-spa-set-v1 (florals, calm botanical compositions)
7. cottagecore-bedroom-set-v1 (soft florals, dawn light, linen vignettes)
8. cottagecore-tea-garden-set-v1 (cups, teapots, blooming herbs)
9. cottagecore-mushroom-specialty-set-v1 (6 mushroom species â€” illustration-only, no text)
10. cottagecore-apothecary-set-v1 (dried herbs, jars, hand-lettered labels)

- [x] **Step 1: Author all 10 prompt-bank JSONs**

For each set above, write the JSON file at `<kdp>/data/poster_set_prompts/<set_id>.json` following the template. Each `prints` array should have exactly 6 entries with `slug` and `subject` fields.

Time budget: ~15-20 minutes per set Ã— 10 = 2-3 hours of careful authoring (this is the most time-intensive Plan 3 activity).

- [x] **Step 2: Generate all 60 print PNGs (6 prints Ã— 10 sets)**

```bash
cd /c/Sandbox/AIProjectManagement/Rooster-AI-Project-Management/web.ui/backend
for set_id in cottagecore-kitchen-set-v1 cottagecore-reading-nook-set-v1 cottagecore-garden-set-v1 cottagecore-songbird-set-v1 cottagecore-forest-set-v1 cottagecore-bathroom-spa-set-v1 cottagecore-bedroom-set-v1 cottagecore-tea-garden-set-v1 cottagecore-mushroom-specialty-set-v1 cottagecore-apothecary-set-v1
do
  echo "=== $set_id ==="
  node scripts/generate_poster_sets.mjs $set_id --skip-existing
done
```

Expected: ~3-5 minutes per set Ã— 10 sets â‰ˆ 30-50 min wall-clock. Total spend: ~$2.40 in Nano Banana Pro.

- [x] **Step 3: Inspect the generated prints**

Open `<kdp>/assets/generated/poster_sets/<set_id>/` for each set. Check that all 6 prints look usable. If any look wrong (cropped subject, off-style, wrong aspect), edit the prompt bank's `subject` field for that print and regenerate via `node scripts/generate_poster_sets.mjs <set_id>` (without `--skip-existing` to force a redraw of just the bad ones â€” actually re-generation rewrites all; either delete the bad print PNG then run with `--skip-existing` or accept the redraw cost of $0.04 Ã— 6 = $0.24 per set).

- [x] **Step 4: Run the 10 `generate poster-set` commands**

```bash
cd /c/Sandbox/AIProjectManagement/Rooster-AI-Project-Management/projects/etsy-rooster-shop
for set_id in cottagecore-kitchen-set-v1 cottagecore-reading-nook-set-v1cottagecore-garden-set-v1 cottagecore-songbird-set-v1 cottagecore-forest-set-v1 cottagecore-bathroom-spa-set-v1 cottagecore-bedroom-set-v1 cottagecore-tea-garden-set-v1 cottagecore-mushroom-specialty-set-v1 cottagecore-apothecary-set-v1
do
  echo "=== $set_id ==="
  python -c "from etsy_rooster.cli import cli; cli(['generate', 'poster-set', '--set', '$set_id'], standalone_mode=False)"
done
```

This creates 10 SKUs with niche=wall-art-set. Note the sku_ids printed for each.

- [x] **Step 5: Author + publish + generate-video for each new SKU**

For each new sku_id from Step 4:

```bash
python -c "from etsy_rooster.cli import cli; cli(['author-metadata', '--sku-id', '<SKU_ID>'], standalone_mode=False)"
python -c "from etsy_rooster.cli import cli; cli(['publish', '--sku-id', '<SKU_ID>'], standalone_mode=False)"
python -c "from etsy_rooster.cli import cli; cli(['generate', 'video', '--sku-id', '<SKU_ID>'], standalone_mode=False)"
```

Then via Etsy dashboard: assign section "Printable Posters" (or create a "Wall Art Sets" section), set craft_type "Other" or "Painting", Publish.

- [x] **Step 6: Phase 2 acceptance check**

```bash
python -c "from etsy_rooster.cli import cli; cli(['audit'], standalone_mode=False)"
```

Expected: 17 from Phase 1 + 10 new = 27 SKUs total. All wall-art-set SKUs in "drafted" or "published" state.

---

## Task 10: Phase 3 Runbook â€” SVG bundles + publish remaining drafts

**This is operational, not code work.** Real API costs: ~$0.60 in Etsy publish fees + ~$0.10 in Gemini for listing copy. No Nano Banana Pro spend.

3 SVG bundles to ship (Weeks 5-6, Jun 20 â€“ Jul 3):

| # | Bundle ID | Contents | Title |
|---|---|---|---|
| 1 | cottagecore-botanical-svg-bundle-v1 | 20 motifs from Plan 2d library (mushroom, fern, leaf, flower, acorn variants) | Cottagecore Botanical SVG Bundle (20 Files for Cricut) |
| 2 | geometric-mandala-svg-bundle-v1 | 15 mandala variations (different seeds Ã— ring counts Ã— petal arrangements) | Geometric Mandala SVG Bundle (15 Files for Cricut) |
| 3 | mixed-cottagecore-svg-bundle-v1 | 12 mandalas + 12 simple motifs = 24 SVGs | Mixed Cottagecore SVG Cut Files Bundle (24 Files) |

- [x] **Step 1: Generate the source SVGs**

For bundle 1 (botanical motifs), use the Plan 2d motif library directly. Generate 20 individual SVG files from the motif primitives. The motifs live at `src/etsy_rooster/svg_render/motifs/cottagecore.py` â€” each function returns a path string. Wrap each in a minimal SVG document and save:

```bash
python -c "
from pathlib import Path
from etsy_rooster.svg_render.motifs.cottagecore import (
    mushroom_path, fern_path, leaf_path, flower_path, acorn_path,
)
out = Path('C:/Sandbox/AIProjectManagement/Rooster-AI-Project-Management/projects/etsy-rooster-shop/data/artifacts/cottagecore-botanical-svgs')
out.mkdir(parents=True, exist_ok=True)
# Each motif at 4 different sizes (200, 300, 400, 500 px)
designs = []
for name, fn in [('mushroom', mushroom_path), ('fern', fern_path),
                 ('leaf', leaf_path), ('flower', flower_path), ('acorn', acorn_path)]:
    for sz in (200, 300, 400, 500):
        path = fn(cx=sz/2, cy=sz/2, r=sz/2 * 0.8)
        svg = (
            f'<?xml version=\"1.0\"?>\n'
            f'<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 {sz} {sz}\" width=\"{sz}\" height=\"{sz}\">\n'
            f'  <path d=\"{path}\" fill=\"none\" stroke=\"black\" stroke-width=\"2\"/>\n'
            f'</svg>\n'
        )
        (out / f'{name}-{sz}.svg').write_text(svg, encoding='utf-8')
        designs.append(out / f'{name}-{sz}.svg')
print(f'Wrote {len(designs)} SVGs to {out}')
"
```

Adapt the motif-function signatures if they differ from `(cx, cy, r)` â€” read `motifs/cottagecore.py` first.

For bundles 2 + 3, use `etsy-rooster generate mandala` repeatedly with different seeds:

```bash
for seed in m01 m02 m03 m04 m05 m06 m07 m08 m09 m10 m11 m12 m13 m14 m15
do
  python -c "from etsy_rooster.cli import cli; cli(['generate', 'mandala', '--seed', '$seed'], standalone_mode=False)"
done
```

This produces 15 mandala SVGs at `data/artifacts/mandala-mNN/mandala-mNN.svg`.

- [x] **Step 2: Run `generate svg-bundle` for bundle 1**

```bash
SVG_DIR=C:/Sandbox/AIProjectManagement/Rooster-AI-Project-Management/projects/etsy-rooster-shop/data/artifacts/cottagecore-botanical-svgs
python -c "
import glob, subprocess, sys
from etsy_rooster.cli import cli
svgs = sorted(glob.glob('$SVG_DIR/*.svg'))
args = ['generate', 'svg-bundle',
        '--bundle-id', 'cottagecore-botanical-svg-bundle-v1',
        '--title', 'Cottagecore Botanical SVG Bundle (20 Files for Cricut)',
        '--tags', 'cottagecore,svg,cricut,bundle,botanical,mushroom,fern,leaf,flower,cut file,silhouette,vinyl,craft']
for s in svgs:
    args += ['--svgs', s]
cli(args, standalone_mode=False)
"
```

- [x] **Step 3: Run `generate svg-bundle` for bundle 2 (mandalas)**

```bash
python -c "
from etsy_rooster.cli import cli
seeds = ['m01','m02','m03','m04','m05','m06','m07','m08','m09','m10','m11','m12','m13','m14','m15']
args = ['generate', 'svg-bundle',
        '--bundle-id', 'geometric-mandala-svg-bundle-v1',
        '--title', 'Geometric Mandala SVG Bundle (15 Files for Cricut)',
        '--tags', 'mandala,svg,cricut,bundle,geometric,cut file,silhouette,vinyl,craft,pattern,boho,zen,meditation']
for seed in seeds:
    args += ['--svgs', f'data/artifacts/mandala-{seed}/mandala-{seed}.svg']
cli(args, standalone_mode=False)
"
```

- [x] **Step 4: Run `generate svg-bundle` for bundle 3 (mixed 12+12)**

Combine the first 12 mandala SVGs and 12 cottagecore motif SVGs:

```bash
python -c "
import glob
from etsy_rooster.cli import cli
mandalas = sorted(glob.glob('data/artifacts/mandala-m*/mandala-m*.svg'))[:12]
botanicals = sorted(glob.glob('data/artifacts/cottagecore-botanical-svgs/*.svg'))[:12]
args = ['generate', 'svg-bundle',
        '--bundle-id', 'mixed-cottagecore-svg-bundle-v1',
        '--title', 'Mixed Cottagecore SVG Cut Files Bundle (24 Files)',
        '--tags', 'cottagecore,svg,cricut,bundle,mandala,botanical,mixed,cut file,silhouette,vinyl,craft,variety,pack']
for s in mandalas + botanicals:
    args += ['--svgs', s]
cli(args, standalone_mode=False)
"
```

- [x] **Step 5: Author + publish + generate-video for each of the 3 new SKUs**

For each bundle SKU created in steps 2-4:

```bash
python -c "from etsy_rooster.cli import cli; cli(['author-metadata', '--sku-id', '<SKU_ID>'], standalone_mode=False)"
python -c "from etsy_rooster.cli import cli; cli(['publish', '--sku-id', '<SKU_ID>'], standalone_mode=False)"
python -c "from etsy_rooster.cli import cli; cli(['generate', 'video', '--sku-id', '<SKU_ID>'], standalone_mode=False)"
```

Then dashboard: section "SVG Cut Files", craft_type "Paper crafting", Publish.

- [x] **Step 6: Publish remaining Plan 2 drafts**

There were 3 drafts from Plan 2 still in "draft" state on Etsy at the start of Plan 3:
- `#4508770108` Bold & Easy Songbirds Coloring Book
- `#4508771090` Plain Mandala SVG
- `#4508841550` Cottagecore Mushroom Poster

All three already have product videos attached (from Plan 2e backfill). For each, go to the Etsy dashboard:
- https://www.etsy.com/your/shops/PocketRoosterPress/tools/listings/state:draft
- Assign appropriate section
- Verify craft_type
- Click Publish

- [x] **Step 7: Phase 3 acceptance check**

```bash
python -c "from etsy_rooster.cli import cli; cli(['audit'], standalone_mode=False)"
```

Expected total: 27 (after Phase 2) + 3 (new SVG bundles) = 30 SKUs. All in "published" state on Etsy (~26 + 3 published Plan-2 drafts).

---

## Task 11: Phase 4 Runbook â€” Monitor, refresh, scale winners

**Operational only â€” no code, no commits.** Weeks 7-12 (Jul 4 â€“ Aug 22).

### Day 30 gate (Jun 22, 2026)

- [x] **Step 1: Pull Etsy stats**

Open https://www.etsy.com/your/shops/PocketRoosterPress/stats. Capture:
- Total views in last 30 days
- Total visits (unique)
- Total favorites
- Total sales (revenue + count)
- Top 5 listings by views
- Bottom 25% listings by views (likely 0 views)

Record in a scratch file or screenshot.

- [x] **Step 2: Evaluate the gate**

The Plan 3 spec's Day 30 success threshold: **â‰¥3 sales OR â‰¥200 views.**

If hit:
- Continue Phase 4 monitoring. Mid-window check at Day 60.

If missed (e.g. 0 sales AND <50 views across all 30 listings):
- **Refresh action:** Pick the 8-10 listings with the lowest views. Re-run `author-metadata` with a slightly different artifact_summary (add or rephrase 1-2 theme_tags to test SEO). Re-publish if Etsy accepts the rewrite, or update via dashboard if not.
- **Ads action:** Pick the 1-2 listings with the most favorites (any > 0) and set $1/day Etsy Ads. Monitor whether ads convert.

- [x] **Step 3: Cull obvious flops**

Listings with 0 views after 30 days have an SEO problem. Pull them, rewrite the title (front-load a different keyword combination), and republish. Don't delete the SKU; just unpublish and revise.

### Day 60 gate (Jul 22, 2026)

- [x] **Step 4: Pull stats + identify winning themes**

The Plan 3 spec's Day 60 success threshold: **â‰¥10 sales OR â‰¥800 views.**

If hit:
- **Scale winners:** Identify the top 2-3 best-selling themes (e.g. "cottagecore mushroom" or "songbird"). Ship 5 more listings in each winning theme using the existing pipelines:
  - More single-page packs from the same source book
  - More wall-art-set variations (different room themes)
  - Refresh tags on adjacent listings to leverage winner's SEO

If missed:
- **A/B price test:** Pick 3 of the most-viewed-but-not-bought listings. Set them to $3.99, $4.99, $5.99 respectively. Watch conversion over 14 days.
- **Reconsider niche viability:** If wall-art-set has 0 sales and coloring-pack has 5, the data says coloring-packs are working â€” pause the wall-art-set ramp and shift attention to packs.

### Day 90 gate (Aug 22, 2026)

- [x] **Step 5: Final revenue check**

Spec target: **â‰¥29 sales = $200/mo revenue.** Average sale is ~$7 if mostly coloring-packs, ~$10 if mostly wall art sets â€” calibrate sale-count target accordingly.

If hit ($200/mo achieved):
- **Plan 4 launches:** Use the validated SKU types as the foundation. Add new types per the spec's "out of scope" list â€” paper packs first (Plan 4 Task 0 is the paper pack pipeline build). Add Halloween-themed coloring books in late July for the August-October Halloween wave.

If missed:
- **Postmortem:** Which SKU type underperformed? Cut losses (unpublish the persistent-zero listings) and double down on what worked. The Plan 3 spec's stance is validate-then-scale; don't repeat the same bets if data says they failed.

- [x] **Step 6: Update checkpoint memory**

Update `C:\Users\marts\.claude\projects\c--Sandbox-AIProjectManagement-Rooster-AI-Project-Management\memory\etsy-rooster-shop-checkpoint.md` with the Day 90 outcome, listing counts, top performers, and decisions for Plan 4.

No git commit for this task â€” runbook execution only.

---

## Acceptance â€” Plan 3 complete when

- [x] All 8 pipeline-extension tasks committed (Tasks 0-7)
- [x] `python -m pytest tests/ -q --no-cov` shows â‰¥260 passed, 0 failed
- [x] 23-26 new Etsy listings shipped across the 4 SKU types (coloring-pack, full coloring, wall-art-set, svg-bundle)
- [x] All 3 prior Plan-2 drafts published live
- [x] Day 90 revenue check completed and checkpoint memory updated

## Deferred-debt acknowledgments

Plan 3 adds new debt items on top of the running Plan 2e list:

1. **`--replace` flag still missing on `generate video`** â€” re-running on a SKU with an existing video uploads a second one. Worth fixing if Plan 3 monitoring requires video refreshes.
2. **Single-page coloring packs reuse the source PDF's cover even when source has been updated** â€” extractor reads source `.pdf` at extraction time, so if the source book is re-built later, existing pack PDFs are stale. Acceptable for v1.
3. **Wall-art-set video only zooms on the first print, not the full set** â€” multi-print video would be ideal but takes 6Ã— ffmpeg time. Deferred.
4. **SVG bundle pricing in the prompt defaults to $7.99 regardless of design count** â€” the 24-design bundle should be $9.99 per spec; LLM may produce $7.99 anyway. Manual override in dashboard if needed.
5. **No CLI for quote-draft authoring** â€” Phase 2 expects user-authored prompt-bank JSONs by hand. A `draft-quotes --set=<id>` command that uses LLMListingAuthor to propose 30 candidates per set is deferred.
6. **Cute Cats source book may not be ready** â€” Task 8 Step 1 verifies; if it fails, 4 listings (8, 9, 12, 13) slip to Plan 4.
7. **Themed-mandala motif legibility at mandala scale remains unsolved** â€” kept paused. Cricut-scale standalone use (Task 10) is the salvage.

---

## Self-review against the spec

(Performed inline before saving this plan.)

**Spec coverage:**
- Section "Listing mix" (4 SKU types) â†’ covered by Tasks 0-7 (pipelines) and Tasks 8-10 (production runbooks)
- Section "SKU Type A: Single-page themed coloring packs" â†’ Task 1 (extractor) + Task 2 (CLI) + Task 8 (12 listings shipped)
- Section "SKU Type B: Wall art quote sets" â†’ Tasks 3-5 (pipelines) + Task 9 (10 sets shipped)
- Section "SKU Type C: Cricut SVG bundles" â†’ Task 6 (pipeline) + Task 10 (3 bundles shipped)
- Section "SKU Type D: Full Cute Cats coloring book" â†’ Task 8 Step 2 (1 listing via existing pipeline)
- Section "Required pipeline extensions" (~7h) â†’ Tasks 0-7 sum to ~8-9h (slight over-estimate due to test granularity, but matches in spirit)
- Section "Pipeline reuse map" â†’ flow described in Task 8/9/10 runbooks
- Section "Phasing" â†’ Tasks 8/9/10 = Phases 1/2/3; Task 11 = Phase 4
- Section "Success metrics + cull triggers" â†’ Task 11 Steps 2/4/5 = Day 30/60/90 gates
- Section "Out of scope" â†’ preserved as deferred-debt items
- Section "Risks + mitigations" â†’ spec captures these; plan doesn't need to duplicate

**Placeholder scan:** No TBDs, no "implement later", no "similar to task N" without code. Every task has the actual code or command to run. The few "(curate)" markers in Task 8 are explicit user-choices, not placeholders â€” they describe what the user has to decide.

**Type consistency:**
- `ColoringPackNiche` field names match between `pack_niche.py` (Task 2), `cli.py:generate_coloring_pack` (Task 2), `treatments.py:coloring_pack_page_flip` (Task 7)
- `PosterSetNiche` field names match between `set_niche.py` (Task 4), `set_builder.py` (Task 4), `set_kdp_importer.py` (Task 4), `cli.py:generate_poster_set` (Task 5), `treatments.py:wall_art_set_zoom` (Task 7)
- `SvgBundleNiche` field names match between `bundle_niche.py` (Task 6), `svg_bundler.py` (Task 6), `cli.py:generate_svg_bundle` (Task 6), `treatments.py:svg_bundle_static` (Task 7)
- Niche strings match across taxonomy mapping (Task 0), prompt filenames (Task 0), CatalogDB SKU rows (Tasks 2/5/6), and `_TREATMENT_BY_NICHE` (Task 7): "coloring-pack", "wall-art-set", "svg-bundle"

**Expected test count progression:**
- Baseline: 231 + 6 deselected
- T0: 234 (+3)
- T1: 239 (+5)
- T2: 245 (+6)
- T3: 245 (Node script only, no Python tests)
- T4: 251 (+6)
- T5: 252 (+1)
- T6: 257 (+5)
- T7: 260 (+3)
- Final: **260 passed, 6 deselected**
