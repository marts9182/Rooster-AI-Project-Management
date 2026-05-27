import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useChatBlobState } from '../useChatBlob';
import type { ChatState } from '../useChat';

describe('useChatBlobState', () => {
  it('maps chat state to blob mood', () => {
    const cases: Array<[ChatState, string]> = [
      ['idle', 'idle'],
      ['listening', 'listening'],
      ['thinking', 'thinking'],
      ['responding', 'responding'],
      ['tool-using', 'tool-using'],
      ['done', 'done'],
      ['error', 'error'],
    ];
    for (const [s, expected] of cases) {
      const { result } = renderHook(() => useChatBlobState({ chatState: s, toolEventCount: 0 }));
      expect(result.current.mood).toBe(expected);
    }
  });
  it('bumps tickKey when toolEventCount increases', () => {
    const { result, rerender } = renderHook(
      ({ count }) => useChatBlobState({ chatState: 'tool-using', toolEventCount: count }),
      { initialProps: { count: 0 } },
    );
    const k0 = result.current.tickKey;
    rerender({ count: 1 });
    expect(result.current.tickKey).not.toBe(k0);
  });
});
