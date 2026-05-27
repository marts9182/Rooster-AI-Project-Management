import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ThemeToggle from '../components/ThemeToggle';

function installMatchMedia(prefersDark: boolean): void {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: () => ({
      matches: prefersDark,
      media: '(prefers-color-scheme: dark)',
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => true,
    }),
  });
}

beforeEach(() => {
  window.localStorage.clear();
  document.documentElement.removeAttribute('data-theme');
});

afterEach(() => {
  window.localStorage.clear();
  document.documentElement.removeAttribute('data-theme');
});

describe('ThemeToggle', () => {
  it('renders 🌙 in light mode with "Switch to dark mode" aria-label', () => {
    installMatchMedia(false);
    render(<ThemeToggle />);
    const btn = screen.getByRole('button', { name: /switch to dark mode/i });
    expect(btn).toBeInTheDocument();
    expect(btn.textContent).toBe('🌙');
  });

  it('renders ☀ in dark mode with "Switch to light mode" aria-label', () => {
    installMatchMedia(true);
    render(<ThemeToggle />);
    const btn = screen.getByRole('button', { name: /switch to light mode/i });
    expect(btn).toBeInTheDocument();
    expect(btn.textContent).toBe('☀');
  });

  it('clicking flips theme, writes localStorage, and sets data-theme', async () => {
    installMatchMedia(false);
    const user = userEvent.setup();
    render(<ThemeToggle />);
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');

    await user.click(screen.getByRole('button', { name: /switch to dark mode/i }));

    expect(window.localStorage.getItem('dashboard_theme')).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    // Label should have flipped to the inverse action.
    expect(
      screen.getByRole('button', { name: /switch to light mode/i }),
    ).toBeInTheDocument();
  });

  it('renders as a real <button> for keyboard accessibility', () => {
    installMatchMedia(false);
    render(<ThemeToggle />);
    const btn = screen.getByRole('button', { name: /switch to dark mode/i });
    expect(btn.tagName).toBe('BUTTON');
    expect(btn).toHaveAttribute('type', 'button');
  });
});
