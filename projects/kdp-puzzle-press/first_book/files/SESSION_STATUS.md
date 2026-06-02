# Project Status — *Anna Sen Mennä* (folk-horror novel)

*Updated 2026-06-01. Pen name: **Seven Martin**.*

## Current state: SECOND-DRAFT REVISION COMPLETE

The book is now a complete, releasable-quality second draft: **~65,900 words, 26 chapters.** The first draft (~33k, scrambled Act Three) has been expanded to scene depth, the back half rebuilt as a strict day-by-day countdown, all broken outline-promises delivered, real on-page deaths restored, and the cultural institutions fictionalized to maximum restraint.

Awaiting: the author's full read of the second draft, and a sensitivity-reader pass (brief is ready — see below).

## Source of truth & build
- **Manuscript = `chapters/NN-slug.md`** (per-chapter markdown with `number:` / `title:` / `target_words:` frontmatter). The build orders by the `number:` field, not the filename.
- **`build_book.mjs`** → regenerates `anna_sen_menna_kdp_ebook.html` (title page "Seven Martin"; strips `SENSITIVITY-FLAG` comments, inline and own-line). Run: `node build_book.mjs`.
- **`build_docx.mjs`** → regenerates `anna_sen_menna_kdp_print.docx` (dependency-free OOXML; zips via Windows PowerShell .NET — no pandoc/Word needed). Run: `node build_docx.mjs`. NOTE: this produces a **content-current manuscript DOCX**; final KDP print formatting (trim size, running heads, page numbers, font embedding) is still a manual Word pass.
- Deliverables verified 2026-06-01: ebook HTML and print DOCX both = 26 chapters, author "Seven Martin", zero flag leakage, zero real institution names.

## What this revision did
- Extracted the single-file HTML into per-chapter markdown + the two build scripts.
- **Acts I–II (Ch 1–14):** expanded in place to scene depth (kept all model passages).
- **Act Three rebuilt chronologically (Ch 15–21)** as a Sat→Wed countdown: Spring Coming (one scenic haunted night) · The Families (Lehtinen Sun + Erik Saari Mon; two factions seeded) · The Convening (Mon night; the name spoken aloud) · The Snowmobiler (Tue AM; Dale's death witnessed) · The Lid Comes Off (Tue PM; Reino Saari's on-page chainsaw death; ice cracks lake-wide) · The Last Night (hour-by-hour) · The Morning (dawn document-gathering).
- **Climax/Resolution (Ch 22–26):** Ceremony (Finnish prayer *anna meidän anteeksi* + intensified peril) · Burning (carved-marks payoff) · Coals and Stone (the mother's call: *"I shouldn't have brought you back"*) · After · She Does Not Get Far ("I can hear it now").
- **Mortal stakes restored:** Toivo's 1962 drowning (Ch 8), Dale (Ch 18), Reino (Ch 19), Aino's near-pull-under (Ch 22) — restraint held (no gore).
- **Payoffs delivered:** Finnish folklore *väki/vetehinen* (Ch 11), the unconscious Finnish prayer (Ch 22), the mother's call (Ch 24), the carved containment-marks (Ch 23), the basement tools→watch tie (Ch 14), the twelve-hours-of-his-voice math (Ch 20), the lake's restored presence.
- **Global passes:** continuity/tic/Finnish-thread audit (Task 29) and naming fictionalization (Task 30).

## Continuity decisions locked this revision
- **Names:** fourth 1919 family standardized to **Mäkinen** in narration + the names-list; **Mäkelä** kept only as the old-timers'/Louise's variant. Risto Jr. (d.1947, no sons) ends the male *name*; Rauha Mäkinen (daughter, married Aaltonen) carries the blood to Mikko.
- **Timeline reconciled:** Hank b.1948, d. age 77 (≈ present 2025); **Aino b.1987, age 38, left at 19, gone 19 years**; Hank was 58 when she was 19. (Earlier draft's "father 48"/"Aino b.1971"/"age 51" were the inconsistent outliers, now fixed.) See `REVISION_NOTES_GLOBAL.md`.
- **Eino's 1919 notebook** lives in the bolted sauna lockbox (not the basement shelf); Ch 8 fixed to match Ch 7/Ch 21.
- **Institutions fictionalized:** town Watersmeet → **Tamarack**; band → **Tamarack Lake Band of Lake Superior Ojibwe** (real grouping "Lake Superior Ojibwe" retained).

## Before release — open items
1. **Sensitivity reader** (deferred, author to commission). Turnkey brief: **`SENSITIVITY_READER_BRIEF.md`** — collects all 29 flagged passages + standing questions A–I (highest priority: the name "Mindemoyen"; the ceremony depiction; Louise/elder agency; the *väki/vetehinen* framing; the climax prayer; the invented surname "Louise Swifthawk"; the carved figure; the supernatural-persistence framing; the untranslated closing line).
2. **Author read** of the full second draft (act-boundary reviews done for Act Three; full-book read still wanted).
3. **KDP print formatting** of the DOCX (the generated file is content-complete, not print-laid-out).
4. **Cover, blurb, KDP metadata** — out of scope for this revision (separate task).

## Key references
- Spec: `docs/superpowers/specs/2026-06-01-anna-sen-menna-revision-design.md`
- Plan: `docs/superpowers/plans/2026-06-01-anna-sen-menna-revision.md`
- Running continuity notes: `projects/kdp-puzzle-press/first_book/files/REVISION_NOTES_GLOBAL.md`
- Lore bible / outline: `novel_outline_working.md`
