-- Migration 0001 — initial schema for the Publishing Ops Dashboard.
-- Source of truth: docs/superpowers/specs/2026-05-26-publishing-ops-dashboard-design.md §4

CREATE TABLE IF NOT EXISTS kdp_books (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  slug            TEXT NOT NULL UNIQUE,
  title           TEXT NOT NULL,
  subtitle        TEXT,
  asin            TEXT,
  status          TEXT NOT NULL CHECK(status IN ('built','in_review','published','archived')),
  release_date    TEXT,
  listing_url     TEXT,
  page_count      INTEGER,
  trim_size       TEXT,
  price_usd       REAL,
  blurb           TEXT,
  cover_path      TEXT,
  output_dir      TEXT NOT NULL,
  notes           TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_kdp_books_status ON kdp_books(status);

CREATE TABLE IF NOT EXISTS etsy_listings (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  etsy_listing_id   INTEGER NOT NULL UNIQUE,
  sku_id            TEXT,
  title             TEXT NOT NULL,
  status            TEXT NOT NULL,
  section           TEXT,
  niche             TEXT,
  price_usd         REAL,
  favorites         INTEGER DEFAULT 0,
  views             INTEGER DEFAULT 0,
  listed_at         TEXT,
  last_synced_at    TEXT NOT NULL DEFAULT (datetime('now')),
  listing_url       TEXT
);
CREATE INDEX IF NOT EXISTS idx_etsy_listings_status ON etsy_listings(status);

CREATE TABLE IF NOT EXISTS reminders (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  title           TEXT NOT NULL,
  body            TEXT,
  due_at          TEXT NOT NULL,
  channel         TEXT NOT NULL,
  status          TEXT NOT NULL CHECK(status IN ('pending','fired','dismissed','failed')),
  source_kind     TEXT,
  source_id       INTEGER,
  payload_json    TEXT,
  fired_at        TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_reminders_due ON reminders(status, due_at);

CREATE TABLE IF NOT EXISTS pinterest_queue (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  kdp_book_id     INTEGER REFERENCES kdp_books(id),
  pin_type        TEXT NOT NULL,
  image_path      TEXT NOT NULL,
  title           TEXT NOT NULL,
  description     TEXT NOT NULL,
  link_url        TEXT NOT NULL,
  status          TEXT NOT NULL CHECK(status IN ('pending','posting','posted','failed','paused')),
  scheduled_for   TEXT NOT NULL,
  attempts        INTEGER DEFAULT 0,
  last_error      TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_pinterest_queue_due ON pinterest_queue(status, scheduled_for);

CREATE TABLE IF NOT EXISTS pinterest_history (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  queue_id          INTEGER NOT NULL REFERENCES pinterest_queue(id),
  pinterest_pin_id  TEXT,
  posted_at         TEXT NOT NULL DEFAULT (datetime('now')),
  success           INTEGER NOT NULL,
  error_message     TEXT
);

CREATE TABLE IF NOT EXISTS events (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  kind            TEXT NOT NULL,
  payload_json    TEXT NOT NULL,
  occurred_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_events_kind_time ON events(kind, occurred_at);

CREATE TABLE IF NOT EXISTS profile (
  id                 INTEGER PRIMARY KEY CHECK (id = 1),
  display_name       TEXT,
  pen_names_json     TEXT,
  kdp_author_url     TEXT,
  etsy_shop_url      TEXT,
  pinterest_url      TEXT,
  gmail_address      TEXT,
  brand_palette_json TEXT,
  time_zone          TEXT DEFAULT 'America/Los_Angeles'
);
INSERT OR IGNORE INTO profile(id) VALUES (1);
