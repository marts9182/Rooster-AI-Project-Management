/**
 * Tests for the pure KDP parser. Reads a real book directory under
 * projects/kdp-puzzle-press/output/kdp-ready/ as fixture.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  parseMetadataJson,
  parseListingMd,
  mergeBookFields,
} from '../../kdp/parser.js';

const FIXTURE_DIR = path.resolve(
  process.cwd(),
  '../../projects/kdp-puzzle-press/output/kdp-ready/kakuro-quiet-minds',
);

describe('parseMetadataJson', () => {
  it('extracts core fields from a real metadata.json', () => {
    const raw = fs.readFileSync(path.join(FIXTURE_DIR, 'metadata.json'), 'utf8');
    const result = parseMetadataJson(raw);
    expect(result.slug).toBe('kakuro-quiet-minds');
    expect(result.title).toBe('Kakuro for Quiet Minds');
    expect(result.subtitle).toMatch(/Cross-Sum Puzzles/);
    expect(result.trim_size).toBe('8.5x11');
    expect(result.page_count).toBe(180);
    expect(result.price_usd).toBe(9.99);
  });

  it('returns null fields when keys are missing', () => {
    const result = parseMetadataJson('{"book_id":"x","title":"T"}');
    expect(result.slug).toBe('x');
    expect(result.title).toBe('T');
    expect(result.subtitle).toBeNull();
    expect(result.page_count).toBeNull();
    expect(result.price_usd).toBeNull();
  });

  it('throws on invalid JSON', () => {
    expect(() => parseMetadataJson('{not json')).toThrow(/JSON/);
  });
});

describe('parseListingMd', () => {
  it('extracts blurb from Section 5 HTML block of a real listing.md', () => {
    const raw = fs.readFileSync(path.join(FIXTURE_DIR, 'listing.md'), 'utf8');
    const result = parseListingMd(raw);
    expect(result.blurb).toMatch(/Kakuro is the elegant cousin of Sudoku/);
    expect(result.title).toBe('Kakuro for Quiet Minds');
  });

  it('returns null blurb when no Section 5 fenced block', () => {
    const result = parseListingMd('# Title\n\nNo description here.');
    expect(result.title).toBe('Title');
    expect(result.blurb).toBeNull();
  });
});

describe('mergeBookFields', () => {
  it('prefers metadata fields over listing fields where both present', () => {
    const meta = {
      slug: 'a',
      title: 'Meta T',
      subtitle: null,
      page_count: 100,
      price_usd: 9.99,
      trim_size: '6x9',
    };
    const listing = { title: 'Listing T', blurb: 'B', subtitle: 'Listing S' };
    const merged = mergeBookFields(meta, listing);
    expect(merged.title).toBe('Meta T');
    expect(merged.subtitle).toBe('Listing S');
    expect(merged.blurb).toBe('B');
    expect(merged.page_count).toBe(100);
  });
});
