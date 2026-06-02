# KDP Upload Checklist — *Anna Sen Mennä*

*Pen name **Seven Martin**. Step-by-step order for publishing the ebook + paperback on Amazon KDP.*
*Companion to `KDP_METADATA.md` (all paste-ready field values live there).*

---

## 0. Before you touch KDP — final QA gate

- [x] **Ebook EPUB validates.** `anna_sen_menna_kdp_ebook.epub` passes **epubcheck** (0 errors, 0 warnings). Rebuild with `node build_epub.mjs` if chapters change, then re-validate: `python -c "from epubcheck import EpubCheck; print(EpubCheck('anna_sen_menna_kdp_ebook.epub').valid)"`.
- [x] **Print interior is 222 pages**, 5.5×8.5, fonts embedded. `anna_sen_menna_kdp_print_interior.pdf` (rebuild: `python build_print_interior.py` — it prints the page count).
- [x] **Cover wrap geometry matches 222 pp / cream** (spine 0.555″, full 11.807×8.75″). `cover/anna_sen_menna_cover_wrap.pdf` (rebuild: `python cover/build_wrap.py cover/<chosen-art>.jpg 222`).
- [x] **Spine reads title-over-author, top-to-bottom** (standard trade convention).
- [ ] **⚠️ If the manuscript changes at all, the page count can change** → you must rebuild BOTH the interior PDF *and* the cover wrap (the spine width is page-count-derived) before uploading. Don't upload a wrap built for a different page count.

### Recommended (not required) before going live
- [ ] **Sensitivity-reader pass.** Strongly recommended given the Ojibwe/Finnish-American cultural content — turnkey brief is ready in `SENSITIVITY_READER_BRIEF.md` (29 flagged passages + standing questions A–I). This is the author's call; publishing without it is allowed but at your own risk. If you commission it and changes result, rebuild per the ⚠️ note above.
- [ ] **Author's full read** of the second draft.

---

## 1. KDP account

- [ ] Sign in at **kdp.amazon.com** with your real identity.
- [ ] Complete **Tax Interview** + **Bank/Payment** details (required before anything pays out). Use your **real legal name** here — "Seven Martin" is only the public author name.
- [ ] (Optional) Set up **Author Central** (author.amazon.com) afterward for the author bio/photo and to claim the book.

---

## 2. Ebook (Kindle) — create first, then link the paperback

KDP > **Bookshelf** > **Create** > **Kindle eBook**.

### Tab 1 — Kindle eBook Details
- [ ] **Language:** English
- [ ] **Book Title:** `Anna Sen Mennä` (enter the *ä* exactly)
- [ ] **Subtitle:** `A Folk Horror Novel`
- [ ] **Series:** leave blank (standalone)
- [ ] **Edition number:** 1
- [ ] **Author:** Primary = `Seven Martin`
- [ ] **Description:** paste the **HTML description** from `KDP_METADATA.md` (KDP accepts `<b> <i> <br>`).
- [ ] **Publishing rights:** "I own the copyright…"
- [ ] **Primary audience / sexually explicit:** No. (Adult content note: restrained violence, grief, supernatural dread; no explicit sex.)
- [ ] **Keywords (7):** paste the 7 from `KDP_METADATA.md`.
- [ ] **Categories (up to 3):** Horror › Ghosts; Literary; Horror › Supernatural (BISAC `FIC015000`, `FIC019000`, `FIC074000`).
- [ ] **AI content question → see §4 below. Answer it honestly.**

### Tab 2 — Kindle eBook Content
- [ ] **Manuscript:** upload `anna_sen_menna_kdp_ebook.epub`.
- [ ] **Cover:** upload `cover/anna_sen_menna_cover_ebook.png` (1600×2560).
- [ ] **Launch the Online Previewer** — page through it: title page, copyright page, the 26 chapters in order, About the Author. Confirm the cover, the *ä* in the title, chapter numbers/titles, scene breaks (the `—`), and the working Table of Contents (the nav).
- [ ] **ISBN:** not required for ebooks — leave blank.

### Tab 3 — Kindle eBook Pricing
- [ ] **KDP Select (Kindle Unlimited):** **Enroll** (90-day exclusive term; enables KU page-read royalties + Countdown deals).
- [ ] **Primary marketplace:** Amazon.com
- [ ] **List price: $4.99 USD** (70% royalty band). Let KDP auto-convert other marketplaces (or set GBP £3.99 / EUR €4.99 / CAD $5.99 / AUD $6.99).
- [ ] **Launch tactic (optional):** schedule a **Kindle Countdown Deal at $0.99 for ~5 days** at launch to seed early reviews, then it returns to $4.99. (Set this *after* the book is live, under Promotions.)
- [ ] **Publish** (or set a pre-order date if you want a runway).

---

## 3. Paperback — from the same title, click "Create Paperback"

On the ebook's Bookshelf row: **+ Create Paperback** (this auto-links the two editions on one Amazon detail page).

### Tab 1 — Paperback Details
- [ ] Title / Subtitle / Author / Description / Keywords / Categories: **match the ebook exactly.**
- [ ] **ISBN:** choose **"Get a free KDP ISBN."** (Free, KDP-assigned; a paperback needs its own ISBN — the ebook does not. Note: a free KDP ISBN lists "Independently published" and can't be reused on other platforms — fine for KDP-only.)
- [ ] **Publication date / publisher:** leave publisher blank or enter an imprint you control.
- [ ] **AI content question → §4 (same answers as the ebook).**

### Tab 2 — Paperback Content
- [ ] **Print options:** Black & white interior on **cream** paper. (The wrap spine math assumes cream — do not switch to white.)
- [ ] **Trim size:** **5.5 × 8.5 in.**
- [ ] **Bleed:** "No bleed" for the interior (the interior PDF has none; the *cover* wrap includes its own bleed — that's expected and separate).
- [ ] **Interior:** upload `anna_sen_menna_kdp_print_interior.pdf`.
- [ ] **Cover:** "Upload a cover I already have (PDF)" → `cover/anna_sen_menna_cover_wrap.pdf`.
- [ ] **Launch Print Previewer / order proof.** Check: front type inside safe area, spine text centered and legible, back-cover blurb not clipped, **the bottom-right barcode box doesn't collide with text** (KDP auto-places the barcode there — the imprint line is kept bottom-left for this reason), and no content in the gutter. **Strongly consider ordering a physical proof copy** before publishing.

### Tab 3 — Paperback Pricing
- [ ] **List price: $13.99 USD** (222 pp cream print cost ≈ $3.66 → royalty ≈ $4.73/copy at 60%). $12.99 is an equally fine, slightly lower-friction alternative.
- [ ] Verify each marketplace meets KDP's **minimum** list price at the pricing step (KDP flags any that don't). UK ≈ £9.99, EU ≈ €12.99.
- [ ] Expanded Distribution: optional (lowers royalty; fine to leave off for a debut).
- [ ] **Publish.**

---

## 4. AI-content disclosure (KDP asks at upload — answer honestly)

KDP distinguishes **"AI-generated"** (created by AI, edited or not) from **"AI-assisted"** (you created it; AI only helped).

- **Cover image:** **AI-generated** — declare it. Created with Google Gemini ("Nano Banana Pro" / `gemini-3-pro-image-preview`); typography/design composited by the author. (KDP does not display this publicly; it's an internal declaration.)
- **Text:** this draft involved substantial AI in generating prose that the author directed and revised. **Decide truthfully and do not under-declare** — KDP's guidance leans toward declaring AI-generated text with human editing when AI produced prose you directed. This is the author's honest call; the metadata kit flags it but does not decide it.

---

## 5. After publishing

- [ ] Both editions appear on **one** Amazon detail page (ebook + paperback linked). If they don't auto-link within a few days, contact KDP support.
- [ ] Set the **Countdown/launch price** if using the $0.99 tactic (Promotions tab, ebook only, KDP Select required).
- [ ] **Author Central:** add the bio (`KDP_METADATA.md` § Author bio), claim the title, optionally add an author photo.
- [ ] Sanity-check the live listing: title with *ä*, both formats, description renders, price, "Look Inside."

---

## File manifest (what gets uploaded)

| Purpose | File |
|---|---|
| Ebook manuscript | `anna_sen_menna_kdp_ebook.epub` *(validated EPUB 3)* |
| Ebook cover | `cover/anna_sen_menna_cover_ebook.png` |
| Paperback interior | `anna_sen_menna_kdp_print_interior.pdf` |
| Paperback cover (full wrap) | `cover/anna_sen_menna_cover_wrap.pdf` |
| All field values | `KDP_METADATA.md` |

*Rebuild commands: `node build_epub.mjs` (ebook) · `python build_print_interior.py` (interior) · `python cover/build_wrap.py cover/<art>.jpg 222` (wrap). Any manuscript change → rebuild interior **and** wrap (spine width depends on page count).*
