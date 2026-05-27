import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useChat } from '../../hooks/useChat';
import { useChatBlobState, type ChatBlobState } from '../../hooks/useChatBlob';

const Ctx = createContext<ChatBlobState | null>(null);

export function ChatBlobProvider({ children }: { children: ReactNode }) {
  const { state, messages } = useChat();
  const toolCountRef = useRef(0);
  const [toolEventCount, setToolEventCount] = useState(0);

  useEffect(() => {
    const liveTools = messages.reduce(
      (acc, m) => acc + (m.tool_calls?.length ?? 0), 0,
    );
    if (liveTools !== toolCountRef.current) {
      toolCountRef.current = liveTools;
      setToolEventCount(liveTools);
    }
  }, [messages]);

  const value = useChatBlobState({ chatState: state, toolEventCount });
  const memo = useMemo(() => value, [value.mood, value.tickKey]);
  return <Ctx.Provider value={memo}>{children}</Ctx.Provider>;
}

export function useChatBlobContext(): ChatBlobState {
  const v = useContext(Ctx);
  // Default to idle when used outside the provider (graceful fallback for tests).
  return v ?? { mood: 'idle', tickKey: 0 };
}
