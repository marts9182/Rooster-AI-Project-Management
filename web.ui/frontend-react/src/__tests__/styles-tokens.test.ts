/// <reference types="node" />
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const css = readFileSync(
  resolve(__dirname, '../styles/shell.css'),
  'utf8',
);

describe('shell.css design tokens', () => {
  describe('typography', () => {
    it('defines font + size + weight + line-height tokens', () => {
      expect(css).toMatch(/--font-sans:\s*/);
      expect(css).toMatch(/--text-xs:\s*/);
      expect(css).toMatch(/--text-sm:\s*/);
      expect(css).toMatch(/--text-base:\s*/);
      expect(css).toMatch(/--text-lg:\s*/);
      expect(css).toMatch(/--text-xl:\s*/);
      expect(css).toMatch(/--weight-regular:\s*/);
      expect(css).toMatch(/--weight-medium:\s*/);
      expect(css).toMatch(/--weight-semibold:\s*/);
      expect(css).toMatch(/--weight-bold:\s*/);
      expect(css).toMatch(/--leading-tight:\s*/);
      expect(css).toMatch(/--leading-base:\s*/);
    });
  });

  describe('spacing scale', () => {
    it('defines 4px spacing scale tokens', () => {
      expect(css).toMatch(/--space-1:\s*4px/);
      expect(css).toMatch(/--space-2:\s*8px/);
      expect(css).toMatch(/--space-3:\s*12px/);
      expect(css).toMatch(/--space-4:\s*16px/);
      expect(css).toMatch(/--space-6:\s*24px/);
    });
  });

  describe('calendar event color tokens', () => {
    it('defines per-kind calendar color tokens (light + dark)', () => {
      expect(css).toMatch(/--cal-kdp-release:\s*/);
      expect(css).toMatch(/--cal-etsy-listed:\s*/);
      expect(css).toMatch(/--cal-reminder:\s*/);
      expect(css).toMatch(/--cal-pinterest:\s*/);
      expect(css).toMatch(/--cal-roadmap-release:\s*/);
      expect(css).toMatch(/--cal-roadmap-lock:\s*/);
      // dark-theme override block must exist and also define at least one cal token
      expect(css).toMatch(
        /\[data-theme="dark"\][^}]*--cal-kdp-release/s,
      );
    });
  });

  describe('button system', () => {
    it('defines .btn base + variants + sizes', () => {
      expect(css).toMatch(/\.btn\s*\{/);
      expect(css).toMatch(/\.btn--primary\s*\{/);
      expect(css).toMatch(/\.btn--secondary\s*\{/);
      expect(css).toMatch(/\.btn--ghost\s*\{/);
      expect(css).toMatch(/\.btn--danger\s*\{/);
      expect(css).toMatch(/\.btn--sm\s*\{/);
    });
  });

  describe('filter chips', () => {
    it('defines .filter-chip + selected variant', () => {
      expect(css).toMatch(/\.filter-chip\s*\{/);
      expect(css).toMatch(/\.filter-chip--selected\s*\{/);
    });
  });

  describe('layout utilities', () => {
    it('defines .stack, .row, gap-N, mt-N', () => {
      expect(css).toMatch(/\.stack\s*\{/);
      expect(css).toMatch(/\.row\s*\{/);
      expect(css).toMatch(/\.gap-2\s*\{/);
      expect(css).toMatch(/\.mt-4\s*\{/);
    });
  });

  describe('header tokens', () => {
    it('header height is 68px and uses border-bottom', () => {
      expect(css).toMatch(/--header-h:\s*68px/);
      // the .app-header (or :host header) selector should reference --border somewhere
      // for its bottom edge — soft test, just check that border-bottom + var(--border)
      // co-occur somewhere in the file
      expect(css).toMatch(/border-bottom:[^;]*var\(--border\)/);
    });
  });
});
