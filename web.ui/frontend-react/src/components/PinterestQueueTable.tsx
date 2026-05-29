import { useState } from 'react';
import type { PinterestQueueRow, UpdateQueuePatch } from '../api/pinterest';

interface Props {
  rows: PinterestQueueRow[];
  /** Called with the queue row id and the patch the user committed. */
  onEdit: (id: number, patch: UpdateQueuePatch) => void | Promise<void>;
  /** Called with the queue row id when the user confirms a cancel. */
  onCancel: (id: number) => void | Promise<void>;
  /** Called when the user clicks the title cell — parent opens a preview modal. */
  onPreview: (row: PinterestQueueRow) => void;
}

/**
 * Status icon + label. The badge gets a `status-<name>` class so callers can
 * colour each state via shell.css.
 */
function statusBadge(status: PinterestQueueRow['status']): string {
  switch (status) {
    case 'pending':
      return '▶ pending';
    case 'posting':
      return '⏳ posting';
    case 'posted':
      return '✓ posted';
    case 'failed':
      return '⚠ failed';
    case 'paused':
      return '⏸ paused';
    case 'cancelled':
      return '✕ cancelled';
    default:
      return status;
  }
}

/**
 * Render a Date as a human-relative string ("in 3h", "2d ago"). Falls back to
 * the locale-formatted string on absurd offsets so the cell never goes blank.
 */
function relativeTime(iso: string): string {
  const target = new Date(iso).getTime();
  if (!Number.isFinite(target)) return iso;
  const diffMs = target - Date.now();
  const absMs = Math.abs(diffMs);
  const sign = diffMs >= 0 ? 'in ' : '';
  const suffix = diffMs >= 0 ? '' : ' ago';
  const min = 60 * 1000;
  const hr = 60 * min;
  const day = 24 * hr;
  if (absMs < min) return diffMs >= 0 ? 'in <1m' : '<1m ago';
  if (absMs < hr) return `${sign}${Math.round(absMs / min)}m${suffix}`;
  if (absMs < day) return `${sign}${Math.round(absMs / hr)}h${suffix}`;
  if (absMs < 30 * day) return `${sign}${Math.round(absMs / day)}d${suffix}`;
  return new Date(iso).toLocaleString();
}

/**
 * Sortable queue table. Click a column header to toggle sort direction; click
 * a title cell to fire `onPreview`. The Edit button opens an inline form for
 * the title + scheduled_for; the Cancel button asks for confirmation then
 * calls `onCancel`. The component is purely presentational — the parent owns
 * the API calls so tests can stub them without unmocking fetch.
 */
export default function PinterestQueueTable({
  rows,
  onEdit,
  onCancel,
  onPreview,
}: Props) {
  const [sortKey, setSortKey] = useState<'scheduled_for' | 'status' | 'title'>(
    'scheduled_for',
  );
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [draft, setDraft] = useState<{ title: string; scheduled_for: string }>({
    title: '',
    scheduled_for: '',
  });

  if (rows.length === 0) {
    return (
      <p className="empty">
        No pins in queue. Mark a KDP book published to generate pins.
      </p>
    );
  }

  function toggleSort(key: 'scheduled_for' | 'status' | 'title') {
    if (sortKey === key) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  }

  const sorted = [...rows].sort((a, b) => {
    const av = String(a[sortKey] ?? '');
    const bv = String(b[sortKey] ?? '');
    const cmp = av < bv ? -1 : av > bv ? 1 : 0;
    return sortDir === 'asc' ? cmp : -cmp;
  });

  function beginEdit(row: PinterestQueueRow) {
    setEditingId(row.id);
    // datetime-local needs "YYYY-MM-DDTHH:mm" with no timezone — slice it.
    setDraft({
      title: row.title,
      scheduled_for: row.scheduled_for.slice(0, 16),
    });
  }

  async function commitEdit(row: PinterestQueueRow) {
    const patch: UpdateQueuePatch = { title: draft.title };
    // The datetime-local input lacks a timezone — interpret as the user's
    // local time and serialise to ISO.
    if (draft.scheduled_for) {
      const dt = new Date(draft.scheduled_for);
      if (!Number.isNaN(dt.getTime())) {
        patch.scheduled_for = dt.toISOString();
      }
    }
    await onEdit(row.id, patch);
    setEditingId(null);
  }

  async function handleCancelClick(row: PinterestQueueRow) {
    if (
      typeof window !== 'undefined' &&
      typeof window.confirm === 'function' &&
      !window.confirm(`Cancel pin "${row.title}"?`)
    ) {
      return;
    }
    await onCancel(row.id);
  }

  return (
    <table className="pin-queue-table">
      <thead>
        <tr>
          <th>
            <button
              type="button"
              className="link-btn"
              onClick={() => toggleSort('title')}
            >
              Pin
            </button>
          </th>
          <th>Type</th>
          <th>
            <button
              type="button"
              className="link-btn"
              onClick={() => toggleSort('scheduled_for')}
            >
              Scheduled
            </button>
          </th>
          <th>
            <button
              type="button"
              className="link-btn"
              onClick={() => toggleSort('status')}
            >
              Status
            </button>
          </th>
          <th aria-label="Actions" />
        </tr>
      </thead>
      <tbody>
        {sorted.map((row) => {
          const isEditing = editingId === row.id;
          const canEdit = row.status === 'pending' || row.status === 'paused';
          const canCancel = row.status === 'pending' || row.status === 'paused';
          return (
            <tr key={row.id} className={`status-${row.status}`}>
              <td>
                {isEditing ? (
                  <input
                    type="text"
                    aria-label="Title"
                    value={draft.title}
                    onChange={(e) =>
                      setDraft({ ...draft, title: e.target.value })
                    }
                  />
                ) : (
                  <button
                    type="button"
                    className="link-btn"
                    onClick={() => onPreview(row)}
                  >
                    {row.title}
                  </button>
                )}
              </td>
              <td>{row.pin_type.replace('_', ' ')}</td>
              <td title={row.scheduled_for}>
                {isEditing ? (
                  <input
                    type="datetime-local"
                    aria-label="Scheduled for"
                    value={draft.scheduled_for}
                    onChange={(e) =>
                      setDraft({ ...draft, scheduled_for: e.target.value })
                    }
                  />
                ) : (
                  relativeTime(row.scheduled_for)
                )}
              </td>
              <td>
                <span className={`status-badge status-${row.status}`}>
                  {statusBadge(row.status)}
                </span>
              </td>
              <td className="actions">
                {isEditing ? (
                  <>
                    <button type="button" className="btn btn--primary btn--sm" onClick={() => commitEdit(row)}>
                      Save
                    </button>
                    <button
                      type="button"
                      className="btn btn--secondary btn--sm"
                      onClick={() => setEditingId(null)}
                    >
                      Discard
                    </button>
                  </>
                ) : (
                  <>
                    {canEdit && (
                      <button type="button" className="btn btn--secondary btn--sm" onClick={() => beginEdit(row)}>
                        Edit
                      </button>
                    )}
                    {canCancel && (
                      <button
                        type="button"
                        className="btn btn--danger btn--sm"
                        onClick={() => handleCancelClick(row)}
                      >
                        Cancel
                      </button>
                    )}
                  </>
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
