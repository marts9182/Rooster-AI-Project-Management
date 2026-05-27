import { useEffect, useRef, useState } from 'react';
import {
  pauseQueue,
  resumeQueue,
  startLogin,
  type PinterestQueueRow,
} from '../api/pinterest';

interface Props {
  /**
   * The current queue. Any row in `paused` state implies the queue itself is
   * paused (the backend has no separate "queue paused" flag — pausing flips
   * every pending row to `paused`).
   */
  queue: PinterestQueueRow[];
  /** Called after a successful pause/resume so the parent refetches the queue. */
  onChanged: () => void | Promise<void>;
}

/**
 * Pause/resume queue toggle, a sign-in-to-Pinterest button, and a read-only
 * cadence summary. After kicking off the login flow the component polls the
 * parent's `onChanged` every 5s for the next 60s so the queue UI catches up
 * once Playwright finishes — the SSE `pinterest:login-requested` event also
 * triggers a refetch via the page, but the timer provides belt-and-braces
 * coverage when the browser window stays open longer than expected.
 */
export default function PinterestSettings({ queue, onChanged }: Props) {
  const [status, setStatus] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const pollerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollerStopRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => stopPolling();
  }, []);

  const pendingCount = queue.filter((r) => r.status === 'pending').length;
  const pausedCount = queue.filter((r) => r.status === 'paused').length;
  const isPaused = pausedCount > 0;

  function stopPolling() {
    if (pollerRef.current) {
      clearInterval(pollerRef.current);
      pollerRef.current = null;
    }
    if (pollerStopRef.current) {
      clearTimeout(pollerStopRef.current);
      pollerStopRef.current = null;
    }
  }

  function startPolling() {
    stopPolling();
    pollerRef.current = setInterval(() => {
      void onChanged();
    }, 5000);
    // Stop after 60s — by then the user has either finished login or given up.
    pollerStopRef.current = setTimeout(() => {
      stopPolling();
    }, 60_000);
  }

  async function handlePause() {
    setBusy(true);
    try {
      const r = await pauseQueue();
      setStatus(`Paused ${r.paused} pin(s).`);
      await onChanged();
    } catch (err) {
      setStatus(`Pause failed: ${String((err as Error).message ?? err)}`);
    } finally {
      setBusy(false);
    }
  }

  async function handleResume() {
    setBusy(true);
    try {
      const r = await resumeQueue();
      setStatus(`Resumed ${r.resumed} pin(s).`);
      await onChanged();
    } catch (err) {
      setStatus(`Resume failed: ${String((err as Error).message ?? err)}`);
    } finally {
      setBusy(false);
    }
  }

  async function handleLogin() {
    setStatus(
      'Browser window opening… complete the login in the new Chromium window that just appeared.',
    );
    try {
      await startLogin();
      startPolling();
    } catch (err) {
      setStatus(
        `Login launch failed: ${String((err as Error).message ?? err)}`,
      );
    }
  }

  return (
    <section className="pin-settings" aria-label="Pinterest settings">
      <h2>Settings</h2>
      <div className="pin-settings-row">
        <div>
          <strong>{pendingCount}</strong> pending ·{' '}
          <strong>{pausedCount}</strong> paused
        </div>
        <div className="pin-settings-actions">
          {isPaused ? (
            <button type="button" onClick={handleResume} disabled={busy}>
              Resume queue
            </button>
          ) : (
            <button
              type="button"
              onClick={handlePause}
              disabled={busy || pendingCount === 0}
            >
              Pause queue
            </button>
          )}
          <button
            type="button"
            onClick={handleLogin}
            title="Open a visible Chromium window to log in"
          >
            Sign in to Pinterest
          </button>
        </div>
      </div>
      <p className="muted">
        Posting cadence: 3–5 pins/day between 09:00 and 21:00 in your
        profile time zone. Edit the time zone on /profile to shift the
        window.
      </p>
      {status && <p className="pin-settings-status">{status}</p>}
    </section>
  );
}
