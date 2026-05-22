# Etsy Rooster Shop — Plan 2e: Per-listing product videos (ffmpeg pan-zoom + page-flip)

**Status:** Design approved 2026-05-22. Awaiting implementation plan (writing-plans).

**Predecessors:** Plans 1, 2a (coloring + branded shop), 2c (posters), 2d (themed motif mandalas — product category paused per the mushroom-doesn't-read-as-mushroom finding). All earlier sub-plans shipped pipelines this plan reuses unchanged.

**Successor sub-plans:** Plan 2f (Veo lifestyle videos via Google's video AI, if/when needed). Plan 2b (`pocket_rooster_brand` refactor) still queued.

## Goal

Ship a `etsy-rooster generate video --sku-id=N` CLI command that produces a 1:1 720×720 MP4 from a SKU's existing assets, attaches it as `kind="video"` to the SKU's artifacts, and auto-uploads to the Etsy listing if one already exists. Etsy reports that listings with video sell more; this is the cheapest possible way to give every listing a video using assets we already generate.

Backfills videos onto the 3 existing listings on the shop (1 active coloring + 2 drafts).

## Scope

**In:**
- New `etsy_rooster.video/` subpackage with 3 niche-specific treatment builders (coloring page-flip, poster zoom, mandala detail zoom)
- ffmpeg renderer via `imageio-ffmpeg` (bundled binary, no system install required)
- New `EtsyClient.upload_listing_video(listing_id, video_path)` method (Etsy v3 endpoint `POST /v3/application/shops/{shop_id}/listings/{listing_id}/videos`; requires `listings_w` which we already have)
- `PublishOrchestrator` extension: uploads `kind="video"` artifacts alongside images during publish
- New `etsy-rooster generate video --sku-id=N` CLI subcommand
- Backfill videos onto the 3 existing listings via the auto-upload path

**Out (later sub-plans):**
- Veo / AI-generated lifestyle videos (Plan 2f)
- Themed-mandala video (product category paused — motifs don't read as recognizable shapes at mandala scale)
- Text overlays, motion graphics, branded outros, intro frames
- Audio
- Multiple videos per listing (Etsy allows 1)
- Re-publishing already-published listings (Etsy auto-handles new image uploads on existing listings)

## Pipeline shape

```
SKU N in CatalogDB (niche = "coloring" | "poster" | "mandala")
   ├─ Already has attached artifacts: pdf|svg|zip + N preview_pngs
   └─ Optionally has etsy_listing row (STAGED or LIVE)
                              │
   ▼                          │
etsy-rooster generate video --sku-id=N
   ├─ Niche-dispatch: coloring | poster | mandala
   ├─ Load source frames from KDP_ASSETS_DIR or data/artifacts/
   ├─ Build VideoTreatment dataclass (frames, durations, zoom)
   ├─ ffmpeg_renderer.render(treatment) → data/videos/<sku_id>.mp4
   ├─ db.attach_artifact_file(sku, kind="video", path=...)
   └─ If sku has etsy_listing row:
          EtsyClient.upload_listing_video(listing_id, video_path)
                              │
                              ▼
data/videos/<sku_id>.mp4 + listing on Etsy now has video in its carousel
```

## Architecture & components

### New code in `projects/etsy-rooster-shop/`

```
src/etsy_rooster/video/
  __init__.py
  types.py                 # VideoTreatment frozen dataclass + its validation.
                           #   Stays small (~40 LOC) and importable everywhere.
  treatments.py            # Per-niche plan builders. Each returns a VideoTreatment:
                           #   coloring_page_flip(db, sku_id),
                           #   poster_zoom(db, sku_id),
                           #   mandala_zoom(db, sku_id).
  ffmpeg_renderer.py       # render(treatment, output_path). Wraps
                           #   imageio_ffmpeg.get_ffmpeg_exe() + subprocess.run with
                           #   a filtergraph string.
  builder.py               # Top-level orchestrator: load SKU assets via CatalogDB →
                           #   dispatch by niche → build treatment → render → return
                           #   Path. Also handles the auto-upload path.

# Modified (one-line / small additions each)
src/etsy_rooster/etsy/client.py
                           # Add upload_listing_video(listing_id, video_path) method.
                           # Multipart POST to /v3/application/shops/{shop_id}/listings
                           #   /{listing_id}/videos. Uses existing OAuth + retry helpers.

src/etsy_rooster/publish/orchestrator.py
                           # In publish(), after upload_digital_file: if any
                           #   kind="video" artifacts exist on the sku, call
                           #   upload_listing_video for the first one (Etsy allows 1).
                           # Pre-existing listings get videos via generate video's own
                           #   auto-upload path (the orchestrator path is for NEW SKUs).

src/etsy_rooster/cli.py    # Add @generate.command("video") subcommand. Lazy-imports
                           #   from etsy_rooster.video.builder.

# New dependency
pyproject.toml             # Add imageio-ffmpeg>=0.5,<1 to main dependencies.

tests/
  test_video_treatments.py   # Each niche builds a sensible VideoTreatment
  test_video_renderer.py     # ffmpeg actually produces a valid 720x720 H.264 MP4
                             #   (uses ffprobe via imageio-ffmpeg)
  test_video_cli.py          # CLI end-to-end with mocked Etsy upload
  test_publish_orchestrator.py
                             # Extend: kind="video" artifact gets uploaded via the
                             #   orchestrator's publish path
  test_etsy_client_video.py  # upload_listing_video sends correct multipart payload
                             #   (uses requests-mock or similar)
```

### `VideoTreatment` dataclass

The clean abstraction between "what the niche wants" and "what ffmpeg does":

```python
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class VideoTreatment:
    """A renderer-agnostic plan for one product video.

    The ffmpeg renderer translates this into a concrete filtergraph:
      - Multi-frame (len(frames) > 1) -> concat with hard cuts
      - Single-frame + zoom -> zoompan filter
      - Single-frame, no zoom -> static frame held for the duration
    """

    frames: list[Path]                  # 1+ source images (PNG/JPG)
    frame_duration_s: float             # Per-frame duration; uniform across frames
    zoom: tuple[float, float] | None    # (start_zoom, end_zoom), e.g. (1.0, 1.5)
                                        #   None = no zoom (used by coloring page-flip)
    output_size: tuple[int, int] = (720, 720)
    fps: int = 30

    def __post_init__(self) -> None:
        if not self.frames:
            raise ValueError("frames must contain at least one image")
        for f in self.frames:
            if not f.is_file():
                raise ValueError(f"frame does not exist: {f}")
        if self.frame_duration_s <= 0:
            raise ValueError(f"frame_duration_s must be > 0, got {self.frame_duration_s}")
        if self.zoom is not None:
            start, end = self.zoom
            if start <= 0 or end <= 0:
                raise ValueError("zoom factors must be > 0")
        if self.output_size[0] != self.output_size[1]:
            raise ValueError("output_size must be square for Etsy")
        if self.fps not in (24, 30, 60):
            raise ValueError(f"fps must be 24/30/60, got {self.fps}")
```

### Per-niche treatment builders

```python
# treatments.py

import sqlite3
from pathlib import Path
from etsy_rooster.catalog_db import CatalogDB
from etsy_rooster.video.types import VideoTreatment


def coloring_page_flip(db: CatalogDB, sku_id: int) -> VideoTreatment:
    """Sample 10 evenly-spaced pages from the 45-page book at 0.7s each."""
    # Read the SKU's params to find the book_id, then resolve to processed PNG paths
    # in KDP_ASSETS_DIR (the kdp_importer logic, but we only need page paths here).
    params = json.loads(db.get_sku(sku_id)["generator_params_json"])
    book_id = params["book_id"]
    design_count = params["design_count"]
    indices = _evenly_spaced(design_count, n=10)  # e.g. [1, 6, 10, 15, ..., 45]
    kdp_root = config.kdp_assets_dir()
    frames = [
        kdp_root / "assets" / "processed" / "coloring" / book_id / f"page_{i:02d}.png"
        for i in indices
    ]
    return VideoTreatment(
        frames=frames,
        frame_duration_s=0.7,
        zoom=None,
    )


def poster_zoom(db: CatalogDB, sku_id: int) -> VideoTreatment:
    """Slow zoom from 1.0x to 1.5x over 9s on the poster master."""
    params = json.loads(db.get_sku(sku_id)["generator_params_json"])
    poster_id = params["poster_id"]
    master = config.kdp_assets_dir() / "assets" / "generated" / "posters" / poster_id / "master.png"
    return VideoTreatment(
        frames=[master],
        frame_duration_s=9.0,
        zoom=(1.0, 1.5),
    )


def mandala_zoom(db: CatalogDB, sku_id: int) -> VideoTreatment:
    """Detail zoom from 1.0x to 2.0x over 7s on the mandala's PNG preview."""
    # Find the preview_png artifact attached to this SKU.
    files = db.list_artifact_files(sku_id)
    previews = [f for f in files if f["kind"] == "preview_png"]
    if not previews:
        raise RuntimeError(f"sku {sku_id} has no preview_png artifact")
    return VideoTreatment(
        frames=[Path(previews[0]["path"])],
        frame_duration_s=7.0,
        zoom=(1.0, 2.0),
    )
```

### ffmpeg renderer

```python
# ffmpeg_renderer.py

import subprocess
from pathlib import Path

from imageio_ffmpeg import get_ffmpeg_exe

from etsy_rooster.video.types import VideoTreatment


def render(treatment: VideoTreatment, output_path: Path) -> None:
    """Render the treatment to an MP4 file via ffmpeg.

    Output: H.264, yuv420p, no audio, 30fps (or whatever treatment.fps says),
    treatment.output_size square dimensions.
    """
    output_path.parent.mkdir(parents=True, exist_ok=True)
    ffmpeg = get_ffmpeg_exe()

    w, h = treatment.output_size
    total_s = treatment.frame_duration_s * len(treatment.frames)

    if len(treatment.frames) > 1:
        # Page-flip path: concat with hard cuts
        cmd = _build_page_flip_cmd(treatment, output_path, ffmpeg)
    elif treatment.zoom is not None:
        # Single-frame zoom path: zoompan filter
        cmd = _build_zoom_cmd(treatment, output_path, ffmpeg)
    else:
        # Static frame path (fallback)
        cmd = _build_static_cmd(treatment, output_path, ffmpeg)

    subprocess.run(cmd, check=True, capture_output=True, text=True)


def _build_zoom_cmd(treatment: VideoTreatment, out: Path, ffmpeg: str) -> list[str]:
    """Single-frame Ken Burns zoom via the zoompan filter.

    zoompan computes the zoom factor each frame; we map our zoom tuple to
    z='start + (end-start)*on/(d-1)'.
    """
    start_z, end_z = treatment.zoom  # type: ignore[misc]
    duration_frames = int(treatment.frame_duration_s * treatment.fps)
    w, h = treatment.output_size
    src = treatment.frames[0]
    zoom_expr = f"{start_z}+({end_z}-{start_z})*on/{max(duration_frames - 1, 1)}"
    # Square-crop the source first so the zoom is centered properly,
    # then apply zoompan.
    filter_complex = (
        f"[0:v]scale=if(gt(iw\\,ih)\\,-2\\,{w*2}):if(gt(iw\\,ih)\\,{h*2}\\,-2),"
        f"crop={w*2}:{h*2},"
        f"zoompan=z='{zoom_expr}':d={duration_frames}:s={w}x{h}:fps={treatment.fps}"
    )
    return [
        ffmpeg, "-y",
        "-loop", "1", "-i", str(src),
        "-filter_complex", filter_complex,
        "-c:v", "libx264", "-pix_fmt", "yuv420p",
        "-t", f"{treatment.frame_duration_s:.2f}",
        "-r", str(treatment.fps),
        "-movflags", "+faststart",  # Web/mobile playback optimization
        str(out),
    ]


def _build_page_flip_cmd(treatment: VideoTreatment, out: Path, ffmpeg: str) -> list[str]:
    """Multi-frame concat with hard cuts.

    Builds a `-loop 1 -t D -i FRAME` group per frame, then concats them all
    via the concat filter.
    """
    w, h = treatment.output_size
    args: list[str] = [ffmpeg, "-y"]
    for frame in treatment.frames:
        args += [
            "-loop", "1", "-t", f"{treatment.frame_duration_s:.2f}",
            "-i", str(frame),
        ]
    # Build the filtergraph: scale each input, then concat
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


def _build_static_cmd(treatment: VideoTreatment, out: Path, ffmpeg: str) -> list[str]:
    """Hold a single frame for `frame_duration_s` seconds, no zoom."""
    w, h = treatment.output_size
    return [
        ffmpeg, "-y",
        "-loop", "1", "-i", str(treatment.frames[0]),
        "-vf", f"scale={w}:{h}:force_original_aspect_ratio=decrease,"
                f"pad={w}:{h}:(ow-iw)/2:(oh-ih)/2:color=white,setsar=1",
        "-c:v", "libx264", "-pix_fmt", "yuv420p",
        "-t", f"{treatment.frame_duration_s:.2f}",
        "-r", str(treatment.fps),
        "-movflags", "+faststart",
        str(out),
    ]
```

### `EtsyClient.upload_listing_video`

```python
# Inside EtsyClient class (etsy/client.py)

def upload_listing_video(
    self, *, listing_id: int, video_path: Path, name: str | None = None
) -> dict[str, Any]:
    """Upload an MP4 to an Etsy listing's video slot.

    Etsy v3 endpoint:
        POST /v3/application/shops/{shop_id}/listings/{listing_id}/videos
    Requires `listings_w` scope (which we have).

    Multipart form-data:
        video: the file
        name:  display name (optional, defaults to filename stem)

    Returns the Etsy video metadata (video_id, state, url_75x75, etc.).
    Raises EtsyAPIError on non-2xx.
    """
    url = (
        f"https://openapi.etsy.com/v3/application/shops/{self._shop_id}"
        f"/listings/{listing_id}/videos"
    )
    display_name = name or video_path.stem
    with video_path.open("rb") as f:
        files = {"video": (video_path.name, f, "video/mp4")}
        data = {"name": display_name}

        def op():
            return requests.post(
                url, headers=self._headers(), files=files, data=data, timeout=120
            )

        return self._with_retry(op)
```

### CLI subcommand

```python
@generate.command("video")
@click.option("--sku-id", required=True, type=int)
def generate_video(sku_id: int) -> None:
    """Generate a video for one SKU and (if listing exists) upload to Etsy."""
    from etsy_rooster.video.builder import build_and_upload_video

    db = _db()
    output_path, listing_id = build_and_upload_video(db=db, sku_id=sku_id)
    click.echo(f"sku_id={sku_id} video={output_path}")
    if listing_id is not None:
        click.echo(f"uploaded to listing {listing_id}")
```

### `build_and_upload_video` orchestrator

```python
# builder.py

def build_and_upload_video(
    *, db: CatalogDB, sku_id: int
) -> tuple[Path, int | None]:
    """Build a video for the SKU and (if Etsy listing exists) upload it.

    Returns (output_path, listing_id_or_None).
    """
    sku = db.get_sku(sku_id)
    niche = sku["niche"]
    treatment_fn = {
        "coloring": treatments.coloring_page_flip,
        "poster": treatments.poster_zoom,
        "mandala": treatments.mandala_zoom,
    }.get(niche)
    if treatment_fn is None:
        raise click.ClickException(
            f"No video treatment registered for niche {niche!r}. "
            f"Known: ['coloring', 'poster', 'mandala']"
        )

    treatment = treatment_fn(db, sku_id)
    output_path = config.data_dir() / "videos" / f"{sku_id}.mp4"
    ffmpeg_renderer.render(treatment, output_path)

    db.attach_artifact_file(sku_id, kind="video", path=str(output_path))
    db.log_op(sku_id, event="video_generated", detail=f"path={output_path}")

    # Check for existing Etsy listing and auto-upload.
    row = db._conn.execute(  # pragma: same encapsulation pattern as PublishOrchestrator
        "SELECT etsy_listing_id FROM etsy_listing WHERE sku_id = ?",
        (sku_id,),
    ).fetchone()
    if row is None:
        return output_path, None

    listing_id = int(row["etsy_listing_id"])
    # Build EtsyClient using the same OAuth refresh dance as cli.publish.
    # (Could be extracted to ensure_fresh_token helper — deferred-debt item.)
    etsy = _build_etsy_client_with_refresh()
    etsy.upload_listing_video(listing_id=listing_id, video_path=output_path)
    db.log_op(sku_id, event="video_uploaded", detail=f"listing_id={listing_id}")
    return output_path, listing_id
```

### Reuse from prior plans (unchanged)

- `CatalogDB` — `kind="video"` is just another free-text artifact kind; no schema change
- OAuth flow + token refresh (same dance as `cli.publish`; will share `ensure_fresh_token` helper if/when extracted as deferred debt)
- `_taxonomy_for_niche`, `LLMListingAuthor`, all per-niche prompts — unchanged (videos don't need new LLM copy)
- `EtsyClient` — extends, doesn't replace; existing `<keystring>:<shared_secret>` header pattern, retry logic, error class

## Etsy spec adherence

All produced MP4s:

| Property | Value |
|---|---|
| Container | MP4 (`.mp4`) |
| Video codec | H.264 / libx264 |
| Pixel format | yuv420p (broad browser/mobile compat) |
| Audio | none |
| Frame rate | 30 fps |
| Dimensions | 720×720 square (Etsy auto-converts if needed) |
| Duration | 6–10 s (well under Etsy's 15s cap) |
| File size | target <10MB, hard cap 100MB (Etsy's limit) |
| Overlays | none (Etsy 2024 video-content policy prohibits text overlays) |
| `+faststart` | yes (allows video to begin playing before download completes) |

## Acceptance criteria

**Code done when:**
- `etsy-rooster generate video --sku-id=N` works for all 3 niches end-to-end
- Each produced MP4 is valid: ffprobe (or python validation) confirms container=mp4, codec=h264, dimensions=720x720, no audio stream, duration matches expected ±0.5s
- A new `kind="video"` artifact is attached to the SKU after generation
- If the SKU has an `etsy_listing` row, the video is uploaded to that listing via the API and the upload returns 2xx
- ~12 new unit tests pass; existing 202 unit tests still pass
- Live integration test (deselected by default) creates a real Etsy video upload on a real listing end-to-end

**Plan 2e complete when:**
- Videos generated + uploaded for all 3 existing listings:
  - Active coloring listing `#4508746710` (Cottagecore Mushrooms) — page-flip video showing 10 designs
  - Draft poster `#4508841550` (Cottagecore Mushroom Print) — slow-zoom video on the master art
  - Draft plain mandala `#4508771090` (Plain Mandala SVG) — detail-zoom video
- Each listing's Etsy dashboard shows the video playing in the carousel

## Open decisions (resolve during implementation)

1. **ffmpeg filter syntax precision on Windows.** The `zoompan` filter has known Windows path-escaping quirks. Start with the simplest invocation; iterate if the first render produces black/distorted output. Worst-case fallback: render via `select+setpts` instead of `zoompan`.
2. **Page-flip transitions** — hard cuts vs 0.2s crossfade. MVP defaults to hard cuts (simpler filtergraph). Revisit if the buyer feedback / visual feel is jarring.
3. **Re-running `generate video` for a SKU that already has a video on Etsy.** Default behavior: print a warning ("listing already has video; not replacing") and skip upload. Override via `--replace` flag. (Etsy's API allows multiple videos per listing technically, but only the first is displayed.)
4. **Mandala source frame resolution.** The svglib renderer produces 800×800 PNG previews. Zooming to 2.0× means the inner crop is effectively 400×400 upscaled — soft at 720×720 output. Decide at render time: if the input is <1440×1440, regenerate the source PNG at higher resolution before rendering. Implement only if first output is visibly soft.
5. **Whether to extract `ensure_fresh_token(store, cfg)` helper as part of this plan or as separate cleanup.** Plan 2e adds a third inline copy of the OAuth refresh dance (cli.publish, test_e2e_coloring.py, and now builder.py). At this point the duplication is real. Recommendation: extract it as Task 0 of this plan to clean up before adding more copies.

## Testing strategy

**Unit tests** (target ~12 new):
- `VideoTreatment` validation (each failure mode: empty frames, missing file, bad zoom, non-square output, bad fps)
- Each treatment builder (`coloring_page_flip`, `poster_zoom`, `mandala_zoom`) — produces a valid `VideoTreatment` from a fixture SKU
- `ffmpeg_renderer.render` produces a valid 720×720 MP4 for each treatment type (page-flip / zoom / static)
- `EtsyClient.upload_listing_video` sends correct multipart payload (mocked HTTP)
- `PublishOrchestrator` uploads `kind="video"` artifacts during publish
- `generate video` CLI command end-to-end with mocked Etsy upload

**Live integration test** (`@pytest.mark.live`):
- End-to-end: load existing poster SKU → generate video → upload to real Etsy listing → assert listing now has video. Mirrors `tests/integration/test_e2e_poster.py` pattern.

**Manual verification:**
- Open each MP4 locally in a video player; confirms it plays + looks right (subjective quality check)
- Open each Etsy listing in the dashboard; confirm the video appears in the carousel + auto-plays muted
- Try playing in mobile Etsy app preview

## Out of scope (explicit, prevents scope creep)

- Veo / AI-generated lifestyle videos (Plan 2f)
- Themed-mandala video (product category paused)
- Text overlays, branded watermarks, intro/outro frames
- Audio tracks
- Multiple videos per listing (Etsy allows 1 displayed)
- Music licensing concerns (no audio, so no risk)
- Cricut-machine-cutting-demonstration videos (would need actual machine + camera — manual)
- 9:16 vertical reels for social cross-posting (out of scope; Etsy's video field is the focus)
- Video thumbnail customization (Etsy auto-picks the first frame)

## Deferred-debt items (carried from earlier plans + adds from 2e)

From Plan 2a + 2c + 2d final reviews, all non-blocking:

1. **Extract `ensure_fresh_token(store, cfg)` helper.** Was 4× duplicated as of Plan 2c; Plan 2e adds a 5th inline copy in `builder.py` unless we extract first. Strong recommendation: extract as Task 0 of Plan 2e.
2. **`google-generativeai` is EOL.** Plan 2e adds no new uses; still queued for migration.
3. **Mandala live test (`test_e2e_sandbox.py`) still lacks OAuth refresh.**
4. **`_THEMED_MANDALA_DEFAULTS`** placement (cli.py vs themed_mandala_generator.py).
5. **`shops_w` OAuth scope** for programmatic section assignment.
6. **Themed mandala motifs don't read as recognizable shapes at mandala scale** (Plan 2d learning) — product category paused.
7. **24×36 print size** not in poster bundle (4K master can't upscale crisply).
