#!/usr/bin/env node
/**
 * Generate N printable wall-art images via Nano Banana Pro for one SET.
 *
 * Mirrors generate_posters.mjs but iterates over a set's `prints` array.
 * Set prompt bank format (JSON):
 *   {
 *     "set_id": "cottagecore-kitchen-set-v1",
 *     "title": "Cottagecore Kitchen Wall Art",
 *     "subtitle": "6-Print Botanical Set for the Cozy Kitchen",
 *     "style_preamble": "...",
 *     "theme_tags": ["..."],
 *     "prints": [
 *       { "slug": "01-herb-jars", "subject": "..." },
 *       { "slug": "02-teapot",    "subject": "..." },
 *       ...
 *     ]
 *   }
 *
 * Output:
 *   <kdp>/assets/generated/poster_sets/<set_id>/<slug>.png
 *
 * Usage:
 *   node scripts/generate_poster_sets.mjs cottagecore-kitchen-set-v1
 *   node scripts/generate_poster_sets.mjs cottagecore-kitchen-set-v1 --skip-existing
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
const PROMPTS_DIR = path.join(KDP_ROOT, 'data', 'poster_set_prompts');
const SETS_ASSETS_ROOT = path.join(KDP_ROOT, 'assets', 'generated', 'poster_sets');

dotenv.config({ path: path.join(BACKEND_DIR, '.env') });
dotenv.config({ path: path.join(BACKEND_DIR, '.env.local'), override: true });


function loadSetBank(setId) {
  const p = path.join(PROMPTS_DIR, `${setId}.json`);
  if (!fs.existsSync(p)) {
    throw new Error(
      `No set prompt bank found for "${setId}" at ${path.relative(REPO_ROOT, p)}.`,
    );
  }
  const bank = JSON.parse(fs.readFileSync(p, 'utf-8'));
  for (const field of ['set_id', 'title', 'style_preamble', 'theme_tags', 'prints']) {
    if (!bank[field]) {
      throw new Error(`Set prompt bank for "${setId}" missing field "${field}".`);
    }
  }
  if (!Array.isArray(bank.prints) || bank.prints.length === 0) {
    throw new Error(`Set prompt bank for "${setId}" has no prints in the array.`);
  }
  for (const [i, pr] of bank.prints.entries()) {
    if (!pr.slug || !pr.subject) {
      throw new Error(
        `Set "${setId}" print ${i} missing required "slug" or "subject" field.`,
      );
    }
  }
  return bank;
}


function buildPrintPrompt(bank, print) {
  return `${bank.style_preamble} ${print.subject}`;
}


function parseArgs(argv) {
  const args = argv.slice(2);
  const setId = args.find((a) => !a.startsWith('--'));
  const skipExisting = args.includes('--skip-existing');
  return { setId, skipExisting };
}


async function main() {
  const { setId, skipExisting } = parseArgs(process.argv);
  if (!setId) {
    console.error('Usage: node scripts/generate_poster_sets.mjs <set-id> [--skip-existing]');
    process.exit(2);
  }
  if (!process.env.GEMINI_API_KEY) {
    console.error('GEMINI_API_KEY is not set. Add it to web.ui/backend/.env.local.');
    process.exit(1);
  }

  const outDir = path.join(SETS_ASSETS_ROOT, setId);
  fs.mkdirSync(outDir, { recursive: true });

  const bank = loadSetBank(setId);
  console.log(`🎨 Generating ${bank.prints.length} prints for set "${setId}"`);

  const svc = new ImageGenerationService({
    apiKey: process.env.GEMINI_API_KEY,
    model: process.env.IMAGE_MODEL, // defaults to gemini-3-pro-image-preview
    outputDir: outDir,
  });

  let generated = 0;
  let skipped = 0;
  for (const print of bank.prints) {
    const outPath = path.join(outDir, `${print.slug}.png`);
    if (skipExisting && fs.existsSync(outPath)) {
      console.log(`   ⏭️  ${print.slug}.png exists, skipping`);
      skipped += 1;
      continue;
    }
    const prompt = buildPrintPrompt(bank, print);
    const t0 = Date.now();
    const result = await svc.generate({
      prompt,
      aspectRatio: '3:4',
      resolution: '4K',
      taskId: `set-${setId}-${print.slug}`,
    });
    fs.renameSync(path.join(outDir, result.filename), outPath);
    const ms = Date.now() - t0;
    const kb = Math.round(result.bytes / 1024);
    console.log(`   ✅ ${print.slug} (${kb} KB in ${(ms / 1000).toFixed(1)}s)`);
    generated += 1;
  }

  console.log(`Done: ${generated} generated, ${skipped} skipped → ${path.relative(REPO_ROOT, outDir)}`);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
