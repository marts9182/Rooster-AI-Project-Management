import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  listEvents,
  ApiError,
  type CalendarEvent,
} from '../api/calendar';

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

const sampleEvent: CalendarEvent = {
  date: '2026-05-15',
  kind: 'kdp.release',
  title: 'KDP release: Foo',
  source_kind: 'kdp.book',
  source_id: 'foo',
  url: '/kdp/foo',
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('listEvents', () => {
  it('GETs /api/calendar/events with from+to and unwraps {events}', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(jsonResponse(200, { events: [sampleEvent] }));
    const out = await listEvents({ from: '2026-05-01', to: '2026-07-01' });
    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/calendar/events?from=2026-05-01&to=2026-07-01',
    );
    expect(out).toEqual([sampleEvent]);
  });

  it('throws ApiError with status on 400', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse(400, { error: 'from/to must be ISO yyyy-mm-dd' }),
    );
    await expect(
      listEvents({ from: 'bad', to: 'bad' }),
    ).rejects.toBeInstanceOf(ApiError);
    await expect(
      listEvents({ from: 'bad', to: 'bad' }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('throws ApiError with status on 500', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse(500, { error: 'db down' }),
    );
    await expect(
      listEvents({ from: '2026-05-01', to: '2026-07-01' }),
    ).rejects.toMatchObject({ status: 500 });
  });
});
