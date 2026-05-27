import { useChat } from '../hooks/useChat';
import ChatConversationList from '../components/chat/ChatConversationList';
import ChatMessages from '../components/chat/ChatMessages';
import ChatComposer from '../components/chat/ChatComposer';
import ChatBlob from '../components/chat/ChatBlob';

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
        <ChatBlob size="lg" />
      </aside>
    </div>
  );
}
