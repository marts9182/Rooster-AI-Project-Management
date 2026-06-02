// generate_novel_cover.mjs — drive Nano Banana Pro to make cover ART (no text)
// for the novel "Anna Sen Mennä". Writes high-res PNG candidates into the novel's
// cover folder. Run from web.ui/backend so @google/genai + the service resolve:
//   node scripts/generate_novel_cover.mjs            # all candidates
//   node scripts/generate_novel_cover.mjs a          # just candidate "a"
//
// Reads GEMINI_API_KEY from web.ui/backend/.env.local (never logged).

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ImageGenerationService } from "../ImageGenerationService.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BACKEND = path.resolve(HERE, "..");
const REPO = path.resolve(BACKEND, "..", "..");
const OUT_DIR = path.join(
  REPO,
  "projects",
  "kdp-puzzle-press",
  "first_book",
  "files",
  "cover",
);

function loadKey() {
  for (const f of [".env.local", ".env"]) {
    const p = path.join(BACKEND, f);
    if (!fs.existsSync(p)) continue;
    const m = fs.readFileSync(p, "utf8").match(/^\s*GEMINI_API_KEY\s*=\s*(.+)\s*$/m);
    if (m) return m[1].trim().replace(/^["']|["']$/g, "");
  }
  throw new Error("GEMINI_API_KEY not found in web.ui/backend/.env.local");
}

const STYLE =
  "Vertical book-cover composition, cinematic and atmospheric, fine-art quality, " +
  "painterly photographic realism, moody and deeply restrained, serious literary " +
  "folk-horror (not gory, not cheesy). Desaturated palette of deep midnight blue, " +
  "slate, charcoal and bone white, with a single small warm ember-red glow as the " +
  "only warm light. Soft winter dusk light, subtle film grain, real depth and " +
  "atmosphere. Calm, generous negative space in the upper third (open bruise-blue " +
  "dusk sky) and quieter space toward the lower third, for later title typography. " +
  "Absolutely no text, no lettering, no words, no numbers, no watermark, no " +
  "signature, no logos, no people, no faces, no animals.";

const CANDIDATES = [
  {
    id: "a-hero",
    prompt:
      "A small weathered dark-wood Finnish lakeside sauna standing on heavy timber " +
      "pilings out over a frozen lake at winter dusk. One tiny window in the sauna " +
      "glows a faint ember red, the only warm light in a cold world. Behind it a " +
      "dense wall of black pine forest; all around, a vast flat expanse of pale " +
      "snow-dusted lake ice faintly webbed with cracks. Low heavy sky. The scene is " +
      "still and quietly wrong, as if something waits beneath the ice. Wide, " +
      "slightly distant framing; the sauna sits low-center with open sky above. " +
      STYLE,
  },
  {
    id: "b-iconic",
    prompt:
      "Minimal iconic composition: a single small near-black silhouette of a Finnish " +
      "over-water sauna on pilings, far out on an immense pale frozen lake, dwarfed " +
      "by towering dark pines along the horizon. One pinprick of ember-red light in " +
      "its window. Vast bone-white ice foreground with delicate radiating cracks; " +
      "deep desaturated blue dusk sky filling the upper half. Strong, simple, " +
      "high-contrast shapes that read clearly even at thumbnail size. Lonely, " +
      "ominous, restrained. " +
      STYLE,
  },
  {
    id: "c-ice",
    prompt:
      "Low-angle winter-dusk view across a frozen lake: the foreground is pale " +
      "cracked lake ice, the radiating fracture lines drawing the eye toward a small " +
      "dark over-water sauna in the middle distance, its single window glowing faint " +
      "ember red. Black pines crowd the far shore under a heavy slate sky. Beneath " +
      "the ice the water is very dark; a faint, ambiguous deeper shadow suggests " +
      "something there without ever showing it. Eerie, literary, atmospheric. Upper " +
      "third is open dusk sky. " +
      STYLE,
  },
];

async function main() {
  const only = process.argv[2];
  const picks = only ? CANDIDATES.filter((c) => c.id.startsWith(only)) : CANDIDATES;
  if (picks.length === 0) {
    console.error(`No candidate matches "${only}". Options: ${CANDIDATES.map((c) => c.id).join(", ")}`);
    process.exit(1);
  }
  const svc = new ImageGenerationService({ apiKey: loadKey(), outputDir: OUT_DIR });
  for (const c of picks) {
    process.stdout.write(`Generating ${c.id} (4K, 9:16) ... `);
    try {
      const r = await svc.generate({
        prompt: c.prompt,
        aspectRatio: "9:16",
        resolution: "4K",
        taskId: `anna-cover-${c.id}`,
      });
      console.log(`OK -> cover/${r.filename} (${(r.bytes / 1024).toFixed(0)} KB)`);
    } catch (err) {
      console.log("FAILED");
      console.error(`  ${err.message}`);
    }
  }
  console.log(`\nDone. Candidates in: ${OUT_DIR}`);
}

main();
