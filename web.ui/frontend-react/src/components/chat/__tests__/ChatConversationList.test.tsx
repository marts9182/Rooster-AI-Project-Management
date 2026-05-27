import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ChatConversationList from '../ChatConversationList';
import type { Conversation } from '../../../api/chat';

const items: Conversation[] = [
  { id: 1, title: 'Sudoku rework', claude_session_id: null,
    created_at: '2026-05-26T10:00:00Z', updated_at: '2026-05-27T09:00:00Z' },
  { id: 2, title: 'Etsy debug', claude_session_id: null,
    created_at: '2026-05-25T10:00:00Z', updated_at: '2026-05-26T09:00:00Z' },
];

describe('ChatConversationList', () => {
  it('renders titles', () => {
    render(<ChatConversationList conversations={items} currentId={1}
      onSelect={() => {}} onCreate={() => {}} onRename={() => {}} onDelete={() => {}} />);
    expect(screen.getByText('Sudoku rework')).toBeInTheDocument();
    expect(screen.getByText('Etsy debug')).toBeInTheDocument();
  });
  it('clicking + New conversation fires onCreate', async () => {
    const onCreate = vi.fn();
    render(<ChatConversationList conversations={items} currentId={1}
      onSelect={() => {}} onCreate={onCreate} onRename={() => {}} onDelete={() => {}} />);
    await userEvent.click(screen.getByText(/New conversation/i));
    expect(onCreate).toHaveBeenCalled();
  });
  it('selecting an item fires onSelect(id)', async () => {
    const onSelect = vi.fn();
    render(<ChatConversationList conversations={items} currentId={1}
      onSelect={onSelect} onCreate={() => {}} onRename={() => {}} onDelete={() => {}} />);
    await userEvent.click(screen.getByText('Etsy debug'));
    expect(onSelect).toHaveBeenCalledWith(2);
  });
});
