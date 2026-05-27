/**
 * Etsy Detail page — `/etsy/:listingId`.
 *
 * - Reads `:listingId` from the route and calls `getListing(parseInt(...))`.
 * - Title + status badge at top.
 * - Two-column metadata <dl>: SKU ID, section, niche, price, favorites,
 *   views, listed_at, last_synced_at, etsy_listing_id.
 * - Deep-link buttons (no mutations from dashboard in v1):
 *     * "Open public listing" → `row.listing_url` (target=_blank)
 *     * "Edit on Etsy"        → seller dashboard URL.
 * - "Related KDP book" card — soft-join on `sku_id === kdp_book.slug`.
 *   If `getBook(sku_id)` 404s, we just don't render the card.
 */
import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getListing, type EtsyListing } from '../api/etsy';
import { getBook, type KdpBook } from '../api/kdp';

const STATUS_EMOJI: Record<string, string> = {
  active: '✅',
  inactive: '⏸️',
  sold_out: '🛒💲',
  expired: '⌛',
  draft: '📝',
};

const STATUS_LABEL: Record<string, string> = {
  active: 'Active',
  inactive: 'Inactive',
  sold_out: 'Sold out',
  expired: 'Expired',
  draft: 'Draft',
};

function statusLabel(status: string): string {
  return STATUS_LABEL[status] ?? status;
}

function statusEmoji(status: string): string {
  return STATUS_EMOJI[status] ?? '•';
}

function formatPrice(p: number | null): string {
  if (p == null) return '—';
  return `$${p.toFixed(2)}`;
}

export default function EtsyDetail() {
  const { listingId } = useParams<{ listingId: string }>();
  const [row, setRow] = useState<EtsyListing | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [relatedBook, setRelatedBook] = useState<KdpBook | null>(null);

  const load = useCallback(() => {
    if (!listingId) return;
    const id = Number.parseInt(listingId, 10);
    if (!Number.isFinite(id)) {
      setError('Invalid listing id');
      setLoading(false);
      return;
    }
    setLoading(true);
    getListing(id)
      .then((data) => {
        setRow(data);
        setError(null);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => setLoading(false));
  }, [listingId]);

  useEffect(() => {
    load();
  }, [load]);

  // Soft-join: try to fetch a KDP book whose slug matches this listing's sku_id.
  // 404 is normal (most Etsy listings aren't backed by a KDP book) — swallow it.
  useEffect(() => {
    setRelatedBook(null);
    if (!row?.sku_id) return;
    let cancelled = false;
    getBook(row.sku_id)
      .then((detail) => {
        if (!cancelled) setRelatedBook(detail.book);
      })
      .catch(() => {
        if (!cancelled) setRelatedBook(null);
      });
    return () => {
      cancelled = true;
    };
  }, [row?.sku_id]);

  if (loading && !row) {
    return (
      <section>
        <p>Loading…</p>
      </section>
    );
  }

  if (error && !row) {
    return (
      <section>
        <p role="alert" className="error-text">
          {error}
        </p>
        <p>
          <Link to="/etsy">← Back to Etsy catalog</Link>
        </p>
      </section>
    );
  }

  if (!row) {
    return (
      <section>
        <p>Listing not found.</p>
      </section>
    );
  }

  const sellerDashboardUrl = `https://www.etsy.com/your/shops/me/tools/listings/${row.etsy_listing_id}`;
  const publicUrl =
    row.listing_url ?? `https://www.etsy.com/listing/${row.etsy_listing_id}`;

  return (
    <section>
      <p style={{ margin: '0 0 0.5rem' }}>
        <Link to="/etsy">← Back to Etsy catalog</Link>
      </p>

      <header style={{ marginBottom: '1rem' }}>
        <h1 style={{ margin: '0 0 0.5rem' }}>{row.title}</h1>
        <p style={{ margin: 0 }}>
          <span
            className={`status-badge status-${row.status}`}
            aria-label={`Status: ${statusLabel(row.status)}`}
          >
            <span aria-hidden="true">{statusEmoji(row.status)}</span>{' '}
            {statusLabel(row.status)}
          </span>
        </p>
      </header>

      {error && (
        <p role="alert" className="error-text">
          {error}
        </p>
      )}

      <dl
        style={{
          display: 'grid',
          gridTemplateColumns: 'max-content 1fr',
          columnGap: '16px',
          rowGap: '6px',
          maxWidth: 600,
        }}
      >
        <dt>SKU ID</dt>
        <dd style={{ margin: 0 }}>{row.sku_id ?? '—'}</dd>
        <dt>Section</dt>
        <dd style={{ margin: 0 }}>{row.section ?? '—'}</dd>
        <dt>Niche</dt>
        <dd style={{ margin: 0 }}>{row.niche ?? '—'}</dd>
        <dt>Price</dt>
        <dd style={{ margin: 0 }}>{formatPrice(row.price_usd)}</dd>
        <dt>Favorites</dt>
        <dd style={{ margin: 0 }}>{row.favorites}</dd>
        <dt>Views</dt>
        <dd style={{ margin: 0 }}>{row.views}</dd>
        <dt>Listed at</dt>
        <dd style={{ margin: 0 }}>{row.listed_at ?? '—'}</dd>
        <dt>Last synced</dt>
        <dd style={{ margin: 0 }}>{row.last_synced_at}</dd>
        <dt>Etsy listing ID</dt>
        <dd style={{ margin: 0 }}>{row.etsy_listing_id}</dd>
      </dl>

      <nav
        style={{
          display: 'flex',
          gap: '8px',
          marginTop: '20px',
          flexWrap: 'wrap',
        }}
      >
        <a href={publicUrl} target="_blank" rel="noreferrer">
          <button type="button">Open public listing</button>
        </a>
        <a href={sellerDashboardUrl} target="_blank" rel="noreferrer">
          <button type="button">Edit on Etsy</button>
        </a>
      </nav>

      {relatedBook && (
        <section
          aria-label="Related KDP book"
          style={{
            marginTop: '24px',
            padding: '12px 16px',
            border: '1px solid #ddd',
            borderRadius: 6,
            maxWidth: 600,
          }}
        >
          <h3 style={{ marginTop: 0, marginBottom: 6 }}>Related KDP book</h3>
          <p style={{ margin: 0 }}>
            <Link to={`/kdp/${relatedBook.slug}`}>{relatedBook.title}</Link>
            {relatedBook.asin ? <> &middot; ASIN {relatedBook.asin}</> : null}
          </p>
        </section>
      )}
    </section>
  );
}
