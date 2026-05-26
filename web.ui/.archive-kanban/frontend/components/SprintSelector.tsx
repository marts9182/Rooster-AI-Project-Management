import type { Sprint } from '../types';

interface Props {
  sprints: Sprint[];
  currentSprintId: string | null;
  onSelect: (id: string) => void;
  /** Called when the user wants to view/generate the retrospective for a sprint. */
  onGenerateRetro?: (sprintId: string) => void;
}

export default function SprintSelector({ sprints, currentSprintId, onSelect, onGenerateRetro }: Props) {
  const current = sprints.find((s) => s.id === currentSprintId);
  const canRetro =
    !!current &&
    !!onGenerateRetro &&
    (current.status === 'completed' || current.status === 'closed');

  return (
    <div className="sprint-select-container" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
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
      {onGenerateRetro && (
        <button
          type="button"
          disabled={!canRetro}
          onClick={() => current && onGenerateRetro(current.id)}
          title={canRetro ? 'Generate retrospective for this sprint' : 'Available once the sprint is completed'}
          style={{
            padding: '4px 10px',
            border: '1px solid #888',
            borderRadius: 4,
            background: canRetro ? '#1976d2' : '#aaa',
            color: '#fff',
            cursor: canRetro ? 'pointer' : 'not-allowed',
            fontSize: '0.85em',
          }}
        >
          📋 Retro
        </button>
      )}
    </div>
  );
}
