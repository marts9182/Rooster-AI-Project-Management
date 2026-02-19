import type { Sprint } from '../types';

interface Props {
  sprints: Sprint[];
  currentSprintId: string | null;
  onSelect: (id: string) => void;
}

export default function SprintSelector({ sprints, currentSprintId, onSelect }: Props) {
  return (
    <div className="sprint-select-container">
      <label htmlFor="sprintSelect">Sprint:</label>
      <select
        id="sprintSelect"
        aria-label="Select sprint"
        value={currentSprintId ?? ''}
        onChange={(e) => onSelect(e.target.value)}
      >
        {sprints.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name} ({s.start_date} to {s.end_date})
          </option>
        ))}
      </select>
    </div>
  );
}
