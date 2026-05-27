import { useEffect, useState, useRef } from 'react';

export interface DashboardEvent {
  kind: string;
  payload: Record<string, unknown>;
  occurred_at: string;
}

export interface SseState {
  connected: boolean;
  lastEvent: DashboardEvent | null;
}

/**
 * Subscribe to /api/events. Returns connection state and the most recent
 * event. Plans B-E build domain-specific hooks on top of this (e.g.
 * useKdpBooks listens for kdp:* events and refetches).
 */
export function useSseEvents(): SseState {
  const [connected, setConnected] = useState(false);
  const [lastEvent, setLastEvent] = useState<DashboardEvent | null>(null);
  const sourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    const es = new EventSource('/api/events');
    sourceRef.current = es;

    es.onopen = () => setConnected(true);
    es.onerror = () => setConnected(false);

    // Listen to every channel we know about. New channels added by Plans B-E
    // should add a line here.
    const channels = [
      'kdp:new-book', 'kdp:status-changed', 'kdp:published',
      'etsy:synced', 'etsy:status-changed', 'etsy:sale-detected',
      'pinterest:pin-scheduled', 'pinterest:pin-posted',
      'pinterest:pin-failed', 'pinterest:login-required',
      'reminder:fired', 'reminder:dismissed', 'reminder:failed',
      'system:worker-heartbeat', 'system:worker-error', 'system:tray-state-changed',
    ];
    const handlers: Array<[string, (e: MessageEvent) => void]> = channels.map((kind) => {
      const fn = (e: MessageEvent) => {
        try {
          const data = JSON.parse(e.data);
          setLastEvent({ kind, payload: data.payload, occurred_at: data.occurred_at });
        } catch {
          /* ignore malformed */
        }
      };
      es.addEventListener(kind, fn as EventListener);
      return [kind, fn];
    });

    return () => {
      for (const [kind, fn] of handlers) es.removeEventListener(kind, fn as EventListener);
      es.close();
    };
  }, []);

  return { connected, lastEvent };
}
