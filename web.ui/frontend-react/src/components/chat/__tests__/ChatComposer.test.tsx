import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ChatComposer from '../ChatComposer';

describe('ChatComposer', () => {
  it('Enter calls onSend with trimmed content', async () => {
    const onSend = vi.fn();
    render(<ChatComposer onSend={onSend} disabled={false} onFocusChange={() => {}} />);
    const ta = screen.getByPlaceholderText(/Type a message/i);
    await userEvent.type(ta, 'hello{Enter}');
    expect(onSend).toHaveBeenCalledWith('hello');
  });
  it('Shift+Enter inserts a newline and does not send', async () => {
    const onSend = vi.fn();
    render(<ChatComposer onSend={onSend} disabled={false} onFocusChange={() => {}} />);
    const ta = screen.getByPlaceholderText(/Type a message/i) as HTMLTextAreaElement;
    await userEvent.type(ta, 'line1{Shift>}{Enter}{/Shift}line2');
    expect(onSend).not.toHaveBeenCalled();
    expect(ta.value).toContain('line1\nline2');
  });
  it('disabled blocks Enter sending', async () => {
    const onSend = vi.fn();
    render(<ChatComposer onSend={onSend} disabled={true} onFocusChange={() => {}} />);
    const ta = screen.getByPlaceholderText(/Type a message/i);
    await userEvent.type(ta, 'hi{Enter}');
    expect(onSend).not.toHaveBeenCalled();
  });
});
