/**
 * Tests for the new auditPuzzles() client function and the KdpBook
 * audit fields. Stubs globalThis.fetch.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { auditPuzzles, ApiError, type KdpBook } from '../api/kdp';

describe('api/kdp.auditPuzzles', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('POSTs to /api/kdp/books/<slug>/audit-puzzles and returns the book', async () => {
    const fakeBook: KdpBook = {
      id: 1,
      slug: 'book-a',
      title: 'Book A',
      subtitle: null,
      asin: null,
      status: 'built',
      release_date: null,
      listing_url: null,
      page_count: 120,
      trim_size: null,
      price_usd: null,
      cover_path: null,
      output_dir: '/x',
      updated_at: '2026-05-26T00:00:00Z',
      puzzle_audit_status: 'passed',
      puzzle_audit_at: '2026-05-26T00:00:01Z',
      puzzle_audit_summary_json:
        '{"puzzles":[],"totals":{"checked":0,"passed":0,"failed":0,"uniqueness_failures":0,"symmetry_failures":0,"tier_mismatches":0}}',
    };
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ book: fakeBook }), { status: 200 }),
    );
    const out = await auditPuzzles('book-a');
    expect(out.puzzle_audit_status).toBe('passed');
    expect(spy).toHaveBeenCalledWith(
      '/api/kdp/books/book-a/audit-puzzles',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('throws ApiError on a non-2xx response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ error: 'invalid_slug' }), { status: 400 }),
    );
    await expect(auditPuzzles('Bad_Slug')).rejects.toBeInstanceOf(ApiError);
  });
});
