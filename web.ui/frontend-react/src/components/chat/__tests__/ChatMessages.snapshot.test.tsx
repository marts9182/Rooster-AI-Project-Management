import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import ChatMessages from '../ChatMessages';
import type { Message } from '../../../api/chat';

describe('ChatMessages syntax highlighting', () => {
  it('renders a fenced code block with token spans', () => {
    const m: Message[] = [{
      id: 1, conversation_id: 1, role: 'assistant',
      content: '```typescript\nconst x = 1;\n```',
      tool_calls: null, error_text: null, created_at: '',
    }];
    const { container } = render(<ChatMessages messages={m} sendInFlight={false} />);
    expect(container.querySelector('.chat-code-block pre')).toBeTruthy();
    expect(container.innerHTML).toMatch(/class="[^"]*token/);
  });

  it('renders inline `code` as chat-code-inline', () => {
    const m: Message[] = [{
      id: 1, conversation_id: 1, role: 'assistant',
      content: 'use `foo()` to do the thing',
      tool_calls: null, error_text: null, created_at: '',
    }];
    const { container } = render(<ChatMessages messages={m} sendInFlight={false} />);
    expect(container.querySelector('.chat-code-inline')).toBeTruthy();
  });
});
