import { useCallback, useEffect, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import './chat.css';

interface Props {
  onSend: (content: string) => void;
  onFocusChange: (focused: boolean) => void;
  disabled: boolean;
}

const MAX_ROWS = 8;
const LINE_HEIGHT_PX = 20;

export default function ChatComposer({ onSend, onFocusChange, disabled }: Props) {
  const [value, setValue] = useState('');
  const taRef = useRef<HTMLTextAreaElement | null>(null);

  const autoSize = useCallback(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    const max = LINE_HEIGHT_PX * MAX_ROWS;
    ta.style.height = Math.min(ta.scrollHeight, max) + 'px';
  }, []);

  useEffect(autoSize, [value, autoSize]);

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (disabled) return;
      const trimmed = value.trim();
      if (!trimmed) return;
      onSend(trimmed);
      setValue('');
    }
  };

  return (
    <div className="chat-composer">
      <textarea
        ref={taRef}
        className="chat-composer-textarea"
        placeholder="Type a message... (Enter to send, Shift+Enter for newline)"
        rows={1}
        value={value}
        disabled={disabled}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        onFocus={() => onFocusChange(true)}
        onBlur={() => onFocusChange(false)}
      />
      <button
        type="button"
        className="chat-composer-send"
        disabled={disabled || !value.trim()}
        onClick={() => {
          const trimmed = value.trim();
          if (!trimmed) return;
          onSend(trimmed);
          setValue('');
        }}
      >
        ↵
      </button>
    </div>
  );
}
