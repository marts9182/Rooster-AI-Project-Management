import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { ChatDrawerProvider, useChatDrawer } from '../ChatDrawerContext';

beforeEach(() => { localStorage.clear(); });

describe('ChatDrawerContext', () => {
  it('open() sets isOpen true and persists to localStorage', () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <ChatDrawerProvider>{children}</ChatDrawerProvider>
    );
    const { result } = renderHook(() => useChatDrawer(), { wrapper });
    expect(result.current.isOpen).toBe(false);
    act(() => result.current.open());
    expect(result.current.isOpen).toBe(true);
    expect(localStorage.getItem('chat_drawer_open')).toBe('1');
  });
  it('toggle flips state', () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <ChatDrawerProvider>{children}</ChatDrawerProvider>
    );
    const { result } = renderHook(() => useChatDrawer(), { wrapper });
    act(() => result.current.toggle());
    expect(result.current.isOpen).toBe(true);
    act(() => result.current.toggle());
    expect(result.current.isOpen).toBe(false);
  });
  it('initial open state reads from localStorage', () => {
    localStorage.setItem('chat_drawer_open', '1');
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <ChatDrawerProvider>{children}</ChatDrawerProvider>
    );
    const { result } = renderHook(() => useChatDrawer(), { wrapper });
    expect(result.current.isOpen).toBe(true);
  });
});
