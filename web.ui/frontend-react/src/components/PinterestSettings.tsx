import { useEffect, useState } from 'react';
import {
  getTokenStatus,
  getWhoami,
  listBoards,
  listQueue,
  pauseQueue,
  refreshToken,
  resumeQueue,
  type PinterestUser,
  type PinterestBoard,
  type PinterestTokenStatus,
} from '../api/pinterest';

/**
 * Pinterest connection status + board picker.
 *
 * On mount we fetch /token-status. When connected, we fetch /boards. The
 * chip is green when token-status returns connected=true, a default board
 * is selected, AND expires_at is more than 7 days away. Amber inside
 * 7 days or when no board is selected. Red when not connected.
 *
 * "Test connection" calls /whoami and shows the username on success.
 * "Refresh token now" POSTs /refresh (forces ensureFreshToken on the
 * backend) and re-fetches token-status.
 *
 * The default board choice persists to localStorage under the key
 * `pinterest_default_board_id` until a server-side `profile.pinterest_default_board_id`
 * field lands in a follow-up.
 */
export default function PinterestSettings() {
  const [tokenStatus, setTokenStatus] = useState<PinterestTokenStatus | null>(
    null,
  );
  const [whoami, setWhoami] = useState<PinterestUser | null>(null);
  const [boards, setBoards] = useState<PinterestBoard[] | null>(null);
  const [selectedBoardId, setSelectedBoardId] = useState<string>(() =>
    localStorage.getItem('pinterest_default_board_id') ?? '',
  );
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [queueIsPaused, setQueueIsPaused] = useState(false);
  const [isPauseToggling, setIsPauseToggling] = useState(false);

  // Derive queue-pause state from the row statuses (backend POST /pause sets
  // all 'pending' rows to 'paused'; POST /resume reverses it).
  async function refreshPauseState(): Promise<void> {
    try {
      const rows = await listQueue();
      setQueueIsPaused(rows.some((r) => r.status === 'paused'));
    } catch {
      // Best-effort — don't surface as a top-level error.
    }
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const ts = await getTokenStatus();
        if (cancelled) return;
        setTokenStatus(ts);
        if (ts.connected) {
          const b = await listBoards();
          if (cancelled) return;
          setBoards(b);
        }
        await refreshPauseState();
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleTestConnection = async () => {
    setIsTesting(true);
    setTestResult(null);
    try {
      const u = await getWhoami();
      setWhoami(u);
      setTestResult(`Connected as @${u.username}`);
    } catch (e) {
      setTestResult(
        `Failed: ${e instanceof Error ? e.message : String(e)}`,
      );
    } finally {
      setIsTesting(false);
    }
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    setError(null);
    try {
      await refreshToken();
      const ts = await getTokenStatus();
      setTokenStatus(ts);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleBoardChange = (id: string) => {
    setSelectedBoardId(id);
    localStorage.setItem('pinterest_default_board_id', id);
  };

  const handlePauseToggle = async () => {
    setIsPauseToggling(true);
    setError(null);
    try {
      if (queueIsPaused) {
        await resumeQueue();
      } else {
        await pauseQueue();
      }
      await refreshPauseState();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setIsPauseToggling(false);
    }
  };

  // Chip thresholds: >7d = green, <=7d = amber, disconnected = red,
  // connected-but-no-board = amber warning.
  function chipState(): { label: string; tone: 'ok' | 'warn' | 'fail' } {
    if (!tokenStatus?.connected) {
      return { label: '✗ Disconnected', tone: 'fail' };
    }
    if (!selectedBoardId) {
      return { label: '⚠ Board not selected', tone: 'warn' };
    }
    if (tokenStatus.expires_at) {
      const ms = new Date(tokenStatus.expires_at).getTime() - Date.now();
      const days = Math.floor(ms / (24 * 60 * 60 * 1000));
      if (days <= 0) return { label: '✗ Token expired', tone: 'fail' };
      if (days <= 7) return { label: `⚠ Expires in ${days}d`, tone: 'warn' };
    }
    return { label: '✓ Connected', tone: 'ok' };
  }

  function daysUntil(iso: string | null): string {
    if (!iso) return 'unknown';
    const ms = new Date(iso).getTime() - Date.now();
    const days = Math.floor(ms / (24 * 60 * 60 * 1000));
    return days > 0 ? `${days} days` : 'expired';
  }

  const chip = chipState();
  const showBoardWarning = !!tokenStatus?.connected && !selectedBoardId;

  return (
    <section className="pinterest-settings" aria-label="Pinterest settings">
      <h2>Pinterest Connection</h2>
      <div
        className={`status-chip status-${chip.tone}`}
        data-tone={chip.tone}
      >
        {chip.label}
      </div>
      {whoami && <p>Signed in as @{whoami.username}</p>}
      {tokenStatus?.expires_at && (
        <p>
          Token expires: {tokenStatus.expires_at.slice(0, 10)} (
          {daysUntil(tokenStatus.expires_at)})
        </p>
      )}
      {tokenStatus?.last_refresh_at && (
        <p>
          Last refresh:{' '}
          {tokenStatus.last_refresh_at.slice(0, 16).replace('T', ' ')}
        </p>
      )}
      <div className="settings-actions">
        <button
          type="button"
          onClick={handleTestConnection}
          disabled={isTesting}
        >
          {isTesting ? 'Testing…' : 'Test connection'}
        </button>
        <button
          type="button"
          onClick={handleRefresh}
          disabled={isRefreshing}
        >
          {isRefreshing ? 'Refreshing…' : 'Refresh token now'}
        </button>
        <button
          type="button"
          onClick={handlePauseToggle}
          disabled={isPauseToggling}
          aria-pressed={queueIsPaused}
        >
          {isPauseToggling
            ? 'Working…'
            : queueIsPaused
              ? '▶ Resume queue'
              : '⏸ Pause queue'}
        </button>
      </div>
      {testResult && <p className="test-result">{testResult}</p>}
      {error && <p className="error">{error}</p>}

      {showBoardWarning && (
        <div className="board-warning" role="alert">
          ⚠ Pick a default board to enable posting.
        </div>
      )}

      {boards && (
        <div className="board-picker">
          <label htmlFor="pinterest-default-board">Default board:</label>
          <select
            id="pinterest-default-board"
            aria-label="Default board"
            value={selectedBoardId}
            onChange={(e) => handleBoardChange(e.target.value)}
          >
            <option value="">(none)</option>
            {boards.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>
      )}
    </section>
  );
}
