import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import KdpTile from '../../components/dashboard/KdpTile';
import * as kdpApi from '../../api/kdp';
import type { KdpBook, KdpStatus } from '../../api/kdp';

function book(
  slug: string,
  status: KdpStatus,
  updated_at: string,
  asin: string | null = null,
): KdpBook {
  return {
    id: 1,
    slug,
    title: `Book ${slug}`,
    subtitle: null,
    asin,
    status,
    release_date: null,
    listing_url: null,
    page_count: null,
    trim_size: null,
    price_usd: null,
    cover_path: null,
    updated_at,
  };
}

beforeEach(() => {});
afterEach(() => {
  vi.restoreAllMocks();
});

function renderTile() {
  return render(
    <MemoryRouter>
      <KdpTile />
    </MemoryRouter>,
  );
}

describe('KdpTile', () => {
  it('shows status counts split by published/in_review/built', async () => {
    vi.spyOn(kdpApi, 'listBooks').mockResolvedValue([
      book('a', 'published', '2026-05-20', 'B1'),
      book('b', 'published', '2026-05-21', 'B2'),
      book('c', 'in_review', '2026-05-22'),
      book('d', 'built', '2026-05-23'),
      book('e', 'archived', '2026-05-19'),
    ]);
    renderTile();
    await waitFor(() => screen.getByText('Live'));
    const tile = screen.getByTestId('tile-kdp');
    const stats = within(tile).getByLabelText(/KDP status counts/i);
    // Stat values appear in order: Live (2), In review (1), Built (1).
    const items = within(stats).getAllByRole('listitem');
    expect(within(items[0]).getByText('2')).toBeInTheDocument();
    expect(within(items[0]).getByText('Live')).toBeInTheDocument();
    expect(within(items[1]).getByText('1')).toBeInTheDocument();
    expect(within(items[1]).getByText('In review')).toBeInTheDocument();
    expect(within(items[2]).getByText('1')).toBeInTheDocument();
    expect(within(items[2]).getByText('Built')).toBeInTheDocument();
  });

  it('renders the 3 most-recent books by updated_at desc', async () => {
    vi.spyOn(kdpApi, 'listBooks').mockResolvedValue([
      book('one', 'published', '2026-05-01'),
      book('two', 'published', '2026-05-02'),
      book('three', 'published', '2026-05-03'),
      book('four', 'published', '2026-05-04'),
    ]);
    renderTile();
    await waitFor(() => screen.getByText('Book four'));
    expect(screen.getByText('Book four')).toBeInTheDocument();
    expect(screen.getByText('Book three')).toBeInTheDocument();
    expect(screen.getByText('Book two')).toBeInTheDocument();
    expect(screen.queryByText('Book one')).toBeNull();
  });

  it('shows a view-all link to /kdp', async () => {
    vi.spyOn(kdpApi, 'listBooks').mockResolvedValue([]);
    renderTile();
    await waitFor(() => screen.getByText(/view all/i));
    expect(screen.getByText(/view all/i)).toHaveAttribute('href', '/kdp');
  });

  it('renders an error state when listBooks fails', async () => {
    vi.spyOn(kdpApi, 'listBooks').mockRejectedValue(new Error('boom'));
    renderTile();
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/boom/);
    });
  });
});
