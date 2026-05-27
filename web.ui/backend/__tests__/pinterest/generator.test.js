/**
 * Tests for pinterest/generator.js — given a slug, pin type, source PNG, and
 * caption text, write a 1000×1500 pin PNG to <PINTEREST_OUTPUT_ROOT>/<slug>/.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { generatePinImage } from '../../pinterest/generator.js';

let tmpRoot;

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pin-gen-'));
  process.env.PINTEREST_OUTPUT_ROOT = tmpRoot;
});

afterEach(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
  delete process.env.PINTEREST_OUTPUT_ROOT;
});

async function fakePng(width, height) {
  const file = path.join(tmpRoot, `src-${width}x${height}.png`);
  await sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 200, g: 200, b: 200 },
    },
  })
    .png()
    .toFile(file);
  return file;
}

describe('generatePinImage', () => {
  it('writes cover_hero PNG to <root>/<slug>/cover_hero-<idx>.png', async () => {
    const coverFile = await fakePng(800, 1200);
    const out = await generatePinImage({
      slug: 'kakuro-quiet-minds',
      pinType: 'cover_hero',
      index: 0,
      sourcePngPath: coverFile,
      title: 'Kakuro for Quiet Minds',
      subtitle: 'Large-print logic puzzles',
    });
    expect(out).toMatch(/kakuro-quiet-minds[\\/]cover_hero-0\.png$/);
    expect(fs.existsSync(out)).toBe(true);
    const meta = await sharp(out).metadata();
    expect(meta.width).toBe(1000);
    expect(meta.height).toBe(1500);
  });

  it('writes interior_preview PNG to <root>/<slug>/interior_preview-<idx>.png', async () => {
    const pageFile = await fakePng(600, 800);
    const out = await generatePinImage({
      slug: 'kakuro-quiet-minds',
      pinType: 'interior_preview',
      index: 3,
      sourcePngPath: pageFile,
      title: 'Inside Kakuro: a peek',
    });
    expect(out).toMatch(/kakuro-quiet-minds[\\/]interior_preview-3\.png$/);
    expect(fs.existsSync(out)).toBe(true);
  });

  it('throws on unknown pinType', async () => {
    await expect(
      generatePinImage({
        slug: 'x',
        pinType: 'weird_type',
        index: 0,
        sourcePngPath: await fakePng(100, 100),
        title: 't',
      }),
    ).rejects.toThrow(/unknown pinType/);
  });
});
