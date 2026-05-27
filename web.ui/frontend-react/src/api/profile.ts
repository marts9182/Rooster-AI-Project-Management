/**
 * Typed fetch wrappers for /api/profile (single-row id=1 profile table).
 *
 *   getProfile()              → GET /api/profile
 *   updateProfile(partial)    → PUT /api/profile  (partial update)
 *
 * Throws `ApiError` on non-2xx.
 */

import { ApiError } from './kdp';

export interface Profile {
  id: number;
  display_name: string | null;
  pen_names: string[];
  kdp_author_url: string | null;
  etsy_shop_url: string | null;
  pinterest_url: string | null;
  gmail_address: string | null;
  brand_palette: string[];
  time_zone: string;
}

async function throwForStatus(r: Response, label: string): Promise<never> {
  let body: unknown = null;
  try {
    body = await r.json();
  } catch {
    // body wasn't JSON; ignore.
  }
  const detail =
    body && typeof body === 'object' && 'error' in body
      ? String((body as { error: unknown }).error)
      : '';
  const message = detail
    ? `${label}: ${r.status} ${detail}`
    : `${label}: ${r.status}`;
  throw new ApiError(message, r.status, body);
}

export async function getProfile(): Promise<Profile> {
  const r = await fetch('/api/profile');
  if (!r.ok) await throwForStatus(r, 'getProfile');
  const data = (await r.json()) as { profile: Profile };
  return data.profile;
}

export async function updateProfile(
  patch: Partial<Profile>,
): Promise<Profile> {
  const r = await fetch('/api/profile', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
  if (!r.ok) await throwForStatus(r, 'updateProfile');
  const data = (await r.json()) as { profile: Profile };
  return data.profile;
}
