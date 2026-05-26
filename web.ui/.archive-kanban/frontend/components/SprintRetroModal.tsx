import { useEffect, useRef, useState } from 'react';
import type { Sprint, RetroAnalytics } from '../types';
import { generateRetro } from '../services/api';

interface Props {
  sprintId: string;
  sprints: Sprint[];
  onClose: () => void;
}

interface RetroState {
  loading: boolean;
  error: string | null;
  content: string | null;
  analytics: RetroAnalytics | null;
}

export default function SprintRetroModal({ sprintId, sprints, onClose }: Props) {
  const [state, setState] = useState<RetroState>({
    loading: true,
    error: null,
    content: null,
    analytics: null,
  });
  const closeRef = useRef<HTMLButtonElement>(null);

  const sprint = sprints.find((s) => s.id === sprintId);

  useEffect(() => {
    let cancelled = false;
    setState({ loading: true, error: null, content: null, analytics: null });
    generateRetro(sprintId)
      .then((res) => {
        if (cancelled) return;
        setState({
          loading: false,
          error: null,
          content: res.content,
          analytics: res.analytics,
        });
      })
      .catch((err) => {
        if (cancelled) return;
        setState({
          loading: false,
          error: err instanceof Error ? err.message : String(err),
          content: null,
          analytics: null,
        });
      });
    return () => {
      cancelled = true;
    };
  }, [sprintId]);

  useEffect(() => {
    closeRef.current?.focus();
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div
      className="modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="retro-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.4)',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        zIndex: 1000,
        padding: '40px 20px',
        overflowY: 'auto',
      }}
    >
      <div
        className="modal-content retro-modal"
        style={{
          background: '#fff',
          borderRadius: 8,
          maxWidth: 720,
          width: '100%',
          padding: '24px 28px',
          boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 id="retro-modal-title" style={{ margin: 0 }}>
            📋 Sprint Retrospective{sprint ? ` — ${sprint.name}` : ''}
          </h2>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close retrospective"
            style={{
              background: 'transparent',
              border: 'none',
              fontSize: 24,
              cursor: 'pointer',
              padding: '0 8px',
            }}
          >
            ×
          </button>
        </div>

        {state.loading && <p style={{ color: '#666' }}>Generating retrospective…</p>}

        {state.error && (
          <div role="alert" style={{ color: '#d32f2f', marginTop: 16 }}>
            <strong>Failed to generate retrospective:</strong> {state.error}
          </div>
        )}

        {state.content && (
          <div className="retro-content" style={{ marginTop: 16 }}>
            <pre
              style={{
                whiteSpace: 'pre-wrap',
                fontFamily: 'inherit',
                fontSize: '0.95em',
                lineHeight: 1.5,
                background: '#f7f7f7',
                padding: '14px 16px',
                borderRadius: 6,
                margin: 0,
              }}
            >
              {state.content}
            </pre>
          </div>
        )}

        {state.analytics && (
          <details style={{ marginTop: 16 }}>
            <summary style={{ cursor: 'pointer', fontWeight: 600 }}>Analytics (raw)</summary>
            <pre
              style={{
                fontSize: '0.8em',
                background: '#f7f7f7',
                padding: 12,
                borderRadius: 4,
                overflowX: 'auto',
              }}
            >
              {JSON.stringify(state.analytics, null, 2)}
            </pre>
          </details>
        )}
      </div>
    </div>
  );
}
