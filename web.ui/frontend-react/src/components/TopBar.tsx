import { useSseEvents } from '../hooks/useSseEvents';
import './../styles/shell.css';

interface Props {
  pendingRemindersCount?: number;
}

/**
 * Top bar with SSE status dot + reminder-bell badge. The badge count is
 * passed in from a higher-level provider in Plans C; Commit 2 wires the
 * prop but defaults to 0.
 */
export default function TopBar({ pendingRemindersCount = 0 }: Props) {
  const { connected } = useSseEvents();
  return (
    <header className="topbar">
      <div className="topbar-spacer" />
      <span
        className={`sse-dot ${connected ? 'sse-dot-ok' : 'sse-dot-down'}`}
        title={connected ? 'Live updates connected' : 'Reconnecting…'}
        aria-label={connected ? 'connected' : 'disconnected'}
      />
      <a className="bell" href="/" aria-label={`${pendingRemindersCount} pending reminders`}>
        🔔
        {pendingRemindersCount > 0 && (
          <span className="bell-badge">{pendingRemindersCount}</span>
        )}
      </a>
      <a className="profile-link" href="/profile">👤</a>
    </header>
  );
}
