import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, within, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import KdpCatalog from '../pages/KdpCatalog';

interface FakeListener {
  (e: MessageEvent): void;
}

/**
 * Per-test FakeEventSource: lets us emit kdp:* events into the page and
 * inspect that the list refetches.
 */
class FakeEventSource {
  url: string;
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  private listeners: Map<string, Set<FakeListener>> = new Map();
  static last: FakeEventSource | null = null;

  constructor(url: string) {
    this.url = url;
    FakeEventSource.last = this;
  }
  addEventListener(kind: string, fn: FakeListener) {
    if (!this.listeners.has(kind)) this.listeners.set(kind, new Set());
    this.listeners.get(kind)!.add(fn);
  }
  removeEventListener(kind: string, fn: FakeListener) {
    this.listeners.get(kind)?.delete(fn);
  }
  close() {
    this.listeners.clear();
  }
  emit(kind: string, data: unknown) {
    const ev = { data: JSON.stringify(data) } as MessageEvent;
    for (const fn of this.listeners.get(kind) ?? []) fn(ev);
  }
}

const sampleBooks = [
  {
    id: 1,
    slug: 'book-a',
    title: 'Book A',
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
  },
  {
    id: 2,
    slug: 'book-b',
    title: 'Book B',
    subtitle: null,
    asin: 'B0XYZ12345',
    status: 'published',
    release_date: '2026-05-01',
    listing_url: 'https://amazon.com/dp/B0XYZ12345',
    page_count: 80,
    trim_size: '8.5x11',
    price_usd: 7.99,
    cover_path: null,
    updated_at: '2026-05-20',
  },
];

let fetchMock: ReturnType<typeof vi.fn>;
let originalES: typeof EventSource | undefined;

beforeEach(() => {
  fetchMock = vi.fn().mockImplementation((url: string) => {
    if (url === '/api/kdp/ingest-bookshelf/pending') {
      return Promise.resolve({
        ok: true,
        json: async () => ({ preview: null }),
      });
    }
    return Promise.resolve({
      ok: true,
      json: async () => ({ books: sampleBooks }),
    });
  });
  vi.stubGlobal('fetch', fetchMock);
  originalES = (globalThis as unknown as { EventSource?: typeof EventSource }).EventSource;
  (globalThis as unknown as { EventSource: unknown }).EventSource = FakeEventSource;
});

afterEach(() => {
  vi.unstubAllGlobals();
  (globalThis as unknown as { EventSource: unknown }).EventSource = originalES;
  FakeEventSource.last = null;
  vi.restoreAllMocks();
});

describe('KdpCatalog', () => {
  it('renders one row per book returned by listBooks', async () => {
    render(
      <MemoryRouter>
        <KdpCatalog />
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getByText('Book A')).toBeInTheDocument());
    expect(screen.getByText('Book B')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith('/api/kdp/books');
  });

  function booksCallCount(): number {
    return fetchMock.mock.calls.filter((c) => c[0] === '/api/kdp/books').length;
  }

  it('renders status badges with the right CSS class', async () => {
    render(
      <MemoryRouter>
        <KdpCatalog />
      </MemoryRouter>,
    );
    await waitFor(() => screen.getByText('Book A'));
    const builtBadge = screen.getByLabelText(/Status: Built/i);
    const liveBadge = screen.getByLabelText(/Status: Live/i);
    expect(builtBadge.className).toContain('status-built');
    expect(liveBadge.className).toContain('status-published');
  });

  it('renders a link to the book detail page', async () => {
    render(
      <MemoryRouter>
        <KdpCatalog />
      </MemoryRouter>,
    );
    await waitFor(() => screen.getByText('Book A'));
    const titleLink = screen.getByRole('link', { name: 'Book A' });
    expect(titleLink).toHaveAttribute('href', '/kdp/book-a');
  });

  it('sorts by title ascending when the Title header is clicked', async () => {
    render(
      <MemoryRouter>
        <KdpCatalog />
      </MemoryRouter>,
    );
    await waitFor(() => screen.getByText('Book A'));
    const titleHeaderBtn = screen.getByRole('button', { name: /^Title/i });
    await userEvent.click(titleHeaderBtn);

    function firstRowTitleText(): string {
      const rows = screen.getAllByRole('row').slice(1); // skip thead
      // Each row has two links: the title (column 2) and "Open" (last column).
      // Pick the title link specifically — its href matches /kdp/:slug AND its
      // visible text equals the book title.
      const titleLink = within(rows[0]).getAllByRole('link')[0];
      return titleLink.textContent ?? '';
    }

    expect(firstRowTitleText()).toBe('Book A');

    // Click again → desc → Book B first.
    await userEvent.click(titleHeaderBtn);
    expect(firstRowTitleText()).toBe('Book B');
  });

  it('renders an [+ Add manually] button (stub)', async () => {
    render(
      <MemoryRouter>
        <KdpCatalog />
      </MemoryRouter>,
    );
    await waitFor(() => screen.getByText('Book A'));
    expect(
      screen.getByRole('button', { name: /add manually/i }),
    ).toBeInTheDocument();
  });

  it('refetches when a kdp:new-book SSE event arrives', async () => {
    render(
      <MemoryRouter>
        <KdpCatalog />
      </MemoryRouter>,
    );
    await waitFor(() => screen.getByText('Book A'));
    expect(booksCallCount()).toBe(1);

    // Now the FakeEventSource should be open. Emit a kdp:new-book.
    expect(FakeEventSource.last).not.toBeNull();
    await act(async () => {
      FakeEventSource.last!.emit('kdp:new-book', {
        payload: { slug: 'book-c' },
        occurred_at: '2026-05-26T00:00:00Z',
      });
    });
    await waitFor(() => expect(booksCallCount()).toBe(2));
  });

  it('renders the pending-sync banner when /pending returns a preview', async () => {
    fetchMock.mockImplementation((url: string) => {
      if (url === '/api/kdp/ingest-bookshelf/pending') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            preview: {
              preview_id: 'p1',
              created_at: new Date().toISOString(),
              matches: [],
              ambiguous: [],
              orphans: [],
              missing_from_kdp: [],
            },
          }),
        });
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({ books: [] }),
      });
    });

    render(
      <MemoryRouter>
        <KdpCatalog />
      </MemoryRouter>,
    );
    expect(await screen.findByText(/Pending KDP sync/i)).toBeInTheDocument();
  });
});
