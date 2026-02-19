/**
 * useTaskPoller — polls /api/tasks every 3 s and re-renders only when
 * the payload actually changes (hash comparison).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Task } from '../types';
import { fetchTasks } from '../services/api';

const POLL_INTERVAL_MS = 3000;

export function useTaskPoller(onError: (msg: string) => void) {
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
    const id = setInterval(refresh, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [refresh]);

  return { tasks, refresh };
}
