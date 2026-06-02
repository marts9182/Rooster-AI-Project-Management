import fs from 'fs';

const path = 'c:/Sandbox/AIProjectManagement/Rooster-AI-Project-Management/data/tasks.json';
const tasks = JSON.parse(fs.readFileSync(path, 'utf-8'));
const now = new Date().toISOString();

const make = (id, title, slug, paletteConst, target) => ({
  id,
  project_id: 'proj-pocket-rooster-press',
  sprint_id: 'sprint-8',
  title,
  status: 'backlog',
  priority: 'high',
  created_at: now,
  updated_at: now,
  description:
    `Build the ${slug} entry in the Pocket Rooster Press "Bold & Easy" coloring line. ` +
    `45 cozy line-art designs at 8.5x11, single-sided, AI-rendered via Nano Banana Pro and hand-processed to 1-bit B&W. ` +
    `Cover hero in the new PALETTE_${paletteConst} palette using the storybook "sampler" convention (one fully-colored element + uncolored line-art surroundings). ` +
    `Full KDP bundle (interior.pdf + cover.pdf + metadata + listing + preflight + upload checklist) ready in output/kdp-ready/. ` +
    `Listing copy and upload guide ready for go-live around ${target}. ` +
    `Implementation approach: create book module in src/pocket_rooster_press/books/, register in cli.BOOK_MODULES, add CoverSpec, add 45-prompt JSON bank, run two-stage generation pipeline, build and preflight the bundle.`,
  acceptance_criteria: [
    `Book module at src/pocket_rooster_press/books/bold_easy_${slug.replace(/-/g, '_')}_v1.py registered in cli.BOOK_MODULES`,
    `Palette PALETTE_${paletteConst} present in config.py`,
    `Cover spec entry in covers/specs.py and generate_kdp_covers.mjs for bold-easy-${slug}-v1`,
    `45-prompt JSON bank at data/coloring_prompts/bold-easy-${slug}-v1.json with style_preamble, 5 sections of 9 prompts each`,
    'All 45 interior pages generated and processed to 1-bit B&W',
    'Cover hero wrap generated via Nano Banana Pro',
    'Bundle built with preflight Result: PASS at ~95 pages',
    `Metadata JSON + listing.md in metadata/ named bold_easy_${slug.replace(/-/g, '_')}_v1.*`,
    `KDP upload guide at docs/KDP_UPLOAD_GUIDE_BOLD_EASY_${slug.replace(/-/g, '_').toUpperCase()}_V1.md`,
    `Listing copy notes the ${target} go-live target and the Amazon newness-window rationale`,
    'Cozy-not-spooky / cozy-not-glossy palette discipline maintained — no horror tropes, no plastic Santa',
    'Task walked through analyze/develop/ready_for_test/testing/ready_for_acceptance/accepted via the Rooster API'
  ]
});

const additions = [
  make(
    'task-prp-bold-easy-cozy-halloween-v1',
    'PRP — Bold & Easy Cozy Halloween Vol. 1 (45 designs)',
    'cozy-halloween',
    'COZY_HALLOWEEN',
    'mid-July 2026'
  ),
  make(
    'task-prp-bold-easy-cozy-christmas-v1',
    'PRP — Bold & Easy Cozy Christmas Vol. 1 (45 designs)',
    'cozy-christmas',
    'COZY_CHRISTMAS',
    'mid-September 2026'
  )
];

// Avoid duplicate appends if rerun.
const existing = new Set(tasks.map((t) => t.id));
const fresh = additions.filter((t) => !existing.has(t.id));
tasks.push(...fresh);
fs.writeFileSync(path, JSON.stringify(tasks, null, 2), 'utf-8');
console.log(`Added ${fresh.length} task(s). New total: ${tasks.length}`);
