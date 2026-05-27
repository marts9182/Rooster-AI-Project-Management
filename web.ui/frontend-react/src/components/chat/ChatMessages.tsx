import ReactMarkdown from 'react-markdown';
import type { Message, ToolCall } from '../../api/chat';
import './chat.css';

interface Props {
  messages: Message[];
  sendInFlight: boolean;
}

function ToolCallDetail({ call }: { call: ToolCall }) {
  return (
    <details className="chat-tool-call">
      <summary>
        <code>{call.tool}</code>
        {typeof call.ms === 'number' && <span className="chat-tool-ms"> {call.ms}ms</span>}
        <span className="chat-tool-status"> {call.status}</span>
      </summary>
      {call.args && (
        <pre className="chat-tool-args">{JSON.stringify(call.args, null, 2)}</pre>
      )}
    </details>
  );
}

export default function ChatMessages({ messages, sendInFlight }: Props) {
  return (
    <div className="chat-messages" role="log" aria-live="polite">
      {messages.map((m) => (
        <div key={m.id} className={`chat-msg chat-msg-${m.role}`}>
          <div className="chat-msg-role">{m.role === 'user' ? 'You' : 'Claude'}</div>
          {m.role === 'assistant' ? (
            <div className="chat-msg-content">
              <ReactMarkdown>{m.content}</ReactMarkdown>
            </div>
          ) : (
            <div className="chat-msg-content">{m.content}</div>
          )}
          {m.tool_calls && m.tool_calls.length > 0 && (
            <div className="chat-tool-list">
              {m.tool_calls.map((c, i) => (
                <ToolCallDetail key={i} call={c} />
              ))}
            </div>
          )}
          {m.error_text && (
            <div className="chat-msg-error">⚠ {m.error_text}</div>
          )}
        </div>
      ))}
      {sendInFlight && (
        <div className="chat-loading-dots" data-testid="chat-loading-dots">
          <span /><span /><span />
        </div>
      )}
    </div>
  );
}
