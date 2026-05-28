import { useState } from 'react';
import { commitIngest, type IngestPreview } from '../api/kdp';

interface Props {
  preview: IngestPreview;
  onClose: () => void;
  onApplied: () => void;
}

const sectionStyle: React.CSSProperties = {
  marginBottom: '1rem',
  border: '1px solid var(--border)',
  borderRadius: 4,
  padding: '0.5rem 0.75rem',
};

export default function KdpIngestReviewModal({ preview, onClose, onApplied }: Props) {
  const [ambiguousResolutions, setAmbiguousResolutions] = useState<
    Record<string, string | null>
  >({});
  const [orphanChecks, setOrphanChecks] = useState<Record<string, boolean>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const allAmbiguousResolved = preview.ambiguous.every(
    (a) => ambiguousResolutions[a.scraped.asin] !== undefined,
  );

  async function handleApply() {
    setSubmitting(true);
    setError(null);
    try {
      const confirmed_orphans = Object.entries(orphanChecks)
        .filter(([, v]) => v)
        .map(([asin]) => asin);
      const result = await commitIngest({
        preview_id: preview.preview_id,
        confirmed_orphans,
        ambiguous_resolutions: ambiguousResolutions,
      });
      setSuccess(`Applied ${result.applied}, created ${result.created}, skipped ${result.skipped}`);
      onApplied();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-label="KDP ingest review"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.4)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
    >
      <div
        style={{
          background: 'var(--surface)',
          color: 'var(--fg)',
          maxWidth: 800,
          maxHeight: '85vh',
          overflowY: 'auto',
          padding: '1rem',
          borderRadius: 8,
        }}
      >
        <h2>KDP Sync Review</h2>

        <section style={sectionStyle}>
          <h3>Matches ({preview.matches.length})</h3>
          <ul>
            {preview.matches.map((m) => (
              <li key={m.dashboard_slug}>
                <strong>{m.dashboard_slug}</strong>: {m.dashboard_title_before} → {m.scraped.kdp_title}
                {' · '}ASIN {m.scraped.asin}
                {' · '}{m.scraped.kdp_status} → {m.new_dashboard_status}
                {m.title_will_change && <span style={{ color: '#b58105' }}> ●</span>}
                {m.status_ambiguous && <span style={{ color: '#b91c1c' }}> ●</span>}
              </li>
            ))}
          </ul>
        </section>

        <section style={sectionStyle}>
          <h3>Ambiguous ({preview.ambiguous.length})</h3>
          {preview.ambiguous.map((a) => (
            <div key={a.scraped.asin} style={{ marginBottom: '0.5rem' }}>
              <label>
                {a.scraped.kdp_title} (ASIN {a.scraped.asin}){': '}
                <select
                  aria-label={a.scraped.kdp_title}
                  value={ambiguousResolutions[a.scraped.asin] ?? ''}
                  onChange={(e) =>
                    setAmbiguousResolutions((prev) => ({
                      ...prev,
                      [a.scraped.asin]: e.target.value === '__skip__' ? null : e.target.value,
                    }))
                  }
                >
                  <option value="">— pick one —</option>
                  {a.candidate_slugs.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                  <option value="__skip__">— skip this —</option>
                </select>
              </label>
            </div>
          ))}
        </section>

        <section style={sectionStyle}>
          <h3>Orphans ({preview.orphans.length})</h3>
          {preview.orphans.map((o) => (
            <div key={o.scraped.asin}>
              <label>
                <input
                  type="checkbox"
                  checked={!!orphanChecks[o.scraped.asin]}
                  onChange={(e) =>
                    setOrphanChecks((prev) => ({
                      ...prev,
                      [o.scraped.asin]: e.target.checked,
                    }))
                  }
                />
                {' '}
                {o.scraped.kdp_title} (ASIN {o.scraped.asin})
              </label>
            </div>
          ))}
        </section>

        <section style={sectionStyle}>
          <h3>Missing from KDP ({preview.missing_from_kdp.length})</h3>
          <ul>
            {preview.missing_from_kdp.map((m) => (
              <li key={m.dashboard_slug}>{m.dashboard_slug} — {m.dashboard_title}</li>
            ))}
          </ul>
        </section>

        {error && (
          <p role="alert" style={{ color: '#b91c1c' }}>
            commitIngest: {error}
          </p>
        )}
        {success && <p role="status">{success}</p>}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" onClick={onClose} disabled={submitting}>
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleApply()}
            disabled={!allAmbiguousResolved || submitting}
          >
            {submitting ? 'Applying…' : 'Apply'}
          </button>
        </div>
      </div>
    </div>
  );
}
