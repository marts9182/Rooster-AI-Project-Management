/**
 * useTaskPoller — polls /api/tasks and re-renders only when the payload
 * actually changes (hash comparison).
 *
 * Polling cadence is adaptive:
 *   - SSE connected (live events flowing): poll every 30 s as a fallback
 *     in case an event was missed; mostly idle.
 *   - SSE disconnected: poll every 3 s for responsiveness.
 *
 * Skipping the 3-second fast poll while SSE is up cuts ~90 % of redundant
 * /api/tasks requests during a normal session.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Task } from '../types';
import { fetchTasks } from '../services/api';

const FAST_INTERVAL_MS = 3_000;
const SLOW_INTERVAL_MS = 30_000;

export function useTaskPoller(onError: (msg: string) => void, sseConnected: boolean = false) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const hashRef = useRef('');

  const refresh = useCallback(async () => {
    try {
      const data = await fetchTasks();
      const hash = JSON.stringify(data);
      if (hash !== hashRef.current) {
        hashRef.current = hash;
        setTasks(data);
      }
    } catch (err) {
      onError('Failed to load tasks: ' + (err instanceof Error ? err.message : String(err)));
    }
  }, [onError]);

  useEffect(() => {
    refresh();
    const interval = sseConnected ? SLOW_INTERVAL_MS : FAST_INTERVAL_MS;
    const id = setInterval(refresh, interval);
    return () => clearInterval(id);
  }, [refresh, sseConnected]);

  return { tasks, refresh };
}
