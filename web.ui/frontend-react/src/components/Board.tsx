import type { Task, Project, Lane as LaneType } from '../types';
import Lane from './Lane';

interface Props {
  lanes: LaneType[];
  tasks: Task[];
  projects: Project[];
  sprintId: string | null;
  isProductOwner: boolean;
  onDrop: (taskId: string, newStatus: string) => void;
  onCardClick: (task: Task) => void;
}

export default function Board({
  lanes,
  tasks,
  projects,
  sprintId,
  isProductOwner,
  onDrop,
  onCardClick,
}: Props) {
  const sprintTasks = tasks.filter((t) => t.sprint_id === sprintId);

  return (
    <div className="board" role="region" aria-label="Kanban board">
      {lanes.map((lane) => {
        const laneTasks = sprintTasks.filter(
          (t) => (t.status || '').toLowerCase().replace(/\s+/g, '_') === lane.key
        );
        return (
          <Lane
            key={lane.key}
            lane={lane}
            tasks={laneTasks}
            projects={projects}
            isProductOwner={isProductOwner}
            onDrop={onDrop}
            onCardClick={onCardClick}
          />
        );
      })}
    </div>
  );
}
