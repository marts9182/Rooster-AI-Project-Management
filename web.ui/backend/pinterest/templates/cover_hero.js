/**
 * Pure pin template — composes a 1000×1500 "cover hero" PNG.
 *
 * Layout:
 *   - Cream background.
 *   - Cover image centered in upper 60% (max ~520×780).
 *   - Title under cover, wrapped, teal #1F4F66, Inter-Bold.
 *   - Subtitle below title, smaller, brass #CAA457.
 *   - Thin coral underline accent.
 *
 * @module pinterest/templates/cover_hero
 */

import sharp from 'sharp';
import { createCanvas } from '@napi-rs/canvas';
import { PALETTE, FONT_FAMILY, registerFonts } from '../palette.js';

const WIDTH = 1000;
const HEIGHT = 1500;

/**
 * @typedef {Object} CoverHeroInput
 * @property {Buffer} coverPng         PNG buffer of the source cover.
 * @property {string} title            Pin title (1–80 chars).
 * @property {string} [subtitle]       Optional subtitle line.
 */

/**
 * @param {CoverHeroInput} input
 * @returns {Promise<Buffer>}  1000×1500 PNG.
 */
export async function renderCoverHero({ coverPng, title, subtitle }) {
  registerFonts();

  // 1. Cream background
  const bg = sharp({
    create: {
      width: WIDTH,
      height: HEIGHT,
      channels: 4,
      background: hexToRgba(PALETTE.cream),
    },
  });

  // 2. Resize cover to fit a 520-wide box in the upper area, preserving aspect.
  const coverResized = await sharp(coverPng)
    .resize({ width: 520, height: 780, fit: 'inside' })
    .png()
    .toBuffer();
  const coverMeta = await sharp(coverResized).metadata();
  const coverLeft = Math.round((WIDTH - (coverMeta.width ?? 520)) / 2);
  const coverTop = 90;

  // 3. Caption canvas (transparent), 1000×500, drawn under the cover.
  const captionTop = coverTop + (coverMeta.height ?? 780) + 60;
  const captionPng = renderCaptionBlock({
    width: WIDTH,
    height: HEIGHT - captionTop - 80,
    title,
    subtitle,
  });

  // 4. Composite.
  return bg
    .composite([
      { input: coverResized, top: coverTop, left: coverLeft },
      { input: captionPng, top: captionTop, left: 0 },
    ])
    .png()
    .toBuffer();
}

/**
 * Render a transparent PNG containing the wrapped title + optional subtitle
 * + a thin coral underline accent. Pure of file I/O.
 *
 * @param {{ width: number, height: number, title: string, subtitle?: string }} args
 * @returns {Buffer}  PNG with alpha.
 */
function renderCaptionBlock({ width, height, title, subtitle }) {
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  // Title — teal, bold, wrapped to max 3 lines.
  ctx.fillStyle = PALETTE.teal;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';

  const titleSize = pickTitleSize(title);
  ctx.font = `${titleSize}px ${FONT_FAMILY}`;
  const titleLines = wrapText(ctx, title, width - 120, 3);
  const lineHeight = Math.round(titleSize * 1.15);
  let y = 0;
  for (const line of titleLines) {
    ctx.fillText(line, width / 2, y);
    y += lineHeight;
  }

  // Coral underline accent — 4px thick, 160 wide, centered, 24px below title.
  y += 24;
  ctx.fillStyle = PALETTE.coral;
  ctx.fillRect(Math.round(width / 2 - 80), y, 160, 4);
  y += 32;

  // Subtitle — brass, smaller.
  if (subtitle) {
    ctx.fillStyle = PALETTE.brass;
    ctx.font = `36px ${FONT_FAMILY}`;
    const subLines = wrapText(ctx, subtitle, width - 160, 2);
    for (const line of subLines) {
      ctx.fillText(line, width / 2, y);
      y += 44;
    }
  }

  return canvas.toBuffer('image/png');
}

/**
 * Choose a base title font size so very long titles still fit.
 * @param {string} title
 * @returns {number}
 */
function pickTitleSize(title) {
  if (title.length <= 24) return 72;
  if (title.length <= 40) return 60;
  if (title.length <= 60) return 52;
  return 44;
}

/**
 * Greedy word-wrap. Returns at most `maxLines` lines; the last line gets an
 * ellipsis if more text remains.
 *
 * @param {import('@napi-rs/canvas').SKRSContext2D} ctx
 * @param {string} text
 * @param {number} maxWidth
 * @param {number} maxLines
 * @returns {string[]}
 */
function wrapText(ctx, text, maxWidth, maxLines) {
  const words = text.split(/\s+/);
  const lines = [];
  let current = '';
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (ctx.measureText(next).width <= maxWidth) {
      current = next;
    } else {
      if (current) lines.push(current);
      current = word;
      if (lines.length === maxLines) break;
    }
  }
  if (current && lines.length < maxLines) lines.push(current);
  if (lines.length === maxLines) {
    // Append ellipsis if more words remained.
    const consumed = lines.join(' ').split(/\s+/).length;
    if (consumed < words.length) {
      let last = lines[maxLines - 1];
      while (ctx.measureText(last + '…').width > maxWidth && last.length > 1) {
        last = last.slice(0, -1);
      }
      lines[maxLines - 1] = last + '…';
    }
  }
  return lines;
}

/**
 * @param {string} hex  "#RRGGBB"
 * @returns {{r:number,g:number,b:number,alpha:number}}
 */
function hexToRgba(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) throw new Error(`Invalid hex color: ${hex}`);
  const n = parseInt(m[1], 16);
  return { r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff, alpha: 1 };
}
