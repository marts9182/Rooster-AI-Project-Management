# Rooster Studio — Etsy Digital Product Shop Plan

**Status:** Strategy locked, awaiting Phase 0 setup.
**Created:** 2026-05-23 planning session.
**Future content location:** `etsy-ideas/rooster-studio/products/`
**Companion doc:** [MARKET-RESEARCH.md](./MARKET-RESEARCH.md) *(to be drafted from prompt's research)*

---

## Brand Identity (TENTATIVE — pending handle verification)

- **Shop name:** Rooster Studio
  - Alternates if unavailable: Pocket Rooster Studio, Rooster Desk, Rooster Workroom
- **Parent brand family:** Rooster
  - Hero Rooster — mobile game (`projects/heroRooster/`)
  - Pocket Rooster Press — KDP puzzle book imprint (`book-ideas/pocket-rooster-press/`)
  - **Rooster Studio — Etsy digital products (this doc)**
  - Rooster AI — the project-management agent platform (this repo) — *cross-promo asset, see "Dogfooding flywheel" below*
- **Tagline (draft):** "Templates that get to work."
- **Mascot:** Hero Rooster character, restyled for desk/productivity context (laptop + headset or clipboard, B&W-friendly)
- **Cross-promo lines:**
  - "From the makers of Pocket Rooster Press" — links print buyers to digital
  - "Built with Rooster AI" — credits the agent platform, drives backlinks
- **Typography:** Match Pocket Rooster Press for brand cohesion — Playfair Display (titles) + Lato (body)
- **2026 algorithmic-tailwind palette:** Patina Blue `#5B7C7A` + Washed Linen `#E8DFD3` + ink `#1A1A1A` (Etsy's official Color/Texture of the Year)

## Handle Availability (TODO — verify before launch)

Check and register before any product art goes public (~$15 total):
- [ ] `roosterstudio.com` (Namecheap/Whois)
- [ ] Etsy shop `roosterstudio`
- [ ] Gumroad `roosterstudio` (mirror store, Phase 0)
- [ ] Pinterest `@roosterstudio` (primary traffic channel)
- [ ] Instagram `@roosterstudio` (secondary)
- [ ] Also reserve `.shop`, `.co` as defensives

---

## Strategy (LOCKED)

### The contrarian read on the market research

The prompt's research says "top sellers have 158+ listings" — that's the *median* outcome, not the playbook. The data points that matter:

- **Thomas Frank** — $1M from **2** Notion templates
- **Easlo** — $500K from **~12** Notion templates
- **InsightsByJess** — $168K Year 1 from **1** spreadsheet

Volume is a *lagging* indicator of success, not a leading one. Optimizing for it on day 1 is the wrong objective function.

### Why Tier 2 first (locked decision)

Given the constraints (Claude + Canva only, no Midjourney/Photoshop):

| Tier | Claude lift | Canva lift | Time/product | Price ceiling | Fit |
|------|-------------|------------|--------------|---------------|-----|
| 1 — Planners (ADHD, menopause, homeschool) | 30% | 70% (50–100 pages of design) | 8–15 hrs | $45 | ⚠️ Slow validation |
| **2 — Prompt packs / Notion / Sheets** | **90%** | **10%** | **3–6 hrs** | **$79–99** | ✅ Best fit |
| 3 — PNG/SVG bundles | 10% | 90% (visual design needed) | 4–8 hrs | $15 | ❌ Wrong tools |

**Tier 2 is the arbitrage** — Claude generates 90% of the deliverable in the same tool we're already using. Tier 1 is high-lift slow-validation. Tier 3 is out of scope until image-gen tooling is added.

### The four principles

1. **Validate cheap before you validate expensive.** A $19–29 prompt pack proves shop + SEO + Pinterest + mockup quality in 30 days. A $25 planner takes 2 weeks to build; if it fails, you can't tell whether the product or the channel failed.
2. **One winning product compounds; four mediocre products dilute.** Pick one profession, ship 4 angles (planner, prompt pack, Notion, Sheets) → cross-sell within the buyer.
3. **Etsy is a funnel, not a destination.** Etsy keeps ~17% of every sale. The real $8–10K/mo number is $4K Etsy + $4–6K Gumroad/own-site, with email capture in every PDF. **Gumroad gets set up day 1, not month 3.**
4. **CompoundingSKU beats BroadNiche.** One Claude-generated content base → 5 SKUs (standalone, bundle, profession-swap, Notion-integrated, team variant). 5× SEO surface, 1× writing time.

### Dogfooding flywheel (unique to this repo)

This repo (`Rooster AI Project Management`) ships AI agents for PM work. That's an asset most Etsy sellers don't have:
- **Worked examples in prompt packs** = real outputs from Rooster AI agents, screenshotted
- **Listing copy** = "Built with the same AI workflow that powers Rooster AI"
- **Backlinks** in every product PDF → traffic to the SaaS
- **Eventually:** an "Etsy seller's AI workflow" prompt pack that sells the dogfood itself

Build this in from day 1 — don't bolt on later.

---

## Phase 0 — Setup (Day 1, ~3 hrs of work)

- [ ] Verify all handles from list above; register .com + Etsy + Gumroad + Pinterest
- [ ] Etsy seller account (legal name, tax info, payout bank — single biggest blocker)
- [ ] Gumroad mirror account + brand banner
- [ ] Pinterest business account, claim Etsy + Gumroad domains
- [ ] Decide tax structure (sole prop vs. LLC; 1099-K threshold = $600)
- [ ] Repo scaffolding (see [Folder structure](#folder-structure) below)
- [ ] Draft policies (refunds, IP usage, AI disclosure) — boilerplate, reused per listing
- [ ] Create brand asset starter pack in Canva: logo, color palette, font pairs, mockup frame templates (phone, tablet, laptop, print)
- [ ] Email capture mechanism: ConvertKit free tier OR Gumroad's built-in (lead magnet = "5 free [profession] prompts")

---

## Phase 1 — Cheap Validation (Week 1, ~2 days build time)

Ship **4 Tier-2 AI prompt packs**, same template, 4 professions. Each ~3–6 hrs in Claude (in this tool):

| # | Title (working) | Profession | Price | Notes |
|---|---|---|---|---|
| 1 | AI Workflow System for Realtors | Realtors | $29 | Highest-ticket buyer pool |
| 2 | AI Workflow System for Therapists | Therapists / counselors | $29 | Premium, low competition |
| 3 | AI Workflow System for Nurses | Nurses (ICU/ER/new grad) | $24 | Broadest market |
| 4 | AI Workflow System for Teachers | Teachers | $19 | Highest volume potential |

**Each product contains:**
- 100–150 prompts organized by use case
- 20 worked examples with sample outputs (**required by Etsy's June 2025 AI policy** — raw prompt PDFs are not allowed)
- 1 editable Canva template (e.g., listing description filler for realtors, session note template for therapists)
- Quick-start guide (PDF)
- Email-capture lead magnet inside PDF → drives to Gumroad mirror

**Each listing requires:**
- Title under 140 chars, primary keyword first
- 13 tags (2–3 word phrases, no repeats of title words)
- Description with hook + bullet benefits + file list + AI disclosure ("Designed by [shop], created with assistance from Claude AI")
- 5 Canva mockups minimum (phone, tablet, laptop, printed, lifestyle)
- Category: Craft Supplies & Tools → Patterns & How To → Worksheets & Templates
- Listing pacing: max 2 per day → 4 listings live by end of week 1 (stays well under 10–15/day algorithm flag)

---

## Phase 2 — Double Down on the Winner (Weeks 2–4)

Wait 30 days for Pinterest traffic to mature. The data picks for you:

**For the best-converting profession:**
- Ship **5 CompoundingSKU variants** of that base:
  1. Sub-role variant (e.g., "for Buyer's Agents" or "for New Agents Year 1")
  2. Bundle (base pack + sub-role variant) at $49
  3. Notion-integrated version at $34
  4. Google Sheets / Excel tracker for the same profession at $19
  5. Team / office-of-3 version at $79
- THEN build that profession's **Tier 1 planner** ($19–29) — now it's an upsell to a proven buyer pool, not a cold launch

**For the worst-performing profession:**
- Kill it. Do not iterate dead niches.

**Pinterest cadence:** 5 pins per product per week × 4 weeks = 20 pins per winner

---

## Phase 3 — Brand Widening (Month 2+)

- Replay Phase 1+2 for the 2nd-best profession from Phase 1 data
- Add a **broad-buyer Tier 1 product** that doesn't need a profession split:
  - Perimenopause/PCOS symptom tracker (framed as personal journaling tool — no medical claims)
- Pinterest scaled to 30 pins per product over 90 days (AI-generated in Canva)
- **Etsy Ads $1–3/day** only on the top 3 converters; never on cold listings
- Gumroad mirror gets full catalog; promote via email list built in Phase 1
- Cross-promo: Pocket Rooster Press print-book buyers → Rooster Studio digital templates
- Cross-promo: "AI workflow used to build this" → Rooster AI landing page

---

## Out of Scope (Deliberate Exclusions)

- ❌ **Tier 3 PNG/SVG design files** — wrong tooling fit (no Midjourney/Photoshop); brutal competition; lowest price ceiling
- ❌ **State-specific homeschool planners** — huge research lift, market splits 50 ways; revisit only after $3K/mo from other lines
- ❌ **Launching all 4 niches in week 1** — content-farm flag risk + dilutes brand
- ❌ **PLR/MRR bundle reselling** — Etsy removes these
- ❌ **Medical/therapeutic claims in health trackers** — frame strictly as personal journaling tools
- ❌ **Heavy Etsy Ads** before there's a proven converter
- ❌ **TikTok/Reels** in Phase 1 — Pinterest is the higher-ROI channel for digital templates

---

## Success Metrics (per phase)

| Phase | Window | Target |
|-------|--------|--------|
| 0 | Day 1 | Handles registered, Etsy account live, repo scaffolded |
| 1 | Week 1 | 4 listings live, 4 Pinterest boards seeded with 3 pins each |
| 1 | Day 30 | ≥1 sale (any product) = channel validated |
| 1 | Day 30 | If 0 sales: diagnose mockups → SEO → pricing → niche, in that order |
| 2 | Day 60 | $500/mo run-rate on winner's variants |
| 2 | Day 90 | $1.5–2K/mo, 1 Tier 1 planner shipped |
| 3 | Month 6 | $4–5K/mo Etsy + $1–2K/mo Gumroad |
| 3 | Month 12 | $8–10K/mo gross combined |

If Month 3 < $1K/mo: niche/positioning problem, not volume problem. Don't scale-by-spam.

---

## Folder Structure (to scaffold in Phase 0)

```
etsy-ideas/rooster-studio/
  PLAN.md                          ← this file
  MARKET-RESEARCH.md               ← Tier 1/2/3 data, validated income proof
  BRAND.md                         ← logo, palette, voice, mockup framework
  COMPLIANCE.md                    ← Etsy AI policy, disclosures, no-medical-claims rules
  templates/
    listing-template.md            ← title / 13 tags / description / price / category
    product-spec-template.md       ← product brief Claude fills in
    seo-keywords.md                ← keyword tracker table
    batch-checklist.md             ← niche idea → ready-to-upload in one session
    pinterest-pin-template.md      ← 5-pin starter per product
    mockup-checklist.md            ← 5-mockup minimum spec
  products/
    realtor-ai-workflow/
      content-draft.md             ← Claude-generated prompts + worked examples
      canva-instructions.md        ← exact Canva steps + file names
      listing.md                   ← final Etsy listing copy
      seo.md                       ← keywords used, search vol notes
      files/                       ← final PDF + Canva export staging (gitignored)
    therapist-ai-workflow/
    nurse-ai-workflow/
    teacher-ai-workflow/
```

---

## Open Questions

- [ ] Verify all handles available (Phase 0 blocker — could force rename)
- [ ] Single LLC for Rooster brand family, or per-imprint? (Tax + liability question, not a product question)
- [ ] Email tool: ConvertKit free vs. Gumroad built-in vs. Buttondown
- [ ] Do we mirror this plan's structure into the Pocket Rooster Press doc retroactively (CompoundingSKU model, dogfooding flywheel)?
- [ ] eRank subscription ($5.99/mo) for SEO keyword data — worth it before Phase 1, or wait until Phase 2?
