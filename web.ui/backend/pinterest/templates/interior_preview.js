/**
 * Pure pin template — composes a 1000×1500 "interior page preview" PNG.
 *
 * Layout (different from cover_hero):
 *   - Top 2/3 (≈ 1000×1000): page preview, scaled to fit, centered, on cream.
 *   - Bottom 1/3 (≈ 1000×500): caption block (title + subtitle) on teal panel.
 *
 * @module pinterest/templates/interior_preview
 */

import sharp from 'sharp';
import { createCanvas } from '@napi-rs/canvas';
import { PALETTE, FONT_FAMILY, registerFonts } from '../palette.js';

const WIDTH = 1000;
const HEIGHT = 1500;
const PAGE_AREA_HEIGHT = 1000;
const CAPTION_HEIGHT = HEIGHT - PAGE_AREA_HEIGHT; // 500

/**
 * @typedef {Object} InteriorPreviewInput
 * @property {Buffer} pagePng         PNG of one interior page preview.
 * @property {string} title           Pin title.
 * @property {string} [subtitle]      Optional subtitle.
 */

/**
 * @param {InteriorPreviewInput} input
 * @returns {Promise<Buffer>}  1000×1500 PNG.
 */
export async function renderInteriorPreview({ pagePng, title, subtitle }) {
  if (!pagePng || !Buffer.isBuffer(pagePng)) {
    throw new Error('pagePng (Buffer) is required');
  }
  registerFonts();

  // Cream background full-canvas.
  const base = sharp({
    create: {
      width: WIDTH,
      height: HEIGHT,
      channels: 4,
      background: hexToRgba(PALETTE.cream),
    },
  });

  // Resize page preview to fit a 880×920 box inside the top 1000px region.
  const pageResized = await sharp(pagePng)
    .resize({ width: 880, height: 920, fit: 'inside' })
    .png()
    .toBuffer();
  const pageMeta = await sharp(pageResized).metadata();
  const pageLeft = Math.round((WIDTH - (pageMeta.width ?? 880)) / 2);
  const pageTop = Math.round((PAGE_AREA_HEIGHT - (pageMeta.height ?? 920)) / 2);

  // Teal caption panel (full width, bottom 1/3).
  const captionPanel = await sharp({
    create: {
      width: WIDTH,
      height: CAPTION_HEIGHT,
      channels: 4,
      background: hexToRgba(PALETTE.teal),
    },
  })
    .png()
    .toBuffer();

  // Caption text overlay (cream/brass on the teal panel).
  const captionText = renderCaptionOverlay({
    width: WIDTH,
    height: CAPTION_HEIGHT,
    title,
    subtitle,
  });

  return base
    .composite([
      { input: pageResized, top: pageTop, left: pageLeft },
      { input: captionPanel, top: PAGE_AREA_HEIGHT, left: 0 },
      { input: captionText, top: PAGE_AREA_HEIGHT, left: 0 },
    ])
    .png()
    .toBuffer();
}

/**
 * Build the title + subtitle overlay PNG for the teal panel.
 *
 * @param {{ width: number, height: number, title: string, subtitle?: string }} args
 * @returns {Buffer}
 */
function renderCaptionOverlay({ width, height, title, subtitle }) {
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = PALETTE.cream;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';

  const titleSize = title.length <= 30 ? 68 : title.length <= 50 ? 56 : 48;
  ctx.font = `${titleSize}px ${FONT_FAMILY}`;
  const titleLines = wrapText(ctx, title, width - 120, 3);
  const lineHeight = Math.round(titleSize * 1.12);
  const blockHeight =
    titleLines.length * lineHeight + (subtitle ? 24 + 44 : 0);
  let y = Math.round((height - blockHeight) / 2);
  for (const line of titleLines) {
    ctx.fillText(line, width / 2, y);
    y += lineHeight;
  }
  if (subtitle) {
    y += 24;
    ctx.fillStyle = PALETTE.brass;
    ctx.font = `36px ${FONT_FAMILY}`;
    const subLines = wrapText(ctx, subtitle, width - 160, 1);
    for (const line of subLines) {
      ctx.fillText(line, width / 2, y);
      y += 44;
    }
  }
  return canvas.toBuffer('image/png');
}

/**
 * Greedy word-wrap (identical to cover_hero's; duplicated here to keep
 * templates self-contained and independently testable).
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
 * @param {string} hex
 * @returns {{r:number,g:number,b:number,alpha:number}}
 */
function hexToRgba(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) throw new Error(`Invalid hex color: ${hex}`);
  const n = parseInt(m[1], 16);
  return { r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff, alpha: 1 };
}
