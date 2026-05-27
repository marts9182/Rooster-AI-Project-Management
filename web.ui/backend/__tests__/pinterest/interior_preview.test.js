import { describe, it, expect, beforeAll } from 'vitest';
import sharp from 'sharp';
import { renderInteriorPreview } from '../../pinterest/templates/interior_preview.js';

async function makeFakePagePreview() {
  return sharp({
    create: {
      width: 600,
      height: 800,
      channels: 3,
      background: { r: 255, g: 255, b: 255 },
    },
  })
    .png()
    .toBuffer();
}

describe('renderInteriorPreview (pin template)', () => {
  let page;
  beforeAll(async () => {
    page = await makeFakePagePreview();
  });

  it('returns a 1000×1500 PNG with the page in the top 2/3', async () => {
    const out = await renderInteriorPreview({
      pagePng: page,
      title: 'Inside Kakuro: a peek',
      subtitle: 'Large-print logic puzzles',
    });
    const meta = await sharp(out).metadata();
    expect(meta.width).toBe(1000);
    expect(meta.height).toBe(1500);
  });

  it('handles very short titles', async () => {
    const out = await renderInteriorPreview({
      pagePng: page,
      title: 'Peek',
    });
    const meta = await sharp(out).metadata();
    expect(meta.width).toBe(1000);
  });

  it('throws on missing pagePng', async () => {
    await expect(
      renderInteriorPreview({ title: 'no page provided' }),
    ).rejects.toThrow(/pagePng/);
  });
});
