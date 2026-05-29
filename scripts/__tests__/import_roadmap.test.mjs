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
      .mockResolvedValueOnce(mockJson({ row: { id: 1 } }, true, 201))
      .mockResolvedValueOnce(mockJson({ row: { id: 2 } }, true, 201));
    const result = await importRoadmap({ yaml: SAMPLE_YAML, fetchFn, baseUrl: 'http://x' });
    expect(result.created).toBe(2);
    expect(result.updated).toBe(0);
    expect(result.errors).toEqual([]);
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('on 409 falls back to PUT and counts as updated', async () => {
    fetchFn
      .mockResolvedValueOnce(mockJson({ error: 'dup' }, false, 409))
      .mockResolvedValueOnce(mockJson({ rows: [{ id: 42, kind: 'kdp', slug: 'foo', target_release_date: '2026-08-15' }] }))
      .mockResolvedValueOnce(mockJson({ row: { id: 42 } }))
      .mockResolvedValueOnce(mockJson({ row: { id: 2 } }, true, 201));
    const result = await importRoadmap({ yaml: SAMPLE_YAML, fetchFn, baseUrl: 'http://x' });
    expect(result.created).toBe(1);
    expect(result.updated).toBe(1);
    expect(result.errors).toEqual([]);
  });

  it('captures errors without aborting the run', async () => {
    fetchFn
      .mockResolvedValueOnce(mockJson({ error: 'boom' }, false, 500))
      .mockResolvedValueOnce(mockJson({ row: { id: 2 } }, true, 201));
    const result = await importRoadmap({ yaml: SAMPLE_YAML, fetchFn, baseUrl: 'http://x' });
    expect(result.created).toBe(1);
    expect(result.errors.length).toBe(1);
    expect(result.errors[0]).toMatch(/foo/);
  });
});
