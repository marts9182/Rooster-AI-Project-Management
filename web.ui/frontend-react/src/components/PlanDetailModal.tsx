import { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { getPlan, type PlanDetail } from '../api/plans';

interface Props {
  /** The slug to fetch; when null the modal is hidden. */
  slug: string | null;
  /** Convenience: whether the modal should be visible. Defaults to `slug != null`. */
  isOpen?: boolean;
  /** Called when the user dismisses the modal (overlay click, Escape, close button). */
  onClose: () => void;
}

/**
 * Modal that fetches a single plan/spec by slug and renders its markdown
 * body with GFM tables + task lists. Header shows title, kind badge, date,
 * and status. Closes on overlay click, Escape, or the X button.
 */
export function PlanDetailModal({ slug, isOpen, onClose }: Props) {
  const open = isOpen ?? slug != null;
  const [detail, setDetail] = useState<PlanDetail | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open || slug == null) return;
    let cancelled = false;
    setDetail(null);
    setErr(null);
    setLoading(true);
    void (async () => {
      try {
        const d = await getPlan(slug);
        if (!cancelled) setDetail(d);
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, slug]);

  // Close on Escape.
  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const kindLabel = detail?.kind === 'plan' ? 'Plan' : detail?.kind === 'spec' ? 'Spec' : '';
  const statusLabel =
    detail?.status === 'in-flight' ? 'in flight' : (detail?.status ?? '');

  return (
    <div
      className="plan-modal"
      role="dialog"
      aria-label="Plan detail"
      aria-modal="true"
    >
      <div
        className="plan-modal__backdrop"
        data-testid="plan-modal-overlay"
        onClick={onClose}
        aria-hidden="true"
      />
      <div className="plan-modal__panel">
        <header className="plan-modal__header">
          <h2 className="plan-modal__title">
            {detail?.title ?? (loading ? 'Loading…' : '')}
          </h2>
          <div className="plan-modal__meta">
            {detail?.kind && (
              <span className={`plan-modal__kind plan-modal__kind--${detail.kind}`}>
                {kindLabel}
              </span>
            )}
            {detail?.date && (
              <time className="plan-modal__date" dateTime={detail.date}>
                {detail.date}
              </time>
            )}
            {detail?.status && (
              <span
                className={`status-badge status-badge--${detail.status}`}
              >
                {statusLabel}
              </span>
            )}
          </div>
          <button
            type="button"
            className="plan-modal__close"
            onClick={onClose}
            aria-label="Close plan detail"
          >
            ×
          </button>
        </header>
        {err && (
          <p className="plan-modal__error">Failed to load: {err}</p>
        )}
        {loading && !err && !detail && (
          <p className="plan-modal__loading">Loading…</p>
        )}
        {detail && !err && (
          <article className="plan-modal__body">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {detail.markdown}
            </ReactMarkdown>
          </article>
        )}
      </div>
    </div>
  );
}

export default PlanDetailModal;
