# Anna Sen Mennä Revision Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Revise the folk-horror novel *Anna Sen Mennä* from a ~33k-word compressed draft into a ~70k-word releasable second draft — deeper literary dread with real mortal stakes, a chronologically rebuilt Act Three, all broken payoffs delivered, and fictionalized cultural institutions held to maximum restraint.

**Architecture:** Extract the single-file HTML manuscript into per-chapter markdown files (`chapters/NN-slug.md`) plus a build script that reassembles them into the KDP ebook HTML. Revise front-to-back, one chapter per task, against concrete per-chapter direction drawn from the spec and the revision diagnostic. Finish with global passes (Finnish thread, naming, flagged-passage brief) and rebuild the deliverables.

**Tech Stack:** Markdown source, Node (`.mjs`, ESM — matches existing `scripts/`) for the build script, the existing ebook HTML/CSS template, pandoc (or existing process) for DOCX.

**Spec:** [`docs/superpowers/specs/2026-06-01-anna-sen-menna-revision-design.md`](../specs/2026-06-01-anna-sen-menna-revision-design.md)
**Diagnostic (per-chapter notes):** [`projects/kdp-puzzle-press/first_book/files/REVISION_DIAGNOSTIC.md`](../../../projects/kdp-puzzle-press/first_book/files/REVISION_DIAGNOSTIC.md)
**Current manuscript:** [`projects/kdp-puzzle-press/first_book/files/anna_sen_menna_kdp_ebook.html`](../../../projects/kdp-puzzle-press/first_book/files/anna_sen_menna_kdp_ebook.html)

---

## Conventions for every chapter task

Working directory for manuscript files: `projects/kdp-puzzle-press/first_book/files/`.

**Word targets are directional, not gates.** Every "target" in this plan is a rough sense of how much *room* a chapter probably needs to do its work scenically — not a quota. **Flow and getting the point across win every time.** Never pad to hit a number; never keep rambling prose because it "fits" the target; never cut a beat that lands just to stay under one. If a chapter does everything it needs in fewer words and reads tight and complete, it is done and under target — that is a success, not a miss. If it genuinely needs more room to breathe, take it. The real test is the read: does it flow, does the dread land, is every sentence earning its place. Treat a target you're far from as a *prompt to ask "is a beat missing, or is this just tight?"* — then answer honestly.

**The per-chapter verification checklist** (the prose equivalent of a passing test). A chapter task is done only when ALL are true:
- [ ] **Flow & completeness:** the chapter reads cleanly start to finish, every required beat lands, and there is no padding or rambling. (This is the primary test — it overrides word count.)
- [ ] Word count is in the rough neighborhood of the target (check: `wc -w chapters/NN-slug.md`). Being notably under is fine if the chapter is complete and tight; being over is fine if every paragraph earns its place. A large gap is a *question to investigate*, not an automatic fix.
- [ ] Every **required beat** listed in the task is present on the page.
- [ ] Every **payoff/flag** listed in the task is landed/marked.
- [ ] Every item in the chapter's **PRESERVE** list is left intact (verbatim or near-verbatim).
- [ ] **Voice check:** dry, laconic, thinks-in-objects; short sentences under stress, long sentences only when armor slips; present tense, close third. No "literary narrator" drift.
- [ ] **Continuity check:** re-read the previous chapter's last 3 paragraphs and this chapter's first 3; day-of-week / timeline / object continuity holds.
- [ ] Cultural-material passages carry an inline flag comment (see Task 1 for the marker format).

**Commit cadence:** one commit per chapter task. Message form: `revise(novel): Ch NN <title> — <one-line summary>`. Stage only the chapter file(s) touched plus any rebuilt deliverable.

**Do not** rewrite from scratch. Expand and deepen the existing prose; keep sentences that work. The diagnostic's "Working" notes mark what to keep.

---

## Phase 0 — Setup: extract chapters + build script

### Task 1: Extract the manuscript into per-chapter markdown files

**Files:**
- Create: `projects/kdp-puzzle-press/first_book/files/chapters/01-the-drive-up.md` … `22-she-does-not-get-far.md` (22 files)
- Read: `projects/kdp-puzzle-press/first_book/files/anna_sen_menna_kdp_ebook.html`

- [ ] **Step 1: Create the chapters directory and one markdown file per chapter.**

Each chapter `<div class="chapter">` in the HTML becomes one file. Strip HTML tags; convert `<em>…</em>` to `*…*`, `<p class="scene-break">&#8212;</p>` to a line containing only `---`. Each file starts with frontmatter:

```markdown
---
number: 1
title: The Drive Up
target_words: 3200
---

<chapter prose as markdown, paragraphs separated by blank lines>
```

Filenames use zero-padded number + kebab-title. Carry the *current* title; retitles happen in their chapter tasks.

- [ ] **Step 2: Define the cultural-flag marker.**

When a passage touches Ojibwe culture, the elder/Louise's dialogue, the ceremony, or the name "Mindemoyen", wrap an HTML comment immediately before it so it survives markdown but never renders:

```markdown
<!-- SENSITIVITY-FLAG: elder dialogue — verify framing with reader -->
```

Add these to existing cultural passages during extraction (Ch 11, 12, 18 primarily) so the brief is seeded.

- [ ] **Step 3: Verify extraction is lossless.**

Run: `wc -w projects/kdp-puzzle-press/first_book/files/chapters/*.md`
Expected: total ≈ 33,000 (±500 for frontmatter/markers). Spot-check 3 files against the HTML for fidelity.

- [ ] **Step 4: Commit.**

```bash
git add projects/kdp-puzzle-press/first_book/files/chapters/
git commit -m "chore(novel): extract manuscript into per-chapter markdown"
```

### Task 2: Build script — reassemble chapters into the ebook HTML

**Files:**
- Create: `projects/kdp-puzzle-press/first_book/files/build_book.mjs`
- Reference (for the HTML/CSS template + title page): `anna_sen_menna_kdp_ebook.html`

- [ ] **Step 1: Write the build script.**

It must: read all `chapters/*.md` in numeric order; parse frontmatter (`number`, `title`); convert markdown paragraphs to `<p>` (first paragraph after the title → `class="first-para"`), `*…*` → `<em>…</em>`, lines of `---` → `<p class="scene-break">&#8212;</p>`; strip `<!-- SENSITIVITY-FLAG … -->` comments from output; wrap each chapter in the existing `<div class="chapter">` structure with `chapter-number`/`chapter-title` paragraphs; emit the full HTML document using the **existing `<style>` block verbatim** and the title page with author **"Seven Martin"**. Output to `anna_sen_menna_kdp_ebook.html`.

- [ ] **Step 2: Run it and diff against the committed HTML.**

Run: `node projects/kdp-puzzle-press/first_book/files/build_book.mjs`
Expected: regenerated HTML is structurally identical to the original except the author line now reads "Seven Martin". Confirm chapter count = 22 and no `SENSITIVITY-FLAG` strings leak into output: `grep -c SENSITIVITY-FLAG anna_sen_menna_kdp_ebook.html` → `0`.

- [ ] **Step 3: Commit.**

```bash
git add projects/kdp-puzzle-press/first_book/files/build_book.mjs projects/kdp-puzzle-press/first_book/files/anna_sen_menna_kdp_ebook.html
git commit -m "build(novel): chapter-to-ebook build script; author=Seven Martin"
```

From here, every chapter task ends by running `build_book.mjs` and skimming the rebuilt chapter for continuity.

---

## Phase 1 — Act One (Ch 1–6): expand in place (~8k → ~10k)

### Task 3: Ch 1 — The Drive Up (target 3,200)

**Files:** Modify `chapters/01-the-drive-up.md`

- [ ] **Step 1: Revise.** Required beats / changes (+~400 words):
  - Expand the **radio-cuts-out** beat (~+150 words): hold the silence; Aino's mind reaching for explanations (signal, hills, trees), each failing; the specific quality of the silence before the man's voice returns mid-sentence.
  - Let the **Watersmeet** sign snag the eye — it will matter; don't bury it in a parenthetical. *(Note: town renamed in Task 27; leave as "Watersmeet" for now.)*
  - Slow the **porch-light flicker** (one, two, three) — a breath before "Old wiring, she thinks."
  - **PRESERVE:** the entire opening sequence (radiator → coffee → Subaru → highway → percolator-thought). Do not touch.
- [ ] **Step 2:** Run the per-chapter verification checklist.
- [ ] **Step 3:** `node build_book.mjs`; skim Ch 1 in the HTML for continuity into Ch 2.
- [ ] **Step 4:** Commit: `revise(novel): Ch 01 The Drive Up — slow the radio + porch-light dread`.

### Task 4: Ch 2 — Hakala's (target 2,700)

**Files:** Modify `chapters/02-hakalas.md`

- [ ] **Step 1: Revise (+~500).**
  - Funeral home: give Gerald's office a specific snag — the way he says her father's name, or a file older than it should be.
  - After Paavo's "Stay off the lake," let the warning settle into Aino's body — she watches soundless hockey, thinks about footprints; the warning lands in her ribs, not just her ear.
  - Strengthen the drive home — the road choice (the long way, away from the lake) is good but underwritten; give it interior weight.
  - **PRESERVE:** Paavo Maki's presence; the bar's texture (Leinenkugel's sign, hockey on mute, fifty years of cigarettes); the doubled "stay off the lake."
- [ ] **Step 2–4:** Verify; rebuild; commit `revise(novel): Ch 02 Hakala's — Gerald snag + Paavo's warning in the body`.

### Task 5: Ch 3 — The House (target 3,400)

**Files:** Modify `chapters/03-the-house.md`

- [ ] **Step 1: Revise (+~700).**
  - **Carved marks** (first setup): she traces one with a finger; the cold of the wood under it surprises her. (Pays off later — keep it sensory, not explained.)
  - **First ledger entry** ("Cold snap holding. Ice at 24 inches.") must land harder — a paragraph of physical reaction (room temperature, her breath, what her hands do) before she closes it.
  - **Shoreline trip:** make the lake *attend* to her — not three sentences of description but presence.
  - **PRESERVE:** the basement-tools description; the mallet "worn smooth in a very specific way"; the 46 notebooks; the 1962 photograph reveal.
- [ ] **Step 2–4:** Verify; rebuild; commit.

### Task 6: Ch 4 — The Funeral (target 3,400)

**Files:** Modify `chapters/04-the-funeral.md`

- [ ] **Step 1: Revise (+~600).**
  - Reception: expand to ≥3 paragraphs of texture — names she can't place, women who knew Aili, the way she handles the pulla.
  - Helmi approach: add a beat where Aino notices Helmi watching her before Helmi crosses the room.
  - Trust the photograph-on-the-fridge ending; don't let Ch 5's opening undercut it.
  - **PRESERVE:** the Lutheran service specifics; Helmi's *anna sen mennä* exchange; Aino's *kyllä*.
- [ ] **Step 2–4:** Verify; rebuild; commit.

### Task 7: Ch 5 — What He Left Her (target 2,800)

**Files:** Modify `chapters/05-what-he-left-her.md`

- [ ] **Step 1: Revise (+~600).**
  - The "long time before she opens the envelope" is a tell — render the held moment: what she looks at while not opening it, what she tells herself.
  - The age-seven hand-in-the-water memory: let it land — physical reaction, how her father moved, the look on his face.
  - **PRESERVE the father's letter verbatim** (one of the strongest pieces in the book); Ernest Autio; the will reading.
- [ ] **Step 2–4:** Verify; rebuild; commit.

### Task 8: Ch 6 — Night Two (target 2,000)

**Files:** Modify `chapters/06-night-two.md`

- [ ] **Step 1: Revise (+~800).** This is the Act One break and must carry weight.
  - Expand the night: lying in bed listening, multiple awakenings, the decision to get up, the walk to the window in the dark.
  - Make the morning crouch in the snow a full scene — cold, forgotten gloves, snow giving under her knee, the prints not-animal.
  - Slow the decision to go to the sauna — sit with it; the envelope has sat a week; add deliberation before she takes the key.
  - **PRESERVE:** the fresh prints from a new direction; the single print past the porch pointing at the door.
- [ ] **Step 2–4:** Verify; rebuild; commit.

---

## Phase 2 — Act Two (Ch 7–14): expand + deliver early payoffs (~14k → ~22k)

### Task 9: Ch 7 — The Sauna (target 2,400)

**Files:** Modify `chapters/07-the-sauna.md`

- [ ] **Step 1: Revise (+~450).**
  - Lockbox: one more wrong combination attempt before the grandmother's birthday opens it.
  - Closing: hold her in the sauna longer as the fire burns down — what she thinks about, what changes in her body now that she has seen what her father saw. Replace the summary line "She stays until the fire burns low."
  - **PRESERVE (do not touch):** the structure approach, heat building, first hatch opening, the darkening in the water, "She does not put her hand in. She does not lean over." This is a model chapter.
- [ ] **Step 2–4:** Verify; rebuild; commit.

### Task 10: Ch 8 — The Ledgers (target 2,800) — **deliver Toivo's drowning**

**Files:** Modify `chapters/08-the-ledgers.md`

- [ ] **Step 1: Revise (+~900).**
  - Enact Aino's bodily reaction to the worst entries (cold hands, coffee gone cold, a sound she hadn't noticed) instead of telling it.
  - **PAYOFF — Toivo's drowning:** dramatize it via a short embedded flashback drawn from a ledger entry Aino reads (Toivo at the ice in June 1962, the decision to go in) — a held, on-page death, not the current one-line assertion. Keep it brief and ledger-anchored. This is the book's first on-page death (mortal-stakes goal).
  - Make the Lac Vieux Desert search *(renamed in Task 27)* a rendered beat — the strangeness of it on her phone in this kitchen.
  - **PRESERVE:** Eino's entries reading like weather-and-crime in one hand; "we have done what we have done."
- [ ] **Step 2–4:** Verify (confirm the drowning is *shown*); rebuild; commit `revise(novel): Ch 08 The Ledgers — dramatize Toivo's drowning`.

### Task 11: Ch 9 — Old Boyfriend (target 2,200)

**Files:** Modify `chapters/09-old-boyfriend.md`

- [ ] **Step 1: Revise (+~500).**
  - Add the awkward middle of the conversation — a beat where they almost talk about their history and pull back.
  - Replace the too-clean "I want to understand what happened in 1919" with something more fumbled first, then the clearer articulation.
  - **PRESERVE:** Mikko's careful, rehearsed-calm introduction; the diner texture.
- [ ] **Step 2–4:** Verify; rebuild; commit.

### Task 12: Ch 10 — What Comes Up (target 2,300)

**Files:** Modify `chapters/10-what-comes-up.md`

- [ ] **Step 1: Revise (+~600).**
  - Let the three knocks land harder: let the second set sit; she goes stiller, longer; the cold comes up through the hatch in a sentence of its own.
  - Voicemail: add a beat where she notices the timestamp — the call came in *during* her time in the sauna.
  - **PRESERVE (model scene, small additions only):** the second hatch opening; the three knocks; speaking into the dark; the closing "like she is in the right place."
- [ ] **Step 2–4:** Verify; rebuild; commit.

### Task 13: Ch 11 — Helmi Korhonen (target 2,500) — **restore Finnish folklore**

**Files:** Modify `chapters/11-helmi-korhonen.md`

- [ ] **Step 1: Revise (+~800).**
  - Break Helmi's block of dialogue — let Aino interrupt, push back, ask questions.
  - **PAYOFF — Finnish folklore vector:** restore *väki* (spirit-force in places) and *vetehinen* (water-beings), and the distinction between what the Finns brought and what was already here — Eino's error in treating them as the same. Keep restrained; Finnish words as intrusions Aino half-remembers.
  - Give the "did she ever forgive him" exchange room to settle.
  - **PRESERVE:** Helmi's stillness; the ship photograph of two young women; "Aili was a smart woman"; the birch tree image.
- [ ] **Step 2–4:** Verify (folklore present and restrained); rebuild; commit `revise(novel): Ch 11 Helmi — restore väki/vetehinen folklore`.

### Task 14: Ch 12 — The Drive to Watersmeet (target 3,000) — **workshop heavily**

**Files:** Modify `chapters/12-the-drive-to-watersmeet.md`

- [ ] **Step 1: Revise (+~1,200 — the single largest Act Two growth).**
  - The hour drive: inhabit the dread of the conversation they *don't* have in the truck, instead of "are you nervous / yes / me too / arrive."
  - Louise's history can stay legalistically flat, but Aino's silent bodily reception of the worst facts must register — slow the moment she goes from learning to nodding.
  - Hold the **Mäkelä reveal** ("Your great-grandfather was there that night") — it currently lands like small talk.
  - The return drive: tell us what they aren't saying — Mikko's posture, what Aino does with her hands.
  - **FLAG** all of Louise's dialogue and the cultural framing (SENSITIVITY-FLAG markers).
  - **PRESERVE:** Louise's measured introduction; her boundary ("things about Mindemoyen that belong to us"); the Mäkelä recognition.
- [ ] **Step 2–4:** Verify; rebuild; commit.

### Task 15: Ch 13 — Going Home (target 2,200)

**Files:** Modify `chapters/13-going-home.md`

- [ ] **Step 1: Revise (+~700).**
  - Add at least one physical scene (walk to the shore, the basement, or outside in the snow) — currently entirely interior.
  - Deepen the "what to do" list items past surface — what she's really afraid of about staying.
  - Restore the **lake's presence** (it goes quiet across Ch 11–14; bring it back here).
  - **PRESERVE:** the list-making device; the containment-not-solution recognition; the "right place" echo.
- [ ] **Step 2–4:** Verify; rebuild; commit.

### Task 16: Ch 14 — Mikko Tells Her (target 3,400) — **root cellar full scene**

**Files:** Modify `chapters/14-mikko-tells-her.md`

- [ ] **Step 1: Revise (+~1,100).**
  - **Make the root cellar a full scene** (currently one paragraph): the door behind the furnace, the hand-forged keyplate, the cold and smell, the mason jars with Eino's Finnish labels, the small wrapped carved figure she doesn't unwrap. Folk-horror gold — show more without explaining everything.
  - **PAYOFF — basement tools:** tie the unrecognized tools to the watch (carving/maintaining the sauna and the marks).
  - The Milwaukee-supervisor call: give it a beat (her looking around the kitchen) or cut it; no flat plot-machinery.
  - Hold the list-of-names scene with Mikko longer.
  - **PRESERVE:** the names list with Aino's name as the last Hietala entry.
- [ ] **Step 2–4:** Verify; rebuild; commit.

---

## Phase 3 — Act Three: chronological rebuild + restored deaths (~13k → ~30k)

> **Restructure note:** The current Ch 15 (Sat→Wed), Ch 16 (Sun/Tue flashback), Ch 17 (Tue→Wed) overlap in time. This phase rebuilds them as a strict day-by-day countdown across **new** chapters 15–21. Source prose is salvaged from current chapters 15–17 and redistributed. **Timeline (finalize day-stamps for continuity):** Sat forecast → Sat/Sun first all-night knock → Sun Lehtinen visit → Mon Erik Saari visit → Mon night convening (rogue Saari refuses) → Tue morning snowmobiler found → Tue the rogue Saari is taken / ice cracks → Tue night→Wed dawn the last night → Wed dawn the morning → Wed first light ceremony.

### Task 17: Ch 15 — Spring Coming (new, target 4,000)

**Files:** Create `chapters/15-spring-coming.md`; source prose from current `15-spring-coming.md` opening + first-night material.

- [ ] **Step 1: Write.** Required beats:
  - The thaw forecast; five weeks of unkept watch; the declining-ice ledger pattern across years.
  - Render **one night scenically, minute by minute** (Sat→Sun): pacing, thirst, phone in hand undialed, the seven-second silence between sets, the body holding the count. Replace "she counted X sets" summary.
  - Ends Saturday/Sunday — does NOT jump to Wednesday.
  - **PRESERVE:** the cold-inside-the-house thermometer material is reserved for Ch 20 (the last night); do not spend it here. Keep the forecast scene and ledger-thinning material.
- [ ] **Step 2–4:** Verify; rebuild; commit.

### Task 18: Ch 16 — The Families (new, target 3,000)

**Files:** Create `chapters/16-the-families.md`; source from current `16-the-other-two-families.md`.

- [ ] **Step 1: Write.** Required beats:
  - **Lehtinen visit (Sunday):** expand Marta + Juhani past six lines — real texture, Juhani's "angry at a dead man" turn given room.
  - **Erik Saari visit (Monday):** expand the central scene — his "no," his silences, "I haven't slept well in a week," the earned "what time." Erik should push back more.
  - Establish the **two factions** (watch-forever vs. end-it-now) — seed the rogue Saari (Erik's brother/cousin, the end-it-now voice) here so Task 20 pays off.
  - Chronological — these are real-time visits, not a flashback block.
- [ ] **Step 2–4:** Verify; rebuild; commit.

### Task 19: Ch 17 — The Convening (new, target 2,400) — **restored beat**

**Files:** Create `chapters/17-the-convening.md`

- [ ] **Step 1: Write.** Required beats (Monday night, private — NOT the Finnish-Hall Town Meeting):
  - The three families gather at one house to align on what they're agreeing to for Wednesday.
  - The truth spoken aloud among them after a hundred years (does the moral work the cut Town Meeting did, at small scale).
  - The **rogue Saari refuses** — wants it ended now, his way — and leaves. This sets up his death.
  - **FLAG** any cultural references (likely none here; this is the Finnish families).
- [ ] **Step 2–4:** Verify; rebuild; commit `revise(novel): Ch 17 The Convening — restored private families scene`.

### Task 20: Ch 18 — The Snowmobiler (new, target 2,400) — **dramatized death**

**Files:** Create `chapters/18-the-snowmobiler.md`; source the Dale Numminen material from current Ch 15.

- [ ] **Step 1: Write.** Required beats (Tuesday morning):
  - **Dramatize Dale Numminen's death on the page** — Aino and Mikko at the inlet as the machine is recovered (engine still running, no rider), not a phone call. The lake's first modern kill, witnessed.
  - Aino's recognition ("she's in pain and anger is the only shape it has anymore") kept but earned through the scene.
  - Mortal-stakes goal: the reader must feel the lake can take someone now.
- [ ] **Step 2–4:** Verify (death is *shown*, not reported); rebuild; commit.

### Task 21: Ch 19 — The Lid Comes Off (new, target 2,600) — **restored on-page death**

**Files:** Create `chapters/19-the-lid-comes-off.md`

- [ ] **Step 1: Write.** Required beats (Tuesday, after the convening he rejected):
  - The **rogue Saari** goes to his family's spot with a chainsaw and half-remembered words to force the ending himself. He doesn't understand what he's doing. The lake takes him. The ice cracks across the lake in a single night; the sauna pilings groan.
  - This is the climax-window stakes spike — a named character we met in Ch 16/17 dies on the page. Keep the literary restraint (we don't see gore; we see the chainsaw, the dark water, the silence after).
  - Must be a **different Saari than Erik** (Erik survives to stand on the shore Wednesday).
- [ ] **Step 2–4:** Verify; rebuild; commit `revise(novel): Ch 19 The Lid Comes Off — restored Saari death`.

### Task 22: Ch 20 — The Last Night (new, target 4,000)

**Files:** Create `chapters/20-the-last-night.md`; source from current Ch 17.

- [ ] **Step 1: Write.** Required beats (Tuesday night → Wednesday dawn — the worst night):
  - Render hour by hour (9 PM → midnight → 1 AM → 2 → 3 → 4 → 5 → dawn) as held moments, not one paragraph each: Mikko's face at 2 AM; the worse cold in the bathroom; what she sees out the back window.
  - Make the couch-into-kitchen / gas-burners-for-heat decision a beat, not a sentence.
  - **PAYOFF — "I should have come sooner":** give the emotional core (the 40 minutes a year, the twelve hours of her father's voice across nineteen years) its own held beat HERE.
  - **PRESERVE:** the cold coming inside; knocking from the ceiling; the single blow against the door at 1 AM; "She's angry. She has every right to be angry."
- [ ] **Step 2–4:** Verify; rebuild; commit.

### Task 23: Ch 21 — The Morning (new, target 2,500)

**Files:** Create `chapters/21-the-morning.md`; source the dawn/document-gathering material from current Ch 17.

- [ ] **Step 1: Write.** Required beats (Wednesday dawn):
  - Slow the gathering of documents through the house with the wooden box.
  - Show her in the cold sauna at dawn unlocking the lockbox for the last time.
  - **PRESERVE:** the snow pushed away from the foundation in a radius around the house.
- [ ] **Step 2–4:** Verify; rebuild; commit.

---

## Phase 4 — Climax & Resolution (~11k → ~14k)

### Task 24: Ch 22 — The Ceremony (target 3,000) — **deliver the Finnish prayer; intensify peril**

**Files:** Create `chapters/22-the-ceremony.md`; source from current Ch 18.

- [ ] **Step 1: Revise.** Required beats:
  - **PAYOFF — unconscious Finnish prayer:** on her knees, Aino says something in Finnish she didn't know she still knew — one short phrase (e.g. *anna sen mennä* said back to the lake, or *anna meidän anteeksi* — forgive us). She does not decide to; it surfaces.
  - **Intensify Aino's peril** so the outcome feels uncertain and the rescue costs something — extend the under-the-water sensation, make Mikko's pull-back harder-won. (Mortal-stakes goal applied to the protagonist.)
  - Add one or two concrete, restrained details of what Louise's family does (something brought from the vehicles, a posture) WITHOUT translating or depicting interior content. **FLAG** all of it.
  - **PRESERVE:** the eight on the shore; the cold off the water; "Mindemoyen" said twice (wrong then right); Louise's "We see you. We have always seen you. We are here."
- [ ] **Step 2–4:** Verify (Finnish prayer present; peril intensified; restraint held); rebuild; commit.

### Task 25: Ch 23 — Burning (retitled from "What Her Father Wrote at the End", target 2,500)

**Files:** Create `chapters/23-burning.md`; source from current Ch 19. Update frontmatter title to **Burning**.

- [ ] **Step 1: Revise (+~500).**
  - Retitle (the old title promised final ledger entries the chapter doesn't read).
  - Move the "twelve hours of her father's voice" math OUT (now in Ch 20) or keep only a light echo — don't pivot to phone-call math at the firebox.
  - **PRESERVE (do not touch):** standing to watch the sauna burn; the carvings going first; Aino crying for each family member in turn; Louise's "Your father knew my name"; the 20-seconds-of-breathing voicemail; "It is not over. But it has begun." This is a model chapter.
  - **PAYOFF — carved marks:** as the marks burn, a single restrained line acknowledging what they were (the men's containment-marks — acknowledgment without restitution) — never fully decoded.
- [ ] **Step 2–4:** Verify; rebuild; commit `revise(novel): Ch 23 Burning — retitle + carved-marks payoff`.

### Task 26: Ch 24 — Coals and Stone (retitled, target 2,500) — **deliver mother's call**

**Files:** Create `chapters/24-coals-and-stone.md`; source from current Ch 20. Update frontmatter title to **Coals and Stone**.

- [ ] **Step 1: Revise (+~800).**
  - Retitle (old "The Lid Comes Off" is now Ch 19).
  - **PAYOFF — mother's call:** the one sentence Aino has waited her whole life to hear — Lila: *"I shouldn't have brought you back."* Land it here (or, if it fits better, in Ch 25 — decide and note).
  - More interior and more between Aino and Mikko (some of the hand-touching pre-current from Ch 25 can begin here).
  - **PRESERVE:** Erik Saari at the foundation's edge; Louise's "It's a beginning. Not an ending."; "empty, not bad empty."
- [ ] **Step 2–4:** Verify (mother's line landed once, not twice); rebuild; commit.

### Task 27: Ch 25 — After (target 2,800)

**Files:** Modify `chapters/25-after.md` (renumbered from current 21).

- [ ] **Step 1: Revise (+~1,000).**
  - Add external-world texture to the estate-clearing week: at least two of {someone has died, a place is closing (Hakala's for sale), the town moving on}.
  - Hold the dinner with Mikko longer; keep the "I'll come back" honest (the outline's "she doesn't know"), not tidied.
  - **PRESERVE:** the estate sale; keeping three things (quilt, photograph, percolator); the percolator on the passenger seat; slowing-but-not-stopping at the cross street.
- [ ] **Step 2–4:** Verify; rebuild; commit.

### Task 28: Ch 26 — She Does Not Get Far (target 1,800)

**Files:** Modify `chapters/26-she-does-not-get-far.md` (renumbered from current 22).

- [ ] **Step 1: Revise (+~800).**
  - The drive south as a body in retreat from something it's still attached to.
  - Specify the gas station (exit, town, chain).
  - Let the new Wisconsin lake register as presence — let Aino see it; let it see her.
  - **PRESERVE (do not touch):** the buckled percolator; the county-records search; "She finds something in ten minutes that takes her another ten to understand fully"; the unspoken "I can hear it now."
- [ ] **Step 2–4:** Verify; rebuild; commit.

---

## Phase 5 — Global passes & deliverables

### Task 29: Finnish-language thread pass

**Files:** Modify any of `chapters/*.md` as needed.

- [ ] **Step 1:** Read the manuscript end to end tracking only Finnish usage. Tune the escalation: early Finnish reads as intrusion (translated away); mid-book she lets words stay; by Ch 22 she prays without deciding to. Ensure it never disappears for long stretches (current gap: Ch 4 → Ch 22).
- [ ] **Step 2:** Verify a roughly monotonic increase in Finnish presence/comfort across the book; the climax prayer is the apex.
- [ ] **Step 3:** Rebuild; commit `revise(novel): tune Finnish-language thread across the arc`.

### Task 30: Naming — fictionalize band + town (global)

**Files:** Modify all affected `chapters/*.md`.

- [ ] **Step 1:** Replace the real institutional name **"Lac Vieux Desert Band of Lake Superior Chippewa"** with an invented band, and **"Watersmeet"** with an invented town. **Proposed (confirm with author before applying):** town → **Tamarack**; band → **the Tamarack Lake Band of Lake Superior Ojibwe**. Apply consistently (chapter titles, prose, the Ch 12 title "The Drive to Watersmeet" → "The Drive to Tamarack"). Keep characters recognizably Ojibwe.
- [ ] **Step 2:** Grep the manuscript to confirm zero remaining instances of the real names: `grep -ri "lac vieux\|watersmeet\|chippewa" chapters/` → no hits (except intentional, if any).
- [ ] **Step 3:** Rebuild; commit `revise(novel): fictionalize band + town names`.

### Task 31: Sensitivity-reader brief

**Files:** Create `projects/kdp-puzzle-press/first_book/files/SENSITIVITY_READER_BRIEF.md`

- [ ] **Step 1:** Collect every `SENSITIVITY-FLAG` passage (`grep -rn "SENSITIVITY-FLAG" chapters/`) into a brief: location, the passage, and the specific question for a reader. Include the standing questions: the name "Mindemoyen"; the elder/Louise dialogue; the ceremony depiction; the overall framing of Ojibwe characters and the restraint choices.
- [ ] **Step 2:** Commit `docs(novel): sensitivity-reader brief from flagged passages`.

### Task 32: Rebuild deliverables + final QA

**Files:** Modify `anna_sen_menna_kdp_ebook.html`, `anna_sen_menna_kdp_print.docx`; update `SESSION_STATUS.md`.

- [ ] **Step 1:** Final full-manuscript read for voice consistency, timeline continuity (the new day-by-day Act Three), and that the *What NOT to Touch* list survived.
- [ ] **Step 2:** Check total word count: `wc -w chapters/*.md`. ~70,000 is the aim, but **do not expand for the number's sake.** If the book is complete, flows, and lands every beat at, say, 64k, that is a finished book — ship it. Only revisit chapters that feel genuinely thin or summarized (a real missing scene), never to pad toward a quota.
- [ ] **Step 3:** `node build_book.mjs` to regenerate the ebook HTML (author "Seven Martin", ~26 chapters, zero flag leakage).
- [ ] **Step 4:** Regenerate the print DOCX from the HTML/markdown (pandoc: `pandoc anna_sen_menna_kdp_ebook.html -o anna_sen_menna_kdp_print.docx`, or the existing print process). Verify it opens and the title page reads "Seven Martin".
- [ ] **Step 5:** Update `SESSION_STATUS.md` to reflect the second draft (word count, chapter count, sensitivity-reader status, what's left before release).
- [ ] **Step 6:** Commit `build(novel): rebuild ebook + print deliverables for second draft`.

---

## Self-Review

**Spec coverage** — every spec section maps to tasks: chapter structure/timeline rebuild → Tasks 17–23; mortal stakes → Tasks 10 (Toivo), 20 (snowmobiler), 21/19 (Saari), 24 (Aino's peril); payoff ledger → Tasks 10, 13, 24, 25 (carved marks), 26 (mother), 14 (tools), 13 (lake presence); Finnish thread → Task 29; naming/ethics + flags → Tasks 1, 12, 24, 30, 31; what-not-to-touch → PRESERVE lists in each task; process/deliverables → Tasks 1–2, 32. No gaps.

**Placeholders** — none: each chapter task lists concrete beats from the diagnostic, exact targets, exact files, explicit PRESERVE lists. The only deliberately deferred item is the proposed band/town names (Task 30), flagged for one author confirmation.

**Consistency** — chapter numbering: 14 (Acts I–II) + 7 (Act III: 15–21) + 5 (climax/resolution: 22–26) = 26 chapters. Source-prose redistribution from current 15–17 is mapped (Tasks 17, 18→Dale, 20→last night, 21→morning). The rogue Saari (Tasks 16/17 setup → 19 payoff) is consistently a different character than Erik (survives to Task 24).
