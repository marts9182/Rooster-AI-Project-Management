import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  listListings,
  getListing,
  syncNow,
  ApiError,
  type EtsyListing,
} from '../api/etsy';

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

const sampleListing: EtsyListing = {
  id: 1,
  etsy_listing_id: 101,
  sku_id: null,
  title: 'Mandala A',
  status: 'active',
  section: 'Coloring',
  niche: 'mandala',
  price_usd: 4.99,
  favorites: 12,
  views: 200,
  listed_at: '2026-05-01T00:00:00Z',
  last_synced_at: '2026-05-26T00:00:00Z',
  listing_url: 'https://etsy.com/listing/101',
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('listListings', () => {
  it('GETs /api/etsy/listings and unwraps {listings}', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(jsonResponse(200, { listings: [sampleListing] }));
    const out = await listListings();
    expect(fetchSpy).toHaveBeenCalledWith('/api/etsy/listings');
    expect(out).toEqual([sampleListing]);
  });

  it('passes filter params as querystring', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(jsonResponse(200, { listings: [] }));
    await listListings({ status: 'active', section: 'Coloring', niche: 'mandala' });
    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/etsy/listings?status=active&section=Coloring&niche=mandala',
    );
  });

  it('throws ApiError with status on 500', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse(500, { error: 'boom' }),
    );
    await expect(listListings()).rejects.toBeInstanceOf(ApiError);
    await expect(listListings()).rejects.toMatchObject({ status: 500 });
  });
});

describe('getListing', () => {
  it('GETs the listingId-specific URL and returns the row', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(jsonResponse(200, sampleListing));
    const out = await getListing(101);
    expect(fetchSpy).toHaveBeenCalledWith('/api/etsy/listings/101');
    expect(out).toEqual(sampleListing);
  });

  it('throws ApiError on 404', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse(404, { error: 'listing 9999 not found' }),
    );
    await expect(getListing(9999)).rejects.toBeInstanceOf(ApiError);
    await expect(getListing(9999)).rejects.toMatchObject({ status: 404 });
  });

  it('throws ApiError on 500', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse(500, { error: 'db down' }),
    );
    await expect(getListing(1)).rejects.toMatchObject({ status: 500 });
  });
});

describe('syncNow', () => {
  it('POSTs /api/etsy/sync-now and returns the result', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse(200, { inserted: 2, updated: 1, statusChanged: 0 }),
    );
    const out = await syncNow();
    expect(fetchSpy).toHaveBeenCalledWith('/api/etsy/sync-now', {
      method: 'POST',
    });
    expect(out).toEqual({ inserted: 2, updated: 1, statusChanged: 0 });
  });

  it('throws ApiError on 500', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse(500, { error: 'etsy 401' }),
    );
    await expect(syncNow()).rejects.toBeInstanceOf(ApiError);
    await expect(syncNow()).rejects.toMatchObject({ status: 500 });
  });

  it('throws ApiError on 404', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse(404, { error: 'route_not_mounted' }),
    );
    await expect(syncNow()).rejects.toMatchObject({ status: 404 });
  });
});
