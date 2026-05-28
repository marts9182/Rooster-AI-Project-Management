-- Migration 0004 — columns for the KDP bookshelf ingest pipeline.
-- Spec: docs/superpowers/specs/2026-05-27-kdp-bookshelf-scraper-design.md §2

ALTER TABLE kdp_books ADD COLUMN kdp_status_raw TEXT;
ALTER TABLE kdp_books ADD COLUMN last_scraped_at TEXT;
