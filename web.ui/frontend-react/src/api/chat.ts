import { ApiError } from './kdp';

export interface ToolCall {
  tool: string;
  id?: string;
  args?: Record<string, unknown>;
  status: 'started' | 'completed';
  ms?: number;
}

export interface Message {
  id: number;
  conversation_id: number;
  role: 'user' | 'assistant' | 'tool';
  content: string;
  tool_calls: ToolCall[] | null;
  error_text: string | null;
  created_at: string;
}

export interface Conversation {
  id: number;
  title: string;
  claude_session_id: string | null;
  created_at: string;
  updated_at: string;
  messages?: Message[];
}

async function throwForStatus(r: Response, label: string): Promise<never> {
  let body: unknown = null;
  try { body = await r.json(); } catch { /* ignore */ }
  throw new ApiError(`${label}: ${r.status}`, r.status, body);
}

export async function listConversations(): Promise<Conversation[]> {
  const r = await fetch('/api/chat/conversations');
  if (!r.ok) await throwForStatus(r, 'listConversations');
  const data = (await r.json()) as { conversations: Conversation[] };
  return data.conversations;
}

export async function createConversation(args: { title?: string } = {}): Promise<Conversation> {
  const r = await fetch('/api/chat/conversations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: args.title }),
  });
  if (!r.ok) await throwForStatus(r, 'createConversation');
  return ((await r.json()) as { conversation: Conversation }).conversation;
}

export async function getConversation(id: number): Promise<Conversation> {
  const r = await fetch(`/api/chat/conversations/${id}`);
  if (!r.ok) await throwForStatus(r, 'getConversation');
  return ((await r.json()) as { conversation: Conversation }).conversation;
}

export async function renameConversation(id: number, title: string): Promise<Conversation> {
  const r = await fetch(`/api/chat/conversations/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title }),
  });
  if (!r.ok) await throwForStatus(r, 'renameConversation');
  return ((await r.json()) as { conversation: Conversation }).conversation;
}

export async function deleteConversation(id: number): Promise<void> {
  const r = await fetch(`/api/chat/conversations/${id}`, { method: 'DELETE' });
  if (!r.ok) await throwForStatus(r, 'deleteConversation');
}

export interface SendHandle {
  onChunk(cb: (text: string) => void): SendHandle;
  onToolCall(cb: (call: ToolCall) => void): SendHandle;
  onError(cb: (err: { code: string; message: string }) => void): SendHandle;
  onComplete(cb: (info: { message_id: number; tool_call_count: number; total_ms: number }) => void): SendHandle;
  close(): void;
}

/**
 * Posts a user message and returns a handle subscribed to the SSE stream.
 * Uses `fetch` to POST (so we send the body) and a manual ReadableStream
 * reader to parse SSE — EventSource doesn't support POST bodies.
 */
export function sendMessage(conversationId: number, content: string): SendHandle {
  const chunkCbs: Array<(text: string) => void> = [];
  const toolCbs: Array<(c: ToolCall) => void> = [];
  const errCbs: Array<(e: { code: string; message: string }) => void> = [];
  const completeCbs: Array<(i: { message_id: number; tool_call_count: number; total_ms: number }) => void> = [];

  const ctrl = new AbortController();

  void (async () => {
    try {
      const r = await fetch(`/api/chat/conversations/${conversationId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
        signal: ctrl.signal,
      });
      if (!r.body) {
        errCbs.forEach((cb) => cb({ code: 'no_body', message: 'no SSE body' }));
        return;
      }
      const reader = r.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let idx;
        while ((idx = buf.indexOf('\n\n')) >= 0) {
          const block = buf.slice(0, idx);
          buf = buf.slice(idx + 2);
          if (!block.startsWith('event:')) continue;
          const [evLine, dataLine] = block.split('\n');
          const event = evLine.slice('event: '.length).trim();
          const data = JSON.parse(dataLine.slice('data: '.length));
          if (event === 'chunk') chunkCbs.forEach((cb) => cb(data.text));
          else if (event === 'tool-call') toolCbs.forEach((cb) => cb(data));
          else if (event === 'error') errCbs.forEach((cb) => cb(data));
          else if (event === 'message-complete') completeCbs.forEach((cb) => cb(data));
        }
      }
    } catch (err) {
      if (!ctrl.signal.aborted) {
        errCbs.forEach((cb) => cb({
          code: 'transport',
          message: err instanceof Error ? err.message : String(err),
        }));
      }
    }
  })();

  const handle: SendHandle = {
    onChunk(cb) { chunkCbs.push(cb); return handle; },
    onToolCall(cb) { toolCbs.push(cb); return handle; },
    onError(cb) { errCbs.push(cb); return handle; },
    onComplete(cb) { completeCbs.push(cb); return handle; },
    close() { ctrl.abort(); },
  };
  return handle;
}
