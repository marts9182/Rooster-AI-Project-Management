import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import EtsyTile from '../../components/dashboard/EtsyTile';
import * as etsyApi from '../../api/etsy';
import type { EtsyListing } from '../../api/etsy';

function listing(
  id: number,
  status: string,
  favorites: number,
  views: number,
  last_synced_at: string,
): EtsyListing {
  return {
    id,
    etsy_listing_id: id,
    sku_id: `SKU-${id}`,
    title: `Listing ${id}`,
    status,
    section: null,
    niche: null,
    price_usd: null,
    favorites,
    views,
    listed_at: null,
    last_synced_at,
    listing_url: null,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

function renderTile() {
  return render(
    <MemoryRouter>
      <EtsyTile />
    </MemoryRouter>,
  );
}

describe('EtsyTile', () => {
  it('renders active count + total favorites/views', async () => {
    vi.spyOn(etsyApi, 'listListings').mockResolvedValue([
      listing(1, 'active', 5, 100, '2026-05-26T00:00:00Z'),
      listing(2, 'active', 3, 50, '2026-05-25T00:00:00Z'),
      listing(3, 'inactive', 1, 10, '2026-05-20T00:00:00Z'),
    ]);
    renderTile();
    await waitFor(() => screen.getByText('Active'));
    const stats = within(screen.getByTestId('tile-etsy')).getByLabelText(/Etsy stats/i);
    expect(within(stats).getByText('2')).toBeInTheDocument(); // active
    expect(within(stats).getByText('9')).toBeInTheDocument(); // favorites
    expect(within(stats).getByText('160')).toBeInTheDocument(); // views
  });

  it('shows "last synced" relative time', async () => {
    vi.spyOn(etsyApi, 'listListings').mockResolvedValue([
      listing(1, 'active', 0, 0, new Date(Date.now() - 60_000).toISOString()),
    ]);
    renderTile();
    await waitFor(() => screen.getByText(/Last synced/i));
    expect(screen.getByText(/Last synced/i)).toBeInTheDocument();
  });

  it('shows error banner when listListings fails', async () => {
    vi.spyOn(etsyApi, 'listListings').mockRejectedValue(new Error('nope'));
    renderTile();
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/nope/);
    });
  });
});
