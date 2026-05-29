/**
 * Typed fetch wrappers for /api/roadmap/*.
 *
 *   listRoadmap(filters?) → GET    /api/roadmap
 *   createRoadmap(body)   → POST   /api/roadmap
 *   updateRoadmap(id, p)  → PUT    /api/roadmap/:id
 *   deleteRoadmap(id)     → DELETE /api/roadmap/:id
 */

import { ApiError } from './kdp';

export type RoadmapKind = 'kdp' | 'etsy';
export type RoadmapStatus =
  | 'planned' | 'building' | 'built' | 'scheduled' | 'published' | 'skipped';
export type RoadmapSource = 'reuse' | 'build';

export interface RoadmapRow {
  id: number;
  kind: RoadmapKind;
  slug: string;
  title: string;
  target_release_date: string;
  status: RoadmapStatus;
  source: RoadmapSource;
  niche: string | null;
  rationale: string | null;
  file_lock_date: string | null;
  kdp_book_id: number | null;
  etsy_listing_id: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface ListRoadmapParams {
  kind?: RoadmapKind;
  status?: string; // comma list
  from?: string;
  to?: string;
}

async function throwForStatus(r: Response, label: string): Promise<never> {
  let body: unknown = null;
  try { body = await r.json(); } catch { /* not JSON */ }
  throw new ApiError(`${label}: ${r.status}`, r.status, body);
}

export async function listRoadmap(params: ListRoadmapParams = {}): Promise<RoadmapRow[]> {
  const qs = new URLSearchParams();
  if (params.kind) qs.set('kind', params.kind);
  if (params.status) qs.set('status', params.status);
  if (params.from) qs.set('from', params.from);
  if (params.to) qs.set('to', params.to);
  const suffix = qs.toString() ? `?${qs.toString()}` : '';
  const r = await fetch(`/api/roadmap${suffix}`);
  if (!r.ok) await throwForStatus(r, 'listRoadmap');
  const data = (await r.json()) as { rows: RoadmapRow[] };
  return data.rows;
}

export async function getRoadmapById(id: number): Promise<RoadmapRow> {
  const all = await listRoadmap();
  const row = all.find((r) => r.id === id);
  if (!row) throw new ApiError(`roadmap row ${id} not found`, 404, null);
  return row;
}

export async function updateRoadmap(
  id: number,
  patch: Partial<RoadmapRow>,
): Promise<RoadmapRow> {
  const r = await fetch(`/api/roadmap/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
  if (!r.ok) await throwForStatus(r, 'updateRoadmap');
  const data = (await r.json()) as { row: RoadmapRow };
  return data.row;
}

export { ApiError };
