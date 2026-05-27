/**
 * Tests for the KDP preview renderer.
 *
 * Renders 8 evenly-spaced interior PDF pages to PNGs, cached on disk under
 * data/cache/previews/<slug>/. pdf2pic is injected so unit tests never call
 * the real graphicsmagick subprocess.
 */
import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
} from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { renderPreviewsForBook } from '../../kdp/preview_renderer.js';

let tmpRoot;
let cacheRoot;
let bookDir;

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kdp-preview-'));
  cacheRoot = path.join(tmpRoot, 'cache', 'previews');
  bookDir = path.join(tmpRoot, 'book');
  fs.mkdirSync(bookDir, { recursive: true });
  fs.writeFileSync(path.join(bookDir, 'interior.pdf'), 'fake-pdf');
  process.env.ROOSTER_PREVIEW_CACHE_DIR = cacheRoot;
});

afterEach(() => {
  try {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  } catch (_err) {
    // best-effort
  }
  delete process.env.ROOSTER_PREVIEW_CACHE_DIR;
});

/**
 * Make a fake pdf2pic factory whose `convert(pageNum)` writes a PNG and
 * records the page numbers it was asked for.
 *
 * @returns {{factory: Function, calls: number[]}}
 */
function makeFakeFactory() {
  /** @type {number[]} */
  const calls = [];
  const factory = (_pdfPath, options) => ({
    convert: async (pageNum) => {
      calls.push(pageNum);
      const dir = options.savePath;
      fs.mkdirSync(dir, { recursive: true });
      const filename = `${options.saveFilename}.${pageNum}.png`;
      const fullPath = path.join(dir, filename);
      fs.writeFileSync(fullPath, Buffer.from([0x89, 0x50, 0x4e, 0x47]));
      return { path: fullPath, page: pageNum };
    },
  });
  return { factory, calls };
}

describe('renderPreviewsForBook', () => {
  it('renders 8 evenly-spaced pages for a 120-page book', async () => {
    const { factory, calls } = makeFakeFactory();
    const book = {
      slug: 'book-a',
      output_dir: bookDir,
      page_count: 120,
    };
    const images = await renderPreviewsForBook(book, { pdf2picFactory: factory });

    expect(images).toHaveLength(8);
    for (const p of images) {
      expect(fs.existsSync(p)).toBe(true);
    }
    // 8 evenly-spaced pages from a 120-page book:
    //   floor(120/9)=13, floor(240/9)=26, floor(360/9)=40,
    //   floor(480/9)=53, floor(600/9)=66, floor(720/9)=80,
    //   floor(840/9)=93, floor(960/9)=106
    expect(calls).toEqual([13, 26, 40, 53, 66, 80, 93, 106]);
  });

  it('is idempotent: second call returns cached paths without re-rendering', async () => {
    const { factory, calls } = makeFakeFactory();
    const book = {
      slug: 'book-cached',
      output_dir: bookDir,
      page_count: 100,
    };
    const first = await renderPreviewsForBook(book, { pdf2picFactory: factory });
    expect(first).toHaveLength(8);
    expect(calls.length).toBe(8);

    const second = await renderPreviewsForBook(book, { pdf2picFactory: factory });
    expect(second).toHaveLength(8);
    expect(calls.length).toBe(8); // unchanged — no re-render
    expect(second).toEqual(first);
  });

  it('returns empty list when interior.pdf is missing', async () => {
    const { factory, calls } = makeFakeFactory();
    const emptyDir = path.join(tmpRoot, 'no-pdf-here');
    fs.mkdirSync(emptyDir, { recursive: true });
    const book = {
      slug: 'no-pdf',
      output_dir: emptyDir,
      page_count: 50,
    };
    const images = await renderPreviewsForBook(book, { pdf2picFactory: factory });
    expect(images).toEqual([]);
    expect(calls).toEqual([]);
  });

  it('uses minimum page=1 when book page_count is tiny (<9)', async () => {
    const { factory, calls } = makeFakeFactory();
    const book = {
      slug: 'tiny',
      output_dir: bookDir,
      page_count: 8,
    };
    const images = await renderPreviewsForBook(book, { pdf2picFactory: factory });
    // Even with a tiny book we still ask for 8 pages; each call must be >=1.
    expect(images).toHaveLength(8);
    for (const p of calls) {
      expect(p).toBeGreaterThanOrEqual(1);
    }
  });

  it('falls back to total page_count=8 if not provided', async () => {
    const { factory, calls } = makeFakeFactory();
    const book = {
      slug: 'no-page-count',
      output_dir: bookDir,
    };
    const images = await renderPreviewsForBook(book, { pdf2picFactory: factory });
    expect(images).toHaveLength(8);
    for (const p of calls) {
      expect(p).toBeGreaterThanOrEqual(1);
    }
  });
});
