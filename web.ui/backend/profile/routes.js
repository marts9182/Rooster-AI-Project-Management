/**
 * Profile routes — single-row id=1 table read/write.
 *
 *   GET  /  → returns the seeded profile row with pen_names + brand_palette
 *             parsed from JSON columns and time_zone defaulted to
 *             America/Los_Angeles.
 *   PUT  /  → partial update; validates URL + gmail_address shape; serializes
 *             array columns into pen_names_json / brand_palette_json.
 *
 * Body fields outside the allow-list are ignored silently.
 *
 * @module profile/routes
 */
import express from 'express';
import { openDb } from '../db.js';
import { recordEvent } from '../events.js';

const router = express.Router();

/** Plain scalar columns that PUT may overwrite as-is. */
const SCALAR_FIELDS = [
  'display_name',
  'kdp_author_url',
  'etsy_shop_url',
  'pinterest_url',
  'gmail_address',
  'time_zone',
];

/** Fields whose values must be valid http(s) URLs when present. */
const URL_FIELDS = ['kdp_author_url', 'etsy_shop_url', 'pinterest_url'];

/** Simple email shape — good enough for a single-user dashboard. */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Default IANA time zone applied when the column is NULL. */
const DEFAULT_TIME_ZONE = 'America/Los_Angeles';

/**
 * Build the JSON-friendly profile object from a raw `profile` row.
 *
 * @returns {object}
 */
function loadProfile() {
  const db = openDb();
  const row = db.prepare('SELECT * FROM profile WHERE id = 1').get();
  return {
    id: row?.id ?? 1,
    display_name: row?.display_name ?? null,
    pen_names: row?.pen_names_json ? JSON.parse(row.pen_names_json) : [],
    kdp_author_url: row?.kdp_author_url ?? null,
    etsy_shop_url: row?.etsy_shop_url ?? null,
    pinterest_url: row?.pinterest_url ?? null,
    gmail_address: row?.gmail_address ?? null,
    brand_palette: row?.brand_palette_json
      ? JSON.parse(row.brand_palette_json)
      : [],
    time_zone: row?.time_zone ?? DEFAULT_TIME_ZONE,
  };
}

router.get('/', (_req, res) => {
  res.json({ profile: loadProfile() });
});

router.put('/', (req, res) => {
  const body = req.body ?? {};

  // ── Validate array columns ─────────────────────────────────────────────
  if (body.pen_names !== undefined) {
    if (
      !Array.isArray(body.pen_names) ||
      body.pen_names.some((x) => typeof x !== 'string')
    ) {
      return res
        .status(400)
        .json({ error: 'pen_names_must_be_string_array' });
    }
  }
  if (body.brand_palette !== undefined) {
    if (
      !Array.isArray(body.brand_palette) ||
      body.brand_palette.some((x) => typeof x !== 'string')
    ) {
      return res
        .status(400)
        .json({ error: 'brand_palette_must_be_string_array' });
    }
  }

  // ── Validate gmail_address shape (when provided + non-null) ────────────
  if (
    body.gmail_address !== undefined &&
    body.gmail_address !== null &&
    body.gmail_address !== ''
  ) {
    if (
      typeof body.gmail_address !== 'string' ||
      !EMAIL_RE.test(body.gmail_address)
    ) {
      return res.status(400).json({ error: 'gmail_address_invalid' });
    }
  }

  // ── Validate URL fields (when provided + non-null/empty) ───────────────
  for (const f of URL_FIELDS) {
    if (body[f] !== undefined && body[f] !== null && body[f] !== '') {
      if (
        typeof body[f] !== 'string' ||
        !/^https?:\/\//i.test(body[f])
      ) {
        return res.status(400).json({ error: `${f}_must_be_http_url` });
      }
    }
  }

  // ── Build the partial UPDATE ───────────────────────────────────────────
  const db = openDb();
  const sets = [];
  const params = [];

  for (const f of SCALAR_FIELDS) {
    if (f in body) {
      sets.push(`${f} = ?`);
      // Coerce empty strings on URL fields to NULL so DB stays tidy.
      const value =
        body[f] === '' && (URL_FIELDS.includes(f) || f === 'gmail_address')
          ? null
          : (body[f] ?? null);
      params.push(value);
    }
  }
  if (body.pen_names !== undefined) {
    sets.push('pen_names_json = ?');
    params.push(JSON.stringify(body.pen_names));
  }
  if (body.brand_palette !== undefined) {
    sets.push('brand_palette_json = ?');
    params.push(JSON.stringify(body.brand_palette));
  }

  if (sets.length > 0) {
    db.prepare(`UPDATE profile SET ${sets.join(', ')} WHERE id = 1`).run(
      ...params,
    );
    recordEvent('profile:updated', { fields: sets.map((s) => s.split(' = ')[0]) });
  }

  res.json({ profile: loadProfile() });
});

export default router;
