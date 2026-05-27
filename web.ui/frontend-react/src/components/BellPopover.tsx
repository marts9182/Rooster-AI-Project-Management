import { useCallback, useEffect, useRef, useState } from 'react';
import {
  listReminders,
  snoozeReminder,
  dismissReminder,
  type Reminder,
} from '../api/reminders';

interface Props {
  /** Whether the popover is currently visible. */
  isOpen: boolean;
  /** Called when the user dismisses the popover (overlay/outside click, Escape, close button). */
  onClose: () => void;
  /** Optional callback fired after the list refetches (so TopBar can update its badge count). */
  onChange?: (reminders: Reminder[]) => void;
}

/** Render a human-relative offset like "in 2h" / "in 3d" / "overdue". */
function formatRelative(due_at: string, now: Date = new Date()): string {
  const diffMs = new Date(due_at).getTime() - now.getTime();
  const overdue = diffMs < 0;
  const abs = Math.abs(diffMs);
  const mins = Math.round(abs / 60000);
  const hours = Math.round(abs / 3_600_000);
  const days = Math.round(abs / 86_400_000);
  let label: string;
  if (mins < 60) label = `${mins}m`;
  else if (hours < 24) label = `${hours}h`;
  else label = `${days}d`;
  return overdue ? `${label} overdue` : `in ${label}`;
}

/**
 * Pop-up panel that lists pending reminders with Snooze 1h / Snooze 24h /
 * Dismiss actions. Mounted alongside the bell button in `TopBar`. Refetches
 * the list on each user action and notifies the parent via `onChange` so the
 * badge count stays in sync.
 *
 * Closes on overlay click, outside-click, Escape key, or the close button.
 */
export default function BellPopover({ isOpen, onClose, onChange }: Props) {
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const panelRef = useRef<HTMLDivElement | null>(null);

  const refresh = useCallback(async () => {
    setErr(null);
    setLoading(true);
    try {
      // limit=10 — popover only shows the next 10 by due_at asc.
      const list = await listReminders({
        status: 'pending',
        limit: 10,
        order: 'due_at_asc',
      });
      setReminders(list);
      onChange?.(list);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [onChange]);

  // Fetch whenever the popover opens.
  useEffect(() => {
    if (!isOpen) return;
    void refresh();
  }, [isOpen, refresh]);

  // Close on Escape.
  useEffect(() => {
    if (!isOpen) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  const handleSnooze = useCallback(
    async (id: number, hours: number) => {
      try {
        await snoozeReminder(id, hours);
        await refresh();
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e));
      }
    },
    [refresh],
  );

  const handleDismiss = useCallback(
    async (id: number) => {
      try {
        await dismissReminder(id);
        await refresh();
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e));
      }
    },
    [refresh],
  );

  if (!isOpen) return null;

  return (
    <>
      <div
        className="bell-overlay"
        onClick={onClose}
        aria-hidden="true"
        data-testid="bell-overlay"
      />
      <div
        ref={panelRef}
        className="bell-popover"
        role="dialog"
        aria-label="Pending reminders"
      >
        <header className="bell-popover-header">
          <h2 className="bell-popover-title">Pending reminders</h2>
          <button
            type="button"
            className="bell-popover-close"
            onClick={onClose}
            aria-label="Close reminders"
          >
            ×
          </button>
        </header>
        {err && (
          <p className="bell-popover-error">Failed to load: {err}</p>
        )}
        {loading && !err && reminders.length === 0 && (
          <p className="bell-popover-loading">Loading…</p>
        )}
        {!loading && !err && reminders.length === 0 && (
          <p className="bell-popover-empty">No pending reminders 🎉</p>
        )}
        {reminders.length > 0 && (
          <ul className="bell-popover-list">
            {reminders.map((r) => (
              <li key={r.id} className="bell-popover-row">
                <div className="bell-popover-row-main">
                  <div className="bell-popover-row-title">{r.title}</div>
                  {r.body && (
                    <div className="bell-popover-row-body">{r.body}</div>
                  )}
                  <div className="bell-popover-row-meta">
                    <time dateTime={r.due_at}>{formatRelative(r.due_at)}</time>
                    <span className="bell-popover-row-channel">
                      {r.channel}
                    </span>
                  </div>
                </div>
                <div className="bell-popover-row-actions">
                  <button
                    type="button"
                    onClick={() => handleSnooze(r.id, 1)}
                    aria-label={`Snooze ${r.title} for 1 hour`}
                  >
                    Snooze 1h
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSnooze(r.id, 24)}
                    aria-label={`Snooze ${r.title} for 24 hours`}
                  >
                    Snooze 24h
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDismiss(r.id)}
                    aria-label={`Dismiss ${r.title}`}
                  >
                    Dismiss
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}

export { BellPopover };
