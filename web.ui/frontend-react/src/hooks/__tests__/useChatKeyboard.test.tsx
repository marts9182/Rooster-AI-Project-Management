import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ChatDrawerProvider, useChatDrawer } from '../../components/chat/ChatDrawerContext';
import { useChatKeyboard } from '../useChatKeyboard';

beforeEach(() => { localStorage.clear(); });

function Harness() {
  useChatKeyboard();
  const { isOpen } = useChatDrawer();
  return <div data-testid="open-state">{isOpen ? 'open' : 'closed'}</div>;
}

describe('useChatKeyboard', () => {
  it('Ctrl+K toggles the drawer', async () => {
    render(
      <ChatDrawerProvider>
        <Harness />
      </ChatDrawerProvider>,
    );
    expect(screen.getByTestId('open-state').textContent).toBe('closed');
    await userEvent.keyboard('{Control>}k{/Control}');
    expect(screen.getByTestId('open-state').textContent).toBe('open');
    await userEvent.keyboard('{Control>}k{/Control}');
    expect(screen.getByTestId('open-state').textContent).toBe('closed');
  });

  it('Escape closes when open', async () => {
    localStorage.setItem('chat_drawer_open', '1');
    render(
      <ChatDrawerProvider>
        <Harness />
      </ChatDrawerProvider>,
    );
    expect(screen.getByTestId('open-state').textContent).toBe('open');
    await userEvent.keyboard('{Escape}');
    expect(screen.getByTestId('open-state').textContent).toBe('closed');
  });
});
