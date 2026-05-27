import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  listQueue,
  listHistory,
  pauseQueue,
  resumeQueue,
  cancelQueueRow,
  updateQueueRow,
  startLogin,
  ApiError,
  type PinterestQueueRow,
  type PinterestHistoryRow,
} from '../api/pinterest';

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

const sampleQueueRow: PinterestQueueRow = {
  id: 1,
  kdp_book_id: 7,
  pin_type: 'cover_hero',
  image_path: '/tmp/output/pinterest/sample-slug/cover_hero-0.png',
  title: 'Sample pin',
  description: 'A pin description.',
  link_url: 'https://www.amazon.com/dp/B01ABCDEFG',
  status: 'pending',
  scheduled_for: '2026-05-28T15:00:00Z',
  attempts: 0,
  last_error: null,
  created_at: '2026-05-26T00:00:00Z',
};

const sampleHistoryRow: PinterestHistoryRow = {
  id: 1,
  queue_id: 1,
  pinterest_pin_id: '987654321',
  posted_at: '2026-05-26T12:00:00Z',
  success: true,
  error_message: null,
  title: 'Sample pin',
  image_path: '/tmp/output/pinterest/sample-slug/cover_hero-0.png',
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('listQueue', () => {
  it('GETs /api/pinterest/queue and unwraps {queue}', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(jsonResponse(200, { queue: [sampleQueueRow] }));
    const out = await listQueue();
    expect(fetchSpy).toHaveBeenCalledWith('/api/pinterest/queue');
    expect(out).toEqual([sampleQueueRow]);
  });

  it('throws ApiError on 404', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse(404, { error: 'not_found' }),
    );
    await expect(listQueue()).rejects.toBeInstanceOf(ApiError);
    await expect(listQueue()).rejects.toMatchObject({ status: 404 });
  });

  it('throws ApiError on 500', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse(500, { error: 'boom' }),
    );
    await expect(listQueue()).rejects.toMatchObject({ status: 500 });
  });
});

describe('listHistory', () => {
  it('GETs /api/pinterest/history?limit=100 by default', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(jsonResponse(200, { history: [sampleHistoryRow] }));
    const out = await listHistory();
    expect(fetchSpy).toHaveBeenCalledWith('/api/pinterest/history?limit=100');
    expect(out).toEqual([sampleHistoryRow]);
  });

  it('passes a custom limit through the querystring', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(jsonResponse(200, { history: [] }));
    await listHistory(25);
    expect(fetchSpy).toHaveBeenCalledWith('/api/pinterest/history?limit=25');
  });

  it('throws ApiError on 404', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse(404, { error: 'not_found' }),
    );
    await expect(listHistory()).rejects.toMatchObject({ status: 404 });
  });

  it('throws ApiError on 500', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse(500, { error: 'db down' }),
    );
    await expect(listHistory()).rejects.toMatchObject({ status: 500 });
  });
});

describe('pauseQueue', () => {
  it('POSTs /api/pinterest/pause and returns {paused}', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(jsonResponse(200, { paused: 3 }));
    const out = await pauseQueue();
    expect(fetchSpy).toHaveBeenCalledWith('/api/pinterest/pause', {
      method: 'POST',
    });
    expect(out).toEqual({ paused: 3 });
  });

  it('throws ApiError on 404', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse(404, { error: 'not_mounted' }),
    );
    await expect(pauseQueue()).rejects.toMatchObject({ status: 404 });
  });

  it('throws ApiError on 500', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse(500, { error: 'boom' }),
    );
    await expect(pauseQueue()).rejects.toMatchObject({ status: 500 });
  });
});

describe('resumeQueue', () => {
  it('POSTs /api/pinterest/resume and returns {resumed}', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(jsonResponse(200, { resumed: 2 }));
    const out = await resumeQueue();
    expect(fetchSpy).toHaveBeenCalledWith('/api/pinterest/resume', {
      method: 'POST',
    });
    expect(out).toEqual({ resumed: 2 });
  });

  it('throws ApiError on 404', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse(404, { error: 'nope' }),
    );
    await expect(resumeQueue()).rejects.toMatchObject({ status: 404 });
  });

  it('throws ApiError on 500', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse(500, { error: 'boom' }),
    );
    await expect(resumeQueue()).rejects.toMatchObject({ status: 500 });
  });
});

describe('cancelQueueRow', () => {
  it('POSTs /api/pinterest/queue/:id/cancel and returns {ok}', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(jsonResponse(200, { ok: true }));
    const out = await cancelQueueRow(42);
    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/pinterest/queue/42/cancel',
      { method: 'POST' },
    );
    expect(out).toEqual({ ok: true });
  });

  it('throws ApiError on 404 (row missing)', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse(404, { error: 'not_found' }),
    );
    await expect(cancelQueueRow(99)).rejects.toMatchObject({ status: 404 });
  });

  it('throws ApiError on 500', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse(500, { error: 'boom' }),
    );
    await expect(cancelQueueRow(1)).rejects.toMatchObject({ status: 500 });
  });
});

describe('updateQueueRow', () => {
  it('PUTs JSON patch to /api/pinterest/queue/:id', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(jsonResponse(200, { ok: true }));
    const patch = {
      title: 'Updated',
      scheduled_for: '2026-05-29T12:00:00Z',
    };
    const out = await updateQueueRow(7, patch);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/pinterest/queue/7');
    expect(init.method).toBe('PUT');
    expect(init.headers).toEqual({ 'Content-Type': 'application/json' });
    expect(JSON.parse(init.body as string)).toEqual(patch);
    expect(out).toEqual({ ok: true });
  });

  it('throws ApiError on 404', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse(404, { error: 'not_found' }),
    );
    await expect(
      updateQueueRow(99, { title: 'x' }),
    ).rejects.toMatchObject({ status: 404 });
  });

  it('throws ApiError on 500', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse(500, { error: 'db down' }),
    );
    await expect(updateQueueRow(7, { title: 'x' })).rejects.toMatchObject({
      status: 500,
    });
  });
});

describe('startLogin', () => {
  it('POSTs /api/pinterest/login and returns the launch envelope', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(jsonResponse(200, { ok: true, launched: true }));
    const out = await startLogin();
    expect(fetchSpy).toHaveBeenCalledWith('/api/pinterest/login', {
      method: 'POST',
    });
    expect(out).toEqual({ ok: true, launched: true });
  });

  it('throws ApiError on 404', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse(404, { error: 'route_missing' }),
    );
    await expect(startLogin()).rejects.toMatchObject({ status: 404 });
  });

  it('throws ApiError on 500', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse(500, { error: 'playwright_failed' }),
    );
    await expect(startLogin()).rejects.toBeInstanceOf(ApiError);
    await expect(startLogin()).rejects.toMatchObject({ status: 500 });
  });
});
