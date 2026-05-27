import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  listReminders,
  createReminder,
  snoozeReminder,
  dismissReminder,
  ApiError,
  type Reminder,
} from '../api/reminders';

const sampleRow: Reminder = {
  id: 1,
  title: 'KDP Day-30 check',
  body: 'How are sales tracking?',
  due_at: '2026-05-26T12:00:00Z',
  channel: 'both',
  status: 'pending',
  source_kind: 'kdp.book',
  source_id: 7,
  fired_at: null,
  created_at: '2026-05-26T11:00:00Z',
};

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('listReminders', () => {
  it('GETs /api/reminders with no query string when params omitted', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse(200, { reminders: [sampleRow] }),
    );
    const out = await listReminders();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url] = fetchSpy.mock.calls[0] as [string];
    expect(url).toBe('/api/reminders');
    expect(out).toEqual([sampleRow]);
  });

  it('builds query string from status/limit/order params', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse(200, { reminders: [] }),
    );
    await listReminders({ status: 'pending', limit: 5, order: 'due_at_asc' });
    const [url] = fetchSpy.mock.calls[0] as [string];
    // URLSearchParams emits the keys we set, in insertion order.
    expect(url).toBe('/api/reminders?status=pending&limit=5&order=due_at_asc');
  });

  it('unwraps the {reminders: [...]} envelope', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse(200, { reminders: [sampleRow, { ...sampleRow, id: 2 }] }),
    );
    const out = await listReminders({ status: 'pending' });
    expect(out).toHaveLength(2);
    expect(out[0].id).toBe(1);
    expect(out[1].id).toBe(2);
  });

  it('throws ApiError on non-2xx', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse(400, { error: 'invalid status: bogus' }),
    );
    await expect(
      listReminders({ status: 'pending' }),
    ).rejects.toBeInstanceOf(ApiError);
  });
});

describe('createReminder', () => {
  it('POSTs JSON body and returns the unwrapped reminder', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse(201, { reminder: sampleRow }),
    );
    const out = await createReminder({
      title: 'Test',
      body: 'note',
      due_at: '2026-05-26T12:00:00Z',
      channel: 'both',
    });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/reminders');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>)['Content-Type']).toBe(
      'application/json',
    );
    expect(JSON.parse(init.body as string)).toEqual({
      title: 'Test',
      body: 'note',
      due_at: '2026-05-26T12:00:00Z',
      channel: 'both',
    });
    expect(out).toEqual(sampleRow);
  });

  it('throws ApiError on 400 validation failure', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse(400, { error: 'title is required' }),
    );
    await expect(
      createReminder({
        title: '',
        due_at: '2026-05-26T12:00:00Z',
        channel: 'both',
      }),
    ).rejects.toMatchObject({ status: 400 });
  });
});

describe('snoozeReminder', () => {
  it('POSTs JSON {hours} and returns the parsed result', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse(200, { ok: true, due_at: '2026-05-27T10:00:00Z' }),
    );
    const out = await snoozeReminder(7, 24);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/reminders/7/snooze');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>)['Content-Type']).toBe(
      'application/json',
    );
    expect(JSON.parse(init.body as string)).toEqual({ hours: 24 });
    expect(out).toEqual({ ok: true, due_at: '2026-05-27T10:00:00Z' });
  });

  it('throws ApiError with status 400 on validation failure', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse(400, { error: 'hours must be a positive number' }),
    );
    await expect(snoozeReminder(7, -1)).rejects.toBeInstanceOf(ApiError);
    await expect(snoozeReminder(7, -1)).rejects.toMatchObject({ status: 400 });
  });

  it('throws ApiError with status 404 when reminder is missing', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse(404, { error: 'reminder 999 not found' }),
    );
    await expect(snoozeReminder(999, 24)).rejects.toMatchObject({ status: 404 });
  });
});

describe('dismissReminder', () => {
  it('POSTs /api/reminders/:id/dismiss and returns the parsed result', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(jsonResponse(200, { ok: true }));
    const out = await dismissReminder(11);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/reminders/11/dismiss');
    expect(init.method).toBe('POST');
    expect(out).toEqual({ ok: true });
  });

  it('throws ApiError on 404', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse(404, { error: 'reminder 999 not found' }),
    );
    await expect(dismissReminder(999)).rejects.toMatchObject({ status: 404 });
  });

  it('throws ApiError on 500', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse(500, { error: 'db down' }),
    );
    await expect(dismissReminder(1)).rejects.toMatchObject({ status: 500 });
  });
});
