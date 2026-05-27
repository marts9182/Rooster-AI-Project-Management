import { describe, it, expect, vi, afterEach } from 'vitest';
import { getHelpMarkdown } from '../api/help';
import { ApiError } from '../api/kdp';

function textResponse(status: number, body: string): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => body,
    json: async () => {
      throw new Error('not json');
    },
  } as unknown as Response;
}

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

describe('getHelpMarkdown', () => {
  it('GETs /api/help/:field and returns raw markdown body', async () => {
    const md = '# ASIN\n\nHow to find your ASIN.';
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(textResponse(200, md));
    const out = await getHelpMarkdown('asin');
    expect(fetchSpy).toHaveBeenCalledWith('/api/help/asin');
    expect(out).toBe(md);
  });

  it('throws ApiError with status 404 for unknown topic', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse(404, { error: 'unknown_help_topic' }),
    );
    const err = await getHelpMarkdown('does_not_exist').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(404);
  });

  it('throws ApiError with status 400 on invalid field name', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse(400, { error: 'invalid_field_name' }),
    );
    const err = await getHelpMarkdown('../etc/passwd').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(400);
  });
});
