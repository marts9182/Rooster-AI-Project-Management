import { useEffect, useState } from 'react';

interface Props {
  field: string | null;   // e.g. 'gmail_app_password'
  onClose: () => void;
}

/**
 * Side drawer that fetches /api/help/:field and renders the markdown as
 * raw text inside a <pre>. Plans B-E may upgrade to react-markdown if
 * they need links/images; for the scaffolding, raw text is sufficient.
 */
export default function HelpDrawer({ field, onClose }: Props) {
  const [body, setBody] = useState<string>('');
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!field) return;
    setBody('');
    setErr(null);
    fetch(`/api/help/${encodeURIComponent(field)}`)
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.text();
      })
      .then(setBody)
      .catch((e) => setErr(String(e)));
  }, [field]);

  if (!field) return null;
  return (
    <aside className="help-drawer" role="dialog" aria-label="Help">
      <button className="help-close" onClick={onClose} aria-label="Close help">×</button>
      <h2>{field.replace(/_/g, ' ')}</h2>
      {err && <p className="help-error">{err}</p>}
      <pre className="help-body">{body}</pre>
    </aside>
  );
}
