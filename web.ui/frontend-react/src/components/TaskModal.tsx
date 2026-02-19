import { useEffect, useRef, useState } from 'react';
import type { Task, Project, Comment } from '../types';
import { fetchComments } from '../services/api';
import { resolveAgentName } from '../agents';

interface Props {
  task: Task | null;
  projects: Project[];
  onClose: () => void;
}

export default function TaskModal({ task, projects, onClose }: Props) {
  const [comments, setComments] = useState<Comment[]>([]);
  const closeRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!task) return;
    let cancelled = false;
    fetchComments(task.id).then((c) => {
      if (!cancelled) setComments(c);
    });
    return () => { cancelled = true; };
  }, [task]);

  // Focus close button on open
  useEffect(() => {
    if (task) closeRef.current?.focus();
  }, [task]);

  // Escape to close
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (task) {
      window.addEventListener('keydown', handler);
      return () => window.removeEventListener('keydown', handler);
    }
  }, [task, onClose]);

  if (!task) return null;

  const project = projects.find((p) => p.id === task.project_id);

  const acLines = task.acceptance_criteria
    ? task.acceptance_criteria.split('\\n').filter((l) => l.trim())
    : [];

  return (
    <div
      className="modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="modal-content">
        <span
          className="close"
          role="button"
          tabIndex={0}
          aria-label="Close dialog"
          ref={closeRef}
          onClick={onClose}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onClose();
            }
          }}
        >
          &times;
        </span>

        <h2 id="modal-title">
          <b>{task.title || 'Untitled'}</b>
          {project && (
            <span className="item-project"> [{project.name}]</span>
          )}
        </h2>

        {task.description && (
          <>
            <b>Description:</b>
            <br />
            {task.description}
          </>
        )}

        {acLines.length > 0 && (
          <>
            <br /><br />
            <b>Acceptance Criteria:</b>
            <ul className="ac-list">
              {acLines.map((line, i) => (
                <li key={i}>{line.replace(/^\d+\.\s*/, '')}</li>
              ))}
            </ul>
          </>
        )}

        <div id="modalComments">
          {comments.length > 0
            ? comments.map((c, i) => (
                <div className="comment" key={i}>
                  <b>{resolveAgentName(c.from_agent || '')}:</b> {c.content || c.text || ''}
                </div>
              ))
            : <em>No comments</em>
          }
        </div>
      </div>
    </div>
  );
}
