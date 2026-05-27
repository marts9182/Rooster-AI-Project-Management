import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { EtsyClient, EtsyApiError } from '../../etsy/client.js';

const BASE = 'https://openapi.etsy.com';

const handlers = [
  http.get(`${BASE}/v3/application/shops/:shopId/listings`, ({ request }) => {
    const url = new URL(request.url);
    expect(request.headers.get('x-api-key')).toBe('keyX:secretY');
    expect(request.headers.get('authorization')).toBe('Bearer accessZ');
    const limit = Number(url.searchParams.get('limit'));
    const offset = Number(url.searchParams.get('offset'));
    const all = [
      { listing_id: 1, title: 'A', state: 'active', price: { amount: 500, divisor: 100, currency_code: 'USD' } },
      { listing_id: 2, title: 'B', state: 'active', price: { amount: 750, divisor: 100, currency_code: 'USD' } },
      { listing_id: 3, title: 'C', state: 'active', price: { amount: 999, divisor: 100, currency_code: 'USD' } },
    ];
    return HttpResponse.json({
      count: all.length,
      results: all.slice(offset, offset + limit),
    });
  }),
  http.get(`${BASE}/v3/application/listings/:listingId`, ({ params }) => {
    return HttpResponse.json({
      listing_id: Number(params.listingId),
      title: 'detail',
      state: 'active',
      price: { amount: 1234, divisor: 100, currency_code: 'USD' },
    });
  }),
];

const server = setupServer(...handlers);
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function makeClient() {
  return new EtsyClient({
    keystring: 'keyX',
    sharedSecret: 'secretY',
    shopId: 42,
    getAccessToken: async () => 'accessZ',
  });
}

describe('EtsyClient', () => {
  it('sends keystring:shared_secret in x-api-key', async () => {
    const client = makeClient();
    const r = await client.listListings({ state: 'active', limit: 1, offset: 0 });
    expect(r.results).toHaveLength(1);
    expect(r.count).toBe(3);
  });

  it('pages through all listings', async () => {
    const client = makeClient();
    const all = await client.listAllListings({ state: 'active', pageSize: 2 });
    expect(all.map((x) => x.listing_id)).toEqual([1, 2, 3]);
  });

  it('fetches a single listing', async () => {
    const client = makeClient();
    const listing = await client.getListing(99);
    expect(listing.listing_id).toBe(99);
    expect(listing.title).toBe('detail');
  });

  it('throws on non-2xx with body in message', async () => {
    server.use(
      http.get(`${BASE}/v3/application/shops/:shopId/listings`, () =>
        HttpResponse.text('boom', { status: 500 }),
      ),
    );
    const client = makeClient();
    await expect(client.listListings({ state: 'active' })).rejects.toThrow(/500.*boom/);
  });

  it('error is an EtsyApiError with status and body fields', async () => {
    server.use(
      http.get(`${BASE}/v3/application/listings/:listingId`, () =>
        HttpResponse.text('not found', { status: 404 }),
      ),
    );
    const client = makeClient();
    try {
      await client.getListing(7);
      throw new Error('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(EtsyApiError);
      expect(err.status).toBe(404);
      expect(err.body).toBe('not found');
    }
  });
});
