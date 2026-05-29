-- Migration 0006 — analytics-friendly columns on pinterest_history.
-- Adds: status (TEXT), image_path (TEXT, snapshot from queue), pinterest_url
-- (TEXT, the canonical https://pinterest.com/pin/... permalink for the pin).
-- The legacy `success` INTEGER column stays for backwards compat with
-- listHistory(); new code reads `status` instead.
-- Spec: docs/superpowers/specs/2026-05-29-pinterest-autonomous-feature-design.md §§3, 6

ALTER TABLE pinterest_history ADD COLUMN status TEXT;
ALTER TABLE pinterest_history ADD COLUMN image_path TEXT;
ALTER TABLE pinterest_history ADD COLUMN pinterest_url TEXT;

-- Backfill: derive status from the existing `success` flag for old rows.
UPDATE pinterest_history SET status = 'posted' WHERE success = 1 AND status IS NULL;
UPDATE pinterest_history SET status = 'failed' WHERE success = 0 AND status IS NULL;

-- Backfill image_path from the joined queue row (best-effort; queue rows can
-- be deleted, in which case the history row keeps a NULL image_path).
UPDATE pinterest_history
   SET image_path = (
     SELECT q.image_path FROM pinterest_queue q WHERE q.id = pinterest_history.queue_id
   )
 WHERE image_path IS NULL;

CREATE INDEX IF NOT EXISTS idx_pinterest_history_status_posted_at
  ON pinterest_history(status, posted_at);
