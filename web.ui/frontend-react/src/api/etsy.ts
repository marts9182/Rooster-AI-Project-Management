/**
 * Typed fetch wrappers for the /api/etsy/* backend routes.
 *
 *   listListings(params?)         → GET    /api/etsy/listings
 *   getListing(listingId)         → GET    /api/etsy/listings/:listingId
 *   syncNow()                     → POST   /api/etsy/sync-now
 *
 * All functions throw an `ApiError` (re-exported from ./kdp) with `.status`
 * and `.body` on non-2xx. Tests stub `globalThis.fetch`.
 */

import { ApiError } from './kdp';

export interface EtsyListing {
  id: number;
  etsy_listing_id: number;
  sku_id: string | null;
  title: string;
  /** 'active' | 'inactive' | 'sold_out' | 'expired' | 'draft' */
  status: string;
  section: string | null;
  niche: string | null;
  price_usd: number | null;
  favorites: number;
  views: number;
  listed_at: string | null;
  last_synced_at: string;
  listing_url: string | null;
}

export interface SyncNowResult {
  inserted: number;
  updated: number;
  statusChanged: number;
}

export interface ListListingsParams {
  status?: string;
  section?: string;
  niche?: string;
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

export async function listListings(
  params: ListListingsParams = {},
): Promise<EtsyListing[]> {
  const qs = new URLSearchParams();
  if (params.status) qs.set('status', params.status);
  if (params.section) qs.set('section', params.section);
  if (params.niche) qs.set('niche', params.niche);
  const suffix = qs.toString() ? `?${qs.toString()}` : '';
  const r = await fetch(`/api/etsy/listings${suffix}`);
  if (!r.ok) await throwForStatus(r, 'listListings');
  const data = (await r.json()) as { listings: EtsyListing[] };
  return data.listings;
}

export async function getListing(listingId: number): Promise<EtsyListing> {
  const r = await fetch(`/api/etsy/listings/${listingId}`);
  if (!r.ok) await throwForStatus(r, 'getListing');
  return (await r.json()) as EtsyListing;
}

export async function syncNow(): Promise<SyncNowResult> {
  const r = await fetch('/api/etsy/sync-now', { method: 'POST' });
  if (!r.ok) await throwForStatus(r, 'syncNow');
  return (await r.json()) as SyncNowResult;
}

export { ApiError };
