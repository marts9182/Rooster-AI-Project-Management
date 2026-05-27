/**
 * PuzzleAuditCard — surfaces the latest puzzle-audit state for a KDP book
 * and a Re-audit button. Mounted on /kdp/:slug below the metadata grid.
 *
 * - Shows a status chip: Passed / Failed / Unchecked.
 * - Shows the last-audit timestamp.
 * - Re-audit button POSTs to /api/kdp/books/:slug/audit-puzzles.
 * - The per-puzzle breakdown is collapsible (collapsed by default).
 */
import { useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { auditPuzzles, type KdpBook, type PuzzleAuditSummary } from '../api/kdp';

interface Props {
  book: KdpBook;
  onAudited: (updated: KdpBook) => void;
}

const CHIP_STYLES: Record<string, CSSProperties> = {
  passed: { background: '#dcfce7', color: '#166534', borderColor: '#86efac' },
  failed: { background: '#fee2e2', color: '#991b1b', borderColor: '#fca5a5' },
  unchecked: { background: '#f3f4f6', color: '#4b5563', borderColor: '#d1d5db' },
};

const CHIP_LABEL: Record<string, string> = {
  passed: 'Passed',
  failed: 'Failed',
  unchecked: 'Unchecked',
};

export default function PuzzleAuditCard({ book, onAudited }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDetails, setShowDetails] = useState(false);

  const status = (book.puzzle_audit_status ?? 'unchecked') as
    | 'passed'
    | 'failed'
    | 'unchecked';

  const summary = useMemo<PuzzleAuditSummary | null>(() => {
    if (!book.puzzle_audit_summary_json) return null;
    try {
      return JSON.parse(book.puzzle_audit_summary_json) as PuzzleAuditSummary;
    } catch {
      return null;
    }
  }, [book.puzzle_audit_summary_json]);

  async function handleReaudit() {
    setBusy(true);
    setError(null);
    try {
      const updated = await auditPuzzles(book.slug);
      onAudited(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  const lastAuditDisplay = book.puzzle_audit_at
    ? new Date(book.puzzle_audit_at).toISOString().replace('T', ' ').slice(0, 19)
    : 'never';

  return (
    <section
      style={{
        marginTop: '24px',
        padding: '16px',
        border: '1px solid #e5e7eb',
        borderRadius: 8,
        background: '#fafafa',
      }}
      aria-label="Puzzle audit"
    >
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          flexWrap: 'wrap',
        }}
      >
        <h3 style={{ margin: 0 }}>Puzzle audit</h3>
        <span
          style={{
            padding: '2px 10px',
            borderRadius: 999,
            border: '1px solid',
            fontSize: '0.85rem',
            ...CHIP_STYLES[status],
          }}
        >
          {CHIP_LABEL[status]}
        </span>
        <span style={{ color: '#6b7280', fontSize: '0.85rem' }}>
          Last audit: {lastAuditDisplay}
        </span>
        <button
          type="button"
          onClick={handleReaudit}
          disabled={busy}
          style={{ marginLeft: 'auto' }}
        >
          {busy ? 'Auditing…' : 'Re-audit'}
        </button>
      </header>

      {error && (
        <p role="alert" style={{ color: 'crimson', marginTop: 8 }}>
          {error}
        </p>
      )}

      {summary && summary.totals && (
        <p style={{ marginTop: 8, color: '#4b5563', fontSize: '0.9rem' }}>
          {summary.totals.passed} / {summary.totals.checked} puzzles passed
          {summary.totals.failed > 0 && (
            <>
              {' · '}
              <span style={{ color: '#b91c1c' }}>
                {summary.totals.uniqueness_failures} uniqueness ·{' '}
                {summary.totals.symmetry_failures} symmetry ·{' '}
                {summary.totals.tier_mismatches} tier mismatches
              </span>
            </>
          )}
        </p>
      )}

      {summary && summary.puzzles && summary.puzzles.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <button
            type="button"
            onClick={() => setShowDetails((v) => !v)}
            aria-expanded={showDetails}
          >
            {showDetails ? 'Hide details' : 'Show details'}
          </button>
          {showDetails && (
            <table
              style={{
                marginTop: 8,
                fontSize: '0.85rem',
                borderCollapse: 'collapse',
                width: '100%',
              }}
            >
              <thead>
                <tr>
                  <th align="left">#</th>
                  <th align="left">Difficulty</th>
                  <th align="left">Clues</th>
                  <th align="left">Unique</th>
                  <th align="left">180° sym</th>
                  <th align="left">Tier</th>
                  <th align="left">Match</th>
                </tr>
              </thead>
              <tbody>
                {summary.puzzles.map((p) => (
                  <tr key={p.index} style={{ borderTop: '1px solid #e5e7eb' }}>
                    <td>{p.index}</td>
                    <td>{p.difficulty}</td>
                    <td>{p.clue_count}</td>
                    <td>{p.is_unique ? '✓' : '✗'}</td>
                    <td>{p.symmetric_180 ? '✓' : '✗'}</td>
                    <td>{p.technique_tier}</td>
                    <td>{p.match_difficulty ? '✓' : '✗'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </section>
  );
}
