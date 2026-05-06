/**
 * useAgentWorkflow — moves a task to a new lane via the API.
 *
 * Agents now run server-side. This hook validates and calls moveTask.
 * The server fires the EventBus and the agents respond asynchronously.
 *
 * If the synchronous gate pass on the server returns a 409, the rejection
 * reasons (per-agent) are surfaced to the user via onError.
 */

import { useCallback } from 'react';
import type { Task } from '../types';
import { moveTask, ApiError } from '../services/api';

export function useAgentWorkflow(onError: (msg: string, severity?: 'info' | 'error') => void) {
  const handleTaskMove = useCallback(
    async (task: Task, newStage: string): Promise<void> => {
      try {
        await moveTask(task.id, newStage);
      } catch (err) {
        if (err instanceof ApiError && err.status === 409 && err.blockers?.length) {
          const summary = err.blockers
            .map((b) => `${b.agent_name}: ${b.reason}`)
            .join(' | ');
          onError(`Move blocked — ${summary}`, 'error');
        } else {
          onError(
            'Move failed: ' + (err instanceof Error ? err.message : String(err)),
            'error',
          );
        }
        throw err;
      }
    },
    [onError],
  );

  return { handleTaskMove };
}
