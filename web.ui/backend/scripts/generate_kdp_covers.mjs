#!/usr/bin/env node
/**
 * Generate KDP wrap-cover hero PNGs for all 17 unreleased Pocket Rooster
 * Press books via Nano Banana Pro (Gemini 3 Pro Image).
 *
 * Lives in web.ui/backend/scripts/ so the bare `dotenv`, `@google/genai`,
 * and the local `ImageGenerationService` import all resolve against the
 * backend's node_modules. Run from the backend directory:
 *
 *   cd web.ui/backend
 *   node scripts/generate_kdp_covers.mjs              # all 20
 *   node scripts/generate_kdp_covers.mjs <book-id>    # single book
 *   node scripts/generate_kdp_covers.mjs --skip-existing
 *
 * Output: projects/kdp-puzzle-press/assets/generated/wraps/<book-id>.png
 * The first 3 entries in COVER_SPECS (travel-sudoku-v1,
 * ancient-wisdom-cryptograms, gardeners-word-search) are REFRESH-APPROVED
 * live books being re-released with new sales-first covers — they appear
 * here intentionally. Any other already-live book must NOT be in COVER_SPECS.
 * Prompt builder is a faithful port of pocket_rooster_press.mcp_server.
 * prompts.book_cover_prompt(sales_first=True) so briefs match what the
 * Python pipeline already validates against (covers/specs.py).
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
const WRAPS_DIR = path.join(KDP_ROOT, 'assets', 'generated', 'wraps');
const BACKUP_DIR = path.join(WRAPS_DIR, '_pollinations_backup');

dotenv.config({ path: path.join(BACKEND_DIR, '.env') });
dotenv.config({ path: path.join(BACKEND_DIR, '.env.local'), override: true });

// ── Prompt builder (port of mcp_server/prompts.py book_cover_prompt) ────────

const COVER_STYLE_FRAGMENTS = {
  vintage_illustrative:
    'vintage editorial illustration, warm muted palette, mid-century print feel',
  modern_minimal:
    'clean modern flat illustration, restrained palette, generous negative space',
  watercolor: 'soft watercolor wash, hand painted texture, natural pigment bleed',
  woodcut: 'block print woodcut style, high contrast, hand carved line texture',
  art_deco: 'art deco style, symmetrical geometry, gold accents on deep jewel tones',
  storybook:
    'warm storybook illustration, gentle character art, inviting picture book mood',
};

/**
 * Build a Gemini-friendly cover prompt with the same sales-first directives
 * the Python pipeline emits. Returns a single string — Gemini takes one
 * text prompt; no separate negative prompt channel like FLUX, so anti-
 * directives get folded into the positive prompt.
 */
function buildCoverPrompt({ theme, style, mood, title_position }) {
  const styleFrag = COVER_STYLE_FRAGMENTS[style];
  if (!styleFrag) throw new Error(`Unknown style "${style}"`);
  const moodFrag = mood ? `, ${mood} mood` : '';

  let layoutFrag;
  if (title_position === 'bottom') {
    layoutFrag =
      ', strong negative space at the bottom third for title placement, focal point in the upper two thirds';
  } else if (title_position === 'centered_overlay') {
    layoutFrag =
      ', balanced symmetric composition with breathable negative space around the focal point for centered title overlay';
  } else {
    layoutFrag =
      ', strong negative space at the top third for title placement, focal point in the lower two thirds';
  }

  const salesFrag =
    ', single dominant focal point occupying 60 to 75 percent of canvas, ' +
    'high contrast against a single dominant color block, ' +
    'magazine cover boldness, thumbnail readable at small size, ' +
    'boutique greeting card aesthetic, dramatic lighting, ' +
    'cinematic minimalism, no busy backgrounds';

  // Anti-typography directives are critical: cover_builder.py overlays the
  // title itself, so any letters baked into the hero will collide with it.
  const avoidFrag =
    ', absolutely no text, no typography, no letters, no words, no captions, ' +
    'no title, no author name, no signature, no watermark, no logo, ' +
    'no busy background, no cluttered scenes, no multiple subjects, ' +
    'no low contrast, no muddy palette, no washed out colors';

  return (
    `book cover illustration, ${theme}, ` +
    `${styleFrag}${moodFrag}${salesFrag}${layoutFrag}` +
    `${avoidFrag}, ` +
    'high quality professional book cover art, sharp focus, print-ready'
  );
}

// ── 20 sales-first cover specs (mirror of covers/specs.py) ────────────────
// The first 3 entries are REFRESH-APPROVED live books — re-released with new
// sales-first wraps to leverage Amazon recency boost. Each Vol. 1 series-
// matches its Vol. 2 sibling further down: same style, palette, mood;
// earlier-arc focal element.

const COVER_SPECS = [
  {
    book_id: 'travel-sudoku-v1',
    title: 'Travel Sudoku — Pocket Edition',
    theme:
      'a single oversized antique brass compass rose resting open on a folded vintage world map, dotted travel-route lines radiating outward across the parchment, sepia and travel-blue palette, soft paper texture, no readable place names anywhere, the compass fills ~65% of the frame, journey-beginning energy',
    style: 'vintage_illustrative',
    mood: 'journey-beginning, bold, thumbnail-readable, editorial',
    title_position: 'top',
  },
  {
    book_id: 'ancient-wisdom-cryptograms',
    title: 'Cryptograms of Ancient Wisdom',
    theme:
      'a single weathered marble column standing alone in a barren stoic landscape, golden-hour shadow stretching long across cracked dry earth, austere classical palette of warm stone and deep ochre and ember-red, no human figure, no foliage, no readable inscriptions, deep negative space at the top, the column fills ~60% of the frame',
    style: 'vintage_illustrative',
    mood: 'austere, stoic, golden-hour drama, museum-poster',
    title_position: 'top',
  },
  {
    book_id: 'gardeners-word-search',
    title: "Gardener's Word Search — Large Print",
    theme:
      'a single oversized peony bloom in soft coral and blush at the center of the frame, one bumblebee approaching the bloom from the side, deep emerald foliage edging the corners, watercolor wash, early-summer garden first-flush energy, the bloom fills ~75% of the frame, magazine-cover bold',
    style: 'watercolor',
    mood: 'abundant, vivid, thumbnail-readable, early-summer-bold',
    title_position: 'top',
  },
  {
    book_id: 'travel-sudoku-v2',
    title: 'Travel Sudoku Vol. 2',
    theme:
      'a single oversized passport stamp graphic in deep ink against a vintage cartographic field, the stamp circle dominating ~70% of the frame, sepia and travel-blue palette, soft paper texture, no readable letters or words inside the stamp',
    style: 'vintage_illustrative',
    mood: 'next-chapter, bold, thumbnail-readable, editorial',
    title_position: 'top',
  },
  {
    book_id: 'ancient-wisdom-cryptograms-v2',
    title: 'Cryptograms of Ancient Wisdom Vol. 2',
    theme:
      'a single weathered laurel wreath resting on cracked white marble, stark golden-hour shadow stretching to one side, austere stoic palette, the wreath fills ~65% of the frame, no human figure, absolute negative space at the top',
    style: 'vintage_illustrative',
    mood: 'austere, stoic, golden-hour drama, museum-poster',
    title_position: 'top',
  },
  {
    book_id: 'gardeners-word-search-v2',
    title: "Gardener's Word Search Vol. 2",
    theme:
      'a single perfect sunflower face filling ~75% of the frame, one honey bee on a petal, vivid yellow against deep summer blue sky, peak-summer abundance, magazine-cover bold',
    style: 'watercolor',
    mood: 'abundant, vivid, thumbnail-readable, summer-bold',
    title_position: 'top',
  },
  {
    book_id: 'kakuro-quiet-minds',
    title: 'Kakuro for Quiet Minds',
    theme:
      'a single glowing kakuro grid rendered as luminous brass digits on a deep teal field, the grid floats centered with subtle radial glow, geometric and arresting like a vintage record album cover, the puzzle itself is the hero, no clutter, no human figure',
    style: 'modern_minimal',
    mood: 'calm focus, geometric, premium, magazine-cover bold',
    title_position: 'top',
  },
  {
    book_id: 'kjv-proverbs-cryptograms',
    title: 'KJV Proverbs Cryptograms',
    theme:
      'a single dramatic shaft of stained-glass light striking the gilt-edged page of an open King James Bible at the center, ecclesiastical purple and antique gold rim-light, jewel tones, no human figure, sacred but contemporary, top half is luminous negative space for the title',
    style: 'vintage_illustrative',
    mood: 'reverent, sacred, dramatic light, devotional',
    title_position: 'top',
  },
  {
    book_id: 'backyard-birdwatcher',
    title: 'Backyard Birdwatcher Word Search',
    theme:
      'a single male cardinal in flight against a soft dawn sky, wings spread, mid-motion, the cardinal occupies ~55% of the frame, soft watercolor leaf-and-vine border vignette, gift-shop coffee-table feel, dawn rose and gold gradient',
    style: 'watercolor',
    mood: 'gentle morning, gift-shop premium, audubon-classic',
    title_position: 'top',
  },
  {
    book_id: 'knit-crochet-word-search',
    title: 'Knit & Crochet Word Search',
    theme:
      'a single perfect skein of rust-colored wool yarn with a wooden knitting needle threaded through it, resting on warm cream linen fabric, dramatic side lighting, tactile photography feel, the skein dominates ~70% of the frame',
    style: 'storybook',
    mood: 'tactile, autumnal, premium-craft, instagram-worthy',
    title_position: 'top',
  },
  {
    book_id: 'garden-companion',
    title: "The Gardener's Companion",
    theme:
      'a single hand-drawn botanical pencil sketch of a tomato vine with three ripening fruits, executed as a vintage seed-catalog cover illustration on cream linen background, fine engraved line work, almanac-formal',
    style: 'watercolor',
    mood: 'vintage seed-catalog, almanac, hopeful, planner-premium',
    title_position: 'top',
  },
  {
    book_id: 'large-print-sudoku-grandparents',
    title: 'Large Print Sudoku for Grandparents',
    theme:
      'a single pair of reading glasses resting at an angle on the open page of a large-print sudoku book, soft warm window light, sage-and-honey palette, gentle shadow, gift-shop premium, the glasses+page composition fills ~65% of the frame',
    style: 'storybook',
    mood: 'warm, generational, gift-shop ready, thumbnail-friendly',
    title_position: 'top',
  },
  {
    book_id: 'christmas-word-search-seniors',
    title: 'Christmas Word Search — Large Print for Seniors',
    theme:
      'one perfect glass ornament hanging on a single snow-dusted fir branch, the ornament catches a small reflected light, deep cardinal red ornament against forest-green needles and white snow, premium boutique-card feel, tight focus on the single ornament filling ~55% of the frame',
    style: 'vintage_illustrative',
    mood: 'classic Christmas, hearth-warm, boutique-greeting-card',
    title_position: 'top',
  },
  {
    book_id: 'halloween-word-search',
    title: 'Halloween Word Search — Large Print',
    theme:
      'a single black cat silhouette with arched back perched atop a single glowing jack-o-lantern, full moon backdrop, ultra-high contrast pumpkin-orange against ink-black, cinematic noir lighting, no human figure, the cat-and-pumpkin composition is the entire focal point',
    style: 'storybook',
    mood: 'cinematic noir, October moonlight, playful spooky not horror',
    title_position: 'top',
  },
  {
    book_id: 'thanksgiving-word-search-seniors',
    title: 'Thanksgiving Word Search — Large Print for Seniors',
    theme:
      'a single perfectly preserved maple leaf in deep amber and burnt-orange, laid flat on a burnt-orange linen runner, one cinnamon stick beside it, harvest-gold accents, soft late-afternoon light, the leaf fills ~60% of the frame',
    style: 'watercolor',
    mood: 'harvest abundance, gratitude, gentle late-autumn light',
    title_position: 'top',
  },
  {
    book_id: 'patriotic-american-word-search',
    title: 'Patriotic American Word Search — Large Print',
    theme:
      'a single eagle silhouette in flight against an oversized folded American flag in the background, navy and weathered red and ivory, dignified and sincere, no crowd, no human figure, high contrast monumental composition',
    style: 'vintage_illustrative',
    mood: 'dignified, sincere, monumental, Americana-classic',
    title_position: 'top',
  },
  {
    book_id: 'vintage-1950s-word-search',
    title: '1950s Vintage Word Search — Large Print',
    theme:
      'a single neon OPEN sign in turquoise and cherry-red glowing against a deep dusk-blue sky, vintage chrome reflections below, jukebox color story, bold mid-century graphic, the sign dominates ~65% of the frame, no readable letters elsewhere',
    style: 'vintage_illustrative',
    mood: 'rock-and-roll nostalgia, neon-dusk, mid-century bold',
    title_position: 'top',
  },
  {
    book_id: 'valentine-love-poetry-cryptograms',
    title: 'Cryptograms of Love',
    theme:
      'a single hand-pressed red rose laid across a folded ivory love letter sealed with red wax, garnet and ivory palette, soft candlelight from one side, romantic without kitsch, the rose-and-letter composition fills ~60% of the frame',
    style: 'watercolor',
    mood: 'tender epistolary, candlelit, romantic without kitsch',
    title_position: 'top',
  },
  {
    book_id: 'easter-resurrection-cryptograms',
    title: 'Easter Cryptograms',
    theme:
      'a single beam of golden sunrise light striking the opening of a stone tomb whose stone has been rolled aside, three white lilies in the foreground at the entrance, ecclesiastical purple gradients shifting to dawn gold, deep negative space at the top of the composition, no human figure',
    style: 'vintage_illustrative',
    mood: 'reverent dawn, hopeful resurrection, sacred drama',
    title_position: 'top',
  },
  {
    book_id: 'bold-easy-cottagecore-mushrooms-v1',
    title: 'Bold & Easy Cottagecore Coloring Book',
    theme:
      "a single oversized hand-drawn mushroom and wildflower scene shown as a coloring-book cover sampler: one large amanita-style mushroom in center is fully colored in terracotta red with cream spots, surrounded by sage-green ferns and small ivory daisies, everything else (background cottage silhouette, smaller mushrooms, leaves) drawn as crisp uncolored black line art on warm cream background, evoking 'sample colored page on an empty page' preview, matte boutique greeting-card feel, terracotta + sage + cream + mustard palette, no human figure, the colored mushroom fills ~55% of the frame",
    style: 'storybook',
    mood: 'cozy cottagecore, hygge gift-shop, bold-line coloring book preview, matte boutique',
    title_position: 'top',
  },
  {
    book_id: 'kjv-psalms-cryptograms',
    title: 'KJV Psalms Cryptograms',
    theme:
      'a single rose-petal pressed at the center of an open hymnbook page, soft jewel-tone stained-glass light bleeding in from one corner, vesper-blue and antique-gold palette, the book fills ~70% of the frame, no human figure, evening-prayer calm',
    style: 'vintage_illustrative',
    mood: 'vesper, devotional, evening prayer, sanctuary calm',
    title_position: 'top',
  },
  {
    book_id: 'bold-easy-songbirds-v1',
    title: 'Bold & Easy Songbirds',
    theme:
      "a single oversized hand-drawn songbird scene shown as a coloring-book cover sampler: one large male Northern Cardinal perched on a bare winter branch is fully colored in vibrant cardinal-red with a clean black face mask and thick orange beak, two small bright-red holly berries beside him are colored, three sage-green holly leaves are partially colored, and everything else (background bare branches, two smaller uncolored chickadee silhouettes, a few unpainted leaves in the corners) is drawn as crisp uncolored black line art on warm cream background, evoking 'sample colored page on an empty page' preview, matte boutique greeting-card feel, cardinal-red + sage-green + warm-umber + cream palette, no human figure, the colored cardinal fills ~55% of the frame",
    style: 'storybook',
    mood: 'cozy nature, quiet morning, bold-line coloring book preview, matte boutique',
    title_position: 'top',
  },
  {
    book_id: 'bold-easy-cute-cats-v1',
    title: 'Bold & Easy Cute Cats',
    theme:
      "a single oversized hand-drawn cozy-cat scene shown as a coloring-book cover sampler: one large fluffy orange tabby cat curled asleep on a folded quilt at the center is fully colored in warm tabby-orange with cream chest and soft sage quilt stripes, a small terracotta plant pot beside the cat is colored with two sage leaves, and everything else (background windowsill silhouette with a teacup, a smaller uncolored kitten silhouette peeking from behind the quilt, a ball of yarn with a loose curling thread) is drawn as crisp uncolored black line art on warm cream background, evoking 'sample colored page on an empty page' preview, matte boutique greeting-card feel, tabby-orange + sage + cream + soft rose palette, no human figure, the colored cat fills ~55% of the frame",
    style: 'storybook',
    mood: 'cozy cat, warm gift-shop, bold-line coloring book preview, matte boutique',
    title_position: 'top',
  },
  {
    book_id: 'bold-easy-cozy-halloween-v1',
    title: 'Bold & Easy Cozy Halloween',
    theme:
      "a single oversized hand-drawn cozy-Halloween scene shown as a coloring-book cover sampler: one large round pumpkin at the center is fully colored in warm pumpkin-orange with a soft curling stem and one green leaf, a small black cat sitting upright beside the pumpkin is fully colored in soft mauve-black with cream chest, a tall white pillar candle behind has a small mauve-plum flame, and everything else (background porch silhouette with a hanging lantern, a smaller uncolored toadstool mushroom in the foreground, three uncolored autumn leaves curling at the edges) is drawn as crisp uncolored black line art on warm cream background, evoking 'sample colored page on an empty page' preview, matte boutique greeting-card feel, pumpkin-orange + mauve-plum + cream palette, no human figure, no creepy faces, no horror imagery, the colored pumpkin and cat together fill ~55% of the frame",
    style: 'storybook',
    mood: 'cozy fall, witchcore-adjacent gift-shop, bold-line coloring book preview, matte boutique, not spooky',
    title_position: 'top',
  },
  {
    book_id: 'bold-easy-cozy-christmas-v1',
    title: 'Bold & Easy Cozy Christmas',
    theme:
      "a single oversized hand-drawn cozy-Christmas scene shown as a coloring-book cover sampler: one large bright male Northern Cardinal perched on a snow-dusted evergreen branch at the center is fully colored in warm holly-red with a clean black face mask and orange beak, two small holly berries beside the bird are colored holly-red, three evergreen needles are colored deep evergreen, a small tied bow at the base of the branch is colored holly-red, and everything else (background cabin window silhouette with one warm window light, a smaller uncolored knitted ornament hanging on a smaller branch, three uncolored snowflakes drifting at the edges) is drawn as crisp uncolored black line art on warm cream background, evoking 'sample colored page on an empty page' preview, matte boutique greeting-card feel, holly-red + evergreen + cream palette, no human figure, no plastic Santa, no commercial elves, the colored cardinal and branch together fill ~55% of the frame",
    style: 'storybook',
    mood: 'cozy Christmas, hygge gift-shop, bold-line coloring book preview, matte boutique, not glossy',
    title_position: 'top',
  },
  {
    book_id: 'large-print-diabetes-log-v1',
    title: 'Large Print Diabetes Log Book for Seniors',
    theme:
      'a single hand-drawn still-life of one small white modern blood glucose meter with a small calm rounded screen resting at a slight angle on top of a closed linen-bound journal, a thin lancet pen beside it, one small sprig of fresh rosemary laying alongside, executed as a vintage 1920s home-almanac frontispiece on warm cream paper background, fine confident pen-and-ink line work with delicate translucent watercolor wash, warm cream + deep teal + antique brass palette with one tiny coral berry accent, no readable text on the meter screen, the still-life fills ~60% of the frame with generous cream margin above and below, dignified almanac-formal',
    style: 'watercolor',
    mood: 'vintage household almanac, planner-premium, dignified, gift-shop coffee-table',
    title_position: 'top',
  },
  {
    book_id: 'cgm-companion-logbook-v1',
    title: 'CGM Companion Logbook',
    theme:
      'a single hand-drawn flat editorial illustration of one sleek smartphone laying perfectly flat viewed straight on from directly above, the screen shows one soft glowing cool teal line graph trending gently across with a paler band around the median line, executed as a sophisticated Sunday New York Times wellness-section column header on cool cream paper background, clean confident vector-style line work with subtle paper grain texture, cool deep teal dominant palette with one warm coral dot accent and warm cream highlights, no readable text or numbers or app icons on the phone screen, no brand logos, the phone fills ~50% of the frame centered with generous cool cream margin above and below, modern minimal editorial wellness',
    style: 'modern_minimal',
    mood: 'modern editorial, sophisticated, NYT-wellness-column, premium minimal, calm',
    title_position: 'top',
  },
];

// ── Generation driver ──────────────────────────────────────────────────────

/** Move existing Pollinations wraps aside before we overwrite. Idempotent. */
function backupExistingWraps() {
  if (!fs.existsSync(WRAPS_DIR)) return { moved: 0 };
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const knownIds = new Set(COVER_SPECS.map((s) => s.book_id));
  let moved = 0;
  for (const entry of fs.readdirSync(WRAPS_DIR)) {
    const full = path.join(WRAPS_DIR, entry);
    if (!fs.statSync(full).isFile()) continue;
    if (!entry.endsWith('.png')) continue;
    const id = entry.replace(/\.png$/, '');
    // Only touch the canonical 17. Leaves _iter_*.png and other artefacts alone.
    if (!knownIds.has(id)) continue;
    fs.renameSync(full, path.join(BACKUP_DIR, entry));
    moved += 1;
  }
  return { moved };
}

async function main() {
  const args = process.argv.slice(2);
  const skipExisting = args.includes('--skip-existing');
  const requested = args.filter((a) => !a.startsWith('--'));

  if (!process.env.GEMINI_API_KEY) {
    console.error('GEMINI_API_KEY is not set. Add it to web.ui/backend/.env.local.');
    process.exit(1);
  }

  fs.mkdirSync(WRAPS_DIR, { recursive: true });

  // Pre-flight: back up old wraps (only on a full run, not when targeting one).
  let backupSummary = { moved: 0 };
  if (requested.length === 0) {
    backupSummary = backupExistingWraps();
    console.log(
      `📦 Moved ${backupSummary.moved} existing wrap(s) to ${path.relative(KDP_ROOT, BACKUP_DIR)}`,
    );
  }

  const targets = requested.length
    ? COVER_SPECS.filter((s) => requested.includes(s.book_id))
    : COVER_SPECS;
  if (requested.length && targets.length === 0) {
    console.error(`No spec matched: ${requested.join(', ')}`);
    process.exit(2);
  }

  const svc = new ImageGenerationService({
    apiKey: process.env.GEMINI_API_KEY,
    model: process.env.IMAGE_MODEL, // defaults to gemini-3-pro-image-preview
    outputDir: WRAPS_DIR,
  });

  const results = [];
  for (const spec of targets) {
    const outPath = path.join(WRAPS_DIR, `${spec.book_id}.png`);
    if (skipExisting && fs.existsSync(outPath)) {
      console.log(`⏭️  ${spec.book_id} — exists, skipping`);
      results.push({ ok: true, skipped: true, book_id: spec.book_id });
      continue;
    }

    const prompt = buildCoverPrompt(spec);
    console.log(`\n🎨 ${spec.title}  (${spec.book_id})`);
    console.log(`   style=${spec.style}, mood=${spec.mood}`);

    const t0 = Date.now();
    try {
      const result = await svc.generate({
        prompt,
        aspectRatio: '3:4',
        resolution: '2K',
        taskId: `cover-${spec.book_id}`,
      });
      // The service writes <slug>-<ts>-<rand>.png. Rename to the canonical
      // <book-id>.png cover_builder.py expects.
      const finalPath = path.join(WRAPS_DIR, `${spec.book_id}.png`);
      fs.renameSync(path.join(WRAPS_DIR, result.filename), finalPath);
      const ms = Date.now() - t0;
      const kb = Math.round(result.bytes / 1024);
      console.log(`   ✅ ${kb} KB in ${(ms / 1000).toFixed(1)}s → ${path.basename(finalPath)}`);
      results.push({
        ok: true,
        book_id: spec.book_id,
        path: finalPath,
        bytes: result.bytes,
        ms,
      });
    } catch (err) {
      console.error(`   ❌ ${err.message}`);
      results.push({ ok: false, book_id: spec.book_id, error: err.message });
    }
  }

  // ── Summary ──────────────────────────────────────────────────────────────
  console.log('\n──────────────────────────────────────────────');
  const ok = results.filter((r) => r.ok && !r.skipped).length;
  const skipped = results.filter((r) => r.skipped).length;
  const failed = results.filter((r) => !r.ok);
  console.log(`Generated: ${ok}   Skipped: ${skipped}   Failed: ${failed.length}`);
  if (failed.length) {
    console.log('\nFailures:');
    for (const f of failed) console.log(`  - ${f.book_id}: ${f.error}`);
  }
  console.log(`\nOutput: ${path.relative(KDP_ROOT, WRAPS_DIR)}`);
  if (backupSummary.moved > 0) {
    console.log(`Backup: ${path.relative(KDP_ROOT, BACKUP_DIR)} (${backupSummary.moved} files)`);
  }

  process.exit(failed.length === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
