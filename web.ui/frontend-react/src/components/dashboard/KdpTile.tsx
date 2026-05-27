import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { listBooks, type KdpBook } from '../../api/kdp';
import TileShell from './TileShell';

interface State {
  status: 'loading' | 'ready' | 'error';
  books: KdpBook[];
  error?: string;
}

/**
 * Dashboard tile: status counts (Live / In review / Built) + the 3 most
 * recently updated KDP books with their ASIN.
 */
export default function KdpTile() {
  const [state, setState] = useState<State>({ status: 'loading', books: [] });

  useEffect(() => {
    let cancelled = false;
    listBooks()
      .then((books) => {
        if (!cancelled) setState({ status: 'ready', books });
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setState({
            status: 'error',
            books: [],
            error: err instanceof Error ? err.message : String(err),
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <TileShell id="kdp" emoji="📚" title="KDP Catalog" viewAllHref="/kdp">
      {state.status === 'loading' && <p className="tile-loading">Loading…</p>}
      {state.status === 'error' && (
        <p className="tile-error" role="alert">
          Failed to load KDP catalog: {state.error}
        </p>
      )}
      {state.status === 'ready' && (
        <KdpBody books={state.books} />
      )}
    </TileShell>
  );
}

function KdpBody({ books }: { books: KdpBook[] }) {
  const live = books.filter((b) => b.status === 'published').length;
  const inReview = books.filter((b) => b.status === 'in_review').length;
  const built = books.filter((b) => b.status === 'built').length;

  // Most-recent by updated_at; show 3.
  const recent = [...books]
    .sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1))
    .slice(0, 3);

  return (
    <div className="tile-kdp">
      <ul className="tile-stats" aria-label="KDP status counts">
        <li>
          <span className="tile-stat-value">{live}</span>
          <span className="tile-stat-label">Live</span>
        </li>
        <li>
          <span className="tile-stat-value">{inReview}</span>
          <span className="tile-stat-label">In review</span>
        </li>
        <li>
          <span className="tile-stat-value">{built}</span>
          <span className="tile-stat-label">Built</span>
        </li>
      </ul>
      {recent.length === 0 ? (
        <p className="tile-empty">No books yet.</p>
      ) : (
        <ul className="tile-list" aria-label="Recently updated KDP books">
          {recent.map((b) => (
            <li key={b.slug}>
              <Link to={`/kdp/${b.slug}`} className="tile-list-link">
                <span className="tile-list-title">{b.title}</span>
                <span className="tile-list-meta">{b.asin ?? '—'}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
