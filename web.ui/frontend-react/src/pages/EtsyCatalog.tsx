/**
 * Etsy Catalog page — sortable, filterable table of all rows in etsy_listings.
 *
 * - Fetches via `listListings(filters)` on mount and whenever any filter chip
 *   toggles.
 * - Filter chips: status (active / inactive / draft / sold_out / expired),
 *   section (drop-down populated from distinct values in the result set),
 *   niche (same).
 * - Sortable column headers — toggle direction on re-click, same pattern as
 *   KdpCatalog.
 * - `[Sync now]` button calls `syncNow()`, shows a spinner, then refetches
 *   the list and shows a transient toast "Synced — X inserted, Y updated".
 * - Click a row's title → navigates to `/etsy/:etsy_listing_id`.
 * - SSE wiring is intentionally NOT here — Task 14 of Plan C adds it.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  listListings,
  syncNow,
  type EtsyListing,
  type ListListingsParams,
} from '../api/etsy';
import { useSseEvents } from '../hooks/useSseEvents';

const ETSY_SSE_KINDS = new Set([
  'etsy:synced',
  'etsy:status-changed',
  'etsy:new-listing',
  'etsy:sale-detected',
]);

type SortKey =
  | 'title'
  | 'status'
  | 'niche'
  | 'price_usd'
  | 'favorites'
  | 'views'
  | 'listed_at';
type SortDir = 'asc' | 'desc';

const STATUS_EMOJI: Record<string, string> = {
  active: '✅',
  inactive: '⏸️',
  sold_out: '🛒💲',
  expired: '⌛',
  draft: '📝',
};

const STATUS_LABEL: Record<string, string> = {
  active: 'Active',
  inactive: 'Inactive',
  sold_out: 'Sold out',
  expired: 'Expired',
  draft: 'Draft',
};

const STATUS_FILTER_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
  { value: 'draft', label: 'Draft' },
  { value: 'sold_out', label: 'Sold out' },
];

function formatPrice(p: number | null): string {
  if (p == null) return '—';
  return `$${p.toFixed(2)}`;
}

function statusLabel(status: string): string {
  return STATUS_LABEL[status] ?? status;
}

function statusEmoji(status: string): string {
  return STATUS_EMOJI[status] ?? '•';
}

/**
 * Format an ISO timestamp as a coarse relative time ("3 days ago", "just now").
 */
export function formatRelative(iso: string | null, now: Date = new Date()): string {
  if (!iso) return '—';
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '—';
  const deltaSec = Math.round((now.getTime() - t) / 1000);
  if (deltaSec < 0) {
    const future = -deltaSec;
    if (future < 60) return 'in a moment';
    if (future < 3600) return `in ${Math.round(future / 60)} min`;
    if (future < 86400) return `in ${Math.round(future / 3600)} hr`;
    return `in ${Math.round(future / 86400)} days`;
  }
  if (deltaSec < 60) return 'just now';
  if (deltaSec < 3600) {
    const m = Math.round(deltaSec / 60);
    return `${m} min ago`;
  }
  if (deltaSec < 86400) {
    const h = Math.round(deltaSec / 3600);
    return `${h} hr ago`;
  }
  const days = Math.round(deltaSec / 86400);
  if (days < 30) return `${days} day${days === 1 ? '' : 's'} ago`;
  const months = Math.round(days / 30);
  if (months < 12) return `${months} month${months === 1 ? '' : 's'} ago`;
  const years = Math.round(days / 365);
  return `${years} year${years === 1 ? '' : 's'} ago`;
}

export default function EtsyCatalog() {
  const [filters, setFilters] = useState<ListListingsParams>({});
  const [rows, setRows] = useState<EtsyListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>('listed_at');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [syncing, setSyncing] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // Throttle SSE-triggered refetches to at most one per 2 seconds.
  const lastRefetchAt = useRef<number>(0);

  const reload = useCallback(
    (filtersToUse: ListListingsParams) => {
      setLoading(true);
      listListings(filtersToUse)
        .then((data) => {
          setRows(data);
          setError(null);
        })
        .catch((err: unknown) => {
          setError(err instanceof Error ? err.message : String(err));
        })
        .finally(() => setLoading(false));
    },
    [],
  );

  useEffect(() => {
    reload(filters);
  }, [filters, reload]);

  // SSE: refetch on etsy:* events (throttled to 1 per 2s).
  const { lastEvent } = useSseEvents();
  useEffect(() => {
    if (!lastEvent) return;
    if (!ETSY_SSE_KINDS.has(lastEvent.kind)) return;
    const now = Date.now();
    if (now - lastRefetchAt.current < 2000) return;
    lastRefetchAt.current = now;
    reload(filters);
  }, [lastEvent, filters, reload]);

  // Auto-dismiss toast after 4s.
  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), 4000);
    return () => window.clearTimeout(id);
  }, [toast]);

  const sectionOptions = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) {
      if (r.section) set.add(r.section);
    }
    return Array.from(set).sort();
  }, [rows]);

  const nicheOptions = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) {
      if (r.niche) set.add(r.niche);
    }
    return Array.from(set).sort();
  }, [rows]);

  const sorted = useMemo(() => {
    const arr = [...rows];
    arr.sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      let cmp = 0;
      if (typeof av === 'number' && typeof bv === 'number') {
        cmp = av - bv;
      } else {
        cmp = String(av) < String(bv) ? -1 : String(av) > String(bv) ? 1 : 0;
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return arr;
  }, [rows, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  }

  function sortIndicator(key: SortKey): string {
    if (sortKey !== key) return '';
    return sortDir === 'asc' ? ' ▲' : ' ▼';
  }

  function toggleStatusChip(value: string) {
    setFilters((prev) => {
      if (prev.status === value) {
        const { status: _drop, ...rest } = prev;
        void _drop;
        return rest;
      }
      return { ...prev, status: value };
    });
  }

  function onSectionChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const value = e.target.value;
    setFilters((prev) => {
      if (!value) {
        const { section: _drop, ...rest } = prev;
        void _drop;
        return rest;
      }
      return { ...prev, section: value };
    });
  }

  function onNicheChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const value = e.target.value;
    setFilters((prev) => {
      if (!value) {
        const { niche: _drop, ...rest } = prev;
        void _drop;
        return rest;
      }
      return { ...prev, niche: value };
    });
  }

  async function onSyncNow() {
    setSyncing(true);
    setError(null);
    try {
      const result = await syncNow();
      setToast(
        `Synced — ${result.inserted} inserted, ${result.updated} updated`,
      );
      reload(filters);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSyncing(false);
    }
  }

  return (
    <section>
      <div className="page-header">
        <h1>Etsy catalog</h1>
        <div className="page-header-actions">
          <button
            type="button"
            onClick={() => void onSyncNow()}
            disabled={syncing}
          >
            {syncing ? 'Syncing…' : 'Sync now'}
          </button>
        </div>
      </div>

      {toast && (
        <p
          role="status"
          style={{
            background: '#e6f7ec',
            color: '#1b6d3a',
            padding: '6px 10px',
            borderRadius: 4,
            marginBottom: '0.5rem',
          }}
        >
          {toast}
        </p>
      )}

      {error && (
        <p role="alert" className="error-text">
          {error}
        </p>
      )}

      <div
        style={{
          display: 'flex',
          gap: 8,
          flexWrap: 'wrap',
          alignItems: 'center',
          margin: '0.5rem 0 1rem',
        }}
      >
        <span style={{ fontWeight: 600 }}>Status:</span>
        {STATUS_FILTER_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            aria-pressed={filters.status === opt.value}
            onClick={() => toggleStatusChip(opt.value)}
            style={{
              padding: '4px 10px',
              borderRadius: 12,
              border: '1px solid #ccc',
              background: filters.status === opt.value ? '#cfe4ff' : '#fff',
              cursor: 'pointer',
            }}
          >
            {opt.label}
          </button>
        ))}
        <label style={{ marginLeft: 12 }}>
          Section:&nbsp;
          <select
            value={filters.section ?? ''}
            onChange={onSectionChange}
            aria-label="Section filter"
          >
            <option value="">All</option>
            {sectionOptions.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label>
          Niche:&nbsp;
          <select
            value={filters.niche ?? ''}
            onChange={onNicheChange}
            aria-label="Niche filter"
          >
            <option value="">All</option>
            {nicheOptions.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
      </div>

      {loading && rows.length === 0 && <p>Loading…</p>}

      {!loading && rows.length === 0 && !error && (
        <p>No listings match the current filters.</p>
      )}

      {rows.length > 0 && (
        <table
          className="etsy-catalog-table"
          style={{ width: '100%', borderCollapse: 'collapse' }}
        >
          <thead>
            <tr>
              <th style={{ textAlign: 'left' }}>
                <button
                  type="button"
                  onClick={() => toggleSort('title')}
                  className="th-sort"
                >
                  Title{sortIndicator('title')}
                </button>
              </th>
              <th style={{ textAlign: 'left' }}>
                <button
                  type="button"
                  onClick={() => toggleSort('status')}
                  className="th-sort"
                >
                  Status{sortIndicator('status')}
                </button>
              </th>
              <th style={{ textAlign: 'left' }}>
                <button
                  type="button"
                  onClick={() => toggleSort('niche')}
                  className="th-sort"
                >
                  Niche{sortIndicator('niche')}
                </button>
              </th>
              <th style={{ textAlign: 'right' }}>
                <button
                  type="button"
                  onClick={() => toggleSort('price_usd')}
                  className="th-sort"
                >
                  Price{sortIndicator('price_usd')}
                </button>
              </th>
              <th style={{ textAlign: 'right' }}>
                <button
                  type="button"
                  onClick={() => toggleSort('favorites')}
                  className="th-sort"
                >
                  Favorites{sortIndicator('favorites')}
                </button>
              </th>
              <th style={{ textAlign: 'right' }}>
                <button
                  type="button"
                  onClick={() => toggleSort('views')}
                  className="th-sort"
                >
                  Views{sortIndicator('views')}
                </button>
              </th>
              <th style={{ textAlign: 'left' }}>
                <button
                  type="button"
                  onClick={() => toggleSort('listed_at')}
                  className="th-sort"
                >
                  Listed{sortIndicator('listed_at')}
                </button>
              </th>
              <th style={{ textAlign: 'left' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => (
              <tr key={r.etsy_listing_id}>
                <td>
                  <Link to={`/etsy/${r.etsy_listing_id}`} className="row-title-link">{r.title}</Link>
                </td>
                <td>
                  <span
                    className={`status-badge status-${r.status}`}
                    aria-label={`Status: ${statusLabel(r.status)}`}
                  >
                    <span aria-hidden="true">{statusEmoji(r.status)}</span>{' '}
                    {statusLabel(r.status)}
                  </span>
                </td>
                <td>{r.niche ?? '—'}</td>
                <td style={{ textAlign: 'right' }}>{formatPrice(r.price_usd)}</td>
                <td style={{ textAlign: 'right' }}>{r.favorites}</td>
                <td style={{ textAlign: 'right' }}>{r.views}</td>
                <td>{formatRelative(r.listed_at)}</td>
                <td>
                  {r.listing_url ? (
                    <a href={r.listing_url} target="_blank" rel="noreferrer">
                      Open on Etsy
                    </a>
                  ) : (
                    '—'
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
