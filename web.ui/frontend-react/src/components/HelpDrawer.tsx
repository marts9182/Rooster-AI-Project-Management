import { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { getHelpMarkdown } from '../api/help';

interface Props {
  /** Help topic field, e.g. 'asin' or 'gmail_app_password'. */
  field: string | null;
  /** Whether the drawer is currently visible. */
  isOpen: boolean;
  /** Called when the user dismisses the drawer (overlay click, Escape, close button). */
  onClose: () => void;
}

/**
 * Side drawer that fetches `/api/help/:field` (raw markdown) and renders it
 * with `react-markdown`. Closes on overlay click, Escape key, or the close
 * button. Rendered as a fixed overlay + sliding panel on the right.
 */
export default function HelpDrawer({ field, isOpen, onClose }: Props) {
  const [body, setBody] = useState<string>('');
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);

  // Fetch markdown whenever the drawer opens with a new field.
  useEffect(() => {
    if (!isOpen || !field) return;
    let cancelled = false;
    setBody('');
    setErr(null);
    setLoading(true);
    getHelpMarkdown(field)
      .then((md) => {
        if (!cancelled) setBody(md);
      })
      .catch((e: unknown) => {
        if (!cancelled) setErr(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [field, isOpen]);

  // Close on Escape key.
  useEffect(() => {
    if (!isOpen) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !field) return null;

  return (
    <>
      <div
        className="help-overlay"
        onClick={onClose}
        aria-hidden="true"
        data-testid="help-overlay"
      />
      <aside
        className="help-drawer"
        role="dialog"
        aria-label={`Help: ${field.replace(/_/g, ' ')}`}
      >
        <button
          className="help-close"
          onClick={onClose}
          aria-label="Close help"
          type="button"
        >
          ×
        </button>
        <h2 className="help-title">{field.replace(/_/g, ' ')}</h2>
        {err && <p className="help-error">Failed to load help: {err}</p>}
        {loading && !err && <p className="help-loading">Loading…</p>}
        {!loading && !err && body && (
          <div className="help-body">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{body}</ReactMarkdown>
          </div>
        )}
      </aside>
    </>
  );
}

export { HelpDrawer };
