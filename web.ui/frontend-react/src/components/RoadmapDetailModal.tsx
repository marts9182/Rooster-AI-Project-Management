import { useEffect, useState } from 'react';
import {
  listRoadmap, updateRoadmap,
  type RoadmapRow, type RoadmapStatus,
} from '../api/roadmap';

interface Props {
  id: number;
  onClose: () => void;
  onChanged: () => void;
}

const STATUS_OPTIONS: RoadmapStatus[] = [
  'planned', 'building', 'built', 'scheduled', 'published', 'skipped',
];

export default function RoadmapDetailModal({ id, onClose, onChanged }: Props) {
  const [row, setRow] = useState<RoadmapRow | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void listRoadmap()
      .then((rows) => setRow(rows.find((r) => r.id === id) ?? null))
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [id]);

  async function save(patch: Partial<RoadmapRow>) {
    if (!row) return;
    try {
      const updated = await updateRoadmap(row.id, patch);
      setRow(updated);
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div
      role="dialog"
      aria-label="Roadmap row detail"
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.4)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 1000,
      }}
    >
      <div style={{
        background: 'var(--surface)', color: 'var(--fg)',
        maxWidth: 540, width: '90%',
        padding: '1rem 1.25rem', borderRadius: 8,
        boxShadow: '0 10px 30px rgba(0,0,0,0.2)',
      }}>
        {row ? (
          <>
            <header style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <span style={{
                background: row.kind === 'kdp' ? '#0ea5e9' : '#f97316',
                color: '#fff', padding: '2px 8px', borderRadius: 4,
                fontSize: '0.75rem', textTransform: 'uppercase',
              }}>{row.kind}</span>
              <h2 style={{ margin: 0 }}>{row.title}</h2>
              <code style={{ color: 'var(--muted)' }}>{row.slug}</code>
            </header>

            {row.niche && (
              <p style={{ margin: '6px 0', color: 'var(--muted)' }}>
                Niche: <strong>{row.niche}</strong>
              </p>
            )}

            <dl style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '4px 12px', margin: '12px 0' }}>
              <dt>
                <label htmlFor="rm-status">Status</label>
              </dt>
              <dd style={{ margin: 0 }}>
                <select
                  id="rm-status"
                  value={row.status}
                  onChange={(e) => void save({ status: e.target.value as RoadmapStatus })}
                >
                  {STATUS_OPTIONS.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </dd>

              <dt>
                <label htmlFor="rm-date">Target release</label>
              </dt>
              <dd style={{ margin: 0 }}>
                <input
                  id="rm-date"
                  type="date"
                  defaultValue={row.target_release_date}
                  onBlur={(e) => {
                    if (e.target.value !== row.target_release_date) {
                      void save({ target_release_date: e.target.value });
                    }
                  }}
                />
              </dd>

              <dt>File lock</dt>
              <dd style={{ margin: 0 }}>{row.file_lock_date ?? '—'}</dd>

              <dt>Source</dt>
              <dd style={{ margin: 0 }}>{row.source}</dd>
            </dl>

            {row.rationale && (
              <p style={{ fontStyle: 'italic', color: 'var(--muted)' }}>
                {row.rationale}
              </p>
            )}

            <label htmlFor="rm-notes" style={{ display: 'block', marginTop: 8 }}>
              Notes
            </label>
            <textarea
              id="rm-notes"
              defaultValue={row.notes ?? ''}
              onBlur={(e) => {
                if (e.target.value !== (row.notes ?? '')) {
                  void save({ notes: e.target.value });
                }
              }}
              style={{ width: '100%', minHeight: 60 }}
            />

            {error && (
              <p role="alert" style={{ color: '#b91c1c', marginTop: 8 }}>{error}</p>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
              <button type="button" className="btn btn--secondary" onClick={onClose}>Close</button>
            </div>
          </>
        ) : error ? (
          <p role="alert" style={{ color: '#b91c1c' }}>{error}</p>
        ) : (
          <p>Loading…</p>
        )}
      </div>
    </div>
  );
}
