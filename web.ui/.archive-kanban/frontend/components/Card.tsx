import type { Task, Project } from '../types';

interface Props {
  task: Task;
  project?: Project;
  onClick: (task: Task) => void;
}

export default function Card({ task, project, onClick }: Props) {
  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onClick(task);
    }
  };

  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData('text/plain', task.id);
  };

  return (
    <div
      className="item"
      role="listitem"
      tabIndex={0}
      aria-label={task.title || 'Untitled task'}
      draggable
      onClick={() => onClick(task)}
      onKeyDown={handleKey}
      onDragStart={handleDragStart}
    >
      <span className="item-title">{task.title || 'Untitled'}</span>
      {project && (
        <span className="item-project"> [{project.name}]</span>
      )}
    </div>
  );
}
