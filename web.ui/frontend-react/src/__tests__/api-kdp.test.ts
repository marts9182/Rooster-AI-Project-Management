import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  listBooks,
  getBook,
  markInReview,
  markPublished,
  ApiError,
  type KdpBook,
} from '../api/kdp';

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

const sampleBook: KdpBook = {
  id: 1,
  slug: 'sample-book',
  title: 'Sample Book',
  subtitle: null,
  asin: null,
  status: 'built',
  release_date: null,
  listing_url: null,
  page_count: 120,
  trim_size: '8.5x11',
  price_usd: 9.99,
  cover_path: null,
  updated_at: '2026-05-26T00:00:00Z',
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('listBooks', () => {
  it('GETs /api/kdp/books and unwraps {books}', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(jsonResponse(200, { books: [sampleBook] }));
    const out = await listBooks();
    expect(fetchSpy).toHaveBeenCalledWith('/api/kdp/books');
    expect(out).toEqual([sampleBook]);
  });

  it('throws ApiError with status on 500', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse(500, { error: 'boom' }),
    );
    await expect(listBooks()).rejects.toBeInstanceOf(ApiError);
    await expect(listBooks()).rejects.toMatchObject({ status: 500 });
  });
});

describe('getBook', () => {
  it('GETs the slug-specific URL and returns {book, previews}', async () => {
    const detail = { book: sampleBook, previews: ['/files/a.png'] };
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(jsonResponse(200, detail));
    const out = await getBook('sample-book');
    expect(fetchSpy).toHaveBeenCalledWith('/api/kdp/books/sample-book');
    expect(out).toEqual(detail);
  });

  it('throws ApiError on 404', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse(404, { error: 'not_found' }),
    );
    await expect(getBook('missing')).rejects.toMatchObject({
      status: 404,
    });
  });
});

describe('markInReview', () => {
  it('POSTs and unwraps {book}', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(jsonResponse(200, { book: sampleBook }));
    const out = await markInReview('sample-book');
    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/kdp/books/sample-book/mark-in-review',
      { method: 'POST' },
    );
    expect(out).toEqual(sampleBook);
  });
});

describe('markPublished', () => {
  it('POSTs JSON body and unwraps {book}', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(jsonResponse(200, { book: sampleBook }));
    await markPublished('sample-book', {
      asin: 'B01ABCDEFG',
      release_date: '2026-05-25',
    });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/kdp/books/sample-book/mark-published');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({
      asin: 'B01ABCDEFG',
      release_date: '2026-05-25',
    });
  });

  it('throws ApiError with status 400 on validation failure', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse(400, { error: 'asin_invalid' }),
    );
    await expect(
      markPublished('sample-book', { asin: 'bad', release_date: '2026-05-25' }),
    ).rejects.toMatchObject({ status: 400 });
  });
});
