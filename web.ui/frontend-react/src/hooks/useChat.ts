import { useCallback, useEffect, useRef, useState } from 'react';
import {
  type Conversation,
  type Message,
  type ToolCall,
  listConversations as apiList,
  createConversation as apiCreate,
  getConversation as apiGet,
  renameConversation as apiRename,
  deleteConversation as apiDelete,
  sendMessage as apiSend,
  type SendHandle,
} from '../api/chat';

export type ChatState =
  | 'idle' | 'listening' | 'thinking' | 'responding' | 'tool-using' | 'done' | 'error';

export interface UseChatResult {
  conversations: Conversation[];
  currentConversation: Conversation | null;
  messages: Message[];
  state: ChatState;
  sendInFlight: boolean;
  error: string | null;
  selectConversation: (id: number) => Promise<void>;
  createNewConversation: () => Promise<Conversation>;
  sendMessage: (content: string) => Promise<void>;
  deleteConversation: (id: number) => Promise<void>;
  renameConversation: (id: number, title: string) => Promise<void>;
  setListening: (focused: boolean) => void;
}

const LS_LAST_CONV = 'last_chat_conversation_id';

export function useChat(): UseChatResult {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [currentConversation, setCurrentConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [state, setState] = useState<ChatState>('idle');
  const [sendInFlight, setSendInFlight] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const handleRef = useRef<SendHandle | null>(null);
  const toolHoldTimerRef = useRef<number | null>(null);

  const refreshConversations = useCallback(async () => {
    try {
      const list = await apiList();
      setConversations(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    void (async () => {
      await refreshConversations();
      const saved = localStorage.getItem(LS_LAST_CONV);
      if (saved) {
        const id = Number(saved);
        try {
          const conv = await apiGet(id);
          setCurrentConversation(conv);
          setMessages(conv.messages ?? []);
        } catch { /* conversation deleted; ignore */ }
      }
    })();
  }, [refreshConversations]);

  const selectConversation = useCallback(async (id: number) => {
    const conv = await apiGet(id);
    setCurrentConversation(conv);
    setMessages(conv.messages ?? []);
    localStorage.setItem(LS_LAST_CONV, String(id));
    setState('idle');
  }, []);

  const createNewConversation = useCallback(async () => {
    const conv = await apiCreate();
    await refreshConversations();
    await selectConversation(conv.id);
    return conv;
  }, [refreshConversations, selectConversation]);

  const deleteConversation = useCallback(async (id: number) => {
    await apiDelete(id);
    if (currentConversation?.id === id) {
      setCurrentConversation(null);
      setMessages([]);
      localStorage.removeItem(LS_LAST_CONV);
    }
    await refreshConversations();
  }, [currentConversation, refreshConversations]);

  const renameConversation = useCallback(async (id: number, title: string) => {
    await apiRename(id, title);
    await refreshConversations();
    if (currentConversation?.id === id) {
      setCurrentConversation({ ...currentConversation, title });
    }
  }, [currentConversation, refreshConversations]);

  const sendMessage = useCallback(async (content: string) => {
    // If there's no active conversation, create one inline. Use the local
    // `conv` reference for the immediate send — React state updates from
    // setCurrentConversation are async and aren't visible until the next render.
    let conv = currentConversation;
    if (!conv) {
      conv = await apiCreate();
      await refreshConversations();
      setCurrentConversation(conv);
      setMessages([]);
      localStorage.setItem(LS_LAST_CONV, String(conv.id));
    }
    const convId = conv.id;

    // Optimistic append the user message.
    const optimisticUser: Message = {
      id: -Date.now(),
      conversation_id: convId,
      role: 'user',
      content,
      tool_calls: null,
      error_text: null,
      created_at: new Date().toISOString(),
    };
    setMessages((m) => [...m, optimisticUser]);
    setSendInFlight(true);
    setState('thinking');
    setError(null);

    let assistantBuf = '';
    const collectedTools: ToolCall[] = [];

    const handle = apiSend(convId, content);
    handleRef.current = handle;
    handle.onChunk((text) => {
      assistantBuf += text;
      setState('responding');
      // Live-update an in-progress assistant bubble (id=-1 sentinel).
      setMessages((m) => {
        const others = m.filter((msg) => msg.id !== -1);
        return [
          ...others,
          {
            id: -1,
            conversation_id: convId,
            role: 'assistant',
            content: assistantBuf,
            tool_calls: collectedTools.length > 0 ? collectedTools : null,
            error_text: null,
            created_at: new Date().toISOString(),
          },
        ];
      });
    });
    handle.onToolCall((call) => {
      collectedTools.push(call);
      setState('tool-using');
      if (toolHoldTimerRef.current) clearTimeout(toolHoldTimerRef.current);
      toolHoldTimerRef.current = window.setTimeout(() => {
        setState((s) => (s === 'tool-using' ? 'responding' : s));
      }, 300);
    });
    handle.onError((e) => {
      setError(e.message);
      setState('error');
    });
    handle.onComplete(async () => {
      setState('done');
      setSendInFlight(false);
      // Reload the conversation from the server so we get DB-assigned ids.
      const fresh = await apiGet(convId);
      setMessages(fresh.messages ?? []);
      setCurrentConversation(fresh);
      // Settle to idle after 1 second.
      window.setTimeout(() => setState((s) => (s === 'done' ? 'idle' : s)), 1000);
    });
  }, [currentConversation, refreshConversations]);

  const setListening = useCallback((focused: boolean) => {
    setState((s) => {
      if (sendInFlight) return s;
      if (focused) return 'listening';
      if (s === 'listening') return 'idle';
      return s;
    });
  }, [sendInFlight]);

  return {
    conversations,
    currentConversation,
    messages,
    state,
    sendInFlight,
    error,
    selectConversation,
    createNewConversation,
    sendMessage,
    deleteConversation,
    renameConversation,
    setListening,
  };
}
