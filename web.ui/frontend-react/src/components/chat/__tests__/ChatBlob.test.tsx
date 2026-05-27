import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import ChatBlob from '../ChatBlob';

describe('ChatBlob', () => {
  beforeEach(() => {
    // Polyfill rAF in jsdom: schedule via setTimeout so the rAF loop ticks.
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) =>
      setTimeout(() => cb(performance.now()), 16) as unknown as number,
    );
    vi.stubGlobal('cancelAnimationFrame', (id: number) => clearTimeout(id));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders an svg', () => {
    render(<ChatBlob size="sm" />);
    const svg = screen.getByTestId('chat-blob-svg');
    expect(svg.tagName.toLowerCase()).toBe('svg');
  });
  it('eventually fills in the path d via rAF', async () => {
    render(<ChatBlob size="sm" />);
    // jsdom doesn't tick rAF on its own — flush microtasks + a tick.
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });
    const path = screen.getByTestId('chat-blob-svg').querySelector('path');
    expect(path?.getAttribute('d')).toMatch(/^M /);
  });
  it('calls onClick when clicked', () => {
    const onClick = vi.fn();
    render(<ChatBlob size="sm" onClick={onClick} />);
    screen.getByTestId('chat-blob-svg').dispatchEvent(
      new MouseEvent('click', { bubbles: true }),
    );
    expect(onClick).toHaveBeenCalled();
  });
});
