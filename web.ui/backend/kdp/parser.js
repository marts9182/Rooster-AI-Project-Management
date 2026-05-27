/**
 * Pure parsers for KDP `listing.md` + `metadata.json`. No I/O, no DB.
 *
 * Each KDP-ready book lives under
 *   projects/kdp-puzzle-press/output/kdp-ready/<slug>/
 * containing at least:
 *   - metadata.json   structured KDP fields (trim, price, page count, BISAC)
 *   - listing.md      KDP listing copy (title, subtitle, HTML blurb)
 *
 * The parser converts those two files into a shape that matches the
 * `kdp_books` table columns the scanner cares about. Status, ASIN,
 * release_date, listing_url, and notes are intentionally omitted — those
 * are user-managed via dashboard actions.
 *
 * @module kdp/parser
 */

/**
 * @typedef {Object} ParsedMetadata
 * @property {string|null} slug
 * @property {string|null} title
 * @property {string|null} subtitle
 * @property {string|null} trim_size
 * @property {number|null} page_count
 * @property {number|null} price_usd
 */

/**
 * @typedef {Object} ParsedListing
 * @property {string|null} title
 * @property {string|null} subtitle
 * @property {string|null} blurb
 */

/**
 * @typedef {Object} MergedBookFields
 * @property {string|null} slug
 * @property {string|null} title
 * @property {string|null} subtitle
 * @property {string|null} blurb
 * @property {string|null} trim_size
 * @property {number|null} page_count
 * @property {number|null} price_usd
 */

/**
 * Parse a metadata.json blob into a normalized shape.
 *
 * @param {string} raw - File contents of metadata.json.
 * @returns {ParsedMetadata}
 * @throws {Error} If `raw` is not valid JSON.
 */
export function parseMetadataJson(raw) {
  let obj;
  try {
    obj = JSON.parse(raw);
  } catch (err) {
    throw new Error(`Invalid JSON in metadata.json: ${err.message}`);
  }
  const priceUsd =
    obj?.pricing?.list_prices?.amazon_com_USD ??
    obj?.pricing?.list_prices?.USD ??
    null;
  return {
    slug: typeof obj.book_id === 'string' ? obj.book_id : null,
    title: typeof obj.title === 'string' ? obj.title : null,
    subtitle: typeof obj.subtitle === 'string' ? obj.subtitle : null,
    trim_size: typeof obj.trim_size === 'string' ? obj.trim_size : null,
    page_count:
      typeof obj.page_count_target === 'number' ? obj.page_count_target : null,
    price_usd: typeof priceUsd === 'number' ? priceUsd : null,
  };
}

/**
 * Parse listing.md, extracting H1 title, subtitle (Section 2 fenced block),
 * and the Section 5 HTML blurb fenced block.
 *
 * @param {string} raw - File contents of listing.md.
 * @returns {ParsedListing}
 */
export function parseListingMd(raw) {
  // Normalize CRLF/CR so all regexes can assume \n line terminators.
  const text = String(raw).replace(/\r\n?/g, '\n');

  const titleMatch = text.match(/^#\s+(.+?)\s*$/m);
  const title = titleMatch ? titleMatch[1].trim() : null;

  // Section 5 is "## 5. Description (HTML, ...)" followed by ```html ... ```.
  let blurb = null;
  const section5Match = text.match(
    /##\s*5\.[^\n]*\n+```html\n([\s\S]*?)\n```/,
  );
  if (section5Match) {
    blurb = section5Match[1].trim();
  }

  // Section 2 is "## 2. Subtitle" followed by a plain ``` ... ``` fence.
  let subtitle = null;
  const subtitleMatch = text.match(
    /##\s*2\.\s*Subtitle\s*\n+```\n([\s\S]*?)\n```/,
  );
  if (subtitleMatch) {
    subtitle = subtitleMatch[1].trim();
  }

  return { title, subtitle, blurb };
}

/**
 * Merge metadata (primary) with listing.md (fallback) into one row shape
 * suitable for upsert into `kdp_books`. Metadata wins on fields where both
 * are present; listing fills the gaps.
 *
 * @param {ParsedMetadata} meta
 * @param {ParsedListing} listing
 * @returns {MergedBookFields}
 */
export function mergeBookFields(meta, listing) {
  return {
    slug: meta.slug ?? null,
    title: meta.title ?? listing.title ?? meta.slug ?? null,
    subtitle: meta.subtitle ?? listing.subtitle ?? null,
    blurb: listing.blurb ?? null,
    trim_size: meta.trim_size ?? null,
    page_count: meta.page_count ?? null,
    price_usd: meta.price_usd ?? null,
  };
}
