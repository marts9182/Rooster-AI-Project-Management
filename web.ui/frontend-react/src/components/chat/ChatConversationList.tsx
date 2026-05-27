import { useState } from 'react';
import type { Conversation } from '../../api/chat';
import './chat.css';

interface Props {
  conversations: Conversation[];
  currentId: number | null;
  onSelect: (id: number) => void;
  onCreate: () => void;
  onRename: (id: number, title: string) => void;
  onDelete: (id: number) => void;
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export default function ChatConversationList({
  conversations, currentId, onSelect, onCreate, onRename, onDelete,
}: Props) {
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editValue, setEditValue] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

  return (
    <aside className="chat-conversation-list">
      <button type="button" className="chat-new-conv" onClick={onCreate}>
        + New conversation
      </button>
      <ul>
        {conversations.map((c) => (
          <li
            key={c.id}
            className={`chat-conv-item${c.id === currentId ? ' active' : ''}`}
          >
            {editingId === c.id ? (
              <input
                autoFocus
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onBlur={() => {
                  if (editValue.trim()) onRename(c.id, editValue.trim());
                  setEditingId(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    if (editValue.trim()) onRename(c.id, editValue.trim());
                    setEditingId(null);
                  } else if (e.key === 'Escape') {
                    setEditingId(null);
                  }
                }}
              />
            ) : (
              <button
                type="button"
                className="chat-conv-item-title"
                onClick={() => onSelect(c.id)}
                onDoubleClick={() => { setEditingId(c.id); setEditValue(c.title); }}
              >
                {c.title}
              </button>
            )}
            <div className="chat-conv-item-meta">{relativeTime(c.updated_at)}</div>
            <button
              type="button"
              className="chat-conv-item-delete"
              aria-label={`Delete ${c.title}`}
              onClick={() => setConfirmDeleteId(c.id)}
            >
              ×
            </button>
          </li>
        ))}
      </ul>
      {confirmDeleteId !== null && (
        <div className="chat-delete-modal" role="dialog">
          <p>Delete this conversation? Cannot be undone.</p>
          <button onClick={() => { onDelete(confirmDeleteId); setConfirmDeleteId(null); }}>
            Delete
          </button>
          <button onClick={() => setConfirmDeleteId(null)}>Cancel</button>
        </div>
      )}
    </aside>
  );
}
