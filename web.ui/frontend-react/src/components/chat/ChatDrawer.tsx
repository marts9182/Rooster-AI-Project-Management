import { useEffect } from 'react';
import { useChat } from '../../hooks/useChat';
import ChatMessages from './ChatMessages';
import ChatComposer from './ChatComposer';
import ChatBlob from './ChatBlob';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

const LS_DRAWER_OPEN = 'chat_drawer_open';

export default function ChatDrawer({ isOpen, onClose }: Props) {
  const chat = useChat();

  useEffect(() => {
    localStorage.setItem(LS_DRAWER_OPEN, isOpen ? '1' : '0');
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <>
      <div className="chat-drawer-overlay" onClick={onClose} aria-hidden="true" data-testid="chat-drawer-overlay" />
      <div className="chat-drawer" role="dialog" aria-label="Claude chat">
        <header className="chat-drawer-header">
          <div className="chat-drawer-blob-placeholder" data-testid="chat-drawer-blob-placeholder">
            <ChatBlob size="md" />
          </div>
          <select
            value={chat.currentConversation?.id ?? ''}
            onChange={(e) => {
              const v = e.target.value;
              if (v === '__new__') void chat.createNewConversation();
              else if (v) void chat.selectConversation(Number(v));
            }}
          >
            <option value="">— select a conversation —</option>
            <option value="__new__">+ New conversation</option>
            {chat.conversations.map((c) => (
              <option key={c.id} value={c.id}>{c.title}</option>
            ))}
          </select>
          <button type="button" onClick={onClose} aria-label="Close chat">×</button>
        </header>
        <div className="chat-drawer-body">
          <ChatMessages messages={chat.messages} sendInFlight={chat.sendInFlight} />
          <ChatComposer
            onSend={(c) => { void chat.sendMessage(c); }}
            onFocusChange={chat.setListening}
            disabled={chat.sendInFlight}
          />
        </div>
      </div>
    </>
  );
}
