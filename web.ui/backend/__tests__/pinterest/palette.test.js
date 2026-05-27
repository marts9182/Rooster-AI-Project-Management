import { describe, it, expect } from 'vitest';
import { PALETTE, FONT_FAMILY, registerFonts } from '../../pinterest/palette.js';

describe('palette', () => {
  it('exposes the four playful-theme brand colors', () => {
    expect(PALETTE.cream).toBe('#FBF3E2');
    expect(PALETTE.teal).toBe('#1F4F66');
    expect(PALETTE.brass).toBe('#CAA457');
    expect(PALETTE.coral).toBe('#D86C5C');
  });

  it('exposes the registered font family name', () => {
    expect(FONT_FAMILY).toBe('InterBold');
  });

  it('registerFonts is idempotent', () => {
    expect(() => registerFonts()).not.toThrow();
    expect(() => registerFonts()).not.toThrow();
  });
});
