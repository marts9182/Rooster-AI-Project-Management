import { useChat } from '../hooks/useChat';
import ChatConversationList from '../components/chat/ChatConversationList';
import ChatMessages from '../components/chat/ChatMessages';
import ChatComposer from '../components/chat/ChatComposer';

export default function Chat() {
  const chat = useChat();

  return (
    <div className="chat-page">
      <ChatConversationList
        conversations={chat.conversations}
        currentId={chat.currentConversation?.id ?? null}
        onSelect={chat.selectConversation}
        onCreate={() => { void chat.createNewConversation(); }}
        onRename={(id, title) => { void chat.renameConversation(id, title); }}
        onDelete={(id) => { void chat.deleteConversation(id); }}
      />
      <section className="chat-page-main">
        <ChatMessages messages={chat.messages} sendInFlight={chat.sendInFlight} />
        <ChatComposer
          onSend={(c) => { void chat.sendMessage(c); }}
          onFocusChange={chat.setListening}
          disabled={chat.sendInFlight}
        />
      </section>
      <aside className="chat-page-blob" data-testid="chat-page-blob-placeholder">
        {/* Phase 4 mounts <ChatBlob size="lg" /> here. */}
        <div className="chat-blob-placeholder" style={{ width: 200, height: 200, borderRadius: '50%', background: '#1F4F66' }} />
      </aside>
    </div>
  );
}
