import { describe, it, expect, vi, afterEach } from 'vitest';
import { getProfile, updateProfile, type Profile } from '../api/profile';
import { ApiError } from '../api/kdp';

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

const sampleProfile: Profile = {
  id: 1,
  display_name: 'Seven Martin',
  pen_names: ['Seven Martin'],
  kdp_author_url: null,
  etsy_shop_url: null,
  pinterest_url: null,
  gmail_address: null,
  brand_palette: [],
  time_zone: 'America/Los_Angeles',
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('getProfile', () => {
  it('GETs /api/profile and unwraps {profile}', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(jsonResponse(200, { profile: sampleProfile }));
    const out = await getProfile();
    expect(fetchSpy).toHaveBeenCalledWith('/api/profile');
    expect(out).toEqual(sampleProfile);
  });

  it('throws ApiError on 500', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse(500, { error: 'boom' }),
    );
    await expect(getProfile()).rejects.toBeInstanceOf(ApiError);
  });
});

describe('updateProfile', () => {
  it('PUTs the partial body and unwraps {profile}', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(jsonResponse(200, { profile: sampleProfile }));
    await updateProfile({ display_name: 'Seven Martin' });
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/profile');
    expect(init.method).toBe('PUT');
    expect(JSON.parse(init.body as string)).toEqual({
      display_name: 'Seven Martin',
    });
  });

  it('throws ApiError with status 400 on validation failure', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse(400, { error: 'gmail_address_invalid' }),
    );
    await expect(
      updateProfile({ gmail_address: 'not-an-email' }),
    ).rejects.toMatchObject({ status: 400 });
  });
});
