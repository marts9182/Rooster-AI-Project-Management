/**
 * Brand palette + font registration for Pinterest pin templates.
 *
 * Source of truth: memory `kdp-cover-design-playful-theme.md`.
 * @module pinterest/palette
 */

import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { GlobalFonts } from '@napi-rs/canvas';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const PALETTE = Object.freeze({
  cream: '#FBF3E2',
  teal: '#1F4F66',
  brass: '#CAA457',
  coral: '#D86C5C',
});

export const FONT_FAMILY = 'InterBold';

let registered = false;

/**
 * Register the bundled Inter-Bold font with @napi-rs/canvas. Idempotent —
 * safe to call from every template invocation.
 */
export function registerFonts() {
  if (registered) return;
  const fontPath = path.resolve(__dirname, 'assets', 'Inter-Bold.ttf');
  if (!fs.existsSync(fontPath)) {
    throw new Error(`Inter-Bold.ttf not found at ${fontPath}`);
  }
  GlobalFonts.registerFromPath(fontPath, FONT_FAMILY);
  registered = true;
}
