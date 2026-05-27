import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { Highlight, themes } from 'prism-react-renderer';
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

export function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="chat-code-copy"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch {
          /* clipboard blocked — no-op */
        }
      }}
    >
      {copied ? 'Copied!' : 'Copy'}
    </button>
  );
}

const markdownComponents = {
  code({ className, children }: { className?: string; children?: React.ReactNode }) {
    const match = /language-(\w+)/.exec(className || '');
    const code = String(children).replace(/\n$/, '');
    // In react-markdown v10 the `inline` prop was removed. Inline code has no
    // language-* className and no embedded newlines; fenced blocks always have
    // a language class (defaulting to language-text via remark-parse).
    const isBlock = !!match || code.includes('\n');
    if (!isBlock) return <code className="chat-code-inline">{code}</code>;
    const lang = match ? match[1] : 'text';
    return (
      <div className="chat-code-block">
        <CopyButton text={code} />
        <Highlight code={code} language={lang} theme={themes.vsDark}>
          {({ className: hlClass, style, tokens, getLineProps, getTokenProps }) => (
            <pre className={hlClass} style={style}>
              {tokens.map((line, i) => (
                <div key={i} {...getLineProps({ line })}>
                  {line.map((token, k) => (
                    <span key={k} {...getTokenProps({ token })} />
                  ))}
                </div>
              ))}
            </pre>
          )}
        </Highlight>
      </div>
    );
  },
  pre({ children }: { children?: React.ReactNode }) {
    // Our code renderer returns its own <div><pre/></div>, so unwrap the
    // outer <pre> react-markdown would add by default.
    return <>{children}</>;
  },
};

export default function ChatMessages({ messages, sendInFlight }: Props) {
  return (
    <div className="chat-messages" role="log" aria-live="polite">
      {messages.map((m) => (
        <div key={m.id} className={`chat-msg chat-msg-${m.role}`}>
          <div className="chat-msg-role">{m.role === 'user' ? 'You' : 'Claude'}</div>
          {m.role === 'assistant' ? (
            <div className="chat-msg-content">
              <ReactMarkdown components={markdownComponents}>{m.content}</ReactMarkdown>
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
