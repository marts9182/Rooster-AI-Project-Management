/**
 * useAgentEvents — subscribes to the server's SSE stream (/api/events)
 * and exposes live agent activity to the UI.
 *
 * Returns:
 *   thinkingAgents  — Set of agent IDs currently "thinking"
 *   latestComment   — most recent comment pushed by any agent
 *   connected       — whether the SSE connection is alive
 */

import { useCallback, useEffect, useRef, useState } from 'react';

export interface AgentEvent {
  agentId: string;
  agentName: string;
  role: string;
  taskId: string;
  _ts: number;
}

export interface AgentCommentEvent extends AgentEvent {
  comment: {
    id: string;
    from_agent: string;
    to_agent: string | null;
    content: string;
    task_id: string;
    timestamp: string;
  };
}

export function useAgentEvents(onRefresh: () => void) {
  const [thinkingAgents, setThinkingAgents] = useState<Map<string, AgentEvent>>(new Map());
  const [connected, setConnected] = useState(false);
  const esRef = useRef<EventSource | null>(null);

  // Debounce refresh: when agents finish, we wait a beat then refresh tasks
  const refreshTimeout = useRef<ReturnType<typeof setTimeout>>(undefined);

  const scheduleRefresh = useCallback(() => {
    clearTimeout(refreshTimeout.current);
    refreshTimeout.current = setTimeout(() => onRefresh(), 300);
  }, [onRefresh]);

  useEffect(() => {
    const es = new EventSource('/api/events');
    esRef.current = es;

    es.onopen = () => setConnected(true);
    es.onerror = () => setConnected(false);

    es.addEventListener('agent:thinking', (e) => {
      const data: AgentEvent = JSON.parse(e.data);
      setThinkingAgents((prev) => new Map(prev).set(data.agentId, data));
    });

    es.addEventListener('agent:comment', (_e) => {
      // Agent posted a comment — refresh so TaskModal / board picks it up
      scheduleRefresh();
    });

    es.addEventListener('agent:idle', (e) => {
      const data: AgentEvent = JSON.parse(e.data);
      setThinkingAgents((prev) => {
        const next = new Map(prev);
        next.delete(data.agentId);
        return next;
      });
    });

    es.addEventListener('task:moved', () => {
      scheduleRefresh();
    });

    return () => {
      es.close();
      clearTimeout(refreshTimeout.current);
    };
  }, [scheduleRefresh]);

  return { thinkingAgents, connected };
}
