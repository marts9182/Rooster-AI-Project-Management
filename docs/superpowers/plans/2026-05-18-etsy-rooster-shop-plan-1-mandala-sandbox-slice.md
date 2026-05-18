# Etsy Rooster Shop — Plan 1: Mandala Sandbox Slice

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Take one mandala SVG from generation → LLM-authored Etsy metadata → Etsy sandbox draft listing, end-to-end, via a single CLI invocation. This proves the riskiest integration (Etsy OAuth + API) on the smallest possible scope.

**Architecture:** New Python project at `projects/etsy-rooster-shop/` (sibling to `kdp-puzzle-press`). Pure deterministic mandala renderer + SQLite catalog DB + LLM-driven listing authoring + Etsy Open API v3 client + click CLI. Each component is independently testable. No Nano Banana, no posters, no brand-kit refactor, no batching — those come in Plan 2 and Plan 3.

**Tech Stack:** Python 3.11+, setuptools, click, sqlite3 (stdlib), requests + requests-oauthlib, anthropic OR google-generativeai (configurable), pytest + pytest-cov, ruff + black + mypy.

**Companion plans:**
- Plan 2 (next): poster generator with Nano Banana Pro + factor out `pocket_rooster_brand` shared package.
- Plan 3 (after): bulk-generate 50 mandalas + 30 posters, review gallery, activate on production Etsy, end-to-end test sale.

**Working directory:** After Task 1 Step 1, the engineer is `cd`'d into
`projects/etsy-rooster-shop/`, which is its own git repository (the outer
`Rooster-AI-Project-Management` repo gitignores `projects/`). All file paths,
shell commands, and `git add` invocations after Task 1 are relative to that
nested-repo root.

---

## File Structure

```
projects/etsy-rooster-shop/
├── pyproject.toml                    # project + dev deps
├── README.md                         # setup, env vars, OAuth flow, CLI usage
├── .env.example                      # ETSY_KEYSTRING, ETSY_SHARED_SECRET, GEMINI_API_KEY, etc.
├── .gitignore                        # data/, .env, ~/.etsy-rooster/
├── src/etsy_rooster/
│   ├── __init__.py                   # version
│   ├── cli.py                        # click entry point: generate, author-metadata, publish, audit
│   ├── config.py                     # env loading, paths, default model names
│   ├── catalog_db.py                 # SQLite schema, CRUD, state transitions
│   ├── svg_render/
│   │   ├── __init__.py
│   │   ├── artifact.py               # SvgArtifact dataclass
│   │   ├── mandala_generator.py      # MandalaGenerator + MandalaParams
│   │   └── validators.py             # validate_svg(closed paths, viewBox, no-zero-area)
│   ├── listing_authoring/
│   │   ├── __init__.py
│   │   ├── author.py                 # LLMListingAuthor; ListingDraft dataclass
│   │   └── prompts/
│   │       └── mandala-prompt.md     # niche prompt for mandala listings
│   ├── etsy/
│   │   ├── __init__.py
│   │   ├── oauth.py                  # PKCE flow, token storage at ~/.etsy-rooster/token.json
│   │   └── client.py                 # EtsyClient: create_draft_listing, upload_image, upload_file, activate, get
│   └── publish/
│       ├── __init__.py
│       └── orchestrator.py           # high-level: take an AUTHORED sku → Etsy sandbox draft
├── tests/
│   ├── __init__.py
│   ├── conftest.py                   # in-memory db, fake responses
│   ├── fixtures/
│   │   └── mandalas/                 # golden SVG outputs for seeds A..E
│   ├── test_catalog_db.py
│   ├── test_mandala_generator.py
│   ├── test_validators.py
│   ├── test_listing_authoring.py
│   ├── test_etsy_oauth.py
│   ├── test_etsy_client.py
│   ├── test_publish_orchestrator.py
│   └── integration/
│       ├── __init__.py
│       └── test_e2e_sandbox.py       # live; marked @pytest.mark.live
└── scripts/
    └── etsy_oauth_setup.py           # interactive OAuth bootstrap; writes token.json
```

---

## Task 1: Project Scaffolding

**Files:**
- Create: `projects/etsy-rooster-shop/pyproject.toml`
- Create: `projects/etsy-rooster-shop/README.md`
- Create: `projects/etsy-rooster-shop/.env.example`
- Create: `projects/etsy-rooster-shop/.gitignore`
- Create: `projects/etsy-rooster-shop/src/etsy_rooster/__init__.py`
- Create: `projects/etsy-rooster-shop/tests/__init__.py`
- Create: `projects/etsy-rooster-shop/tests/conftest.py`

- [ ] **Step 1: Create directory layout and init nested git repo**

The outer repo (`Rooster-AI-Project-Management`) gitignores `projects/`.
Each project is its own git repo, matching the existing `kdp-puzzle-press`
pattern. All git commits below happen inside the new nested repo.

```bash
cd projects
mkdir -p etsy-rooster-shop/src/etsy_rooster/svg_render
mkdir -p etsy-rooster-shop/src/etsy_rooster/listing_authoring/prompts
mkdir -p etsy-rooster-shop/src/etsy_rooster/etsy
mkdir -p etsy-rooster-shop/src/etsy_rooster/publish
mkdir -p etsy-rooster-shop/tests/fixtures/mandalas
mkdir -p etsy-rooster-shop/tests/integration
mkdir -p etsy-rooster-shop/scripts
cd etsy-rooster-shop
git init
```

The pre-existing `SETUP.md` in this directory will be included in the first
commit at Step 9 — it's the Etsy account setup runbook.

- [ ] **Step 2: Write pyproject.toml**

```toml
[build-system]
requires = ["setuptools>=68", "wheel"]
build-backend = "setuptools.build_meta"

[project]
name = "etsy-rooster-shop"
version = "0.1.0"
description = "Etsy automation pipeline for Pocket Rooster Press"
readme = "README.md"
requires-python = ">=3.11"
license = {text = "Proprietary"}
authors = [{name = "Pocket Rooster Press"}]
dependencies = [
    "click>=8.1,<9",
    "requests>=2.32,<3",
    "requests-oauthlib>=2.0,<3",
    "python-dotenv>=1.0,<2",
    "anthropic>=0.40,<1",
    "google-generativeai>=0.8,<1",
    "Pillow>=11.0,<12",
    "lxml>=5.3,<6",
]

[project.optional-dependencies]
dev = [
    "pytest>=8.0,<9",
    "pytest-cov>=5.0,<6",
    "responses>=0.25,<1",
    "ruff>=0.6,<1",
    "black>=24.0,<25",
    "mypy>=1.11,<2",
]

[project.scripts]
etsy-rooster = "etsy_rooster.cli:cli"

[tool.setuptools.packages.find]
where = ["src"]

[tool.ruff]
line-length = 100

[tool.ruff.lint]
select = ["E", "F", "I", "UP", "B"]
ignore = ["E501"]

[tool.black]
line-length = 100
target-version = ["py311"]

[tool.pytest.ini_options]
testpaths = ["tests"]
markers = [
    "live: tests that hit live external services (LLM, Etsy sandbox)",
]
addopts = "--cov=src --cov-report=term-missing -m 'not live'"

[tool.mypy]
python_version = "3.11"
strict = false
```

- [ ] **Step 3: Write .env.example**

```
# Etsy Open API v3 — get these from https://www.etsy.com/developers/your-apps
ETSY_KEYSTRING=
ETSY_SHARED_SECRET=
ETSY_REDIRECT_URI=http://localhost:3003/oauth/callback
ETSY_SHOP_ID=
# Set to "sandbox" for Etsy sandbox API, "production" for real Etsy
ETSY_ENV=sandbox

# Choose one LLM backend for listing authoring
LLM_BACKEND=gemini
GEMINI_API_KEY=
ANTHROPIC_API_KEY=

# Local data paths
ETSY_ROOSTER_DATA_DIR=./data
```

- [ ] **Step 4: Write .gitignore**

```
__pycache__/
*.pyc
.pytest_cache/
.coverage
.mypy_cache/
.ruff_cache/
*.egg-info/
dist/
build/

.env
data/
~/.etsy-rooster/
```

- [ ] **Step 5: Write src/etsy_rooster/__init__.py**

```python
"""Etsy automation pipeline for Pocket Rooster Press."""

__version__ = "0.1.0"
```

- [ ] **Step 6: Write tests/__init__.py and tests/conftest.py**

`tests/__init__.py` is empty.

`tests/conftest.py`:

```python
"""Shared pytest fixtures."""
from __future__ import annotations

import os
import sqlite3
from pathlib import Path
from typing import Iterator

import pytest


@pytest.fixture
def in_memory_db() -> Iterator[sqlite3.Connection]:
    """In-memory SQLite for catalog DB tests."""
    conn = sqlite3.connect(":memory:")
    conn.row_factory = sqlite3.Row
    yield conn
    conn.close()


@pytest.fixture
def tmp_data_dir(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    """A scratch data dir for tests; ETSY_ROOSTER_DATA_DIR points here."""
    data = tmp_path / "data"
    data.mkdir()
    monkeypatch.setenv("ETSY_ROOSTER_DATA_DIR", str(data))
    return data
```

- [ ] **Step 7: Write README.md skeleton**

```markdown
# Etsy Rooster Shop

Automation pipeline for the Pocket Rooster Press sister shop on Etsy.

## Setup

1. `pip install -e ".[dev]"` from `projects/etsy-rooster-shop/`.
2. Copy `.env.example` → `.env` and fill in keys.
3. Run `python scripts/etsy_oauth_setup.py` to bootstrap Etsy OAuth.
4. `etsy-rooster --help` to see commands.

## CLI

- `etsy-rooster generate mandala --seed <name>` — generate one mandala.
- `etsy-rooster author-metadata --sku <id>` — LLM authors title/tags/desc.
- `etsy-rooster publish --sku <id> --env sandbox` — push to Etsy as draft.
- `etsy-rooster audit` — reconcile DB ↔ Etsy.

See `docs/superpowers/specs/2026-05-18-etsy-rooster-shop-design.md` for full design.
```

- [ ] **Step 8: Install in editable mode and verify**

```bash
cd projects/etsy-rooster-shop
pip install -e ".[dev]"
python -c "import etsy_rooster; print(etsy_rooster.__version__)"
```

Expected: `0.1.0`

- [ ] **Step 9: Commit (inside the nested repo)**

```bash
# you are still cd'd into projects/etsy-rooster-shop
git add .
git commit -m "feat: scaffold project structure

Sibling Python project to kdp-puzzle-press. Implements Plan 1 task 1
of the Etsy Rooster Shop design spec."
```

---

## Task 2: Catalog DB Schema

**Files:**
- Create: `projects/etsy-rooster-shop/src/etsy_rooster/catalog_db.py`
- Create: `projects/etsy-rooster-shop/tests/test_catalog_db.py`

- [ ] **Step 1: Write the failing test**

`tests/test_catalog_db.py`:

```python
"""Catalog DB schema + state-transition tests."""
from __future__ import annotations

import json
import sqlite3

import pytest

from etsy_rooster.catalog_db import (
    CatalogDB,
    SkuState,
    SkuNotFoundError,
    InvalidTransitionError,
)


def test_init_creates_all_tables(in_memory_db: sqlite3.Connection) -> None:
    db = CatalogDB(in_memory_db)
    db.init_schema()
    cur = in_memory_db.execute(
        "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
    )
    names = [r[0] for r in cur.fetchall()]
    assert names == [
        "artifact_files",
        "etsy_listing",
        "listing_metadata",
        "ops_log",
        "sku",
    ]


def test_create_sku_returns_id_and_state_drafted(in_memory_db: sqlite3.Connection) -> None:
    db = CatalogDB(in_memory_db)
    db.init_schema()
    sku_id = db.create_sku(niche="mandala", params={"seed": "alpha", "rings": 5})
    row = db.get_sku(sku_id)
    assert row["niche"] == "mandala"
    assert json.loads(row["generator_params_json"]) == {"seed": "alpha", "rings": 5}
    assert db.current_state(sku_id) == SkuState.DRAFTED


def test_attach_artifact_file_and_lookup(in_memory_db: sqlite3.Connection) -> None:
    db = CatalogDB(in_memory_db)
    db.init_schema()
    sku_id = db.create_sku(niche="mandala", params={"seed": "a"})
    db.attach_artifact_file(sku_id, kind="svg", path="/tmp/a.svg", sha256="deadbeef")
    files = db.list_artifact_files(sku_id)
    assert len(files) == 1
    assert files[0]["kind"] == "svg"
    assert files[0]["path"] == "/tmp/a.svg"


def test_set_listing_metadata_transitions_to_authored(in_memory_db: sqlite3.Connection) -> None:
    db = CatalogDB(in_memory_db)
    db.init_schema()
    sku_id = db.create_sku(niche="mandala", params={"seed": "a"})
    db.set_listing_metadata(
        sku_id,
        title="Mandala 1",
        tags=["mandala", "svg", "cricut"],
        description="A mandala.",
        price_usd=3.50,
    )
    assert db.current_state(sku_id) == SkuState.AUTHORED


def test_set_etsy_listing_id_transitions_to_staged(in_memory_db: sqlite3.Connection) -> None:
    db = CatalogDB(in_memory_db)
    db.init_schema()
    sku_id = db.create_sku(niche="mandala", params={"seed": "a"})
    db.set_listing_metadata(
        sku_id, title="x", tags=["a"], description="d", price_usd=1.0
    )
    db.set_etsy_listing(sku_id, etsy_listing_id=999, state="draft")
    assert db.current_state(sku_id) == SkuState.STAGED


def test_activate_transitions_to_live(in_memory_db: sqlite3.Connection) -> None:
    db = CatalogDB(in_memory_db)
    db.init_schema()
    sku_id = db.create_sku(niche="mandala", params={"seed": "a"})
    db.set_listing_metadata(
        sku_id, title="x", tags=["a"], description="d", price_usd=1.0
    )
    db.set_etsy_listing(sku_id, etsy_listing_id=999, state="draft")
    db.mark_live(sku_id)
    assert db.current_state(sku_id) == SkuState.LIVE


def test_publish_before_author_raises(in_memory_db: sqlite3.Connection) -> None:
    db = CatalogDB(in_memory_db)
    db.init_schema()
    sku_id = db.create_sku(niche="mandala", params={"seed": "a"})
    with pytest.raises(InvalidTransitionError):
        db.set_etsy_listing(sku_id, etsy_listing_id=1, state="draft")


def test_get_unknown_sku_raises(in_memory_db: sqlite3.Connection) -> None:
    db = CatalogDB(in_memory_db)
    db.init_schema()
    with pytest.raises(SkuNotFoundError):
        db.get_sku(9999)


def test_log_op_writes_to_ops_log(in_memory_db: sqlite3.Connection) -> None:
    db = CatalogDB(in_memory_db)
    db.init_schema()
    sku_id = db.create_sku(niche="mandala", params={"seed": "a"})
    db.log_op(sku_id, event="generated", detail="seed=a")
    rows = list(in_memory_db.execute("SELECT * FROM ops_log"))
    assert len(rows) == 1
    assert rows[0]["event"] == "generated"
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd projects/etsy-rooster-shop
pytest tests/test_catalog_db.py -v
```

Expected: 9 errors / collection failures with `ImportError: cannot import name 'CatalogDB' from 'etsy_rooster.catalog_db'`.

- [ ] **Step 3: Write minimal implementation**

`src/etsy_rooster/catalog_db.py`:

```python
"""SQLite catalog of SKUs through their lifecycle."""
from __future__ import annotations

import enum
import json
import sqlite3
from datetime import datetime
from typing import Any, Iterable


class SkuState(enum.Enum):
    DRAFTED = "drafted"
    AUTHORED = "authored"
    STAGED = "staged"
    LIVE = "live"
    RETIRED = "retired"


class SkuNotFoundError(LookupError):
    pass


class InvalidTransitionError(RuntimeError):
    pass


_VALID_TRANSITIONS: dict[SkuState, set[SkuState]] = {
    SkuState.DRAFTED: {SkuState.AUTHORED},
    SkuState.AUTHORED: {SkuState.STAGED},
    SkuState.STAGED: {SkuState.LIVE, SkuState.RETIRED},
    SkuState.LIVE: {SkuState.RETIRED},
    SkuState.RETIRED: set(),
}


_SCHEMA = """
CREATE TABLE sku (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    niche TEXT NOT NULL,
    generator_params_json TEXT NOT NULL,
    state TEXT NOT NULL DEFAULT 'drafted',
    created_at TEXT NOT NULL
);

CREATE TABLE artifact_files (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sku_id INTEGER NOT NULL REFERENCES sku(id),
    kind TEXT NOT NULL,
    path TEXT NOT NULL,
    sha256 TEXT,
    created_at TEXT NOT NULL
);

CREATE TABLE listing_metadata (
    sku_id INTEGER PRIMARY KEY REFERENCES sku(id),
    title TEXT NOT NULL,
    tags_json TEXT NOT NULL,
    description TEXT NOT NULL,
    price_usd REAL NOT NULL,
    materials_json TEXT,
    created_at TEXT NOT NULL
);

CREATE TABLE etsy_listing (
    sku_id INTEGER PRIMARY KEY REFERENCES sku(id),
    etsy_listing_id INTEGER NOT NULL,
    state TEXT NOT NULL,
    listed_at TEXT NOT NULL,
    last_synced_at TEXT
);

CREATE TABLE ops_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sku_id INTEGER REFERENCES sku(id),
    event TEXT NOT NULL,
    detail TEXT,
    ts TEXT NOT NULL
);
"""


class CatalogDB:
    """Thin wrapper over a sqlite3.Connection enforcing SKU lifecycle rules."""

    def __init__(self, conn: sqlite3.Connection) -> None:
        self._conn = conn
        self._conn.row_factory = sqlite3.Row
        self._conn.execute("PRAGMA foreign_keys = ON")

    def init_schema(self) -> None:
        self._conn.executescript(_SCHEMA)
        self._conn.commit()

    # ---------- SKU lifecycle ----------

    def create_sku(self, *, niche: str, params: dict[str, Any]) -> int:
        cur = self._conn.execute(
            "INSERT INTO sku (niche, generator_params_json, state, created_at) "
            "VALUES (?, ?, ?, ?)",
            (niche, json.dumps(params), SkuState.DRAFTED.value, _now()),
        )
        self._conn.commit()
        sku_id = cur.lastrowid
        assert sku_id is not None
        return sku_id

    def get_sku(self, sku_id: int) -> sqlite3.Row:
        row = self._conn.execute("SELECT * FROM sku WHERE id = ?", (sku_id,)).fetchone()
        if row is None:
            raise SkuNotFoundError(f"sku {sku_id}")
        return row

    def current_state(self, sku_id: int) -> SkuState:
        return SkuState(self.get_sku(sku_id)["state"])

    def attach_artifact_file(
        self, sku_id: int, *, kind: str, path: str, sha256: str | None = None
    ) -> None:
        self.get_sku(sku_id)  # raises if missing
        self._conn.execute(
            "INSERT INTO artifact_files (sku_id, kind, path, sha256, created_at) "
            "VALUES (?, ?, ?, ?, ?)",
            (sku_id, kind, path, sha256, _now()),
        )
        self._conn.commit()

    def list_artifact_files(self, sku_id: int) -> list[sqlite3.Row]:
        return list(
            self._conn.execute(
                "SELECT * FROM artifact_files WHERE sku_id = ? ORDER BY id", (sku_id,)
            )
        )

    def set_listing_metadata(
        self,
        sku_id: int,
        *,
        title: str,
        tags: Iterable[str],
        description: str,
        price_usd: float,
        materials: Iterable[str] | None = None,
    ) -> None:
        self._require_state(sku_id, SkuState.DRAFTED)
        self._conn.execute(
            "INSERT INTO listing_metadata "
            "(sku_id, title, tags_json, description, price_usd, materials_json, created_at) "
            "VALUES (?, ?, ?, ?, ?, ?, ?)",
            (
                sku_id,
                title,
                json.dumps(list(tags)),
                description,
                price_usd,
                json.dumps(list(materials)) if materials else None,
                _now(),
            ),
        )
        self._transition(sku_id, SkuState.AUTHORED)
        self._conn.commit()

    def set_etsy_listing(
        self, sku_id: int, *, etsy_listing_id: int, state: str
    ) -> None:
        self._require_state(sku_id, SkuState.AUTHORED)
        self._conn.execute(
            "INSERT INTO etsy_listing "
            "(sku_id, etsy_listing_id, state, listed_at) VALUES (?, ?, ?, ?)",
            (sku_id, etsy_listing_id, state, _now()),
        )
        self._transition(sku_id, SkuState.STAGED)
        self._conn.commit()

    def mark_live(self, sku_id: int) -> None:
        self._require_state(sku_id, SkuState.STAGED)
        self._transition(sku_id, SkuState.LIVE)
        self._conn.commit()

    # ---------- ops log ----------

    def log_op(self, sku_id: int | None, *, event: str, detail: str | None = None) -> None:
        self._conn.execute(
            "INSERT INTO ops_log (sku_id, event, detail, ts) VALUES (?, ?, ?, ?)",
            (sku_id, event, detail, _now()),
        )
        self._conn.commit()

    # ---------- internal ----------

    def _require_state(self, sku_id: int, required: SkuState) -> None:
        actual = self.current_state(sku_id)
        if actual is not required:
            raise InvalidTransitionError(
                f"sku {sku_id} is {actual.value}, expected {required.value}"
            )

    def _transition(self, sku_id: int, to_state: SkuState) -> None:
        current = self.current_state(sku_id)
        if to_state not in _VALID_TRANSITIONS[current]:
            raise InvalidTransitionError(f"{current.value} -> {to_state.value}")
        self._conn.execute(
            "UPDATE sku SET state = ? WHERE id = ?", (to_state.value, sku_id)
        )


def _now() -> str:
    return datetime.utcnow().isoformat(timespec="seconds") + "Z"
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pytest tests/test_catalog_db.py -v
```

Expected: 9 passed.

- [ ] **Step 5: Commit**

```bash
git add src/etsy_rooster/catalog_db.py \
        projects/etsy-rooster-shop/tests/test_catalog_db.py
git commit -m "feat(etsy-rooster-shop): catalog DB with SKU lifecycle"
```

---

## Task 3: SvgArtifact dataclass

**Files:**
- Create: `projects/etsy-rooster-shop/src/etsy_rooster/svg_render/__init__.py` (empty)
- Create: `projects/etsy-rooster-shop/src/etsy_rooster/svg_render/artifact.py`
- Create: `projects/etsy-rooster-shop/tests/test_artifact.py`

- [ ] **Step 1: Write the failing test**

`tests/test_artifact.py`:

```python
from __future__ import annotations

from pathlib import Path

import pytest

from etsy_rooster.svg_render.artifact import SvgArtifact


def test_artifact_minimum_fields() -> None:
    a = SvgArtifact(
        sku="mandala-alpha",
        master_svg_path=Path("/tmp/a.svg"),
        preview_png_paths=[Path("/tmp/a-1.png"), Path("/tmp/a-2.png")],
        dimensions=(1024, 1024),
        theme_tags=["mandala", "geometric"],
    )
    assert a.sku == "mandala-alpha"
    assert a.master_svg_path.name == "a.svg"
    assert len(a.preview_png_paths) == 2
    assert a.dimensions == (1024, 1024)
    assert a.theme_tags == ["mandala", "geometric"]
    assert a.layered_svg_paths is None
    assert a.pdf_path is None


def test_artifact_requires_at_least_one_preview() -> None:
    with pytest.raises(ValueError):
        SvgArtifact(
            sku="x",
            master_svg_path=Path("/tmp/x.svg"),
            preview_png_paths=[],
            dimensions=(1024, 1024),
            theme_tags=[],
        )


def test_artifact_dimensions_must_be_positive() -> None:
    with pytest.raises(ValueError):
        SvgArtifact(
            sku="x",
            master_svg_path=Path("/tmp/x.svg"),
            preview_png_paths=[Path("/tmp/x.png")],
            dimensions=(0, 1024),
            theme_tags=[],
        )
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pytest tests/test_artifact.py -v
```

Expected: 3 errors with `ImportError`.

- [ ] **Step 3: Write the implementation**

`src/etsy_rooster/svg_render/__init__.py`: empty file.

`src/etsy_rooster/svg_render/artifact.py`:

```python
"""Common artifact bundle produced by all generators."""
from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path


@dataclass
class SvgArtifact:
    """A generated piece of art ready for catalog + Etsy upload."""

    sku: str
    master_svg_path: Path
    preview_png_paths: list[Path]
    dimensions: tuple[int, int]  # (width_px, height_px)
    theme_tags: list[str]
    layered_svg_paths: list[Path] | None = None
    pdf_path: Path | None = None

    def __post_init__(self) -> None:
        if not self.preview_png_paths:
            raise ValueError("SvgArtifact requires at least one preview PNG")
        w, h = self.dimensions
        if w <= 0 or h <= 0:
            raise ValueError(f"dimensions must be positive: got {self.dimensions}")
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pytest tests/test_artifact.py -v
```

Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add src/etsy_rooster/svg_render/
git add tests/test_artifact.py
git commit -m "feat(etsy-rooster-shop): SvgArtifact dataclass"
```

---

## Task 4: SVG Validator

**Files:**
- Create: `projects/etsy-rooster-shop/src/etsy_rooster/svg_render/validators.py`
- Create: `projects/etsy-rooster-shop/tests/test_validators.py`

- [ ] **Step 1: Write the failing test**

`tests/test_validators.py`:

```python
from __future__ import annotations

import pytest

from etsy_rooster.svg_render.validators import (
    SvgValidationError,
    validate_svg,
)


GOOD_SVG = """<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <path d="M 10 10 L 90 10 L 90 90 L 10 90 Z" fill="none" stroke="black"/>
  <circle cx="50" cy="50" r="20" fill="none" stroke="black"/>
</svg>"""


def test_valid_svg_passes() -> None:
    validate_svg(GOOD_SVG)  # no exception


def test_missing_viewbox_fails() -> None:
    svg = """<svg xmlns="http://www.w3.org/2000/svg">
        <circle cx="10" cy="10" r="5" fill="none" stroke="black"/>
    </svg>"""
    with pytest.raises(SvgValidationError, match="viewBox"):
        validate_svg(svg)


def test_open_path_fails() -> None:
    # path without Z and not a closed shape
    svg = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
        <path d="M 10 10 L 90 90" fill="none" stroke="black"/>
    </svg>"""
    with pytest.raises(SvgValidationError, match="open path"):
        validate_svg(svg)


def test_zero_area_circle_fails() -> None:
    svg = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
        <circle cx="50" cy="50" r="0" fill="none" stroke="black"/>
    </svg>"""
    with pytest.raises(SvgValidationError, match="zero-area"):
        validate_svg(svg)


def test_circle_is_implicit_closed() -> None:
    svg = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
        <circle cx="50" cy="50" r="10" fill="none" stroke="black"/>
    </svg>"""
    validate_svg(svg)  # circles are always closed


def test_malformed_xml_fails() -> None:
    with pytest.raises(SvgValidationError, match="parse"):
        validate_svg("<svg><circle></svg>")
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pytest tests/test_validators.py -v
```

Expected: 6 import errors.

- [ ] **Step 3: Write the implementation**

`src/etsy_rooster/svg_render/validators.py`:

```python
"""Validate generated SVGs meet commercial cut-file requirements."""
from __future__ import annotations

from lxml import etree

_SVG_NS = "{http://www.w3.org/2000/svg}"


class SvgValidationError(ValueError):
    pass


def validate_svg(svg_text: str) -> None:
    """Raise SvgValidationError if the SVG is unfit for sale.

    Checks:
      - parses as XML
      - has a viewBox attribute on the root
      - all <path> elements have closed shapes (end in Z/z)
      - no zero-area primitives (circle r=0, rect w=0 or h=0)
    """
    try:
        root = etree.fromstring(svg_text.encode("utf-8"))
    except etree.XMLSyntaxError as exc:
        raise SvgValidationError(f"could not parse SVG: {exc}") from exc

    if root.tag != f"{_SVG_NS}svg":
        raise SvgValidationError(f"root is not <svg>: {root.tag}")

    if root.get("viewBox") is None:
        raise SvgValidationError("root <svg> missing viewBox attribute")

    for path in root.iter(f"{_SVG_NS}path"):
        d = (path.get("d") or "").strip()
        if not d:
            raise SvgValidationError("empty path d attribute")
        if "z" not in d.lower():
            raise SvgValidationError(f"open path (no Z/z): {d!r}")

    for circle in root.iter(f"{_SVG_NS}circle"):
        r = float(circle.get("r", "0"))
        if r <= 0:
            raise SvgValidationError(f"zero-area circle r={r}")

    for rect in root.iter(f"{_SVG_NS}rect"):
        w = float(rect.get("width", "0"))
        h = float(rect.get("height", "0"))
        if w <= 0 or h <= 0:
            raise SvgValidationError(f"zero-area rect width={w} height={h}")
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pytest tests/test_validators.py -v
```

Expected: 6 passed.

- [ ] **Step 5: Commit**

```bash
git add src/etsy_rooster/svg_render/validators.py
git add tests/test_validators.py
git commit -m "feat(etsy-rooster-shop): SVG cut-file validator"
```

---

## Task 5: Mandala Generator

**Files:**
- Create: `projects/etsy-rooster-shop/src/etsy_rooster/svg_render/mandala_generator.py`
- Create: `projects/etsy-rooster-shop/tests/test_mandala_generator.py`
- Create: `projects/etsy-rooster-shop/tests/fixtures/mandalas/alpha.svg` (golden, written by test on first run)

- [ ] **Step 1: Write the failing test**

`tests/test_mandala_generator.py`:

```python
from __future__ import annotations

from pathlib import Path

import pytest

from etsy_rooster.svg_render.mandala_generator import (
    MandalaGenerator,
    MandalaParams,
)
from etsy_rooster.svg_render.validators import validate_svg

FIXTURES = Path(__file__).parent / "fixtures" / "mandalas"


def test_alpha_seed_produces_valid_svg() -> None:
    params = MandalaParams(seed="alpha", rings=5, petals_per_ring=(8, 12, 16, 12, 8))
    svg = MandalaGenerator().render_svg(params)
    validate_svg(svg)


def test_same_seed_same_output_is_deterministic() -> None:
    params = MandalaParams(seed="alpha", rings=5, petals_per_ring=(8, 12, 16, 12, 8))
    a = MandalaGenerator().render_svg(params)
    b = MandalaGenerator().render_svg(params)
    assert a == b


def test_matches_golden_file(tmp_path: Path) -> None:
    """First run writes the golden; subsequent runs compare bit-for-bit."""
    params = MandalaParams(seed="alpha", rings=5, petals_per_ring=(8, 12, 16, 12, 8))
    actual = MandalaGenerator().render_svg(params)
    golden = FIXTURES / "alpha.svg"
    if not golden.exists():
        FIXTURES.mkdir(parents=True, exist_ok=True)
        golden.write_text(actual, encoding="utf-8")
    assert actual == golden.read_text(encoding="utf-8")


def test_rings_must_match_petals_length() -> None:
    with pytest.raises(ValueError):
        MandalaParams(seed="x", rings=3, petals_per_ring=(8, 12))


def test_render_includes_one_ring_per_param() -> None:
    params = MandalaParams(seed="ring-count", rings=3, petals_per_ring=(6, 8, 10))
    svg = MandalaGenerator().render_svg(params)
    # Each ring contributes a number of <circle> petals equal to petals_per_ring[i]
    assert svg.count("<circle") == 6 + 8 + 10
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pytest tests/test_mandala_generator.py -v
```

Expected: import error.

- [ ] **Step 3: Write the implementation**

`src/etsy_rooster/svg_render/mandala_generator.py`:

```python
"""Deterministic parametric mandala renderer.

Produces a radially symmetric arrangement of circular petals across N rings.
The geometry is fully determined by MandalaParams; same params -> identical SVG.
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field


CANVAS = 1024  # px square viewBox; mandala drawn centered


@dataclass(frozen=True)
class MandalaParams:
    seed: str
    rings: int = 5
    petals_per_ring: tuple[int, ...] = (8, 12, 16, 12, 8)
    inner_radius: float = 80.0
    outer_radius: float = 460.0
    petal_radius_factor: float = 0.45  # petal size as fraction of ring spacing
    stroke_width: float = 2.0
    stroke: str = "#000000"
    fill: str = "none"

    def __post_init__(self) -> None:
        if len(self.petals_per_ring) != self.rings:
            raise ValueError(
                f"petals_per_ring length {len(self.petals_per_ring)} "
                f"must equal rings={self.rings}"
            )
        if self.inner_radius <= 0 or self.outer_radius <= self.inner_radius:
            raise ValueError("inner_radius must be >0 and < outer_radius")


class MandalaGenerator:
    """Renders MandalaParams -> SVG text."""

    def render_svg(self, params: MandalaParams) -> str:
        cx = cy = CANVAS / 2
        rings_spacing = (params.outer_radius - params.inner_radius) / max(
            params.rings - 1, 1
        )
        petal_radius = rings_spacing * params.petal_radius_factor

        elements: list[str] = []
        # central seed circle (sized > 0 so validator accepts)
        elements.append(
            f'<circle cx="{cx:.2f}" cy="{cy:.2f}" r="{params.inner_radius / 2:.2f}" '
            f'fill="{params.fill}" stroke="{params.stroke}" '
            f'stroke-width="{params.stroke_width:.2f}"/>'
        )
        for ring_idx in range(params.rings):
            if params.rings == 1:
                r = params.inner_radius
            else:
                r = params.inner_radius + ring_idx * rings_spacing
            count = params.petals_per_ring[ring_idx]
            for petal_idx in range(count):
                angle = 2 * math.pi * petal_idx / count
                px = cx + r * math.cos(angle)
                py = cy + r * math.sin(angle)
                elements.append(
                    f'<circle cx="{px:.2f}" cy="{py:.2f}" r="{petal_radius:.2f}" '
                    f'fill="{params.fill}" stroke="{params.stroke}" '
                    f'stroke-width="{params.stroke_width:.2f}"/>'
                )

        body = "\n  ".join(elements)
        return (
            '<?xml version="1.0" encoding="UTF-8"?>\n'
            f'<svg xmlns="http://www.w3.org/2000/svg" '
            f'viewBox="0 0 {CANVAS} {CANVAS}" '
            f'width="{CANVAS}" height="{CANVAS}">\n  '
            f"{body}\n"
            "</svg>\n"
        )
```

- [ ] **Step 4: Run tests; first run writes the golden file**

```bash
pytest tests/test_mandala_generator.py -v
```

Expected: 5 passed (the golden test self-bootstraps on first run).

- [ ] **Step 5: Visually inspect the golden**

Open `tests/fixtures/mandalas/alpha.svg` in a browser or Inkscape. Confirm it looks like a recognizable mandala. If it doesn't, fix `mandala_generator.py` and delete the golden so the next test run rewrites it.

- [ ] **Step 6: Commit**

```bash
git add src/etsy_rooster/svg_render/mandala_generator.py
git add tests/test_mandala_generator.py
git add tests/fixtures/mandalas/alpha.svg
git commit -m "feat(etsy-rooster-shop): deterministic mandala generator"
```

---

## Task 6: Rasterize SVG to PNG Preview

**Files:**
- Modify: `projects/etsy-rooster-shop/src/etsy_rooster/svg_render/mandala_generator.py` (add render_artifact method)
- Modify: `projects/etsy-rooster-shop/tests/test_mandala_generator.py` (add test)
- Modify: `projects/etsy-rooster-shop/pyproject.toml` (add cairosvg dependency)

We need PNG previews for Etsy thumbnails. Use `cairosvg` since it ships pre-built wheels and handles plain SVG cleanly.

- [ ] **Step 1: Add cairosvg to dependencies**

In `pyproject.toml` under `[project] dependencies`, add:

```toml
    "cairosvg>=2.7,<3",
```

Then:

```bash
pip install -e ".[dev]"
```

- [ ] **Step 2: Write the failing test**

Append to `tests/test_mandala_generator.py`:

```python
def test_render_artifact_writes_svg_and_pngs(tmp_path: Path) -> None:
    gen = MandalaGenerator()
    params = MandalaParams(seed="rast", rings=3, petals_per_ring=(6, 8, 10))
    artifact = gen.render_artifact(params, output_dir=tmp_path)
    assert artifact.sku == "mandala-rast"
    assert artifact.master_svg_path.exists()
    assert artifact.master_svg_path.suffix == ".svg"
    assert len(artifact.preview_png_paths) == 1
    for p in artifact.preview_png_paths:
        assert p.exists()
        assert p.suffix == ".png"
        assert p.stat().st_size > 1000  # non-trivial png
    assert artifact.dimensions == (1024, 1024)
    assert "mandala" in artifact.theme_tags
```

- [ ] **Step 3: Run the new test to verify it fails**

```bash
pytest tests/test_mandala_generator.py::test_render_artifact_writes_svg_and_pngs -v
```

Expected: `AttributeError: 'MandalaGenerator' object has no attribute 'render_artifact'`.

- [ ] **Step 4: Add render_artifact to MandalaGenerator**

Append to `src/etsy_rooster/svg_render/mandala_generator.py`:

```python
from pathlib import Path

import cairosvg

from etsy_rooster.svg_render.artifact import SvgArtifact


class MandalaGenerator:
    # ... existing render_svg method ...

    def render_artifact(self, params: MandalaParams, *, output_dir: Path) -> SvgArtifact:
        output_dir.mkdir(parents=True, exist_ok=True)
        sku = f"mandala-{params.seed}"
        svg_text = self.render_svg(params)

        svg_path = output_dir / f"{sku}.svg"
        svg_path.write_text(svg_text, encoding="utf-8")

        preview_path = output_dir / f"{sku}-preview.png"
        cairosvg.svg2png(
            bytestring=svg_text.encode("utf-8"),
            write_to=str(preview_path),
            output_width=1024,
            output_height=1024,
        )

        return SvgArtifact(
            sku=sku,
            master_svg_path=svg_path,
            preview_png_paths=[preview_path],
            dimensions=(CANVAS, CANVAS),
            theme_tags=["mandala", "geometric", "svg", "cricut", "cut-file"],
        )
```

**Note:** the `class MandalaGenerator:` line should *replace* the existing one — Python doesn't allow re-opening a class. Easier: leave one class block and put both methods in it. Final state of the class:

```python
class MandalaGenerator:
    """Renders MandalaParams -> SVG text or full SvgArtifact bundle."""

    def render_svg(self, params: MandalaParams) -> str:
        # (existing body unchanged)
        ...

    def render_artifact(self, params: MandalaParams, *, output_dir: Path) -> SvgArtifact:
        # (new method as above)
        ...
```

- [ ] **Step 5: Run all mandala tests**

```bash
pytest tests/test_mandala_generator.py -v
```

Expected: 6 passed.

- [ ] **Step 6: Commit**

```bash
git add pyproject.toml \
        projects/etsy-rooster-shop/src/etsy_rooster/svg_render/mandala_generator.py \
        projects/etsy-rooster-shop/tests/test_mandala_generator.py
git commit -m "feat(etsy-rooster-shop): rasterize mandala SVG to PNG preview"
```

---

## Task 7: ListingDraft dataclass + Etsy field validators

**Files:**
- Create: `projects/etsy-rooster-shop/src/etsy_rooster/listing_authoring/__init__.py` (empty)
- Create: `projects/etsy-rooster-shop/src/etsy_rooster/listing_authoring/author.py` (partial — just ListingDraft for now)
- Create: `projects/etsy-rooster-shop/tests/test_listing_authoring.py`

- [ ] **Step 1: Write the failing test**

`tests/test_listing_authoring.py`:

```python
from __future__ import annotations

import pytest

from etsy_rooster.listing_authoring.author import ListingDraft


def test_valid_listing_draft() -> None:
    d = ListingDraft(
        title="Mandala SVG Cut File for Cricut",
        tags=["mandala", "svg", "cricut", "cut file", "vinyl", "decal",
              "geometric", "boho", "yoga", "meditation", "wall art",
              "instant download", "digital"],
        description="A 12-inch mandala for Cricut. Files: SVG, PNG, DXF.",
        price_usd=3.50,
        materials=["digital", "svg", "png"],
    )
    assert len(d.tags) == 13
    assert d.price_usd == 3.50


def test_title_too_long_rejected() -> None:
    with pytest.raises(ValueError, match="title"):
        ListingDraft(
            title="x" * 141,
            tags=["a"] * 13,
            description="d",
            price_usd=1.0,
            materials=[],
        )


def test_must_have_exactly_13_tags() -> None:
    with pytest.raises(ValueError, match="13 tags"):
        ListingDraft(
            title="t", tags=["a"] * 12, description="d", price_usd=1.0, materials=[]
        )


def test_tag_too_long_rejected() -> None:
    bad = ["a" * 21] + ["b"] * 12
    with pytest.raises(ValueError, match="20"):
        ListingDraft(title="t", tags=bad, description="d", price_usd=1.0, materials=[])


def test_negative_price_rejected() -> None:
    with pytest.raises(ValueError, match="price"):
        ListingDraft(
            title="t", tags=["a"] * 13, description="d", price_usd=-1.0, materials=[]
        )


def test_empty_description_rejected() -> None:
    with pytest.raises(ValueError, match="description"):
        ListingDraft(
            title="t", tags=["a"] * 13, description="", price_usd=1.0, materials=[]
        )
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pytest tests/test_listing_authoring.py -v
```

Expected: import errors.

- [ ] **Step 3: Implement ListingDraft**

`src/etsy_rooster/listing_authoring/__init__.py`: empty file.

`src/etsy_rooster/listing_authoring/author.py`:

```python
"""LLM-driven Etsy listing metadata authoring."""
from __future__ import annotations

from dataclasses import dataclass, field

MAX_TITLE_LEN = 140
REQUIRED_TAG_COUNT = 13
MAX_TAG_LEN = 20


@dataclass(frozen=True)
class ListingDraft:
    """Etsy-compliant listing metadata. Validation runs in __post_init__."""

    title: str
    tags: list[str]
    description: str
    price_usd: float
    materials: list[str]

    def __post_init__(self) -> None:
        if not self.title or len(self.title) > MAX_TITLE_LEN:
            raise ValueError(
                f"title must be 1..{MAX_TITLE_LEN} chars, got {len(self.title)}"
            )
        if len(self.tags) != REQUIRED_TAG_COUNT:
            raise ValueError(
                f"Etsy requires exactly {REQUIRED_TAG_COUNT} tags, got {len(self.tags)}"
            )
        for t in self.tags:
            if not t or len(t) > MAX_TAG_LEN:
                raise ValueError(f"tag {t!r} exceeds {MAX_TAG_LEN} chars")
        if not self.description:
            raise ValueError("description must be non-empty")
        if self.price_usd <= 0:
            raise ValueError(f"price_usd must be > 0, got {self.price_usd}")
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pytest tests/test_listing_authoring.py -v
```

Expected: 6 passed.

- [ ] **Step 5: Commit**

```bash
git add src/etsy_rooster/listing_authoring/
git add tests/test_listing_authoring.py
git commit -m "feat(etsy-rooster-shop): ListingDraft with Etsy field validation"
```

---

## Task 8: LLMListingAuthor (mocked LLM)

**Files:**
- Modify: `projects/etsy-rooster-shop/src/etsy_rooster/listing_authoring/author.py`
- Create: `projects/etsy-rooster-shop/src/etsy_rooster/listing_authoring/prompts/mandala-prompt.md`
- Modify: `projects/etsy-rooster-shop/tests/test_listing_authoring.py`

- [ ] **Step 1: Write the failing test**

Append to `tests/test_listing_authoring.py`:

```python
import json
from pathlib import Path

from etsy_rooster.listing_authoring.author import LLMListingAuthor


class _FakeLLM:
    """Mock LLM that returns a canned JSON response."""

    def __init__(self, response: dict) -> None:
        self.response = response
        self.last_prompt: str | None = None

    def complete_json(self, *, system: str, user: str) -> dict:
        self.last_prompt = user
        return self.response


def test_author_mandala_listing_returns_listing_draft() -> None:
    fake = _FakeLLM(response={
        "title": "Sacred Geometry Mandala SVG Cut File",
        "tags": ["mandala", "svg", "cricut", "cut file", "vinyl", "decal",
                 "geometric", "boho", "yoga", "meditation", "wall art",
                 "instant download", "digital"],
        "description": "A radially symmetric mandala SVG for Cricut, Silhouette, "
                       "and other cutting machines. Files included: SVG, PNG.",
        "price_usd": 3.5,
        "materials": ["digital", "svg", "png"],
    })
    author = LLMListingAuthor(llm=fake, prompts_dir=_default_prompts_dir())
    draft = author.author(
        niche="mandala",
        artifact_summary={"sku": "mandala-alpha", "theme_tags": ["mandala", "boho"]},
    )
    assert draft.title.startswith("Sacred Geometry")
    assert "mandala" in fake.last_prompt
    assert "boho" in fake.last_prompt


def test_author_retries_on_invalid_json() -> None:
    bad_then_good = _ScriptedLLM([
        {"title": "x" * 200, "tags": [], "description": "", "price_usd": -1,
         "materials": []},  # invalid
        {"title": "Mandala SVG", "tags": ["a"] * 13, "description": "d",
         "price_usd": 1.0, "materials": ["digital"]},  # valid
    ])
    author = LLMListingAuthor(llm=bad_then_good, prompts_dir=_default_prompts_dir())
    draft = author.author(niche="mandala", artifact_summary={"sku": "x"})
    assert draft.title == "Mandala SVG"
    assert bad_then_good.call_count == 2


def test_author_gives_up_after_three_failures() -> None:
    bad = _ScriptedLLM([
        {"title": "x" * 200, "tags": [], "description": "",
         "price_usd": -1, "materials": []},
    ] * 3)
    author = LLMListingAuthor(llm=bad, prompts_dir=_default_prompts_dir())
    import pytest as _pytest
    with _pytest.raises(RuntimeError, match="3 attempts"):
        author.author(niche="mandala", artifact_summary={"sku": "x"})


class _ScriptedLLM:
    def __init__(self, responses: list[dict]) -> None:
        self._responses = responses
        self.call_count = 0

    def complete_json(self, *, system: str, user: str) -> dict:
        r = self._responses[self.call_count]
        self.call_count += 1
        return r


def _default_prompts_dir() -> Path:
    from etsy_rooster.listing_authoring import author as _author_mod
    return Path(_author_mod.__file__).parent / "prompts"
```

- [ ] **Step 2: Write the prompt file**

`src/etsy_rooster/listing_authoring/prompts/mandala-prompt.md`:

```markdown
# System

You write Etsy listings for procedurally generated mandala SVG cut files for
Pocket Rooster Press. The shop sells digital downloads (SVG, PNG) for Cricut,
Silhouette, and similar cutting machines. Voice: warm, calm, hobby-craft tone.
Never make up the file contents — the artifact summary lists what's included.

Return a single JSON object with these exact keys:
  title (string, <= 140 chars, keyword-front-loaded)
  tags (array of exactly 13 strings, each <= 20 chars, lowercase, no commas)
  description (string, includes: what it is, what files are included,
               compatible machines, license note, no refunds for digital)
  price_usd (number between 1.5 and 5.0)
  materials (array of 1..6 short strings)

# User

Niche: {niche}
Artifact summary: {artifact_summary_json}
```

- [ ] **Step 3: Run failing tests**

```bash
pytest tests/test_listing_authoring.py::test_author_mandala_listing_returns_listing_draft -v
```

Expected: `ImportError: cannot import name 'LLMListingAuthor'`.

- [ ] **Step 4: Implement LLMListingAuthor**

Append to `src/etsy_rooster/listing_authoring/author.py`:

```python
import json
from pathlib import Path
from typing import Any, Protocol


class _LLMClient(Protocol):
    def complete_json(self, *, system: str, user: str) -> dict[str, Any]: ...


class LLMListingAuthor:
    """Calls an injected LLM client, validates, retries up to 3x."""

    MAX_ATTEMPTS = 3

    def __init__(self, llm: _LLMClient, prompts_dir: Path) -> None:
        self._llm = llm
        self._prompts_dir = prompts_dir

    def author(self, *, niche: str, artifact_summary: dict[str, Any]) -> ListingDraft:
        system, user = self._load_prompt(niche, artifact_summary)
        last_error: Exception | None = None
        for _ in range(self.MAX_ATTEMPTS):
            try:
                resp = self._llm.complete_json(system=system, user=user)
                return ListingDraft(
                    title=resp["title"],
                    tags=list(resp["tags"]),
                    description=resp["description"],
                    price_usd=float(resp["price_usd"]),
                    materials=list(resp.get("materials", [])),
                )
            except (ValueError, KeyError, TypeError) as exc:
                last_error = exc
                continue
        raise RuntimeError(
            f"LLM authoring failed after {self.MAX_ATTEMPTS} attempts: {last_error}"
        )

    def _load_prompt(self, niche: str, artifact_summary: dict[str, Any]) -> tuple[str, str]:
        path = self._prompts_dir / f"{niche}-prompt.md"
        text = path.read_text(encoding="utf-8")
        # Split on first "# User" header
        head, _, tail = text.partition("# User")
        system = head.replace("# System", "").strip()
        user = tail.strip().format(
            niche=niche,
            artifact_summary_json=json.dumps(artifact_summary),
        )
        return system, user
```

- [ ] **Step 5: Run tests; verify all pass**

```bash
pytest tests/test_listing_authoring.py -v
```

Expected: 9 passed (6 prior + 3 new).

- [ ] **Step 6: Commit**

```bash
git add src/etsy_rooster/listing_authoring/
git add tests/test_listing_authoring.py
git commit -m "feat(etsy-rooster-shop): LLM-driven listing authoring with retry"
```

---

## Task 9: Gemini LLM Adapter (Live Smoke Test)

**Files:**
- Create: `projects/etsy-rooster-shop/src/etsy_rooster/listing_authoring/gemini_adapter.py`
- Modify: `projects/etsy-rooster-shop/tests/test_listing_authoring.py`

- [ ] **Step 1: Write the gemini adapter**

`src/etsy_rooster/listing_authoring/gemini_adapter.py`:

```python
"""Adapter from google-generativeai to the _LLMClient protocol."""
from __future__ import annotations

import json
import os
from typing import Any

import google.generativeai as genai


class GeminiListingClient:
    """Wraps Gemini Pro for JSON listing authoring."""

    def __init__(self, *, api_key: str | None = None, model: str = "gemini-2.0-pro-exp") -> None:
        key = api_key or os.environ.get("GEMINI_API_KEY")
        if not key:
            raise RuntimeError("GEMINI_API_KEY not set")
        genai.configure(api_key=key)
        self._model = genai.GenerativeModel(model)

    def complete_json(self, *, system: str, user: str) -> dict[str, Any]:
        prompt = f"{system}\n\n{user}\n\nRespond with only a JSON object."
        resp = self._model.generate_content(
            prompt,
            generation_config={
                "response_mime_type": "application/json",
                "temperature": 0.7,
            },
        )
        text = resp.text.strip()
        return json.loads(text)
```

- [ ] **Step 2: Write the live smoke test**

Append to `tests/test_listing_authoring.py`:

```python
import os

import pytest


@pytest.mark.live
@pytest.mark.skipif(
    not os.environ.get("GEMINI_API_KEY"),
    reason="GEMINI_API_KEY not set",
)
def test_gemini_authors_a_mandala_listing() -> None:
    from etsy_rooster.listing_authoring.gemini_adapter import GeminiListingClient

    author = LLMListingAuthor(
        llm=GeminiListingClient(),
        prompts_dir=_default_prompts_dir(),
    )
    draft = author.author(
        niche="mandala",
        artifact_summary={
            "sku": "mandala-alpha",
            "theme_tags": ["mandala", "geometric", "boho", "yoga"],
            "dimensions": [1024, 1024],
        },
    )
    print("title:", draft.title)
    print("tags:", draft.tags)
    assert len(draft.title) <= 140
    assert len(draft.tags) == 13
```

- [ ] **Step 3: Run the live test (manual)**

```bash
GEMINI_API_KEY=<your-key> pytest tests/test_listing_authoring.py -v -m live
```

Expected: 1 passed. Inspect the printed title and tags — they should look like reasonable Etsy listing copy.

- [ ] **Step 4: Run non-live tests stay green**

```bash
pytest tests/test_listing_authoring.py -v
```

Expected: 9 passed, 1 deselected (the `@pytest.mark.live` one).

- [ ] **Step 5: Commit**

```bash
git add src/etsy_rooster/listing_authoring/gemini_adapter.py
git add tests/test_listing_authoring.py
git commit -m "feat(etsy-rooster-shop): Gemini listing adapter + live smoke test"
```

---

## Task 10: Etsy OAuth2 PKCE Flow

**Files:**
- Create: `projects/etsy-rooster-shop/src/etsy_rooster/etsy/__init__.py` (empty)
- Create: `projects/etsy-rooster-shop/src/etsy_rooster/etsy/oauth.py`
- Create: `projects/etsy-rooster-shop/tests/test_etsy_oauth.py`
- Create: `projects/etsy-rooster-shop/scripts/etsy_oauth_setup.py`

Etsy v3 uses OAuth2 PKCE. Reference: https://developers.etsy.com/documentation/essentials/authentication. The flow:

1. Generate code_verifier + code_challenge (S256).
2. Open browser to Etsy authorize URL with `response_type=code&client_id=<keystring>&redirect_uri=<uri>&scope=listings_w%20listings_r%20transactions_r&state=<random>&code_challenge=<challenge>&code_challenge_method=S256`.
3. Etsy redirects back to `redirect_uri?code=<auth_code>&state=<state>`.
4. POST to `https://api.etsy.com/v3/public/oauth/token` with grant_type=authorization_code + code_verifier.
5. Persist access_token + refresh_token to `~/.etsy-rooster/token.json`.

- [ ] **Step 1: Write the failing test (pure-logic parts)**

`tests/test_etsy_oauth.py`:

```python
from __future__ import annotations

import base64
import hashlib
import json
from pathlib import Path

import pytest

from etsy_rooster.etsy.oauth import (
    EtsyOAuthConfig,
    TokenStore,
    build_authorize_url,
    code_challenge_from_verifier,
    new_code_verifier,
)


def test_code_verifier_is_url_safe_and_long() -> None:
    v = new_code_verifier()
    assert 43 <= len(v) <= 128
    assert all(c.isalnum() or c in "-._~" for c in v)


def test_code_challenge_matches_rfc7636() -> None:
    v = "test_verifier_with_known_value_1234567890abcdef"
    expected = (
        base64.urlsafe_b64encode(hashlib.sha256(v.encode()).digest())
        .rstrip(b"=")
        .decode()
    )
    assert code_challenge_from_verifier(v) == expected


def test_build_authorize_url_has_required_params() -> None:
    cfg = EtsyOAuthConfig(
        keystring="K",
        shared_secret="S",
        redirect_uri="http://localhost:3003/cb",
        scopes=["listings_r", "listings_w"],
    )
    url = build_authorize_url(cfg, code_challenge="CHALLENGE", state="STATE")
    assert "client_id=K" in url
    assert "redirect_uri=http%3A%2F%2Flocalhost%3A3003%2Fcb" in url
    assert "code_challenge=CHALLENGE" in url
    assert "code_challenge_method=S256" in url
    assert "state=STATE" in url
    assert "scope=listings_r+listings_w" in url
    assert "response_type=code" in url


def test_token_store_round_trip(tmp_path: Path) -> None:
    store = TokenStore(path=tmp_path / "token.json")
    store.save(
        access_token="A",
        refresh_token="R",
        expires_in=3600,
    )
    loaded = store.load()
    assert loaded["access_token"] == "A"
    assert loaded["refresh_token"] == "R"
    # token.json should be mode 0600
    mode = (tmp_path / "token.json").stat().st_mode & 0o777
    assert mode == 0o600


def test_token_store_missing_raises(tmp_path: Path) -> None:
    store = TokenStore(path=tmp_path / "nope.json")
    with pytest.raises(FileNotFoundError):
        store.load()
```

- [ ] **Step 2: Run failing tests**

```bash
pytest tests/test_etsy_oauth.py -v
```

Expected: import errors.

- [ ] **Step 3: Implement etsy/oauth.py**

`src/etsy_rooster/etsy/__init__.py`: empty.

`src/etsy_rooster/etsy/oauth.py`:

```python
"""Etsy OAuth2 PKCE flow + token persistence."""
from __future__ import annotations

import base64
import hashlib
import json
import os
import secrets
import time
from dataclasses import dataclass, field
from pathlib import Path
from urllib.parse import urlencode

import requests

ETSY_AUTH_BASE = "https://www.etsy.com/oauth/connect"
ETSY_TOKEN_URL = "https://api.etsy.com/v3/public/oauth/token"
DEFAULT_TOKEN_PATH = Path.home() / ".etsy-rooster" / "token.json"


@dataclass(frozen=True)
class EtsyOAuthConfig:
    keystring: str
    shared_secret: str
    redirect_uri: str
    scopes: list[str] = field(default_factory=lambda: ["listings_r", "listings_w"])


def new_code_verifier() -> str:
    return secrets.token_urlsafe(64)[:96]


def code_challenge_from_verifier(verifier: str) -> str:
    digest = hashlib.sha256(verifier.encode()).digest()
    return base64.urlsafe_b64encode(digest).rstrip(b"=").decode()


def build_authorize_url(cfg: EtsyOAuthConfig, *, code_challenge: str, state: str) -> str:
    params = {
        "response_type": "code",
        "client_id": cfg.keystring,
        "redirect_uri": cfg.redirect_uri,
        "scope": " ".join(cfg.scopes),
        "state": state,
        "code_challenge": code_challenge,
        "code_challenge_method": "S256",
    }
    return f"{ETSY_AUTH_BASE}?{urlencode(params)}"


def exchange_code_for_token(
    cfg: EtsyOAuthConfig, *, code: str, code_verifier: str
) -> dict:
    resp = requests.post(
        ETSY_TOKEN_URL,
        data={
            "grant_type": "authorization_code",
            "client_id": cfg.keystring,
            "redirect_uri": cfg.redirect_uri,
            "code": code,
            "code_verifier": code_verifier,
        },
        timeout=30,
    )
    resp.raise_for_status()
    return resp.json()


def refresh_token(cfg: EtsyOAuthConfig, *, refresh_token: str) -> dict:
    resp = requests.post(
        ETSY_TOKEN_URL,
        data={
            "grant_type": "refresh_token",
            "client_id": cfg.keystring,
            "refresh_token": refresh_token,
        },
        timeout=30,
    )
    resp.raise_for_status()
    return resp.json()


class TokenStore:
    """Persists access/refresh tokens at a user-scoped path."""

    def __init__(self, *, path: Path = DEFAULT_TOKEN_PATH) -> None:
        self._path = path

    def save(self, *, access_token: str, refresh_token: str, expires_in: int) -> None:
        self._path.parent.mkdir(parents=True, exist_ok=True)
        payload = {
            "access_token": access_token,
            "refresh_token": refresh_token,
            "expires_at": int(time.time()) + expires_in,
        }
        self._path.write_text(json.dumps(payload), encoding="utf-8")
        os.chmod(self._path, 0o600)

    def load(self) -> dict:
        return json.loads(self._path.read_text(encoding="utf-8"))

    def is_expired(self) -> bool:
        try:
            data = self.load()
        except FileNotFoundError:
            return True
        return time.time() >= data.get("expires_at", 0) - 60
```

- [ ] **Step 4: Write the interactive bootstrap script**

`scripts/etsy_oauth_setup.py`:

```python
"""Interactive bootstrap for Etsy OAuth.

Run once per machine. Opens browser, captures code via local HTTP listener,
exchanges for tokens, writes ~/.etsy-rooster/token.json.
"""
from __future__ import annotations

import http.server
import os
import secrets
import socketserver
import threading
import urllib.parse
import webbrowser

from dotenv import load_dotenv

from etsy_rooster.etsy.oauth import (
    EtsyOAuthConfig,
    TokenStore,
    build_authorize_url,
    code_challenge_from_verifier,
    exchange_code_for_token,
    new_code_verifier,
)


def main() -> None:
    load_dotenv()
    cfg = EtsyOAuthConfig(
        keystring=os.environ["ETSY_KEYSTRING"],
        shared_secret=os.environ["ETSY_SHARED_SECRET"],
        redirect_uri=os.environ.get("ETSY_REDIRECT_URI", "http://localhost:3003/oauth/callback"),
    )

    verifier = new_code_verifier()
    challenge = code_challenge_from_verifier(verifier)
    state = secrets.token_urlsafe(16)
    auth_url = build_authorize_url(cfg, code_challenge=challenge, state=state)

    received_code: dict[str, str] = {}

    class Handler(http.server.BaseHTTPRequestHandler):
        def do_GET(self) -> None:  # noqa: N802
            qs = urllib.parse.urlparse(self.path).query
            params = dict(urllib.parse.parse_qsl(qs))
            if params.get("state") != state:
                self.send_response(400)
                self.end_headers()
                self.wfile.write(b"state mismatch")
                return
            received_code["code"] = params["code"]
            self.send_response(200)
            self.send_header("Content-Type", "text/plain")
            self.end_headers()
            self.wfile.write(b"OAuth complete. You can close this tab.")

        def log_message(self, *args: object) -> None:
            return  # quiet

    parsed = urllib.parse.urlparse(cfg.redirect_uri)
    port = parsed.port or 3003
    server = socketserver.TCPServer(("localhost", port), Handler)
    t = threading.Thread(target=server.handle_request, daemon=True)
    t.start()

    print(f"Opening browser: {auth_url}")
    webbrowser.open(auth_url)
    t.join(timeout=300)
    server.server_close()

    if "code" not in received_code:
        raise SystemExit("did not receive an authorization code; aborting")

    tokens = exchange_code_for_token(
        cfg, code=received_code["code"], code_verifier=verifier
    )
    store = TokenStore()
    store.save(
        access_token=tokens["access_token"],
        refresh_token=tokens["refresh_token"],
        expires_in=int(tokens["expires_in"]),
    )
    print(f"Saved token to {store._path}")


if __name__ == "__main__":
    main()
```

- [ ] **Step 5: Run tests**

```bash
pytest tests/test_etsy_oauth.py -v
```

Expected: 5 passed.

- [ ] **Step 6: Commit**

```bash
git add src/etsy_rooster/etsy/
git add tests/test_etsy_oauth.py
git add scripts/etsy_oauth_setup.py
git commit -m "feat(etsy-rooster-shop): Etsy OAuth2 PKCE + token store + bootstrap script"
```

---

## Task 11: EtsyClient (mocked HTTP)

**Files:**
- Create: `projects/etsy-rooster-shop/src/etsy_rooster/etsy/client.py`
- Create: `projects/etsy-rooster-shop/tests/test_etsy_client.py`

Etsy v3 endpoints used in v1:
- `POST /v3/application/shops/{shop_id}/listings` — create draft listing.
- `POST /v3/application/shops/{shop_id}/listings/{listing_id}/images` — upload image.
- `POST /v3/application/shops/{shop_id}/listings/{listing_id}/files` — upload digital file.
- `PUT /v3/application/shops/{shop_id}/listings/{listing_id}` — update (e.g., state=active).
- `GET /v3/application/listings/{listing_id}` — read.

Auth: `Authorization: Bearer <access_token>` + `x-api-key: <keystring>`.

- [ ] **Step 1: Write failing tests with the `responses` library**

`tests/test_etsy_client.py`:

```python
from __future__ import annotations

from pathlib import Path

import pytest
import responses

from etsy_rooster.etsy.client import EtsyClient


@pytest.fixture
def client() -> EtsyClient:
    return EtsyClient(
        keystring="K",
        access_token="ACCESS",
        shop_id=12345,
        base_url="https://openapi.etsy.com",
    )


@responses.activate
def test_create_draft_listing(client: EtsyClient) -> None:
    responses.add(
        responses.POST,
        "https://openapi.etsy.com/v3/application/shops/12345/listings",
        json={"listing_id": 999, "state": "draft"},
        status=201,
    )
    result = client.create_draft_listing(
        title="Mandala SVG",
        description="A mandala.",
        price_usd=3.50,
        quantity=999,
        taxonomy_id=68,  # craft supplies > svg cut files
        tags=["mandala", "svg"],
        materials=["digital", "svg"],
        who_made="i_did",
        when_made="2020_2024",
        type_="download",
    )
    assert result["listing_id"] == 999
    req = responses.calls[0].request
    assert req.headers["Authorization"] == "Bearer ACCESS"
    assert req.headers["x-api-key"] == "K"


@responses.activate
def test_upload_listing_image(client: EtsyClient, tmp_path: Path) -> None:
    img = tmp_path / "preview.png"
    img.write_bytes(b"\x89PNG\r\n\x1a\nfakebytes")
    responses.add(
        responses.POST,
        "https://openapi.etsy.com/v3/application/shops/12345/listings/999/images",
        json={"listing_image_id": 7777},
        status=201,
    )
    out = client.upload_listing_image(listing_id=999, image_path=img, rank=1)
    assert out["listing_image_id"] == 7777


@responses.activate
def test_upload_digital_file(client: EtsyClient, tmp_path: Path) -> None:
    f = tmp_path / "art.svg"
    f.write_text("<svg/>")
    responses.add(
        responses.POST,
        "https://openapi.etsy.com/v3/application/shops/12345/listings/999/files",
        json={"listing_file_id": 5555},
        status=201,
    )
    out = client.upload_digital_file(listing_id=999, file_path=f, name="art.svg")
    assert out["listing_file_id"] == 5555


@responses.activate
def test_activate_listing(client: EtsyClient) -> None:
    responses.add(
        responses.PUT,
        "https://openapi.etsy.com/v3/application/shops/12345/listings/999",
        json={"listing_id": 999, "state": "active"},
        status=200,
    )
    out = client.activate_listing(listing_id=999)
    assert out["state"] == "active"


@responses.activate
def test_get_listing(client: EtsyClient) -> None:
    responses.add(
        responses.GET,
        "https://openapi.etsy.com/v3/application/listings/999",
        json={"listing_id": 999, "state": "draft"},
        status=200,
    )
    out = client.get_listing(999)
    assert out["state"] == "draft"


@responses.activate
def test_rate_limit_retries_then_succeeds(client: EtsyClient) -> None:
    url = "https://openapi.etsy.com/v3/application/listings/999"
    responses.add(responses.GET, url, status=429, headers={"Retry-After": "0"})
    responses.add(responses.GET, url, json={"listing_id": 999, "state": "draft"}, status=200)
    out = client.get_listing(999)
    assert out["state"] == "draft"
    assert len(responses.calls) == 2
```

- [ ] **Step 2: Run failing tests**

```bash
pytest tests/test_etsy_client.py -v
```

Expected: import errors.

- [ ] **Step 3: Implement EtsyClient**

`src/etsy_rooster/etsy/client.py`:

```python
"""Thin wrapper around Etsy Open API v3."""
from __future__ import annotations

import time
from pathlib import Path
from typing import Any

import requests


class EtsyAPIError(RuntimeError):
    def __init__(self, status: int, body: str) -> None:
        super().__init__(f"Etsy API {status}: {body[:200]}")
        self.status = status
        self.body = body


class EtsyClient:
    """Bearer-token client for Etsy v3 application endpoints."""

    MAX_RETRIES = 3
    BACKOFF_SECONDS = 1.0

    def __init__(
        self,
        *,
        keystring: str,
        access_token: str,
        shop_id: int,
        base_url: str = "https://openapi.etsy.com",
    ) -> None:
        self._keystring = keystring
        self._access_token = access_token
        self._shop_id = shop_id
        self._base = base_url
        self._session = requests.Session()

    # ---------- public API ----------

    def create_draft_listing(
        self,
        *,
        title: str,
        description: str,
        price_usd: float,
        quantity: int,
        taxonomy_id: int,
        tags: list[str],
        materials: list[str],
        who_made: str,
        when_made: str,
        type_: str,
    ) -> dict[str, Any]:
        return self._post(
            f"/v3/application/shops/{self._shop_id}/listings",
            data={
                "title": title,
                "description": description,
                "price": price_usd,
                "quantity": quantity,
                "taxonomy_id": taxonomy_id,
                "tags": ",".join(tags),
                "materials": ",".join(materials),
                "who_made": who_made,
                "when_made": when_made,
                "type": type_,
                "state": "draft",
            },
        )

    def upload_listing_image(
        self, *, listing_id: int, image_path: Path, rank: int = 1
    ) -> dict[str, Any]:
        with image_path.open("rb") as fh:
            files = {"image": (image_path.name, fh, "image/png")}
            return self._post_multipart(
                f"/v3/application/shops/{self._shop_id}/listings/{listing_id}/images",
                files=files,
                data={"rank": rank},
            )

    def upload_digital_file(
        self, *, listing_id: int, file_path: Path, name: str
    ) -> dict[str, Any]:
        with file_path.open("rb") as fh:
            files = {"file": (name, fh, "application/octet-stream")}
            return self._post_multipart(
                f"/v3/application/shops/{self._shop_id}/listings/{listing_id}/files",
                files=files,
                data={"name": name},
            )

    def activate_listing(self, *, listing_id: int) -> dict[str, Any]:
        return self._put(
            f"/v3/application/shops/{self._shop_id}/listings/{listing_id}",
            data={"state": "active"},
        )

    def get_listing(self, listing_id: int) -> dict[str, Any]:
        return self._get(f"/v3/application/listings/{listing_id}")

    # ---------- internal ----------

    def _headers(self) -> dict[str, str]:
        return {
            "Authorization": f"Bearer {self._access_token}",
            "x-api-key": self._keystring,
        }

    def _get(self, path: str) -> dict[str, Any]:
        return self._with_retry(lambda: self._session.get(
            f"{self._base}{path}", headers=self._headers(), timeout=30
        ))

    def _post(self, path: str, *, data: dict) -> dict[str, Any]:
        return self._with_retry(lambda: self._session.post(
            f"{self._base}{path}", headers=self._headers(), data=data, timeout=30
        ))

    def _put(self, path: str, *, data: dict) -> dict[str, Any]:
        return self._with_retry(lambda: self._session.put(
            f"{self._base}{path}", headers=self._headers(), data=data, timeout=30
        ))

    def _post_multipart(self, path: str, *, files: dict, data: dict) -> dict[str, Any]:
        return self._with_retry(lambda: self._session.post(
            f"{self._base}{path}", headers=self._headers(), files=files,
            data=data, timeout=60
        ))

    def _with_retry(self, op):  # type: ignore[no-untyped-def]
        for attempt in range(self.MAX_RETRIES):
            resp = op()
            if resp.status_code == 429:
                retry_after = float(resp.headers.get("Retry-After", "1"))
                time.sleep(max(retry_after, 0))
                continue
            if 200 <= resp.status_code < 300:
                return resp.json()
            raise EtsyAPIError(resp.status_code, resp.text)
        raise EtsyAPIError(429, "rate-limited after retries")
```

- [ ] **Step 4: Run tests**

```bash
pytest tests/test_etsy_client.py -v
```

Expected: 6 passed.

- [ ] **Step 5: Commit**

```bash
git add src/etsy_rooster/etsy/client.py
git add tests/test_etsy_client.py
git commit -m "feat(etsy-rooster-shop): EtsyClient with retry + multipart uploads"
```

---

## Task 12: Publish Orchestrator

**Files:**
- Create: `projects/etsy-rooster-shop/src/etsy_rooster/publish/__init__.py` (empty)
- Create: `projects/etsy-rooster-shop/src/etsy_rooster/publish/orchestrator.py`
- Create: `projects/etsy-rooster-shop/tests/test_publish_orchestrator.py`

Takes an AUTHORED sku → calls EtsyClient → records etsy_listing in catalog DB → transitions sku to STAGED.

- [ ] **Step 1: Write the failing test**

`tests/test_publish_orchestrator.py`:

```python
from __future__ import annotations

import json
import sqlite3
from pathlib import Path
from unittest.mock import MagicMock

import pytest

from etsy_rooster.catalog_db import CatalogDB, SkuState
from etsy_rooster.publish.orchestrator import PublishOrchestrator


@pytest.fixture
def populated_db(in_memory_db: sqlite3.Connection, tmp_path: Path) -> tuple[CatalogDB, int, Path, Path]:
    db = CatalogDB(in_memory_db)
    db.init_schema()
    sku_id = db.create_sku(niche="mandala", params={"seed": "alpha"})
    svg = tmp_path / "art.svg"
    svg.write_text("<svg/>", encoding="utf-8")
    png = tmp_path / "preview.png"
    png.write_bytes(b"\x89PNG\r\n\x1a\nx")
    db.attach_artifact_file(sku_id, kind="svg", path=str(svg))
    db.attach_artifact_file(sku_id, kind="preview_png", path=str(png))
    db.set_listing_metadata(
        sku_id,
        title="Mandala SVG",
        tags=["a"] * 13,
        description="d",
        price_usd=3.5,
        materials=["digital", "svg"],
    )
    return db, sku_id, svg, png


def test_publish_creates_listing_uploads_assets_and_transitions(
    populated_db: tuple[CatalogDB, int, Path, Path],
) -> None:
    db, sku_id, _svg, _png = populated_db

    etsy = MagicMock()
    etsy.create_draft_listing.return_value = {"listing_id": 999, "state": "draft"}
    etsy.upload_listing_image.return_value = {"listing_image_id": 7}
    etsy.upload_digital_file.return_value = {"listing_file_id": 5}

    orch = PublishOrchestrator(db=db, etsy=etsy, taxonomy_id=68)
    listing_id = orch.publish(sku_id)

    assert listing_id == 999
    etsy.create_draft_listing.assert_called_once()
    etsy.upload_listing_image.assert_called_once()
    etsy.upload_digital_file.assert_called_once()
    assert db.current_state(sku_id) is SkuState.STAGED


def test_publish_is_idempotent(
    populated_db: tuple[CatalogDB, int, Path, Path],
) -> None:
    db, sku_id, _svg, _png = populated_db
    etsy = MagicMock()
    etsy.create_draft_listing.return_value = {"listing_id": 999, "state": "draft"}
    etsy.upload_listing_image.return_value = {"listing_image_id": 7}
    etsy.upload_digital_file.return_value = {"listing_file_id": 5}
    orch = PublishOrchestrator(db=db, etsy=etsy, taxonomy_id=68)
    orch.publish(sku_id)

    # Second call: no-op
    second = orch.publish(sku_id)
    assert second == 999
    assert etsy.create_draft_listing.call_count == 1
```

- [ ] **Step 2: Run failing test**

```bash
pytest tests/test_publish_orchestrator.py -v
```

Expected: import error.

- [ ] **Step 3: Implement orchestrator**

`src/etsy_rooster/publish/__init__.py`: empty.

`src/etsy_rooster/publish/orchestrator.py`:

```python
"""Coordinates DB + EtsyClient to push one AUTHORED sku to a draft listing."""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from etsy_rooster.catalog_db import CatalogDB, SkuState


class PublishOrchestrator:
    """Take an AUTHORED sku, create Etsy draft, upload assets, mark STAGED."""

    def __init__(
        self,
        *,
        db: CatalogDB,
        etsy: Any,  # duck-typed EtsyClient
        taxonomy_id: int,
        quantity: int = 999,
        who_made: str = "i_did",
        when_made: str = "2020_2024",
    ) -> None:
        self._db = db
        self._etsy = etsy
        self._taxonomy_id = taxonomy_id
        self._quantity = quantity
        self._who_made = who_made
        self._when_made = when_made

    def publish(self, sku_id: int) -> int:
        # Idempotency: if already published, return existing id.
        state = self._db.current_state(sku_id)
        if state in (SkuState.STAGED, SkuState.LIVE):
            row = self._db._conn.execute(  # pragma: hack — small encapsulation break
                "SELECT etsy_listing_id FROM etsy_listing WHERE sku_id = ?",
                (sku_id,),
            ).fetchone()
            if row:
                return int(row["etsy_listing_id"])

        meta_row = self._db._conn.execute(
            "SELECT title, tags_json, description, price_usd, materials_json "
            "FROM listing_metadata WHERE sku_id = ?",
            (sku_id,),
        ).fetchone()
        if meta_row is None:
            raise RuntimeError(f"sku {sku_id} has no listing metadata")

        files = self._db.list_artifact_files(sku_id)
        svgs = [f for f in files if f["kind"] == "svg"]
        previews = [f for f in files if f["kind"] == "preview_png"]
        if not svgs or not previews:
            raise RuntimeError(f"sku {sku_id} missing svg or preview_png artifact")

        listing = self._etsy.create_draft_listing(
            title=meta_row["title"],
            description=meta_row["description"],
            price_usd=float(meta_row["price_usd"]),
            quantity=self._quantity,
            taxonomy_id=self._taxonomy_id,
            tags=json.loads(meta_row["tags_json"]),
            materials=json.loads(meta_row["materials_json"] or "[]"),
            who_made=self._who_made,
            when_made=self._when_made,
            type_="download",
        )
        listing_id = int(listing["listing_id"])

        self._etsy.upload_listing_image(
            listing_id=listing_id,
            image_path=Path(previews[0]["path"]),
            rank=1,
        )
        self._etsy.upload_digital_file(
            listing_id=listing_id,
            file_path=Path(svgs[0]["path"]),
            name=Path(svgs[0]["path"]).name,
        )

        self._db.set_etsy_listing(sku_id, etsy_listing_id=listing_id, state="draft")
        self._db.log_op(sku_id, event="published_draft", detail=f"listing_id={listing_id}")
        return listing_id
```

- [ ] **Step 4: Run tests**

```bash
pytest tests/test_publish_orchestrator.py -v
```

Expected: 2 passed.

- [ ] **Step 5: Commit**

```bash
git add src/etsy_rooster/publish/
git add tests/test_publish_orchestrator.py
git commit -m "feat(etsy-rooster-shop): PublishOrchestrator (DB + EtsyClient glue)"
```

---

## Task 13: Config + CLI entry point

**Files:**
- Create: `projects/etsy-rooster-shop/src/etsy_rooster/config.py`
- Create: `projects/etsy-rooster-shop/src/etsy_rooster/cli.py`
- Create: `projects/etsy-rooster-shop/tests/test_cli.py`

- [ ] **Step 1: Write failing CLI tests using click.testing**

`tests/test_cli.py`:

```python
from __future__ import annotations

from pathlib import Path

from click.testing import CliRunner

from etsy_rooster.cli import cli


def test_cli_help() -> None:
    r = CliRunner().invoke(cli, ["--help"])
    assert r.exit_code == 0
    assert "generate" in r.output
    assert "author-metadata" in r.output
    assert "publish" in r.output
    assert "audit" in r.output


def test_generate_mandala_creates_sku(tmp_data_dir: Path) -> None:
    r = CliRunner().invoke(cli, ["generate", "mandala", "--seed", "alpha"])
    assert r.exit_code == 0, r.output
    assert "sku_id=" in r.output

    # Artifact files should exist
    artifacts = list((tmp_data_dir / "artifacts").rglob("*.svg"))
    assert len(artifacts) == 1
```

- [ ] **Step 2: Run failing test**

```bash
pytest tests/test_cli.py -v
```

Expected: import error.

- [ ] **Step 3: Implement config + cli**

`src/etsy_rooster/config.py`:

```python
"""Environment + path config."""
from __future__ import annotations

import os
from pathlib import Path


def data_dir() -> Path:
    p = Path(os.environ.get("ETSY_ROOSTER_DATA_DIR", "./data")).resolve()
    p.mkdir(parents=True, exist_ok=True)
    return p


def db_path() -> Path:
    return data_dir() / "catalog.db"


def artifacts_dir() -> Path:
    d = data_dir() / "artifacts"
    d.mkdir(parents=True, exist_ok=True)
    return d
```

`src/etsy_rooster/cli.py`:

```python
"""click CLI: etsy-rooster ..."""
from __future__ import annotations

import sqlite3

import click

from etsy_rooster import config
from etsy_rooster.catalog_db import CatalogDB
from etsy_rooster.svg_render.mandala_generator import MandalaGenerator, MandalaParams


def _db() -> CatalogDB:
    conn = sqlite3.connect(config.db_path())
    db = CatalogDB(conn)
    # init_schema is idempotent once Task 13 Step 4 changes the schema to
    # `CREATE TABLE IF NOT EXISTS` — see that step. Always safe to call.
    db.init_schema()
    return db


@click.group()
def cli() -> None:
    """Pocket Rooster Press — Etsy automation CLI."""


@cli.group()
def generate() -> None:
    """Generate new SKUs."""


@generate.command("mandala")
@click.option("--seed", required=True, help="Identifier for this mandala variant.")
@click.option("--rings", default=5, type=int)
def generate_mandala(seed: str, rings: int) -> None:
    db = _db()
    petals = (8, 12, 16, 12, 8)[:rings] if rings <= 5 else (8, 12, 16, 12, 8) + (16,) * (rings - 5)
    params = MandalaParams(seed=seed, rings=rings, petals_per_ring=tuple(petals))
    gen = MandalaGenerator()
    out_dir = config.artifacts_dir() / f"mandala-{seed}"
    artifact = gen.render_artifact(params, output_dir=out_dir)
    sku_id = db.create_sku(niche="mandala", params={"seed": seed, "rings": rings})
    db.attach_artifact_file(sku_id, kind="svg", path=str(artifact.master_svg_path))
    for png in artifact.preview_png_paths:
        db.attach_artifact_file(sku_id, kind="preview_png", path=str(png))
    db.log_op(sku_id, event="generated", detail=f"seed={seed}")
    click.echo(f"sku_id={sku_id} sku={artifact.sku} files={artifact.master_svg_path}")


@cli.command("author-metadata")
@click.option("--sku-id", required=True, type=int)
def author_metadata(sku_id: int) -> None:
    """Run LLM listing authoring for one sku."""
    import json

    from etsy_rooster.listing_authoring.author import LLMListingAuthor
    from etsy_rooster.listing_authoring.gemini_adapter import GeminiListingClient
    from pathlib import Path

    db = _db()
    row = db.get_sku(sku_id)
    params = json.loads(row["generator_params_json"])
    summary = {"sku": f"{row['niche']}-{params.get('seed', sku_id)}", "params": params}

    prompts_dir = Path(__file__).parent / "listing_authoring" / "prompts"
    author = LLMListingAuthor(llm=GeminiListingClient(), prompts_dir=prompts_dir)
    draft = author.author(niche=row["niche"], artifact_summary=summary)
    db.set_listing_metadata(
        sku_id,
        title=draft.title,
        tags=draft.tags,
        description=draft.description,
        price_usd=draft.price_usd,
        materials=draft.materials,
    )
    db.log_op(sku_id, event="authored", detail=f"title={draft.title!r}")
    click.echo(f"authored sku_id={sku_id} title={draft.title!r}")


@cli.command("publish")
@click.option("--sku-id", required=True, type=int)
@click.option("--env", type=click.Choice(["sandbox", "production"]), default="sandbox")
def publish(sku_id: int, env: str) -> None:
    """Push one AUTHORED sku to Etsy as a draft listing."""
    import os
    from etsy_rooster.etsy.client import EtsyClient
    from etsy_rooster.etsy.oauth import TokenStore
    from etsy_rooster.publish.orchestrator import PublishOrchestrator

    db = _db()
    tokens = TokenStore().load()
    base = "https://openapi.etsy.com" if env == "production" else "https://openapi.etsy.com"
    # NOTE: Etsy currently has no separate sandbox host; sandbox uses test
    # listings with state=draft on production endpoints. See open issue:
    # https://github.com/etsy/open-api/issues/...
    etsy = EtsyClient(
        keystring=os.environ["ETSY_KEYSTRING"],
        access_token=tokens["access_token"],
        shop_id=int(os.environ["ETSY_SHOP_ID"]),
        base_url=base,
    )
    orch = PublishOrchestrator(db=db, etsy=etsy, taxonomy_id=68)
    listing_id = orch.publish(sku_id)
    click.echo(f"published sku_id={sku_id} etsy_listing_id={listing_id}")


@cli.command("audit")
def audit() -> None:
    """Print catalog snapshot."""
    db = _db()
    rows = list(db._conn.execute(
        "SELECT id, niche, state, created_at FROM sku ORDER BY id"
    ))
    for r in rows:
        click.echo(f"#{r['id']} {r['niche']} {r['state']} {r['created_at']}")
```

**Note on the `_db()` init_schema guard:** the current `CatalogDB.init_schema` will fail if tables already exist. Update `catalog_db.py` to use `CREATE TABLE IF NOT EXISTS` in the schema (one-line edit in each `CREATE TABLE`). Apply this change as part of this task.

- [ ] **Step 4: Update catalog_db.py schema to be idempotent**

Edit `_SCHEMA` in `src/etsy_rooster/catalog_db.py` — replace every `CREATE TABLE ` with `CREATE TABLE IF NOT EXISTS `.

- [ ] **Step 5: Run tests**

```bash
pytest tests/test_cli.py -v
```

Expected: 2 passed.

- [ ] **Step 6: Run all tests**

```bash
pytest -v
```

Expected: all green except `@pytest.mark.live` (skipped).

- [ ] **Step 7: Commit**

```bash
git add src/etsy_rooster/cli.py \
        projects/etsy-rooster-shop/src/etsy_rooster/config.py \
        projects/etsy-rooster-shop/src/etsy_rooster/catalog_db.py \
        projects/etsy-rooster-shop/tests/test_cli.py
git commit -m "feat(etsy-rooster-shop): click CLI with generate/author-metadata/publish/audit"
```

---

## Task 14: End-to-end Etsy Sandbox Integration Test

**Files:**
- Create: `projects/etsy-rooster-shop/tests/integration/__init__.py` (empty)
- Create: `projects/etsy-rooster-shop/tests/integration/test_e2e_sandbox.py`

This is the integration milestone: actually push one mandala to Etsy's API and confirm the draft listing exists. Marked `@pytest.mark.live` so CI doesn't run it.

**Prerequisites for running:**
1. Etsy developer app registered, keystring + shared_secret in `.env`.
2. `python scripts/etsy_oauth_setup.py` has been run; `~/.etsy-rooster/token.json` exists.
3. `ETSY_SHOP_ID` set in `.env` to the user's shop id.

- [ ] **Step 1: Write the integration test**

`tests/integration/__init__.py`: empty.

`tests/integration/test_e2e_sandbox.py`:

```python
from __future__ import annotations

import os
import sqlite3
from pathlib import Path

import pytest
from dotenv import load_dotenv

from etsy_rooster.catalog_db import CatalogDB, SkuState
from etsy_rooster.etsy.client import EtsyClient
from etsy_rooster.etsy.oauth import TokenStore
from etsy_rooster.listing_authoring.author import LLMListingAuthor
from etsy_rooster.listing_authoring.gemini_adapter import GeminiListingClient
from etsy_rooster.publish.orchestrator import PublishOrchestrator
from etsy_rooster.svg_render.mandala_generator import MandalaGenerator, MandalaParams


pytestmark = pytest.mark.live


@pytest.fixture(scope="module", autouse=True)
def _load_env() -> None:
    load_dotenv()


@pytest.mark.skipif(
    not os.environ.get("ETSY_KEYSTRING")
    or not os.environ.get("ETSY_SHOP_ID")
    or not os.environ.get("GEMINI_API_KEY"),
    reason="Etsy + Gemini credentials not configured",
)
def test_end_to_end_one_mandala_to_etsy_draft(tmp_path: Path) -> None:
    # 1. Generate mandala artifact
    gen = MandalaGenerator()
    params = MandalaParams(
        seed=f"e2e-{os.getpid()}",
        rings=5,
        petals_per_ring=(8, 12, 16, 12, 8),
    )
    out_dir = tmp_path / "artifacts"
    artifact = gen.render_artifact(params, output_dir=out_dir)

    # 2. Set up DB and register SKU
    conn = sqlite3.connect(":memory:")
    db = CatalogDB(conn)
    db.init_schema()
    sku_id = db.create_sku(niche="mandala", params={"seed": params.seed})
    db.attach_artifact_file(sku_id, kind="svg", path=str(artifact.master_svg_path))
    for p in artifact.preview_png_paths:
        db.attach_artifact_file(sku_id, kind="preview_png", path=str(p))

    # 3. Author metadata via Gemini
    prompts_dir = Path(__file__).parents[2] / "src" / "etsy_rooster" / "listing_authoring" / "prompts"
    author = LLMListingAuthor(llm=GeminiListingClient(), prompts_dir=prompts_dir)
    draft = author.author(
        niche="mandala",
        artifact_summary={"sku": artifact.sku, "theme_tags": artifact.theme_tags},
    )
    db.set_listing_metadata(
        sku_id,
        title=draft.title,
        tags=draft.tags,
        description=draft.description,
        price_usd=draft.price_usd,
        materials=draft.materials,
    )

    # 4. Publish via real Etsy API (creates draft listing)
    tokens = TokenStore().load()
    etsy = EtsyClient(
        keystring=os.environ["ETSY_KEYSTRING"],
        access_token=tokens["access_token"],
        shop_id=int(os.environ["ETSY_SHOP_ID"]),
    )
    orch = PublishOrchestrator(db=db, etsy=etsy, taxonomy_id=68)
    listing_id = orch.publish(sku_id)

    # 5. Verify
    assert listing_id > 0
    assert db.current_state(sku_id) is SkuState.STAGED

    # 6. Round-trip: fetch from Etsy and confirm state
    fetched = etsy.get_listing(listing_id)
    assert fetched["state"] == "draft"
    print(f"Created draft listing {listing_id}: {draft.title!r}")
    print(f"View at: https://www.etsy.com/your/shops/me/draft-listings")
```

- [ ] **Step 2: Run the integration test (requires real credentials)**

```bash
pytest tests/integration/test_e2e_sandbox.py -v -m live -s
```

Expected: 1 passed. The test prints the new draft listing id and a link to inspect it in the Etsy seller dashboard.

- [ ] **Step 3: Manually inspect the draft on Etsy**

Open https://www.etsy.com/your/shops/me/draft-listings. The new mandala draft should be visible with title, tag set, preview image, and an attached digital file (the SVG). Inspect:
- Title is sensible (not malformed)
- 13 tags present, none oddly truncated
- Preview image rendered correctly
- Digital file is the SVG (downloadable)

If anything looks wrong, fix the offending component and rerun.

- [ ] **Step 4: Manually delete the test draft on Etsy**

Click "Delete" on the listing — keeps the dashboard clean for Plan 2 and 3.

- [ ] **Step 5: Commit**

```bash
git add tests/integration/
git commit -m "test(etsy-rooster-shop): end-to-end Etsy sandbox integration test"
```

---

## Task 15: README polish + Plan 1 wrap

**Files:**
- Modify: `projects/etsy-rooster-shop/README.md`

- [ ] **Step 1: Flesh out README**

Replace `README.md`:

```markdown
# Etsy Rooster Shop

Automation pipeline for the Pocket Rooster Press sister shop on Etsy.

Status: **Plan 1 complete** — one mandala can be generated, authored, and pushed to Etsy as a draft listing.

## Setup

1. From `projects/etsy-rooster-shop/`:
   ```bash
   pip install -e ".[dev]"
   ```
2. Copy `.env.example` to `.env` and fill in:
   - `ETSY_KEYSTRING`, `ETSY_SHARED_SECRET` — from https://www.etsy.com/developers/your-apps
   - `ETSY_SHOP_ID` — your shop's numeric id
   - `GEMINI_API_KEY` — same key the KDP project uses
3. Bootstrap Etsy OAuth (one-time per machine):
   ```bash
   python scripts/etsy_oauth_setup.py
   ```
   Opens browser → authorize → token saved to `~/.etsy-rooster/token.json`.

## CLI Usage

```bash
# Generate one mandala
etsy-rooster generate mandala --seed alpha

# Author Etsy listing metadata via Gemini
etsy-rooster author-metadata --sku-id 1

# Push to Etsy as draft listing
etsy-rooster publish --sku-id 1

# Inspect catalog
etsy-rooster audit
```

## Tests

```bash
pytest                # unit tests (fast)
pytest -m live -s     # live tests (Gemini + Etsy)
```

## Design + Plans

- Spec: [docs/superpowers/specs/2026-05-18-etsy-rooster-shop-design.md](../../docs/superpowers/specs/2026-05-18-etsy-rooster-shop-design.md)
- Plan 1 (this codebase): mandala sandbox slice.
- Plan 2: Nano Banana Pro posters + `pocket_rooster_brand` refactor.
- Plan 3: scale to 80 SKUs + launch.
```

- [ ] **Step 2: Final test sweep**

```bash
pytest -v
ruff check src tests
black --check src tests
```

All green.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs(etsy-rooster-shop): Plan 1 complete — README + setup instructions"
```

---

## Plan 1 Definition of Done

- [ ] All 15 tasks committed.
- [ ] `pytest` (non-live) passes 100%.
- [ ] `pytest -m live -s` passes when credentials are present.
- [ ] One real draft listing was created on Etsy via the integration test and manually verified, then deleted.
- [ ] README documents setup and CLI.

When Plan 1 is done, Plan 2 picks up with: factor out `pocket_rooster_brand`, add `NanoBananaClient`, build `PosterGenerator`, support `etsy-rooster generate poster`, regenerate prompts directory with `poster-prompt.md`.
