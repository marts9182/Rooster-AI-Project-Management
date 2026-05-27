import { useEffect, useState } from 'react';
import {
  listQueue,
  listHistory,
  type PinterestQueueRow,
  type PinterestHistoryRow,
} from '../../api/pinterest';
import TileShell from './TileShell';

interface State {
  status: 'loading' | 'ready' | 'error';
  queue: PinterestQueueRow[];
  history: PinterestHistoryRow[];
  error?: string;
}

function fmtCountdown(iso: string, now: Date = new Date()): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '—';
  const delta = t - now.getTime();
  if (delta <= 0) return 'now';
  const mins = Math.round(delta / 60_000);
  if (mins < 60) return `in ${mins} min`;
  const hrs = Math.round(delta / 3_600_000);
  if (hrs < 24) return `in ${hrs} hr`;
  const days = Math.round(delta / 86_400_000);
  return `in ${days} day${days === 1 ? '' : 's'}`;
}

function fmtRelativePast(iso: string, now: Date = new Date()): string {
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
 * Dashboard tile: queue depth, time-until-next-scheduled, last-posted-at.
 */
export default function PinterestTile() {
  const [state, setState] = useState<State>({
    status: 'loading',
    queue: [],
    history: [],
  });

  useEffect(() => {
    let cancelled = false;
    Promise.all([listQueue(), listHistory(1)])
      .then(([queue, history]) => {
        if (!cancelled) setState({ status: 'ready', queue, history });
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setState({
            status: 'error',
            queue: [],
            history: [],
            error: err instanceof Error ? err.message : String(err),
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <TileShell
      id="pinterest"
      emoji="📌"
      title="Pinterest"
      viewAllHref="/pinterest"
    >
      {state.status === 'loading' && <p className="tile-loading">Loading…</p>}
      {state.status === 'error' && (
        <p className="tile-error" role="alert">
          Failed to load Pinterest: {state.error}
        </p>
      )}
      {state.status === 'ready' && (
        <PinterestBody queue={state.queue} history={state.history} />
      )}
    </TileShell>
  );
}

function PinterestBody({
  queue,
  history,
}: {
  queue: PinterestQueueRow[];
  history: PinterestHistoryRow[];
}) {
  const pending = queue.filter((r) => r.status === 'pending');
  const nextPending = [...pending].sort((a, b) =>
    a.scheduled_for < b.scheduled_for ? -1 : 1,
  )[0];
  const lastPosted = history[0];

  return (
    <div className="tile-pinterest">
      <ul className="tile-stats" aria-label="Pinterest queue stats">
        <li>
          <span className="tile-stat-value">{queue.length}</span>
          <span className="tile-stat-label">In queue</span>
        </li>
        <li>
          <span className="tile-stat-value">{pending.length}</span>
          <span className="tile-stat-label">Pending</span>
        </li>
      </ul>
      <ul className="tile-meta-list">
        <li>
          <span className="tile-meta-label">Next:</span>{' '}
          {nextPending ? (
            <strong>{fmtCountdown(nextPending.scheduled_for)}</strong>
          ) : (
            <span className="tile-meta-empty">none scheduled</span>
          )}
        </li>
        <li>
          <span className="tile-meta-label">Last posted:</span>{' '}
          {lastPosted ? (
            <strong>{fmtRelativePast(lastPosted.posted_at)}</strong>
          ) : (
            <span className="tile-meta-empty">never</span>
          )}
        </li>
      </ul>
    </div>
  );
}
