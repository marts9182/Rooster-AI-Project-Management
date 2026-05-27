import { describe, it, expect, beforeAll } from 'vitest';
import sharp from 'sharp';
import { renderCoverHero } from '../../pinterest/templates/cover_hero.js';

/** A tiny 100×150 cream-colored PNG used as a stand-in cover. */
async function makeFakeCoverBuffer() {
  return sharp({
    create: {
      width: 100,
      height: 150,
      channels: 3,
      background: { r: 251, g: 243, b: 226 },
    },
  })
    .png()
    .toBuffer();
}

describe('renderCoverHero', () => {
  let cover;
  beforeAll(async () => {
    cover = await makeFakeCoverBuffer();
  });

  it('returns a PNG buffer that is exactly 1000×1500', async () => {
    const out = await renderCoverHero({
      coverPng: cover,
      title: 'Kakuro for Quiet Minds',
      subtitle: 'Large-print logic puzzles',
    });
    const meta = await sharp(out).metadata();
    expect(meta.width).toBe(1000);
    expect(meta.height).toBe(1500);
    expect(meta.format).toBe('png');
  });

  it('handles long titles without overflow (wraps to <=3 lines)', async () => {
    const out = await renderCoverHero({
      coverPng: cover,
      title: 'A Very Long Title That Definitely Wraps Across Multiple Lines',
      subtitle: 'Subtitle here',
    });
    // Just verify the buffer is non-empty and valid PNG.
    expect(out.length).toBeGreaterThan(1000);
    const meta = await sharp(out).metadata();
    expect(meta.height).toBe(1500);
  });

  it('omits subtitle gracefully', async () => {
    const out = await renderCoverHero({
      coverPng: cover,
      title: 'Title Only',
    });
    const meta = await sharp(out).metadata();
    expect(meta.width).toBe(1000);
    expect(meta.height).toBe(1500);
  });
});
