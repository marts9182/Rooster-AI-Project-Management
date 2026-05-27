import { useEffect, useState } from 'react';
import {
  listEvents,
  type CalendarEvent,
  type CalendarEventKind,
} from '../../api/calendar';
import TileShell from './TileShell';

interface State {
  status: 'loading' | 'ready' | 'error';
  events: CalendarEvent[];
  error?: string;
}

const KIND_EMOJI: Record<CalendarEventKind, string> = {
  'kdp.release': '📚',
  'etsy.listed': '🛒',
  'pinterest.post': '📌',
  reminder: '⏰',
};

function fmtIso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Dashboard tile: events in the next 7 days grouped by date.
 */
export default function CalendarTile() {
  const [state, setState] = useState<State>({ status: 'loading', events: [] });

  useEffect(() => {
    let cancelled = false;
    const today = new Date();
    const from = fmtIso(today);
    const sevenOut = new Date(today);
    sevenOut.setDate(sevenOut.getDate() + 7);
    const to = fmtIso(sevenOut);
    listEvents({ from, to })
      .then((events) => {
        if (!cancelled) setState({ status: 'ready', events });
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setState({
            status: 'error',
            events: [],
            error: err instanceof Error ? err.message : String(err),
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <TileShell
      id="calendar"
      emoji="📅"
      title="Next 7 days"
      viewAllHref="/calendar"
    >
      {state.status === 'loading' && <p className="tile-loading">Loading…</p>}
      {state.status === 'error' && (
        <p className="tile-error" role="alert">
          Failed to load Calendar: {state.error}
        </p>
      )}
      {state.status === 'ready' && <CalendarBody events={state.events} />}
    </TileShell>
  );
}

function CalendarBody({ events }: { events: CalendarEvent[] }) {
  if (events.length === 0) {
    return <p className="tile-empty">No events in the next 7 days.</p>;
  }
  // Group by date in chronological order.
  const grouped = new Map<string, CalendarEvent[]>();
  for (const e of [...events].sort((a, b) => (a.date < b.date ? -1 : 1))) {
    const arr = grouped.get(e.date) ?? [];
    arr.push(e);
    grouped.set(e.date, arr);
  }
  return (
    <ul className="tile-cal-groups">
      {[...grouped.entries()].map(([date, list]) => (
        <li key={date} className="tile-cal-group">
          <div className="tile-cal-date">{date}</div>
          <ul className="tile-cal-events">
            {list.map((ev, i) => (
              <li key={`${ev.source_kind}-${ev.source_id}-${i}`}>
                <span aria-hidden="true">{KIND_EMOJI[ev.kind] ?? '•'}</span>{' '}
                <span className="tile-cal-event-title">{ev.title}</span>
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ul>
  );
}
