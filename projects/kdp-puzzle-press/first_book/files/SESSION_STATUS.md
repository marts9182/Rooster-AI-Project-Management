# Project Status — *Anna Sen Mennä* (folk-horror novel)

*Updated 2026-06-01. Pen name: **Seven Martin**.*

## Current state: SECOND-DRAFT REVISION COMPLETE

The book is now a complete, releasable-quality second draft: **~65,900 words, 26 chapters.** The first draft (~33k, scrambled Act Three) has been expanded to scene depth, the back half rebuilt as a strict day-by-day countdown, all broken outline-promises delivered, real on-page deaths restored, and the cultural institutions fictionalized to maximum restraint.

Awaiting: the author's full read of the second draft, and a sensitivity-reader pass (brief is ready — see below).

## KDP production status (2026-06-01, evening) — paused here

Going for fully KDP-ready (ebook + paperback). **Done & committed:**
- **Cover** (concept: lone sauna over the frozen lake, chosen from 3 Nano Banana Pro candidates). Art generated via `web.ui/backend/scripts/generate_novel_cover.mjs` (Gemini `gemini-3-pro-image-preview`). Typography composited (Pillow) — title in Playfair, byline, subtitle.
  - Ebook front: `cover/anna_sen_menna_cover_ebook.png` (1600×2560). Builder: `cover/compose_cover.py`.
  - Paperback wrap: `cover/anna_sen_menna_cover_wrap.pdf` (+ `.png` preview), 300 DPI, front+spine+back, geometry for 222pp cream (spine 0.555″, full 11.807×8.75″). Builder: `cover/build_wrap.py`. Chosen art: `cover/anna-cover-a-hero-*.jpg`.
- **Print interior:** `anna_sen_menna_kdp_print_interior.pdf` — 5.5×8.5, **222 pages**, Georgia body + Playfair display, all text fonts embedded (a parked base-14 Helvetica is referenced but renders zero text — harmless/standard). Builder: `build_print_interior.py`. Includes title page, copyright (with fiction + fictionalized-band disclaimer + AI-cover note), and About-the-Author. No dedication/epigraph (per author).
- **Metadata kit:** `KDP_METADATA.md` — description (with KDP HTML), back-cover blurb, 7 keywords, 3 categories/BISAC, pricing (ebook $4.99 KU; paperback $13.99), author bio, **AI-disclosure guidance** (cover = AI-generated; text = author to declare honestly).
- Spec: `docs/superpowers/specs/2026-06-01-anna-sen-menna-kdp-production-design.md`.

**Resume next session (small):**
1. Final QA + write `KDP_UPLOAD_CHECKLIST.md` (step-by-step upload order, AI disclosure, KU, ISBN, pricing, the recommended sensitivity-reader gate before going live).
2. Minor polish: spine text order (currently author reads above title — flip so title is top); consider generating a proper EPUB for the ebook (currently the reflowable HTML/DOCX is the ebook source).
3. Author decisions still open: confirm pricing; confirm the AI-content declarations; (optional) commission the sensitivity reader before publishing.

## KDP production status (2026-06-02) — upload-ready

The resume list above is now **done**:
- **`KDP_UPLOAD_CHECKLIST.md` written** — full step-by-step upload order for ebook + paperback, AI-disclosure guidance, KU enrollment, free-KDP-ISBN, pricing, previewer/proof steps, and the post-publish launch tactic. Sensitivity reader is framed as **recommended, not a hard gate** (author's call).
- **EPUB generated + validated.** New `build_epub.mjs` → `anna_sen_menna_kdp_ebook.epub` (EPUB 3: cover, title/copyright front matter mirroring the print interior, 26 chapters, About-the-Author, nav + NCX). **Passes epubcheck (0 errors / 0 warnings).** Zip done in Python so `mimetype` is truly STORED (method 0) — .NET's compression can't do that. This is now the preferred ebook upload; the HTML remains a fallback. (Requires the PyPI `epubcheck` wrapper to re-validate.)
- **Spine flipped.** `cover/build_wrap.py` now rotates `-90` (clockwise): title sits **above** author and reads **top-to-bottom** (standard US/UK trade convention). Wrap PDF/PNG rebuilt.
- **Pricing confirmed:** ebook **$4.99** (KU; optional $0.99 5-day Countdown launch week), paperback **$13.99**. Recorded in the checklist + metadata kit.
- **Naming QA:** verified **Kivijärvi** (the protagonist's home town) and **Tamarack** (the separate town with the tribal offices, 40 mi away) are *intentionally two different places* — not the continuity error it first looked like. Back-cover/metadata "town of Kivijärvi" is correct.

**Still open (author decisions only):** confirm the AI-content declarations at upload; (optional) commission the sensitivity reader. All build artifacts are ready to upload.

## Final read-through pass (2026-06-02) — done

Full-book read-through via 6 parallel reader-agents (one per chapter block), each armed with the locked canon + extracting a facts ledger; continuity reconciled across the whole book afterward. **Result: continuity is clean** — every high-risk prior item verified consistent (Aino b.1987/age 38, father "fifty-eight" in Ch 1, the Ch 20 twelve-hours math, Eino's lockbox notebook, the 46-ledger count, the Sat→Wed countdown, Dale/Reino/Erik deaths, Mäkinen/Mäkelä rule, the two Finnish phrases, Mindemoyen spelling, no real institution names). No new sensitivity flags beyond `SENSITIVITY_READER_BRIEF.md`. Author-tics are well-thinned (filing 3, sternum/breastbone 2 across the whole book).

**Six fixes applied** (then all deliverables rebuilt; interior still 222pp so the wrap is unaffected; EPUB re-validated epubcheck-clean):
- Ch 17 — "no children" → **"no sons"** (matched the Ch 14 names-list; the daughter Rauha carries the blood, so "no sons" is the correct claim). HIGH.
- Ch 2 — Paavo's brandy "untouched" → **"forgotten"** (he is shown drinking/finishing it). MED.
- Ch 2 — "since she was born, or came up here" → **"since she was born — or had, once —"** (garbled self-correction).
- Ch 6 — "She got her phone and she looked it up" → **"She'd gotten her phone and looked it up"** (tense).
- Ch 7 — "She doesn't look back at the lake. / She almost doesn't." → **"She almost doesn't look back at the lake. / She does."** (was self-contradicting).
- Ch 17 — "Almost the word for word" → **"Almost word for word"** (dropped article).

A handful of declined LOW nits remain on record in the read-through report (e.g., Ch 2 "gray … gray"; Ch 10–13 "X that is not X" negations) — author chose not to change them.

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
