-- Migration 0008 — multi-source pins: tag each queue/history row with its
-- origin (kdp | etsy) and the board it targets.
-- Spec: docs/superpowers/specs/2026-06-03-pinterest-revive-and-etsy-design.md §2.2

ALTER TABLE pinterest_queue   ADD COLUMN source TEXT NOT NULL DEFAULT 'kdp';
ALTER TABLE pinterest_queue   ADD COLUMN source_id TEXT;
ALTER TABLE pinterest_queue   ADD COLUMN board_id TEXT;
ALTER TABLE pinterest_history ADD COLUMN source TEXT NOT NULL DEFAULT 'kdp';
ALTER TABLE pinterest_history ADD COLUMN source_id TEXT;

-- Backfill source_id from the legacy kdp_book_id so old rows keep posting.
UPDATE pinterest_queue
   SET source_id = CAST(kdp_book_id AS TEXT)
 WHERE source_id IS NULL AND kdp_book_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_pinterest_queue_source ON pinterest_queue(source, source_id);
