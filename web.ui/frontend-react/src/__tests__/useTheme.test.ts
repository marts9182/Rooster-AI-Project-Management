import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useTheme } from '../hooks/useTheme';

/**
 * MediaQueryList shim — gives us a single `change` listener we can fire from
 * tests to simulate the OS flipping between light/dark.
 */
interface FakeMediaQueryList {
  matches: boolean;
  media: string;
  onchange: ((this: MediaQueryList, ev: MediaQueryListEvent) => unknown) | null;
  listeners: Array<(e: MediaQueryListEvent) => void>;
  addEventListener: (type: 'change', listener: (e: MediaQueryListEvent) => void) => void;
  removeEventListener: (type: 'change', listener: (e: MediaQueryListEvent) => void) => void;
  addListener: (listener: (e: MediaQueryListEvent) => void) => void;
  removeListener: (listener: (e: MediaQueryListEvent) => void) => void;
  dispatchEvent: (event: Event) => boolean;
}

function installMatchMedia(prefersDark: boolean): FakeMediaQueryList {
  const mql: FakeMediaQueryList = {
    matches: prefersDark,
    media: '(prefers-color-scheme: dark)',
    onchange: null,
    listeners: [],
    addEventListener(type, listener) {
      if (type === 'change') this.listeners.push(listener);
    },
    removeEventListener(type, listener) {
      if (type === 'change') {
        this.listeners = this.listeners.filter((l) => l !== listener);
      }
    },
    addListener(listener) {
      this.listeners.push(listener);
    },
    removeListener(listener) {
      this.listeners = this.listeners.filter((l) => l !== listener);
    },
    dispatchEvent() {
      return true;
    },
  };
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: () => mql,
  });
  return mql;
}

function fireOsChange(mql: FakeMediaQueryList, matches: boolean): void {
  mql.matches = matches;
  const ev = { matches, media: mql.media } as MediaQueryListEvent;
  for (const l of [...mql.listeners]) l(ev);
}

beforeEach(() => {
  window.localStorage.clear();
  document.documentElement.removeAttribute('data-theme');
});

afterEach(() => {
  window.localStorage.clear();
  document.documentElement.removeAttribute('data-theme');
});

describe('useTheme', () => {
  it('returns "light" when matchMedia is light and localStorage is empty', () => {
    installMatchMedia(false);
    const { result } = renderHook(() => useTheme());
    expect(result.current.theme).toBe('light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  it('returns "dark" when matchMedia is dark and localStorage is empty', () => {
    installMatchMedia(true);
    const { result } = renderHook(() => useTheme());
    expect(result.current.theme).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('localStorage "dark" wins over OS light preference', () => {
    installMatchMedia(false);
    window.localStorage.setItem('dashboard_theme', 'dark');
    const { result } = renderHook(() => useTheme());
    expect(result.current.theme).toBe('dark');
  });

  it('localStorage "light" wins over OS dark preference', () => {
    installMatchMedia(true);
    window.localStorage.setItem('dashboard_theme', 'light');
    const { result } = renderHook(() => useTheme());
    expect(result.current.theme).toBe('light');
  });

  it('setTheme("dark") writes localStorage AND sets data-theme on <html>', () => {
    installMatchMedia(false);
    const { result } = renderHook(() => useTheme());
    expect(result.current.theme).toBe('light');
    act(() => result.current.setTheme('dark'));
    expect(result.current.theme).toBe('dark');
    expect(window.localStorage.getItem('dashboard_theme')).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('OS preference change updates theme ONLY when localStorage is empty', () => {
    const mql = installMatchMedia(false);
    const { result } = renderHook(() => useTheme());
    expect(result.current.theme).toBe('light');

    act(() => fireOsChange(mql, true));
    expect(result.current.theme).toBe('dark');
    // We did NOT persist this — it's still tracking the OS.
    expect(window.localStorage.getItem('dashboard_theme')).toBeNull();
  });

  it('OS preference change does NOT override an explicit user choice', () => {
    const mql = installMatchMedia(false);
    const { result } = renderHook(() => useTheme());
    act(() => result.current.setTheme('light'));
    expect(window.localStorage.getItem('dashboard_theme')).toBe('light');

    // OS flips to dark — user already chose, so theme stays light.
    act(() => fireOsChange(mql, true));
    expect(result.current.theme).toBe('light');
  });
});
