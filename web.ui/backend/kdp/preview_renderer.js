/**
 * Renders 8 evenly-spaced interior PDF pages to PNG once, caches under
 * data/cache/previews/<slug>/.
 *
 * pdf2pic is injected via the `pdf2picFactory` option so unit tests never
 * spawn the real graphicsmagick subprocess. The default factory imports
 * `fromPath` from `pdf2pic` lazily so module load doesn't crash when gm
 * is missing in CI environments that never call this code.
 *
 * @module kdp/preview_renderer
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** Number of evenly-spaced preview pages to render. */
const PAGE_COUNT = 8;

/**
 * Resolve the preview cache directory.
 *   1. `ROOSTER_PREVIEW_CACHE_DIR` env wins (used by tests).
 *   2. Otherwise: <repo-root>/data/cache/previews/.
 *
 * @returns {string}
 */
function previewCacheDir() {
  if (process.env.ROOSTER_PREVIEW_CACHE_DIR) {
    return path.resolve(process.env.ROOSTER_PREVIEW_CACHE_DIR);
  }
  // __dirname = .../web.ui/backend/kdp ; repo root is three levels up.
  return path.resolve(__dirname, '..', '..', '..', 'data', 'cache', 'previews');
}

/**
 * Default pdf2pic factory: dynamically imports pdf2pic so module load never
 * fails just because graphicsmagick isn't installed. pdf2pic's `Convert`
 * type is intentionally cast through `any` so the convert call site only
 * needs to depend on the narrow `{convert(page)}` shape that the test
 * doubles also satisfy.
 *
 * @param {string} pdfPath
 * @param {object} options
 * @returns {Promise<any>}
 */
async function defaultPdf2picFactory(pdfPath, options) {
  const { fromPath } = await import('pdf2pic');
  return fromPath(pdfPath, options);
}

/**
 * Pick the 8 evenly-spaced page indexes for a book of N pages.
 *
 *   floor(N/9), floor(2N/9), ..., floor(8N/9)
 *
 * Clamped to a minimum of 1 so tiny books don't ask for page 0.
 *
 * @param {number} totalPages
 * @returns {number[]}
 */
function evenlySpacedPages(totalPages) {
  const n = Math.max(totalPages, PAGE_COUNT + 1); // avoid 0s for tiny books
  /** @type {number[]} */
  const pages = [];
  for (let k = 1; k <= PAGE_COUNT; k++) {
    pages.push(Math.max(1, Math.floor((k * n) / (PAGE_COUNT + 1))));
  }
  return pages;
}

/**
 * Render 8 evenly-spaced interior previews for one book.
 *
 * Idempotent: if the cache dir already has >=8 PNGs, returns them without
 * calling pdf2pic. If the book's interior.pdf is missing, returns [].
 *
 * @param {{slug: string, output_dir: string, page_count?: number|null}} book
 * @param {{pdf2picFactory?: Function}} [opts]
 * @returns {Promise<string[]>} absolute paths to the 8 cached PNGs
 */
export async function renderPreviewsForBook(book, opts = {}) {
  const factory = opts.pdf2picFactory ?? defaultPdf2picFactory;
  const outDir = path.join(previewCacheDir(), book.slug);

  // Cache hit: already rendered.
  if (fs.existsSync(outDir)) {
    const existing = fs
      .readdirSync(outDir)
      .filter((f) => f.endsWith('.png'))
      .map((f) => path.join(outDir, f))
      .sort();
    if (existing.length >= PAGE_COUNT) {
      return existing.slice(0, PAGE_COUNT);
    }
  }

  // No PDF on disk → return empty list (caller decides what to do).
  const pdfPath = path.join(book.output_dir, 'interior.pdf');
  if (!fs.existsSync(pdfPath)) {
    return [];
  }

  fs.mkdirSync(outDir, { recursive: true });

  const totalPages = typeof book.page_count === 'number' && book.page_count > 0
    ? book.page_count
    : PAGE_COUNT;
  const pageNums = evenlySpacedPages(totalPages);

  const converter = await factory(pdfPath, {
    density: 100,
    format: 'png',
    width: 600,
    height: 800,
    savePath: outDir,
    saveFilename: 'interior',
  });

  /** @type {string[]} */
  const out = [];
  for (const page of pageNums) {
    const result = await converter.convert(page);
    if (result?.path) out.push(result.path);
  }

  return out.sort();
}
