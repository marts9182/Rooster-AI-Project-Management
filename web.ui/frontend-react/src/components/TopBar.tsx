import { useCallback, useEffect, useRef, useState } from 'react';
import { useSseEvents } from '../hooks/useSseEvents';
import { listReminders, type Reminder } from '../api/reminders';
import BellPopover from './BellPopover';
import './../styles/shell.css';

interface Props {
  /**
   * Optional initial count. When omitted, the bell fetches its own count
   * from `/api/reminders?status=pending`. Tests use this to skip the fetch.
   */
  pendingRemindersCount?: number;
}

/** SSE channels (relative to `kind`) that should trigger a count refetch. */
const REMINDER_CHANNELS = new Set([
  'reminder:fired',
  'reminder:dismissed',
  'reminder:failed',
]);

/** Min time between SSE-driven refetches (ms). */
const REFRESH_THROTTLE_MS = 2000;

/**
 * Top bar with SSE status dot + live reminder-bell badge.
 *
 * Maintains a live pending-reminders count by:
 *   - Initial fetch on mount.
 *   - Refetch when any `reminder:*` SSE event arrives (throttled to one
 *     refetch per 2s).
 *   - Refetch after the popover performs an action (via `onChange`).
 *
 * Click the bell → opens `<BellPopover>` listing the next 10 pending
 * reminders with Snooze 1h / Snooze 24h / Dismiss actions.
 */
export default function TopBar({ pendingRemindersCount }: Props) {
  const { connected, lastEvent } = useSseEvents();
  const [count, setCount] = useState<number>(pendingRemindersCount ?? 0);
  const [popoverOpen, setPopoverOpen] = useState<boolean>(false);
  /** Timestamp of the last SSE-driven refetch (used for throttling). */
  const lastSseRefreshAt = useRef<number>(0);
  // We only auto-fetch when the parent hasn't provided a static prop value.
  const autoFetch = pendingRemindersCount === undefined;

  const refreshCount = useCallback(async () => {
    if (!autoFetch) return;
    try {
      const list = await listReminders({ status: 'pending', limit: 100 });
      setCount(list.length);
    } catch {
      // Keep last known count on transient errors — the SSE dot already
      // tells the user when live updates are degraded.
    }
  }, [autoFetch]);

  // Initial fetch.
  useEffect(() => {
    void refreshCount();
  }, [refreshCount]);

  // Refetch on reminder:* events, throttled to one per 2s.
  useEffect(() => {
    if (!lastEvent) return;
    if (!REMINDER_CHANNELS.has(lastEvent.kind)) return;
    const now = Date.now();
    if (now - lastSseRefreshAt.current < REFRESH_THROTTLE_MS) return;
    lastSseRefreshAt.current = now;
    void refreshCount();
  }, [lastEvent, refreshCount]);

  const handlePopoverChange = useCallback((list: Reminder[]) => {
    // BellPopover only returns up to limit=10 — if we have exactly that,
    // the true count may be higher, so fall through to a real refetch.
    if (list.length < 10) {
      setCount(list.length);
    } else {
      void (async () => {
        try {
          const full = await listReminders({ status: 'pending', limit: 100 });
          setCount(full.length);
        } catch {
          /* keep last count */
        }
      })();
    }
  }, []);

  return (
    <header className="topbar">
      <div className="topbar-spacer" />
      <span
        className={`sse-dot ${connected ? 'sse-dot-ok' : 'sse-dot-down'}`}
        title={connected ? 'Live updates connected' : 'Reconnecting…'}
        aria-label={connected ? 'connected' : 'disconnected'}
      />
      <button
        type="button"
        className="bell"
        onClick={() => setPopoverOpen((v) => !v)}
        aria-label={`${count} pending reminders`}
        aria-haspopup="dialog"
        aria-expanded={popoverOpen}
      >
        🔔
        {count > 0 && <span className="bell-badge">{count}</span>}
      </button>
      <BellPopover
        isOpen={popoverOpen}
        onClose={() => setPopoverOpen(false)}
        onChange={handlePopoverChange}
      />
      <a className="profile-link" href="/profile">
        👤
      </a>
    </header>
  );
}
