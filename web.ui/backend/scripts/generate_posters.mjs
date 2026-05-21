#!/usr/bin/env node
/**
 * Generate printable poster master PNG via Nano Banana Pro (Gemini 3 Pro
 * Image) for a given poster id. One PNG per poster, 4K, 3:4 portrait.
 *
 * Mirrors generate_coloring_interiors.mjs:
 *   - reads <kdp>/data/poster_prompts/<poster_id>.json
 *   - calls ImageGenerationService at aspectRatio="3:4", resolution="4K"
 *   - writes <kdp>/assets/generated/posters/<poster_id>/master.png
 *
 * Usage (from web.ui/backend/):
 *
 *   node scripts/generate_posters.mjs cottagecore-mushroom-poster-v1
 *   node scripts/generate_posters.mjs cottagecore-mushroom-poster-v1 --skip-existing
 *
 * Mandatory Etsy AI disclosure: the master art is AI-generated. The
 * Python listing template already includes the disclosure sentence.
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
const PROMPTS_DIR = path.join(KDP_ROOT, 'data', 'poster_prompts');
const POSTERS_ASSETS_ROOT = path.join(KDP_ROOT, 'assets', 'generated', 'posters');

dotenv.config({ path: path.join(BACKEND_DIR, '.env') });
dotenv.config({ path: path.join(BACKEND_DIR, '.env.local'), override: true });

function loadPromptBank(posterId) {
  const p = path.join(PROMPTS_DIR, `${posterId}.json`);
  if (!fs.existsSync(p)) {
    throw new Error(
      `No prompt bank found for "${posterId}" at ${path.relative(REPO_ROOT, p)}.`,
    );
  }
  const bank = JSON.parse(fs.readFileSync(p, 'utf-8'));
  for (const field of ['style_preamble', 'subject', 'theme_tags']) {
    if (!bank[field]) {
      throw new Error(`Prompt bank for "${posterId}" missing field "${field}".`);
    }
  }
  return bank;
}

function buildPrompt(bank) {
  // style_preamble ends with "Subject:" so we just append the subject.
  return `${bank.style_preamble} ${bank.subject}`;
}

function parseArgs(argv) {
  const args = argv.slice(2);
  const posterId = args.find((a) => !a.startsWith('--'));
  const skipExisting = args.includes('--skip-existing');
  return { posterId, skipExisting };
}

async function main() {
  const { posterId, skipExisting } = parseArgs(process.argv);
  if (!posterId) {
    console.error('Usage: node scripts/generate_posters.mjs <poster-id> [--skip-existing]');
    process.exit(2);
  }
  if (!process.env.GEMINI_API_KEY) {
    console.error('GEMINI_API_KEY is not set. Add it to web.ui/backend/.env.local.');
    process.exit(1);
  }

  const outDir = path.join(POSTERS_ASSETS_ROOT, posterId);
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, 'master.png');
  if (skipExisting && fs.existsSync(outPath)) {
    console.log(`⏭️  ${posterId} master.png exists, skipping`);
    return;
  }

  const bank = loadPromptBank(posterId);
  const prompt = buildPrompt(bank);

  console.log(`🎨 Generating master for ${posterId}`);
  console.log(`   prompt length: ${prompt.length} chars`);

  const svc = new ImageGenerationService({
    apiKey: process.env.GEMINI_API_KEY,
    model: process.env.IMAGE_MODEL, // defaults to gemini-3-pro-image-preview
    outputDir: outDir,
  });

  const t0 = Date.now();
  const result = await svc.generate({
    prompt,
    aspectRatio: '3:4',
    resolution: '4K',
    taskId: `poster-${posterId}`,
  });
  // ImageGenerationService writes <slug>-<ts>-<rand>.png; rename to canonical.
  fs.renameSync(path.join(outDir, result.filename), outPath);
  const ms = Date.now() - t0;
  const kb = Math.round(result.bytes / 1024);
  console.log(`   ✅ ${kb} KB in ${(ms / 1000).toFixed(1)}s → ${path.relative(REPO_ROOT, outPath)}`);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
