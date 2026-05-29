import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import type { CalendarEvent } from '../api/calendar';

/**
 * FullCalendar in jsdom relies on layout APIs that don't exist outside a real
 * browser; rendering the real component makes the test brittle for what we
 * actually care about (filter chips, event drawer, SSE refetch). Replace it
 * with a thin stub that renders each event as a button and forwards click +
 * datesSet into the same shapes the real lib uses.
 *
 * The stub keeps a module-level captured handler ref so tests can simulate a
 * range change if they want; for the current suite we only need event clicks.
 */
vi.mock('@fullcalendar/react', () => {
  const FullCalendarStub = (props: {
    events: Array<{
      id: string;
      title: string;
      extendedProps?: { calEvent?: CalendarEvent };
    }>;
    eventClick?: (arg: {
      event: {
        id: string;
        title: string;
        extendedProps: { calEvent?: CalendarEvent };
      };
    }) => void;
    datesSet?: (arg: { startStr: string; endStr: string }) => void;
  }) => {
    return (
      <div data-testid="fullcalendar-stub">
        {props.events.map((e) => (
          <button
            key={e.id}
            type="button"
            data-testid="fc-event"
            onClick={() =>
              props.eventClick?.({
                event: {
                  id: e.id,
                  title: e.title,
                  extendedProps: e.extendedProps ?? {},
                },
              })
            }
          >
            {e.title}
          </button>
        ))}
      </div>
    );
  };
  return { default: FullCalendarStub };
});

vi.mock('@fullcalendar/daygrid', () => ({ default: {} }));
vi.mock('@fullcalendar/timegrid', () => ({ default: {} }));
vi.mock('@fullcalendar/interaction', () => ({ default: {} }));

// Import Calendar after the mocks so the stub is wired in.
import Calendar from '../pages/Calendar';

const sampleEvents: CalendarEvent[] = [
  {
    date: '2026-05-15',
    kind: 'kdp.release',
    title: 'KDP release: Foo',
    source_kind: 'kdp.book',
    source_id: 'foo',
    url: '/kdp/foo',
  },
  {
    date: '2026-05-20',
    kind: 'etsy.listed',
    title: 'Etsy listed: Mandala',
    source_kind: 'etsy.listing',
    source_id: 111,
    url: '/etsy/111',
  },
  {
    date: '2026-05-22',
    kind: 'reminder',
    title: 'Day-30 check',
    source_kind: 'reminder',
    source_id: 7,
    url: '/etsy/111',
  },
  {
    date: '2026-05-25',
    kind: 'pinterest.post',
    title: 'Pinterest pin: Mandala',
    source_kind: 'pinterest.pin',
    source_id: 42,
    url: '/pinterest',
  },
];

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

let fetchMock: ReturnType<typeof vi.fn>;
let originalES: typeof EventSource | undefined;

function jsonOk(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

beforeEach(() => {
  originalES = (globalThis as unknown as { EventSource?: typeof EventSource })
    .EventSource;
  (globalThis as unknown as { EventSource: unknown }).EventSource =
    FakeEventSource;

  fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
    const u = String(url);
    if (u.includes('/api/calendar/events')) {
      return Promise.resolve(jsonOk({ events: sampleEvents }));
    }
    if (u.match(/\/api\/reminders\/\d+\/snooze/) && init?.method === 'POST') {
      return Promise.resolve(
        jsonOk({ ok: true, due_at: '2026-05-23T00:00:00Z' }),
      );
    }
    if (u.match(/\/api\/reminders\/\d+\/dismiss/) && init?.method === 'POST') {
      return Promise.resolve(jsonOk({ ok: true }));
    }
    if (u.startsWith('/api/roadmap')) {
      return Promise.resolve(jsonOk({ rows: [] }));
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

describe('<Calendar />', () => {
  it('fetches events on mount and renders titles', async () => {
    render(
      <MemoryRouter>
        <Calendar />
      </MemoryRouter>,
    );
    await waitFor(() =>
      expect(screen.getByText('KDP release: Foo')).toBeInTheDocument(),
    );
    expect(screen.getByText('Etsy listed: Mandala')).toBeInTheDocument();
    expect(screen.getByText('Day-30 check')).toBeInTheDocument();
    expect(screen.getByText('Pinterest pin: Mandala')).toBeInTheDocument();

    const urls = fetchMock.mock.calls.map((c) => String(c[0]));
    expect(urls.some((u) => u.startsWith('/api/calendar/events'))).toBe(true);
  });

  it('toggling a kind chip hides events of that kind', async () => {
    render(
      <MemoryRouter>
        <Calendar />
      </MemoryRouter>,
    );
    await waitFor(() => screen.getByText('KDP release: Foo'));

    await userEvent.click(
      screen.getByRole('button', { name: /KDP releases/i }),
    );
    await waitFor(() =>
      expect(screen.queryByText('KDP release: Foo')).not.toBeInTheDocument(),
    );
    expect(screen.getByText('Etsy listed: Mandala')).toBeInTheDocument();
  });

  it('clicking a KDP event opens the drawer with metadata + Open book detail link', async () => {
    render(
      <MemoryRouter>
        <Calendar />
      </MemoryRouter>,
    );
    await waitFor(() => screen.getByText('KDP release: Foo'));
    await userEvent.click(screen.getByText('KDP release: Foo'));

    const dialog = await screen.findByRole('dialog', { name: /event details/i });
    expect(dialog).toHaveTextContent('KDP release: Foo');
    expect(dialog).toHaveTextContent('2026-05-15');
    expect(dialog).toHaveTextContent('kdp.book');
    const link = screen.getByRole('link', { name: /open book detail/i });
    expect(link).toHaveAttribute('href', '/kdp/foo');
  });

  it('clicking a reminder opens the drawer with Snooze + Dismiss buttons', async () => {
    render(
      <MemoryRouter>
        <Calendar />
      </MemoryRouter>,
    );
    await waitFor(() => screen.getByText('Day-30 check'));
    await userEvent.click(screen.getByText('Day-30 check'));

    expect(
      await screen.findByRole('button', { name: /snooze 1h/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /snooze 24h/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /dismiss/i }),
    ).toBeInTheDocument();
  });

  it('Snooze 1h POSTs to /api/reminders/:id/snooze and refetches', async () => {
    render(
      <MemoryRouter>
        <Calendar />
      </MemoryRouter>,
    );
    await waitFor(() => screen.getByText('Day-30 check'));
    const fetchesBefore = fetchMock.mock.calls.length;

    await userEvent.click(screen.getByText('Day-30 check'));
    await userEvent.click(
      await screen.findByRole('button', { name: /snooze 1h/i }),
    );

    await waitFor(() => {
      const urls = fetchMock.mock.calls.map((c) => String(c[0]));
      expect(urls.some((u) => u.includes('/api/reminders/7/snooze'))).toBe(true);
    });

    // The snooze call + a subsequent refetch of /api/calendar/events should
    // both be observed.
    await waitFor(() => {
      expect(fetchMock.mock.calls.length).toBeGreaterThan(fetchesBefore + 1);
    });
    const lastCalendarFetchIdx = fetchMock.mock.calls
      .map((c, i) => [i, String(c[0])] as [number, string])
      .filter(([, u]) => u.includes('/api/calendar/events'))
      .at(-1)?.[0];
    expect(lastCalendarFetchIdx).toBeGreaterThan(fetchesBefore - 1);
  });

  it('Dismiss POSTs to /api/reminders/:id/dismiss', async () => {
    render(
      <MemoryRouter>
        <Calendar />
      </MemoryRouter>,
    );
    await waitFor(() => screen.getByText('Day-30 check'));
    await userEvent.click(screen.getByText('Day-30 check'));
    await userEvent.click(
      await screen.findByRole('button', { name: /dismiss/i }),
    );

    await waitFor(() => {
      const urls = fetchMock.mock.calls.map((c) => String(c[0]));
      expect(urls.some((u) => u.includes('/api/reminders/7/dismiss'))).toBe(true);
    });
  });

  it('closes the drawer when the overlay is clicked', async () => {
    render(
      <MemoryRouter>
        <Calendar />
      </MemoryRouter>,
    );
    await waitFor(() => screen.getByText('KDP release: Foo'));
    await userEvent.click(screen.getByText('KDP release: Foo'));
    expect(
      await screen.findByRole('dialog', { name: /event details/i }),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByTestId('drawer-overlay'));
    await waitFor(() =>
      expect(
        screen.queryByRole('dialog', { name: /event details/i }),
      ).not.toBeInTheDocument(),
    );
  });

  it('clicking a roadmap.release event opens the RoadmapDetailModal', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      const u = String(url);
      if (u.includes('/api/calendar')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            events: [
              {
                date: '2026-09-15',
                kind: 'roadmap.release',
                title: 'KDP: Foo',
                source_kind: 'publishing.roadmap',
                source_id: 7,
                url: '/calendar',
              },
            ],
          }),
          text: async () => '{}',
        } as unknown as Response;
      }
      if (u.startsWith('/api/roadmap')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            rows: [
              {
                id: 7,
                kind: 'kdp',
                slug: 'foo',
                title: 'Foo',
                target_release_date: '2026-09-15',
                status: 'scheduled',
                source: 'reuse',
                niche: null,
                rationale: null,
                file_lock_date: '2026-08-31',
                kdp_book_id: null,
                etsy_listing_id: null,
                notes: null,
                created_at: '',
                updated_at: '',
              },
            ],
          }),
          text: async () => '{}',
        } as unknown as Response;
      }
      throw new Error(`unexpected URL: ${u}`);
    });

    render(
      <MemoryRouter>
        <Calendar />
      </MemoryRouter>,
    );
    const event = await screen.findByText(/KDP: Foo/i);
    await userEvent.click(event);
    expect(
      await screen.findByRole('dialog', { name: /roadmap/i }),
    ).toBeInTheDocument();
  });

  it('refetches when an etsy:synced SSE event fires', async () => {
    render(
      <MemoryRouter>
        <Calendar />
      </MemoryRouter>,
    );
    await waitFor(() => screen.getByText('Etsy listed: Mandala'));

    const calendarCallsBefore = fetchMock.mock.calls.filter((c) =>
      String(c[0]).includes('/api/calendar/events'),
    ).length;

    // Fire an etsy:synced event on the FakeEventSource.
    FakeEventSource.last!.emit('etsy:synced', {
      payload: { inserted: 1, updated: 0 },
      occurred_at: '2026-05-26T00:00:00Z',
    });

    await waitFor(() => {
      const calendarCallsAfter = fetchMock.mock.calls.filter((c) =>
        String(c[0]).includes('/api/calendar/events'),
      ).length;
      expect(calendarCallsAfter).toBeGreaterThan(calendarCallsBefore);
    });
  });
});
