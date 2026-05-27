/**
 * MarkPublishedModal — small modal that collects an ASIN + release date and
 * promotes a book to `status='published'` via `POST /api/kdp/books/:slug/mark-published`.
 *
 * Client-side validation matches the backend pattern: `^B0[A-Z0-9]{8}$`.
 * The release_date input defaults to today.
 * Cancel and Escape both close the dialog. Errors from the API render inline.
 */
import { useCallback, useEffect, useState } from 'react';
import { markPublished, type KdpBook } from '../api/kdp';
import HelpIcon from './HelpIcon';

interface Props {
  book: KdpBook;
  onClose: () => void;
  /** Called with the updated book row on a successful POST. */
  onSuccess: (updated: KdpBook) => void;
}

/** Amazon ASIN: 'B0' + 8 uppercase alphanumerics, matching the backend. */
const ASIN_RE = /^B0[A-Z0-9]{8}$/;

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function MarkPublishedModal({ book, onClose, onSuccess }: Props) {
  const [asin, setAsin] = useState('');
  const [releaseDate, setReleaseDate] = useState<string>(todayIso());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Close on Escape.
  const closeIfIdle = useCallback(() => {
    if (!busy) onClose();
  }, [busy, onClose]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') closeIfIdle();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [closeIfIdle]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const trimmed = asin.trim().toUpperCase();
    if (!ASIN_RE.test(trimmed)) {
      setError('ASIN must match B0 + 8 alphanumeric characters (e.g. B01ABCDEFG).');
      return;
    }
    if (!releaseDate) {
      setError('Release date is required.');
      return;
    }
    setBusy(true);
    try {
      const updated = await markPublished(book.slug, {
        asin: trimmed,
        release_date: releaseDate,
      });
      onSuccess(updated);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Mark live: ${book.title}`}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.4)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) closeIfIdle();
      }}
    >
      <form
        onSubmit={handleSubmit}
        style={{
          background: '#fff',
          padding: '24px',
          minWidth: '380px',
          maxWidth: '440px',
          borderRadius: '8px',
          boxShadow: '0 10px 30px rgba(0,0,0,0.2)',
        }}
      >
        <h2 style={{ marginTop: 0 }}>Mark live: {book.title}</h2>
        <label style={{ display: 'block', marginBottom: '12px' }}>
          <span>
            ASIN <HelpIcon field="asin" />
          </span>
          <input
            type="text"
            value={asin}
            onChange={(e) => setAsin(e.target.value.toUpperCase())}
            placeholder="B01ABCDEFG"
            maxLength={10}
            autoFocus
            disabled={busy}
            style={{ display: 'block', width: '100%', marginTop: '4px' }}
          />
        </label>
        <label style={{ display: 'block', marginBottom: '12px' }}>
          <span>
            Release date <HelpIcon field="release_date" />
          </span>
          <input
            type="date"
            value={releaseDate}
            onChange={(e) => setReleaseDate(e.target.value)}
            required
            disabled={busy}
            style={{ display: 'block', marginTop: '4px' }}
          />
        </label>
        {error && (
          <p role="alert" style={{ color: 'crimson', marginTop: 0 }}>
            {error}
          </p>
        )}
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
          >
            Cancel
          </button>
          <button type="submit" disabled={busy}>
            {busy ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>
    </div>
  );
}

export { MarkPublishedModal };
