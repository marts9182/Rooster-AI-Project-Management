/**
 * useAgentWorkflow — moves a task to a new lane via the API.
 *
 * Agents now run server-side. This hook just validates & calls moveTask.
 * The server fires the EventBus and the agents respond asynchronously.
 */

import { useCallback } from 'react';
import type { Task } from '../types';
import { moveTask } from '../services/api';

export function useAgentWorkflow(onError: (msg: string) => void) {
  const handleTaskMove = useCallback(
    async (task: Task, newStage: string): Promise<void> => {
      try {
        await moveTask(task.id, newStage);
      } catch (err) {
        onError(
          'Move failed: ' +
            (err instanceof Error ? err.message : String(err)),
        );
      }
    },
    [onError],
  );

  return { handleTaskMove };
}
