import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  listConversations,
  createConversation,
  getConversation,
  renameConversation,
  deleteConversation,
} from '../chat';

beforeEach(() => { vi.restoreAllMocks(); });

describe('api/chat.ts', () => {
  it('listConversations GETs and returns conversations array', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ conversations: [{ id: 1, title: 'a' }] }), { status: 200 }),
    );
    const out = await listConversations();
    expect(out).toEqual([{ id: 1, title: 'a' }]);
  });
  it('createConversation POSTs with optional title', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ conversation: { id: 2, title: 'X' } }), { status: 200 }),
    );
    const conv = await createConversation({ title: 'X' });
    expect(conv.title).toBe('X');
    expect(fetchSpy).toHaveBeenCalledWith('/api/chat/conversations', expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ title: 'X' }),
    }));
  });
  it('getConversation returns conversation with messages', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({
        conversation: { id: 1, title: 't', messages: [] },
      }), { status: 200 }),
    );
    const conv = await getConversation(1);
    expect(conv.messages).toEqual([]);
  });
  it('renameConversation PATCHes', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ conversation: { id: 1, title: 'New' } }), { status: 200 }),
    );
    const conv = await renameConversation(1, 'New');
    expect(conv.title).toBe('New');
  });
  it('deleteConversation DELETEs', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );
    await deleteConversation(1);
    expect(fetchSpy).toHaveBeenCalledWith('/api/chat/conversations/1', { method: 'DELETE' });
  });
});
