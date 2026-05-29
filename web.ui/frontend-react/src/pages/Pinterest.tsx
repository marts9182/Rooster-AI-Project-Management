import { useCallback, useEffect, useRef, useState } from 'react';
import {
  listQueue,
  listHistory,
  cancelQueueRow,
  updateQueueRow,
  type PinterestQueueRow,
  type PinterestHistoryRow,
  type UpdateQueuePatch,
} from '../api/pinterest';
import PinterestQueueTable from '../components/PinterestQueueTable';
import PinterestHistoryTable from '../components/PinterestHistoryTable';
import PinterestHistoryTabs from '../components/PinterestHistoryTabs';
import PinterestSettings from '../components/PinterestSettings';
import PinPreviewModal from '../components/PinPreviewModal';
import PinterestViewToggle, { type PinViewMode } from '../components/PinterestViewToggle';
import PinterestCalendar from '../components/PinterestCalendar';
import { useSseEvents } from '../hooks/useSseEvents';

/** Minimum gap between SSE-triggered refetches (ms). */
const SSE_REFRESH_THROTTLE_MS = 2000;

/**
 * Publishing Ops Dashboard — Pinterest page.
 *
 * Three sections per the Plan E spec §6.8:
 *   1. Settings — pause/resume + sign-in to Pinterest
 *   2. Queue    — sortable table of pending+posting+paused rows with inline edit
 *   3. History  — last 100 posting attempts (success or fail)
 *
 * Initial data is fetched on mount; the page re-fetches on any `pinterest:*`
 * SSE event, throttled to once every 2s so a burst of posts doesn't trigger a
 * fetch storm. The PinPreviewModal lives at the page level so any cell can
 * open it without prop-drilling state through the table.
 */
export default function Pinterest() {
  const [queue, setQueue] = useState<PinterestQueueRow[]>([]);
  const [history, setHistory] = useState<PinterestHistoryRow[]>([]);
  const [preview, setPreview] = useState<PinterestQueueRow | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<PinViewMode>(() => {
    try { return (localStorage.getItem('pinterest_view_mode') as PinViewMode) ?? 'week'; }
    catch { return 'week'; }
  });
  useEffect(() => {
    try { localStorage.setItem('pinterest_view_mode', viewMode); } catch { /* ignore */ }
  }, [viewMode]);
  const lastRefreshRef = useRef<number>(0);
  const pendingRefreshRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { lastEvent } = useSseEvents();

  const reload = useCallback(async () => {
    try {
      const [q, h] = await Promise.all([listQueue(), listHistory(100)]);
      setQueue(q);
      setHistory(h);
      setErr(null);
      lastRefreshRef.current = Date.now();
    } catch (e) {
      setErr(String((e as Error).message ?? e));
    }
  }, []);

  // Initial fetch.
  useEffect(() => {
    void reload();
  }, [reload]);

  // Refetch on any pinterest:* SSE event, throttled to once per 2s.
  useEffect(() => {
    if (!lastEvent) return;
    if (!lastEvent.kind.startsWith('pinterest:')) return;
    const now = Date.now();
    const elapsed = now - lastRefreshRef.current;
    if (elapsed >= SSE_REFRESH_THROTTLE_MS) {
      void reload();
      return;
    }
    // Schedule a single trailing refetch so the user still sees the final state.
    if (pendingRefreshRef.current) return;
    pendingRefreshRef.current = setTimeout(() => {
      pendingRefreshRef.current = null;
      void reload();
    }, SSE_REFRESH_THROTTLE_MS - elapsed);
  }, [lastEvent, reload]);

  useEffect(() => {
    return () => {
      if (pendingRefreshRef.current) {
        clearTimeout(pendingRefreshRef.current);
        pendingRefreshRef.current = null;
      }
    };
  }, []);

  const handleEdit = useCallback(
    async (id: number, patch: UpdateQueuePatch) => {
      try {
        await updateQueueRow(id, patch);
        await reload();
      } catch (e) {
        setErr(String((e as Error).message ?? e));
      }
    },
    [reload],
  );

  const handleCancel = useCallback(
    async (id: number) => {
      try {
        await cancelQueueRow(id);
        await reload();
      } catch (e) {
        setErr(String((e as Error).message ?? e));
      }
    },
    [reload],
  );

  return (
    <section className="page-pinterest">
      <div className="page-header">
        <h1>Pinterest</h1>
      </div>
      {err && (
        <p className="error" role="alert">
          {err}
        </p>
      )}

      <PinterestSettings />

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
        <h2 style={{ margin: 0 }}>Upcoming</h2>
        <PinterestViewToggle mode={viewMode} onChange={setViewMode} />
      </div>

      {viewMode === 'list' && (
        <PinterestQueueTable
          rows={queue}
          onEdit={handleEdit}
          onCancel={handleCancel}
          onPreview={setPreview}
        />
      )}

      {(viewMode === 'week' || viewMode === 'month') && (
        <PinterestCalendar
          rows={queue}
          start={new Date()}
          onChipClick={setPreview}
        />
      )}

      <h2>History</h2>
      <PinterestHistoryTabs
        recentChildren={<PinterestHistoryTable rows={history} />}
      />

      <PinPreviewModal
        row={preview}
        onClose={() => setPreview(null)}
        onEdit={async (id, patch) => {
          await handleEdit(id, patch);
          setPreview(null);
        }}
      />
    </section>
  );
}
