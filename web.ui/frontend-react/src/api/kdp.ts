/**
 * Typed fetch wrappers for the /api/kdp/* backend routes.
 *
 *   listBooks()                  → GET    /api/kdp/books
 *   getBook(slug)                → GET    /api/kdp/books/:slug
 *   markInReview(slug)           → POST   /api/kdp/books/:slug/mark-in-review
 *   markPublished(slug, body)    → POST   /api/kdp/books/:slug/mark-published
 *
 * All functions throw an `ApiError` with `.status` and `.body` on non-2xx so
 * the caller can render a meaningful banner. Tests stub `globalThis.fetch`.
 */

export type KdpStatus = 'built' | 'in_review' | 'published' | 'archived';

export interface KdpBook {
  id: number;
  slug: string;
  title: string;
  subtitle: string | null;
  asin: string | null;
  status: KdpStatus;
  release_date: string | null;
  listing_url: string | null;
  page_count: number | null;
  trim_size: string | null;
  price_usd: number | null;
  cover_path: string | null;
  blurb?: string | null;
  output_dir?: string | null;
  puzzle_audit_status?: 'unchecked' | 'passed' | 'failed' | null;
  puzzle_audit_at?: string | null;
  puzzle_audit_summary_json?: string | null;
  updated_at: string;
}

export interface KdpDetail {
  book: KdpBook;
  previews: string[];
}

export interface MarkPublishedInput {
  asin: string;
  release_date: string;
}

export class ApiError extends Error {
  status: number;
  body: unknown;
  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
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

export async function listBooks(): Promise<KdpBook[]> {
  const r = await fetch('/api/kdp/books');
  if (!r.ok) await throwForStatus(r, 'listBooks');
  const data = (await r.json()) as { books: KdpBook[] };
  return data.books;
}

export async function getBook(slug: string): Promise<KdpDetail> {
  const r = await fetch(`/api/kdp/books/${encodeURIComponent(slug)}`);
  if (!r.ok) await throwForStatus(r, 'getBook');
  return (await r.json()) as KdpDetail;
}

export async function markInReview(slug: string): Promise<KdpBook> {
  const r = await fetch(
    `/api/kdp/books/${encodeURIComponent(slug)}/mark-in-review`,
    { method: 'POST' },
  );
  if (!r.ok) await throwForStatus(r, 'markInReview');
  const data = (await r.json()) as { book: KdpBook };
  return data.book;
}

export async function markPublished(
  slug: string,
  body: MarkPublishedInput,
): Promise<KdpBook> {
  const r = await fetch(
    `/api/kdp/books/${encodeURIComponent(slug)}/mark-published`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
  );
  if (!r.ok) await throwForStatus(r, 'markPublished');
  const data = (await r.json()) as { book: KdpBook };
  return data.book;
}

// ── Puzzle audit ──────────────────────────────────────────────────────────

export interface PuzzleAuditEntry {
  index: number;
  difficulty: 'easy' | 'medium' | 'hard' | 'expert';
  clue_count: number;
  is_unique: boolean;
  symmetric_180: boolean;
  technique_tier:
    | 'naked_singles'
    | 'hidden_singles'
    | 'locked_candidates'
    | 'naked_pairs'
    | 'naked_triples'
    | 'backtracking';
  match_difficulty: boolean;
}

export interface PuzzleAuditTotals {
  checked: number;
  passed: number;
  failed: number;
  uniqueness_failures: number;
  symmetry_failures: number;
  tier_mismatches: number;
}

export interface PuzzleAuditSummary {
  puzzles: PuzzleAuditEntry[];
  totals: PuzzleAuditTotals;
  error?: string;
}

export async function auditPuzzles(slug: string): Promise<KdpBook> {
  const r = await fetch(
    `/api/kdp/books/${encodeURIComponent(slug)}/audit-puzzles`,
    { method: 'POST' },
  );
  if (!r.ok) await throwForStatus(r, 'auditPuzzles');
  const data = (await r.json()) as { book: KdpBook };
  return data.book;
}
