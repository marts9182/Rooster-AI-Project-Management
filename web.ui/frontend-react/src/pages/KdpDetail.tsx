/**
 * KDP Detail page — `/kdp/:slug`.
 *
 * Layout:
 *   - Left column: large cover (PNG via /files/...; falls back to "no cover" tile
 *     and a link to the PDF if `cover_path` ends in .pdf).
 *   - Right column: title, status badge, ASIN, release_date, trim size, page
 *     count, price, and the marketing blurb.
 *   - Action buttons depend on status:
 *       * "Open on Amazon"  — when `asin` is present.
 *       * "Mark in-review"  — when status === 'built'.
 *       * "Mark live"       — when status is 'built' or 'in_review'; opens MarkPublishedModal.
 *       * "Set release date" — Plan B stub (placeholder alert).
 *   - Below: 4-column grid of interior preview thumbnails from `previews`.
 */
import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  getBook,
  markInReview,
  type KdpBook,
  type KdpStatus,
} from '../api/kdp';
import MarkPublishedModal from '../components/MarkPublishedModal';
import HelpIcon from '../components/HelpIcon';
import PuzzleAuditCard from '../components/PuzzleAuditCard';

const STATUS_LABEL: Record<KdpStatus, string> = {
  built: 'Built',
  in_review: 'In review',
  published: 'Live',
  archived: 'Archived',
};

const STATUS_EMOJI: Record<KdpStatus, string> = {
  built: '🟦',
  in_review: '🟡',
  published: '✅',
  archived: '⬜',
};

/**
 * The kdp-ready PNG cover lives next to the PDF at
 * `projects/kdp-puzzle-press/output/kdp-ready/<slug>/cover.png`. The book row's
 * `cover_path` may already point at that PNG, or it may point at the PDF; we
 * compute both URLs so the JSX can show whichever exists.
 */
function deriveCoverUrls(book: KdpBook): { png: string | null; pdf: string | null } {
  if (!book.cover_path) {
    // Best-effort guess based on the well-known kdp-ready output path.
    const base = `/files/projects/kdp-puzzle-press/output/kdp-ready/${book.slug}`;
    return { png: `${base}/cover.png`, pdf: `${base}/cover.pdf` };
  }
  const path = book.cover_path;
  if (path.toLowerCase().endsWith('.pdf')) {
    return {
      png: `/files/${path.replace(/\.pdf$/i, '.png')}`,
      pdf: `/files/${path}`,
    };
  }
  return {
    png: `/files/${path}`,
    pdf: `/files/${path.replace(/\.png$/i, '.pdf')}`,
  };
}

export default function KdpDetail() {
  const { slug } = useParams<{ slug: string }>();
  const [book, setBook] = useState<KdpBook | null>(null);
  const [previews, setPreviews] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [coverImgFailed, setCoverImgFailed] = useState(false);

  const load = useCallback(() => {
    if (!slug) return;
    setLoading(true);
    getBook(slug)
      .then((d) => {
        setBook(d.book);
        setPreviews(d.previews ?? []);
        setError(null);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => setLoading(false));
  }, [slug]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleMarkInReview() {
    if (!book) return;
    setError(null);
    try {
      const updated = await markInReview(book.slug);
      setBook(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  function handleSetReleaseDate() {
    alert('Set release date flow ships in a later plan.');
  }

  if (loading && !book) {
    return (
      <section>
        <p>Loading…</p>
      </section>
    );
  }

  if (error && !book) {
    return (
      <section>
        <p role="alert" style={{ color: 'crimson' }}>
          {error}
        </p>
      </section>
    );
  }

  if (!book) {
    return (
      <section>
        <p>Book not found.</p>
      </section>
    );
  }

  const { png: coverPng, pdf: coverPdf } = deriveCoverUrls(book);

  return (
    <section>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 2fr',
          gap: '24px',
          alignItems: 'start',
        }}
      >
        <div>
          {coverPng && !coverImgFailed ? (
            <img
              src={coverPng}
              alt={`${book.title} cover`}
              onError={() => setCoverImgFailed(true)}
              style={{
                width: '100%',
                height: 'auto',
                display: 'block',
                borderRadius: 4,
                boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
              }}
            />
          ) : (
            <div
              style={{
                width: '100%',
                aspectRatio: '0.66',
                background: '#eee',
                display: 'grid',
                placeItems: 'center',
                borderRadius: 4,
                color: '#888',
              }}
            >
              No cover
            </div>
          )}
          {coverPdf && (
            <p style={{ marginTop: '8px', fontSize: '0.85rem' }}>
              <a href={coverPdf} target="_blank" rel="noreferrer">
                Open cover PDF
              </a>
            </p>
          )}
        </div>

        <div>
          <h1 style={{ marginTop: 0 }}>{book.title}</h1>
          {book.subtitle && (
            <p style={{ color: '#555', marginTop: '-4px' }}>{book.subtitle}</p>
          )}

          <p>
            <span
              className={`status-badge status-${book.status}`}
              aria-label={`Status: ${STATUS_LABEL[book.status]}`}
            >
              <span aria-hidden="true">{STATUS_EMOJI[book.status]}</span>{' '}
              {STATUS_LABEL[book.status]}
            </span>
          </p>

          {error && (
            <p role="alert" style={{ color: 'crimson' }}>
              {error}
            </p>
          )}

          <dl
            style={{
              display: 'grid',
              gridTemplateColumns: 'max-content 1fr',
              columnGap: '12px',
              rowGap: '4px',
            }}
          >
            <dt>
              ASIN <HelpIcon field="asin" />
            </dt>
            <dd style={{ margin: 0 }}>{book.asin ?? '—'}</dd>
            <dt>Trim</dt>
            <dd style={{ margin: 0 }}>{book.trim_size ?? '—'}</dd>
            <dt>Pages</dt>
            <dd style={{ margin: 0 }}>{book.page_count ?? '—'}</dd>
            <dt>Price</dt>
            <dd style={{ margin: 0 }}>
              {book.price_usd != null ? `$${book.price_usd.toFixed(2)}` : '—'}
            </dd>
            <dt>
              Released <HelpIcon field="release_date" />
            </dt>
            <dd style={{ margin: 0 }}>{book.release_date ?? '—'}</dd>
          </dl>

          <div style={{ display: 'flex', gap: '8px', marginTop: '16px', flexWrap: 'wrap' }}>
            {book.asin && (
              <a
                href={
                  book.listing_url ?? `https://www.amazon.com/dp/${book.asin}`
                }
                target="_blank"
                rel="noreferrer"
              >
                <button type="button">Open on Amazon</button>
              </a>
            )}
            {book.status === 'built' && (
              <button type="button" onClick={handleMarkInReview}>
                Mark in-review
              </button>
            )}
            {(book.status === 'built' || book.status === 'in_review') && (
              <button type="button" onClick={() => setModalOpen(true)}>
                Mark live
              </button>
            )}
            <button type="button" onClick={handleSetReleaseDate}>
              Set release date
            </button>
          </div>

          {book.blurb && (
            <section style={{ marginTop: '20px' }}>
              <h3 style={{ marginBottom: '6px' }}>Description</h3>
              {/* eslint-disable-next-line react/no-danger -- blurb is local content authored by us */}
              <div dangerouslySetInnerHTML={{ __html: book.blurb }} />
            </section>
          )}
        </div>
      </div>

      <PuzzleAuditCard
        book={book}
        onAudited={(updated) => setBook(updated)}
      />

      <section style={{ marginTop: '32px' }}>
        <h3>Interior preview</h3>
        {previews.length === 0 ? (
          <p style={{ color: '#888' }}>No preview images yet.</p>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(4, 1fr)',
              gap: '8px',
            }}
          >
            {previews.map((p) => (
              <img
                key={p}
                src={`/files/${p}`}
                alt=""
                style={{
                  width: '100%',
                  height: 'auto',
                  display: 'block',
                  border: '1px solid #eee',
                  borderRadius: 2,
                }}
              />
            ))}
          </div>
        )}
      </section>

      {modalOpen && (
        <MarkPublishedModal
          book={book}
          onClose={() => setModalOpen(false)}
          onSuccess={(updated) => setBook(updated)}
        />
      )}
    </section>
  );
}
