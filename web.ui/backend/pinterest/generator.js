/**
 * Pin image generator — given a slug, pin type, source PNG path on disk,
 * and caption text, render and persist a 1000×1500 pin PNG.
 *
 * Output location: <PINTEREST_OUTPUT_ROOT or repo-root/output/pinterest>/<slug>/<pin_type>-<index>.png
 *
 * @module pinterest/generator
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderCoverHero } from './templates/cover_hero.js';
import { renderInteriorPreview } from './templates/interior_preview.js';
import { registerFonts } from './palette.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Register fonts once at module load so every render path is ready.
registerFonts();

/** @returns {string} */
function outputRoot() {
  if (process.env.PINTEREST_OUTPUT_ROOT) {
    return path.resolve(process.env.PINTEREST_OUTPUT_ROOT);
  }
  return path.resolve(__dirname, '..', '..', '..', 'output', 'pinterest');
}

/**
 * @typedef {Object} GenerateInput
 * @property {string} slug
 * @property {'cover_hero'|'interior_preview'} pinType
 * @property {number} index            0-based index within the slug's pin set.
 * @property {string} sourcePngPath    Absolute path to the source PNG
 *                                     (cover preview or interior page preview).
 * @property {string} title
 * @property {string} [subtitle]
 */

/**
 * Render and persist one pin PNG. Returns the absolute output path.
 *
 * @param {GenerateInput} input
 * @returns {Promise<string>}
 */
export async function generatePinImage(input) {
  const { slug, pinType, index, sourcePngPath, title, subtitle } = input;
  if (!fs.existsSync(sourcePngPath)) {
    throw new Error(`sourcePngPath does not exist: ${sourcePngPath}`);
  }
  const sourceBuf = fs.readFileSync(sourcePngPath);

  let pngBuffer;
  if (pinType === 'cover_hero') {
    pngBuffer = await renderCoverHero({ coverPng: sourceBuf, title, subtitle });
  } else if (pinType === 'interior_preview') {
    pngBuffer = await renderInteriorPreview({ pagePng: sourceBuf, title, subtitle });
  } else {
    throw new Error(`unknown pinType: ${pinType}`);
  }

  const dir = path.join(outputRoot(), slug);
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${pinType}-${index}.png`);
  fs.writeFileSync(file, pngBuffer);
  return file;
}
