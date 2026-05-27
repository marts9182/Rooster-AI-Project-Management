import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import Chat from '../Chat';

vi.mock('../../hooks/useChat', () => ({
  useChat: () => ({
    conversations: [
      { id: 1, title: 'Sudoku rework', claude_session_id: null, created_at: '', updated_at: '' },
    ],
    currentConversation: { id: 1, title: 'Sudoku rework', claude_session_id: null, created_at: '', updated_at: '' },
    messages: [
      { id: 1, conversation_id: 1, role: 'user', content: 'hi', tool_calls: null, error_text: null, created_at: '' },
    ],
    state: 'idle',
    sendInFlight: false,
    error: null,
    selectConversation: vi.fn(),
    createNewConversation: vi.fn(),
    sendMessage: vi.fn(),
    deleteConversation: vi.fn(),
    renameConversation: vi.fn(),
    setListening: vi.fn(),
  }),
}));

describe('Chat page', () => {
  it('renders conversation list + messages + composer + blob placeholder', () => {
    render(<Chat />);
    expect(screen.getByText('Sudoku rework')).toBeInTheDocument();
    expect(screen.getByText('hi')).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Type a message/i)).toBeInTheDocument();
    expect(screen.getByTestId('chat-page-blob-placeholder')).toBeInTheDocument();
  });
});
