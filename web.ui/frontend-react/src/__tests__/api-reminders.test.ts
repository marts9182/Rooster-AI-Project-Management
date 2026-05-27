import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  snoozeReminder,
  dismissReminder,
  ApiError,
} from '../api/reminders';

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
