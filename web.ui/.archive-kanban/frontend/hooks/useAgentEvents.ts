/**
 * useAgentEvents — subscribes to the server's SSE stream (/api/events)
 * and exposes live agent activity to the UI.
 *
 * Returns:
 *   thinkingAgents  — Map of agent IDs currently "thinking"
 *   connected       — whether the SSE connection is alive
 *
 * Robustness fixes:
 *   - When the SSE connection drops, all "thinking" badges are cleared —
 *     agents aren't actually thinking if the stream is dead.
 *   - Per-agent 60s safety timeout: if no `agent:idle` arrives within
 *     60 seconds of `agent:thinking`, the badge clears anyway.
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

const STUCK_THINKING_TIMEOUT_MS = 60_000;

export function useAgentEvents(onRefresh: () => void) {
  const [thinkingAgents, setThinkingAgents] = useState<Map<string, AgentEvent>>(new Map());
  const [connected, setConnected] = useState(false);
  const esRef = useRef<EventSource | null>(null);
  const stuckTimeouts = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  // Debounce refresh: when agents finish, we wait a beat then refresh tasks
  const refreshTimeout = useRef<ReturnType<typeof setTimeout>>(undefined);

  const scheduleRefresh = useCallback(() => {
    clearTimeout(refreshTimeout.current);
    refreshTimeout.current = setTimeout(() => onRefresh(), 300);
  }, [onRefresh]);

  const clearAgentBadge = useCallback((agentId: string) => {
    const t = stuckTimeouts.current.get(agentId);
    if (t) {
      clearTimeout(t);
      stuckTimeouts.current.delete(agentId);
    }
    setThinkingAgents((prev) => {
      if (!prev.has(agentId)) return prev;
      const next = new Map(prev);
      next.delete(agentId);
      return next;
    });
  }, []);

  const clearAllBadges = useCallback(() => {
    for (const t of stuckTimeouts.current.values()) clearTimeout(t);
    stuckTimeouts.current.clear();
    setThinkingAgents((prev) => (prev.size === 0 ? prev : new Map()));
  }, []);

  useEffect(() => {
    const es = new EventSource('/api/events');
    esRef.current = es;

    es.onopen = () => setConnected(true);
    es.onerror = () => {
      setConnected(false);
      // Stream is dead — agents aren't thinking anymore from the UI's
      // perspective. Browser will auto-reconnect; badges will repopulate
      // from fresh agent:thinking events.
      clearAllBadges();
    };

    es.addEventListener('agent:thinking', (e) => {
      const data: AgentEvent = JSON.parse(e.data);
      setThinkingAgents((prev) => new Map(prev).set(data.agentId, data));
      // Safety timer: if no idle event arrives in 60s, clear it ourselves.
      const existing = stuckTimeouts.current.get(data.agentId);
      if (existing) clearTimeout(existing);
      const timer = setTimeout(() => clearAgentBadge(data.agentId), STUCK_THINKING_TIMEOUT_MS);
      stuckTimeouts.current.set(data.agentId, timer);
    });

    es.addEventListener('agent:comment', () => {
      // Agent posted a comment — refresh so TaskModal / board picks it up
      scheduleRefresh();
    });

    es.addEventListener('agent:idle', (e) => {
      const data: AgentEvent = JSON.parse(e.data);
      clearAgentBadge(data.agentId);
    });

    es.addEventListener('agent:error', (e) => {
      const data: AgentEvent = JSON.parse(e.data);
      clearAgentBadge(data.agentId);
    });

    es.addEventListener('task:moved', () => {
      scheduleRefresh();
    });

    // Capture the refs locally so the cleanup uses the same instances
    // even if React's strict re-render rules complain otherwise.
    const localStuck = stuckTimeouts.current;
    const localRefresh = refreshTimeout;
    return () => {
      es.close();
      clearTimeout(localRefresh.current);
      for (const t of localStuck.values()) clearTimeout(t);
      localStuck.clear();
    };
  }, [scheduleRefresh, clearAgentBadge, clearAllBadges]);

  return { thinkingAgents, connected };
}
