import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import KdpDetail from '../pages/KdpDetail';

const builtBook = {
  id: 1,
  slug: 'book-a',
  title: 'Book A',
  subtitle: 'A Catchy Subtitle',
  asin: null,
  status: 'built',
  release_date: null,
  listing_url: null,
  page_count: 120,
  trim_size: '8.5x11',
  price_usd: 9.99,
  cover_path: 'projects/kdp-puzzle-press/output/kdp-ready/book-a/cover.png',
  blurb: '<p>Hi reader</p>',
  updated_at: '2026-05-26',
};

const previews = [
  'data/cache/previews/book-a/interior.1.png',
  'data/cache/previews/book-a/interior.2.png',
  'data/cache/previews/book-a/interior.3.png',
  'data/cache/previews/book-a/interior.4.png',
  'data/cache/previews/book-a/interior.5.png',
  'data/cache/previews/book-a/interior.6.png',
  'data/cache/previews/book-a/interior.7.png',
  'data/cache/previews/book-a/interior.8.png',
];

function renderAtSlug(slug: string) {
  return render(
    <MemoryRouter initialEntries={[`/kdp/${slug}`]}>
      <Routes>
        <Route path="/kdp/:slug" element={<KdpDetail />} />
      </Routes>
    </MemoryRouter>,
  );
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ book: builtBook, previews }),
  });
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('KdpDetail', () => {
  it('fetches the book by slug and renders title + subtitle + metadata', async () => {
    renderAtSlug('book-a');
    await waitFor(() => expect(screen.getByText('Book A')).toBeInTheDocument());
    expect(screen.getByText(/A Catchy Subtitle/)).toBeInTheDocument();
    expect(screen.getByText(/8\.5x11/)).toBeInTheDocument();
    expect(screen.getByText(/120/)).toBeInTheDocument();
    expect(screen.getByText(/\$9\.99/)).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith('/api/kdp/books/book-a');
  });

  it('renders interior preview images for every preview path', async () => {
    const { container } = renderAtSlug('book-a');
    await waitFor(() => screen.getByText('Book A'));
    // Decorative previews have alt="" so they're not exposed under role="img".
    // Query the DOM directly instead. Expect 8 previews + 1 named cover img.
    const allImgs = container.querySelectorAll('img');
    expect(allImgs.length).toBeGreaterThanOrEqual(previews.length);
    const srcs = Array.from(allImgs).map((i) => i.getAttribute('src') ?? '');
    expect(srcs.some((s) => s.includes('interior.1.png'))).toBe(true);
    expect(srcs.some((s) => s.includes('interior.8.png'))).toBe(true);
    // The cover image is named and has alt text.
    expect(screen.getByAltText(/Book A cover/i)).toBeInTheDocument();
  });

  it('shows Mark in-review and Mark live buttons when status is built', async () => {
    renderAtSlug('book-a');
    await waitFor(() => screen.getByText('Book A'));
    expect(
      screen.getByRole('button', { name: /mark in-review/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /mark live/i }),
    ).toBeInTheDocument();
  });

  it('does not show Mark in-review when status is published', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        book: { ...builtBook, status: 'published', asin: 'B01ABCDEFG' },
        previews,
      }),
    });
    renderAtSlug('book-a');
    await waitFor(() => screen.getByText('Book A'));
    expect(
      screen.queryByRole('button', { name: /mark in-review/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /mark live/i }),
    ).not.toBeInTheDocument();
    // But "Open on Amazon" should appear when there's an ASIN.
    expect(screen.getByRole('button', { name: /open on amazon/i })).toBeInTheDocument();
  });

  it('opens MarkPublishedModal when Mark live is clicked', async () => {
    renderAtSlug('book-a');
    await waitFor(() => screen.getByText('Book A'));
    await userEvent.click(screen.getByRole('button', { name: /mark live/i }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});
