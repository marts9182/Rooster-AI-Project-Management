import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Pinterest from '../pages/Pinterest';
import type {
  PinterestQueueRow,
  PinterestHistoryRow,
} from '../api/pinterest';

interface FakeListener {
  (e: MessageEvent): void;
}

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

const queueRows: PinterestQueueRow[] = [
  {
    id: 1,
    kdp_book_id: 1,
    pin_type: 'cover_hero',
    image_path: '/tmp/output/pinterest/sample/cover_hero-0.png',
    title: 'Queued sample pin',
    description: 'desc',
    link_url: 'https://www.amazon.com/dp/B01ABCDEFG',
    status: 'pending',
    scheduled_for: '2026-06-01T15:00:00Z',
    attempts: 0,
    last_error: null,
    created_at: '2026-05-26T00:00:00Z',
  },
];

const historyRows: PinterestHistoryRow[] = [
  {
    id: 11,
    queue_id: 1,
    pinterest_pin_id: '123',
    posted_at: '2026-05-26T12:00:00Z',
    success: true,
    error_message: null,
    title: 'A posted pin',
    image_path: '/tmp/output/pinterest/sample/cover_hero-0.png',
  },
];

function jsonOk(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

let fetchMock: ReturnType<typeof vi.fn>;
let originalES: typeof EventSource | undefined;

beforeEach(() => {
  originalES = (globalThis as unknown as { EventSource?: typeof EventSource })
    .EventSource;
  (globalThis as unknown as { EventSource: unknown }).EventSource =
    FakeEventSource;

  fetchMock = vi.fn().mockImplementation((url: string) => {
    const u = String(url);
    if (u.startsWith('/api/pinterest/queue')) {
      return Promise.resolve(jsonOk({ queue: queueRows }));
    }
    if (u.startsWith('/api/pinterest/history')) {
      return Promise.resolve(jsonOk({ history: historyRows }));
    }
    if (u === '/api/pinterest/pause') {
      return Promise.resolve(jsonOk({ paused: 1 }));
    }
    if (u === '/api/pinterest/resume') {
      return Promise.resolve(jsonOk({ resumed: 1 }));
    }
    if (u === '/api/pinterest/login') {
      return Promise.resolve(jsonOk({ ok: true, launched: true }));
    }
    if (u === '/api/pinterest/token-status') {
      return Promise.resolve(
        jsonOk({
          connected: true,
          expires_at: new Date(Date.now() + 30 * 86400_000).toISOString(),
          last_refresh_at: null,
        }),
      );
    }
    if (u === '/api/pinterest/boards') {
      return Promise.resolve(jsonOk({ boards: [] }));
    }
    if (u === '/api/pinterest/whoami') {
      return Promise.resolve(
        jsonOk({ username: 'prp', business_name: 'Pocket Rooster Press' }),
      );
    }
    if (u === '/api/pinterest/refresh') {
      return Promise.resolve(jsonOk({}));
    }
    return Promise.reject(new Error(`Unmocked fetch: ${u}`));
  });
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  (globalThis as unknown as { EventSource: unknown }).EventSource = originalES;
  FakeEventSource.last = null;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('<Pinterest />', () => {
  it('fetches queue + history on mount and renders the three sections', async () => {
    render(<Pinterest />);
    await waitFor(() =>
      expect(screen.getByText('Queued sample pin')).toBeInTheDocument(),
    );
    expect(screen.getByText('A posted pin')).toBeInTheDocument();
    // The Settings header + queue/history headers.
    expect(
      screen.getByRole('heading', { name: /Pinterest/i, level: 1 }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: /Pinterest Connection/i, level: 2 }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: /^Queue$/i, level: 2 }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: /^History$/i, level: 2 }),
    ).toBeInTheDocument();
    // Both list endpoints were hit on mount.
    const urls = fetchMock.mock.calls.map((c) => String(c[0]));
    expect(urls.some((u) => u.startsWith('/api/pinterest/queue'))).toBe(true);
    expect(urls.some((u) => u.startsWith('/api/pinterest/history'))).toBe(
      true,
    );
  });

  it('refetches when a pinterest:pin-posted SSE event fires', async () => {
    render(<Pinterest />);
    await waitFor(() => screen.getByText('Queued sample pin'));

    const queueCallsBefore = fetchMock.mock.calls.filter((c) =>
      String(c[0]).startsWith('/api/pinterest/queue'),
    ).length;

    FakeEventSource.last!.emit('pinterest:pin-posted', {
      payload: { queue_id: 1, pinterest_pin_id: '999' },
      occurred_at: '2026-05-26T13:00:00Z',
    });

    await waitFor(
      () => {
        const queueCallsAfter = fetchMock.mock.calls.filter((c) =>
          String(c[0]).startsWith('/api/pinterest/queue'),
        ).length;
        expect(queueCallsAfter).toBeGreaterThan(queueCallsBefore);
      },
      { timeout: 4000 },
    );
  });

  it('clicking a queue row title opens the PinPreviewModal', async () => {
    render(<Pinterest />);
    await waitFor(() => screen.getByText('Queued sample pin'));
    await userEvent.click(screen.getByText('Queued sample pin'));
    await waitFor(() =>
      expect(
        screen.getByRole('dialog', { name: /pin preview/i }),
      ).toBeInTheDocument(),
    );
  });

  it('renders an error banner when the queue fetch fails', async () => {
    fetchMock.mockReset();
    fetchMock.mockImplementation(() =>
      Promise.resolve({
        ok: false,
        status: 500,
        json: async () => ({ error: 'boom' }),
        text: async () => '"boom"',
      } as unknown as Response),
    );
    render(<Pinterest />);
    await waitFor(() =>
      expect(screen.getByRole('alert')).toBeInTheDocument(),
    );
  });
});
