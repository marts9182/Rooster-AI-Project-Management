# Diabetes Log Books Pair (A + C) — Design

**Date:** 2026-05-20
**Imprint:** Pocket Rooster Press
**Brainstormed with:** Claude (Opus 4.7)
**Status:** Awaiting user spec review

---

## 1. Problem statement

Pocket Rooster Press has a proven senior-puzzle line (8 SKUs live, 2 in KDP review as of 2026-05-17) and reusable `journal_templates.py` infrastructure (`TrackerPage`, `WeeklyLogPage`, `MonthlyPlanSpread`, `LinedNotePage`, `ReflectionPage`) that has not yet been used to ship a non-puzzle, non-coloring SKU. The user wants to enter the **diabetes log book** category with a release optimized for high sell-through potential on Amazon KDP.

The category research surfaced two cleanly differentiated buyer segments:

1. **Seniors with Type 2 diabetes** (~80% of category demand) — buy large-print, 2-year, weekly, before/after-meals log books. Highly saturated category, won by execution and review quality.
2. **CGM (continuous glucose monitor) users** — newer and growing fast since Stelo (Dexcom) went OTC in 2024. The device gives them numbers; the paper log gives them food/exercise/mood context the app misses and a doctor-visit prep summary. Very low direct competition.

Common review complaints against existing logs (drives our differentiation):

- "Large print" claims that aren't actually 18pt+
- No doctor-visit prep section
- Food/carb columns with no carb-reference cheat sheet
- Mood/water/sleep added but never explained
- No A1C + weight trend page

## 2. Decision: ship two SKUs as a paired release

| # | SKU | Strategic role | Trim | Target submit |
|---|---|---|---|---|
| **A** | Large Print Diabetes Log Book for Seniors — 2 Year | Volume hero — biggest TAM, on-brand with senior-puzzle line | 8.5 × 11 | Day 4 |
| **C** | CGM Companion Logbook | Differentiation hero — low-competition adjacent niche, sets up a new sub-brand | 6 × 9 | Day 5 |

**Why pair them:**

- Roughly 60% of the implementation surface (templates, cover system, bundle pipeline, listing scaffolding) is shared. Building one then the other is significantly cheaper than two separate cycles.
- A and C target different keyword spaces, so they don't cannibalize each other. Caregiver buyers may legitimately buy both (parent on fingersticks + adult child newly on Stelo).
- Two simultaneous submissions give us two chances at the Amazon "new release" 30-day algorithmic boost in the same week.

**What we deliberately are NOT shipping this cycle:**

- Prediabetes 90-day reset journal (Angle B). Real opportunity, but off-brand for the senior line and requires more education content. Queue for Q3 after we've validated this pair.
- Gestational diabetes 40-week edition. Real demand, but content sensitivities (miscarriage, NICU language) require dedicated editorial review.
- Combined Diabetes + Hypertension log. Could be SKU D later; not in this cycle.

## 3. Shared infrastructure (built once, used by both)

### 3.1 `journal_templates.py` additions

**`DiabetesWeeklySpread`** (parameterized for fingerstick vs CGM mode)

- Fingerstick mode (SKU A): per-day row with 4 meal slots × {before, after} numeric fields + bedtime + BP + meds-taken checkbox + weight slot + energy 1-5 + notes line
- CGM mode (SKU C): per-day row with TIR% box + avg + low + high + food/carbs + exercise + mood + insulin + notes
- Both: weekly summary row (averages, lowest/highest of the week, doctor-visit flag toggle)

**`QuarterlyDoctorVisitPrep`**

- A1C goal vs actual (with last-3 trend boxes)
- Weight change since last visit
- BP average
- Current medications + dose changes
- "Questions to ask my doctor" (5 numbered lines)
- "Things I noticed" (free-form lined area)

**`MonthlyA1CTrend`** (used in C, optional in A)

- 12-row table: month, A1C, weight, avg BG, notes
- Simple sparkline-style trend marker between rows (drawn with reportlab primitives, not external charts)

### 3.2 Cover system

- Reuse `CoverBuilder` with the locked **playful theme** (cream `#FBF3E2`→`#F0E6D1`, teal `#1F4F66`, brass `#CAA457`, coral `#D86C5C`)
- New hero motif family: stylized glucose droplet + meter line — programmatic vector, **not** AI-generated (consistent with [[cover-hero-decoration-only]]: reserve top ~430px / bottom ~160px for wrap typography)
- A and C share the motif family for series cohesion; A uses a warmer cream-dominant variant, C uses a cooler teal-dominant variant

### 3.3 Bundle pipeline

- Reuse `scripts/build_kdp_bundle.py` unchanged
- Reuse `scripts/audit_pdfs.py` unchanged
- Add one assertion to audit: body-font size measurement on a sampled daily-log page must be ≥ 18pt for SKU A and ≥ 11pt for SKU C

## 4. SKU A — Large Print Diabetes Log Book for Seniors

**Working title:** *Large Print Diabetes Log Book for Seniors: 2-Year Blood Sugar, Blood Pressure & Medication Tracker with Doctor Visit Prep*

**Book ID:** `large-print-diabetes-log-v1`

### 4.1 Format

- 8.5 × 11, paperback
- ~124 pages (target 124; KDP print-cost step is at 108)
- $7.99 list price (matches top-3 bestsellers; we win on quality not undercut)
- BISAC: Health & Fitness / Diseases / Diabetes; secondary Health & Fitness / Aging

### 4.2 Interior page budget (~124 pp)

| Section | Pages |
|---|---|
| Title page, copyright | 2 |
| How to use this book | 2 |
| Carb cheat sheet for common foods | 4 |
| Symbols legend + sample week filled in | 2 |
| Weekly log pages (104 weeks, 1 page per week) | 104 |
| Quarterly Doctor Visit Prep (every 13 weeks → 8 across 2 years) | 8 |
| Monthly A1C/Weight Trend (skipped for A to hold page count; deferred to v2) | 0 |
| End matter: notes pages, about Pocket Rooster Press | 2 |

Total: **124 pages**.

### 4.3 Daily/weekly schema (1 page per week)

Top half (Mon/Tue/Wed/Thu): four rows, each with columns
- Date | BF before | BF after | LU before | LU after | DN before | DN after | Bedtime | BP | Weight | Energy 1-5 | Notes (short line)

Bottom half (Fri/Sat/Sun + weekly summary):
- 3 day rows in same schema
- Weekly summary row: avg BG, lowest, highest, BP avg, weight change, "flag for doctor" checkbox

All body type at 18pt or greater — verified by audit assertion.

### 4.4 Differentiators called out on cover and in A+ content

1. "Genuinely 18pt large print — measured, not promised"
2. "Quarterly Doctor Visit Prep pages built in"
3. "Carb reference for 60 common foods"
4. "Tracks blood sugar, blood pressure, medications & weight together"

### 4.5 KDP listing

**Title:** *Large Print Diabetes Log Book for Seniors: 2-Year Blood Sugar, Blood Pressure & Medication Tracker with Doctor Visit Prep*

**Subtitle:** *124 Pages · 104 Weekly Spreads · 18pt Large Print · Carb Cheat Sheet Included*

**Keywords (7 slots):**
1. large print diabetes log book seniors
2. blood sugar log book 2 year
3. diabetic journal before after meals
4. blood pressure tracker for diabetics
5. medication log book elderly
6. diabetes gift for grandma grandpa
7. glucose monitor notebook

**Categories (3):** Health/Fitness/Diabetes/General; Health/Fitness/Aging; Reference/Personal Health.

## 5. SKU C — CGM Companion Logbook

**Working title:** *CGM Companion Logbook: Track Time-in-Range, Food, Patterns & Doctor Visits — for Dexcom, Libre, Stelo & All Continuous Glucose Monitors*

**Book ID:** `cgm-companion-logbook-v1`

### 5.1 Format

- 6 × 9, paperback (portable — CGM users are typically younger, more active)
- ~140 pages
- $8.99 list price (premium for newer niche, less price compression)
- BISAC: Health & Fitness / Diseases / Diabetes; secondary Medical / Diabetes

### 5.2 Interior page budget (140 pp)

| Section | Pages |
|---|---|
| Title page, copyright | 2 |
| How CGM data works (1-page primer) | 2 |
| What this book captures that your app doesn't | 2 |
| How to read your AGP / TIR patterns | 4 |
| Symbols + sample week filled in | 2 |
| Weekly log pages (104 weeks, 1 page per week) | 104 |
| Weekly Time-in-Range Review (folded into weekly summary row) | 0 |
| Quarterly Doctor Visit Prep (every 13 weeks → 8) | 8 |
| Monthly A1C/Weight/GMI Trend (folded into the quarterly page) | 0 |
| GMI vs lab A1C comparison page (every 13 weeks → 8) | 8 |
| Sample filled-in doctor visit prep | 2 |
| Glossary (TIR, GMI, CV%, AGP) | 2 |
| End matter | 4 |

Total: **140 pages**.

### 5.3 Daily/weekly schema

Each week row:
- Device summary box: TIR% target / TIR% actual / avg / low / high (transcribed from app)
- Food & carbs (short line, supports carb counters)
- Exercise (type + minutes)
- Mood (1-5)
- Insulin / medication
- "What pattern did I see?" (1 line)

Weekly summary row: 7-day TIR%, lowest of week (with timestamp), highest (with timestamp), "share with care team" flag.

### 5.4 Differentiators called out on cover and in A+ content

1. "Works with any CGM — Dexcom, Libre, Stelo, and more"
2. "Captures the food, mood, and exercise context your app misses"
3. "Quarterly GMI vs A1C reconciliation page"
4. "Built-in time-in-range review and doctor-visit prep"

### 5.5 KDP listing

**Title:** *CGM Companion Logbook: Track Time-in-Range, Food, Patterns & Doctor Visits — for Dexcom, Libre, Stelo & All Continuous Glucose Monitors*

**Subtitle:** *140 Pages · 104 Weekly Spreads · Quarterly GMI vs A1C Reconciliation · Portable 6×9*

**Keywords (7 slots):**
1. CGM logbook continuous glucose monitor journal
2. Dexcom log book
3. Freestyle Libre journal
4. Stelo glucose tracker notebook
5. time in range tracker diabetes
6. diabetes journal for adults type 1
7. blood sugar journal for insulin users

**Categories (3):** Health/Fitness/Diabetes/General; Medical/Diabetes; Reference/Personal Health.

## 6. Anti-cannibalization

A and C target distinct keyword spaces ("large print … seniors … 2 year" vs "CGM … time in range … Dexcom"). Search overlap is minimal. The shared "Pocket Rooster Press" author page provides a positive cross-link without keyword competition.

## 7. Implementation surface — net new work

| Component | Surface | Notes |
|---|---|---|
| `DiabetesWeeklySpread` template | ~250 LOC + tests | Parameterized for fingerstick / CGM mode |
| `QuarterlyDoctorVisitPrep` template | ~120 LOC + tests | Shared by both SKUs |
| `MonthlyA1CTrend` template | ~100 LOC + tests | Used by C; reserve for A v2 |
| `GMIvsA1CComparison` template (C-only) | ~80 LOC + tests | |
| Carb reference data (~60 foods) | ~1 JSON file, ~100 LOC content | A only |
| `books/large_print_diabetes_log_v1.py` | ~200 LOC | Mirrors `kakuro_quiet_minds.py` |
| `books/cgm_companion_logbook_v1.py` | ~220 LOC | |
| Cover hero (vector glucose-droplet motif) | ~150 LOC | Programmatic, no AI |
| Listings (title, description, A+ bullets) | 2 listing.md files | |
| Audit assertion: body-font size on logs | ~30 LOC | New rule in `audit_pdfs.py` |
| Bundle pipeline | reuse | |

Estimated effort: **~5 working days** end-to-end including KDP submission for both SKUs.

## 8. Sequencing (proposed for the plan)

1. Day 1: Shared templates (`DiabetesWeeklySpread`, `QuarterlyDoctorVisitPrep`, `MonthlyA1CTrend`) + tests
2. Day 2: SKU A book module + carb reference + cover hero + audit assertion
3. Day 3: SKU A bundle + listing copy + preview + final fixes
4. Day 4: SKU A KDP submit + SKU C book module + CGM-specific templates
5. Day 5: SKU C cover + bundle + listing + KDP submit

## 9. Risk and mitigation

| Risk | Mitigation |
|---|---|
| KDP rejects either book for medical-advice language | Strictly descriptive copy — "track" not "treat", "share with your doctor" not "what your numbers mean". No specific blood-sugar guidance. |
| 18pt body type makes A go over page count → print cost step | Audit measures and reports; if over budget, drop carb cheat sheet from 4pp to 2pp before cutting log weeks |
| CGM brand trademarks (Dexcom, Libre, Stelo) trigger Amazon brand-gating | Use nominative fair-use phrasing ("works with"), no logos, no implication of partnership. Listing uses "and all continuous glucose monitors" in the subtitle. |
| C book audience (more sophisticated) leaves harsher reviews if anything is off | Quality bar on C is higher: more polish passes, internal beta read before submission |
| Competing with a thousand clones for A | Lean on the four named differentiators on the cover and the A+ content; expect first ~30 days organic to be slow until reviews start landing |

## 10. Success criteria

**Launch milestones:**
- Both SKUs accepted by KDP within 7 days of submission
- Both live on Amazon detail pages within 14 days
- First reviews appearing within 30 days

**90-day commercial targets** (rough, based on category data):
- SKU A: 5–15 sales/month at $7.99 — typical for a new clone-category entrant; goal is to reach 25+ reviews by day 90 to start organic ranking compounding
- SKU C: 2–8 sales/month at $8.99 — lower volume, higher per-unit margin, less competition; goal is to be in the top 5 results for "CGM logbook" by day 90

**Kill criteria:** if 90-day reviews on either book average below 4.0 stars, treat as a learning release and move on (do not push paid ads).

## 11. v2 follow-ons (out of scope for this spec)

- SKU A v2: add MonthlyA1CTrend pages, 1-year variant at 6×9 (portable)
- SKU C v2: per-brand specialized editions ("Dexcom Companion Logbook")
- SKU D: Prediabetes 90-Day Reset Journal (Angle B, deferred)
- SKU E: Gestational Diabetes 40-Week Edition
- SKU F: Combined Diabetes + Hypertension Log

## 12. Related memories

- [[kdp-catalog-status-2026-05-17]] — current published-vs-in-review state; both A and C are new SKUs, no ASIN reuse risk
- [[kdp-cover-design-playful-theme]] — locked cover direction we inherit
- [[cover-hero-decoration-only]] — hero PNG rules; our droplet motif must respect the reserved typography zones
- [[text-page-pagination]] — front-matter renderer; reuse for how-to and carb cheat sheet
