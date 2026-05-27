import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  listPlans,
  getPlan,
  ApiError,
  type PlanEntry,
  type PlanDetail,
} from '../api/plans';

const sampleEntry: PlanEntry = {
  kind: 'plan',
  slug: 'etsy-plan-2e',
  title: 'Etsy Plan 2e Implementation',
  date: '2026-05-22',
  status: 'in-flight',
  path: '/abs/2026-05-22-etsy-plan-2e-implementation.md',
  progress: { open: 3, done: 7, total: 10, percent: 70 },
};

const sampleDetail: PlanDetail = {
  ...sampleEntry,
  markdown: '# Plan body\n\n- [ ] step\n- [x] another step\n',
  frontmatter: { title: 'Etsy Plan 2e Implementation' },
};

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('listPlans', () => {
  it('GETs /api/plans and unwraps the {entries: [...]} envelope', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(jsonResponse(200, { entries: [sampleEntry] }));
    const out = await listPlans();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url] = fetchSpy.mock.calls[0] as [string];
    expect(url).toBe('/api/plans');
    expect(out).toEqual([sampleEntry]);
  });

  it('returns multiple entries when the backend has them', async () => {
    const second: PlanEntry = { ...sampleEntry, kind: 'spec', title: 'Etsy 2e Design' };
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse(200, { entries: [sampleEntry, second] }),
    );
    const out = await listPlans();
    expect(out).toHaveLength(2);
    expect(out[0].kind).toBe('plan');
    expect(out[1].kind).toBe('spec');
  });

  it('throws ApiError on 500', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse(500, { error: 'scanner failed' }),
    );
    const err = await listPlans().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(500);
  });
});

describe('getPlan', () => {
  it('GETs /api/plans/:slug and returns the first entry as PlanDetail', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(jsonResponse(200, { entries: [sampleDetail] }));
    const out = await getPlan('etsy-plan-2e');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url] = fetchSpy.mock.calls[0] as [string];
    expect(url).toBe('/api/plans/etsy-plan-2e');
    expect(out.markdown).toContain('# Plan body');
    expect(out.kind).toBe('plan');
  });

  it('picks the first (plan-first per backend sort) when multiple entries share a slug', async () => {
    const spec: PlanDetail = {
      ...sampleDetail,
      kind: 'spec',
      title: 'Etsy 2e Design',
      markdown: '# spec body',
    };
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse(200, { entries: [sampleDetail, spec] }),
    );
    const out = await getPlan('etsy-plan-2e');
    expect(out.kind).toBe('plan');
    expect(out.markdown).toContain('# Plan body');
  });

  it('URL-encodes the slug', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(jsonResponse(200, { entries: [sampleDetail] }));
    await getPlan('weird/slug?with&chars');
    const [url] = fetchSpy.mock.calls[0] as [string];
    expect(url).toBe('/api/plans/weird%2Fslug%3Fwith%26chars');
  });

  it('throws ApiError with status 404 for unknown slug', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse(404, { error: 'not found' }),
    );
    const err = await getPlan('nope').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(404);
  });

  it('throws ApiError when the envelope is empty', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse(200, { entries: [] }),
    );
    const err = await getPlan('empty').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(404);
  });
});
