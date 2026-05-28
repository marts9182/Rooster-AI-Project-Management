/**
 * KDP Catalog page — sortable table of all rows in the kdp_books table.
 *
 * - Fetches via `listBooks()` on mount.
 * - Re-fetches when any `kdp:new-book`, `kdp:status-changed`, or `kdp:published`
 *   event arrives via the shared `useSseEvents` SSE bus (throttled to 1/sec).
 * - Click a row title → navigates to `/kdp/:slug`.
 * - Click a column header → toggles sort key / direction.
 * - `[+ Add manually]` is a stub for Plan B (just shows an alert).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { listBooks, type KdpBook, type KdpStatus } from '../api/kdp';
import { useSseEvents } from '../hooks/useSseEvents';
import KdpPendingSyncBanner from '../components/KdpPendingSyncBanner';

type SortKey = 'title' | 'status' | 'asin' | 'release_date' | 'updated_at';
type SortDir = 'asc' | 'desc';

const STATUS_LABEL: Record<KdpStatus, string> = {
  built: 'Built',
  in_review: 'In review',
  published: 'Live',
  archived: 'Archived',
};

const STATUS_EMOJI: Record<KdpStatus, string> = {
  built: '🟦',
  in_review: '🟡',
  published: '✅',
  archived: '⬜',
};

const KDP_SSE_KINDS = new Set([
  'kdp:new-book',
  'kdp:status-changed',
  'kdp:published',
]);

export default function KdpCatalog() {
  const [books, setBooks] = useState<KdpBook[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>('updated_at');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  // Throttle SSE-triggered refetches to at most one per second.
  const lastRefetchAt = useRef<number>(0);

  const reload = useCallback(() => {
    setLoading(true);
    listBooks()
      .then((bs) => {
        setBooks(bs);
        setError(null);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  // Initial fetch.
  useEffect(() => {
    reload();
  }, [reload]);

  // SSE: refetch on kdp:* events (throttled).
  const { lastEvent } = useSseEvents();
  useEffect(() => {
    if (!lastEvent) return;
    if (!KDP_SSE_KINDS.has(lastEvent.kind)) return;
    const now = Date.now();
    if (now - lastRefetchAt.current < 1000) return;
    lastRefetchAt.current = now;
    reload();
  }, [lastEvent, reload]);

  const sorted = useMemo(() => {
    const arr = [...books];
    arr.sort((a, b) => {
      const av = (a[sortKey] ?? '') as string | number;
      const bv = (b[sortKey] ?? '') as string | number;
      const cmp = av < bv ? -1 : av > bv ? 1 : 0;
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return arr;
  }, [books, sortKey, sortDir]);

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

  function handleAddManually() {
    alert('Add-manually flow ships in a later plan.');
  }

  return (
    <section>
      <div className="page-header">
        <h1>KDP catalog</h1>
        <div className="page-header-actions">
          <button type="button" onClick={handleAddManually}>
            + Add manually
          </button>
        </div>
      </div>

      <KdpPendingSyncBanner onApplied={() => reload()} />

      {error && (
        <p role="alert" className="error-text">
          {error}
        </p>
      )}

      {loading && books.length === 0 && <p>Loading…</p>}

      {!loading && books.length === 0 && !error && (
        <p>No books yet. Build one via the KDP pipeline and it'll show up here.</p>
      )}

      {books.length > 0 && (
        <table className="kdp-catalog-table">
          <thead>
            <tr>
              <th>Cover</th>
              <th>
                <button
                  type="button"
                  onClick={() => toggleSort('title')}
                  className="th-sort"
                >
                  Title{sortIndicator('title')}
                </button>
              </th>
              <th>
                <button
                  type="button"
                  onClick={() => toggleSort('status')}
                  className="th-sort"
                >
                  Status{sortIndicator('status')}
                </button>
              </th>
              <th>
                <button
                  type="button"
                  onClick={() => toggleSort('asin')}
                  className="th-sort"
                >
                  ASIN{sortIndicator('asin')}
                </button>
              </th>
              <th>
                <button
                  type="button"
                  onClick={() => toggleSort('release_date')}
                  className="th-sort"
                >
                  Released{sortIndicator('release_date')}
                </button>
              </th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((b) => (
              <tr key={b.slug}>
                <td>
                  {b.cover_path ? (
                    <img
                      src={`/files/${b.cover_path}`}
                      alt=""
                      className="kdp-cover-thumb"
                    />
                  ) : (
                    <div className="cover-placeholder" aria-hidden="true" />
                  )}
                </td>
                <td>
                  <Link to={`/kdp/${b.slug}`} className="row-title-link">
                    {b.title}
                  </Link>
                </td>
                <td>
                  <span
                    className={`status-badge status-${b.status}`}
                    aria-label={`Status: ${STATUS_LABEL[b.status]}`}
                  >
                    <span aria-hidden="true">{STATUS_EMOJI[b.status]}</span>{' '}
                    {STATUS_LABEL[b.status]}
                  </span>
                </td>
                <td>{b.asin ?? '—'}</td>
                <td>{b.release_date ?? '—'}</td>
                <td>
                  <Link to={`/kdp/${b.slug}`}>Open</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
