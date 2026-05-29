# Etsy Rooster Shop â€” Plan 2e Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a `etsy-rooster generate video --sku-id=N` CLI that produces a 1:1 720Ã—720 MP4 from a SKU's existing assets, attaches it as a `kind="video"` artifact, and auto-uploads to the Etsy listing if one already exists.

**Architecture:** New `etsy_rooster.video/` subpackage (types/treatments/ffmpeg_renderer/builder) reads existing SKU artifacts and shells out to ffmpeg (binary bundled via `imageio-ffmpeg`). Adds `EtsyClient.upload_listing_video` (multipart POST), extends `PublishOrchestrator` to upload `kind="video"` artifacts during publish, and adds a `generate video` CLI command. Task 0 extracts the duplicated OAuth refresh logic into a shared helper before adding another inline copy.

**Tech Stack:** Python 3.11+, click (CLI), `imageio-ffmpeg` (bundled ffmpeg binary), subprocess for shell-out, pytest, Etsy Open API v3 for upload.

**Spec reference:** [`docs/superpowers/specs/2026-05-22-etsy-rooster-shop-plan-2e-design.md`](../specs/2026-05-22-etsy-rooster-shop-plan-2e-design.md)

---

## Pre-flight context (read once)

You are working in the nested git repo `projects/etsy-rooster-shop/` on `main`. Always use absolute paths in Bash and `git -C <abs-path> ...` for git commands (the Bash tool's CWD is not stable between calls).

**Run tests with:**
```bash
cd projects/etsy-rooster-shop
python -m pytest tests/ -q --no-cov          # full suite
python -m pytest tests/test_X.py -v --no-cov # one file
python -m pytest tests/ -m live -s --no-cov  # live tests (Etsy + Gemini)
```

**Invoke the CLI in tests** via Python (the `etsy-rooster` console script may not be on Git Bash PATH):
```python
from etsy_rooster.cli import cli
cli(['generate', 'video', '--sku-id=1'], standalone_mode=False)
```

**Baseline before starting:** the nested repo HEAD is `d586e52` (svglib preview fix). Run `python -m pytest tests/ -q --no-cov` and confirm 202 passed + 5 deselected. That's the count to grow from.

**Existing pieces this plan reuses unchanged:**
- `etsy_rooster.catalog_db.CatalogDB` â€” `kind="video"` is just another free-text artifact kind, no schema change
- `etsy_rooster.etsy.oauth.{TokenStore, EtsyOAuthConfig, refresh_token}` â€” Task 0 wraps these into the new helper
- `etsy_rooster.etsy.client.EtsyClient` â€” existing methods (`_with_retry`, `_post_multipart`, `_headers`) are reused by the new `upload_listing_video`
- `etsy_rooster.publish.orchestrator.PublishOrchestrator` â€” extended to also upload `kind="video"` artifacts (small addition, mirrors the existing image-upload loop)
- Listings DB column `etsy_listing_id` â€” already populated for the 3 existing SKUs

**Existing duplication to clean up (Task 0):**
The OAuth refresh dance â€” `if store.is_expired(): cfg = EtsyOAuthConfig(...); do_refresh(...); store.save(...); tokens = store.load()` â€” is inlined in 5 places:
1. `src/etsy_rooster/cli.py` (inside `publish` command, lines ~165-182)
2. `tests/integration/test_e2e_coloring.py` (lines ~113-131)
3. `tests/integration/test_e2e_themed_mandala.py` (the dance is in there too)
4. `tests/integration/test_e2e_poster.py` (same)
5. One more (will become 6th in Task 7's `builder.py`)

Task 0 extracts a single `ensure_fresh_token(store, env_or_cfg) -> dict` helper and replaces all 5 inline copies.

---

## Task 0: Extract `ensure_fresh_token(store, ...)` helper

**Files:**
- Create: `projects/etsy-rooster-shop/src/etsy_rooster/etsy/oauth.py` (extend existing file with new helper)
- Create: `projects/etsy-rooster-shop/tests/test_etsy_oauth_ensure_fresh.py`
- Modify: `projects/etsy-rooster-shop/src/etsy_rooster/cli.py` (replace inline dance with helper call)
- Modify: `projects/etsy-rooster-shop/tests/integration/test_e2e_coloring.py` (same)
- Modify: `projects/etsy-rooster-shop/tests/integration/test_e2e_themed_mandala.py` (same)
- Modify: `projects/etsy-rooster-shop/tests/integration/test_e2e_poster.py` (same)

- [x] **Step 1: Write failing tests for the new helper**

Create `projects/etsy-rooster-shop/tests/test_etsy_oauth_ensure_fresh.py`:

```python
from __future__ import annotations

import json
import time
from pathlib import Path
from unittest.mock import patch

import pytest

from etsy_rooster.etsy.oauth import (
    EtsyOAuthConfig,
    TokenStore,
    ensure_fresh_token,
)


def _write_token(path: Path, *, expires_in: int, refresh_token: str = "old-refresh") -> None:
    """Helper: write a token file with given expiry offset (seconds from now)."""
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(
            {
                "access_token": "current-access",
                "refresh_token": refresh_token,
                "expires_at": int(time.time()) + expires_in,
            }
        ),
        encoding="utf-8",
    )


@pytest.fixture
def cfg() -> EtsyOAuthConfig:
    return EtsyOAuthConfig(
        keystring="kk",
        shared_secret="ss",
        redirect_uri="http://localhost:3003/oauth/callback",
    )


def test_ensure_fresh_token_returns_existing_when_not_expired(
    tmp_path: Path, cfg: EtsyOAuthConfig
) -> None:
    """Token with 30 minutes left should be returned as-is without refresh."""
    token_path = tmp_path / "token.json"
    _write_token(token_path, expires_in=1800)  # 30 min from now
    store = TokenStore(path=token_path)

    with patch("etsy_rooster.etsy.oauth.refresh_token") as mock_refresh:
        tokens = ensure_fresh_token(store, cfg)

    assert tokens["access_token"] == "current-access"
    mock_refresh.assert_not_called()


def test_ensure_fresh_token_refreshes_when_expired(
    tmp_path: Path, cfg: EtsyOAuthConfig
) -> None:
    """Expired token triggers refresh, saves new tokens, returns refreshed."""
    token_path = tmp_path / "token.json"
    _write_token(token_path, expires_in=-60, refresh_token="old-refresh")  # expired
    store = TokenStore(path=token_path)

    with patch("etsy_rooster.etsy.oauth.refresh_token") as mock_refresh:
        mock_refresh.return_value = {
            "access_token": "new-access",
            "refresh_token": "new-refresh",
            "expires_in": 3600,
        }
        tokens = ensure_fresh_token(store, cfg)

    assert tokens["access_token"] == "new-access"
    mock_refresh.assert_called_once_with(cfg, refresh_token="old-refresh")
    # The new tokens were persisted
    saved = json.loads(token_path.read_text(encoding="utf-8"))
    assert saved["access_token"] == "new-access"
    assert saved["refresh_token"] == "new-refresh"


def test_ensure_fresh_token_preserves_old_refresh_when_etsy_omits_new(
    tmp_path: Path, cfg: EtsyOAuthConfig
) -> None:
    """If Etsy's refresh response doesn't include a new refresh_token,
    keep the old one (so we can refresh again later)."""
    token_path = tmp_path / "token.json"
    _write_token(token_path, expires_in=-60, refresh_token="old-refresh")
    store = TokenStore(path=token_path)

    with patch("etsy_rooster.etsy.oauth.refresh_token") as mock_refresh:
        mock_refresh.return_value = {
            "access_token": "new-access",
            "expires_in": 3600,
            # No refresh_token in response
        }
        tokens = ensure_fresh_token(store, cfg)

    assert tokens["refresh_token"] == "old-refresh"
```

- [x] **Step 2: Run tests to confirm failure**

```bash
cd /c/Sandbox/AIProjectManagement/Rooster-AI-Project-Management/projects/etsy-rooster-shop && python -m pytest tests/test_etsy_oauth_ensure_fresh.py -v --no-cov
```
Expected: 3 errors (`ImportError: cannot import name 'ensure_fresh_token'`).

- [x] **Step 3: Add the helper to `oauth.py`**

Append to `projects/etsy-rooster-shop/src/etsy_rooster/etsy/oauth.py`:

```python
def ensure_fresh_token(store: "TokenStore", cfg: "EtsyOAuthConfig") -> dict:
    """Load tokens from the store; refresh + save in place if expired.

    Returns the (possibly-refreshed) tokens dict. Used by every caller that
    needs a valid access_token to hit Etsy â€” extracting this avoids the
    5x-inlined refresh dance we accumulated through Plans 2a/2c/2d/2e.

    If Etsy's refresh response omits a new refresh_token (which happens
    sometimes), the old one is preserved.
    """
    tokens = store.load()
    if not store.is_expired():
        return tokens
    new = refresh_token(cfg, refresh_token=tokens["refresh_token"])
    store.save(
        access_token=new["access_token"],
        refresh_token=new.get("refresh_token", tokens["refresh_token"]),
        expires_in=int(new["expires_in"]),
    )
    return store.load()
```

- [x] **Step 4: Run helper tests to verify pass**

```bash
python -m pytest tests/test_etsy_oauth_ensure_fresh.py -v --no-cov
```
Expected: 3 passed.

- [x] **Step 5: Replace inline dance in `cli.py`**

In `projects/etsy-rooster-shop/src/etsy_rooster/cli.py`, find the `publish` command (around line 154). The current inline OAuth refresh block (around lines 162-182) looks like:

```python
    db = _db()
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
```

Replace with:

```python
    db = _db()
    cfg = EtsyOAuthConfig(
        keystring=os.environ["ETSY_KEYSTRING"],
        shared_secret=os.environ["ETSY_SHARED_SECRET"],
        redirect_uri=os.environ.get(
            "ETSY_REDIRECT_URI", "http://localhost:3003/oauth/callback"
        ),
    )
    tokens = ensure_fresh_token(TokenStore(), cfg)
```

And update the import line at the top of the publish command from:
```python
    from etsy_rooster.etsy.oauth import EtsyOAuthConfig, TokenStore
    from etsy_rooster.etsy.oauth import refresh_token as do_refresh
```
to:
```python
    from etsy_rooster.etsy.oauth import EtsyOAuthConfig, TokenStore, ensure_fresh_token
```

(The `do_refresh` import is no longer needed since the helper wraps it.)

- [x] **Step 6: Replace inline dance in the 3 live integration tests**

For each of:
- `tests/integration/test_e2e_coloring.py`
- `tests/integration/test_e2e_themed_mandala.py`
- `tests/integration/test_e2e_poster.py`

Find the block (it looks substantially the same in all three):
```python
    store = TokenStore()
    tokens = store.load()
    if store.is_expired():
        cfg = EtsyOAuthConfig(...)
        new = do_refresh(cfg, refresh_token=tokens["refresh_token"])
        store.save(...)
        tokens = store.load()
```

Replace with:
```python
    cfg = EtsyOAuthConfig(
        keystring=os.environ["ETSY_KEYSTRING"],
        shared_secret=os.environ["ETSY_SHARED_SECRET"],
        redirect_uri=os.environ.get(
            "ETSY_REDIRECT_URI", "http://localhost:3003/oauth/callback"
        ),
    )
    tokens = ensure_fresh_token(TokenStore(), cfg)
```

Update the imports in each test file from:
```python
from etsy_rooster.etsy.oauth import (
    EtsyOAuthConfig,
    TokenStore,
    refresh_token as do_refresh,
)
```
to:
```python
from etsy_rooster.etsy.oauth import (
    EtsyOAuthConfig,
    TokenStore,
    ensure_fresh_token,
)
```

(The actual layout of imports varies slightly between the 3 test files â€” keep your edit minimal, just replace `refresh_token as do_refresh` with `ensure_fresh_token` and drop the manual dance.)

- [x] **Step 7: Run the full suite to verify nothing regressed**

```bash
python -m pytest tests/ -q --no-cov 2>&1 | tail -3
```
Expected: 205 passed, 5 deselected (202 prior + 3 new tests for ensure_fresh_token). Note: the 3 live tests were deselected before AND are still deselected â€” they touch the helper at collection time (via import) but don't execute.

- [x] **Step 8: Commit**

```bash
git -C C:/Sandbox/AIProjectManagement/Rooster-AI-Project-Management/projects/etsy-rooster-shop add src/etsy_rooster/etsy/oauth.py src/etsy_rooster/cli.py tests/test_etsy_oauth_ensure_fresh.py tests/integration/test_e2e_coloring.py tests/integration/test_e2e_themed_mandala.py tests/integration/test_e2e_poster.py
git -C C:/Sandbox/AIProjectManagement/Rooster-AI-Project-Management/projects/etsy-rooster-shop commit -m "refactor(oauth): extract ensure_fresh_token helper (was 4x duplicated)"
```

---

## Task 1: Add `imageio-ffmpeg` dependency

**Files:**
- Modify: `projects/etsy-rooster-shop/pyproject.toml`

- [x] **Step 1: Add the dependency**

In `projects/etsy-rooster-shop/pyproject.toml`, find the `dependencies` array (around lines 14-25). Add `"imageio-ffmpeg>=0.5,<1",` to the list. The full section becomes:

```toml
dependencies = [
    "click>=8.1,<9",
    "requests>=2.32,<3",
    "requests-oauthlib>=2.0,<3",
    "python-dotenv>=1.0,<2",
    "anthropic>=0.40,<1",
    "google-generativeai>=0.8,<1",
    "Pillow>=11.0,<12",
    "reportlab>=4.2,<5",
    "pypdf>=5.0,<6",
    "lxml>=5.3,<7",
    "svglib>=1.5,<2",
    "imageio-ffmpeg>=0.5,<1",
]
```

- [x] **Step 2: Install the dep**

```bash
cd /c/Sandbox/AIProjectManagement/Rooster-AI-Project-Management/projects/etsy-rooster-shop && pip install -e ".[dev]" 2>&1 | tail -5
```
Expected: successfully installs imageio-ffmpeg (might also fetch its underlying ffmpeg binary; first install takes ~30s).

- [x] **Step 3: Smoke-test the bundled ffmpeg**

```bash
python -c "
from imageio_ffmpeg import get_ffmpeg_exe
import subprocess
ffmpeg = get_ffmpeg_exe()
print('ffmpeg binary:', ffmpeg)
r = subprocess.run([ffmpeg, '-version'], capture_output=True, text=True, timeout=15)
# Just print the first line of the version banner.
print(r.stdout.split('\n')[0])
"
```
Expected: prints path to bundled ffmpeg + a version line like `ffmpeg version N-XXX-...`.

- [x] **Step 4: Full suite still green**

```bash
python -m pytest tests/ -q --no-cov 2>&1 | tail -3
```
Expected: 205 passed, 5 deselected (unchanged from Task 0).

- [x] **Step 5: Commit**

```bash
git -C C:/Sandbox/AIProjectManagement/Rooster-AI-Project-Management/projects/etsy-rooster-shop add pyproject.toml
git -C C:/Sandbox/AIProjectManagement/Rooster-AI-Project-Management/projects/etsy-rooster-shop commit -m "feat(deps): add imageio-ffmpeg for Plan 2e video pipeline"
```

---

## Task 2: `VideoTreatment` dataclass

**Files:**
- Create: `projects/etsy-rooster-shop/src/etsy_rooster/video/__init__.py` (empty package marker)
- Create: `projects/etsy-rooster-shop/src/etsy_rooster/video/types.py`
- Create: `projects/etsy-rooster-shop/tests/test_video_types.py`

- [x] **Step 1: Write failing tests**

Create `projects/etsy-rooster-shop/tests/test_video_types.py`:

```python
from __future__ import annotations

from pathlib import Path

import pytest
from PIL import Image

from etsy_rooster.video.types import VideoTreatment


def _make_image(tmp_path: Path, name: str = "frame.png") -> Path:
    """Write a 100x100 PNG and return its path."""
    p = tmp_path / name
    Image.new("RGB", (100, 100), (255, 255, 255)).save(p)
    return p


def test_valid_treatment_construction(tmp_path: Path) -> None:
    frame = _make_image(tmp_path)
    t = VideoTreatment(frames=[frame], frame_duration_s=2.0, zoom=(1.0, 1.5))
    assert t.frames == [frame]
    assert t.frame_duration_s == 2.0
    assert t.zoom == (1.0, 1.5)
    assert t.output_size == (720, 720)  # default
    assert t.fps == 30  # default


def test_empty_frames_rejected() -> None:
    with pytest.raises(ValueError, match="at least one image"):
        VideoTreatment(frames=[], frame_duration_s=1.0, zoom=None)


def test_missing_frame_path_rejected(tmp_path: Path) -> None:
    with pytest.raises(ValueError, match="frame does not exist"):
        VideoTreatment(
            frames=[tmp_path / "missing.png"], frame_duration_s=1.0, zoom=None
        )


def test_zero_duration_rejected(tmp_path: Path) -> None:
    frame = _make_image(tmp_path)
    with pytest.raises(ValueError, match="frame_duration_s"):
        VideoTreatment(frames=[frame], frame_duration_s=0, zoom=None)


def test_negative_zoom_rejected(tmp_path: Path) -> None:
    frame = _make_image(tmp_path)
    with pytest.raises(ValueError, match="zoom factors"):
        VideoTreatment(frames=[frame], frame_duration_s=1.0, zoom=(-0.5, 1.0))


def test_non_square_output_rejected(tmp_path: Path) -> None:
    frame = _make_image(tmp_path)
    with pytest.raises(ValueError, match="square"):
        VideoTreatment(
            frames=[frame], frame_duration_s=1.0, zoom=None, output_size=(720, 1080)
        )


def test_invalid_fps_rejected(tmp_path: Path) -> None:
    frame = _make_image(tmp_path)
    with pytest.raises(ValueError, match="fps"):
        VideoTreatment(frames=[frame], frame_duration_s=1.0, zoom=None, fps=15)


def test_page_flip_no_zoom_accepted(tmp_path: Path) -> None:
    """Multi-frame treatment without zoom â€” used by coloring page-flip."""
    frames = [_make_image(tmp_path, f"f{i}.png") for i in range(5)]
    t = VideoTreatment(frames=frames, frame_duration_s=0.7, zoom=None)
    assert len(t.frames) == 5
    assert t.zoom is None
```

- [x] **Step 2: Run tests to confirm failure**

```bash
cd /c/Sandbox/AIProjectManagement/Rooster-AI-Project-Management/projects/etsy-rooster-shop && python -m pytest tests/test_video_types.py -v --no-cov
```
Expected: 8 errors (module `etsy_rooster.video.types` not found).

- [x] **Step 3: Create package marker**

Create `projects/etsy-rooster-shop/src/etsy_rooster/video/__init__.py`:

```python
"""Per-listing product video pipeline (Plan 2e)."""
```

- [x] **Step 4: Create the dataclass**

Create `projects/etsy-rooster-shop/src/etsy_rooster/video/types.py`:

```python
"""VideoTreatment dataclass â€” renderer-agnostic plan for one product video.

Each niche-specific treatment builder (in treatments.py) returns one of
these; the ffmpeg renderer (in ffmpeg_renderer.py) consumes it.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class VideoTreatment:
    """A renderer-agnostic plan for one product video.

    The ffmpeg renderer translates this into a concrete filtergraph:
      - Multi-frame (len(frames) > 1)        -> concat with hard cuts
      - Single-frame + zoom is not None      -> zoompan filter (Ken Burns)
      - Single-frame, no zoom                -> static frame held for the duration
    """

    frames: list[Path]
    frame_duration_s: float
    zoom: tuple[float, float] | None
    output_size: tuple[int, int] = (720, 720)
    fps: int = 30

    def __post_init__(self) -> None:
        if not self.frames:
            raise ValueError("frames must contain at least one image")
        for f in self.frames:
            if not f.is_file():
                raise ValueError(f"frame does not exist: {f}")
        if self.frame_duration_s <= 0:
            raise ValueError(
                f"frame_duration_s must be > 0, got {self.frame_duration_s}"
            )
        if self.zoom is not None:
            start, end = self.zoom
            if start <= 0 or end <= 0:
                raise ValueError(f"zoom factors must be > 0, got {self.zoom}")
        if self.output_size[0] != self.output_size[1]:
            raise ValueError(
                f"output_size must be square for Etsy, got {self.output_size}"
            )
        if self.fps not in (24, 30, 60):
            raise ValueError(f"fps must be 24/30/60, got {self.fps}")
```

- [x] **Step 5: Run tests, verify pass**

```bash
python -m pytest tests/test_video_types.py -v --no-cov
```
Expected: 8 passed.

- [x] **Step 6: Full suite**

```bash
python -m pytest tests/ -q --no-cov 2>&1 | tail -3
```
Expected: 213 passed, 5 deselected (205 prior + 8 new).

- [x] **Step 7: Commit**

```bash
git -C C:/Sandbox/AIProjectManagement/Rooster-AI-Project-Management/projects/etsy-rooster-shop add src/etsy_rooster/video/__init__.py src/etsy_rooster/video/types.py tests/test_video_types.py
git -C C:/Sandbox/AIProjectManagement/Rooster-AI-Project-Management/projects/etsy-rooster-shop commit -m "feat(video): VideoTreatment dataclass with validation"
```

---

## Task 3: ffmpeg renderer

**Files:**
- Create: `projects/etsy-rooster-shop/src/etsy_rooster/video/ffmpeg_renderer.py`
- Create: `projects/etsy-rooster-shop/tests/test_video_ffmpeg_renderer.py`

- [x] **Step 1: Write failing tests**

Create `projects/etsy-rooster-shop/tests/test_video_ffmpeg_renderer.py`:

```python
from __future__ import annotations

from pathlib import Path

import pytest
from PIL import Image

from etsy_rooster.video.ffmpeg_renderer import render
from etsy_rooster.video.types import VideoTreatment


def _make_image(tmp_path: Path, name: str, size: tuple[int, int] = (800, 1066)) -> Path:
    """Portrait 3:4 PNG for poster-like fixtures."""
    p = tmp_path / name
    Image.new("RGB", size, (200, 180, 160)).save(p)
    return p


def _is_mp4(path: Path) -> bool:
    """Check that the file starts with the MP4 'ftyp' box signature."""
    if not path.is_file() or path.stat().st_size < 100:
        return False
    head = path.read_bytes()[:12]
    # An MP4 starts with a 4-byte size, then 'ftyp', then a brand
    return head[4:8] == b"ftyp"


def test_render_zoom_treatment_produces_mp4(tmp_path: Path) -> None:
    frame = _make_image(tmp_path, "master.png")
    t = VideoTreatment(
        frames=[frame], frame_duration_s=2.0, zoom=(1.0, 1.5)
    )
    out = tmp_path / "out.mp4"
    render(t, out)
    assert _is_mp4(out), f"output is not a valid MP4: {out}"


def test_render_page_flip_treatment_produces_mp4(tmp_path: Path) -> None:
    """Multi-frame concat path."""
    frames = [_make_image(tmp_path, f"page_{i:02d}.png") for i in range(3)]
    t = VideoTreatment(frames=frames, frame_duration_s=0.7, zoom=None)
    out = tmp_path / "pages.mp4"
    render(t, out)
    assert _is_mp4(out)


def test_render_static_treatment_produces_mp4(tmp_path: Path) -> None:
    """Single-frame, no zoom â€” static hold."""
    frame = _make_image(tmp_path, "static.png")
    t = VideoTreatment(frames=[frame], frame_duration_s=3.0, zoom=None)
    out = tmp_path / "static.mp4"
    render(t, out)
    assert _is_mp4(out)


def test_render_creates_parent_dir(tmp_path: Path) -> None:
    frame = _make_image(tmp_path, "master.png")
    t = VideoTreatment(frames=[frame], frame_duration_s=1.0, zoom=None)
    out = tmp_path / "nested" / "subdir" / "out.mp4"
    render(t, out)
    assert out.is_file()


def test_render_raises_when_ffmpeg_fails(tmp_path: Path) -> None:
    """If ffmpeg returns non-zero, render raises subprocess.CalledProcessError."""
    import subprocess

    # Construct a treatment with a path that exists but isn't a real image.
    # ffmpeg will refuse to decode it.
    bogus = tmp_path / "not-actually-an-image.png"
    bogus.write_text("this is not a png", encoding="utf-8")
    t = VideoTreatment(frames=[bogus], frame_duration_s=1.0, zoom=None)

    with pytest.raises(subprocess.CalledProcessError):
        render(t, tmp_path / "out.mp4")
```

- [x] **Step 2: Run tests to confirm failure**

```bash
python -m pytest tests/test_video_ffmpeg_renderer.py -v --no-cov
```
Expected: 5 errors (module not found).

- [x] **Step 3: Implement the renderer**

Create `projects/etsy-rooster-shop/src/etsy_rooster/video/ffmpeg_renderer.py`:

```python
"""ffmpeg-based video renderer for VideoTreatments.

Shells out to the binary bundled by imageio-ffmpeg (no system install
required). Three internal code paths:
  - multi-frame (len > 1)   -> concat filtergraph with hard cuts
  - single-frame + zoom     -> zoompan filter (Ken Burns)
  - single-frame, no zoom   -> static hold
"""

from __future__ import annotations

import subprocess
from pathlib import Path

from imageio_ffmpeg import get_ffmpeg_exe

from etsy_rooster.video.types import VideoTreatment


def render(treatment: VideoTreatment, output_path: Path) -> None:
    """Render the treatment to an MP4 file via ffmpeg.

    Output: H.264, yuv420p, no audio, treatment.fps fps, treatment.output_size
    square. Raises subprocess.CalledProcessError if ffmpeg fails.
    """
    output_path.parent.mkdir(parents=True, exist_ok=True)
    ffmpeg = get_ffmpeg_exe()

    if len(treatment.frames) > 1:
        cmd = _build_page_flip_cmd(treatment, output_path, ffmpeg)
    elif treatment.zoom is not None:
        cmd = _build_zoom_cmd(treatment, output_path, ffmpeg)
    else:
        cmd = _build_static_cmd(treatment, output_path, ffmpeg)

    subprocess.run(cmd, check=True, capture_output=True, text=True)


def _build_zoom_cmd(
    treatment: VideoTreatment, out: Path, ffmpeg: str
) -> list[str]:
    """Single-frame Ken Burns zoom via the zoompan filter."""
    assert treatment.zoom is not None
    start_z, end_z = treatment.zoom
    duration_frames = max(int(treatment.frame_duration_s * treatment.fps), 2)
    w, h = treatment.output_size
    src = treatment.frames[0]
    # zoompan increments by 'on' (frame number) from 0 to duration_frames-1.
    zoom_expr = f"{start_z}+({end_z}-{start_z})*on/{duration_frames - 1}"
    # Scale + center-crop the input to a square 4x larger than output so the
    # zoom doesn't reveal raw pixels (zoompan upsamples from the input plane).
    pre = f"scale={w * 4}:{h * 4}:force_original_aspect_ratio=increase,crop={w * 4}:{h * 4}"
    filter_complex = (
        f"[0:v]{pre},"
        f"zoompan=z='{zoom_expr}':d={duration_frames}:s={w}x{h}:fps={treatment.fps}"
    )
    return [
        ffmpeg, "-y",
        "-loop", "1", "-i", str(src),
        "-filter_complex", filter_complex,
        "-c:v", "libx264", "-pix_fmt", "yuv420p",
        "-t", f"{treatment.frame_duration_s:.2f}",
        "-r", str(treatment.fps),
        "-movflags", "+faststart",
        str(out),
    ]


def _build_page_flip_cmd(
    treatment: VideoTreatment, out: Path, ffmpeg: str
) -> list[str]:
    """Multi-frame concat with hard cuts.

    Each frame becomes a still-loop input; the concat filter joins them.
    Each input is scaled to fit the output size with white padding (the
    source images are usually portrait coloring pages; this letterboxes
    them into the square output).
    """
    w, h = treatment.output_size
    args: list[str] = [ffmpeg, "-y"]
    for frame in treatment.frames:
        args += [
            "-loop", "1",
            "-t", f"{treatment.frame_duration_s:.2f}",
            "-i", str(frame),
        ]
    n = len(treatment.frames)
    scale_chains = "".join(
        f"[{i}:v]scale={w}:{h}:force_original_aspect_ratio=decrease,"
        f"pad={w}:{h}:(ow-iw)/2:(oh-ih)/2:color=white,setsar=1[v{i}];"
        for i in range(n)
    )
    concat_inputs = "".join(f"[v{i}]" for i in range(n))
    filter_complex = f"{scale_chains}{concat_inputs}concat=n={n}:v=1:a=0[out]"
    args += [
        "-filter_complex", filter_complex,
        "-map", "[out]",
        "-c:v", "libx264", "-pix_fmt", "yuv420p",
        "-r", str(treatment.fps),
        "-movflags", "+faststart",
        str(out),
    ]
    return args


def _build_static_cmd(
    treatment: VideoTreatment, out: Path, ffmpeg: str
) -> list[str]:
    """Single-frame static hold (no zoom)."""
    w, h = treatment.output_size
    return [
        ffmpeg, "-y",
        "-loop", "1", "-i", str(treatment.frames[0]),
        "-vf",
        (
            f"scale={w}:{h}:force_original_aspect_ratio=decrease,"
            f"pad={w}:{h}:(ow-iw)/2:(oh-ih)/2:color=white,setsar=1"
        ),
        "-c:v", "libx264", "-pix_fmt", "yuv420p",
        "-t", f"{treatment.frame_duration_s:.2f}",
        "-r", str(treatment.fps),
        "-movflags", "+faststart",
        str(out),
    ]
```

- [x] **Step 4: Run renderer tests**

```bash
python -m pytest tests/test_video_ffmpeg_renderer.py -v --no-cov
```
Expected: 5 passed. Each test takes 1-3s (ffmpeg invocation).

- [x] **Step 5: Full suite**

```bash
python -m pytest tests/ -q --no-cov 2>&1 | tail -3
```
Expected: 218 passed, 5 deselected (213 prior + 5 new).

- [x] **Step 6: Commit**

```bash
git -C C:/Sandbox/AIProjectManagement/Rooster-AI-Project-Management/projects/etsy-rooster-shop add src/etsy_rooster/video/ffmpeg_renderer.py tests/test_video_ffmpeg_renderer.py
git -C C:/Sandbox/AIProjectManagement/Rooster-AI-Project-Management/projects/etsy-rooster-shop commit -m "feat(video): ffmpeg renderer (zoom + page-flip + static)"
```

---

## Task 4: Per-niche treatment builders

**Files:**
- Create: `projects/etsy-rooster-shop/src/etsy_rooster/video/treatments.py`
- Create: `projects/etsy-rooster-shop/tests/test_video_treatments.py`

- [x] **Step 1: Write failing tests**

Create `projects/etsy-rooster-shop/tests/test_video_treatments.py`:

```python
from __future__ import annotations

import json
import sqlite3
from pathlib import Path

import pytest
from PIL import Image

from etsy_rooster.catalog_db import CatalogDB
from etsy_rooster.video.treatments import (
    coloring_page_flip,
    mandala_zoom,
    poster_zoom,
)


def _seed_db(
    tmp_path: Path, *, niche: str, params: dict, attachments: list[tuple[str, Path]] = ()
) -> tuple[CatalogDB, int]:
    """Build an in-memory catalog with one SKU and the listed attachments."""
    conn = sqlite3.connect(":memory:")
    db = CatalogDB(conn)
    db.init_schema()
    sku_id = db.create_sku(niche=niche, params=params)
    for kind, path in attachments:
        db.attach_artifact_file(sku_id, kind=kind, path=str(path))
    return db, sku_id


def _make_image(tmp_path: Path, name: str, size: tuple[int, int] = (400, 533)) -> Path:
    p = tmp_path / name
    Image.new("RGB", size, (200, 200, 200)).save(p)
    return p


def test_coloring_page_flip_picks_10_evenly_spaced_pages(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    # Build a fake KDP tree with the 45 page PNGs.
    kdp = tmp_path / "kdp"
    pages_dir = kdp / "assets" / "processed" / "coloring" / "fake-book-v1"
    pages_dir.mkdir(parents=True)
    for i in range(1, 46):
        Image.new("1", (100, 130), 1).save(pages_dir / f"page_{i:02d}.png")
    monkeypatch.setenv("KDP_ASSETS_DIR", str(kdp))

    db, sku_id = _seed_db(
        tmp_path,
        niche="coloring",
        params={
            "book_id": "fake-book-v1",
            "design_count": 45,
            "theme_tags": ["t"],
            "title": "T",
            "subtitle": "S",
            "intro": "I",
        },
    )
    t = coloring_page_flip(db, sku_id)
    assert len(t.frames) == 10
    # All 10 are real files
    for f in t.frames:
        assert f.is_file()
    assert t.frame_duration_s == 0.7
    assert t.zoom is None
    # Sampled indices include first + last
    names = sorted(f.name for f in t.frames)
    assert "page_01.png" in names
    assert "page_45.png" in names


def test_poster_zoom_uses_kdp_master_png(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    kdp = tmp_path / "kdp"
    posters_dir = kdp / "assets" / "generated" / "posters" / "test-poster"
    posters_dir.mkdir(parents=True)
    master = posters_dir / "master.png"
    Image.new("RGB", (3072, 4096), (180, 140, 100)).save(master)
    monkeypatch.setenv("KDP_ASSETS_DIR", str(kdp))

    db, sku_id = _seed_db(
        tmp_path,
        niche="poster",
        params={
            "poster_id": "test-poster",
            "title": "T",
            "subtitle": "S",
            "style_description": "soft watercolor",
            "theme_tags": ["t"],
        },
    )
    t = poster_zoom(db, sku_id)
    assert t.frames == [master]
    assert t.frame_duration_s == 9.0
    assert t.zoom == (1.0, 1.5)


def test_mandala_zoom_uses_preview_png_attachment(tmp_path: Path) -> None:
    preview = _make_image(tmp_path, "preview.png", size=(800, 800))
    db, sku_id = _seed_db(
        tmp_path,
        niche="mandala",
        params={"seed": "01", "rings": 5},
        attachments=[
            (
                "svg",
                tmp_path / "fake.svg",  # path doesn't need to exist for this test
            ),
            ("preview_png", preview),
        ],
    )
    t = mandala_zoom(db, sku_id)
    assert t.frames == [preview]
    assert t.frame_duration_s == 7.0
    assert t.zoom == (1.0, 2.0)


def test_mandala_zoom_raises_when_no_preview(tmp_path: Path) -> None:
    db, sku_id = _seed_db(
        tmp_path,
        niche="mandala",
        params={"seed": "01"},
        attachments=[],  # No preview_png attached
    )
    with pytest.raises(RuntimeError, match="no preview_png artifact"):
        mandala_zoom(db, sku_id)
```

- [x] **Step 2: Run tests to confirm failure**

```bash
python -m pytest tests/test_video_treatments.py -v --no-cov
```
Expected: 4 errors (module not found).

- [x] **Step 3: Implement the treatments**

Create `projects/etsy-rooster-shop/src/etsy_rooster/video/treatments.py`:

```python
"""Per-niche video treatment builders.

Each takes (db, sku_id) and returns a VideoTreatment. The builder
(`builder.py`) dispatches by `sku.niche` to the right function.
"""

from __future__ import annotations

import json
from pathlib import Path

from etsy_rooster import config
from etsy_rooster.catalog_db import CatalogDB
from etsy_rooster.video.types import VideoTreatment


def coloring_page_flip(db: CatalogDB, sku_id: int) -> VideoTreatment:
    """Sample 10 evenly-spaced pages from a coloring book SKU, 0.7s each.

    Reads the book_id + design_count from the SKU's generator_params and
    resolves to the KDP processed PNG paths via KDP_ASSETS_DIR.
    """
    sku = db.get_sku(sku_id)
    params = json.loads(sku["generator_params_json"])
    book_id = params["book_id"]
    design_count = int(params["design_count"])
    indices = _evenly_spaced_indices(design_count, n=10)
    kdp_root = config.kdp_assets_dir()
    asset_dir = kdp_root / "assets" / "processed" / "coloring" / book_id
    frames = [asset_dir / f"page_{i:02d}.png" for i in indices]
    return VideoTreatment(
        frames=frames,
        frame_duration_s=0.7,
        zoom=None,
    )


def poster_zoom(db: CatalogDB, sku_id: int) -> VideoTreatment:
    """Slow Ken Burns zoom (1.0x -> 1.5x) over 9 seconds on the poster master."""
    sku = db.get_sku(sku_id)
    params = json.loads(sku["generator_params_json"])
    poster_id = params["poster_id"]
    kdp_root = config.kdp_assets_dir()
    master = (
        kdp_root / "assets" / "generated" / "posters" / poster_id / "master.png"
    )
    return VideoTreatment(
        frames=[master],
        frame_duration_s=9.0,
        zoom=(1.0, 1.5),
    )


def mandala_zoom(db: CatalogDB, sku_id: int) -> VideoTreatment:
    """Detail zoom (1.0x -> 2.0x) over 7 seconds on the SKU's preview PNG.

    Uses the preview_png artifact already attached to the SKU (rendered by
    the svglib-backed _svg_to_png helper).
    """
    files = db.list_artifact_files(sku_id)
    previews = [f for f in files if f["kind"] == "preview_png"]
    if not previews:
        raise RuntimeError(
            f"sku {sku_id} has no preview_png artifact for mandala_zoom"
        )
    return VideoTreatment(
        frames=[Path(previews[0]["path"])],
        frame_duration_s=7.0,
        zoom=(1.0, 2.0),
    )


def _evenly_spaced_indices(total: int, *, n: int) -> list[int]:
    """Return n 1-indexed sample positions spread across [1..total].

    Always includes 1 and total. For 45 designs at n=10: [1, 6, 10, 15, 20, 25,
    30, 35, 40, 45]. The math is `i * (total-1) / (n-1)` rounded to int.
    """
    if total < 1 or n < 1:
        return []
    if total <= n:
        return list(range(1, total + 1))
    if n == 1:
        return [1]
    return [round(i * (total - 1) / (n - 1)) + 1 for i in range(n)]
```

- [x] **Step 4: Run treatment tests**

```bash
python -m pytest tests/test_video_treatments.py -v --no-cov
```
Expected: 4 passed.

- [x] **Step 5: Full suite**

```bash
python -m pytest tests/ -q --no-cov 2>&1 | tail -3
```
Expected: 222 passed, 5 deselected (218 prior + 4 new).

- [x] **Step 6: Commit**

```bash
git -C C:/Sandbox/AIProjectManagement/Rooster-AI-Project-Management/projects/etsy-rooster-shop add src/etsy_rooster/video/treatments.py tests/test_video_treatments.py
git -C C:/Sandbox/AIProjectManagement/Rooster-AI-Project-Management/projects/etsy-rooster-shop commit -m "feat(video): per-niche treatment builders (coloring/poster/mandala)"
```

---

## Task 5: `EtsyClient.upload_listing_video`

**Files:**
- Modify: `projects/etsy-rooster-shop/src/etsy_rooster/etsy/client.py`
- Modify: `projects/etsy-rooster-shop/tests/test_etsy_client.py`

- [x] **Step 1: Write failing test**

Append to `projects/etsy-rooster-shop/tests/test_etsy_client.py`:

```python
def test_upload_listing_video_posts_multipart(tmp_path: Path) -> None:
    """upload_listing_video sends a multipart POST with the file + name."""
    video = tmp_path / "demo.mp4"
    video.write_bytes(b"\x00\x00\x00\x18ftypisom\x00\x00\x02\x00fakebody")

    client = EtsyClient(
        keystring="kk", shared_secret="ss", access_token="at", shop_id=99,
    )
    captured: dict = {}

    class _FakeResp:
        status_code = 200

        def json(self) -> dict:
            return {"video_id": 12345, "state": "active"}

    def fake_post(url, headers, files, data, timeout):
        captured["url"] = url
        captured["headers"] = headers
        captured["files"] = files
        captured["data"] = data
        return _FakeResp()

    client._session.post = fake_post  # type: ignore[assignment]

    result = client.upload_listing_video(listing_id=42, video_path=video)

    assert result == {"video_id": 12345, "state": "active"}
    assert "/shops/99/listings/42/videos" in captured["url"]
    # Multipart body included the file
    assert "video" in captured["files"]
    file_tuple = captured["files"]["video"]
    assert file_tuple[0] == "demo.mp4"
    assert file_tuple[2] == "video/mp4"
    # Name defaults to the file stem
    assert captured["data"]["name"] == "demo"
    # Auth headers present
    assert "Authorization" in captured["headers"]
    assert captured["headers"]["x-api-key"] == "kk:ss"


def test_upload_listing_video_uses_custom_name_when_provided(tmp_path: Path) -> None:
    video = tmp_path / "demo.mp4"
    video.write_bytes(b"\x00\x00\x00\x18ftypisom\x00\x00\x02\x00x")
    client = EtsyClient(
        keystring="kk", shared_secret="ss", access_token="at", shop_id=1,
    )

    class _FakeResp:
        status_code = 200

        def json(self) -> dict:
            return {"video_id": 1}

    captured: dict = {}

    def fake_post(url, headers, files, data, timeout):
        captured["data"] = data
        return _FakeResp()

    client._session.post = fake_post  # type: ignore[assignment]
    client.upload_listing_video(
        listing_id=1, video_path=video, name="Cottagecore Mushroom Poster Video"
    )
    assert captured["data"]["name"] == "Cottagecore Mushroom Poster Video"
```

- [x] **Step 2: Run test to confirm failure**

```bash
python -m pytest tests/test_etsy_client.py::test_upload_listing_video_posts_multipart -v --no-cov
```
Expected: FAIL with `AttributeError: 'EtsyClient' object has no attribute 'upload_listing_video'`.

- [x] **Step 3: Add the method to EtsyClient**

In `projects/etsy-rooster-shop/src/etsy_rooster/etsy/client.py`, find `upload_digital_file` (around line 85). Insert this new method right after it:

```python
    def upload_listing_video(
        self, *, listing_id: int, video_path: Path, name: str | None = None
    ) -> dict[str, Any]:
        """Upload an MP4 to an Etsy listing's video slot.

        Etsy v3 endpoint:
            POST /v3/application/shops/{shop_id}/listings/{listing_id}/videos
        Requires `listings_w` scope (which we have).

        Multipart form-data:
            video: the file
            name:  display name (defaults to file stem)
        """
        display_name = name or video_path.stem
        with video_path.open("rb") as fh:
            files = {"video": (video_path.name, fh, "video/mp4")}
            return self._post_multipart(
                f"/v3/application/shops/{self._shop_id}/listings/{listing_id}/videos",
                files=files,
                data={"name": display_name},
            )
```

- [x] **Step 4: Run tests, verify pass**

```bash
python -m pytest tests/test_etsy_client.py -v --no-cov
```
Expected: all client tests pass (existing + 2 new).

- [x] **Step 5: Full suite**

```bash
python -m pytest tests/ -q --no-cov 2>&1 | tail -3
```
Expected: 224 passed, 5 deselected (222 prior + 2 new).

- [x] **Step 6: Commit**

```bash
git -C C:/Sandbox/AIProjectManagement/Rooster-AI-Project-Management/projects/etsy-rooster-shop add src/etsy_rooster/etsy/client.py tests/test_etsy_client.py
git -C C:/Sandbox/AIProjectManagement/Rooster-AI-Project-Management/projects/etsy-rooster-shop commit -m "feat(etsy): EtsyClient.upload_listing_video (multipart MP4 upload)"
```

---

## Task 6: `PublishOrchestrator` uploads `kind="video"` artifacts

**Files:**
- Modify: `projects/etsy-rooster-shop/src/etsy_rooster/publish/orchestrator.py`
- Modify: `projects/etsy-rooster-shop/tests/test_publish_orchestrator.py`

- [x] **Step 1: Write failing test**

Append to `projects/etsy-rooster-shop/tests/test_publish_orchestrator.py`:

```python
def test_publish_uploads_video_when_attached(
    in_memory_db: "sqlite3.Connection", tmp_path: Path
) -> None:
    """When a SKU has a kind='video' artifact, publish uploads it after the
    primary file and previews."""
    db = CatalogDB(in_memory_db)
    db.init_schema()
    sku_id = db.create_sku(niche="poster", params={"poster_id": "p1"})
    zip_path = tmp_path / "p1.zip"
    zip_path.write_bytes(b"PK\x03\x04")
    preview = tmp_path / "preview.png"
    preview.write_bytes(b"\x89PNG\r\n\x1a\nx")
    video = tmp_path / "p1.mp4"
    video.write_bytes(b"\x00\x00\x00\x18ftypisom" + b"\x00" * 32)

    db.attach_artifact_file(sku_id, kind="zip", path=str(zip_path))
    db.attach_artifact_file(sku_id, kind="preview_png", path=str(preview))
    db.attach_artifact_file(sku_id, kind="video", path=str(video))
    db.set_listing_metadata(
        sku_id,
        title="Test Poster With Video Attached",
        tags=["t"] * 13,
        description="d",
        price_usd=8.99,
        materials=["JPG", "PDF", "Digital Download", "AI Art"],
    )

    etsy = MagicMock()
    etsy.create_draft_listing.return_value = {"listing_id": 222, "state": "draft"}
    etsy.upload_listing_image.return_value = {"listing_image_id": 1}
    etsy.upload_digital_file.return_value = {"listing_file_id": 1}
    etsy.upload_listing_video.return_value = {"video_id": 9, "state": "active"}

    orch = PublishOrchestrator(db=db, etsy=etsy, taxonomy_id=2078)
    orch.publish(sku_id)

    # The video was uploaded once with the right path
    etsy.upload_listing_video.assert_called_once()
    _, kwargs = etsy.upload_listing_video.call_args
    assert kwargs["video_path"] == video
    assert kwargs["listing_id"] == 222


def test_publish_does_not_upload_video_when_none_attached(
    in_memory_db: "sqlite3.Connection", tmp_path: Path
) -> None:
    """Existing publish flow without a video artifact must still work
    (regression guard against new code requiring a video)."""
    db = CatalogDB(in_memory_db)
    db.init_schema()
    sku_id = db.create_sku(niche="mandala", params={"seed": "01"})
    svg = tmp_path / "m.svg"
    svg.write_text("<svg/>", encoding="utf-8")
    preview = tmp_path / "preview.png"
    preview.write_bytes(b"\x89PNG\r\n\x1a\nx")
    db.attach_artifact_file(sku_id, kind="svg", path=str(svg))
    db.attach_artifact_file(sku_id, kind="preview_png", path=str(preview))
    db.set_listing_metadata(
        sku_id,
        title="Plain Mandala SVG With No Video Attached",
        tags=["t"] * 13,
        description="d",
        price_usd=3.5,
        materials=["digital"],
    )

    etsy = MagicMock()
    etsy.create_draft_listing.return_value = {"listing_id": 333, "state": "draft"}
    etsy.upload_listing_image.return_value = {"listing_image_id": 1}
    etsy.upload_digital_file.return_value = {"listing_file_id": 1}

    orch = PublishOrchestrator(db=db, etsy=etsy, taxonomy_id=6343)
    orch.publish(sku_id)

    etsy.upload_listing_video.assert_not_called()
```

- [x] **Step 2: Run test to confirm failure**

```bash
python -m pytest tests/test_publish_orchestrator.py::test_publish_uploads_video_when_attached -v --no-cov
```
Expected: FAIL (`upload_listing_video.assert_called_once()` fires because the orchestrator doesn't upload videos yet).

- [x] **Step 3: Extend the orchestrator**

In `projects/etsy-rooster-shop/src/etsy_rooster/publish/orchestrator.py`, find the `publish` method around lines 70-85 (where `upload_digital_file` is called). Add a video-upload block right after that, before `set_etsy_listing`:

```python
        # Upload the primary digital file (first svg/pdf/zip attached).
        primary_path = Path(primary_files[0]["path"])
        self._etsy.upload_digital_file(
            listing_id=listing_id,
            file_path=primary_path,
            name=primary_path.name,
        )

        # If the SKU has a video artifact, upload it. Etsy allows 1 displayed video.
        videos = [f for f in files if f["kind"] == "video"]
        if videos:
            video_path = Path(videos[0]["path"])
            self._etsy.upload_listing_video(
                listing_id=listing_id,
                video_path=video_path,
            )

        self._db.set_etsy_listing(sku_id, etsy_listing_id=listing_id, state="draft")
        self._db.log_op(sku_id, event="published_draft", detail=f"listing_id={listing_id}")
        return listing_id
```

(The above replaces the existing trailing portion of the `publish` method. Make sure the `set_etsy_listing` + `log_op` + `return` lines that were already there stay.)

- [x] **Step 4: Run orchestrator tests**

```bash
python -m pytest tests/test_publish_orchestrator.py -v --no-cov
```
Expected: all orchestrator tests pass (existing + 2 new).

- [x] **Step 5: Full suite**

```bash
python -m pytest tests/ -q --no-cov 2>&1 | tail -3
```
Expected: 226 passed, 5 deselected (224 prior + 2 new).

- [x] **Step 6: Commit**

```bash
git -C C:/Sandbox/AIProjectManagement/Rooster-AI-Project-Management/projects/etsy-rooster-shop add src/etsy_rooster/publish/orchestrator.py tests/test_publish_orchestrator.py
git -C C:/Sandbox/AIProjectManagement/Rooster-AI-Project-Management/projects/etsy-rooster-shop commit -m "feat(publish): orchestrator uploads kind=video artifact during publish"
```

---

## Task 7: `builder.py` â€” generate + auto-upload orchestrator

**Files:**
- Create: `projects/etsy-rooster-shop/src/etsy_rooster/video/builder.py`
- Create: `projects/etsy-rooster-shop/tests/test_video_builder.py`

- [x] **Step 1: Write failing test**

Create `projects/etsy-rooster-shop/tests/test_video_builder.py`:

```python
from __future__ import annotations

import json
import os
import sqlite3
from pathlib import Path
from unittest.mock import MagicMock

import pytest
from PIL import Image

from etsy_rooster.catalog_db import CatalogDB
from etsy_rooster.video.builder import build_and_upload_video


def _seed_kdp_poster_fixture(tmp_path: Path, poster_id: str = "demo-p") -> Path:
    kdp = tmp_path / "kdp-puzzle-press"
    posters = kdp / "assets" / "generated" / "posters" / poster_id
    posters.mkdir(parents=True)
    Image.new("RGB", (800, 1066), (180, 140, 100)).save(posters / "master.png")
    return kdp


def test_build_returns_path_and_no_listing_when_sku_not_published(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """A SKU without an etsy_listing row gets video generated locally; no upload."""
    kdp = _seed_kdp_poster_fixture(tmp_path)
    monkeypatch.setenv("KDP_ASSETS_DIR", str(kdp))
    monkeypatch.setenv("ETSY_ROOSTER_DATA_DIR", str(tmp_path / "data"))

    conn = sqlite3.connect(":memory:")
    db = CatalogDB(conn)
    db.init_schema()
    sku_id = db.create_sku(
        niche="poster",
        params={
            "poster_id": "demo-p",
            "title": "T",
            "subtitle": "S",
            "style_description": "x",
            "theme_tags": ["a"],
        },
    )

    output_path, listing_id = build_and_upload_video(
        db=db, sku_id=sku_id, etsy=None
    )
    assert output_path.is_file()
    assert listing_id is None
    # The video was attached as kind="video"
    files = db.list_artifact_files(sku_id)
    kinds = [f["kind"] for f in files]
    assert "video" in kinds


def test_build_uploads_video_when_sku_has_listing(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """A SKU with an etsy_listing row gets the video uploaded via the injected client."""
    kdp = _seed_kdp_poster_fixture(tmp_path)
    monkeypatch.setenv("KDP_ASSETS_DIR", str(kdp))
    monkeypatch.setenv("ETSY_ROOSTER_DATA_DIR", str(tmp_path / "data"))

    conn = sqlite3.connect(":memory:")
    db = CatalogDB(conn)
    db.init_schema()
    sku_id = db.create_sku(
        niche="poster",
        params={
            "poster_id": "demo-p",
            "title": "T",
            "subtitle": "S",
            "style_description": "x",
            "theme_tags": ["a"],
        },
    )
    # Walk this SKU all the way to STAGED so the etsy_listing row exists.
    db.set_listing_metadata(
        sku_id,
        title="Test poster video upload listing title",
        tags=["t"] * 13,
        description="d",
        price_usd=8.99,
        materials=["JPG"],
    )
    db.set_etsy_listing(sku_id, etsy_listing_id=42, state="draft")

    etsy = MagicMock()
    etsy.upload_listing_video.return_value = {"video_id": 99, "state": "active"}

    output_path, listing_id = build_and_upload_video(
        db=db, sku_id=sku_id, etsy=etsy
    )
    assert listing_id == 42
    etsy.upload_listing_video.assert_called_once()
    _, kwargs = etsy.upload_listing_video.call_args
    assert kwargs["listing_id"] == 42
    assert kwargs["video_path"] == output_path


def test_build_raises_for_unknown_niche(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("ETSY_ROOSTER_DATA_DIR", str(tmp_path / "data"))
    conn = sqlite3.connect(":memory:")
    db = CatalogDB(conn)
    db.init_schema()
    sku_id = db.create_sku(niche="sticker", params={})

    with pytest.raises(ValueError, match="No video treatment"):
        build_and_upload_video(db=db, sku_id=sku_id, etsy=None)
```

- [x] **Step 2: Run tests to confirm failure**

```bash
python -m pytest tests/test_video_builder.py -v --no-cov
```
Expected: 3 errors (module not found).

- [x] **Step 3: Implement the builder**

Create `projects/etsy-rooster-shop/src/etsy_rooster/video/builder.py`:

```python
"""Top-level orchestrator for `generate video --sku-id=N`.

Loads SKU assets via CatalogDB, dispatches to per-niche treatment builders,
renders via ffmpeg, attaches a kind="video" artifact, and (if an Etsy
listing exists) uploads via the injected EtsyClient.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

from etsy_rooster import config
from etsy_rooster.catalog_db import CatalogDB
from etsy_rooster.video import ffmpeg_renderer, treatments
from etsy_rooster.video.types import VideoTreatment

_TREATMENT_BY_NICHE = {
    "coloring": treatments.coloring_page_flip,
    "poster": treatments.poster_zoom,
    "mandala": treatments.mandala_zoom,
}


def build_and_upload_video(
    *,
    db: CatalogDB,
    sku_id: int,
    etsy: Any,  # duck-typed EtsyClient; can be None to skip upload step
) -> tuple[Path, int | None]:
    """Build a video for the SKU; upload to its Etsy listing if one exists.

    Returns (mp4_path, listing_id_or_None).
    """
    sku = db.get_sku(sku_id)
    niche = sku["niche"]
    treatment_fn = _TREATMENT_BY_NICHE.get(niche)
    if treatment_fn is None:
        raise ValueError(
            f"No video treatment registered for niche {niche!r}. "
            f"Known: {sorted(_TREATMENT_BY_NICHE)}"
        )

    treatment: VideoTreatment = treatment_fn(db, sku_id)
    output_path = config.data_dir() / "videos" / f"{sku_id}.mp4"
    ffmpeg_renderer.render(treatment, output_path)

    db.attach_artifact_file(sku_id, kind="video", path=str(output_path))
    db.log_op(sku_id, event="video_generated", detail=f"path={output_path}")

    listing_id = _get_listing_id(db, sku_id)
    if listing_id is None or etsy is None:
        return output_path, listing_id

    etsy.upload_listing_video(listing_id=listing_id, video_path=output_path)
    db.log_op(sku_id, event="video_uploaded", detail=f"listing_id={listing_id}")
    return output_path, listing_id


def _get_listing_id(db: CatalogDB, sku_id: int) -> int | None:
    """Look up the SKU's Etsy listing_id from the etsy_listing table."""
    row = db._conn.execute(  # pragma: same encapsulation pattern as PublishOrchestrator
        "SELECT etsy_listing_id FROM etsy_listing WHERE sku_id = ?",
        (sku_id,),
    ).fetchone()
    if row is None:
        return None
    return int(row["etsy_listing_id"])
```

- [x] **Step 4: Run builder tests**

```bash
python -m pytest tests/test_video_builder.py -v --no-cov
```
Expected: 3 passed.

- [x] **Step 5: Full suite**

```bash
python -m pytest tests/ -q --no-cov 2>&1 | tail -3
```
Expected: 229 passed, 5 deselected (226 prior + 3 new).

- [x] **Step 6: Commit**

```bash
git -C C:/Sandbox/AIProjectManagement/Rooster-AI-Project-Management/projects/etsy-rooster-shop add src/etsy_rooster/video/builder.py tests/test_video_builder.py
git -C C:/Sandbox/AIProjectManagement/Rooster-AI-Project-Management/projects/etsy-rooster-shop commit -m "feat(video): build_and_upload_video orchestrator"
```

---

## Task 8: CLI `generate video --sku-id=N`

**Files:**
- Modify: `projects/etsy-rooster-shop/src/etsy_rooster/cli.py`
- Create: `projects/etsy-rooster-shop/tests/test_video_cli.py`

- [x] **Step 1: Write failing test**

Create `projects/etsy-rooster-shop/tests/test_video_cli.py`:

```python
from __future__ import annotations

import json
import sqlite3
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest
from click.testing import CliRunner
from PIL import Image


def _seed_kdp_poster_fixture(tmp_path: Path, poster_id: str = "demo-p") -> Path:
    kdp = tmp_path / "kdp-puzzle-press"
    posters = kdp / "assets" / "generated" / "posters" / poster_id
    posters.mkdir(parents=True)
    Image.new("RGB", (800, 1066), (180, 140, 100)).save(posters / "master.png")
    return kdp


def test_generate_video_command_creates_mp4_for_unpublished_sku(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Without an etsy_listing row, the CLI writes a local MP4 and prints
    the path."""
    kdp = _seed_kdp_poster_fixture(tmp_path)
    monkeypatch.setenv("KDP_ASSETS_DIR", str(kdp))
    monkeypatch.setenv("ETSY_ROOSTER_DATA_DIR", str(tmp_path / "data"))

    from etsy_rooster.catalog_db import CatalogDB
    from etsy_rooster.cli import cli

    # Seed a poster SKU directly in the catalog so the CLI can find it.
    conn = sqlite3.connect(tmp_path / "data" / "catalog.db")
    (tmp_path / "data").mkdir(exist_ok=True)
    db = CatalogDB(conn)
    db.init_schema()
    sku_id = db.create_sku(
        niche="poster",
        params={
            "poster_id": "demo-p",
            "title": "T",
            "subtitle": "S",
            "style_description": "x",
            "theme_tags": ["a"],
        },
    )
    conn.close()

    runner = CliRunner()
    result = runner.invoke(
        cli, ["generate", "video", "--sku-id", str(sku_id)]
    )
    assert result.exit_code == 0, f"output={result.output!r}\nexc={result.exception!r}"
    assert "video=" in result.output
    assert (tmp_path / "data" / "videos" / f"{sku_id}.mp4").is_file()
    # No "uploaded to listing" output (because no listing exists).
    assert "uploaded to listing" not in result.output


def test_generate_video_command_uploads_when_sku_has_listing(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """With an etsy_listing row, the CLI builds an EtsyClient (via
    ensure_fresh_token) and uploads."""
    kdp = _seed_kdp_poster_fixture(tmp_path)
    monkeypatch.setenv("KDP_ASSETS_DIR", str(kdp))
    monkeypatch.setenv("ETSY_ROOSTER_DATA_DIR", str(tmp_path / "data"))
    monkeypatch.setenv("ETSY_KEYSTRING", "kk")
    monkeypatch.setenv("ETSY_SHARED_SECRET", "ss")
    monkeypatch.setenv("ETSY_SHOP_ID", "12345")
    monkeypatch.setenv("ETSY_REDIRECT_URI", "http://localhost:3003/oauth/callback")

    from etsy_rooster.catalog_db import CatalogDB
    from etsy_rooster.cli import cli

    (tmp_path / "data").mkdir(exist_ok=True)
    conn = sqlite3.connect(tmp_path / "data" / "catalog.db")
    db = CatalogDB(conn)
    db.init_schema()
    sku_id = db.create_sku(
        niche="poster",
        params={
            "poster_id": "demo-p",
            "title": "T",
            "subtitle": "S",
            "style_description": "x",
            "theme_tags": ["a"],
        },
    )
    db.set_listing_metadata(
        sku_id,
        title="Test poster CLI video upload listing",
        tags=["t"] * 13,
        description="d",
        price_usd=8.99,
        materials=["JPG"],
    )
    db.set_etsy_listing(sku_id, etsy_listing_id=42, state="draft")
    conn.close()

    # Patch ensure_fresh_token + EtsyClient so no real OAuth or network.
    with (
        patch("etsy_rooster.cli.ensure_fresh_token") as mock_token,
        patch("etsy_rooster.cli.EtsyClient") as MockClient,
    ):
        mock_token.return_value = {"access_token": "tk", "refresh_token": "rk"}
        instance = MagicMock()
        instance.upload_listing_video.return_value = {"video_id": 1}
        MockClient.return_value = instance

        runner = CliRunner()
        result = runner.invoke(
            cli, ["generate", "video", "--sku-id", str(sku_id)]
        )
    assert result.exit_code == 0, f"output={result.output!r}\nexc={result.exception!r}"
    assert "uploaded to listing 42" in result.output
    instance.upload_listing_video.assert_called_once()
```

- [x] **Step 2: Run tests to confirm failure**

```bash
python -m pytest tests/test_video_cli.py -v --no-cov
```
Expected: 2 errors (no `generate video` subcommand yet).

- [x] **Step 3: Add the CLI subcommand**

In `projects/etsy-rooster-shop/src/etsy_rooster/cli.py`, find the existing `generate_themed_mandala` function (the last subcommand in the `generate` group). Add the new `generate_video` subcommand right after it:

```python
@generate.command("video")
@click.option("--sku-id", required=True, type=int)
def generate_video(sku_id: int) -> None:
    """Build a 1:1 720x720 MP4 for a SKU and auto-upload to its Etsy listing."""
    import os

    from etsy_rooster.etsy.client import EtsyClient
    from etsy_rooster.etsy.oauth import EtsyOAuthConfig, TokenStore, ensure_fresh_token
    from etsy_rooster.video.builder import build_and_upload_video

    db = _db()
    listing_id_row = db._conn.execute(
        "SELECT etsy_listing_id FROM etsy_listing WHERE sku_id = ?", (sku_id,)
    ).fetchone()
    etsy: EtsyClient | None = None
    if listing_id_row is not None:
        cfg = EtsyOAuthConfig(
            keystring=os.environ["ETSY_KEYSTRING"],
            shared_secret=os.environ["ETSY_SHARED_SECRET"],
            redirect_uri=os.environ.get(
                "ETSY_REDIRECT_URI", "http://localhost:3003/oauth/callback"
            ),
        )
        tokens = ensure_fresh_token(TokenStore(), cfg)
        etsy = EtsyClient(
            keystring=os.environ["ETSY_KEYSTRING"],
            shared_secret=os.environ["ETSY_SHARED_SECRET"],
            access_token=tokens["access_token"],
            shop_id=int(os.environ["ETSY_SHOP_ID"]),
        )

    output_path, listing_id = build_and_upload_video(
        db=db, sku_id=sku_id, etsy=etsy
    )
    click.echo(f"sku_id={sku_id} video={output_path}")
    if listing_id is not None:
        click.echo(f"uploaded to listing {listing_id}")
```

Also add the imports at the top of cli.py (if not already present from Task 0):
- The `EtsyClient` and `EtsyOAuthConfig`, `TokenStore`, `ensure_fresh_token` are already lazy-imported inside the function â€” no module-level changes needed.

- [x] **Step 4: Run CLI tests**

```bash
python -m pytest tests/test_video_cli.py -v --no-cov
```
Expected: 2 passed.

- [x] **Step 5: Full suite**

```bash
python -m pytest tests/ -q --no-cov 2>&1 | tail -3
```
Expected: 231 passed, 5 deselected (229 prior + 2 new).

- [x] **Step 6: Commit**

```bash
git -C C:/Sandbox/AIProjectManagement/Rooster-AI-Project-Management/projects/etsy-rooster-shop add src/etsy_rooster/cli.py tests/test_video_cli.py
git -C C:/Sandbox/AIProjectManagement/Rooster-AI-Project-Management/projects/etsy-rooster-shop commit -m "feat(cli): add 'generate video --sku-id' subcommand"
```

---

## Task 9: Live integration test (file only â€” not executed)

**Files:**
- Create: `projects/etsy-rooster-shop/tests/integration/test_e2e_video.py`

**Scope limitation:** Write the test file only. Do NOT run it. The user authorizes live runs separately (real Etsy state change).

- [x] **Step 1: Create the live test**

Create `projects/etsy-rooster-shop/tests/integration/test_e2e_video.py`:

```python
"""Live integration: generate a video and upload to a real Etsy listing.

Skipped by default (marker 'live'). Requires:
  - .env.local with ETSY_KEYSTRING, ETSY_SHARED_SECRET, ETSY_SHOP_ID
  - ~/.etsy-rooster/token.json (run scripts/etsy_oauth_setup.py first)
  - KDP_ASSETS_DIR with the poster master rendered on disk:
      <kdp>/assets/generated/posters/cottagecore-mushroom-poster-v1/master.png
  - A poster SKU already published as draft #4508841550 (which it is, per
    the current shop state)

Run manually:
    python -m pytest tests/integration/test_e2e_video.py -v -m live -s
"""

from __future__ import annotations

import json
import os
import sqlite3
from pathlib import Path

import pytest
from dotenv import load_dotenv

_PROJECT_ROOT = Path(__file__).resolve().parents[2]
load_dotenv(_PROJECT_ROOT / ".env.local")
load_dotenv(_PROJECT_ROOT / ".env")

from etsy_rooster.catalog_db import CatalogDB  # noqa: E402
from etsy_rooster.etsy.client import EtsyClient  # noqa: E402
from etsy_rooster.etsy.oauth import (  # noqa: E402
    EtsyOAuthConfig,
    TokenStore,
    ensure_fresh_token,
)
from etsy_rooster.video.builder import build_and_upload_video  # noqa: E402

pytestmark = pytest.mark.live

POSTER_ID = "cottagecore-mushroom-poster-v1"
EXISTING_LISTING_ID = 4508841550  # Cottagecore Mushroom Poster draft


@pytest.mark.skipif(
    not os.environ.get("ETSY_KEYSTRING")
    or not os.environ.get("ETSY_SHARED_SECRET")
    or not os.environ.get("ETSY_SHOP_ID"),
    reason="Etsy credentials not configured",
)
def test_generate_video_and_upload_to_existing_poster_draft(tmp_path: Path) -> None:
    # 1. Set up an in-memory catalog with the poster SKU and its existing Etsy
    #    listing (mirroring the shop's real state â€” listing_id 4508841550 is
    #    already published as draft).
    conn = sqlite3.connect(":memory:")
    db = CatalogDB(conn)
    db.init_schema()
    sku_id = db.create_sku(
        niche="poster",
        params={
            "poster_id": POSTER_ID,
            "title": "Cottagecore Mushroom Print",
            "subtitle": "A botanical wall print",
            "style_description": "Soft watercolor",
            "theme_tags": ["cottagecore"],
        },
    )
    db.set_listing_metadata(
        sku_id,
        title="Cottagecore Mushroom Print Botanical Wall Art",
        tags=["t"] * 13,
        description="d",
        price_usd=8.99,
        materials=["JPG"],
    )
    db.set_etsy_listing(
        sku_id, etsy_listing_id=EXISTING_LISTING_ID, state="draft"
    )

    # 2. Build EtsyClient with a refreshed token.
    cfg = EtsyOAuthConfig(
        keystring=os.environ["ETSY_KEYSTRING"],
        shared_secret=os.environ["ETSY_SHARED_SECRET"],
        redirect_uri=os.environ.get(
            "ETSY_REDIRECT_URI", "http://localhost:3003/oauth/callback"
        ),
    )
    tokens = ensure_fresh_token(TokenStore(), cfg)
    etsy = EtsyClient(
        keystring=os.environ["ETSY_KEYSTRING"],
        shared_secret=os.environ["ETSY_SHARED_SECRET"],
        access_token=tokens["access_token"],
        shop_id=int(os.environ["ETSY_SHOP_ID"]),
    )

    # 3. Generate + upload.
    output_path, listing_id = build_and_upload_video(
        db=db, sku_id=sku_id, etsy=etsy
    )

    # 4. Verify
    assert output_path.is_file()
    assert output_path.stat().st_size > 100_000  # > 100 KB; a real MP4
    assert listing_id == EXISTING_LISTING_ID
    print(f"Uploaded {output_path} ({output_path.stat().st_size} bytes) to listing {listing_id}")
    print(
        "View at: "
        "https://www.etsy.com/your/shops/PocketRoosterPress/tools/listings/state:draft"
    )
```

- [x] **Step 2: Sanity-check the suite (the new test is deselected by default)**

```bash
python -m pytest tests/ -q --no-cov 2>&1 | tail -3
```
Expected: 231 passed, 6 deselected (5 prior live + 1 new).

- [x] **Step 3: DO NOT run with -m live**

The user authorizes the live run separately in Task 10.

- [x] **Step 4: Commit**

```bash
git -C C:/Sandbox/AIProjectManagement/Rooster-AI-Project-Management/projects/etsy-rooster-shop add tests/integration/test_e2e_video.py
git -C C:/Sandbox/AIProjectManagement/Rooster-AI-Project-Management/projects/etsy-rooster-shop commit -m "test(live): video generation -> Etsy listing upload"
```

---

## Task 10: Backfill â€” user-side runbook for the 3 existing listings

**This task spends real Etsy API quota and uploads real videos to your shop's listings. Confirm before running.**

The 3 existing SKUs that need videos:

| Listing | SKU type | Video treatment |
|---|---|---|
| `4508746710` ACTIVE | coloring book (Cottagecore Mushrooms) | page-flip |
| `4508841550` DRAFT | poster (Cottagecore Mushroom Print) | slow zoom |
| `4508771090` DRAFT | plain mandala SVG | detail zoom |

The SKUs for these listings are in the live `data/catalog.db`. Their IDs are whatever you've assigned to them via earlier `generate coloring|poster|mandala` runs â€” confirm via `audit` first.

- [x] **Step 1: List the SKUs**

```bash
cd /c/Sandbox/AIProjectManagement/Rooster-AI-Project-Management/projects/etsy-rooster-shop && python -c "from etsy_rooster.cli import cli; cli(['audit'], standalone_mode=False)"
```

Expected output: a list of SKUs with niche + state. Note the `sku_id` for the coloring book, poster, and plain mandala that match the live listings.

- [x] **Step 2: Run the live integration test for the poster path first (sanity check)**

```bash
cd /c/Sandbox/AIProjectManagement/Rooster-AI-Project-Management/projects/etsy-rooster-shop && python -m pytest tests/integration/test_e2e_video.py -v -m live -s --no-cov
```

Expected: PASS in ~5-15 seconds. The test uses a fresh in-memory SKU pointing at the existing poster draft, so it won't conflict with your `data/catalog.db`. After this passes, listing `4508841550` will have a real video attached on Etsy.

If this fails with `401` or `429`, troubleshoot before continuing:
- `401 invalid_token` â†’ re-run `scripts/etsy_oauth_setup.py` to mint a fresh token
- `429` â†’ wait a minute and try again; Etsy rate-limits exist

- [x] **Step 3: Generate + upload for the coloring book and plain mandala**

For each of the remaining 2 SKUs (coloring + plain mandala), run:

```bash
cd /c/Sandbox/AIProjectManagement/Rooster-AI-Project-Management/projects/etsy-rooster-shop && python -c "from etsy_rooster.cli import cli; cli(['generate', 'video', '--sku-id', '<N>'], standalone_mode=False)"
```

Replace `<N>` with the actual sku_id from Step 1's audit. Expected: prints `sku_id=N video=...` followed by `uploaded to listing <listing_id>`.

If the coloring SKU has multiple `preview_png` or other artifacts you don't want re-attached, you can inspect the artifact list first via `db.list_artifact_files(sku_id)` in a quick python -c.

- [x] **Step 4: Verify in the Etsy dashboard**

For each of the 3 listings, open the dashboard and confirm a video appears in the carousel:

- https://www.etsy.com/your/shops/PocketRoosterPress/tools/listings/state:active (for the active coloring book)
- https://www.etsy.com/your/shops/PocketRoosterPress/tools/listings/state:draft (for the 2 drafts)

The video auto-plays muted in the listing carousel. Sanity-check:
- Coloring book â†’ 7-second page-flip showing variety
- Poster â†’ 9-second slow zoom on the watercolor master
- Plain mandala â†’ 7-second detail zoom on the geometric pattern

If any video looks wrong (black frames, wrong aspect, glitchy), re-run `generate video --sku-id=N` to overwrite â€” the renderer is deterministic, but ffmpeg's `zoompan` quirks may have produced something off the first time.

- [x] **Step 5: Update the checkpoint memory**

Ask the controller (in a new conversation) to update `C:\Users\marts\.claude\projects\c--Sandbox-AIProjectManagement-Rooster-AI-Project-Management\memory\etsy-rooster-shop-checkpoint.md` to note that Plan 2e shipped + all 3 existing listings now have videos.

No git commit for this task â€” runbook execution only.

---

## Acceptance â€” Plan 2e complete when

- [x] All 10 tasks above have every step checked
- [x] `python -m pytest tests/ -q --no-cov` shows â‰¥231 passed, 0 failed
- [x] Live video integration test (Task 9) passed at least once end-to-end (real video on real Etsy listing)
- [x] All 3 existing listings on the Etsy shop now have a video playing in the carousel
- [x] Checkpoint memory updated noting Plan 2e shipped

## Deferred-debt acknowledgments

Plan 2e cleared the OAuth-refresh-helper deferred-debt item (Task 0). Remaining items:

1. **`google-generativeai` is EOL** â€” Plan 2e adds no new uses; still queued.
2. **Mandala live test (`test_e2e_sandbox.py`) still doesn't import `ensure_fresh_token`** â€” was not updated in Task 0 because its OAuth section was already different from the other 3 live tests (didn't have the refresh dance at all). Worth a tiny follow-up commit to add the import + use it preemptively.
3. **`_THEMED_MANDALA_DEFAULTS`** placement (cli.py vs themed_mandala_generator.py).
4. **`shops_w` OAuth scope** for programmatic section assignment.
5. **Themed mandala motif legibility** (Plan 2d learning) â€” product category paused.
6. **24Ã—36 print size** not in poster bundle.
7. **No `--replace` flag** on `generate video` â€” re-running creates a duplicate video on Etsy. Worth adding if you find yourself iterating.

## Self-review against the spec

(Performed inline before committing this plan.)

- **Spec coverage:** Every "In scope" bullet from the spec maps to at least one task. `VideoTreatment` dataclass (T2), ffmpeg renderer (T3), niche treatments (T4), `upload_listing_video` (T5), `PublishOrchestrator` extension (T6), `build_and_upload_video` orchestrator (T7), CLI (T8), live test (T9), backfill (T10). Task 0 covers the `ensure_fresh_token` extraction that the spec's Open Decision #5 called out.
- **Placeholder scan:** No TBDs, no "implement later," no "similar to task N" without showing the code. Every step contains the actual code to write or command to run.
- **Type consistency:** `VideoTreatment` field names + signatures match across types.py (T2), ffmpeg_renderer.py (T3), treatments.py (T4), builder.py (T7). `EtsyClient.upload_listing_video(*, listing_id, video_path, name=None)` signature consistent across client.py (T5), test_etsy_client.py (T5), orchestrator.py (T6), builder.py (T7), and the integration test (T9).
- **One minor type-consistency note:** the `etsy` parameter of `build_and_upload_video` is typed as `Any` (duck-typed EtsyClient) â€” same convention as `PublishOrchestrator.__init__`. Intentional, kept for test ergonomics.
