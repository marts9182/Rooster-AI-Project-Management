export type PinViewMode = 'week' | 'month' | 'list';

interface Props {
  mode: PinViewMode;
  onChange: (mode: PinViewMode) => void;
}

export default function PinterestViewToggle({ mode, onChange }: Props) {
  return (
    <div role="group" aria-label="View mode" style={{ display: 'inline-flex', gap: 4 }}>
      {(['week', 'month', 'list'] as const).map((m) => (
        <button
          key={m}
          type="button"
          aria-pressed={mode === m}
          onClick={() => onChange(m)}
          style={{
            padding: '4px 10px',
            background: mode === m ? 'var(--accent)' : 'transparent',
            color: mode === m ? 'var(--accent-fg)' : 'var(--fg)',
            border: '1px solid var(--border)',
            borderRadius: 4,
            cursor: 'pointer',
          }}
        >
          {m[0].toUpperCase() + m.slice(1)}
        </button>
      ))}
    </div>
  );
}
