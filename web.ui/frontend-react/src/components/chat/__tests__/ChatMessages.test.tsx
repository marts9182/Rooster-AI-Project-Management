import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import ChatMessages from '../ChatMessages';
import type { Message } from '../../../api/chat';

const msgs: Message[] = [
  { id: 1, conversation_id: 1, role: 'user', content: 'hi', tool_calls: null, error_text: null, created_at: '' },
  { id: 2, conversation_id: 1, role: 'assistant', content: 'hello **world**',
    tool_calls: [{ tool: 'Read', args: { file_path: 'x' }, status: 'completed', ms: 12 }],
    error_text: null, created_at: '' },
];

describe('ChatMessages', () => {
  it('renders user + assistant content', () => {
    render(<ChatMessages messages={msgs} sendInFlight={false} />);
    expect(screen.getByText('hi')).toBeInTheDocument();
    expect(screen.getByText('world')).toBeInTheDocument();
  });
  it('renders tool-call details collapsible', () => {
    render(<ChatMessages messages={msgs} sendInFlight={false} />);
    expect(screen.getByText(/Read/)).toBeInTheDocument();
    expect(screen.getByText(/12ms/)).toBeInTheDocument();
  });
  it('shows loading dots when sendInFlight', () => {
    render(<ChatMessages messages={msgs} sendInFlight={true} />);
    expect(screen.getByTestId('chat-loading-dots')).toBeInTheDocument();
  });
});
