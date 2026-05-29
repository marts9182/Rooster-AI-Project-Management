-- Migration 0005 — engagement metrics + variant-uniqueness hash for Pinterest pins.
-- Spec: docs/superpowers/specs/2026-05-29-pinterest-autonomous-feature-design.md §§1, 3

ALTER TABLE pinterest_history ADD COLUMN saves INTEGER;
ALTER TABLE pinterest_history ADD COLUMN clicks INTEGER;
ALTER TABLE pinterest_history ADD COLUMN impressions INTEGER;
ALTER TABLE pinterest_history ADD COLUMN engagement_fetched_at TEXT;

ALTER TABLE pinterest_queue   ADD COLUMN uniqueness_hash TEXT;
ALTER TABLE pinterest_history ADD COLUMN uniqueness_hash TEXT;
CREATE INDEX IF NOT EXISTS idx_pinterest_queue_uniqueness   ON pinterest_queue(uniqueness_hash);
CREATE INDEX IF NOT EXISTS idx_pinterest_history_uniqueness ON pinterest_history(uniqueness_hash);
