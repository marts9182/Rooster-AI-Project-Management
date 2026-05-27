import { useCallback, useEffect, useState } from 'react';

export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'dashboard_theme';

function readStoredTheme(): Theme | null {
  if (typeof window === 'undefined') return null;
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    if (v === 'light' || v === 'dark') return v;
  } catch {
    /* localStorage may be unavailable in some sandboxed contexts */
  }
  return null;
}

function osPreference(): Theme {
  if (typeof window === 'undefined' || !window.matchMedia) return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';
}

function applyTheme(theme: Theme): void {
  if (typeof document === 'undefined') return;
  document.documentElement.setAttribute('data-theme', theme);
}

/**
 * Theme state for the Publishing Ops Dashboard.
 *
 * - First load: follows `prefers-color-scheme` unless `localStorage` already
 *   holds a manual choice.
 * - `setTheme()` persists to `localStorage` (key: `dashboard_theme`).
 * - OS preference changes (matchMedia 'change' events) only update the theme
 *   when the user has not made a manual choice yet — once they toggle, their
 *   pick sticks regardless of OS-level changes.
 */
export function useTheme(): { theme: Theme; setTheme: (t: Theme) => void } {
  const [theme, setThemeState] = useState<Theme>(
    () => readStoredTheme() ?? osPreference(),
  );

  // Apply theme to <html data-theme="..."> on every change.
  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  // Follow OS preference changes only when the user has not manually chosen.
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return undefined;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (e: MediaQueryListEvent) => {
      if (readStoredTheme() === null) {
        setThemeState(e.matches ? 'dark' : 'light');
      }
    };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const setTheme = useCallback((t: Theme) => {
    try {
      window.localStorage.setItem(STORAGE_KEY, t);
    } catch {
      /* localStorage write may fail in private mode — proceed with in-memory */
    }
    setThemeState(t);
  }, []);

  return { theme, setTheme };
}
