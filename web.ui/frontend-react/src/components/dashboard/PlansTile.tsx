import { useEffect, useState } from 'react';
import { listPlans, type PlanEntry } from '../../api/plans';
import TileShell from './TileShell';

interface State {
  status: 'loading' | 'ready' | 'error';
  entries: PlanEntry[];
  error?: string;
}

/**
 * Dashboard tile: count of in-flight + done plans, plus the 3 most recent
 * plan entries with a percent-complete progress bar.
 */
export default function PlansTile() {
  const [state, setState] = useState<State>({ status: 'loading', entries: [] });

  useEffect(() => {
    let cancelled = false;
    listPlans()
      .then((entries) => {
        if (!cancelled) setState({ status: 'ready', entries });
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setState({
            status: 'error',
            entries: [],
            error: err instanceof Error ? err.message : String(err),
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <TileShell id="plans" emoji="📋" title="Plans" viewAllHref="/plans">
      {state.status === 'loading' && <p className="tile-loading">Loading…</p>}
      {state.status === 'error' && (
        <p className="tile-error" role="alert">
          Failed to load Plans: {state.error}
        </p>
      )}
      {state.status === 'ready' && <PlansBody entries={state.entries} />}
    </TileShell>
  );
}

function PlansBody({ entries }: { entries: PlanEntry[] }) {
  const plans = entries.filter((e) => e.kind === 'plan');
  const inFlight = plans.filter((p) => p.status === 'in-flight').length;
  const done = plans.filter((p) => p.status === 'done').length;

  // Top 3 plans by date desc (newest first), fall back to slug.
  const recent = [...plans]
    .sort((a, b) => {
      const ad = a.date ?? '';
      const bd = b.date ?? '';
      return ad < bd ? 1 : ad > bd ? -1 : 0;
    })
    .slice(0, 3);

  return (
    <div className="tile-plans">
      <ul className="tile-stats" aria-label="Plan status counts">
        <li>
          <span className="tile-stat-value">{inFlight}</span>
          <span className="tile-stat-label">In flight</span>
        </li>
        <li>
          <span className="tile-stat-value">{done}</span>
          <span className="tile-stat-label">Done</span>
        </li>
      </ul>
      {recent.length === 0 ? (
        <p className="tile-empty">No plans yet.</p>
      ) : (
        <ul className="tile-list" aria-label="Most recent plans">
          {recent.map((p) => {
            const percent = p.progress?.percent ?? 0;
            return (
              <li key={p.path} className="tile-plan-row">
                <div className="tile-plan-title">{p.title}</div>
                <div className="plans-progress" aria-hidden="true">
                  <div
                    className="plans-progress-fill"
                    style={{ width: `${Math.max(0, Math.min(100, percent))}%` }}
                  />
                </div>
                <div className="tile-plan-meta">
                  <span>{p.status === 'in-flight' ? 'in flight' : p.status}</span>
                  <span>{percent}%</span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
