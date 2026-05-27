/**
 * PuzzleAuditCard — surfaces the latest puzzle-audit state for a KDP book
 * and a Re-audit button. Mounted on /kdp/:slug below the metadata grid.
 *
 * - Shows a status chip: Passed / Failed / Unchecked.
 * - Shows the last-audit timestamp.
 * - Re-audit button POSTs to /api/kdp/books/:slug/audit-puzzles.
 * - The per-puzzle breakdown is collapsible (collapsed by default).
 *
 * Styling lives in shell.css under `.puzzle-audit-card` so the card themes
 * through CSS variables (light/dark). The status-chip pastels are
 * theme-invariant on purpose — they read in both modes.
 */
import { useMemo, useState } from 'react';
import { auditPuzzles, type KdpBook, type PuzzleAuditSummary } from '../api/kdp';

interface Props {
  book: KdpBook;
  onAudited: (updated: KdpBook) => void;
}

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
    <section className="puzzle-audit-card" aria-label="Puzzle audit">
      <header className="puzzle-audit-card-header">
        <h3>Puzzle audit</h3>
        <span className={`puzzle-audit-chip status-${status}`}>
          {CHIP_LABEL[status]}
        </span>
        <span className="puzzle-audit-last">
          Last audit: {lastAuditDisplay}
        </span>
        <button
          type="button"
          onClick={handleReaudit}
          disabled={busy}
          className="puzzle-audit-reaudit"
        >
          {busy ? 'Auditing…' : 'Re-audit'}
        </button>
      </header>

      {error && (
        <p role="alert" className="puzzle-audit-error">
          {error}
        </p>
      )}

      {summary && summary.totals && (
        <p className="puzzle-audit-totals">
          {summary.totals.passed} / {summary.totals.checked} puzzles passed
          {summary.totals.failed > 0 && (
            <>
              {' · '}
              <span className="puzzle-audit-failures">
                {summary.totals.uniqueness_failures} uniqueness ·{' '}
                {summary.totals.symmetry_failures} symmetry ·{' '}
                {summary.totals.tier_mismatches} tier mismatches
              </span>
            </>
          )}
        </p>
      )}

      {summary && summary.puzzles && summary.puzzles.length > 0 && (
        <div className="puzzle-audit-details">
          <button
            type="button"
            onClick={() => setShowDetails((v) => !v)}
            aria-expanded={showDetails}
          >
            {showDetails ? 'Hide details' : 'Show details'}
          </button>
          {showDetails && (
            <table className="puzzle-audit-table">
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
                  <tr key={p.index}>
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
