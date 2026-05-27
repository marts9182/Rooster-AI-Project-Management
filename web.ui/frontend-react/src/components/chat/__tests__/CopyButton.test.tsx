import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CopyButton } from '../ChatMessages';

describe('CopyButton', () => {
  it('writes to clipboard and shows Copied! then reverts', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    render(<CopyButton text="hi" />);
    const btn = screen.getByRole('button', { name: 'Copy' });
    fireEvent.click(btn);
    expect(writeText).toHaveBeenCalledWith('hi');
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Copied!' })).toBeTruthy();
    });
  });
});
