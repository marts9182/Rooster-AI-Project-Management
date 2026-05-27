/**
 * Calendar page — FullCalendar month/week/day view over the dashboard's
 * aggregated calendar feed.
 *
 * - Fetches via `listEvents({from, to})` based on the visible date range
 *   (FullCalendar's `events` callback gives us the start/end window).
 * - Kind filter chips: KDP releases / Etsy listings / Pinterest posts /
 *   Reminders. Multi-select. Events of unchecked kinds hide client-side.
 * - Click an event → side drawer slides in with metadata + kind-specific
 *   actions (Open detail link, or Snooze 1h/24h/1w + Dismiss for reminders).
 * - SSE wiring: refetch when `kdp:*`, `etsy:*`, `reminder:*`, or
 *   `pinterest:*` events fire (throttled to one refetch per 2 seconds).
 */
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Link } from 'react-router-dom';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import type { EventClickArg, EventInput } from '@fullcalendar/core';
import {
  listEvents,
  type CalendarEvent,
  type CalendarEventKind,
} from '../api/calendar';
import { dismissReminder, snoozeReminder } from '../api/reminders';
import { useSseEvents } from '../hooks/useSseEvents';

const KIND_COLORS: Record<CalendarEventKind, string> = {
  'kdp.release': '#4a90d9',
  'etsy.listed': '#d96b4a',
  'pinterest.post': '#c4488f',
  reminder: '#e3b341',
};

const KIND_LABELS: Record<CalendarEventKind, string> = {
  'kdp.release': 'KDP releases',
  'etsy.listed': 'Etsy listings',
  'pinterest.post': 'Pinterest posts',
  reminder: 'Reminders',
};

const ALL_KINDS: CalendarEventKind[] = [
  'kdp.release',
  'etsy.listed',
  'pinterest.post',
  'reminder',
];

const SSE_REFETCH_KINDS = new Set([
  'kdp:new-book',
  'kdp:status-changed',
  'kdp:published',
  'etsy:new-listing',
  'etsy:status-changed',
  'etsy:synced',
  'etsy:sale-detected',
  'reminder:fired',
  'reminder:dismissed',
  'reminder:failed',
  'pinterest:pin-scheduled',
  'pinterest:pin-posted',
]);

function fmtDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Default window: one month before through two months after "today". Used as
 * the initial fetch window before FullCalendar reports its visible range.
 */
function defaultWindow(): { from: string; to: string } {
  const today = new Date();
  const from = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  const to = new Date(today.getFullYear(), today.getMonth() + 2, 1);
  return { from: fmtDate(from), to: fmtDate(to) };
}

export default function Calendar() {
  const [enabled, setEnabled] = useState<Set<CalendarEventKind>>(
    new Set(ALL_KINDS),
  );
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [selected, setSelected] = useState<CalendarEvent | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [windowRange, setWindowRange] = useState<{ from: string; to: string }>(
    defaultWindow(),
  );

  // Throttle SSE-triggered refetches to at most one per 2 seconds.
  const lastRefetchAt = useRef<number>(0);

  const reload = useCallback(
    async (range: { from: string; to: string } = windowRange) => {
      setLoading(true);
      try {
        const data = await listEvents(range);
        setEvents(data);
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    },
    [windowRange],
  );

  // Initial + range-change fetch.
  useEffect(() => {
    void reload(windowRange);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [windowRange]);

  // SSE: refetch on publishing/listing/reminder events (throttled).
  const { lastEvent } = useSseEvents();
  useEffect(() => {
    if (!lastEvent) return;
    if (!SSE_REFETCH_KINDS.has(lastEvent.kind)) return;
    const now = Date.now();
    if (now - lastRefetchAt.current < 2000) return;
    lastRefetchAt.current = now;
    void reload(windowRange);
  }, [lastEvent, reload, windowRange]);

  // Close drawer on Escape.
  useEffect(() => {
    if (!selected) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelected(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selected]);

  const visible = useMemo(
    () => events.filter((e) => enabled.has(e.kind)),
    [events, enabled],
  );

  const fcEvents: EventInput[] = useMemo(
    () =>
      visible.map((e, i) => ({
        id: `${e.source_kind}:${e.source_id}:${i}`,
        title: e.title,
        start: e.date,
        allDay: true,
        backgroundColor: KIND_COLORS[e.kind],
        borderColor: KIND_COLORS[e.kind],
        classNames: [`event-kind-${e.kind.replace('.', '-')}`],
        extendedProps: { calEvent: e },
      })),
    [visible],
  );

  const toggleKind = useCallback((kind: CalendarEventKind) => {
    setEnabled((prev) => {
      const next = new Set(prev);
      if (next.has(kind)) next.delete(kind);
      else next.add(kind);
      return next;
    });
  }, []);

  const onEventClick = useCallback((arg: EventClickArg) => {
    const ev = arg.event.extendedProps.calEvent as CalendarEvent | undefined;
    if (ev) setSelected(ev);
  }, []);

  const handleDatesSet = useCallback(
    (arg: { startStr: string; endStr: string }) => {
      const from = arg.startStr.slice(0, 10);
      const to = arg.endStr.slice(0, 10);
      setWindowRange((prev) =>
        prev.from === from && prev.to === to ? prev : { from, to },
      );
    },
    [],
  );

  const onSnooze = async (hours: number) => {
    if (!selected || selected.source_kind !== 'reminder') return;
    try {
      await snoozeReminder(Number(selected.source_id), hours);
      setSelected(null);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const onDismiss = async () => {
    if (!selected || selected.source_kind !== 'reminder') return;
    try {
      await dismissReminder(Number(selected.source_id));
      setSelected(null);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <section className="calendar-page">
      <div className="page-header">
        <h1>Calendar</h1>
        <div
          role="group"
          aria-label="Kind filters"
          className="page-header-actions"
        >
          {ALL_KINDS.map((k) => {
            const on = enabled.has(k);
            return (
              <button
                key={k}
                type="button"
                aria-pressed={on}
                onClick={() => toggleKind(k)}
                style={{
                  padding: '4px 10px',
                  borderRadius: 12,
                  border: `1px solid ${KIND_COLORS[k]}`,
                  background: on ? KIND_COLORS[k] : 'transparent',
                  color: on ? 'white' : KIND_COLORS[k],
                  cursor: 'pointer',
                }}
              >
                {KIND_LABELS[k]}
              </button>
            );
          })}
        </div>
      </div>

      {error && (
        <p role="alert" style={{ color: 'crimson' }}>
          {error}
        </p>
      )}

      {loading && events.length === 0 && <p>Loading…</p>}

      <FullCalendar
        plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
        initialView="dayGridMonth"
        headerToolbar={{
          left: 'prev,next today',
          center: 'title',
          right: 'dayGridMonth,timeGridWeek,timeGridDay',
        }}
        events={fcEvents}
        eventClick={onEventClick}
        datesSet={handleDatesSet}
        height="auto"
      />

      {selected && (
        <>
          <div
            data-testid="drawer-overlay"
            onClick={() => setSelected(null)}
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0,0,0,0.25)',
              zIndex: 9,
            }}
          />
          <aside
            role="dialog"
            aria-label="event details"
            aria-modal="true"
            style={{
              position: 'fixed',
              right: 0,
              top: 0,
              width: 360,
              maxWidth: '100vw',
              height: '100vh',
              background: 'white',
              boxShadow: '-4px 0 16px rgba(0,0,0,0.12)',
              padding: 16,
              overflowY: 'auto',
              zIndex: 10,
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 8,
              }}
            >
              <span
                className={`status-badge event-kind-${selected.kind.replace('.', '-')}`}
                aria-label={`Kind: ${KIND_LABELS[selected.kind] ?? selected.kind}`}
                style={{
                  background: KIND_COLORS[selected.kind] ?? '#999',
                  color: 'white',
                  padding: '2px 8px',
                  borderRadius: 10,
                  fontSize: '0.85rem',
                }}
              >
                {KIND_LABELS[selected.kind] ?? selected.kind}
              </span>
              <button
                type="button"
                onClick={() => setSelected(null)}
                aria-label="Close drawer"
                style={{
                  background: 'transparent',
                  border: 'none',
                  fontSize: '1.4rem',
                  cursor: 'pointer',
                  lineHeight: 1,
                }}
              >
                ×
              </button>
            </div>
            <h2 style={{ marginTop: 0 }}>{selected.title}</h2>
            <p style={{ margin: '0.25rem 0' }}>
              <strong>Date:</strong> {selected.date}
            </p>
            <p style={{ margin: '0.25rem 0' }}>
              <strong>Source:</strong> {selected.source_kind} #
              {String(selected.source_id)}
            </p>

            <div style={{ marginTop: 16 }}>
              {selected.kind === 'kdp.release' && selected.url && (
                <Link to={selected.url}>Open book detail</Link>
              )}
              {selected.kind === 'etsy.listed' && selected.url && (
                <Link to={selected.url}>Open listing</Link>
              )}
              {selected.kind === 'pinterest.post' && (
                <Link to="/pinterest">Open pin queue</Link>
              )}
              {selected.kind === 'reminder' && (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button type="button" onClick={() => void onSnooze(1)}>
                    Snooze 1h
                  </button>
                  <button type="button" onClick={() => void onSnooze(24)}>
                    Snooze 24h
                  </button>
                  <button type="button" onClick={() => void onSnooze(24 * 7)}>
                    Snooze 1w
                  </button>
                  <button type="button" onClick={() => void onDismiss()}>
                    Dismiss
                  </button>
                </div>
              )}
            </div>
          </aside>
        </>
      )}
    </section>
  );
}
