/**
 * Typed fetch wrappers for the /api/plans/* backend routes.
 *
 *   listPlans()       → GET /api/plans          → entries[]
 *   getPlan(slug)     → GET /api/plans/:slug    → PlanDetail (plan-first)
 *
 * The backend returns `{entries: [...]}` for the list endpoint and
 * `{entries: [...]}` for the detail endpoint (which may contain both a spec
 * and a plan that share a slug — backend sorts plan-first). The wrappers
 * unwrap the envelope; `getPlan` additionally collapses the array to a
 * single `PlanDetail` by taking the first entry (the plan, if both exist).
 *
 * Throws `ApiError` (re-exported from ./kdp) with `.status` and `.body` on
 * non-2xx so callers can render meaningful banners.
 */

import { ApiError } from './kdp';

export type PlanKind = 'spec' | 'plan';
export type PlanStatus = 'open' | 'in-flight' | 'done' | 'planned';

export interface PlanProgress {
  open: number;
  done: number;
  /** May be absent on entries with no checkboxes; equals `open + done` when present. */
  total?: number;
  percent: number;
}

export interface PlanEntry {
  kind: PlanKind;
  slug: string;
  title: string;
  date: string | null;
  status: PlanStatus;
  path: string;
  progress?: PlanProgress;
}

export interface PlanDetail extends PlanEntry {
  markdown: string;
  frontmatter?: Record<string, unknown>;
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

export async function listPlans(): Promise<PlanEntry[]> {
  const r = await fetch('/api/plans');
  if (!r.ok) await throwForStatus(r, 'listPlans');
  const data = (await r.json()) as { entries: PlanEntry[] };
  return data.entries;
}

/**
 * Fetch the rendered detail for a plan/spec slug. The backend may return
 * more than one entry for slugs that have both a spec and a plan; this
 * wrapper returns the first (plan-first by backend sort order).
 */
export async function getPlan(slug: string): Promise<PlanDetail> {
  const r = await fetch(`/api/plans/${encodeURIComponent(slug)}`);
  if (!r.ok) await throwForStatus(r, 'getPlan');
  const data = (await r.json()) as { entries: PlanDetail[] };
  if (!data.entries || data.entries.length === 0) {
    throw new ApiError(`getPlan: empty entries for slug=${slug}`, 404, data);
  }
  return data.entries[0];
}

export { ApiError };
