import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import EtsyDetail from '../pages/EtsyDetail';
import type { EtsyListing } from '../api/etsy';
import type { KdpBook } from '../api/kdp';

const listing: EtsyListing = {
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

const listingWithSku: EtsyListing = {
  ...listing,
  etsy_listing_id: 202,
  sku_id: 'mandala-vol-1',
  title: 'Mandala Vol 1 (with KDP twin)',
};

const kdpBook: KdpBook = {
  id: 7,
  slug: 'mandala-vol-1',
  title: 'Mandala Vol 1 (KDP)',
  subtitle: null,
  asin: 'B0XYZ12345',
  status: 'published',
  release_date: '2026-04-01',
  listing_url: 'https://amazon.com/dp/B0XYZ12345',
  page_count: 100,
  trim_size: '8.5x11',
  price_usd: 7.99,
  cover_path: null,
  updated_at: '2026-05-01',
};

function jsonResp(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/etsy/:listingId" element={<EtsyDetail />} />
      </Routes>
    </MemoryRouter>,
  );
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('<EtsyDetail />', () => {
  it('fetches and renders metadata for the listing', async () => {
    fetchMock.mockImplementation((url: string) => {
      if (url === '/api/etsy/listings/101') {
        return Promise.resolve(jsonResp(200, listing));
      }
      return Promise.reject(new Error(`Unmocked: ${url}`));
    });
    renderAt('/etsy/101');
    await waitFor(() => expect(screen.getByText('Mandala A')).toBeInTheDocument());
    expect(screen.getByText('Coloring')).toBeInTheDocument();
    expect(screen.getByText('mandala')).toBeInTheDocument();
    expect(screen.getByText('$4.99')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.getByText('200')).toBeInTheDocument();
    expect(screen.getByText('101')).toBeInTheDocument();
  });

  it('renders deep-links to the public listing and seller dashboard', async () => {
    fetchMock.mockImplementation((url: string) => {
      if (url === '/api/etsy/listings/101') {
        return Promise.resolve(jsonResp(200, listing));
      }
      return Promise.reject(new Error(`Unmocked: ${url}`));
    });
    renderAt('/etsy/101');
    await waitFor(() => screen.getByText('Mandala A'));

    const publicLink = screen
      .getByRole('button', { name: /open public listing/i })
      .closest('a');
    expect(publicLink).toHaveAttribute('href', 'https://etsy.com/listing/101');
    expect(publicLink).toHaveAttribute('target', '_blank');

    const sellerLink = screen
      .getByRole('button', { name: /edit on etsy/i })
      .closest('a');
    expect(sellerLink).toHaveAttribute(
      'href',
      'https://www.etsy.com/your/shops/me/tools/listings/101',
    );
    expect(sellerLink).toHaveAttribute('target', '_blank');
  });

  it('shows an error message when fetch fails', async () => {
    fetchMock.mockResolvedValue(jsonResp(404, { error: 'listing 9999 not found' }));
    renderAt('/etsy/9999');
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(/404/),
    );
  });

  it('renders the Related KDP book card when sku_id matches a KDP slug', async () => {
    fetchMock.mockImplementation((url: string) => {
      if (url === '/api/etsy/listings/202') {
        return Promise.resolve(jsonResp(200, listingWithSku));
      }
      if (url === '/api/kdp/books/mandala-vol-1') {
        return Promise.resolve(
          jsonResp(200, { book: kdpBook, previews: [] }),
        );
      }
      return Promise.reject(new Error(`Unmocked: ${url}`));
    });
    renderAt('/etsy/202');
    await waitFor(() =>
      expect(screen.getByText('Mandala Vol 1 (with KDP twin)')).toBeInTheDocument(),
    );
    await waitFor(() =>
      expect(
        screen.getByRole('region', { name: /related kdp book/i }),
      ).toBeInTheDocument(),
    );
    const kdpLink = screen.getByRole('link', { name: 'Mandala Vol 1 (KDP)' });
    expect(kdpLink).toHaveAttribute('href', '/kdp/mandala-vol-1');
  });

  it('does NOT render the Related KDP book card when getBook 404s', async () => {
    fetchMock.mockImplementation((url: string) => {
      if (url === '/api/etsy/listings/202') {
        return Promise.resolve(jsonResp(200, listingWithSku));
      }
      if (url === '/api/kdp/books/mandala-vol-1') {
        return Promise.resolve(jsonResp(404, { error: 'not_found' }));
      }
      return Promise.reject(new Error(`Unmocked: ${url}`));
    });
    renderAt('/etsy/202');
    await waitFor(() => screen.getByText('Mandala Vol 1 (with KDP twin)'));
    // Give the soft-join promise a moment to reject; nothing should render.
    await new Promise((r) => setTimeout(r, 50));
    expect(
      screen.queryByRole('region', { name: /related kdp book/i }),
    ).not.toBeInTheDocument();
  });

  it('does NOT render the Related KDP book card when sku_id is null', async () => {
    fetchMock.mockImplementation((url: string) => {
      if (url === '/api/etsy/listings/101') {
        return Promise.resolve(jsonResp(200, listing));
      }
      return Promise.reject(new Error(`Unmocked: ${url}`));
    });
    renderAt('/etsy/101');
    await waitFor(() => screen.getByText('Mandala A'));
    expect(
      screen.queryByRole('region', { name: /related kdp book/i }),
    ).not.toBeInTheDocument();
    // Should also not have called the kdp endpoint.
    const urls = fetchMock.mock.calls.map((c) => String(c[0]));
    expect(urls.some((u) => u.includes('/api/kdp/books/'))).toBe(false);
  });
});
