import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import EtsyCatalog from '../pages/EtsyCatalog';
import type { EtsyListing } from '../api/etsy';

const sample: EtsyListing[] = [
  {
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
  },
  {
    id: 2,
    etsy_listing_id: 102,
    sku_id: null,
    title: 'SVG Pack',
    status: 'active',
    section: 'SVG',
    niche: 'cottagecore',
    price_usd: 2.99,
    favorites: 5,
    views: 80,
    listed_at: '2026-05-10T00:00:00Z',
    last_synced_at: '2026-05-26T00:00:00Z',
    listing_url: 'https://etsy.com/listing/102',
  },
  {
    id: 3,
    etsy_listing_id: 103,
    sku_id: null,
    title: 'Inactive thing',
    status: 'inactive',
    section: 'Coloring',
    niche: 'mandala',
    price_usd: 5.99,
    favorites: 1,
    views: 10,
    listed_at: '2026-04-01T00:00:00Z',
    last_synced_at: '2026-05-26T00:00:00Z',
    listing_url: 'https://etsy.com/listing/103',
  },
];

let fetchMock: ReturnType<typeof vi.fn>;

function mockListings(rows: EtsyListing[]) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ listings: rows }),
    text: async () => JSON.stringify({ listings: rows }),
  } as unknown as Response;
}

function mockSyncResult(body: {
  inserted: number;
  updated: number;
  statusChanged: number;
}) {
  return {
    ok: true,
    status: 200,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

beforeEach(() => {
  fetchMock = vi.fn().mockImplementation((url: string) => {
    if (typeof url === 'string' && url.includes('/api/etsy/listings')) {
      return Promise.resolve(mockListings(sample));
    }
    if (typeof url === 'string' && url.includes('/api/etsy/sync-now')) {
      return Promise.resolve(
        mockSyncResult({ inserted: 3, updated: 1, statusChanged: 0 }),
      );
    }
    return Promise.reject(new Error(`Unmocked fetch: ${url}`));
  });
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('<EtsyCatalog />', () => {
  it('renders one row per listing returned by the API', async () => {
    render(
      <MemoryRouter>
        <EtsyCatalog />
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getByText('Mandala A')).toBeInTheDocument());
    expect(screen.getByText('SVG Pack')).toBeInTheDocument();
    expect(screen.getByText('Inactive thing')).toBeInTheDocument();
  });

  it('renders status badges with the right emoji + label', async () => {
    render(
      <MemoryRouter>
        <EtsyCatalog />
      </MemoryRouter>,
    );
    await waitFor(() => screen.getByText('Mandala A'));
    expect(screen.getAllByLabelText(/Status: Active/i).length).toBeGreaterThan(0);
    expect(screen.getByLabelText(/Status: Inactive/i)).toBeInTheDocument();
  });

  it('renders title cell as a link to /etsy/:etsy_listing_id', async () => {
    render(
      <MemoryRouter>
        <EtsyCatalog />
      </MemoryRouter>,
    );
    await waitFor(() => screen.getByText('Mandala A'));
    const titleLink = screen.getByRole('link', { name: 'Mandala A' });
    expect(titleLink).toHaveAttribute('href', '/etsy/101');
  });

  it('renders "Open on Etsy" link in each row', async () => {
    render(
      <MemoryRouter>
        <EtsyCatalog />
      </MemoryRouter>,
    );
    await waitFor(() => screen.getByText('Mandala A'));
    const openLinks = screen.getAllByRole('link', { name: /open on etsy/i });
    expect(openLinks.length).toBe(3);
    expect(openLinks[0]).toHaveAttribute('href', expect.stringContaining('etsy.com'));
  });

  it('refetches with status= when a status chip is clicked', async () => {
    render(
      <MemoryRouter>
        <EtsyCatalog />
      </MemoryRouter>,
    );
    await waitFor(() => screen.getByText('Mandala A'));
    const initialCalls = fetchMock.mock.calls.length;

    await userEvent.click(screen.getByRole('button', { name: 'Active' }));

    await waitFor(() => {
      expect(fetchMock.mock.calls.length).toBeGreaterThan(initialCalls);
    });
    const urls = fetchMock.mock.calls.map((c) => String(c[0]));
    expect(urls.some((u) => u.includes('status=active'))).toBe(true);
  });

  it('refetches with section= when section dropdown changes', async () => {
    render(
      <MemoryRouter>
        <EtsyCatalog />
      </MemoryRouter>,
    );
    await waitFor(() => screen.getByText('Mandala A'));
    const initialCalls = fetchMock.mock.calls.length;

    await userEvent.selectOptions(
      screen.getByLabelText(/Section filter/i),
      'SVG',
    );

    await waitFor(() => {
      expect(fetchMock.mock.calls.length).toBeGreaterThan(initialCalls);
    });
    const urls = fetchMock.mock.calls.map((c) => String(c[0]));
    expect(urls.some((u) => u.includes('section=SVG'))).toBe(true);
  });

  it('sorts by title when the Title header is clicked', async () => {
    render(
      <MemoryRouter>
        <EtsyCatalog />
      </MemoryRouter>,
    );
    await waitFor(() => screen.getByText('Mandala A'));

    const titleHeaderBtn = screen.getByRole('button', { name: /^Title/i });
    await userEvent.click(titleHeaderBtn);

    function firstRowTitle(): string {
      const rows = screen.getAllByRole('row').slice(1); // skip thead
      const titleLink = within(rows[0]).getAllByRole('link')[0];
      return titleLink.textContent ?? '';
    }

    // asc → 'Inactive thing' < 'Mandala A' < 'SVG Pack'
    expect(firstRowTitle()).toBe('Inactive thing');

    await userEvent.click(titleHeaderBtn);
    expect(firstRowTitle()).toBe('SVG Pack');
  });

  it('Sync Now triggers POST and refetches the list', async () => {
    render(
      <MemoryRouter>
        <EtsyCatalog />
      </MemoryRouter>,
    );
    await waitFor(() => screen.getByText('Mandala A'));
    const beforeCalls = fetchMock.mock.calls.length;

    await userEvent.click(screen.getByRole('button', { name: /sync now/i }));

    await waitFor(() => {
      const urls = fetchMock.mock.calls.map((c) => String(c[0]));
      expect(urls.some((u) => u.includes('/api/etsy/sync-now'))).toBe(true);
    });
    await waitFor(() => {
      expect(fetchMock.mock.calls.length).toBeGreaterThan(beforeCalls + 1);
    });
    // Toast appears.
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(/Synced/),
    );
    expect(screen.getByRole('status')).toHaveTextContent(/3 inserted/);
    expect(screen.getByRole('status')).toHaveTextContent(/1 updated/);
  });

  it('shows an error banner on listings 500', async () => {
    fetchMock.mockReset();
    fetchMock.mockImplementation(() =>
      Promise.resolve({
        ok: false,
        status: 500,
        json: async () => ({ error: 'boom' }),
        text: async () => 'boom',
      } as unknown as Response),
    );
    render(
      <MemoryRouter>
        <EtsyCatalog />
      </MemoryRouter>,
    );
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(/500/),
    );
  });
});
