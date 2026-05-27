import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import MarkPublishedModal from '../components/MarkPublishedModal';
import type { KdpBook } from '../api/kdp';

const book: KdpBook = {
  id: 1,
  slug: 'sample',
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
  updated_at: '2026-05-26',
};

const updatedBook: KdpBook = {
  ...book,
  status: 'published',
  asin: 'B01ABCDEFG',
  release_date: '2026-05-26',
  listing_url: 'https://www.amazon.com/dp/B01ABCDEFG',
};

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ book: updatedBook }),
  });
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('MarkPublishedModal', () => {
  it('renders dialog with title, ASIN field, release date field', () => {
    render(
      <MarkPublishedModal
        book={book}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />,
    );
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText(/Mark live: Sample Book/)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/B01/)).toBeInTheDocument();
  });

  it('rejects an invalid ASIN client-side without calling fetch', async () => {
    render(
      <MarkPublishedModal
        book={book}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />,
    );
    const input = screen.getByPlaceholderText(/B01/);
    await userEvent.type(input, 'bad-asin');
    await userEvent.click(screen.getByRole('button', { name: /^Save$/ }));
    expect(screen.getByRole('alert')).toHaveTextContent(/ASIN must match/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('uppercases ASIN as the user types', async () => {
    render(
      <MarkPublishedModal
        book={book}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />,
    );
    const input = screen.getByPlaceholderText(/B01/) as HTMLInputElement;
    await userEvent.type(input, 'b01abcdefg');
    expect(input.value).toBe('B01ABCDEFG');
  });

  it('POSTs to /mark-published and calls onSuccess on a valid ASIN', async () => {
    const onClose = vi.fn();
    const onSuccess = vi.fn();
    render(
      <MarkPublishedModal book={book} onClose={onClose} onSuccess={onSuccess} />,
    );
    await userEvent.type(screen.getByPlaceholderText(/B01/), 'B01ABCDEFG');
    await userEvent.click(screen.getByRole('button', { name: /^Save$/ }));
    await waitFor(() => expect(onSuccess).toHaveBeenCalledWith(updatedBook));
    expect(onClose).toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/kdp/books/sample/mark-published');
    expect(init.method).toBe('POST');
    const body = JSON.parse(init.body as string);
    expect(body.asin).toBe('B01ABCDEFG');
    expect(body.release_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('closes on Cancel', async () => {
    const onClose = vi.fn();
    render(
      <MarkPublishedModal book={book} onClose={onClose} onSuccess={vi.fn()} />,
    );
    await userEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onClose).toHaveBeenCalled();
  });

  it('closes on Escape key', async () => {
    const onClose = vi.fn();
    render(
      <MarkPublishedModal book={book} onClose={onClose} onSuccess={vi.fn()} />,
    );
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalled();
  });

  it('renders inline error from the API on a non-2xx response', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({ error: 'asin_already_used' }),
    });
    render(
      <MarkPublishedModal book={book} onClose={vi.fn()} onSuccess={vi.fn()} />,
    );
    await userEvent.type(screen.getByPlaceholderText(/B01/), 'B01ABCDEFG');
    await userEvent.click(screen.getByRole('button', { name: /^Save$/ }));
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(/asin_already_used/i),
    );
  });
});
