import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSseEvents } from '../hooks/useSseEvents';

interface FakeListener {
  (e: MessageEvent): void;
}

class FakeEventSource {
  url: string;
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  private listeners: Map<string, Set<FakeListener>> = new Map();
  static last: FakeEventSource | null = null;

  constructor(url: string) {
    this.url = url;
    FakeEventSource.last = this;
  }

  addEventListener(kind: string, fn: FakeListener) {
    if (!this.listeners.has(kind)) this.listeners.set(kind, new Set());
    this.listeners.get(kind)!.add(fn);
  }

  removeEventListener(kind: string, fn: FakeListener) {
    this.listeners.get(kind)?.delete(fn);
  }

  close() {
    this.listeners.clear();
  }

  // Test helper — simulates an event arriving on a named channel.
  emit(kind: string, data: unknown) {
    const ev = { data: JSON.stringify(data) } as MessageEvent;
    for (const fn of this.listeners.get(kind) ?? []) fn(ev);
  }
}

describe('useSseEvents', () => {
  let originalES: typeof EventSource | undefined;

  beforeEach(() => {
    originalES = (globalThis as unknown as { EventSource?: typeof EventSource }).EventSource;
    (globalThis as unknown as { EventSource: unknown }).EventSource = FakeEventSource;
  });

  afterEach(() => {
    (globalThis as unknown as { EventSource: unknown }).EventSource = originalES;
    FakeEventSource.last = null;
    vi.restoreAllMocks();
  });

  it('opens an EventSource against /api/events and reports connected:true on onopen', () => {
    const { result } = renderHook(() => useSseEvents());
    expect(FakeEventSource.last).not.toBeNull();
    expect(FakeEventSource.last!.url).toBe('/api/events');
    expect(result.current.connected).toBe(false);
    act(() => {
      FakeEventSource.last!.onopen?.();
    });
    expect(result.current.connected).toBe(true);
  });

  it('updates lastEvent when a channel message arrives', () => {
    const { result } = renderHook(() => useSseEvents());
    act(() => {
      FakeEventSource.last!.emit('kdp:new-book', {
        payload: { slug: 'foo' },
        occurred_at: '2026-05-26T00:00:00Z',
      });
    });
    expect(result.current.lastEvent).toEqual({
      kind: 'kdp:new-book',
      payload: { slug: 'foo' },
      occurred_at: '2026-05-26T00:00:00Z',
    });
  });

  it('sets connected:false on EventSource error', () => {
    const { result } = renderHook(() => useSseEvents());
    act(() => {
      FakeEventSource.last!.onopen?.();
    });
    expect(result.current.connected).toBe(true);
    act(() => {
      FakeEventSource.last!.onerror?.();
    });
    expect(result.current.connected).toBe(false);
  });
});
