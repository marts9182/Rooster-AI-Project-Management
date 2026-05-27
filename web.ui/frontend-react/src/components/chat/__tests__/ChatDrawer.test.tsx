import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ChatDrawer from '../ChatDrawer';

vi.mock('../../../hooks/useChat', () => ({
  useChat: () => ({
    conversations: [],
    currentConversation: null,
    messages: [],
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

beforeEach(() => { localStorage.clear(); });

describe('ChatDrawer', () => {
  it('renders nothing when isOpen=false', () => {
    const { container } = render(<ChatDrawer isOpen={false} onClose={() => {}} />);
    expect(container.firstChild).toBeNull();
  });
  it('renders messages + composer when isOpen=true', () => {
    render(<ChatDrawer isOpen={true} onClose={() => {}} />);
    expect(screen.getByPlaceholderText(/Type a message/i)).toBeInTheDocument();
  });
  it('Escape calls onClose', async () => {
    const onClose = vi.fn();
    render(<ChatDrawer isOpen={true} onClose={onClose} />);
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalled();
  });
  it('clicking overlay calls onClose', async () => {
    const onClose = vi.fn();
    render(<ChatDrawer isOpen={true} onClose={onClose} />);
    await userEvent.click(screen.getByTestId('chat-drawer-overlay'));
    expect(onClose).toHaveBeenCalled();
  });
});
