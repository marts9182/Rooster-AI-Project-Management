import { describe, it, expect, vi, beforeEach } from 'vitest';
import { importRoadmap } from '../import_roadmap.mjs';

const SAMPLE_YAML = `
entries:
  - kind: kdp
    slug: foo
    title: Foo
    target_release_date: '2026-08-15'
    status: planned
    source: reuse
    niche: faith
  - kind: kdp
    slug: bar
    title: Bar
    target_release_date: '2026-09-15'
    status: planned
    source: build
`;

function mockJson(body, ok = true, status = 200) {
  return { ok, status, json: async () => body, text: async () => '{}' };
}

describe('importRoadmap', () => {
  /** @type {ReturnType<typeof vi.fn>} */
  let fetchFn;
  beforeEach(() => { fetchFn = vi.fn(); });

  it('POSTs each entry and counts created/updated', async () => {
    fetchFn
      // Per-entry KDP live-state lookup (both 404 — not yet built/published).
      .mockResolvedValueOnce(mockJson({ error: 'not_found' }, false, 404))
      .mockResolvedValueOnce(mockJson({ row: { id: 1 } }, true, 201))
      .mockResolvedValueOnce(mockJson({ error: 'not_found' }, false, 404))
      .mockResolvedValueOnce(mockJson({ row: { id: 2 } }, true, 201));
    const result = await importRoadmap({ yaml: SAMPLE_YAML, fetchFn, baseUrl: 'http://x' });
    expect(result.created).toBe(2);
    expect(result.updated).toBe(0);
    expect(result.errors).toEqual([]);
    // 2 lookups + 2 POSTs = 4 fetch calls.
    expect(fetchFn).toHaveBeenCalledTimes(4);
  });

  it('on 409 falls back to PUT and counts as updated', async () => {
    fetchFn
      // Entry 1 KDP lookup: 404.
      .mockResolvedValueOnce(mockJson({ error: 'not_found' }, false, 404))
      // Entry 1 POST → 409.
      .mockResolvedValueOnce(mockJson({ error: 'dup' }, false, 409))
      // Entry 1 GET on the conflict-resolution lookup.
      .mockResolvedValueOnce(mockJson({ rows: [{ id: 42, kind: 'kdp', slug: 'foo', target_release_date: '2026-08-15' }] }))
      // Entry 1 PUT.
      .mockResolvedValueOnce(mockJson({ row: { id: 42 } }))
      // Entry 2 KDP lookup: 404.
      .mockResolvedValueOnce(mockJson({ error: 'not_found' }, false, 404))
      // Entry 2 POST → 201.
      .mockResolvedValueOnce(mockJson({ row: { id: 2 } }, true, 201));
    const result = await importRoadmap({ yaml: SAMPLE_YAML, fetchFn, baseUrl: 'http://x' });
    expect(result.created).toBe(1);
    expect(result.updated).toBe(1);
    expect(result.errors).toEqual([]);
  });

  it('captures errors without aborting the run', async () => {
    fetchFn
      .mockResolvedValueOnce(mockJson({ error: 'not_found' }, false, 404))
      .mockResolvedValueOnce(mockJson({ error: 'boom' }, false, 500))
      .mockResolvedValueOnce(mockJson({ error: 'not_found' }, false, 404))
      .mockResolvedValueOnce(mockJson({ row: { id: 2 } }, true, 201));
    const result = await importRoadmap({ yaml: SAMPLE_YAML, fetchFn, baseUrl: 'http://x' });
    expect(result.created).toBe(1);
    expect(result.errors.length).toBe(1);
    expect(result.errors[0]).toMatch(/foo/);
  });

  it('auto-reconciles KDP entry to published when kdp_books shows the book is already live', async () => {
    fetchFn
      // First entry: importer does a GET /api/kdp/books/foo to check live state.
      .mockResolvedValueOnce(mockJson({ book: { slug: 'foo', status: 'published', asin: 'B0X' } }))
      // Then POSTs with status overridden to 'published'.
      .mockResolvedValueOnce(mockJson({ row: { id: 1 } }, true, 201))
      // Second entry: kdp_books returns 404 (not published yet); POST goes through as planned.
      .mockResolvedValueOnce(mockJson({ error: 'not_found' }, false, 404))
      .mockResolvedValueOnce(mockJson({ row: { id: 2 } }, true, 201));
    const result = await importRoadmap({ yaml: SAMPLE_YAML, fetchFn, baseUrl: 'http://x' });
    expect(result.created).toBe(2);
    // First POST should have had status='published', second status='planned'.
    const postCalls = fetchFn.mock.calls.filter((c) => {
      const opts = c[1];
      return opts && opts.method === 'POST' && String(c[0]).endsWith('/api/roadmap');
    });
    expect(postCalls.length).toBe(2);
    const body0 = JSON.parse(postCalls[0][1].body);
    const body1 = JSON.parse(postCalls[1][1].body);
    expect(body0.status).toBe('published');
    expect(body1.status).toBe('planned');
  });

  it('does not change status when kdp_books shows the book is still in non-terminal status', async () => {
    fetchFn
      .mockResolvedValueOnce(mockJson({ book: { slug: 'foo', status: 'built' } }))
      .mockResolvedValueOnce(mockJson({ row: { id: 1 } }, true, 201))
      .mockResolvedValueOnce(mockJson({ error: 'not_found' }, false, 404))
      .mockResolvedValueOnce(mockJson({ row: { id: 2 } }, true, 201));
    const result = await importRoadmap({ yaml: SAMPLE_YAML, fetchFn, baseUrl: 'http://x' });
    expect(result.created).toBe(2);
    const postCalls = fetchFn.mock.calls.filter((c) => c[1]?.method === 'POST' && String(c[0]).endsWith('/api/roadmap'));
    const body0 = JSON.parse(postCalls[0][1].body);
    expect(body0.status).toBe('planned'); // unchanged
  });
});
