# Bold & Easy Hummingbirds — Book Asset Build — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce the validated Bold & Easy Hummingbirds Vol. 1 book asset — a 40-design prompt bank, book module, KDP metadata, and the built interior + cover PDFs plus 40 processed 1-bit page PNGs — ready for both the Etsy launch and the KDP submission (each a follow-on plan).

**Architecture:** Reuse the existing `pocket_rooster_press` coloring pipeline verbatim. A prompt-bank JSON drives out-of-band Gemini art generation; a book module (copied from Songbirds) composes the processed PNGs into interior + cover PDFs; KDP metadata mirrors Songbirds. No new pipeline code — only new content, one registry line, and validation tests.

**Tech Stack:** Python 3.14 + `pocket_rooster_press` (reportlab, pypdf, Pillow), pytest; Node `generate_coloring_interiors.mjs` (Gemini Nano Banana Pro) for art; all in `projects/kdp-puzzle-press/`.

## Global Constraints

- **book_id:** `bold-easy-hummingbirds-v1` (kebab). Module name: `bold_easy_hummingbirds_v1` (snake).
- **Design count:** exactly **40**. Trim **8.5×11** (`TEMPLATE_85X11_LARGEPRINT`). Single-sided. `kind="coloring"`.
- **Palette:** `PALETTE_BIRDWATCHER`.
- **Style:** bold-and-easy LARGE-PRINT — thick 6–8px outer outlines, minimal 2–3px interior lines, large open fill regions. One hummingbird per page (sole exception: design 40, two birds). Real species + one nectar flower. No text/shading/greyscale in art.
- **THEME_TAGS:** ≤13 tags, each ≤20 chars, lowercase, no commas (consumed verbatim by the Etsy importer).
- **KDP keywords:** exactly 7, each ≤50 chars, no banned terms (`best seller`, `free`, `kindle`, `new`, `on sale`, `sale`), no competitor names.
- **AI disclosure:** interior images + cover are AI-generated (Gemini); `ai_disclosure.images = "AI-Generated"`.
- **Reuse:** designs 1 (Ruby-throated at honeysuckle) and 2 (Anna's at feeder) reuse the already-generated Songbirds art (Songbirds `page_11.png` / `page_12.png`).
- **Working directory:** all Python commands run from `projects/kdp-puzzle-press/`; the art generator runs from `web.ui/backend/`.
- **Commit style:** conventional commits; end messages with the Co-Authored-By trailer used in this repo.

---

## File Structure

- Create `projects/kdp-puzzle-press/data/coloring_prompts/bold-easy-hummingbirds-v1.json` — prompt bank (style preamble + 40 subjects).
- Create `projects/kdp-puzzle-press/src/pocket_rooster_press/books/bold_easy_hummingbirds_v1.py` — book module (constants + `build()`).
- Modify `projects/kdp-puzzle-press/src/pocket_rooster_press/cli.py` — add one `BOOK_MODULES` entry.
- Create `projects/kdp-puzzle-press/metadata/bold_easy_hummingbirds_v1.json` — KDP metadata.
- Create `projects/kdp-puzzle-press/metadata/bold_easy_hummingbirds_v1_listing.md` — KDP listing copy.
- Create `projects/kdp-puzzle-press/tests/test_book_bold_easy_hummingbirds_v1.py` — validation tests (prompt bank, module constants, registry, metadata).
- Generated out-of-band: `assets/generated/coloring/bold-easy-hummingbirds-v1/page_01..40.png`.
- Processed: `assets/processed/coloring/bold-easy-hummingbirds-v1/page_01..40.png`.
- Output: `output/bold-easy-hummingbirds-v1/interior.pdf` + `cover.pdf`.

---

### Task 1: Prompt bank JSON + structural validation

**Files:**
- Create: `projects/kdp-puzzle-press/data/coloring_prompts/bold-easy-hummingbirds-v1.json`
- Test: `projects/kdp-puzzle-press/tests/test_book_bold_easy_hummingbirds_v1.py`

**Interfaces:**
- Produces: a prompt bank consumed by `web.ui/backend/scripts/generate_coloring_interiors.mjs bold-easy-hummingbirds-v1`. Shape matches `data/coloring_prompts/bold-easy-songbirds-v1.json`: top-level `book_id`, `title`, `design_count`, `style_preamble`, `subject_prefix`, `prompts[]` where each item is `{idx, section, subject}`.

- [ ] **Step 1: Write the failing test**

Create `projects/kdp-puzzle-press/tests/test_book_bold_easy_hummingbirds_v1.py`:

```python
from __future__ import annotations

import json
from pathlib import Path

KDP_ROOT = Path(__file__).resolve().parent.parent
BOOK_ID = "bold-easy-hummingbirds-v1"
PROMPT_BANK = KDP_ROOT / "data" / "coloring_prompts" / f"{BOOK_ID}.json"


def test_prompt_bank_has_40_contiguous_prompts_in_four_sections():
    data = json.loads(PROMPT_BANK.read_text(encoding="utf-8"))
    assert data["book_id"] == BOOK_ID
    assert data["design_count"] == 40
    assert isinstance(data["style_preamble"], str) and len(data["style_preamble"]) > 200
    prompts = data["prompts"]
    assert len(prompts) == 40
    assert [p["idx"] for p in prompts] == list(range(1, 41))
    for p in prompts:
        assert p["subject"].strip(), f"empty subject at idx {p['idx']}"
        assert p["section"].strip()
    assert len({p["section"] for p in prompts}) == 4
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd projects/kdp-puzzle-press && python -m pytest tests/test_book_bold_easy_hummingbirds_v1.py::test_prompt_bank_has_40_contiguous_prompts_in_four_sections -v`
Expected: FAIL — `FileNotFoundError` (prompt bank not created yet).

- [ ] **Step 3: Create the prompt bank JSON**

Create `projects/kdp-puzzle-press/data/coloring_prompts/bold-easy-hummingbirds-v1.json`:

```json
{
  "book_id": "bold-easy-hummingbirds-v1",
  "title": "Bold & Easy Hummingbirds — Volume 1",
  "design_count": 40,
  "style_preamble": "Coloring book line art page for adults in a bold-and-easy LARGE-PRINT style — thick uniform black outer outlines (approximately 6 to 8 pixels wide at 4K resolution) around the hummingbird and its flower, with only the essential interior lines (one wing-feather-group division, the eye, the beak, the gorget as a single clean closed area, tail-feather divisions, and the flower's petal separations) drawn thinner (approximately 2 to 3 pixels). Keep internal detail minimal and fill regions large and open so the page is easy for seniors and beginners to color. Pure white background. Each illustration must read as a recognizable real-world hummingbird species with believable proportions and posture — never a stylized cartoon. Compose the hummingbird as the dominant subject filling 60 to 75 percent of the frame, paired with one clear nectar flower or a single simple setting element (a feeder, a perch, a water droplet). Generous open white space inside every closed shape. All outlines fully closed; no broken lines. Consistent line weight within each tier (thick outer, thinner inner). Portrait vertical orientation with a comfortable white margin around the subject. Absolutely no shading, no gradients, no fill colors, no hatching, no cross-hatching, no stippling, no greyscale, no shadows, no broken lines, no decorative borders. No text, no letters, no numbers, no captions, no signature, no watermark, no logo, no page number. No human figures, no human faces, no human hands. Black ink line art on pure white only. ",
  "subject_prefix": "Subject: ",
  "prompts": [
    { "idx": 1,  "section": "Backyard Visitors", "subject": "one Ruby-throated Hummingbird hovering at a single trumpet-shaped honeysuckle flower, wings spread in clean motion lines, long needle beak, four small leaves on the vine, gorget as one clean closed shape" },
    { "idx": 2,  "section": "Backyard Visitors", "subject": "one Anna's Hummingbird perched on the rim of a small glass nectar feeder, body upright, tail pointed down, rounded head, one nectar drop at the feeder spout" },
    { "idx": 3,  "section": "Backyard Visitors", "subject": "one Rufous Hummingbird hovering at a red bee balm (bergamot) bloom, wings mid-beat in motion lines, tail fanned, spiky bee-balm petals as clean open shapes" },
    { "idx": 4,  "section": "Backyard Visitors", "subject": "one Black-chinned Hummingbird perched on a thin garden stake beside a tall salvia flower spike with three open tubular florets" },
    { "idx": 5,  "section": "Backyard Visitors", "subject": "one Allen's Hummingbird hovering at a single orange monkeyflower, body angled forward, needle beak entering the bloom" },
    { "idx": 6,  "section": "Backyard Visitors", "subject": "one Costa's Hummingbird perched on a chuparosa branch with two tubular desert-honeysuckle blooms beside it, rounded head, gorget as a clean closed shape" },
    { "idx": 7,  "section": "Backyard Visitors", "subject": "one Broad-tailed Hummingbird hovering just beneath a nodding blue columbine, the flower's five spurred petals drawn as clean closed shapes" },
    { "idx": 8,  "section": "Backyard Visitors", "subject": "one very small Calliope Hummingbird perched on a slender twig next to a penstemon stalk bearing two bell-shaped flowers" },
    { "idx": 9,  "section": "Backyard Visitors", "subject": "one Ruby-throated Hummingbird perched on the arm of a shepherd's-hook pole with a classic bottle nectar feeder hanging below, simple and uncluttered" },
    { "idx": 10, "section": "Backyard Visitors", "subject": "one Anna's Hummingbird dipping to bathe at a broad leaf cupping a single large water droplet, a fuchsia branch arching above with one pendant bloom" },

    { "idx": 11, "section": "Hummingbirds & Their Flowers", "subject": "one Ruby-throated Hummingbird hovering at a trumpet vine (Campsis) cluster of three large trumpet blooms, wings in clean motion lines" },
    { "idx": 12, "section": "Hummingbirds & Their Flowers", "subject": "one Broad-tailed Hummingbird at a scarlet penstemon spike with several tubular flowers climbing the stem" },
    { "idx": 13, "section": "Hummingbirds & Their Flowers", "subject": "one Anna's Hummingbird at a red pineapple-sage salvia spike, needle beak to the nearest floret" },
    { "idx": 14, "section": "Hummingbirds & Their Flowers", "subject": "one Rufous Hummingbird hovering just below a nodding orange columbine, spurred petals as clean shapes" },
    { "idx": 15, "section": "Hummingbirds & Their Flowers", "subject": "one Black-chinned Hummingbird at a desert willow blossom on a slender arching branch" },
    { "idx": 16, "section": "Hummingbirds & Their Flowers", "subject": "one Costa's Hummingbird at a tall ocotillo flower spike tipped with a cluster of tubular blooms" },
    { "idx": 17, "section": "Hummingbirds & Their Flowers", "subject": "one Calliope Hummingbird at an Indian paintbrush cluster, the bracts as clean open shapes" },
    { "idx": 18, "section": "Hummingbirds & Their Flowers", "subject": "one Allen's Hummingbird at a California fuchsia (zauschneria) with several pendant tubular flowers" },
    { "idx": 19, "section": "Hummingbirds & Their Flowers", "subject": "one Ruby-throated Hummingbird at a cardinal flower (Lobelia) spike of lipped tubular blooms" },
    { "idx": 20, "section": "Hummingbirds & Their Flowers", "subject": "one Broad-billed Hummingbird hovering at an agave flower stalk, tubular florets in a clean radial cluster" },

    { "idx": 21, "section": "In the Garden", "subject": "one Ruby-throated Hummingbird at a hanging fuchsia basket, two large pendant fuchsia blooms in the foreground" },
    { "idx": 22, "section": "In the Garden", "subject": "one Anna's Hummingbird at airy coral bells (heuchera) flower sprays on thin wands" },
    { "idx": 23, "section": "In the Garden", "subject": "one Rufous Hummingbird at a morning glory trumpet opening on a twining vine with one heart-shaped leaf" },
    { "idx": 24, "section": "In the Garden", "subject": "one Black-chinned Hummingbird at a single large hibiscus bloom, the prominent stamen column drawn as clean lines" },
    { "idx": 25, "section": "In the Garden", "subject": "one Ruby-throated Hummingbird at petunia blossoms spilling over the rim of a garden pot" },
    { "idx": 26, "section": "In the Garden", "subject": "one Anna's Hummingbird at a foxglove spike, several bell flowers stacked up the stem" },
    { "idx": 27, "section": "In the Garden", "subject": "one Rufous Hummingbird at a lantana flower cluster of small rounded florets" },
    { "idx": 28, "section": "In the Garden", "subject": "one Black-chinned Hummingbird at a red hot poker (kniphofia) torch bloom, tubular florets stacked on the spike" },
    { "idx": 29, "section": "In the Garden", "subject": "one Ruby-throated Hummingbird at a zinnia with a broad flat flower face and simple radial petals" },
    { "idx": 30, "section": "In the Garden", "subject": "one Anna's Hummingbird at nasturtium blooms trailing over a low garden wall, one round nasturtium leaf beside them" },

    { "idx": 31, "section": "Showstoppers", "subject": "one Broad-billed Hummingbird perched in profile showing its striking straight bill, beside a single salvia floret" },
    { "idx": 32, "section": "Showstoppers", "subject": "one Rivoli's (Magnificent) Hummingbird hovering at a tall penstemon spike, large body, clean wing-feather divisions" },
    { "idx": 33, "section": "Showstoppers", "subject": "one Blue-throated Mountaingem perched on a mossy branch, long squared tail with clean feather divisions, gorget as a closed shape" },
    { "idx": 34, "section": "Showstoppers", "subject": "one Buff-bellied Hummingbird at a Turk's cap bloom, the flower's furled red petals as clean closed shapes" },
    { "idx": 35, "section": "Showstoppers", "subject": "one Violet-crowned Hummingbird at an agave flower stalk, clean crown shape, tubular florets" },
    { "idx": 36, "section": "Showstoppers", "subject": "one Sword-billed Hummingbird hovering at a long pendant passionflower, dramatically long straight bill matching the flower's tube, wings in motion lines" },
    { "idx": 37, "section": "Showstoppers", "subject": "one Booted Racket-tail hovering at a fuchsia, dramatic racket-tipped tail streamers and puffy leg 'boots' as clean closed shapes" },
    { "idx": 38, "section": "Showstoppers", "subject": "one Marvelous Spatuletail at a mountain wildflower, two dramatic spatula-tipped tail feathers crossing behind, drawn as clean shapes" },
    { "idx": 39, "section": "Showstoppers", "subject": "one Fiery-throated Hummingbird at a tropical heliconia bract, gorget and crown as clean closed shapes, bold outline" },
    { "idx": 40, "section": "Showstoppers", "subject": "two hummingbirds meeting at a single large trumpet flower, both bodies clearly separated with open white space between them, wings in motion lines, a two-bird finale" }
  ]
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd projects/kdp-puzzle-press && python -m pytest tests/test_book_bold_easy_hummingbirds_v1.py::test_prompt_bank_has_40_contiguous_prompts_in_four_sections -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add projects/kdp-puzzle-press/data/coloring_prompts/bold-easy-hummingbirds-v1.json projects/kdp-puzzle-press/tests/test_book_bold_easy_hummingbirds_v1.py
git commit -m "feat(hummingbirds): 40-design prompt bank + validation test"
```

---

### Task 2: Book module

**Files:**
- Create: `projects/kdp-puzzle-press/src/pocket_rooster_press/books/bold_easy_hummingbirds_v1.py`
- Test: `projects/kdp-puzzle-press/tests/test_book_bold_easy_hummingbirds_v1.py` (append)

**Interfaces:**
- Consumes: `pocket_rooster_press.config` (`BOOK_KIND_COLORING`, `OUTPUT_DIR`, `PALETTE_BIRDWATCHER`), `covers.cover_builder` (`CoverBuilder`, `hero_image_for`), `layout.book_assembler` (`BookAssembler`, `BookConfig`), `layout.templates.TEMPLATE_85X11_LARGEPRINT`.
- Produces: module-level constants `BOOK_ID`, `TITLE`, `SUBTITLE`, `INTRO`, `DESIGN_COUNT` (=40), `THEME_TAGS`, and `build(output_dir) -> tuple[Path, Path]`. The Etsy importer reads `TITLE`, `SUBTITLE`, `INTRO`, `DESIGN_COUNT`, `THEME_TAGS` via AST (literals only — keep them literal).

- [ ] **Step 1: Write the failing test** (append to the test file)

```python
import ast


MODULE_PATH = (
    KDP_ROOT / "src" / "pocket_rooster_press" / "books" / "bold_easy_hummingbirds_v1.py"
)


def _module_constants() -> dict:
    tree = ast.parse(MODULE_PATH.read_text(encoding="utf-8"))
    out = {}
    for node in tree.body:
        if isinstance(node, ast.Assign):
            for t in node.targets:
                if isinstance(t, ast.Name):
                    try:
                        out[t.id] = ast.literal_eval(node.value)
                    except (ValueError, SyntaxError):
                        pass
        elif isinstance(node, ast.AnnAssign) and isinstance(node.target, ast.Name) and node.value is not None:
            try:
                out[node.target.id] = ast.literal_eval(node.value)
            except (ValueError, SyntaxError):
                pass
    return out


def test_book_module_constants_are_importer_ready():
    c = _module_constants()
    assert c["BOOK_ID"] == BOOK_ID
    assert c["DESIGN_COUNT"] == 40
    assert "Hummingbird" in c["TITLE"]
    assert "Volume 1" in c["SUBTITLE"]
    for required in ("TITLE", "SUBTITLE", "INTRO", "DESIGN_COUNT", "THEME_TAGS"):
        assert required in c, f"missing {required}"
    tags = c["THEME_TAGS"]
    assert len(tags) <= 13
    for t in tags:
        assert t == t.lower() and "," not in t and len(t) <= 20, f"bad tag {t!r}"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd projects/kdp-puzzle-press && python -m pytest tests/test_book_bold_easy_hummingbirds_v1.py::test_book_module_constants_are_importer_ready -v`
Expected: FAIL — `FileNotFoundError` (module not created).

- [ ] **Step 3: Create the book module**

Create `projects/kdp-puzzle-press/src/pocket_rooster_press/books/bold_easy_hummingbirds_v1.py`:

```python
"""Bold & Easy Hummingbirds — Volume 1.

Third coloring book under the Pocket Rooster Press imprint. Same two-stage
Gemini pipeline as Songbirds V1; tighter niche (hummingbirds only), tuned to
a LARGE-PRINT senior/gift angle: each real species paired with a nectar flower
it visits.

    1. Generate the 40 interior PNGs out-of-band:
        cd web.ui/backend
        node scripts/generate_coloring_interiors.mjs bold-easy-hummingbirds-v1
       -> assets/generated/coloring/bold-easy-hummingbirds-v1/page_01..40.png
    2. Threshold to 1-bit B&W:
        python scripts/process_coloring_pages.py bold-easy-hummingbirds-v1
    3. build() composes the processed PNGs into interior + cover PDFs.

Designs 1 and 2 reuse the Songbirds hummingbird art (Songbirds page_11/page_12);
copy those PNGs in as this book's page_01/page_02 before processing.

KDP AI disclosure: interior art + cover are AI-generated (Gemini). Private flag.
"""

from __future__ import annotations

from pathlib import Path

from pypdf import PdfReader

from pocket_rooster_press.config import (
    BOOK_KIND_COLORING,
    OUTPUT_DIR,
    PALETTE_BIRDWATCHER,
)
from pocket_rooster_press.covers.cover_builder import CoverBuilder, hero_image_for
from pocket_rooster_press.layout.book_assembler import BookAssembler, BookConfig
from pocket_rooster_press.layout.templates import TEMPLATE_85X11_LARGEPRINT

BOOK_ID = "bold-easy-hummingbirds-v1"
TITLE = "Bold & Easy Hummingbirds"
SUBTITLE = (
    "40 Large-Print Coloring Designs of Hummingbirds & the Flowers They Love "
    "— Real Species for Adults, Seniors & Bird Lovers (Volume 1)"
)
INTRO = (
    "Welcome to a quieter kind of coloring book. The 40 designs ahead are "
    "drawn in a bold, large-print style — thick outer outlines you can color "
    "with markers, gel pens, or colored pencils, with just enough detail to "
    "make each hummingbird feel like a real visitor at your feeder or garden "
    "flowers. Inside you'll meet the Ruby-throated at its honeysuckle, Anna's "
    "at the feeder, the Rufous, the tiny Calliope, and many more — each a real "
    "species paired with a flower it truly loves, on its own single-sided page "
    "so heavy ink will never ghost through. Color the ruby throat crimson, or "
    "any color you like. Take your time. Welcome in."
)

DESIGN_COUNT = 40

THEME_TAGS: list[str] = [
    "hummingbird",
    "hummingbird coloring",
    "bird coloring",
    "bold and easy",
    "large print",
    "adult coloring",
    "seniors coloring",
    "flower coloring",
    "nature coloring",
    "bird lover gift",
    "printable pdf",
    "instant download",
    "easy coloring",
]

_ASSETS_BASE = Path(__file__).parent.parent.parent.parent / "assets"
GENERATED_DIR = _ASSETS_BASE / "generated" / "coloring" / BOOK_ID
PROCESSED_DIR = _ASSETS_BASE / "processed" / "coloring" / BOOK_ID

ASSETS_DIR = PROCESSED_DIR  # back-compat alias


def _expected_page_paths() -> list[Path]:
    return [PROCESSED_DIR / f"page_{i:02d}.png" for i in range(1, DESIGN_COUNT + 1)]


def build(output_dir: Path = OUTPUT_DIR) -> tuple[Path, Path]:
    page_paths = _expected_page_paths()
    missing = [p for p in page_paths if not p.exists()]
    if missing:
        generated_missing = [
            p for p in page_paths if not (GENERATED_DIR / p.name).exists()
        ]
        if generated_missing:
            raise FileNotFoundError(
                f"{len(generated_missing)} of {DESIGN_COUNT} coloring page PNGs "
                f"are missing under {GENERATED_DIR}. Run:\n"
                f"    cd web.ui/backend && node scripts/generate_coloring_interiors.mjs {BOOK_ID}\n"
                f"First missing: {generated_missing[0].name}"
            )
        raise FileNotFoundError(
            f"{len(missing)} of {DESIGN_COUNT} PROCESSED coloring pages are missing "
            f"under {PROCESSED_DIR}. Run the post-processor:\n"
            f"    python scripts/process_coloring_pages.py {BOOK_ID}\n"
            f"First missing: {missing[0].name}"
        )

    config = BookConfig(
        book_id=BOOK_ID,
        title=TITLE,
        template=TEMPLATE_85X11_LARGEPRINT,
        output_dir=output_dir,
        intro_text=INTRO,
        kind=BOOK_KIND_COLORING,
    )
    assembler = BookAssembler(config)
    interior = assembler.assemble_coloring_book(page_paths)

    cover_path = output_dir / BOOK_ID / "cover.pdf"
    cover_builder = CoverBuilder(
        TEMPLATE_85X11_LARGEPRINT,
        PALETTE_BIRDWATCHER,
        cover_path,
        theme="playful",
        kind=BOOK_KIND_COLORING,
    )
    page_count = len(PdfReader(str(interior)).pages)
    cover = cover_builder.build(
        TITLE,
        subtitle=SUBTITLE,
        page_count=page_count,
        series_label="Bold & Easy Hummingbirds · Volume 1",
        back_bullets=[
            "40 real hummingbird species, each paired with a flower it loves",
            "Bold, large-print lines — thick outlines for steady hands and easy eyes",
            "Single-sided pages — no marker ghost-through",
            "Ruby-throated, Anna's, Rufous, Calliope and more — at trumpet vine, bee balm, salvia, and fuchsia",
            "Designed for adults, seniors, and bird lovers · calm, gentle coloring",
        ],
        hero_image_path=hero_image_for(BOOK_ID),
    )

    return interior, cover


if __name__ == "__main__":
    interior, cover = build()
    print(f"Interior: {interior}")
    print(f"Cover:    {cover}")
    reader = PdfReader(str(interior))
    print(f"Pages:    {len(reader.pages)}")
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd projects/kdp-puzzle-press && python -m pytest tests/test_book_bold_easy_hummingbirds_v1.py::test_book_module_constants_are_importer_ready -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add projects/kdp-puzzle-press/src/pocket_rooster_press/books/bold_easy_hummingbirds_v1.py projects/kdp-puzzle-press/tests/test_book_bold_easy_hummingbirds_v1.py
git commit -m "feat(hummingbirds): book module (constants + build)"
```

---

### Task 3: Register the book in the CLI

**Files:**
- Modify: `projects/kdp-puzzle-press/src/pocket_rooster_press/cli.py` (the `BOOK_MODULES` dict, ends line 52)
- Test: `projects/kdp-puzzle-press/tests/test_book_bold_easy_hummingbirds_v1.py` (append)

**Interfaces:**
- Consumes: `BOOK_MODULES` from Task 2's module path.
- Produces: `build bold-easy-hummingbirds-v1` resolves to the book module.

- [ ] **Step 1: Write the failing test** (append)

```python
def test_book_is_registered_in_cli():
    from pocket_rooster_press.cli import BOOK_MODULES
    assert BOOK_MODULES[BOOK_ID] == "pocket_rooster_press.books.bold_easy_hummingbirds_v1"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd projects/kdp-puzzle-press && python -m pytest tests/test_book_bold_easy_hummingbirds_v1.py::test_book_is_registered_in_cli -v`
Expected: FAIL — `KeyError: 'bold-easy-hummingbirds-v1'`.

- [ ] **Step 3: Add the registry entry**

In `projects/kdp-puzzle-press/src/pocket_rooster_press/cli.py`, add to the `BOOK_MODULES` dict after the `bold-easy-cozy-christmas-v1` line (line 51):

```python
    "bold-easy-hummingbirds-v1": "pocket_rooster_press.books.bold_easy_hummingbirds_v1",
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd projects/kdp-puzzle-press && python -m pytest tests/test_book_bold_easy_hummingbirds_v1.py::test_book_is_registered_in_cli -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add projects/kdp-puzzle-press/src/pocket_rooster_press/cli.py projects/kdp-puzzle-press/tests/test_book_bold_easy_hummingbirds_v1.py
git commit -m "feat(hummingbirds): register book in CLI BOOK_MODULES"
```

---

### Task 4: KDP metadata + listing copy

**Files:**
- Create: `projects/kdp-puzzle-press/metadata/bold_easy_hummingbirds_v1.json`
- Create: `projects/kdp-puzzle-press/metadata/bold_easy_hummingbirds_v1_listing.md`
- Test: `projects/kdp-puzzle-press/tests/test_book_bold_easy_hummingbirds_v1.py` (append)

**Interfaces:**
- Produces: KDP metadata JSON (same shape as `metadata/bold_easy_songbirds_v1.json`) driving the manual KDP upload.

- [ ] **Step 1: Write the failing test** (append)

```python
METADATA = KDP_ROOT / "metadata" / "bold_easy_hummingbirds_v1.json"

_BANNED = ("best seller", "free", "kindle", " new ", "on sale", "sale")


def test_kdp_metadata_valid():
    m = json.loads(METADATA.read_text(encoding="utf-8"))
    assert m["book_id"] == BOOK_ID
    assert m["trim_size"] == "8.5x11"
    assert m["kind"] == "coloring"
    assert len(m["title"]) <= 200 and len(m["subtitle"]) <= 200
    kws = m["keywords"]
    assert len(kws) == 7
    for kw in kws:
        assert len(kw) <= 50, f"keyword too long: {kw!r}"
        low = f" {kw.lower()} "
        for bad in _BANNED:
            assert bad not in low, f"banned term {bad!r} in {kw!r}"
    assert m["ai_disclosure"]["images"] == "AI-Generated"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd projects/kdp-puzzle-press && python -m pytest tests/test_book_bold_easy_hummingbirds_v1.py::test_kdp_metadata_valid -v`
Expected: FAIL — `FileNotFoundError`.

- [ ] **Step 3: Create the metadata JSON**

Create `projects/kdp-puzzle-press/metadata/bold_easy_hummingbirds_v1.json`:

```json
{
  "$schema": "./_metadata.schema.json",
  "book_id": "bold-easy-hummingbirds-v1",
  "imprint": "Pocket Rooster Press",
  "title": "Bold & Easy Hummingbirds",
  "subtitle": "40 Large-Print Coloring Designs of Hummingbirds & the Flowers They Love — Real Species for Adults, Seniors & Bird Lovers (Volume 1)",
  "series": { "name": "Bold & Easy Hummingbirds", "volume": 1 },
  "author": "Pocket Rooster Press",
  "language": "English",
  "publication_date": "2026-09-01",
  "edition": "First Edition",
  "publisher": "Pocket Rooster Press",
  "trim_size": "8.5x11",
  "kind": "coloring",
  "interior_type": "Black & White",
  "paper_type": "White",
  "binding": "Paperback (Perfect Bound)",
  "page_count_target": 86,
  "isbn": "KDP-assigned (free)",
  "bisac": [
    { "code": "NON026000", "label": "NON-CLASSIFIABLE" },
    { "code": "SEL036000", "label": "SELF-HELP / Creativity" }
  ],
  "kdp_browse_categories": [
    "Books > Crafts, Hobbies & Home > Crafts & Hobbies > Arts & Crafts > Drawing > Pencil Drawings",
    "Books > Sports & Outdoors > Nature & Ecology > Birdwatching"
  ],
  "keywords": [
    "large print for seniors low vision arthritis",
    "hummingbird gifts for women grandma bird lover",
    "beginners simple thick outlines relaxing",
    "garden flowers trumpet vine salvia fuchsia",
    "stress relief relaxation mindfulness gift",
    "grandmother mom nature bird watcher present",
    "single sided colouring pages nature"
  ],
  "audience": {
    "primary": "Adult children (35-65) buying a gift for a parent or grandparent (65+) who feeds hummingbirds and keeps a garden; birdwatching and gardening hobbyists; senior-living activity coordinators",
    "reading_age": "Adult",
    "is_adult_content": false,
    "low_content_book": false,
    "large_print": true
  },
  "pricing": {
    "currency_default": "USD",
    "list_prices": { "amazon_com_USD": 9.99 },
    "royalty_plan": "60% (Standard)",
    "expanded_distribution": false,
    "printing_cost_estimate_usd": {
      "fixed": 1.00,
      "per_page": 0.012,
      "page_count": 86,
      "total": 2.032,
      "formula": "1.00 + (page_count * 0.012)  [KDP US 8.5x11 B&W standard non-premium ink]"
    },
    "royalty_estimate_usd": {
      "list_price": 9.99,
      "royalty_rate": 0.60,
      "gross": 5.994,
      "printing_cost": 2.032,
      "net_per_copy": 3.962
    },
    "kdp_minimum_list_price_usd": 4.66,
    "pricing_rationale": "Launch at $9.99 (current 60%-royalty floor), mirroring Songbirds. Bump to $11.99 after ~30 reviews — the hummingbird/gift audience tolerates a small premium.",
    "post_launch_target_price_usd": 11.99
  },
  "ai_disclosure": {
    "policy_doc": "docs/AI_DISCLOSURE_POLICY.md",
    "text": "None of the above",
    "images": "AI-Generated",
    "translations": "None of the above",
    "image_tool": "Google Gemini (Nano Banana Pro / Gemini 3 Pro Image)",
    "image_count_bucket": "More than 10",
    "image_disclosure_notes": "All 40 interior line illustrations and the cover hero are AI-generated (Gemini) and hand-edited (1-bit conversion, stray-pixel cleanup, closed-shape repair) before publication. Private KDP flag; not shown on the product page."
  },
  "matchbook": false,
  "look_inside": true,
  "drm": false,
  "audience_options": { "sexually_explicit": false, "primary_audience_adult": false }
}
```

- [ ] **Step 4: Create the listing copy**

Create `projects/kdp-puzzle-press/metadata/bold_easy_hummingbirds_v1_listing.md`:

```markdown
# Bold & Easy Hummingbirds — Volume 1
## KDP Listing Copy + A+ Content Brief

**Book ID:** bold-easy-hummingbirds-v1
**Companion file:** [bold_easy_hummingbirds_v1.json](./bold_easy_hummingbirds_v1.json)
**Status:** Third Pocket Rooster Press coloring book; first in a "Bold & Easy Hummingbirds" series. Expansion of the first-Etsy-sale single hummingbird page.

## 1. Title
```
Bold & Easy Hummingbirds
```
## 2. Subtitle
```
40 Large-Print Coloring Designs of Hummingbirds & the Flowers They Love — Real Species for Adults, Seniors & Bird Lovers (Volume 1)
```
## 3. Series
- Series name: **Bold & Easy Hummingbirds** · Volume 1

## 4. Author
- Pocket Rooster Press

## 5. Description (HTML, <= 4000 chars)
```html
<h4>40 real hummingbirds, each paired with a flower it loves — drawn in a bold, large-print style with thick outlines for steady hands and easy eyes. A gentle, beautiful coloring book for adults, seniors, and anyone who keeps a feeder by the window.</h4>

<p><b>Bold & Easy Hummingbirds</b> brings together forty real hummingbird species — the Ruby-throated at its honeysuckle, Anna's at the feeder, the Rufous, the tiny Calliope, the Broad-tailed, and many more — each shown with a nectar flower it truly visits, from trumpet vine and bee balm to salvia, columbine, and fuchsia. Every design uses thick, bold outlines and large open spaces, so it colors beautifully with markers, gel pens, or colored pencils, and never fights your hand or your eyes.</p>

<h5>What's inside:</h5>
<ul>
<li>40 real hummingbird designs across four sections — Backyard Visitors, Hummingbirds & Their Flowers, In the Garden, and Showstoppers</li>
<li>Bold, large-print line art — thick outlines, generous open areas, minimal fussy detail</li>
<li>Each bird paired with a real nectar flower it visits, with an illustrated species index up front</li>
<li>Single-sided pages — no marker ghost-through</li>
<li>Generous 8.5 x 11 format on bright white paper</li>
</ul>

<h5>A real gift for the person who loves hummingbirds:</h5>
<p>Most hummingbird coloring books are either eye-strain intricate or generic simple shapes. This one lives in between — every bird is real and recognizable, but every shape is bold and open. A thoughtful Mother's Day, birthday, Grandparents Day, or Christmas gift for the gardener or bird lover in your life.</p>

<h5>From Pocket Rooster Press:</h5>
<p>A small imprint publishing thoughtful, dignified coloring and puzzle books — clean typography, generous layouts, no childish gimmicks.</p>
<p><i>Coloring with personality.</i></p>
```

## 6. Bullet Highlights
1. 40 real hummingbird species — Ruby-throated, Anna's, Rufous, Calliope, and more — each with a flower it loves
2. Bold, large-print line art — thick outlines and open spaces for steady hands and easy eyes
3. Illustrated species index up front — a real book for bird lovers and gardeners
4. Single-sided pages — no marker ghost-through
5. A thoughtful Mother's Day, birthday, and Christmas gift for the hummingbird lover

## 7. Keywords (7)
1. large print for seniors low vision arthritis
2. hummingbird gifts for women grandma bird lover
3. beginners simple thick outlines relaxing
4. garden flowers trumpet vine salvia fuchsia
5. stress relief relaxation mindfulness gift
6. grandmother mom nature bird watcher present
7. single sided colouring pages nature

## 8. Categories
- Books > Crafts, Hobbies & Home > Crafts & Hobbies > Arts & Crafts > Drawing > Pencil Drawings
- Books > Sports & Outdoors > Nature & Ecology > Birdwatching

## 9. BISAC
- NON026000 — NON-CLASSIFIABLE
- SEL036000 — SELF-HELP / Creativity

## 10. Pricing
- US $9.99 launch → $11.99 after ~30 reviews. Net ≈ $3.96/copy at 60%, 86pp 8.5×11 B&W.

## 11. AI-Content Disclosure
- Disclose `Images: AI-Generated` (Gemini). Private KDP flag; not shown to readers.

## 12. Cross-sell
- Launch alongside Bold & Easy Songbirds for Amazon "Frequently Bought Together."
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd projects/kdp-puzzle-press && python -m pytest tests/test_book_bold_easy_hummingbirds_v1.py::test_kdp_metadata_valid -v`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add projects/kdp-puzzle-press/metadata/bold_easy_hummingbirds_v1.json projects/kdp-puzzle-press/metadata/bold_easy_hummingbirds_v1_listing.md projects/kdp-puzzle-press/tests/test_book_bold_easy_hummingbirds_v1.py
git commit -m "feat(hummingbirds): KDP metadata + listing copy"
```

---

### Task 5: Generate interior art (out-of-band, Gemini)

> **Ops task — costs Gemini image credits, ~40 generations. Not unit-testable; the gate is a smoke check + page count + the visual verify in Task 8.**

**Files:**
- Uses: `data/coloring_prompts/bold-easy-hummingbirds-v1.json` (Task 1)
- Produces: `assets/generated/coloring/bold-easy-hummingbirds-v1/page_01..40.png`
- Requires: `GEMINI_API_KEY` in `web.ui/backend/.env.local`

- [ ] **Step 1: Confirm the API key is present**

Run: `cd web.ui/backend && node -e "require('dotenv').config({path:'.env.local'}); console.log(process.env.GEMINI_API_KEY ? 'KEY SET' : 'KEY MISSING')"`
Expected: `KEY SET`. If MISSING, add `GEMINI_API_KEY=...` to `web.ui/backend/.env.local` before continuing.

- [ ] **Step 2: Seed designs 1 & 2 from the Songbirds art (reuse)**

Copy the two existing hummingbird pages so generation can skip them:

```bash
cd projects/kdp-puzzle-press
mkdir -p assets/generated/coloring/bold-easy-hummingbirds-v1
cp assets/generated/coloring/bold-easy-songbirds-v1/page_11.png assets/generated/coloring/bold-easy-hummingbirds-v1/page_01.png
cp assets/generated/coloring/bold-easy-songbirds-v1/page_12.png assets/generated/coloring/bold-easy-hummingbirds-v1/page_02.png
```

Verify: `ls assets/generated/coloring/bold-easy-hummingbirds-v1/` shows `page_01.png page_02.png`.

- [ ] **Step 3: Smoke batch (validate style before spending on all 40)**

Run: `cd web.ui/backend && node scripts/generate_coloring_interiors.mjs bold-easy-hummingbirds-v1 --pages=3,11,21,36`
Expected: 4 new PNGs written (one per section, including the dramatic sword-billed idx 36). Open them and confirm: bold large-print lines, recognizable species, one flower, no text/shading. If off-style, adjust `style_preamble` in the prompt bank (Task 1) and re-run before proceeding.

- [ ] **Step 4: Full generation (skip existing)**

Run: `cd web.ui/backend && node scripts/generate_coloring_interiors.mjs bold-easy-hummingbirds-v1 --skip-existing`
Expected: pages 1, 2, and any smoke pages skipped; the rest generated. Ends with 40 files present.

- [ ] **Step 5: Verify count**

Run: `cd projects/kdp-puzzle-press && python -c "from pathlib import Path; d=Path('assets/generated/coloring/bold-easy-hummingbirds-v1'); n=len(sorted(d.glob('page_*.png'))); print(n); assert n==40, n"`
Expected: `40`.

- [ ] **Step 6: Commit is not applicable** — generated PNGs live under `assets/` which is git-ignored per the KDP repo's `.gitignore`. Confirm with `git status --short assets/` (expect no output). If they are NOT ignored, stop and ask before committing large binaries.

---

### Task 6: Process pages to 1-bit B&W

**Files:**
- Uses: `assets/generated/coloring/bold-easy-hummingbirds-v1/page_*.png`
- Produces: `assets/processed/coloring/bold-easy-hummingbirds-v1/page_01..40.png` (mode "1")
- Test: `projects/kdp-puzzle-press/tests/test_book_bold_easy_hummingbirds_v1.py` (append)

- [ ] **Step 1: Run the processor**

Run: `cd projects/kdp-puzzle-press && python scripts/process_coloring_pages.py bold-easy-hummingbirds-v1`
Expected: 40 PNGs written to `assets/processed/coloring/bold-easy-hummingbirds-v1/`.

- [ ] **Step 2: Write the verification test** (append)

```python
def test_processed_pages_are_40_and_1bit():
    import pytest
    from PIL import Image
    d = KDP_ROOT / "assets" / "processed" / "coloring" / BOOK_ID
    if not d.is_dir():
        pytest.skip("processed pages not generated yet (run Task 6)")
    pages = sorted(d.glob("page_*.png"))
    assert len(pages) == 40, f"expected 40 processed pages, got {len(pages)}"
    for p in pages:
        with Image.open(p) as im:
            assert im.mode == "1", f"{p.name} is mode {im.mode!r}, not 1-bit"
```

- [ ] **Step 3: Run test to verify it passes**

Run: `cd projects/kdp-puzzle-press && python -m pytest tests/test_book_bold_easy_hummingbirds_v1.py::test_processed_pages_are_40_and_1bit -v`
Expected: PASS (40 pages, all mode "1").

- [ ] **Step 4: Commit**

```bash
git add projects/kdp-puzzle-press/tests/test_book_bold_easy_hummingbirds_v1.py
git commit -m "test(hummingbirds): assert 40 processed 1-bit pages"
```

---

### Task 7: Build interior + cover PDFs

**Files:**
- Uses: the book module (Task 2), processed PNGs (Task 6)
- Produces: `output/bold-easy-hummingbirds-v1/interior.pdf` + `cover.pdf`

- [ ] **Step 1: Build**

Run: `cd projects/kdp-puzzle-press && python -m pocket_rooster_press.cli build bold-easy-hummingbirds-v1`
Expected: prints `Interior:` and `Cover:` paths and `Done in ...s`, no traceback. (If a cover hero is missing, note it and continue — the hero is finalized in Task 8; `hero_image_for` should resolve a placeholder or the book's wrap. If it hard-fails on the hero, generate the cover hero via the covers pipeline first, then re-run.)

- [ ] **Step 2: Verify the interior page count**

Run: `cd projects/kdp-puzzle-press && python -c "from pypdf import PdfReader; n=len(PdfReader('output/bold-easy-hummingbirds-v1/interior.pdf').pages); print(n); assert 80 <= n <= 92, n"`
Expected: a page count in the 80–92 band (≈86, matching Songbirds' 40-design build).

- [ ] **Step 3: Verify both PDFs exist and are non-trivial**

Run: `cd projects/kdp-puzzle-press && python -c "from pathlib import Path; b=Path('output/bold-easy-hummingbirds-v1'); [print(p.name, p.stat().st_size) for p in (b/'interior.pdf', b/'cover.pdf')]"`
Expected: both `interior.pdf` and `cover.pdf` print with a size well over 50 KB (a tiny/zero size means the build silently failed — investigate before continuing).

- [ ] **Step 4: Commit is not applicable** — `output/` is git-ignored. Confirm `git status --short output/` is empty.

---

### Task 8: Visual verification gate

> **Mandatory before any listing copy is authored (the "never blind content picks" rule). Human-in-the-loop.**

**Files:**
- Uses: `assets/processed/coloring/bold-easy-hummingbirds-v1/page_*.png`, `output/bold-easy-hummingbirds-v1/interior.pdf`

- [ ] **Step 1: Review every processed page**

Open all 40 processed PNGs and confirm for each: (a) the species reads as the intended hummingbird, (b) it's paired with the intended flower/setting, (c) bold large-print style (thick outlines, open regions), (d) no text/numbers/watermark/shading, (e) fully closed shapes. Record any page numbers that fail.

- [ ] **Step 2: Regenerate any off-model pages**

For each failing page N: re-run `cd web.ui/backend && node scripts/generate_coloring_interiors.mjs bold-easy-hummingbirds-v1 --pages=N` (optionally after tweaking that prompt's `subject`), then re-run Task 6 (process) and re-check. Repeat until all 40 pass.

- [ ] **Step 3: Confirm the built interior**

Open `output/bold-easy-hummingbirds-v1/interior.pdf`; confirm cover/title/intro/species-index front matter renders, all 40 designs are present single-sided, and the order matches the four sections.

- [ ] **Step 4: Record completion**

Note in the memory checkpoint (`hummingbird-coloring-book-idea` / a new build checkpoint) that all 40 pages are verified and the interior/cover are built — this unblocks the Etsy-launch plan.

---

## Follow-on plans (not in this plan)

- **Plan 2 — Etsy launch:** import the built book via `etsy_rooster.coloring.kdp_importer.load_coloring_niche`, then derive and publish the full-book PDF listing, four themed mini-packs, and ~15 curated single-page listings (previews + videos + authored copy). Depends on Task 8 completion. Pure reuse of the (now-fixed) Etsy pipeline.
- **Plan 3 — KDP submission:** manual upload of `interior.pdf` + `cover.pdf` + metadata to KDP, with the AI-image disclosure; launch alongside Songbirds. Timed for Q4 2026 / spring 2027.

---

## Self-Review

**Spec coverage:** §2 product spec → Tasks 1–2, 7 (trim/count/style/palette). §3 40-design content → Task 1 (all 40 subjects inline). §4 front matter → book module INTRO + `assemble_coloring_book` (Task 2/7); species index is part of the assembled front matter and verified in Task 8. §5 Etsy ladder → Plan 2 (scoped out, noted). §6 KDP metadata → Task 4. §7 build pipeline → Tasks 5–7. §8 timeline / §9 metrics → Plans 2–3. §10 out-of-scope (grayscale, Vol.2, captions) → not built. Covered or explicitly deferred.

**Placeholder scan:** No TBD/TODO. Full prompt bank, book module, metadata, and listing copy are inline. Ops tasks give exact commands + expected output.

**Type consistency:** `BOOK_ID`, `DESIGN_COUNT`, `THEME_TAGS`, `build()` names match across Tasks 2/3 and the Songbirds template + Etsy importer contract (`TITLE`, `SUBTITLE`, `INTRO`, `DESIGN_COUNT`, `THEME_TAGS`). Registry value in Task 3 matches the module path in Task 2. Metadata `book_id`/keywords/AI-disclosure match Task 4's test.
