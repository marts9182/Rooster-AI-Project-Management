-- Migration 0007 — publishing roadmap (planned KDP + Etsy releases).
-- Spec: docs/superpowers/specs/2026-05-29-publishing-roadmap-design.md

CREATE TABLE IF NOT EXISTS publishing_roadmap (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  kind                TEXT NOT NULL CHECK(kind IN ('kdp','etsy')),
  slug                TEXT NOT NULL,
  title               TEXT NOT NULL,
  target_release_date TEXT NOT NULL,
  status              TEXT NOT NULL CHECK(status IN ('planned','building','built','scheduled','published','skipped')),
  source              TEXT NOT NULL CHECK(source IN ('reuse','build')),
  niche               TEXT,
  rationale           TEXT,
  file_lock_date      TEXT,
  kdp_book_id         INTEGER REFERENCES kdp_books(id),
  etsy_listing_id     INTEGER REFERENCES etsy_listings(id),
  notes               TEXT,
  created_at          TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at          TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(kind, slug, target_release_date)
);
CREATE INDEX IF NOT EXISTS idx_roadmap_date ON publishing_roadmap(target_release_date);
CREATE INDEX IF NOT EXISTS idx_roadmap_status ON publishing_roadmap(status);
