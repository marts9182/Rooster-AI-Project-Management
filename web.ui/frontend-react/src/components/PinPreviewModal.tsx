import { useEffect, useState } from 'react';
import type {
  PinterestQueueRow,
  UpdateQueuePatch,
} from '../api/pinterest';

interface Props {
  /** The row to preview; null hides the modal. */
  row: PinterestQueueRow | null;
  /** Called when the user dismisses the modal (Close button, overlay, Escape). */
  onClose: () => void;
  /** Optional edit handler — when supplied an [Edit] button appears. */
  onEdit?: (id: number, patch: UpdateQueuePatch) => void | Promise<void>;
}

/**
 * Convert an image_path from the DB (anything from a Windows absolute path to
 * a repo-relative slash path) to a /files URL the backend will serve. We
 * extract everything from `output/pinterest/...` onward; if the path doesn't
 * contain that segment we fall back to the raw value so the broken image is
 * at least diagnosable in the DOM.
 */
export function imagePathToFilesUrl(imagePath: string): string {
  const normalised = imagePath.replace(/\\/g, '/');
  const m = normalised.match(/output\/pinterest\/[^?#]+$/);
  if (m) return `/files/${m[0]}`;
  return normalised;
}

/**
 * Modal that displays a queue row's pin image plus its metadata. The [Edit]
 * button flips the body into an inline form; submitting calls `onEdit` with
 * the patch and closes the form (parent decides whether to also close the
 * modal). Closes on Escape, overlay click, or the X button.
 */
export default function PinPreviewModal({ row, onClose, onEdit }: Props) {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState<{
    title: string;
    description: string;
    scheduled_for: string;
  }>({ title: '', description: '', scheduled_for: '' });

  useEffect(() => {
    if (!row) {
      setIsEditing(false);
      return;
    }
    setDraft({
      title: row.title,
      description: row.description,
      scheduled_for: row.scheduled_for.slice(0, 16),
    });
  }, [row]);

  useEffect(() => {
    if (!row) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [row, onClose]);

  if (!row) return null;

  const src = imagePathToFilesUrl(row.image_path);

  async function handleSave() {
    if (!onEdit || !row) return;
    const patch: UpdateQueuePatch = {
      title: draft.title,
      description: draft.description,
    };
    if (draft.scheduled_for) {
      const dt = new Date(draft.scheduled_for);
      if (!Number.isNaN(dt.getTime())) {
        patch.scheduled_for = dt.toISOString();
      }
    }
    await onEdit(row.id, patch);
    setIsEditing(false);
  }

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-label="Pin preview"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="modal pin-preview-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          className="modal-close"
          onClick={onClose}
          aria-label="Close modal"
        >
          ×
        </button>
        <h2>{isEditing ? 'Edit pin' : row.title}</h2>
        <img src={src} alt={row.title} />
        {isEditing ? (
          <div className="pin-preview-edit">
            <label>
              Title
              <input
                type="text"
                aria-label="Edit title"
                value={draft.title}
                onChange={(e) =>
                  setDraft({ ...draft, title: e.target.value })
                }
              />
            </label>
            <label>
              Description
              <textarea
                aria-label="Edit description"
                value={draft.description}
                onChange={(e) =>
                  setDraft({ ...draft, description: e.target.value })
                }
              />
            </label>
            <label>
              Scheduled for
              <input
                type="datetime-local"
                aria-label="Edit scheduled for"
                value={draft.scheduled_for}
                onChange={(e) =>
                  setDraft({ ...draft, scheduled_for: e.target.value })
                }
              />
            </label>
            <div className="pin-preview-actions">
              <button type="button" onClick={handleSave}>
                Save
              </button>
              <button type="button" onClick={() => setIsEditing(false)}>
                Discard
              </button>
            </div>
          </div>
        ) : (
          <>
            <dl>
              <dt>Description</dt>
              <dd>{row.description}</dd>
              <dt>Destination</dt>
              <dd>
                <a href={row.link_url}>{row.link_url}</a>
              </dd>
              <dt>Scheduled</dt>
              <dd>{new Date(row.scheduled_for).toLocaleString()}</dd>
              <dt>Status</dt>
              <dd>{row.status}</dd>
            </dl>
            <div className="pin-preview-actions">
              {onEdit && (row.status === 'pending' || row.status === 'paused') && (
                <button type="button" onClick={() => setIsEditing(true)}>
                  Edit
                </button>
              )}
              <button type="button" onClick={onClose}>
                Close
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
