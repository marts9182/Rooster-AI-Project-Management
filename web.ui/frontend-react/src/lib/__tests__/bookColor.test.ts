import { describe, it, expect } from 'vitest';
import { bookColor } from '../bookColor';

describe('bookColor', () => {
  it('is deterministic per slug', () => {
    expect(bookColor('foo')).toBe(bookColor('foo'));
  });

  it('returns a CSS hsl() string', () => {
    expect(bookColor('foo')).toMatch(/^hsl\(\d+,\s*\d+%,\s*\d+%\)$/);
  });

  it('different slugs produce different colors', () => {
    expect(bookColor('foo')).not.toBe(bookColor('bar'));
  });
});
