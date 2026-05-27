import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useChat } from '../useChat';

beforeEach(() => { vi.restoreAllMocks(); });

describe('useChat', () => {
  it('starts with empty conversations and idle state', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ conversations: [] }), { status: 200 }),
    );
    const { result } = renderHook(() => useChat());
    await waitFor(() => expect(result.current.conversations).toEqual([]));
    expect(result.current.state).toBe('idle');
  });

  it('createNewConversation POSTs and selects the new conversation', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({ conversations: [] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(
        JSON.stringify({ conversation: { id: 7, title: 'New conversation', messages: [] } }),
        { status: 200 },
      ))
      .mockResolvedValueOnce(new Response(JSON.stringify({ conversations: [
        { id: 7, title: 'New conversation', claude_session_id: null, created_at: '', updated_at: '' },
      ] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(
        JSON.stringify({ conversation: { id: 7, title: 'New conversation', claude_session_id: null, created_at: '', updated_at: '', messages: [] } }),
        { status: 200 },
      ));
    const { result } = renderHook(() => useChat());
    await act(async () => { await result.current.createNewConversation(); });
    expect(result.current.currentConversation?.id).toBe(7);
    expect(fetchSpy).toHaveBeenCalled();
  });

  it('restores last conversation from localStorage on mount', async () => {
    localStorage.setItem('last_chat_conversation_id', '42');
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({ conversations: [] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        conversation: { id: 42, title: 'Restored', claude_session_id: null, created_at: '', updated_at: '', messages: [] },
      }), { status: 200 }));
    const { result } = renderHook(() => useChat());
    await waitFor(() => expect(result.current.currentConversation?.id).toBe(42));
    localStorage.removeItem('last_chat_conversation_id');
  });
});
