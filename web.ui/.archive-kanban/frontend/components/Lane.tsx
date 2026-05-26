import { useState } from 'react';
import type { Task, Project, Lane as LaneType } from '../types';
import Card from './Card';

interface Props {
  lane: LaneType;
  tasks: Task[];
  projects: Project[];
  isProductOwner: boolean;
  onDrop: (taskId: string, newStatus: string) => void;
  onCardClick: (task: Task) => void;
}

export default function Lane({
  lane,
  tasks,
  projects,
  isProductOwner,
  onDrop,
  onCardClick,
}: Props) {
  const [dragOver, setDragOver] = useState(false);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = () => setDragOver(false);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const taskId = e.dataTransfer.getData('text/plain');
    if (lane.key === 'accepted' && !isProductOwner) return;
    onDrop(taskId, lane.key);
  };

  return (
    <div
      className={`lane${dragOver ? ' drag-over' : ''}`}
      role="list"
      aria-label={`${lane.label} lane`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className="lane-title">{lane.label}</div>
      {tasks.length === 0 ? (
        <div
          className="lane-empty"
          aria-label={`No tasks in ${lane.label}`}
          style={{
            color: '#888',
            fontStyle: 'italic',
            textAlign: 'center',
            padding: '12px 8px',
            fontSize: '0.85em',
          }}
        >
          No tasks
        </div>
      ) : (
        tasks.map((task) => (
          <Card
            key={task.id}
            task={task}
            project={projects.find((p) => p.id === task.project_id)}
            onClick={onCardClick}
          />
        ))
      )}
    </div>
  );
}
