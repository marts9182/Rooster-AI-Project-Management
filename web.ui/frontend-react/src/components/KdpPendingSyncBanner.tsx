import { useCallback, useEffect, useState } from 'react';
import { getPendingIngest, type IngestPreview } from '../api/kdp';
import KdpIngestReviewModal from './KdpIngestReviewModal';

interface Props {
  /** Called after a successful commit so the parent can refetch the catalog. */
  onApplied: () => void;
}

export default function KdpPendingSyncBanner({ onApplied }: Props) {
  const [preview, setPreview] = useState<IngestPreview | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setPreview(await getPendingIngest());
    } catch {
      setPreview(null);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (!preview) return null;

  const matched = preview.matches.length;
  const ambiguous = preview.ambiguous.length;
  const orphans = preview.orphans.length;

  return (
    <>
      <div
        role="status"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '6px 10px',
          borderRadius: 4,
          marginBottom: '0.5rem',
          background: '#e0e7ff',
          color: '#1e3a8a',
        }}
      >
        <span>
          <strong>Pending KDP sync</strong> — {matched} matched, {ambiguous} ambiguous, {orphans} orphan{orphans === 1 ? '' : 's'}
        </span>
        <button
          type="button"
          className="btn btn--primary"
          onClick={() => setModalOpen(true)}
          style={{ marginLeft: 'auto' }}
        >
          Review
        </button>
      </div>
      {modalOpen && (
        <KdpIngestReviewModal
          preview={preview}
          onClose={() => setModalOpen(false)}
          onApplied={() => {
            setModalOpen(false);
            setPreview(null);
            onApplied();
          }}
        />
      )}
    </>
  );
}
