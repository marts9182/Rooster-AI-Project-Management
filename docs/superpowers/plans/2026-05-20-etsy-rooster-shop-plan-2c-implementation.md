# Etsy Rooster Shop — Plan 2c (Posters via Nano Banana Pro) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship one printable cottagecore mushroom poster to the Etsy shop end-to-end, populating the empty "Printable Posters" section and validating the third SKU-type pipeline (after mandala SVG and coloring PDF).

**Architecture:** New `etsy_rooster.posters` subpackage that mirrors `etsy_rooster.coloring` (`niche.py`, `kdp_importer.py`, `bundle_builder.py`, `preview_builder.py`). New Node script `web.ui/backend/scripts/generate_posters.mjs` mirrors `generate_coloring_interiors.mjs` to call Nano Banana Pro at 4K / 3:4 from a JSON prompt bank. The orchestrator allowlist is widened by one tuple entry (`"zip"`) and the CLI gets one new sub-command + one new taxonomy entry. The first poster lives at `data/poster_prompts/cottagecore-mushroom-poster-v1.json`.

**Tech Stack:** Python 3.13+, Pillow (image cropping/resize), reportlab (print-instructions PDF), zipfile (stdlib), pytest, click. Node.js 22+, `@google/genai`, `dotenv`. Etsy v3 API (existing wrapper).

**Spec:** [docs/superpowers/specs/2026-05-20-etsy-rooster-shop-plan-2c-design.md](../specs/2026-05-20-etsy-rooster-shop-plan-2c-design.md)

---

## Repo layout — read once

Two nested git repos:
- **Outer**: `c:\Sandbox\AIProjectManagement\Rooster-AI-Project-Management` (this plan file + `web.ui/backend/` lives here).
- **Inner**: `projects/etsy-rooster-shop/` — separate git repo (outer repo `.gitignore`s `projects/`). All Python code, tests, and Python-side commits happen here. Use `git -C projects/etsy-rooster-shop ...` or `cd projects/etsy-rooster-shop` first.

Both are on `main` — the user's chosen workflow. Do not branch, pull, or push.

**Pre-existing uncommitted state may exist. Stage only the specific files for each task. Never use `git add .` or `git add -A`.**

A third project lives at `projects/kdp-puzzle-press/` and stores the asset prompts + generated PNGs. Its git repo is separate too — do not commit data files there casually; the `assets/generated/` and `data/poster_prompts/` paths may or may not be tracked, check with `git -C projects/kdp-puzzle-press check-ignore <path>` before committing.

## File Structure

**Files to create (Python side, inner repo):**

| Path | Responsibility |
|---|---|
| `projects/etsy-rooster-shop/src/etsy_rooster/posters/__init__.py` | Package marker (empty). |
| `projects/etsy-rooster-shop/src/etsy_rooster/posters/niche.py` | `PosterNiche` frozen dataclass + validation in `__post_init__`. |
| `projects/etsy-rooster-shop/src/etsy_rooster/posters/kdp_importer.py` | `load_poster_niche(kdp_root, poster_id) → PosterNiche`. Reads JSON prompt + verifies master.png. Raises `PosterAssetError`. |
| `projects/etsy-rooster-shop/src/etsy_rooster/posters/bundle_builder.py` | `build_buyer_zip(niche, output_dir) → Path` — 5 JPGs + 1 PDF, packaged. |
| `projects/etsy-rooster-shop/src/etsy_rooster/posters/preview_builder.py` | `build_previews(niche, output_dir) → list[Path]` — 3 preview JPGs. |
| `projects/etsy-rooster-shop/src/etsy_rooster/listing_authoring/prompts/poster-prompt.md` | LLM prompt template for `niche="poster"`. |
| `projects/etsy-rooster-shop/tests/test_poster_niche.py` | Validation tests (mirror `test_coloring_niche.py`). |
| `projects/etsy-rooster-shop/tests/test_poster_kdp_importer.py` | Cross-project loader tests. |
| `projects/etsy-rooster-shop/tests/test_poster_bundle_builder.py` | ZIP contents + dims + 300 DPI metadata tests. |
| `projects/etsy-rooster-shop/tests/test_poster_preview_builder.py` | Preview JPG existence + dim tests. |
| `projects/etsy-rooster-shop/tests/test_poster_cli.py` | CLI subcommand `generate poster` test. |
| `projects/etsy-rooster-shop/tests/integration/test_e2e_poster.py` | Live test (marker `live`, skipped by default). |

**Files to create (Node side, outer repo):**

| Path | Responsibility |
|---|---|
| `web.ui/backend/scripts/generate_posters.mjs` | Driver: read prompt JSON, call Nano Banana Pro at 3:4 / 4K, write master.png. |
| `projects/kdp-puzzle-press/data/poster_prompts/cottagecore-mushroom-poster-v1.json` | First poster's prompt bank (style_preamble + subject + tags). |
| `projects/kdp-puzzle-press/assets/generated/posters/cottagecore-mushroom-poster-v1/master.png` | The actual 4K hero image (generated, may be gitignored). |

**Files to modify:**

| Path | Change |
|---|---|
| `projects/etsy-rooster-shop/src/etsy_rooster/cli.py` | Add `generate poster --poster=<id>` subcommand; add `"poster": 2078` to `_TAXONOMY_BY_NICHE`. |
| `projects/etsy-rooster-shop/src/etsy_rooster/publish/orchestrator.py` | Line ~52: change `f["kind"] in ("svg", "pdf")` → `f["kind"] in ("svg", "pdf", "zip")`. |
| `projects/etsy-rooster-shop/tests/test_publish_orchestrator.py` | Add `test_publish_accepts_zip_primary_file`. |
| `projects/etsy-rooster-shop/tests/test_listing_authoring.py` | Add test that `LLMListingAuthor` resolves `poster-prompt.md` for `niche="poster"`. |

## Conventions (read once)

- Inside `projects/etsy-rooster-shop/`, run `python -m pytest tests/ -v` for unit tests; live tests are deselected via `addopts = -m 'not live'` in `pyproject.toml` and need `-m live` to run.
- Frozen dataclasses use `object.__setattr__` for defaulting fields inside `__post_init__` — see `ColoringNiche._default_hero_indices` for the pattern.
- Cross-project JSON loads are literal JSON, not AST — posters are pure data files unlike KDP book modules.
- Commit message style: conventional (`feat(posters):`, `test(posters):`, `chore:`). Footer: `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>`.

---

## Task 1: First poster's prompt JSON

**Files:**
- Create: `projects/kdp-puzzle-press/data/poster_prompts/cottagecore-mushroom-poster-v1.json`

- [ ] **Step 1: Verify the directory exists**

```bash
ls projects/kdp-puzzle-press/data/coloring_prompts/ 2>&1 | head -3
```

Expected: shows existing coloring-book prompt files (proving the `data/` parent is the right home for prompt banks). If `data/poster_prompts/` doesn't exist yet, create it: `mkdir -p projects/kdp-puzzle-press/data/poster_prompts/`.

- [ ] **Step 2: Write the JSON**

Create `projects/kdp-puzzle-press/data/poster_prompts/cottagecore-mushroom-poster-v1.json`:

```json
{
  "poster_id": "cottagecore-mushroom-poster-v1",
  "title": "Cottagecore Woodland Mushroom Print",
  "subtitle": "A botanical wall print of woodland mushrooms, ferns, and forest details",
  "style_description": "Soft watercolor botanical illustration with hand-painted texture; warm earthy palette of terracotta, sage, mossy green, and cream; gentle ink outlines; cozy cottagecore aesthetic; centered composition on cream paper background",
  "theme_tags": [
    "cottagecore",
    "mushroom print",
    "botanical art",
    "woodland decor",
    "watercolor print",
    "forest wall art",
    "printable poster",
    "nature print",
    "cozy decor",
    "fern print",
    "boho wall art",
    "instant download",
    "ai art"
  ],
  "style_preamble": "Printable wall-art poster, professional fine-art quality, 300 DPI print-ready composition, portrait 3:4 orientation, generous breathing room on all sides for any frame mat, color palette restrained to a cohesive cottagecore range (warm cream paper, terracotta, sage green, mossy green, soft amber, ink outlines). Hand-painted watercolor texture with visible paper grain; thin elegant ink outlines used for botanical detail; NO text, NO letters, NO captions, NO signature, NO watermark, NO logo, NO border frame. Single cohesive subject filling the central composition. No human figures, no realistic photography, no digital airbrush. Subject:",
  "subject": "a cozy woodland composition featuring three large amanita mushrooms (different sizes, different cap angles), surrounded by curling fern fronds, two small toadstools at the base, scattered moss and tiny wild forget-me-nots, all arranged in a balanced bouquet-like cluster"
}
```

- [ ] **Step 3: Validate JSON shape**

```bash
python -c "import json; d=json.load(open('projects/kdp-puzzle-press/data/poster_prompts/cottagecore-mushroom-poster-v1.json')); assert d['poster_id']=='cottagecore-mushroom-poster-v1'; assert len(d['theme_tags'])==13; print('OK', d['poster_id'])"
```

Expected: `OK cottagecore-mushroom-poster-v1`.

- [ ] **Step 4: Commit (kdp-puzzle-press repo)**

Check if `data/poster_prompts/` is gitignored first:

```bash
git -C projects/kdp-puzzle-press check-ignore data/poster_prompts/cottagecore-mushroom-poster-v1.json
```

If output is empty (not ignored) — commit:

```bash
git -C projects/kdp-puzzle-press add data/poster_prompts/cottagecore-mushroom-poster-v1.json
git -C projects/kdp-puzzle-press commit -m "$(cat <<'EOF'
feat(posters): first poster prompt bank (cottagecore mushroom)

JSON prompt bank for Plan 2c Task 1 — feeds the new
generate_posters.mjs Nano Banana Pro generator. Single subject
(cottagecore woodland composition), 13 theme tags ready to feed
the LLM listing author.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

If output shows the path (ignored), skip the commit — the file is local-only by design.

---

## Task 2: Nano Banana Pro generator (Node script)

**Files:**
- Create: `web.ui/backend/scripts/generate_posters.mjs`

- [ ] **Step 1: Confirm the Node side has everything needed**

```bash
ls web.ui/backend/agents/ImageGenerationService.js && grep -l "@google/genai" web.ui/backend/package.json
```

Expected: the service file exists and `package.json` already depends on `@google/genai`. (Both true after Plan 2a — coloring interiors use the same path.)

- [ ] **Step 2: Write the generator script**

Create `web.ui/backend/scripts/generate_posters.mjs`:

```javascript
#!/usr/bin/env node
/**
 * Generate printable poster master PNG via Nano Banana Pro (Gemini 3 Pro
 * Image) for a given poster id. One PNG per poster, 4K, 3:4 portrait.
 *
 * Mirrors generate_coloring_interiors.mjs:
 *   - reads <kdp>/data/poster_prompts/<poster_id>.json
 *   - calls ImageGenerationService at aspectRatio="3:4", resolution="4K"
 *   - writes <kdp>/assets/generated/posters/<poster_id>/master.png
 *
 * Usage (from web.ui/backend/):
 *
 *   node scripts/generate_posters.mjs cottagecore-mushroom-poster-v1
 *   node scripts/generate_posters.mjs cottagecore-mushroom-poster-v1 --skip-existing
 *
 * Mandatory Etsy AI disclosure: the master art is AI-generated. The
 * Python listing template already includes the disclosure sentence.
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
const PROMPTS_DIR = path.join(KDP_ROOT, 'data', 'poster_prompts');
const POSTERS_ASSETS_ROOT = path.join(KDP_ROOT, 'assets', 'generated', 'posters');

dotenv.config({ path: path.join(BACKEND_DIR, '.env') });
dotenv.config({ path: path.join(BACKEND_DIR, '.env.local'), override: true });

function loadPromptBank(posterId) {
  const p = path.join(PROMPTS_DIR, `${posterId}.json`);
  if (!fs.existsSync(p)) {
    throw new Error(
      `No prompt bank found for "${posterId}" at ${path.relative(REPO_ROOT, p)}.`,
    );
  }
  const bank = JSON.parse(fs.readFileSync(p, 'utf-8'));
  for (const field of ['style_preamble', 'subject', 'theme_tags']) {
    if (!bank[field]) {
      throw new Error(`Prompt bank for "${posterId}" missing field "${field}".`);
    }
  }
  return bank;
}

function buildPrompt(bank) {
  // style_preamble ends with "Subject:" so we just append the subject.
  return `${bank.style_preamble} ${bank.subject}`;
}

function parseArgs(argv) {
  const args = argv.slice(2);
  const posterId = args.find((a) => !a.startsWith('--'));
  const skipExisting = args.includes('--skip-existing');
  return { posterId, skipExisting };
}

async function main() {
  const { posterId, skipExisting } = parseArgs(process.argv);
  if (!posterId) {
    console.error('Usage: node scripts/generate_posters.mjs <poster-id> [--skip-existing]');
    process.exit(2);
  }
  if (!process.env.GEMINI_API_KEY) {
    console.error('GEMINI_API_KEY is not set. Add it to web.ui/backend/.env.local.');
    process.exit(1);
  }

  const outDir = path.join(POSTERS_ASSETS_ROOT, posterId);
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, 'master.png');
  if (skipExisting && fs.existsSync(outPath)) {
    console.log(`⏭️  ${posterId} master.png exists, skipping`);
    return;
  }

  const bank = loadPromptBank(posterId);
  const prompt = buildPrompt(bank);

  console.log(`🎨 Generating master for ${posterId}`);
  console.log(`   prompt length: ${prompt.length} chars`);

  const svc = new ImageGenerationService({
    apiKey: process.env.GEMINI_API_KEY,
    model: process.env.IMAGE_MODEL, // defaults to gemini-3-pro-image-preview
    outputDir: outDir,
  });

  const t0 = Date.now();
  const result = await svc.generate({
    prompt,
    aspectRatio: '3:4',
    resolution: '4K',
    taskId: `poster-${posterId}`,
  });
  // ImageGenerationService writes <slug>-<ts>-<rand>.png; rename to canonical.
  fs.renameSync(path.join(outDir, result.filename), outPath);
  const ms = Date.now() - t0;
  const kb = Math.round(result.bytes / 1024);
  console.log(`   ✅ ${kb} KB in ${(ms / 1000).toFixed(1)}s → ${path.relative(REPO_ROOT, outPath)}`);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
```

- [ ] **Step 3: Smoke-test help/usage path (no API call)**

```bash
cd web.ui/backend && node scripts/generate_posters.mjs 2>&1 | head -3
```

Expected: `Usage: node scripts/generate_posters.mjs <poster-id> [--skip-existing]` and exit code 2.

- [ ] **Step 4: Commit (outer repo)**

```bash
cd ../..
git add web.ui/backend/scripts/generate_posters.mjs
git commit -m "$(cat <<'EOF'
feat(posters): Nano Banana Pro generator script

Mirrors generate_coloring_interiors.mjs but at 3:4 / 4K with a
single-image-per-id contract. Reads JSON prompt bank from
projects/kdp-puzzle-press/data/poster_prompts/<id>.json, writes
master.png to assets/generated/posters/<id>/.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Generate the actual master.png (live, ~30s, ~$0.04)

**Files:** none (this task runs the generator; no code changes).

- [ ] **Step 1: Run the generator**

```bash
cd web.ui/backend && node scripts/generate_posters.mjs cottagecore-mushroom-poster-v1 2>&1 | tail -5
```

Expected: `✅ <N> KB in <T>s → projects/kdp-puzzle-press/assets/generated/posters/cottagecore-mushroom-poster-v1/master.png`. The exit code is 0.

If the Gemini billing returns 429 RESOURCE_EXHAUSTED, stop and report BLOCKED — the user needs to top up. If 404 NOT_FOUND, the model id changed; check `web.ui/backend/agents/ImageGenerationService.js` for the current default.

- [ ] **Step 2: Verify the file exists and is plausible**

```bash
python -c "from PIL import Image; im = Image.open('projects/kdp-puzzle-press/assets/generated/posters/cottagecore-mushroom-poster-v1/master.png'); print(im.size, im.mode)"
```

Expected: `(3072, 4096) RGB` (or similar 3:4 dimensions; tolerate ±200 px on each axis). The image must be RGB (not grayscale or palette).

- [ ] **Step 3: Eyeball the result (optional but recommended)**

Open the PNG in an image viewer and confirm: portrait orientation, cottagecore-mushroom subject, no visible text/letters, breathing room on all sides. If the composition is bad, re-run the generator (don't pass `--skip-existing`) for a different seed.

- [ ] **Step 4: No commit needed**

The master.png lives under `assets/generated/posters/` which is gitignored by convention (see Plan 2a — coloring interiors are also gitignored at `assets/generated/coloring/`). Confirm with:

```bash
git -C projects/kdp-puzzle-press check-ignore projects/kdp-puzzle-press/assets/generated/posters/cottagecore-mushroom-poster-v1/master.png 2>&1
```

If the path is shown, it's ignored — proceed without committing. If empty, commit the file with `git -C projects/kdp-puzzle-press add ... && git commit -m "feat(posters): cottagecore mushroom master.png"`.

---

## Task 4: `PosterNiche` dataclass with validation

**Files:**
- Create: `projects/etsy-rooster-shop/src/etsy_rooster/posters/__init__.py`
- Create: `projects/etsy-rooster-shop/src/etsy_rooster/posters/niche.py`
- Create: `projects/etsy-rooster-shop/tests/test_poster_niche.py`

- [ ] **Step 1: Create the package marker**

Create `projects/etsy-rooster-shop/src/etsy_rooster/posters/__init__.py` with a single line:

```python
"""Etsy poster pipeline (Plan 2c)."""
```

- [ ] **Step 2: Write the failing tests**

Create `projects/etsy-rooster-shop/tests/test_poster_niche.py`:

```python
from __future__ import annotations

from pathlib import Path

import pytest

from etsy_rooster.posters.niche import PosterNiche


def _good_args(tmp_path: Path) -> dict:
    master = tmp_path / "master.png"
    master.write_bytes(b"\x89PNG\r\n\x1a\n")  # PNG signature is enough for path check
    return {
        "poster_id": "cottagecore-mushroom-poster-v1",
        "title": "Cottagecore Woodland Mushroom Print",
        "subtitle": "A botanical wall print of woodland mushrooms, ferns, and forest details",
        "style_description": "Soft watercolor botanical illustration with hand-painted texture",
        "theme_tags": [
            "cottagecore", "mushroom print", "botanical art", "woodland decor",
            "watercolor print", "forest wall art", "printable poster", "nature print",
            "cozy decor", "fern print", "boho wall art", "instant download", "ai art",
        ],
        "master_png_path": master,
    }


def test_construct_valid_niche(tmp_path: Path) -> None:
    n = PosterNiche(**_good_args(tmp_path))
    assert n.poster_id == "cottagecore-mushroom-poster-v1"
    assert len(n.theme_tags) == 13


def test_empty_poster_id_rejected(tmp_path: Path) -> None:
    args = _good_args(tmp_path)
    args["poster_id"] = ""
    with pytest.raises(ValueError, match="poster_id"):
        PosterNiche(**args)


def test_empty_title_rejected(tmp_path: Path) -> None:
    args = _good_args(tmp_path)
    args["title"] = ""
    with pytest.raises(ValueError, match="title"):
        PosterNiche(**args)


def test_empty_subtitle_rejected(tmp_path: Path) -> None:
    args = _good_args(tmp_path)
    args["subtitle"] = ""
    with pytest.raises(ValueError, match="subtitle"):
        PosterNiche(**args)


def test_empty_style_description_rejected(tmp_path: Path) -> None:
    args = _good_args(tmp_path)
    args["style_description"] = ""
    with pytest.raises(ValueError, match="style_description"):
        PosterNiche(**args)


def test_at_least_one_theme_tag_required(tmp_path: Path) -> None:
    args = _good_args(tmp_path)
    args["theme_tags"] = []
    with pytest.raises(ValueError, match="theme_tags"):
        PosterNiche(**args)


def test_master_png_must_exist(tmp_path: Path) -> None:
    args = _good_args(tmp_path)
    args["master_png_path"] = tmp_path / "missing.png"
    with pytest.raises(ValueError, match="master_png_path"):
        PosterNiche(**args)
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
cd projects/etsy-rooster-shop && python -m pytest tests/test_poster_niche.py -v 2>&1 | tail -5
```

Expected: collection fails with `ImportError: cannot import name 'PosterNiche' from 'etsy_rooster.posters.niche'`.

- [ ] **Step 4: Implement `PosterNiche`**

Create `projects/etsy-rooster-shop/src/etsy_rooster/posters/niche.py`:

```python
"""PosterNiche — data Plan 2c's pipeline needs about one printable poster."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class PosterNiche:
    """Everything the Etsy poster pipeline needs about one master illustration.

    All fields are required. Validation runs in __post_init__ — a niche
    object is either fully valid or construction fails.
    """

    poster_id: str
    title: str
    subtitle: str
    style_description: str
    theme_tags: list[str]
    master_png_path: Path

    def __post_init__(self) -> None:
        if not self.poster_id:
            raise ValueError("poster_id must be non-empty")
        if not self.title:
            raise ValueError("title must be non-empty")
        if not self.subtitle:
            raise ValueError("subtitle must be non-empty")
        if not self.style_description:
            raise ValueError("style_description must be non-empty")
        if not self.theme_tags:
            raise ValueError("theme_tags must contain at least one tag")
        if not self.master_png_path.is_file():
            raise ValueError(
                f"master_png_path does not exist: {self.master_png_path}"
            )
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd projects/etsy-rooster-shop && python -m pytest tests/test_poster_niche.py -v 2>&1 | tail -10
```

Expected: 7 tests PASS.

- [ ] **Step 6: Commit**

```bash
git -C projects/etsy-rooster-shop add src/etsy_rooster/posters/__init__.py src/etsy_rooster/posters/niche.py tests/test_poster_niche.py
git -C projects/etsy-rooster-shop commit -m "$(cat <<'EOF'
feat(posters): PosterNiche dataclass with non-empty + file-exists validation

Mirrors ColoringNiche structure. All five string fields and the
theme_tags list must be non-empty; master_png_path must point at
an existing file. Frozen dataclass; validation in __post_init__.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: `kdp_importer.load_poster_niche()`

**Files:**
- Create: `projects/etsy-rooster-shop/src/etsy_rooster/posters/kdp_importer.py`
- Create: `projects/etsy-rooster-shop/tests/test_poster_kdp_importer.py`

- [ ] **Step 1: Write the failing tests**

Create `projects/etsy-rooster-shop/tests/test_poster_kdp_importer.py`:

```python
from __future__ import annotations

import json
from pathlib import Path

import pytest

from etsy_rooster.posters.kdp_importer import (
    PosterAssetError,
    load_poster_niche,
)


def _build_kdp_root(tmp_path: Path, *, with_master: bool = True) -> Path:
    """Create a minimal kdp-puzzle-press-shaped tree with one poster fixture."""
    kdp = tmp_path / "kdp-puzzle-press"
    prompts_dir = kdp / "data" / "poster_prompts"
    prompts_dir.mkdir(parents=True)
    posters_dir = kdp / "assets" / "generated" / "posters" / "demo-poster"
    posters_dir.mkdir(parents=True)
    (prompts_dir / "demo-poster.json").write_text(
        json.dumps({
            "poster_id": "demo-poster",
            "title": "Demo Poster",
            "subtitle": "Demo subtitle line",
            "style_description": "Demo style",
            "theme_tags": ["a", "b", "c"],
            "style_preamble": "...",
            "subject": "...",
        }),
        encoding="utf-8",
    )
    if with_master:
        (posters_dir / "master.png").write_bytes(b"\x89PNG\r\n\x1a\n")
    return kdp


def test_load_valid_niche(tmp_path: Path) -> None:
    kdp = _build_kdp_root(tmp_path)
    n = load_poster_niche(kdp_root=kdp, poster_id="demo-poster")
    assert n.poster_id == "demo-poster"
    assert n.title == "Demo Poster"
    assert n.theme_tags == ["a", "b", "c"]
    assert n.master_png_path.name == "master.png"


def test_missing_prompt_json_raises(tmp_path: Path) -> None:
    kdp = tmp_path / "empty"
    (kdp / "data" / "poster_prompts").mkdir(parents=True)
    with pytest.raises(PosterAssetError, match="prompt JSON not found"):
        load_poster_niche(kdp_root=kdp, poster_id="missing")


def test_missing_master_png_raises(tmp_path: Path) -> None:
    kdp = _build_kdp_root(tmp_path, with_master=False)
    with pytest.raises(PosterAssetError, match="master.png not found"):
        load_poster_niche(kdp_root=kdp, poster_id="demo-poster")


def test_prompt_json_missing_required_field_raises(tmp_path: Path) -> None:
    kdp = _build_kdp_root(tmp_path)
    bad = kdp / "data" / "poster_prompts" / "demo-poster.json"
    bad.write_text(json.dumps({"poster_id": "demo-poster"}), encoding="utf-8")
    with pytest.raises(PosterAssetError, match="missing field"):
        load_poster_niche(kdp_root=kdp, poster_id="demo-poster")
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd projects/etsy-rooster-shop && python -m pytest tests/test_poster_kdp_importer.py -v 2>&1 | tail -5
```

Expected: collection fails with `ImportError: cannot import name 'load_poster_niche'`.

- [ ] **Step 3: Implement the importer**

Create `projects/etsy-rooster-shop/src/etsy_rooster/posters/kdp_importer.py`:

```python
"""Read a poster prompt JSON + its master PNG and return a PosterNiche."""

from __future__ import annotations

import json
from pathlib import Path

from etsy_rooster.posters.niche import PosterNiche


class PosterAssetError(RuntimeError):
    """Raised when KDP-side poster assets or metadata don't match expectations."""


_REQUIRED_FIELDS = ("poster_id", "title", "subtitle", "style_description", "theme_tags")


def load_poster_niche(*, kdp_root: Path, poster_id: str) -> PosterNiche:
    """Build a PosterNiche from kdp-puzzle-press project state.

    Reads:
      - <kdp_root>/data/poster_prompts/<poster_id>.json
      - <kdp_root>/assets/generated/posters/<poster_id>/master.png

    Raises:
      PosterAssetError when any required file or field is missing.
    """
    prompt_path = kdp_root / "data" / "poster_prompts" / f"{poster_id}.json"
    if not prompt_path.is_file():
        raise PosterAssetError(f"prompt JSON not found: {prompt_path}")

    data = json.loads(prompt_path.read_text(encoding="utf-8"))
    for field in _REQUIRED_FIELDS:
        if not data.get(field):
            raise PosterAssetError(
                f"prompt JSON {prompt_path.name} missing field {field!r}"
            )

    master_path = (
        kdp_root / "assets" / "generated" / "posters" / poster_id / "master.png"
    )
    if not master_path.is_file():
        raise PosterAssetError(f"master.png not found: {master_path}")

    return PosterNiche(
        poster_id=data["poster_id"],
        title=data["title"],
        subtitle=data["subtitle"],
        style_description=data["style_description"],
        theme_tags=list(data["theme_tags"]),
        master_png_path=master_path,
    )
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd projects/etsy-rooster-shop && python -m pytest tests/test_poster_kdp_importer.py -v 2>&1 | tail -8
```

Expected: 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git -C projects/etsy-rooster-shop add src/etsy_rooster/posters/kdp_importer.py tests/test_poster_kdp_importer.py
git -C projects/etsy-rooster-shop commit -m "$(cat <<'EOF'
feat(posters): kdp_importer.load_poster_niche reads JSON prompt + master PNG

Cross-project bridge mirrors coloring/kdp_importer.py — literal
JSON load (not AST since these are pure data files), required-field
guard, master.png existence check. Raises PosterAssetError on any
mismatch.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: `bundle_builder.build_buyer_zip()` — 5 JPGs + 1 PDF in a ZIP

**Files:**
- Create: `projects/etsy-rooster-shop/src/etsy_rooster/posters/bundle_builder.py`
- Create: `projects/etsy-rooster-shop/tests/test_poster_bundle_builder.py`

- [ ] **Step 1: Write the failing tests**

Create `projects/etsy-rooster-shop/tests/test_poster_bundle_builder.py`:

```python
from __future__ import annotations

import zipfile
from pathlib import Path

import pytest
from PIL import Image

from etsy_rooster.posters.bundle_builder import (
    POSTER_SIZES,
    build_buyer_zip,
)
from etsy_rooster.posters.niche import PosterNiche


def _make_master_png(tmp_path: Path, size=(3072, 4096)) -> Path:
    """Create a 3:4 cream RGB master PNG for the niche fixture."""
    img = Image.new("RGB", size, (250, 240, 220))
    p = tmp_path / "master.png"
    img.save(p, format="PNG")
    return p


def _make_niche(tmp_path: Path) -> PosterNiche:
    return PosterNiche(
        poster_id="test-poster",
        title="Test Poster",
        subtitle="Subtitle",
        style_description="Style",
        theme_tags=["a"],
        master_png_path=_make_master_png(tmp_path),
    )


def test_builds_zip_with_5_jpgs_plus_pdf(tmp_path: Path) -> None:
    niche = _make_niche(tmp_path)
    zip_path = build_buyer_zip(niche, output_dir=tmp_path)
    assert zip_path.is_file()
    with zipfile.ZipFile(zip_path) as zf:
        names = sorted(zf.namelist())
    # 5 JPGs (one per POSTER_SIZES entry) + 1 PDF = 6 files.
    assert len([n for n in names if n.endswith(".jpg")]) == 5
    assert len([n for n in names if n.endswith(".pdf")]) == 1


def test_each_jpg_has_correct_pixel_dimensions(tmp_path: Path) -> None:
    niche = _make_niche(tmp_path)
    zip_path = build_buyer_zip(niche, output_dir=tmp_path)
    extracted = tmp_path / "_extract"
    extracted.mkdir()
    with zipfile.ZipFile(zip_path) as zf:
        zf.extractall(extracted)
    for size_label, (w, h) in POSTER_SIZES.items():
        jpg_path = extracted / f"{size_label}.jpg"
        assert jpg_path.is_file(), f"missing {size_label}.jpg"
        with Image.open(jpg_path) as im:
            assert im.size == (w, h), f"{size_label} expected {(w, h)}, got {im.size}"


def test_each_jpg_carries_300_dpi_metadata(tmp_path: Path) -> None:
    niche = _make_niche(tmp_path)
    zip_path = build_buyer_zip(niche, output_dir=tmp_path)
    extracted = tmp_path / "_extract"
    extracted.mkdir()
    with zipfile.ZipFile(zip_path) as zf:
        zf.extractall(extracted)
    for size_label in POSTER_SIZES:
        with Image.open(extracted / f"{size_label}.jpg") as im:
            dpi = im.info.get("dpi")
            assert dpi == (300, 300), f"{size_label} dpi={dpi}, expected (300, 300)"


def test_pdf_is_present_and_nonempty(tmp_path: Path) -> None:
    niche = _make_niche(tmp_path)
    zip_path = build_buyer_zip(niche, output_dir=tmp_path)
    with zipfile.ZipFile(zip_path) as zf:
        pdfs = [n for n in zf.namelist() if n.endswith(".pdf")]
        assert len(pdfs) == 1
        data = zf.read(pdfs[0])
        assert data.startswith(b"%PDF-"), "not a PDF"
        assert len(data) > 500, "PDF suspiciously small"


def test_output_zip_named_by_poster_id(tmp_path: Path) -> None:
    niche = _make_niche(tmp_path)
    zip_path = build_buyer_zip(niche, output_dir=tmp_path)
    assert zip_path.name == "test-poster.zip"
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd projects/etsy-rooster-shop && python -m pytest tests/test_poster_bundle_builder.py -v 2>&1 | tail -5
```

Expected: collection fails with `ImportError: cannot import name 'build_buyer_zip'`.

- [ ] **Step 3: Implement the bundle builder**

Create `projects/etsy-rooster-shop/src/etsy_rooster/posters/bundle_builder.py`:

```python
"""Build the buyer-facing ZIP: 5 print sizes (300 DPI JPG) + 1 instructions PDF."""

from __future__ import annotations

import io
import zipfile
from pathlib import Path

from PIL import Image
from reportlab.lib.pagesizes import LETTER
from reportlab.lib.units import inch
from reportlab.pdfgen.canvas import Canvas

from etsy_rooster.posters.niche import PosterNiche

# Five print sizes. Each value is (width_px, height_px) at 300 DPI.
POSTER_SIZES: dict[str, tuple[int, int]] = {
    "8x10":  (2400, 3000),   # 4:5
    "11x14": (3300, 4200),   # ~11:14
    "16x20": (4800, 6000),   # 4:5
    "18x24": (5400, 7200),   # 3:4 — matches master aspect
    "A4":    (2480, 3508),   # ~3:4.24 (slightly taller than 3:4)
}

_JPG_QUALITY = 92


def _center_crop_to_aspect(im: Image.Image, target_w: int, target_h: int) -> Image.Image:
    """Center-crop `im` to the (target_w, target_h) aspect ratio without resizing."""
    target_ratio = target_w / target_h
    src_ratio = im.width / im.height
    if abs(src_ratio - target_ratio) < 1e-4:
        return im  # same aspect already
    if src_ratio > target_ratio:
        # source is wider — crop horizontally
        new_w = int(round(im.height * target_ratio))
        x0 = (im.width - new_w) // 2
        return im.crop((x0, 0, x0 + new_w, im.height))
    # source is taller — crop vertically
    new_h = int(round(im.width / target_ratio))
    y0 = (im.height - new_h) // 2
    return im.crop((0, y0, im.width, y0 + new_h))


def _render_size_jpg(master: Image.Image, target_w: int, target_h: int) -> bytes:
    cropped = _center_crop_to_aspect(master, target_w, target_h)
    resized = cropped.resize((target_w, target_h), Image.Resampling.LANCZOS)
    buf = io.BytesIO()
    resized.save(buf, format="JPEG", quality=_JPG_QUALITY, dpi=(300, 300))
    return buf.getvalue()


def _render_instructions_pdf() -> bytes:
    """Build the static print-instructions PDF (same content for every poster)."""
    buf = io.BytesIO()
    c = Canvas(buf, pagesize=LETTER)
    width, height = LETTER
    margin = 0.75 * inch
    cy = height - margin

    c.setFont("Helvetica-Bold", 18)
    c.drawString(margin, cy, "Thank you for your purchase — Pocket Rooster Press")
    cy -= 28

    c.setFont("Helvetica-Bold", 12)
    c.drawString(margin, cy, "Your download includes")
    cy -= 18

    c.setFont("Helvetica", 11)
    for line in [
        "  - 8 x 10 in",
        "  - 11 x 14 in",
        "  - 16 x 20 in",
        "  - 18 x 24 in",
        "  - A4 (21 x 29.7 cm)",
        "",
        "All files are 300 DPI JPG, ready for home or commercial printing.",
    ]:
        c.drawString(margin, cy, line)
        cy -= 16

    cy -= 8
    c.setFont("Helvetica-Bold", 12)
    c.drawString(margin, cy, "How to print")
    cy -= 18
    c.setFont("Helvetica", 11)
    for line in [
        "  - At home: print the JPG at the listed size on photo paper or matte cardstock.",
        "  - Online services: upload the file to Walmart Photo, Costco Photo, Snapfish,",
        "      Mpix, or your preferred print shop.",
        "  - Local print shops: most copy shops can print up to 18 x 24.",
    ]:
        c.drawString(margin, cy, line)
        cy -= 16

    cy -= 8
    c.setFont("Helvetica-Bold", 12)
    c.drawString(margin, cy, "License")
    cy -= 18
    c.setFont("Helvetica", 11)
    for line in [
        "  For personal use only. Not for resale or commercial use.",
        "  Designs are created with AI image tools and refined for clean printing,",
        "  disclosed per Etsy's 2024 listing-quality policy.",
    ]:
        c.drawString(margin, cy, line)
        cy -= 16

    c.save()
    return buf.getvalue()


def build_buyer_zip(niche: PosterNiche, output_dir: Path) -> Path:
    """Bundle 5 JPGs + 1 instructions PDF into <output_dir>/<poster_id>.zip."""
    output_dir.mkdir(parents=True, exist_ok=True)
    zip_path = output_dir / f"{niche.poster_id}.zip"

    with Image.open(niche.master_png_path) as raw:
        master = raw.convert("RGB")

    instructions_pdf = _render_instructions_pdf()

    with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        for size_label, (w, h) in POSTER_SIZES.items():
            jpg_bytes = _render_size_jpg(master, w, h)
            zf.writestr(f"{size_label}.jpg", jpg_bytes)
        zf.writestr("print_instructions.pdf", instructions_pdf)

    return zip_path
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd projects/etsy-rooster-shop && python -m pytest tests/test_poster_bundle_builder.py -v 2>&1 | tail -10
```

Expected: 5 tests PASS. If the 16x20 or 18x24 tests are slow (Pillow LANCZOS upscale on the 6000×something canvas takes a moment), that's fine — they should finish within a few seconds.

- [ ] **Step 5: Commit**

```bash
git -C projects/etsy-rooster-shop add src/etsy_rooster/posters/bundle_builder.py tests/test_poster_bundle_builder.py
git -C projects/etsy-rooster-shop commit -m "$(cat <<'EOF'
feat(posters): bundle_builder.build_buyer_zip — 5 JPGs + instructions PDF

Center-crops the 3:4 master to each target aspect, upscales via
LANCZOS, saves at 300 DPI JPG quality=92. Static one-page
instructions PDF rendered with reportlab. All packaged into
<poster_id>.zip.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: `preview_builder.build_previews()` — 3 Etsy preview JPGs

**Files:**
- Create: `projects/etsy-rooster-shop/src/etsy_rooster/posters/preview_builder.py`
- Create: `projects/etsy-rooster-shop/tests/test_poster_preview_builder.py`

- [ ] **Step 1: Write the failing tests**

Create `projects/etsy-rooster-shop/tests/test_poster_preview_builder.py`:

```python
from __future__ import annotations

from pathlib import Path

from PIL import Image

from etsy_rooster.posters.niche import PosterNiche
from etsy_rooster.posters.preview_builder import build_previews


def _make_niche(tmp_path: Path) -> PosterNiche:
    img = Image.new("RGB", (3072, 4096), (250, 240, 220))
    master = tmp_path / "master.png"
    img.save(master, format="PNG")
    return PosterNiche(
        poster_id="test-poster",
        title="Test Poster",
        subtitle="Subtitle",
        style_description="Style",
        theme_tags=["a"],
        master_png_path=master,
    )


def test_builds_three_previews(tmp_path: Path) -> None:
    niche = _make_niche(tmp_path)
    out = tmp_path / "out"
    paths = build_previews(niche, out)
    assert len(paths) == 3
    for p in paths:
        assert p.is_file()
        assert p.suffix == ".jpg"


def test_previews_are_named_in_listing_order(tmp_path: Path) -> None:
    niche = _make_niche(tmp_path)
    out = tmp_path / "out"
    paths = build_previews(niche, out)
    names = [p.name for p in paths]
    assert names == [
        "preview_01_hero.jpg",
        "preview_02_sizes.jpg",
        "preview_03_crop.jpg",
    ]


def test_hero_preview_is_high_resolution(tmp_path: Path) -> None:
    niche = _make_niche(tmp_path)
    out = tmp_path / "out"
    paths = build_previews(niche, out)
    with Image.open(paths[0]) as im:
        # Hero is the master at ~2000-wide for Etsy.
        assert im.width >= 1500


def test_sizes_infographic_is_landscape_or_square(tmp_path: Path) -> None:
    niche = _make_niche(tmp_path)
    out = tmp_path / "out"
    paths = build_previews(niche, out)
    with Image.open(paths[1]) as im:
        # The sizes panel is rendered wider-than-tall (text labels read horizontally).
        assert im.width >= im.height
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd projects/etsy-rooster-shop && python -m pytest tests/test_poster_preview_builder.py -v 2>&1 | tail -5
```

Expected: collection fails with `ImportError: cannot import name 'build_previews' from 'etsy_rooster.posters.preview_builder'`.

- [ ] **Step 3: Implement the preview builder**

Create `projects/etsy-rooster-shop/src/etsy_rooster/posters/preview_builder.py`:

```python
"""Compose 3 Etsy preview JPGs for one printable poster.

Outputs (in order):
  preview_01_hero.jpg   -- master at ~2000-wide (Etsy hero shot)
  preview_02_sizes.jpg  -- landscape infographic listing the 5 included sizes
  preview_03_crop.jpg   -- ~50% center crop showing texture / line quality
"""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

from etsy_rooster.posters.bundle_builder import POSTER_SIZES
from etsy_rooster.posters.niche import PosterNiche

HERO_LONG_SIDE_PX = 2000
SIZES_PANEL_PX = (2000, 1500)
CROP_LONG_SIDE_PX = 2000
BG = (250, 240, 220)
INK = (40, 40, 40)


def build_previews(niche: PosterNiche, output_dir: Path) -> list[Path]:
    output_dir.mkdir(parents=True, exist_ok=True)
    with Image.open(niche.master_png_path) as raw:
        master = raw.convert("RGB")

    paths = [
        _build_hero(master, output_dir),
        _build_sizes_panel(output_dir),
        _build_center_crop(master, output_dir),
    ]
    return paths


def _build_hero(master: Image.Image, output_dir: Path) -> Path:
    scale = HERO_LONG_SIDE_PX / max(master.width, master.height)
    new_w = max(1, int(round(master.width * scale)))
    new_h = max(1, int(round(master.height * scale)))
    im = master.resize((new_w, new_h), Image.Resampling.LANCZOS)
    out = output_dir / "preview_01_hero.jpg"
    im.save(out, format="JPEG", quality=92, dpi=(72, 72))
    return out


def _build_sizes_panel(output_dir: Path) -> Path:
    """Render a tidy landscape infographic listing the 5 print sizes."""
    panel_w, panel_h = SIZES_PANEL_PX
    im = Image.new("RGB", (panel_w, panel_h), BG)
    draw = ImageDraw.Draw(im)
    title_font = _load_font(96)
    body_font = _load_font(64)

    draw.text((panel_w // 2, 140), "5 print sizes included", font=title_font,
              fill=INK, anchor="mm")
    draw.text((panel_w // 2, 240), "All 300 DPI JPG", font=body_font,
              fill=INK, anchor="mm")

    # Five evenly-spaced rows
    labels = [
        ("8 x 10 in",   "2400 x 3000 px"),
        ("11 x 14 in",  "3300 x 4200 px"),
        ("16 x 20 in",  "4800 x 6000 px"),
        ("18 x 24 in",  "5400 x 7200 px"),
        ("A4",          "2480 x 3508 px"),
    ]
    row_h = (panel_h - 360) // len(labels)
    y0 = 360
    for i, (size_label, px_label) in enumerate(labels):
        y = y0 + i * row_h
        draw.text((panel_w // 4, y), size_label, font=body_font, fill=INK, anchor="mm")
        draw.text((3 * panel_w // 4, y), px_label, font=body_font, fill=INK, anchor="mm")

    out = output_dir / "preview_02_sizes.jpg"
    im.save(out, format="JPEG", quality=92, dpi=(72, 72))
    return out


def _build_center_crop(master: Image.Image, output_dir: Path) -> Path:
    """Center crop at ~50% scale showing detail / texture."""
    crop_w = master.width // 2
    crop_h = master.height // 2
    x0 = (master.width - crop_w) // 2
    y0 = (master.height - crop_h) // 2
    cropped = master.crop((x0, y0, x0 + crop_w, y0 + crop_h))
    scale = CROP_LONG_SIDE_PX / max(cropped.width, cropped.height)
    new_w = max(1, int(round(cropped.width * scale)))
    new_h = max(1, int(round(cropped.height * scale)))
    im = cropped.resize((new_w, new_h), Image.Resampling.LANCZOS)
    out = output_dir / "preview_03_crop.jpg"
    im.save(out, format="JPEG", quality=92, dpi=(72, 72))
    return out


def _load_font(size: int) -> ImageFont.FreeTypeFont:
    """Best-effort font load — falls back to Pillow's default if no TTF found."""
    # Try a small set of likely Windows / cross-platform fonts.
    for candidate in ("arial.ttf", "DejaVuSans.ttf", "LiberationSans-Regular.ttf"):
        try:
            return ImageFont.truetype(candidate, size=size)
        except OSError:
            continue
    return ImageFont.load_default()
```

Note: the font fallback to `load_default()` returns a tiny bitmap font — the infographic will be ugly without a real TTF available, but the test only asserts the file exists with the right name + landscape orientation, so this is fine for v1. In production, the user's Windows machine has `arial.ttf` available at the system path Pillow searches by default.

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd projects/etsy-rooster-shop && python -m pytest tests/test_poster_preview_builder.py -v 2>&1 | tail -8
```

Expected: 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git -C projects/etsy-rooster-shop add src/etsy_rooster/posters/preview_builder.py tests/test_poster_preview_builder.py
git -C projects/etsy-rooster-shop commit -m "$(cat <<'EOF'
feat(posters): preview_builder.build_previews — 3 Etsy preview JPGs

Hero (resized master), sizes infographic (5 rows labelled), center
crop (detail shot). All 92-quality JPG. Font load is best-effort
with default-bitmap fallback so tests pass on bare CI hosts.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: `poster-prompt.md` for the LLM listing author

**Files:**
- Create: `projects/etsy-rooster-shop/src/etsy_rooster/listing_authoring/prompts/poster-prompt.md`
- Modify: `projects/etsy-rooster-shop/tests/test_listing_authoring.py`

- [ ] **Step 1: Write the failing test**

Open `projects/etsy-rooster-shop/tests/test_listing_authoring.py` and append (or add a new test in the same style as existing ones — look for `def test_` with `niche="coloring"` for the closest mirror):

```python
def test_loads_poster_prompt_when_niche_is_poster(tmp_path: Path) -> None:
    """LLMListingAuthor resolves prompts_dir/poster-prompt.md for niche="poster"."""
    from etsy_rooster.listing_authoring.author import LLMListingAuthor

    prompts_dir = (
        Path(__file__).resolve().parent.parent
        / "src" / "etsy_rooster" / "listing_authoring" / "prompts"
    )
    poster_prompt = prompts_dir / "poster-prompt.md"
    assert poster_prompt.is_file(), f"missing poster prompt template: {poster_prompt}"

    class _CapturingClient:
        def __init__(self) -> None:
            self.system: str | None = None
            self.user: str | None = None

        def complete_json(self, *, system: str, user: str):
            self.system = system
            self.user = user
            return {
                "title": "Test poster title with cottagecore mushroom print 60chars",
                "tags": ["a"] * 13,
                "description": (
                    "Test description that mentions 8x10 11x14 16x20 18x24 A4 300 DPI "
                    "instant download. Designs are created with AI image tools and "
                    "refined for clean printing, disclosed per Etsy's 2024 listing-"
                    "quality policy. For personal use only. Not for resale or "
                    "commercial use."
                ),
                "price_usd": 8.99,
                "materials": ["JPG", "PDF", "Digital Download", "AI Art"],
            }

    client = _CapturingClient()
    author = LLMListingAuthor(llm=client, prompts_dir=prompts_dir)
    summary = {
        "poster_id": "p1",
        "title": "Cottagecore Mushroom Print",
        "subtitle": "Botanical wall print",
        "style_description": "Soft watercolor",
        "theme_tags": ["cottagecore", "mushroom print", "botanical art"],
    }
    draft = author.author(niche="poster", artifact_summary=summary)
    assert draft.title.startswith("Test poster title")
    # Confirm the system prompt came from poster-prompt.md (not coloring-prompt.md)
    assert "wall art" in client.system.lower() or "poster" in client.system.lower()
```

If `tests/test_listing_authoring.py` doesn't import `Path`, add `from pathlib import Path` at the top alongside other imports.

- [ ] **Step 2: Run test to verify it fails**

```bash
cd projects/etsy-rooster-shop && python -m pytest tests/test_listing_authoring.py::test_loads_poster_prompt_when_niche_is_poster -v 2>&1 | tail -5
```

Expected: FAIL with `assert poster_prompt.is_file()` (the template file doesn't exist yet).

- [ ] **Step 3: Create the prompt template**

Create `projects/etsy-rooster-shop/src/etsy_rooster/listing_authoring/prompts/poster-prompt.md`:

```markdown
# System

You write Etsy listings for printable digital wall-art posters published by
Pocket Rooster Press. The shop sells instant-download high-resolution prints
in a ZIP containing 5 standard sizes (8x10, 11x14, 16x20, 18x24, A4) plus a
printing-instructions PDF. Voice: warm, gallery-confident, slightly poetic.

Return a single JSON object with these exact keys:
  title (string, <= 140 chars, keyword-front-loaded; MUST include at least
         3 entries from artifact_summary.theme_tags verbatim; include the
         phrase "Printable Wall Art" or "Digital Poster" once)
  tags (array of exactly 13 strings, each <= 20 chars, lowercase, no commas,
        no duplicates; prioritize entries from artifact_summary.theme_tags)
  description (string, 6-10 sentences. MUST include: the 5 size names from
               the bundle (8x10, 11x14, 16x20, 18x24, A4) + "300 DPI" +
               "instant download" + a brief framing/printing suggestion +
               the AI disclosure sentence: "Designs are created with AI
               image tools and refined for clean printing, disclosed per
               Etsy's 2024 listing-quality policy." + the license note:
               "For personal use only. Not for resale or commercial use.")
  price_usd (number between 7.0 and 12.0; default to 8.99 if unsure)
  materials (array; MUST include "JPG", "PDF", "Digital Download", and "AI Art")

# User

Niche: {niche}
Artifact summary: {artifact_summary_json}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd projects/etsy-rooster-shop && python -m pytest tests/test_listing_authoring.py::test_loads_poster_prompt_when_niche_is_poster -v 2>&1 | tail -5
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git -C projects/etsy-rooster-shop add src/etsy_rooster/listing_authoring/prompts/poster-prompt.md tests/test_listing_authoring.py
git -C projects/etsy-rooster-shop commit -m "$(cat <<'EOF'
feat(posters): poster-prompt.md for Gemini-authored listing copy

LLMListingAuthor already routes to {niche}-prompt.md, so adding
this file is all the wiring posters need. Title rule includes
the "Printable Wall Art" / "Digital Poster" phrase; description
requires all 5 size names + 300 DPI + AI disclosure.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Widen `PublishOrchestrator` allowlist to include `"zip"`

**Files:**
- Modify: `projects/etsy-rooster-shop/src/etsy_rooster/publish/orchestrator.py:52`
- Modify: `projects/etsy-rooster-shop/tests/test_publish_orchestrator.py`

- [ ] **Step 1: Write the failing test**

Append to `projects/etsy-rooster-shop/tests/test_publish_orchestrator.py`:

```python
def test_publish_accepts_zip_primary_file(
    in_memory_db: "sqlite3.Connection", tmp_path: Path
) -> None:
    """ZIP files are valid primary digital downloads (posters)."""
    db = CatalogDB(in_memory_db)
    db.init_schema()
    sku_id = db.create_sku(niche="poster", params={"poster_id": "test-p"})
    zip_path = tmp_path / "p.zip"
    zip_path.write_bytes(b"PK\x03\x04")  # ZIP signature
    png = tmp_path / "preview.png"
    png.write_bytes(b"\x89PNG\r\n\x1a\nx")
    db.attach_artifact_file(sku_id, kind="zip", path=str(zip_path))
    db.attach_artifact_file(sku_id, kind="preview_png", path=str(png))
    db.set_listing_metadata(
        sku_id,
        title="Test Poster Title with three theme tag words minimum here",
        tags=["t"] * 13,
        description="d",
        price_usd=8.99,
        materials=["JPG", "PDF", "Digital Download", "AI Art"],
    )

    etsy = MagicMock()
    etsy.create_draft_listing.return_value = {"listing_id": 111, "state": "draft"}
    etsy.upload_listing_image.return_value = {"listing_image_id": 1}
    etsy.upload_digital_file.return_value = {"listing_file_id": 1}

    orch = PublishOrchestrator(db=db, etsy=etsy, taxonomy_id=2078)
    listing_id = orch.publish(sku_id)
    assert listing_id == 111
    etsy.upload_digital_file.assert_called_once()
    # The uploaded path is the ZIP
    args, kwargs = etsy.upload_digital_file.call_args
    assert str(kwargs["file_path"]).endswith("p.zip")
```

The `import sqlite3` line should already be at the top of the file; if not, add it. The `Path` and `MagicMock` imports are also already there.

- [ ] **Step 2: Run test to verify it fails**

```bash
cd projects/etsy-rooster-shop && python -m pytest tests/test_publish_orchestrator.py::test_publish_accepts_zip_primary_file -v 2>&1 | tail -5
```

Expected: FAIL with `RuntimeError: sku N missing primary artifact (svg or pdf) or preview_png`.

- [ ] **Step 3: Widen the allowlist**

Open `projects/etsy-rooster-shop/src/etsy_rooster/publish/orchestrator.py` and find line 52 (the `primary_files = [...]` filter). Change:

```python
        primary_files = [f for f in files if f["kind"] in ("svg", "pdf")]
```

to:

```python
        primary_files = [f for f in files if f["kind"] in ("svg", "pdf", "zip")]
```

Also update the error message immediately below (around line 55) from:

```python
            raise RuntimeError(
                f"sku {sku_id} missing primary artifact (svg or pdf) or preview_png"
            )
```

to:

```python
            raise RuntimeError(
                f"sku {sku_id} missing primary artifact (svg, pdf, or zip) or preview_png"
            )
```

- [ ] **Step 4: Run all orchestrator tests to verify pass + no regression**

```bash
cd projects/etsy-rooster-shop && python -m pytest tests/test_publish_orchestrator.py -v 2>&1 | tail -10
```

Expected: ALL orchestrator tests PASS (the pre-existing ones plus the new zip test).

- [ ] **Step 5: Commit**

```bash
git -C projects/etsy-rooster-shop add src/etsy_rooster/publish/orchestrator.py tests/test_publish_orchestrator.py
git -C projects/etsy-rooster-shop commit -m "$(cat <<'EOF'
feat(publish): orchestrator accepts zip as primary digital file (posters)

One-line allowlist extension — ("svg", "pdf") becomes ("svg",
"pdf", "zip"). Error message updated to match. Regression test
covers the zip path; existing svg + pdf tests still pass.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: CLI `generate poster --poster=<id>` + taxonomy entry

**Files:**
- Modify: `projects/etsy-rooster-shop/src/etsy_rooster/cli.py`
- Create: `projects/etsy-rooster-shop/tests/test_poster_cli.py`

- [ ] **Step 1: Write the failing test**

Create `projects/etsy-rooster-shop/tests/test_poster_cli.py`:

```python
from __future__ import annotations

import json
from pathlib import Path

import pytest
from click.testing import CliRunner
from PIL import Image

from etsy_rooster.cli import _taxonomy_for_niche, cli


def _seed_kdp_poster_fixture(tmp_path: Path, poster_id: str = "demo-p") -> Path:
    kdp = tmp_path / "kdp-puzzle-press"
    prompts_dir = kdp / "data" / "poster_prompts"
    prompts_dir.mkdir(parents=True)
    posters_dir = kdp / "assets" / "generated" / "posters" / poster_id
    posters_dir.mkdir(parents=True)
    (prompts_dir / f"{poster_id}.json").write_text(json.dumps({
        "poster_id": poster_id,
        "title": "Demo Poster",
        "subtitle": "Demo subtitle",
        "style_description": "Demo style",
        "theme_tags": ["a", "b", "c"],
        "style_preamble": "...",
        "subject": "...",
    }), encoding="utf-8")
    Image.new("RGB", (3072, 4096), (250, 240, 220)).save(
        posters_dir / "master.png", format="PNG",
    )
    return kdp


def test_taxonomy_for_poster_returns_2078() -> None:
    assert _taxonomy_for_niche("poster") == 2078


def test_taxonomy_unknown_niche_raises() -> None:
    with pytest.raises(Exception, match="No Etsy taxonomy"):
        _taxonomy_for_niche("nope")


def test_generate_poster_command_creates_sku_and_artifacts(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch,
) -> None:
    kdp = _seed_kdp_poster_fixture(tmp_path)
    monkeypatch.setenv("KDP_ASSETS_DIR", str(kdp))
    monkeypatch.setenv("ETSY_ROOSTER_DATA_DIR", str(tmp_path / "data"))

    runner = CliRunner()
    result = runner.invoke(cli, ["generate", "poster", "--poster=demo-p"])
    assert result.exit_code == 0, f"output={result.output!r}\nexc={result.exception!r}"
    assert "sku_id=" in result.output
    # ZIP + 3 previews should now exist on disk.
    out_dir = tmp_path / "data" / "posters" / "demo-p"
    assert (out_dir / "demo-p.zip").is_file()
    assert (out_dir / "preview_01_hero.jpg").is_file()
    assert (out_dir / "preview_02_sizes.jpg").is_file()
    assert (out_dir / "preview_03_crop.jpg").is_file()


def test_generate_poster_fails_clearly_for_unknown_id(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch,
) -> None:
    kdp = _seed_kdp_poster_fixture(tmp_path)
    monkeypatch.setenv("KDP_ASSETS_DIR", str(kdp))
    monkeypatch.setenv("ETSY_ROOSTER_DATA_DIR", str(tmp_path / "data"))

    runner = CliRunner()
    result = runner.invoke(cli, ["generate", "poster", "--poster=nope"])
    assert result.exit_code != 0
    assert "prompt JSON not found" in result.output or "PosterAssetError" in repr(result.exception)
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd projects/etsy-rooster-shop && python -m pytest tests/test_poster_cli.py -v 2>&1 | tail -10
```

Expected: collection or first test FAILS with either `KeyError: 'poster'` (taxonomy) or `Click usage error: No such command 'poster'`.

- [ ] **Step 3: Wire taxonomy + sub-command into cli.py**

Open `projects/etsy-rooster-shop/src/etsy_rooster/cli.py`.

(a) In the `_TAXONOMY_BY_NICHE` dict (lines ~24-30), append the poster entry. The dict becomes:

```python
_TAXONOMY_BY_NICHE: dict[str, int] = {
    # Craft Supplies & Tools > Patterns & How To > Patterns & Blueprints
    "mandala": 6343,
    # Same leaf as mandala — confirmed via live taxonomy walk; no more
    # specific coloring/printables leaf exists in Etsy's current taxonomy.
    "coloring": 6343,
    # Art & Collectibles > Prints > Digital Prints — distinct leaf for posters.
    "poster": 2078,
}
```

(b) Add the new sub-command. After the `generate_coloring` function (around line 117), add:

```python
@generate.command("poster")
@click.option(
    "--poster",
    "poster_id",
    required=True,
    help="Poster id (e.g. cottagecore-mushroom-poster-v1)",
)
def generate_poster(poster_id: str) -> None:
    """Package a Nano Banana Pro master PNG as an Etsy-ready poster SKU."""
    from etsy_rooster.posters.bundle_builder import build_buyer_zip
    from etsy_rooster.posters.kdp_importer import load_poster_niche
    from etsy_rooster.posters.preview_builder import build_previews

    niche = load_poster_niche(kdp_root=config.kdp_assets_dir(), poster_id=poster_id)
    out_dir = config.data_dir() / "posters" / poster_id
    out_dir.mkdir(parents=True, exist_ok=True)

    zip_path = build_buyer_zip(niche, out_dir)
    preview_paths = build_previews(niche, out_dir)

    db = _db()
    sku_id = db.create_sku(
        niche="poster",
        params={
            "poster_id": niche.poster_id,
            "title": niche.title,
            "subtitle": niche.subtitle,
            "style_description": niche.style_description,
            "theme_tags": niche.theme_tags,
        },
    )
    db.attach_artifact_file(sku_id, kind="zip", path=str(zip_path))
    for p in preview_paths:
        db.attach_artifact_file(sku_id, kind="preview_png", path=str(p))
    db.log_op(sku_id, event="generated", detail=f"poster_id={poster_id}")
    click.echo(f"sku_id={sku_id} poster={poster_id} zip={zip_path}")
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd projects/etsy-rooster-shop && python -m pytest tests/test_poster_cli.py -v 2>&1 | tail -10
```

Expected: 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git -C projects/etsy-rooster-shop add src/etsy_rooster/cli.py tests/test_poster_cli.py
git -C projects/etsy-rooster-shop commit -m "$(cat <<'EOF'
feat(cli): generate poster subcommand + poster -> 2078 taxonomy mapping

Adds 'etsy-rooster generate poster --poster=<id>' that mirrors
generate coloring. Builds buyer ZIP + 3 preview JPGs, creates a
poster SKU row, attaches zip + previews. Adds Etsy v3 taxonomy
2078 (Art & Collectibles > Prints > Digital Prints).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 11: Live integration test (`@pytest.mark.live`)

**Files:**
- Create: `projects/etsy-rooster-shop/tests/integration/test_e2e_poster.py`

- [ ] **Step 1: Write the live test**

Create `projects/etsy-rooster-shop/tests/integration/test_e2e_poster.py`:

```python
"""Live integration: full poster pipeline against the real Etsy API.

Skipped by default (marker 'live'). Requires:
  - .env.local with ETSY_KEYSTRING, ETSY_SHARED_SECRET, ETSY_SHOP_ID, GEMINI_API_KEY
  - ~/.etsy-rooster/token.json (run scripts/etsy_oauth_setup.py first)
  - KDP_ASSETS_DIR pointing at a real kdp-puzzle-press checkout
  - <kdp>/data/poster_prompts/cottagecore-mushroom-poster-v1.json present
  - <kdp>/assets/generated/posters/cottagecore-mushroom-poster-v1/master.png present
    (run: cd web.ui/backend && node scripts/generate_posters.mjs cottagecore-mushroom-poster-v1)

Creates a real DRAFT listing on PocketRoosterPress with the ZIP attached.
The test prints the listing_id. Delete manually after inspection.
"""

from __future__ import annotations

import os
import sqlite3
from pathlib import Path

import pytest
from dotenv import load_dotenv

_PROJECT_ROOT = Path(__file__).resolve().parents[2]
load_dotenv(_PROJECT_ROOT / ".env.local")
load_dotenv(_PROJECT_ROOT / ".env")

from etsy_rooster.catalog_db import CatalogDB, SkuState  # noqa: E402
from etsy_rooster.etsy.client import EtsyClient  # noqa: E402
from etsy_rooster.etsy.oauth import (  # noqa: E402
    EtsyOAuthConfig,
    TokenStore,
    refresh_token as do_refresh,
)
from etsy_rooster.listing_authoring.author import LLMListingAuthor  # noqa: E402
from etsy_rooster.listing_authoring.gemini_adapter import GeminiListingClient  # noqa: E402
from etsy_rooster.posters.bundle_builder import build_buyer_zip  # noqa: E402
from etsy_rooster.posters.kdp_importer import load_poster_niche  # noqa: E402
from etsy_rooster.posters.preview_builder import build_previews  # noqa: E402
from etsy_rooster.publish.orchestrator import PublishOrchestrator  # noqa: E402

pytestmark = pytest.mark.live

POSTER_ID = "cottagecore-mushroom-poster-v1"


@pytest.mark.skipif(
    not os.environ.get("ETSY_KEYSTRING")
    or not os.environ.get("ETSY_SHARED_SECRET")
    or not os.environ.get("ETSY_SHOP_ID")
    or not os.environ.get("GEMINI_API_KEY"),
    reason="Etsy + Gemini credentials not configured",
)
def test_end_to_end_one_poster_to_etsy_draft(tmp_path: Path) -> None:
    # 1. Import poster niche
    kdp_root = Path(
        os.environ.get("KDP_ASSETS_DIR")
        or _PROJECT_ROOT.parent / "kdp-puzzle-press"
    )
    niche = load_poster_niche(kdp_root=kdp_root, poster_id=POSTER_ID)

    # 2. Build buyer ZIP + 3 previews
    zip_path = build_buyer_zip(niche, tmp_path)
    preview_paths = build_previews(niche, tmp_path)
    assert zip_path.is_file()
    assert len(preview_paths) == 3

    # 3. DB + SKU
    conn = sqlite3.connect(":memory:")
    db = CatalogDB(conn)
    db.init_schema()
    sku_id = db.create_sku(
        niche="poster",
        params={
            "poster_id": niche.poster_id,
            "title": niche.title,
            "subtitle": niche.subtitle,
            "style_description": niche.style_description,
            "theme_tags": niche.theme_tags,
        },
    )
    db.attach_artifact_file(sku_id, kind="zip", path=str(zip_path))
    for p in preview_paths:
        db.attach_artifact_file(sku_id, kind="preview_png", path=str(p))

    # 4. Author metadata via real Gemini
    prompts_dir = (
        _PROJECT_ROOT / "src" / "etsy_rooster" / "listing_authoring" / "prompts"
    )
    summary = {
        "poster_id": niche.poster_id,
        "title": niche.title,
        "subtitle": niche.subtitle,
        "style_description": niche.style_description,
        "theme_tags": niche.theme_tags,
    }
    author = LLMListingAuthor(llm=GeminiListingClient(), prompts_dir=prompts_dir)
    draft = author.author(niche="poster", artifact_summary=summary)
    db.set_listing_metadata(
        sku_id,
        title=draft.title,
        tags=draft.tags,
        description=draft.description,
        price_usd=draft.price_usd,
        materials=draft.materials,
    )

    # 5. Publish via real Etsy API (refresh token if expired)
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
    orch = PublishOrchestrator(db=db, etsy=etsy, taxonomy_id=2078)
    listing_id = orch.publish(sku_id)

    # 6. Verify
    assert listing_id > 0
    assert db.current_state(sku_id) is SkuState.STAGED
    fetched = etsy.get_listing(listing_id)
    assert fetched["state"] == "draft"
    print(f"Created poster draft listing {listing_id}: {draft.title!r}")
    print(f"View at: https://www.etsy.com/your/shops/PocketRoosterPress/tools/listings/state:draft")
```

- [ ] **Step 2: Confirm it's skipped by default**

```bash
cd projects/etsy-rooster-shop && python -m pytest tests/integration/test_e2e_poster.py -v 2>&1 | tail -5
```

Expected: `1 deselected` (or `1 skipped`) because the default `addopts` filters out `live`-marked tests. If pytest collects + tries to run it, check `pyproject.toml`'s `addopts` setting.

- [ ] **Step 3: Commit**

```bash
git -C projects/etsy-rooster-shop add tests/integration/test_e2e_poster.py
git -C projects/etsy-rooster-shop commit -m "$(cat <<'EOF'
test(live): end-to-end poster -> Etsy draft listing

Mirrors test_e2e_coloring.py. Skipped by default via pytest 'live'
marker. Loads cottagecore mushroom poster, builds buyer ZIP + 3
previews, authors via real Gemini, publishes via real Etsy (with
OAuth refresh) to a draft listing, asserts state.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 12: Full regression — pytest suite + audit + live run

**Files:** none (this task is end-to-end verification + bundle).

- [ ] **Step 1: Run the entire unit test suite**

```bash
cd projects/etsy-rooster-shop && python -m pytest tests/ -v 2>&1 | tail -15
```

Expected: ALL non-live tests PASS. The total count should be ~110 (87 pre-existing + 22-23 new from this plan). Live tests are deselected.

- [ ] **Step 2: Run the live integration test (requires real credentials)**

This step uses real Etsy + Gemini APIs; it creates a real Etsy DRAFT listing and uses ~$0.04 of Gemini credit if the master.png isn't already on disk.

```bash
cd projects/etsy-rooster-shop && python -m pytest tests/integration/test_e2e_poster.py -v -m live -s 2>&1 | tail -20
```

Expected: PASS. The test prints the new draft listing's id and a dashboard URL. The poster SKU's state is `STAGED` in the DB.

If the test fails with a missing-credentials skip, ensure `.env.local` has all four env vars and that `~/.etsy-rooster/token.json` exists (run `scripts/etsy_oauth_setup.py` if not).

- [ ] **Step 3: Open the draft in the Etsy dashboard**

Visit the URL printed in Step 2. Manually verify:
- ZIP file is attached as the digital download
- 3 preview images are loaded (hero, sizes panel, center crop)
- Title is keyword-rich and includes "Printable Wall Art" or "Digital Poster"
- Description mentions all 5 size names + 300 DPI + AI disclosure
- Price is between $7.00 and $12.00

- [ ] **Step 4: Manually assign the listing to the "Printable Posters" section**

Etsy `shops_w` scope is not yet in our OAuth token, so section assignment is dashboard-only:
1. Click the draft listing
2. Scroll to "Shop section" → select "Printable Posters"
3. Save (still as draft — do not publish until you're ready)

- [ ] **Step 5: Update the checkpoint memory**

Open `C:\Users\marts\.claude\projects\c--Sandbox-AIProjectManagement-Rooster-AI-Project-Management\memory\etsy-rooster-shop-checkpoint.md` and:

(a) Bump the description line to mention Plan 2c (the first poster shipped).
(b) Under the "Active listings" line, increment the count and add the poster's listing id.
(c) Add a "Plan 2c (posters via Nano Banana Pro) shipped 2026-05-2X" entry to the date snapshot.

No git commit needed for the memory file (the memory directory is not a git repo).

- [ ] **Step 6: Final commit (kdp-puzzle-press has no changes; only inner repo needed)**

If `git -C projects/etsy-rooster-shop status -s` shows untracked or modified files unrelated to this plan, leave them alone (pre-existing user WIP). All Plan 2c commits were made per-task above; nothing else to commit at the end of this plan.

---

## Done criteria

- [ ] All 12 tasks checked off
- [ ] Full pytest suite green (~110 tests), no regressions in pre-existing tests
- [ ] Live integration test passes — real Etsy draft listing exists
- [ ] Listing manually assigned to "Printable Posters" shop section
- [ ] Checkpoint memory updated with Plan 2c shipped status
- [ ] Shop now has 3 product types live: coloring books + SVG cut files + posters

## Post-plan opportunities (out of scope for this plan)

- Plan 2c' fast-follow: ship 2-3 more posters using the same pipeline (~5 min each once the prompt JSON is written)
- Add `shops_w` OAuth scope so the section assignment can be programmatic (item 7 of Plan 2a deferred-debt list)
- 24×36 size in the buyer ZIP (requires a second Nano Banana Pro render with tighter framing)
- Lifestyle mockups (poster-in-frame Etsy shots) — manual photography or a future Nano Banana Pro composition prompt

## Related memories

- [[etsy-rooster-shop-checkpoint]] — current shop state; update at Task 12 Step 5
- [[kdp-catalog-status-2026-05-17]] — KDP catalog isn't touched by this plan but shares the kdp-puzzle-press asset tree
