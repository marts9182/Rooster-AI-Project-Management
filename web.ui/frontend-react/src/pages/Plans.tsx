import { useEffect, useMemo, useState } from 'react';
import { listPlans, type PlanEntry } from '../api/plans';
import { PlanDetailModal } from '../components/PlanDetailModal';

/**
 * Two-column browser for `docs/superpowers/{specs,plans}/*.md`. Calls
 * `listPlans()` on mount and renders entries grouped by `kind`. Clicking a
 * card opens `<PlanDetailModal>` with the rendered markdown.
 */
export default function Plans() {
  const [entries, setEntries] = useState<PlanEntry[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [err, setErr] = useState<string | null>(null);
  const [activeSlug, setActiveSlug] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setErr(null);
    void (async () => {
      try {
        const list = await listPlans();
        if (!cancelled) setEntries(list);
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const specs = useMemo(
    () => entries.filter((e) => e.kind === 'spec'),
    [entries],
  );
  const plans = useMemo(
    () => entries.filter((e) => e.kind === 'plan'),
    [entries],
  );

  return (
    <section className="plans-page">
      <div className="page-header">
        <h1 className="plans-page__heading">Specs &amp; Implementation Plans</h1>
      </div>

      {err && (
        <div className="plans-page__error" role="alert">
          Failed to load: {err}
        </div>
      )}

      {loading && !err && (
        <p className="plans-page__loading">Loading…</p>
      )}

      {!loading && !err && (
        <div className="plans-page__columns">
          <section
            className="plans-page__column"
            aria-labelledby="specs-heading"
          >
            <h2 id="specs-heading" className="plans-page__column-heading">
              Specs
            </h2>
            {specs.length === 0 ? (
              <p className="plans-page__empty">No specs found.</p>
            ) : (
              <ul className="plans-page__list">
                {specs.map((entry) => (
                  <PlanCard
                    key={entry.path}
                    entry={entry}
                    onOpen={() => setActiveSlug(entry.slug)}
                  />
                ))}
              </ul>
            )}
          </section>

          <section
            className="plans-page__column"
            aria-labelledby="plans-heading"
          >
            <h2 id="plans-heading" className="plans-page__column-heading">
              Implementation Plans
            </h2>
            {plans.length === 0 ? (
              <p className="plans-page__empty">No implementation plans found.</p>
            ) : (
              <ul className="plans-page__list">
                {plans.map((entry) => (
                  <PlanCard
                    key={entry.path}
                    entry={entry}
                    onOpen={() => setActiveSlug(entry.slug)}
                  />
                ))}
              </ul>
            )}
          </section>
        </div>
      )}

      <PlanDetailModal
        slug={activeSlug}
        onClose={() => setActiveSlug(null)}
      />
    </section>
  );
}

interface PlanCardProps {
  entry: PlanEntry;
  onOpen: () => void;
}

function PlanCard({ entry, onOpen }: PlanCardProps) {
  const hasProgress =
    entry.kind === 'plan' &&
    entry.progress != null &&
    (entry.progress.open + entry.progress.done) > 0;

  return (
    <li className={`plan-card plan-card--${entry.status}`}>
      <button
        type="button"
        className="plan-card__button"
        onClick={onOpen}
      >
        <div className="plan-card__title">{entry.title}</div>
        <div className="plan-card__meta">
          {entry.date && (
            <time className="plan-card__date" dateTime={entry.date}>
              {entry.date}
            </time>
          )}
          <StatusBadge status={entry.status} />
        </div>
        {hasProgress && entry.progress && (
          <ProgressBar progress={entry.progress} />
        )}
      </button>
    </li>
  );
}

function StatusBadge({ status }: { status: PlanEntry['status'] }) {
  const label = status === 'in-flight' ? 'in flight' : status;
  return (
    <span className={`status-badge status-badge--${status}`}>{label}</span>
  );
}

interface ProgressBarProps {
  progress: NonNullable<PlanEntry['progress']>;
}

function ProgressBar({ progress }: ProgressBarProps) {
  const total = progress.total ?? progress.open + progress.done;
  const percent = Math.max(0, Math.min(100, progress.percent));
  return (
    <div className="plan-card__progress">
      <div
        className="plan-card__progress-bar"
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${progress.done} of ${total} tasks complete`}
      >
        <div
          className="plan-card__progress-fill"
          style={{ width: `${percent}%` }}
        />
      </div>
      <div className="plan-card__progress-text">
        <span className="plan-card__progress-percent">{percent}%</span>
        <span className="plan-card__progress-count">
          {progress.done}/{total} tasks
        </span>
      </div>
    </div>
  );
}
