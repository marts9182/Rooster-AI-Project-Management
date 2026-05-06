import { useCallback, useEffect, useRef, useState } from 'react';
import type { Project, Sprint, Task } from './types';
import { fetchProjects, fetchSprints } from './services/api';
import { useTaskPoller } from './hooks/useTaskPoller';
import { useAgentWorkflow } from './hooks/useAgentWorkflow';
import { useAgentEvents } from './hooks/useAgentEvents';
import { LANES } from './constants/lanes';
import Board from './components/Board';
import SprintSelector from './components/SprintSelector';
import TaskModal from './components/TaskModal';
import ErrorBanner from './components/ErrorBanner';
import SprintRetroModal from './components/SprintRetroModal';
import './App.css';

interface AppError {
  message: string;
  severity: 'info' | 'error';
}

export default function App() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [sprints, setSprints] = useState<Sprint[]>([]);
  const [currentSprintId, setCurrentSprintId] = useState<string | null>(null);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [error, setError] = useState<AppError | null>(null);
  const [retroSprintId, setRetroSprintId] = useState<string | null>(null);

  const showError = useCallback((message: string, severity: 'info' | 'error' = 'error') => {
    setError({ message, severity });
  }, []);

  const dismissError = useCallback(() => setError(null), []);

  // Break the cyclic dependency between SSE-driven refresh and poller's
  // `connected`-aware interval by routing the refresh callback through a ref.
  const refreshRef = useRef<() => void>(() => {});
  const { thinkingAgents, connected } = useAgentEvents(() => refreshRef.current());
  const { tasks, refresh } = useTaskPoller((m) => showError(m, 'error'), connected);
  const { handleTaskMove } = useAgentWorkflow(showError);

  useEffect(() => {
    refreshRef.current = refresh;
  }, [refresh]);

  // Bootstrap: load projects + sprints once
  useEffect(() => {
    (async () => {
      try {
        const [p, s] = await Promise.all([fetchProjects(), fetchSprints()]);
        setProjects(p);
        setSprints(s);
        const active = s.find((sp) => sp.status === 'active') ?? s[s.length - 1];
        if (active) setCurrentSprintId(active.id);
      } catch (err) {
        showError('Failed to initialize: ' + (err instanceof Error ? err.message : String(err)));
      }
    })();
  }, [showError]);

  const handleDrop = async (taskId: string, newStatus: string) => {
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;

    try {
      await handleTaskMove(task, newStatus);
      await refresh();
    } catch (err) {
      // useAgentWorkflow already calls onError with rich blocker detail.
      // We just need to ensure the board reflects the rejected move by refreshing.
      await refresh();
      // Don't double-report — useAgentWorkflow already surfaced it.
      void err;
    }
  };

  const activeSprint = sprints.find((s) => s.id === currentSprintId);

  return (
    <>
      <ErrorBanner
        message={error?.message ?? null}
        severity={error?.severity ?? 'error'}
        onDismiss={dismissError}
      />

      <header className="jira-header" role="banner">
        <div className="jira-logo" aria-label="Rooster AI">🐓 Rooster AI</div>
        <SprintSelector
          sprints={sprints}
          currentSprintId={currentSprintId}
          onSelect={setCurrentSprintId}
          onGenerateRetro={(id) => setRetroSprintId(id)}
        />
        {thinkingAgents.size > 0 && (
          <div className="agent-activity" aria-live="polite">
            {Array.from(thinkingAgents.values()).map((a) => (
              <span key={a.agentId} className="agent-thinking">
                🤖 {a.agentName} is thinking…
              </span>
            ))}
          </div>
        )}
        {!connected && (
          <span className="sse-disconnected" title="Live connection lost — polling still active">
            ⚡ reconnecting…
          </span>
        )}
      </header>

      {activeSprint && (
        <div className="sprint-info" aria-live="polite">
          <b>{activeSprint.name}</b> | {activeSprint.start_date} to {activeSprint.end_date}
        </div>
      )}

      <Board
        lanes={LANES}
        tasks={tasks}
        projects={projects}
        sprintId={currentSprintId}
        isProductOwner={true}
        onDrop={handleDrop}
        onCardClick={setSelectedTask}
      />

      <TaskModal
        task={selectedTask}
        projects={projects}
        onClose={() => setSelectedTask(null)}
      />

      {retroSprintId && (
        <SprintRetroModal
          sprintId={retroSprintId}
          sprints={sprints}
          onClose={() => setRetroSprintId(null)}
        />
      )}
    </>
  );
}
