#!/usr/bin/env node
/**
 * Generate coloring book interior PNGs via Nano Banana Pro (Gemini 3 Pro
 * Image) for a given book id. Each PNG is one design page, bold-and-easy
 * style, 4K, 3:4 portrait.
 *
 * Why a separate script from generate_kdp_covers.mjs:
 *   - covers use 2K and a sales-first prompt template with reserved
 *     typography negative space; interior pages use 4K and a coloring-only
 *     line-art preamble — different constraint set
 *   - covers are 1 image per book; coloring books are 45+ images per book
 *   - covers go to assets/generated/wraps/; interiors go to
 *     assets/generated/coloring/<book-id>/
 *
 * Run from the backend directory so dotenv, @google/genai, and the local
 * ImageGenerationService import resolve against backend/node_modules:
 *
 *   cd web.ui/backend
 *
 *   # 5-page smoke batch (one per section, fastest validation of style):
 *   node scripts/generate_coloring_interiors.mjs bold-easy-cottagecore-mushrooms-v1 --smoke
 *
 *   # specific pages by index:
 *   node scripts/generate_coloring_interiors.mjs bold-easy-cottagecore-mushrooms-v1 --pages=1,2,3
 *
 *   # full book, skipping pages already on disk:
 *   node scripts/generate_coloring_interiors.mjs bold-easy-cottagecore-mushrooms-v1 --skip-existing
 *
 *   # full book, re-roll everything:
 *   node scripts/generate_coloring_interiors.mjs bold-easy-cottagecore-mushrooms-v1
 *
 * Prompts come from:
 *   projects/kdp-puzzle-press/data/coloring_prompts/<book-id>.json
 *
 * Output PNGs are written to:
 *   projects/kdp-puzzle-press/assets/generated/coloring/<book-id>/page_NN.png
 *
 * These are the exact paths the Python book module
 * (src/pocket_rooster_press/books/bold_easy_cottagecore_mushrooms_v1.py)
 * loads at PDF-assembly time.
 *
 * Mandatory KDP AI disclosure: the interior is AI-generated. Disclose
 * `images = AI-Generated` during KDP upload. See the book's listing.md
 * "AI-Content Disclosure" section.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { ImageGenerationService } from '../agents/ImageGenerationService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BACKEND_DIR = path.resolve(__dirname, '..');
const REPO_ROOT = path.resolve(BACKEND_DIR, '..', '..');
const KDP_ROOT = path.join(REPO_ROOT, 'projects', 'kdp-puzzle-press');
const PROMPTS_DIR = path.join(KDP_ROOT, 'data', 'coloring_prompts');
const COLORING_ASSETS_ROOT = path.join(KDP_ROOT, 'assets', 'generated', 'coloring');

dotenv.config({ path: path.join(BACKEND_DIR, '.env') });
dotenv.config({ path: path.join(BACKEND_DIR, '.env.local'), override: true });

// ── Helpers ────────────────────────────────────────────────────────────────

function loadPromptBank(bookId) {
  const p = path.join(PROMPTS_DIR, `${bookId}.json`);
  if (!fs.existsSync(p)) {
    throw new Error(
      `No prompt bank found for "${bookId}" at ${path.relative(REPO_ROOT, p)}. ` +
        `Create the JSON first.`,
    );
  }
  const bank = JSON.parse(fs.readFileSync(p, 'utf-8'));
  if (!Array.isArray(bank.prompts) || bank.prompts.length === 0) {
    throw new Error(`Prompt bank for "${bookId}" is empty or malformed.`);
  }
  if (typeof bank.style_preamble !== 'string' || bank.style_preamble.length === 0) {
    throw new Error(`Prompt bank for "${bookId}" is missing style_preamble.`);
  }
  return bank;
}

function buildPrompt(bank, entry) {
  const prefix = bank.subject_prefix ?? 'Subject: ';
  return `${bank.style_preamble}${prefix}${entry.subject}`;
}

function parseArgs(argv) {
  const args = argv.slice(2);
  const bookId = args.find((a) => !a.startsWith('--'));
  const skipExisting = args.includes('--skip-existing');
  const isSmoke = args.includes('--smoke');
  const pagesFlag = args.find((a) => a.startsWith('--pages='));
  let pagesSubset = null;
  if (pagesFlag) {
    pagesSubset = pagesFlag
      .replace('--pages=', '')
      .split(',')
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => Number.isInteger(n) && n > 0);
  }
  return { bookId, skipExisting, isSmoke, pagesSubset };
}

/** Pick one prompt from each unique section. Falls back to first N if a book
 * has fewer sections than the requested smoke count. */
function smokeSelection(bank) {
  const seen = new Set();
  const picks = [];
  for (const p of bank.prompts) {
    if (!seen.has(p.section)) {
      seen.add(p.section);
      picks.push(p.idx);
    }
  }
  return picks;
}

// ── Main ──────────────────────────────────────────────────────────────────

async function main() {
  const { bookId, skipExisting, isSmoke, pagesSubset: explicitPages } = parseArgs(process.argv);
  if (!bookId) {
    console.error(
      'Usage:\n' +
        '  node scripts/generate_coloring_interiors.mjs <book-id>\n' +
        '  node scripts/generate_coloring_interiors.mjs <book-id> --smoke\n' +
        '  node scripts/generate_coloring_interiors.mjs <book-id> --pages=1,2,3\n' +
        '  node scripts/generate_coloring_interiors.mjs <book-id> --skip-existing',
    );
    process.exit(1);
  }

  if (!process.env.GEMINI_API_KEY) {
    console.error('GEMINI_API_KEY is not set in web.ui/backend/.env or .env.local.');
    process.exit(1);
  }

  const bank = loadPromptBank(bookId);
  const outDir = path.join(COLORING_ASSETS_ROOT, bookId);
  fs.mkdirSync(outDir, { recursive: true });

  let pagesSubset = explicitPages;
  if (!pagesSubset && isSmoke) {
    pagesSubset = smokeSelection(bank);
    console.log(`🔥 Smoke mode — one page per section: [${pagesSubset.join(', ')}]`);
  }

  const targets = bank.prompts.filter(
    (p) => pagesSubset === null || pagesSubset === undefined || pagesSubset.includes(p.idx),
  );
  if (targets.length === 0) {
    console.error(`No prompts matched. pagesSubset=${JSON.stringify(pagesSubset)}`);
    process.exit(2);
  }

  console.log(
    `\n📖 ${bank.title || bookId}\n` +
      `   ${targets.length} of ${bank.prompts.length} pages → ${path.relative(REPO_ROOT, outDir)}\n` +
      `   model=${process.env.IMAGE_MODEL || 'gemini-3-pro-image-preview'}, ` +
      `aspect=3:4, resolution=4K\n`,
  );

  const svc = new ImageGenerationService({
    apiKey: process.env.GEMINI_API_KEY,
    model: process.env.IMAGE_MODEL, // defaults to gemini-3-pro-image-preview
    outputDir: outDir,
  });

  const results = [];
  for (const entry of targets) {
    const filename = `page_${String(entry.idx).padStart(2, '0')}.png`;
    const finalPath = path.join(outDir, filename);

    if (skipExisting && fs.existsSync(finalPath)) {
      console.log(`⏭️  ${filename} — exists, skipping`);
      results.push({ ok: true, skipped: true, idx: entry.idx });
      continue;
    }

    const prompt = buildPrompt(bank, entry);
    const subjectPreview =
      entry.subject.length > 80 ? `${entry.subject.slice(0, 77)}...` : entry.subject;
    console.log(`\n🎨 page ${String(entry.idx).padStart(2, '0')} [${entry.section}]`);
    console.log(`   ${subjectPreview}`);

    const t0 = Date.now();
    try {
      const result = await svc.generate({
        prompt,
        aspectRatio: '3:4',
        resolution: '4K',
        taskId: `coloring-${bookId}-page-${entry.idx}`,
      });
      // Service writes <slug>-<ts>-<rand>.png; rename to canonical page_NN.png
      // so the Python book module can load it deterministically.
      const tempPath = path.join(outDir, result.filename);
      // If a previous attempt left page_NN.png in place, remove it before rename.
      if (fs.existsSync(finalPath)) fs.unlinkSync(finalPath);
      fs.renameSync(tempPath, finalPath);
      const ms = Date.now() - t0;
      const mb = (result.bytes / (1024 * 1024)).toFixed(2);
      console.log(`   ✅ ${mb} MB in ${(ms / 1000).toFixed(1)}s → ${filename}`);
      results.push({ ok: true, idx: entry.idx, path: finalPath, bytes: result.bytes, ms });
    } catch (err) {
      console.error(`   ❌ ${err.message}`);
      results.push({ ok: false, idx: entry.idx, error: err.message });
    }
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log('\n──────────────────────────────────────────────');
  const ok = results.filter((r) => r.ok && !r.skipped).length;
  const skipped = results.filter((r) => r.skipped).length;
  const failed = results.filter((r) => !r.ok);
  console.log(`Generated: ${ok}   Skipped: ${skipped}   Failed: ${failed.length}`);
  if (failed.length) {
    console.log('\nFailures:');
    for (const f of failed) console.log(`  - page ${f.idx}: ${f.error}`);
  }
  console.log(`\nOutput: ${path.relative(REPO_ROOT, outDir)}`);

  process.exit(failed.length === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
