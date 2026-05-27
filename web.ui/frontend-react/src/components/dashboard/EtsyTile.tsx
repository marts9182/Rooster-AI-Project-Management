import { useEffect, useState } from 'react';
import { listListings, type EtsyListing } from '../../api/etsy';
import TileShell from './TileShell';

interface State {
  status: 'loading' | 'ready' | 'error';
  rows: EtsyListing[];
  error?: string;
}

function fmtRelative(iso: string | null, now: Date = new Date()): string {
  if (!iso) return '—';
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '—';
  const deltaSec = Math.round((now.getTime() - t) / 1000);
  if (deltaSec < 60) return 'just now';
  if (deltaSec < 3600) return `${Math.round(deltaSec / 60)} min ago`;
  if (deltaSec < 86400) return `${Math.round(deltaSec / 3600)} hr ago`;
  const d = Math.round(deltaSec / 86400);
  return `${d} day${d === 1 ? '' : 's'} ago`;
}

/**
 * Dashboard tile: active listings count + total favorites/views + last
 * synced-at across the entire Etsy mirror.
 */
export default function EtsyTile() {
  const [state, setState] = useState<State>({ status: 'loading', rows: [] });

  useEffect(() => {
    let cancelled = false;
    listListings()
      .then((rows) => {
        if (!cancelled) setState({ status: 'ready', rows });
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setState({
            status: 'error',
            rows: [],
            error: err instanceof Error ? err.message : String(err),
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <TileShell id="etsy" emoji="🛒" title="Etsy Shop" viewAllHref="/etsy">
      {state.status === 'loading' && <p className="tile-loading">Loading…</p>}
      {state.status === 'error' && (
        <p className="tile-error" role="alert">
          Failed to load Etsy: {state.error}
        </p>
      )}
      {state.status === 'ready' && <EtsyBody rows={state.rows} />}
    </TileShell>
  );
}

function EtsyBody({ rows }: { rows: EtsyListing[] }) {
  const active = rows.filter((r) => r.status === 'active').length;
  const favorites = rows.reduce((s, r) => s + (r.favorites ?? 0), 0);
  const views = rows.reduce((s, r) => s + (r.views ?? 0), 0);
  // Most recent last_synced_at across the set.
  const lastSync = rows
    .map((r) => r.last_synced_at)
    .filter((s): s is string => !!s)
    .sort()
    .pop() ?? null;

  return (
    <div className="tile-etsy">
      <ul className="tile-stats" aria-label="Etsy stats">
        <li>
          <span className="tile-stat-value">{active}</span>
          <span className="tile-stat-label">Active</span>
        </li>
        <li>
          <span className="tile-stat-value">{favorites}</span>
          <span className="tile-stat-label">Favorites</span>
        </li>
        <li>
          <span className="tile-stat-value">{views}</span>
          <span className="tile-stat-label">Views</span>
        </li>
      </ul>
      <p className="tile-footer-meta">
        Last synced: <strong>{fmtRelative(lastSync)}</strong>
      </p>
    </div>
  );
}
