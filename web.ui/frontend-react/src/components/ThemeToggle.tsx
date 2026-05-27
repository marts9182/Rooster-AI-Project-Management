import { useTheme } from '../hooks/useTheme';

/**
 * Single-button theme toggle for the TopBar.
 *
 * Renders 🌙 in light mode and ☀ in dark mode — clicking flips to the other.
 * The aria-label describes the *destination* state so screen readers announce
 * "Switch to dark mode" / "Switch to light mode" rather than the current one.
 */
export default function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const isDark = theme === 'dark';
  const nextLabel = isDark ? 'Switch to light mode' : 'Switch to dark mode';
  return (
    <button
      type="button"
      className="theme-toggle"
      aria-label={nextLabel}
      title={nextLabel}
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
    >
      {isDark ? '☀' : '🌙'}
    </button>
  );
}
