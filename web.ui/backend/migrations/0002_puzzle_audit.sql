-- Migration 0002 — adds puzzle audit fields to kdp_books.
-- Source of truth: docs/superpowers/specs/2026-05-26-sudoku-quality-rework-design.md §4

ALTER TABLE kdp_books ADD COLUMN puzzle_audit_status TEXT
    CHECK (puzzle_audit_status IS NULL OR puzzle_audit_status IN ('unchecked','passed','failed'));

ALTER TABLE kdp_books ADD COLUMN puzzle_audit_at TEXT;

ALTER TABLE kdp_books ADD COLUMN puzzle_audit_summary_json TEXT;
