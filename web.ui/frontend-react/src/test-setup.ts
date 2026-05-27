import '@testing-library/jest-dom/vitest';

/**
 * jsdom doesn't ship an EventSource implementation. Without it, any component
 * that calls `useSseEvents()` blows up with "EventSource is not defined" the
 * moment its mount effect runs. Tests that specifically exercise the SSE flow
 * stub their own FakeEventSource (see useSseEvents.test.tsx); every other test
 * gets the no-op below so the hook quietly opens, never fires, and tears down
 * cleanly on unmount.
 */
class NoopEventSource {
  // EventSource readyState constants — kept for parity with the real class.
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSED = 2;

  url: string;
  withCredentials = false;
  readyState = NoopEventSource.CONNECTING;
  onopen: ((this: EventSource, ev: Event) => unknown) | null = null;
  onmessage: ((this: EventSource, ev: MessageEvent) => unknown) | null = null;
  onerror: ((this: EventSource, ev: Event) => unknown) | null = null;

  constructor(url: string | URL) {
    this.url = typeof url === 'string' ? url : url.toString();
  }

  addEventListener(): void {
    // No-op — no events will ever be delivered in this default stub.
  }
  removeEventListener(): void {
    // No-op.
  }
  dispatchEvent(): boolean {
    return false;
  }
  close(): void {
    this.readyState = NoopEventSource.CLOSED;
  }
}

if (typeof globalThis.EventSource === 'undefined') {
  // Cast through unknown — NoopEventSource implements just enough of the
  // EventSource surface for the production code path.
  (globalThis as unknown as { EventSource: unknown }).EventSource =
    NoopEventSource;
}
