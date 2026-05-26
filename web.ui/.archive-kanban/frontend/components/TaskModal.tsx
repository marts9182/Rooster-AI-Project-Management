import { useEffect, useRef, useState } from 'react';
import type { Task, Project, Comment } from '../types';
import { fetchComments, saveComments, type GenerateImageResponse } from '../services/api';
import { resolveAgentName } from '../agents';
import ImageGenPanel from './ImageGenPanel';

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

  // Handle both real newlines and the legacy escaped "\n" sequences that
  // some seed data still contains, so multi-line criteria render properly.
  const acLines = task.acceptance_criteria
    ? task.acceptance_criteria.split(/\r?\n|\\n/).filter((l) => l.trim())
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
                  <b>{resolveAgentName(c.from_agent || '')}:</b>{' '}
                  <CommentBody content={c.content || ''} />
                </div>
              ))
            : <em>No comments</em>
          }
        </div>

        <hr />

        <ImageGenPanel
          taskId={task.id}
          onGenerated={async (img: GenerateImageResponse) => {
            // Persist the image as a comment so it shows up next time the
            // modal opens. The "user" agent isn't a real persona; resolveAgentName
            // gracefully falls through to the raw id, which renders fine here.
            const comment: Comment = {
              id: `msg-img-${task.id}-${Date.now()}`,
              from_agent: 'user',
              content: `🎨 Generated image\n\n![${img.filename}](${img.url})`,
              task_id: task.id,
              timestamp: new Date().toISOString(),
              type: 'image',
            };
            try {
              await saveComments(task.id, [comment]);
              setComments((prev) => [...prev, comment]);
            } catch {
              // Persistence failure is non-fatal — the image is still on disk
              // at img.url; the user just won't see it after a refresh.
              setComments((prev) => [...prev, comment]);
            }
          }}
        />
      </div>
    </div>
  );
}

/**
 * Render comment text with inline markdown image support so generated images
 * show up directly in the comment stream. Anything that isn't a recognized
 * image link renders as plain text — no full markdown engine needed for now.
 */
function CommentBody({ content }: { content: string }) {
  const parts = content.split(/(!\[[^\]]*\]\([^)]+\))/g);
  return (
    <>
      {parts.map((part, i) => {
        const m = part.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
        if (m) {
          return (
            <div key={i} className="comment-image">
              <img src={m[2]} alt={m[1] || 'generated image'} />
            </div>
          );
        }
        return <span key={i}>{part}</span>;
      })}
    </>
  );
}
