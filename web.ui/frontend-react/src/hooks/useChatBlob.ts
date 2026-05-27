import { useMemo } from 'react';
import type { ChatState } from './useChat';

export type BlobMood = ChatState;

export interface ChatBlobState {
  mood: BlobMood;
  tickKey: number;
}

export function useChatBlobState({
  chatState, toolEventCount,
}: { chatState: ChatState; toolEventCount: number }): ChatBlobState {
  return useMemo(() => ({
    mood: chatState,
    tickKey: toolEventCount,
  }), [chatState, toolEventCount]);
}
