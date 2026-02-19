import { useCallback, useEffect, useState } from 'react';
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
import './App.css';

export default function App() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [sprints, setSprints] = useState<Sprint[]>([]);
  const [currentSprintId, setCurrentSprintId] = useState<string | null>(null);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [error, setError] = useState<string | null>(null);

  const showError = useCallback((msg: string) => {
    setError(msg);
  }, []);

  const { tasks, refresh } = useTaskPoller(showError);
  const { handleTaskMove } = useAgentWorkflow(showError);
  const { thinkingAgents, connected } = useAgentEvents(refresh);

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
      showError('Move failed: ' + (err instanceof Error ? err.message : String(err)));
    }
  };

  const activeSprint = sprints.find((s) => s.id === currentSprintId);

  return (
    <>
      <ErrorBanner message={error} />

      <header className="jira-header" role="banner">
        <div className="jira-logo" aria-label="Rooster AI">🐓 Rooster AI</div>
        <SprintSelector
          sprints={sprints}
          currentSprintId={currentSprintId}
          onSelect={setCurrentSprintId}
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
    </>
  );
}
