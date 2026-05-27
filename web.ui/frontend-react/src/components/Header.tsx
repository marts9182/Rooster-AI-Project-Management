import { useCallback, useEffect, useRef, useState } from 'react';
import { NavLink, Link } from 'react-router-dom';
import { useSseEvents } from '../hooks/useSseEvents';
import { listReminders, type Reminder } from '../api/reminders';
import ThemeToggle from './ThemeToggle';
import BellPopover from './BellPopover';
import { useChatDrawer } from './chat/ChatDrawerContext';
import './../styles/shell.css';

interface NavItem {
  to: string;
  label: string;
}

const NAV_LINKS: NavItem[] = [
  { to: '/kdp', label: 'KDP' },
  { to: '/etsy', label: 'Etsy' },
  { to: '/plans', label: 'Plans' },
  { to: '/calendar', label: 'Calendar' },
  { to: '/pinterest', label: 'Pinterest' },
];

/** SSE channels (relative to `kind`) that should trigger a count refetch. */
const REMINDER_CHANNELS = new Set([
  'reminder:fired',
  'reminder:dismissed',
  'reminder:failed',
]);

/** Min time between SSE-driven refetches (ms). */
const REFRESH_THROTTLE_MS = 2000;

interface Props {
  /**
   * Optional initial count. When omitted, the header fetches its own count
   * from `/api/reminders?status=pending`. Tests use this to skip the fetch.
   */
  pendingRemindersCount?: number;
}

/**
 * Top-of-page header: brand logo, primary nav, SSE status dot, theme toggle,
 * reminder bell with badge + popover, and a profile link.
 *
 * Replaces the previous left sidebar + `TopBar`. Sticky at the top of the
 * viewport (`position: sticky`) so it remains visible as the user scrolls
 * long pages such as Calendar or KDP catalog.
 */
export default function Header({ pendingRemindersCount }: Props) {
  const { connected, lastEvent } = useSseEvents();
  const { open: openDrawer } = useChatDrawer();
  const [count, setCount] = useState<number>(pendingRemindersCount ?? 0);
  const [popoverOpen, setPopoverOpen] = useState<boolean>(false);
  const lastSseRefreshAt = useRef<number>(0);
  const autoFetch = pendingRemindersCount === undefined;

  const refreshCount = useCallback(async () => {
    if (!autoFetch) return;
    try {
      const list = await listReminders({ status: 'pending', limit: 100 });
      setCount(list.length);
    } catch {
      // Keep last known count on transient errors.
    }
  }, [autoFetch]);

  useEffect(() => {
    void refreshCount();
  }, [refreshCount]);

  useEffect(() => {
    if (!lastEvent) return;
    if (!REMINDER_CHANNELS.has(lastEvent.kind)) return;
    const now = Date.now();
    if (now - lastSseRefreshAt.current < REFRESH_THROTTLE_MS) return;
    lastSseRefreshAt.current = now;
    void refreshCount();
  }, [lastEvent, refreshCount]);

  const handlePopoverChange = useCallback((list: Reminder[]) => {
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
    <header className="app-header" role="banner">
      <div className="app-header-left">
        <Link to="/" className="header-logo" aria-label="Home — Rooster Dashboard">
          <img src="/logo.png" alt="Rooster Dashboard" />
        </Link>
        <nav className="header-nav" aria-label="Primary">
          {NAV_LINKS.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              className={({ isActive }) =>
                `header-nav-link${isActive ? ' active' : ''}`
              }
            >
              {l.label}
            </NavLink>
          ))}
        </nav>
      </div>
      <div className="app-header-right">
        <span
          className={`sse-dot ${connected ? 'sse-dot-ok' : 'sse-dot-down'}`}
          title={connected ? 'Live updates connected' : 'Reconnecting…'}
          aria-label={connected ? 'connected' : 'disconnected'}
        />
        <ThemeToggle />
        <button
          type="button"
          className="chat-blob-trigger"
          onClick={openDrawer}
          aria-label="Open Claude chat"
          title="Claude chat"
          data-testid="chat-blob-trigger"
        >
          {/* Phase 4 replaces this with <ChatBlob size="sm" /> */}
          <span className="chat-blob-trigger-placeholder" />
        </button>
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
        <Link
          to="/profile"
          className="profile-link"
          aria-label="Profile"
          title="Profile"
        >
          👤
        </Link>
        <Link
          to="/help"
          className="profile-link"
          aria-label="Help"
          title="Help"
        >
          ❓
        </Link>
      </div>
    </header>
  );
}
