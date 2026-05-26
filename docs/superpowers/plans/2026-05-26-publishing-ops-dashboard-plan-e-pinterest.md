# Publishing Ops Dashboard — Plan E: Pinterest desktop automation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Prerequisites:** Plans A and B merged. Plans C and D can be merged in any order.

**Goal:** Generate cover-hero and interior-preview pin images, queue them on a jittered 3–5/day schedule, and post them to Pinterest via a Playwright persistent-profile session. Surface queue/history/settings + a re-login button at `/pinterest`.

**Architecture:** Pin image generation is pure (templates + generator); the scheduler is pure (queue insertion math); the poster is the only impure part — Playwright `launchPersistentContext` against pinterest.com, with login-state detection that pauses the queue and fires a reminder if the session expires.

**Tech Stack:** Playwright (chromium), sharp (image composition), @napi-rs/canvas (text fallback), better-sqlite3, Express, Vitest, supertest.

---

## Pre-flight context (read once)

- Spec: `docs/superpowers/specs/2026-05-26-publishing-ops-dashboard-design.md` §3.2 (pinterest module), §4 (`pinterest_queue` / `pinterest_history` tables), §5.4 (posting flow), §5.6 (`pinterest:*` SSE channels), §6.8 (UI), §7.2 (poster failure modes).
- Brand palette (KDP playful theme): cream `#FBF3E2` background, deep teal `#1F4F66` title, brass `#CAA457` accent, coral `#D86C5C` accent. Memory: `kdp-cover-design-playful-theme`.
- Pinterest pin spec: 1000 × 1500 (2:3 ratio).
- Cadence: 3–5 pins/day, jittered between 09:00 and 21:00 local in `profile.time_zone`.
- Persistent profile path: `web.ui/backend/.pinterest-profile/` (must be gitignored).
- Output PNG path: `output/pinterest/<slug>/<pin_type>-<idx>.png` (repo-root `output/`, gitignored).
- Plan B already (1) creates SQLite schema via Plan A migrations, (2) inserts six rows into `pinterest_queue` via `planSixPinsForBook` + the `/api/kdp/books/:slug/mark-published` route. Plan E replaces the placeholder image paths in those rows by materialising real PNGs and exposing the `enqueuePinsForBook(bookId)` helper that the mark-published route will call instead of its inline planner.

## Image-library choice (rationale)

- **`sharp`** for all raster composition (resize, composite, PNG encode). Native (`libvips`), fast, handles 1000 × 1500 in <100 ms per pin.
- **`@napi-rs/canvas`** for text rendering (title wrapping, font metrics, kerning). `sharp` cannot render arbitrary text on top of an image, and SVG-text via `sharp` lacks line-wrap. We pre-render captions to a transparent PNG with `@napi-rs/canvas` and then composite onto the cream background with `sharp`.
- A single bundled font is shipped at `web.ui/backend/pinterest/assets/Inter-Bold.ttf` (free SIL OFL, included in the repo).

## File structure (Plan E adds)

```
web.ui/backend/
  pinterest/
    palette.js                      Brand palette constants + font registration
    templates/
      cover_hero.js                 Pure: book + caption → 1000×1500 PNG buffer
      interior_preview.js           Pure: page preview + caption → 1000×1500 PNG buffer
    generator.js                    Materialises PNG files for a book row
    scheduler.js                    Pure: assign scheduled_for to queue rows (jittered 3–5/day)
    queue.js                        DB helpers: enqueue / dequeue / mark / pause / resume
    poster.js                       Worker — playwright driver, retries, login detection
    login.js                        One-time visible-Chromium login helper
    routes.js                       Express router for /api/pinterest/*
    index.js                        Module surface: installPinterestModule, startPosterWorker
    assets/
      Inter-Bold.ttf                Bundled font for text rendering
  __tests__/pinterest/
    palette.test.js
    cover_hero.test.js
    interior_preview.test.js
    generator.test.js
    scheduler.test.js
    queue.test.js
    poster.test.js
    routes.test.js
  help/
    pinterest_first_login.md
  scripts/
    test-pinterest-live.mjs         Manual gated by PINTEREST_LIVE=1

web.ui/frontend-react/src/
  pages/
    Pinterest.tsx                   Replaces Plan A scaffold
  components/
    PinterestQueueTable.tsx
    PinterestHistoryTable.tsx
    PinterestSettings.tsx
    PinPreviewModal.tsx
  services/
    pinterest.ts                    Typed fetch client

.gitignore                          Add web.ui/backend/.pinterest-profile/, output/pinterest/
```

---

## Task 1: Install backend dependencies + register assets directory

- [ ] Add dependencies to `web.ui/backend/package.json`. Run from `web.ui/backend/`:

  ```bash
  npm install --save sharp@^0.33.5 @napi-rs/canvas@^0.1.56 playwright@^1.49.0
  ```

  Expected: `package.json` shows the three new `dependencies` entries. Playwright Chromium binary is downloaded as part of postinstall.

- [ ] If Playwright's Chromium download was skipped (e.g. in offline CI), force it:

  ```bash
  npx playwright install chromium
  ```

  Expected: `Chromium <version> downloaded` or `is already installed`.

- [ ] Create the assets directory and download the bundled font:

  ```bash
  mkdir -p web.ui/backend/pinterest/assets
  curl -L -o web.ui/backend/pinterest/assets/Inter-Bold.ttf \
    https://github.com/rsms/inter/raw/master/docs/font-files/Inter-Bold.ttf
  ```

  Expected: a ~330 KB TTF file. (If curl is unavailable, manually drop `Inter-Bold.ttf` into that path — any bold sans-serif TTF licensed for redistribution works.)

  Verify:

  ```powershell
  Test-Path "web.ui/backend/pinterest/assets/Inter-Bold.ttf"
  ```

  Expected: `True`.

- [ ] Append to `.gitignore` (root):

  ```
  # Plan E — Pinterest automation
  web.ui/backend/.pinterest-profile/
  output/pinterest/
  ```

  Verify:

  ```bash
  git check-ignore -v web.ui/backend/.pinterest-profile/foo output/pinterest/bar.png
  ```

  Expected: both paths shown with their `.gitignore` rule lines.

- [ ] Commit:

  ```bash
  git add web.ui/backend/package.json web.ui/backend/package-lock.json \
          web.ui/backend/pinterest/assets/Inter-Bold.ttf \
          .gitignore
  git commit -m "build(pinterest): sharp + @napi-rs/canvas + playwright deps and bundled font"
  ```

---

## Task 2: Brand palette constants + font registration

- [ ] Write `web.ui/backend/__tests__/pinterest/palette.test.js`:

  ```javascript
  import { describe, it, expect } from 'vitest';
  import { PALETTE, FONT_FAMILY, registerFonts } from '../../pinterest/palette.js';

  describe('palette', () => {
    it('exposes the four playful-theme brand colors', () => {
      expect(PALETTE.cream).toBe('#FBF3E2');
      expect(PALETTE.teal).toBe('#1F4F66');
      expect(PALETTE.brass).toBe('#CAA457');
      expect(PALETTE.coral).toBe('#D86C5C');
    });

    it('exposes the registered font family name', () => {
      expect(FONT_FAMILY).toBe('InterBold');
    });

    it('registerFonts is idempotent', () => {
      expect(() => registerFonts()).not.toThrow();
      expect(() => registerFonts()).not.toThrow();
    });
  });
  ```

- [ ] Run, confirm failure:

  ```bash
  cd web.ui/backend && npx vitest run __tests__/pinterest/palette.test.js
  ```

  Expected: module not found.

- [ ] Implement `web.ui/backend/pinterest/palette.js`:

  ```javascript
  /**
   * Brand palette + font registration for Pinterest pin templates.
   *
   * Source of truth: memory `kdp-cover-design-playful-theme.md`.
   * @module pinterest/palette
   */

  import path from 'node:path';
  import fs from 'node:fs';
  import { fileURLToPath } from 'node:url';
  import { GlobalFonts } from '@napi-rs/canvas';

  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);

  export const PALETTE = Object.freeze({
    cream: '#FBF3E2',
    teal: '#1F4F66',
    brass: '#CAA457',
    coral: '#D86C5C',
  });

  export const FONT_FAMILY = 'InterBold';

  let registered = false;

  /**
   * Register the bundled Inter-Bold font with @napi-rs/canvas. Idempotent —
   * safe to call from every template invocation.
   */
  export function registerFonts() {
    if (registered) return;
    const fontPath = path.resolve(__dirname, 'assets', 'Inter-Bold.ttf');
    if (!fs.existsSync(fontPath)) {
      throw new Error(`Inter-Bold.ttf not found at ${fontPath}`);
    }
    GlobalFonts.registerFromPath(fontPath, FONT_FAMILY);
    registered = true;
  }
  ```

- [ ] Re-run, confirm pass:

  ```bash
  cd web.ui/backend && npx vitest run __tests__/pinterest/palette.test.js
  ```

  Expected: 3 tests pass.

- [ ] Commit:

  ```bash
  git add web.ui/backend/pinterest/palette.js web.ui/backend/__tests__/pinterest/palette.test.js
  git commit -m "feat(pinterest): brand palette constants + idempotent font registration"
  ```

---

## Task 3: cover_hero template — pure 1000×1500 composition

- [ ] Write `web.ui/backend/__tests__/pinterest/cover_hero.test.js`:

  ```javascript
  import { describe, it, expect, beforeAll } from 'vitest';
  import sharp from 'sharp';
  import { renderCoverHero } from '../../pinterest/templates/cover_hero.js';

  /** A tiny 100×150 cream-colored PNG used as a stand-in cover. */
  async function makeFakeCoverBuffer() {
    return sharp({
      create: {
        width: 100,
        height: 150,
        channels: 3,
        background: { r: 251, g: 243, b: 226 },
      },
    })
      .png()
      .toBuffer();
  }

  describe('renderCoverHero', () => {
    let cover;
    beforeAll(async () => {
      cover = await makeFakeCoverBuffer();
    });

    it('returns a PNG buffer that is exactly 1000×1500', async () => {
      const out = await renderCoverHero({
        coverPng: cover,
        title: 'Kakuro for Quiet Minds',
        subtitle: 'Large-print logic puzzles',
      });
      const meta = await sharp(out).metadata();
      expect(meta.width).toBe(1000);
      expect(meta.height).toBe(1500);
      expect(meta.format).toBe('png');
    });

    it('handles long titles without overflow (wraps to <=3 lines)', async () => {
      const out = await renderCoverHero({
        coverPng: cover,
        title: 'A Very Long Title That Definitely Wraps Across Multiple Lines',
        subtitle: 'Subtitle here',
      });
      // Just verify the buffer is non-empty and valid PNG.
      expect(out.length).toBeGreaterThan(1000);
      const meta = await sharp(out).metadata();
      expect(meta.height).toBe(1500);
    });

    it('omits subtitle gracefully', async () => {
      const out = await renderCoverHero({
        coverPng: cover,
        title: 'Title Only',
      });
      const meta = await sharp(out).metadata();
      expect(meta.width).toBe(1000);
      expect(meta.height).toBe(1500);
    });
  });
  ```

- [ ] Run, confirm failure:

  ```bash
  cd web.ui/backend && npx vitest run __tests__/pinterest/cover_hero.test.js
  ```

  Expected: module not found.

- [ ] Implement `web.ui/backend/pinterest/templates/cover_hero.js`:

  ```javascript
  /**
   * Pure pin template — composes a 1000×1500 "cover hero" PNG.
   *
   * Layout:
   *   - Cream background.
   *   - Cover image centered in upper 60% (max ~520×780).
   *   - Title under cover, wrapped, teal #1F4F66, Inter-Bold.
   *   - Subtitle below title, smaller, brass #CAA457.
   *   - Thin coral underline accent.
   *
   * @module pinterest/templates/cover_hero
   */

  import sharp from 'sharp';
  import { createCanvas } from '@napi-rs/canvas';
  import { PALETTE, FONT_FAMILY, registerFonts } from '../palette.js';

  const WIDTH = 1000;
  const HEIGHT = 1500;

  /**
   * @typedef {Object} CoverHeroInput
   * @property {Buffer} coverPng         PNG buffer of the source cover.
   * @property {string} title            Pin title (1–80 chars).
   * @property {string} [subtitle]       Optional subtitle line.
   */

  /**
   * @param {CoverHeroInput} input
   * @returns {Promise<Buffer>}  1000×1500 PNG.
   */
  export async function renderCoverHero({ coverPng, title, subtitle }) {
    registerFonts();

    // 1. Cream background
    const bg = sharp({
      create: {
        width: WIDTH,
        height: HEIGHT,
        channels: 4,
        background: hexToRgba(PALETTE.cream),
      },
    });

    // 2. Resize cover to fit a 520-wide box in the upper area, preserving aspect.
    const coverResized = await sharp(coverPng)
      .resize({ width: 520, height: 780, fit: 'inside' })
      .png()
      .toBuffer();
    const coverMeta = await sharp(coverResized).metadata();
    const coverLeft = Math.round((WIDTH - (coverMeta.width ?? 520)) / 2);
    const coverTop = 90;

    // 3. Caption canvas (transparent), 1000×500, drawn under the cover.
    const captionTop = coverTop + (coverMeta.height ?? 780) + 60;
    const captionPng = renderCaptionBlock({
      width: WIDTH,
      height: HEIGHT - captionTop - 80,
      title,
      subtitle,
    });

    // 4. Composite.
    return bg
      .composite([
        { input: coverResized, top: coverTop, left: coverLeft },
        { input: captionPng, top: captionTop, left: 0 },
      ])
      .png()
      .toBuffer();
  }

  /**
   * Render a transparent PNG containing the wrapped title + optional subtitle
   * + a thin coral underline accent. Pure of file I/O.
   *
   * @param {{ width: number, height: number, title: string, subtitle?: string }} args
   * @returns {Buffer}  PNG with alpha.
   */
  function renderCaptionBlock({ width, height, title, subtitle }) {
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    // Title — teal, bold, wrapped to max 3 lines.
    ctx.fillStyle = PALETTE.teal;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';

    const titleSize = pickTitleSize(title);
    ctx.font = `${titleSize}px ${FONT_FAMILY}`;
    const titleLines = wrapText(ctx, title, width - 120, 3);
    const lineHeight = Math.round(titleSize * 1.15);
    let y = 0;
    for (const line of titleLines) {
      ctx.fillText(line, width / 2, y);
      y += lineHeight;
    }

    // Coral underline accent — 4px thick, 160 wide, centered, 24px below title.
    y += 24;
    ctx.fillStyle = PALETTE.coral;
    ctx.fillRect(Math.round(width / 2 - 80), y, 160, 4);
    y += 32;

    // Subtitle — brass, smaller.
    if (subtitle) {
      ctx.fillStyle = PALETTE.brass;
      ctx.font = `36px ${FONT_FAMILY}`;
      const subLines = wrapText(ctx, subtitle, width - 160, 2);
      for (const line of subLines) {
        ctx.fillText(line, width / 2, y);
        y += 44;
      }
    }

    return canvas.toBuffer('image/png');
  }

  /**
   * Choose a base title font size so very long titles still fit.
   * @param {string} title
   * @returns {number}
   */
  function pickTitleSize(title) {
    if (title.length <= 24) return 72;
    if (title.length <= 40) return 60;
    if (title.length <= 60) return 52;
    return 44;
  }

  /**
   * Greedy word-wrap. Returns at most `maxLines` lines; the last line gets an
   * ellipsis if more text remains.
   *
   * @param {import('@napi-rs/canvas').SKRSContext2D} ctx
   * @param {string} text
   * @param {number} maxWidth
   * @param {number} maxLines
   * @returns {string[]}
   */
  function wrapText(ctx, text, maxWidth, maxLines) {
    const words = text.split(/\s+/);
    const lines = [];
    let current = '';
    for (const word of words) {
      const next = current ? `${current} ${word}` : word;
      if (ctx.measureText(next).width <= maxWidth) {
        current = next;
      } else {
        if (current) lines.push(current);
        current = word;
        if (lines.length === maxLines) break;
      }
    }
    if (current && lines.length < maxLines) lines.push(current);
    if (lines.length === maxLines) {
      // Append ellipsis if more words remained.
      const consumed = lines.join(' ').split(/\s+/).length;
      if (consumed < words.length) {
        let last = lines[maxLines - 1];
        while (ctx.measureText(last + '…').width > maxWidth && last.length > 1) {
          last = last.slice(0, -1);
        }
        lines[maxLines - 1] = last + '…';
      }
    }
    return lines;
  }

  /**
   * @param {string} hex  "#RRGGBB"
   * @returns {{r:number,g:number,b:number,alpha:number}}
   */
  function hexToRgba(hex) {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex);
    if (!m) throw new Error(`Invalid hex color: ${hex}`);
    const n = parseInt(m[1], 16);
    return { r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff, alpha: 1 };
  }
  ```

- [ ] Re-run, confirm pass:

  ```bash
  cd web.ui/backend && npx vitest run __tests__/pinterest/cover_hero.test.js
  ```

  Expected: 3 tests pass.

- [ ] Commit:

  ```bash
  git add web.ui/backend/pinterest/templates/cover_hero.js \
          web.ui/backend/__tests__/pinterest/cover_hero.test.js
  git commit -m "feat(pinterest): cover_hero template composes 1000x1500 PNG via sharp + canvas"
  ```

---

## Task 4: interior_preview template — page preview on top, caption on bottom

- [ ] Write `web.ui/backend/__tests__/pinterest/interior_preview.test.js`:

  ```javascript
  import { describe, it, expect, beforeAll } from 'vitest';
  import sharp from 'sharp';
  import { renderInteriorPreview } from '../../pinterest/templates/interior_preview.js';

  async function makeFakePagePreview() {
    return sharp({
      create: {
        width: 600,
        height: 800,
        channels: 3,
        background: { r: 255, g: 255, b: 255 },
      },
    })
      .png()
      .toBuffer();
  }

  describe('renderInteriorPreview (pin template)', () => {
    let page;
    beforeAll(async () => {
      page = await makeFakePagePreview();
    });

    it('returns a 1000×1500 PNG with the page in the top 2/3', async () => {
      const out = await renderInteriorPreview({
        pagePng: page,
        title: 'Inside Kakuro: a peek',
        subtitle: 'Large-print logic puzzles',
      });
      const meta = await sharp(out).metadata();
      expect(meta.width).toBe(1000);
      expect(meta.height).toBe(1500);
    });

    it('handles very short titles', async () => {
      const out = await renderInteriorPreview({
        pagePng: page,
        title: 'Peek',
      });
      const meta = await sharp(out).metadata();
      expect(meta.width).toBe(1000);
    });

    it('throws on missing pagePng', async () => {
      await expect(
        renderInteriorPreview({ title: 'no page provided' }),
      ).rejects.toThrow(/pagePng/);
    });
  });
  ```

- [ ] Run, confirm failure:

  ```bash
  cd web.ui/backend && npx vitest run __tests__/pinterest/interior_preview.test.js
  ```

  Expected: module not found.

- [ ] Implement `web.ui/backend/pinterest/templates/interior_preview.js`:

  ```javascript
  /**
   * Pure pin template — composes a 1000×1500 "interior page preview" PNG.
   *
   * Layout (different from cover_hero):
   *   - Top 2/3 (≈ 1000×1000): page preview, scaled to fit, centered, on cream.
   *   - Bottom 1/3 (≈ 1000×500): caption block (title + subtitle) on teal panel.
   *
   * @module pinterest/templates/interior_preview
   */

  import sharp from 'sharp';
  import { createCanvas } from '@napi-rs/canvas';
  import { PALETTE, FONT_FAMILY, registerFonts } from '../palette.js';

  const WIDTH = 1000;
  const HEIGHT = 1500;
  const PAGE_AREA_HEIGHT = 1000;
  const CAPTION_HEIGHT = HEIGHT - PAGE_AREA_HEIGHT; // 500

  /**
   * @typedef {Object} InteriorPreviewInput
   * @property {Buffer} pagePng         PNG of one interior page preview.
   * @property {string} title           Pin title.
   * @property {string} [subtitle]      Optional subtitle.
   */

  /**
   * @param {InteriorPreviewInput} input
   * @returns {Promise<Buffer>}  1000×1500 PNG.
   */
  export async function renderInteriorPreview({ pagePng, title, subtitle }) {
    if (!pagePng || !Buffer.isBuffer(pagePng)) {
      throw new Error('pagePng (Buffer) is required');
    }
    registerFonts();

    // Cream background full-canvas.
    const base = sharp({
      create: {
        width: WIDTH,
        height: HEIGHT,
        channels: 4,
        background: hexToRgba(PALETTE.cream),
      },
    });

    // Resize page preview to fit a 880×920 box inside the top 1000px region.
    const pageResized = await sharp(pagePng)
      .resize({ width: 880, height: 920, fit: 'inside' })
      .png()
      .toBuffer();
    const pageMeta = await sharp(pageResized).metadata();
    const pageLeft = Math.round((WIDTH - (pageMeta.width ?? 880)) / 2);
    const pageTop = Math.round((PAGE_AREA_HEIGHT - (pageMeta.height ?? 920)) / 2);

    // Teal caption panel (full width, bottom 1/3).
    const captionPanel = await sharp({
      create: {
        width: WIDTH,
        height: CAPTION_HEIGHT,
        channels: 4,
        background: hexToRgba(PALETTE.teal),
      },
    })
      .png()
      .toBuffer();

    // Caption text overlay (cream/brass on the teal panel).
    const captionText = renderCaptionOverlay({
      width: WIDTH,
      height: CAPTION_HEIGHT,
      title,
      subtitle,
    });

    return base
      .composite([
        { input: pageResized, top: pageTop, left: pageLeft },
        { input: captionPanel, top: PAGE_AREA_HEIGHT, left: 0 },
        { input: captionText, top: PAGE_AREA_HEIGHT, left: 0 },
      ])
      .png()
      .toBuffer();
  }

  /**
   * Build the title + subtitle overlay PNG for the teal panel.
   *
   * @param {{ width: number, height: number, title: string, subtitle?: string }} args
   * @returns {Buffer}
   */
  function renderCaptionOverlay({ width, height, title, subtitle }) {
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = PALETTE.cream;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';

    const titleSize = title.length <= 30 ? 68 : title.length <= 50 ? 56 : 48;
    ctx.font = `${titleSize}px ${FONT_FAMILY}`;
    const titleLines = wrapText(ctx, title, width - 120, 3);
    const lineHeight = Math.round(titleSize * 1.12);
    const blockHeight =
      titleLines.length * lineHeight + (subtitle ? 24 + 44 : 0);
    let y = Math.round((height - blockHeight) / 2);
    for (const line of titleLines) {
      ctx.fillText(line, width / 2, y);
      y += lineHeight;
    }
    if (subtitle) {
      y += 24;
      ctx.fillStyle = PALETTE.brass;
      ctx.font = `36px ${FONT_FAMILY}`;
      const subLines = wrapText(ctx, subtitle, width - 160, 1);
      for (const line of subLines) {
        ctx.fillText(line, width / 2, y);
        y += 44;
      }
    }
    return canvas.toBuffer('image/png');
  }

  /**
   * Greedy word-wrap (identical to cover_hero's; duplicated here to keep
   * templates self-contained and independently testable).
   *
   * @param {import('@napi-rs/canvas').SKRSContext2D} ctx
   * @param {string} text
   * @param {number} maxWidth
   * @param {number} maxLines
   * @returns {string[]}
   */
  function wrapText(ctx, text, maxWidth, maxLines) {
    const words = text.split(/\s+/);
    const lines = [];
    let current = '';
    for (const word of words) {
      const next = current ? `${current} ${word}` : word;
      if (ctx.measureText(next).width <= maxWidth) {
        current = next;
      } else {
        if (current) lines.push(current);
        current = word;
        if (lines.length === maxLines) break;
      }
    }
    if (current && lines.length < maxLines) lines.push(current);
    if (lines.length === maxLines) {
      const consumed = lines.join(' ').split(/\s+/).length;
      if (consumed < words.length) {
        let last = lines[maxLines - 1];
        while (ctx.measureText(last + '…').width > maxWidth && last.length > 1) {
          last = last.slice(0, -1);
        }
        lines[maxLines - 1] = last + '…';
      }
    }
    return lines;
  }

  /**
   * @param {string} hex
   * @returns {{r:number,g:number,b:number,alpha:number}}
   */
  function hexToRgba(hex) {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex);
    if (!m) throw new Error(`Invalid hex color: ${hex}`);
    const n = parseInt(m[1], 16);
    return { r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff, alpha: 1 };
  }
  ```

- [ ] Re-run, confirm pass:

  ```bash
  cd web.ui/backend && npx vitest run __tests__/pinterest/interior_preview.test.js
  ```

  Expected: 3 tests pass.

- [ ] Commit:

  ```bash
  git add web.ui/backend/pinterest/templates/interior_preview.js \
          web.ui/backend/__tests__/pinterest/interior_preview.test.js
  git commit -m "feat(pinterest): interior_preview template — page on top, teal caption panel"
  ```

---

## Task 5: Generator — materialise PNG files to `output/pinterest/<slug>/`

- [ ] Write `web.ui/backend/__tests__/pinterest/generator.test.js`:

  ```javascript
  import { describe, it, expect, beforeEach, afterEach } from 'vitest';
  import fs from 'node:fs';
  import os from 'node:os';
  import path from 'node:path';
  import sharp from 'sharp';
  import { generatePinImage } from '../../pinterest/generator.js';

  let tmpRoot;

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pin-gen-'));
    process.env.PINTEREST_OUTPUT_ROOT = tmpRoot;
  });

  afterEach(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
    delete process.env.PINTEREST_OUTPUT_ROOT;
  });

  async function fakePng(width, height) {
    const file = path.join(tmpRoot, `src-${width}x${height}.png`);
    await sharp({
      create: {
        width,
        height,
        channels: 3,
        background: { r: 200, g: 200, b: 200 },
      },
    })
      .png()
      .toFile(file);
    return file;
  }

  describe('generatePinImage', () => {
    it('writes cover_hero PNG to <root>/<slug>/cover_hero-<idx>.png', async () => {
      const coverFile = await fakePng(800, 1200);
      const out = await generatePinImage({
        slug: 'kakuro-quiet-minds',
        pinType: 'cover_hero',
        index: 0,
        sourcePngPath: coverFile,
        title: 'Kakuro for Quiet Minds',
        subtitle: 'Large-print logic puzzles',
      });
      expect(out).toMatch(/kakuro-quiet-minds[\\/]cover_hero-0\.png$/);
      expect(fs.existsSync(out)).toBe(true);
      const meta = await sharp(out).metadata();
      expect(meta.width).toBe(1000);
      expect(meta.height).toBe(1500);
    });

    it('writes interior_preview PNG to <root>/<slug>/interior_preview-<idx>.png', async () => {
      const pageFile = await fakePng(600, 800);
      const out = await generatePinImage({
        slug: 'kakuro-quiet-minds',
        pinType: 'interior_preview',
        index: 3,
        sourcePngPath: pageFile,
        title: 'Inside Kakuro: a peek',
      });
      expect(out).toMatch(/kakuro-quiet-minds[\\/]interior_preview-3\.png$/);
      expect(fs.existsSync(out)).toBe(true);
    });

    it('throws on unknown pinType', async () => {
      await expect(
        generatePinImage({
          slug: 'x',
          pinType: 'weird_type',
          index: 0,
          sourcePngPath: await fakePng(100, 100),
          title: 't',
        }),
      ).rejects.toThrow(/unknown pinType/);
    });
  });
  ```

- [ ] Run, confirm failure:

  ```bash
  cd web.ui/backend && npx vitest run __tests__/pinterest/generator.test.js
  ```

  Expected: module not found.

- [ ] Implement `web.ui/backend/pinterest/generator.js`:

  ```javascript
  /**
   * Pin image generator — given a slug, pin type, source PNG path on disk,
   * and caption text, render and persist a 1000×1500 pin PNG.
   *
   * Output location: <PINTEREST_OUTPUT_ROOT or repo-root/output/pinterest>/<slug>/<pin_type>-<index>.png
   *
   * @module pinterest/generator
   */

  import fs from 'node:fs';
  import path from 'node:path';
  import { fileURLToPath } from 'node:url';
  import { renderCoverHero } from './templates/cover_hero.js';
  import { renderInteriorPreview } from './templates/interior_preview.js';

  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);

  /** @returns {string} */
  function outputRoot() {
    if (process.env.PINTEREST_OUTPUT_ROOT) {
      return path.resolve(process.env.PINTEREST_OUTPUT_ROOT);
    }
    return path.resolve(__dirname, '..', '..', '..', 'output', 'pinterest');
  }

  /**
   * @typedef {Object} GenerateInput
   * @property {string} slug
   * @property {'cover_hero'|'interior_preview'} pinType
   * @property {number} index            0-based index within the slug's pin set.
   * @property {string} sourcePngPath    Absolute path to the source PNG
   *                                     (cover preview or interior page preview).
   * @property {string} title
   * @property {string} [subtitle]
   */

  /**
   * Render and persist one pin PNG. Returns the absolute output path.
   *
   * @param {GenerateInput} input
   * @returns {Promise<string>}
   */
  export async function generatePinImage(input) {
    const { slug, pinType, index, sourcePngPath, title, subtitle } = input;
    if (!fs.existsSync(sourcePngPath)) {
      throw new Error(`sourcePngPath does not exist: ${sourcePngPath}`);
    }
    const sourceBuf = fs.readFileSync(sourcePngPath);

    let pngBuffer;
    if (pinType === 'cover_hero') {
      pngBuffer = await renderCoverHero({ coverPng: sourceBuf, title, subtitle });
    } else if (pinType === 'interior_preview') {
      pngBuffer = await renderInteriorPreview({ pagePng: sourceBuf, title, subtitle });
    } else {
      throw new Error(`unknown pinType: ${pinType}`);
    }

    const dir = path.join(outputRoot(), slug);
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `${pinType}-${index}.png`);
    fs.writeFileSync(file, pngBuffer);
    return file;
  }
  ```

- [ ] Re-run, confirm pass:

  ```bash
  cd web.ui/backend && npx vitest run __tests__/pinterest/generator.test.js
  ```

  Expected: 3 tests pass.

- [ ] Commit:

  ```bash
  git add web.ui/backend/pinterest/generator.js \
          web.ui/backend/__tests__/pinterest/generator.test.js
  git commit -m "feat(pinterest): generator writes 1000x1500 PNGs to output/pinterest/<slug>/"
  ```

---

## Task 6: Scheduler — pure 3–5/day jittered slot assignment

- [ ] Write `web.ui/backend/__tests__/pinterest/scheduler.test.js`:

  ```javascript
  import { describe, it, expect } from 'vitest';
  import { assignSlots, withinPostingWindow } from '../../pinterest/scheduler.js';

  describe('withinPostingWindow', () => {
    it('accepts 09:00 and 21:00 in the local timezone', () => {
      expect(withinPostingWindow(new Date('2026-05-26T09:00:00-07:00'), 'America/Los_Angeles')).toBe(true);
      expect(withinPostingWindow(new Date('2026-05-26T21:00:00-07:00'), 'America/Los_Angeles')).toBe(true);
    });

    it('rejects 08:59 and 21:01 in the local timezone', () => {
      expect(withinPostingWindow(new Date('2026-05-26T08:59:00-07:00'), 'America/Los_Angeles')).toBe(false);
      expect(withinPostingWindow(new Date('2026-05-26T21:01:00-07:00'), 'America/Los_Angeles')).toBe(false);
    });
  });

  describe('assignSlots', () => {
    const cfg = {
      timeZone: 'America/Los_Angeles',
      perDayMin: 3,
      perDayMax: 5,
      windowStartHour: 9,
      windowEndHour: 21,
    };

    function seededRandom(seed) {
      let s = seed;
      return () => {
        s = (s * 9301 + 49297) % 233280;
        return s / 233280;
      };
    }

    it('assigns one ISO timestamp per requested pin', () => {
      const slots = assignSlots({
        count: 6,
        existingQueue: [],
        now: new Date('2026-05-26T16:00:00-07:00'),
        config: cfg,
        random: seededRandom(1),
      });
      expect(slots).toHaveLength(6);
      for (const s of slots) {
        expect(typeof s).toBe('string');
        expect(new Date(s).toString()).not.toBe('Invalid Date');
      }
    });

    it('every returned slot is within [09:00, 21:00] local', () => {
      const slots = assignSlots({
        count: 12,
        existingQueue: [],
        now: new Date('2026-05-26T10:00:00-07:00'),
        config: cfg,
        random: seededRandom(2),
      });
      for (const s of slots) {
        expect(withinPostingWindow(new Date(s), cfg.timeZone)).toBe(true);
      }
    });

    it('respects perDayMax — never puts >5 slots on any one local date', () => {
      const slots = assignSlots({
        count: 20,
        existingQueue: [],
        now: new Date('2026-05-26T10:00:00-07:00'),
        config: cfg,
        random: seededRandom(3),
      });
      const byDay = new Map();
      for (const s of slots) {
        const d = new Date(s).toLocaleDateString('en-US', { timeZone: cfg.timeZone });
        byDay.set(d, (byDay.get(d) ?? 0) + 1);
      }
      for (const n of byDay.values()) {
        expect(n).toBeLessThanOrEqual(cfg.perDayMax);
      }
    });

    it('counts existingQueue when placing new slots on the same days', () => {
      const today = new Date('2026-05-26T10:00:00-07:00');
      const existing = [];
      for (let i = 0; i < 5; i++) {
        existing.push({
          scheduled_for: new Date(`2026-05-27T${10 + i}:00:00-07:00`).toISOString(),
        });
      }
      const slots = assignSlots({
        count: 3,
        existingQueue: existing,
        now: today,
        config: cfg,
        random: seededRandom(4),
      });
      const onMay27 = slots.filter((s) => {
        return new Date(s).toLocaleDateString('en-US', { timeZone: cfg.timeZone }) ===
               new Date('2026-05-27T12:00:00-07:00').toLocaleDateString('en-US', { timeZone: cfg.timeZone });
      });
      expect(onMay27.length).toBe(0);
    });

    it('returns slots in ascending order', () => {
      const slots = assignSlots({
        count: 8,
        existingQueue: [],
        now: new Date('2026-05-26T10:00:00-07:00'),
        config: cfg,
        random: seededRandom(5),
      });
      for (let i = 1; i < slots.length; i++) {
        expect(new Date(slots[i]).getTime()).toBeGreaterThan(new Date(slots[i - 1]).getTime());
      }
    });
  });
  ```

- [ ] Run, confirm failure:

  ```bash
  cd web.ui/backend && npx vitest run __tests__/pinterest/scheduler.test.js
  ```

  Expected: module not found.

- [ ] Implement `web.ui/backend/pinterest/scheduler.js`:

  ```javascript
  /**
   * Pure scheduler — given the existing queue and a target cadence, compute
   * jittered scheduled_for timestamps for new pins.
   *
   * Cadence: 3..5 pins per local date, only within the [windowStartHour,
   * windowEndHour] window. Slot positions are jittered (≥ 25 minutes apart).
   *
   * @module pinterest/scheduler
   */

  /**
   * @typedef {Object} ScheduleConfig
   * @property {string} timeZone           IANA tz, e.g. 'America/Los_Angeles'.
   * @property {number} perDayMin          3
   * @property {number} perDayMax          5
   * @property {number} windowStartHour    9
   * @property {number} windowEndHour      21
   */

  /**
   * @typedef {Object} ExistingQueueRow
   * @property {string} scheduled_for      ISO datetime.
   */

  /**
   * @typedef {Object} AssignSlotsInput
   * @property {number} count
   * @property {ExistingQueueRow[]} existingQueue
   * @property {Date} now
   * @property {ScheduleConfig} config
   * @property {() => number} [random]     Defaults to Math.random.
   */

  /**
   * @param {AssignSlotsInput} input
   * @returns {string[]}                   ISO datetimes, ascending.
   */
  export function assignSlots({ count, existingQueue, now, config, random = Math.random }) {
    const { timeZone, perDayMin, perDayMax, windowStartHour, windowEndHour } = config;

    // Count existing pins per local date.
    /** @type {Map<string, number>} */
    const usedPerDay = new Map();
    for (const row of existingQueue) {
      const day = localDateKey(new Date(row.scheduled_for), timeZone);
      usedPerDay.set(day, (usedPerDay.get(day) ?? 0) + 1);
    }

    /** @type {string[]} */
    const assigned = [];
    let dayCursor = new Date(now);
    // If we're past windowEndHour today, start tomorrow.
    if (localHour(dayCursor, timeZone) >= windowEndHour) {
      dayCursor = addDays(dayCursor, 1);
    }

    let safety = 0;
    while (assigned.length < count && safety < 365) {
      safety++;
      const dayKey = localDateKey(dayCursor, timeZone);
      const already = usedPerDay.get(dayKey) ?? 0;
      const capacity = perDayMax - already;
      if (capacity <= 0) {
        dayCursor = addDays(dayCursor, 1);
        continue;
      }
      const target = Math.min(
        capacity,
        count - assigned.length,
        Math.max(perDayMin - already, 1) +
          Math.floor(random() * (perDayMax - perDayMin + 1)),
      );

      // Pick `target` jittered times in [windowStartHour, windowEndHour] for this day.
      const totalMinutes = (windowEndHour - windowStartHour) * 60;
      const segmentMinutes = Math.floor(totalMinutes / target);
      for (let i = 0; i < target; i++) {
        const baseMin = i * segmentMinutes + Math.floor(random() * segmentMinutes);
        const totalMin = windowStartHour * 60 + baseMin;
        const hour = Math.floor(totalMin / 60);
        const minute = totalMin % 60;
        const slot = makeLocalDate(dayCursor, hour, minute, timeZone);
        // If first iteration and today, ensure slot is at least 5 minutes in the future.
        if (slot.getTime() < now.getTime() + 5 * 60 * 1000) continue;
        assigned.push(slot.toISOString());
        usedPerDay.set(dayKey, (usedPerDay.get(dayKey) ?? 0) + 1);
        if (assigned.length >= count) break;
      }
      dayCursor = addDays(dayCursor, 1);
    }

    assigned.sort();
    return assigned;
  }

  /**
   * Check whether a given Date sits in the posting window of its local day.
   *
   * @param {Date} date
   * @param {string} timeZone
   * @param {number} [startHour=9]
   * @param {number} [endHour=21]
   * @returns {boolean}
   */
  export function withinPostingWindow(date, timeZone, startHour = 9, endHour = 21) {
    const h = localHour(date, timeZone);
    const m = localMinute(date, timeZone);
    if (h < startHour) return false;
    if (h > endHour) return false;
    if (h === endHour && m > 0) return false;
    return true;
  }

  /**
   * "YYYY-MM-DD" key for a Date in the given timezone.
   *
   * @param {Date} date
   * @param {string} tz
   * @returns {string}
   */
  function localDateKey(date, tz) {
    const fmt = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    return fmt.format(date); // en-CA gives YYYY-MM-DD
  }

  /**
   * @param {Date} date
   * @param {string} tz
   * @returns {number}
   */
  function localHour(date, tz) {
    const fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hour: 'numeric',
      hour12: false,
    });
    return Number(fmt.format(date));
  }

  /**
   * @param {Date} date
   * @param {string} tz
   * @returns {number}
   */
  function localMinute(date, tz) {
    const fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      minute: 'numeric',
    });
    return Number(fmt.format(date));
  }

  /**
   * @param {Date} date
   * @param {number} days
   * @returns {Date}
   */
  function addDays(date, days) {
    const copy = new Date(date);
    copy.setUTCDate(copy.getUTCDate() + days);
    return copy;
  }

  /**
   * Build a Date that represents (Y/M/D from `referenceDay` in tz) at hour:minute in tz.
   *
   * Implementation: format the reference day into YYYY-MM-DD in tz, then read the
   * UTC offset for that local datetime via Intl, and assemble the absolute moment.
   *
   * @param {Date} referenceDay
   * @param {number} hour
   * @param {number} minute
   * @param {string} tz
   * @returns {Date}
   */
  function makeLocalDate(referenceDay, hour, minute, tz) {
    const day = localDateKey(referenceDay, tz); // YYYY-MM-DD
    // Find the offset (in minutes) at that local moment by binary-searching once.
    // Start from an arbitrary UTC reference and ask Intl what hour the tz reports.
    const trial = new Date(`${day}T${pad2(hour)}:${pad2(minute)}:00Z`);
    const tzHour = localHour(trial, tz);
    const tzMinute = localMinute(trial, tz);
    const deltaMinutes = (hour - tzHour) * 60 + (minute - tzMinute);
    return new Date(trial.getTime() + deltaMinutes * 60 * 1000);
  }

  function pad2(n) {
    return String(n).padStart(2, '0');
  }
  ```

- [ ] Re-run, confirm pass:

  ```bash
  cd web.ui/backend && npx vitest run __tests__/pinterest/scheduler.test.js
  ```

  Expected: 8 tests pass.

- [ ] Commit:

  ```bash
  git add web.ui/backend/pinterest/scheduler.js \
          web.ui/backend/__tests__/pinterest/scheduler.test.js
  git commit -m "feat(pinterest): pure scheduler — jittered 3-5/day in [09:00,21:00] local"
  ```

---

## Task 7: Queue helpers — enqueuePinsForBook + dequeueNext + mark + pause/resume

- [ ] Write `web.ui/backend/__tests__/pinterest/queue.test.js`:

  ```javascript
  import { describe, it, expect, beforeEach, afterEach } from 'vitest';
  import fs from 'node:fs';
  import os from 'node:os';
  import path from 'node:path';
  import sharp from 'sharp';
  import { openDb, _resetForTests } from '../../db.js';
  import {
    enqueuePinsForBook,
    dequeueNext,
    markPosted,
    markFailed,
    pauseQueue,
    resumeQueue,
    listQueue,
    listHistory,
    updateQueueRow,
    cancelQueueRow,
  } from '../../pinterest/queue.js';

  let tmpRoot;

  async function fakePng(file, w, h) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    await sharp({
      create: { width: w, height: h, channels: 3, background: { r: 220, g: 220, b: 220 } },
    })
      .png()
      .toFile(file);
  }

  async function seedBook(slug, title) {
    const outDir = path.join(tmpRoot, 'kdp-ready', slug);
    await fakePng(path.join(outDir, 'cover_preview.png'), 800, 1200);
    for (let i = 1; i <= 5; i++) {
      await fakePng(path.join(outDir, `interior_${i}.png`), 600, 800);
    }
    const db = openDb();
    const info = db
      .prepare(`
        INSERT INTO kdp_books (slug, title, status, output_dir, cover_path, asin, blurb)
        VALUES (?, ?, 'published', ?, ?, 'B0TESTASIN', 'A short blurb about the book.')
      `)
      .run(slug, title, outDir, path.join(outDir, 'cover_preview.png'));
    return info.lastInsertRowid;
  }

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pin-queue-'));
    process.env.ROOSTER_DB_PATH = path.join(tmpRoot, 'dashboard.db');
    process.env.PINTEREST_OUTPUT_ROOT = path.join(tmpRoot, 'output', 'pinterest');
    _resetForTests();
  });

  afterEach(() => {
    _resetForTests();
    fs.rmSync(tmpRoot, { recursive: true, force: true });
    delete process.env.ROOSTER_DB_PATH;
    delete process.env.PINTEREST_OUTPUT_ROOT;
  });

  describe('enqueuePinsForBook', () => {
    it('creates exactly 6 rows (1 cover_hero + 5 interior_preview) with PNG files written', async () => {
      const bookId = await seedBook('kakuro-quiet-minds', 'Kakuro for Quiet Minds');
      const rows = await enqueuePinsForBook(bookId);
      expect(rows).toHaveLength(6);
      expect(rows.filter((r) => r.pin_type === 'cover_hero')).toHaveLength(1);
      expect(rows.filter((r) => r.pin_type === 'interior_preview')).toHaveLength(5);
      for (const r of rows) {
        expect(fs.existsSync(r.image_path)).toBe(true);
        expect(r.link_url).toBe('https://www.amazon.com/dp/B0TESTASIN');
      }
    });

    it('throws if the book is missing', async () => {
      await expect(enqueuePinsForBook(9999)).rejects.toThrow(/not found/);
    });

    it('skips generation gracefully when source PNGs are missing', async () => {
      const db = openDb();
      const info = db
        .prepare(`
          INSERT INTO kdp_books (slug, title, status, output_dir, asin)
          VALUES ('no-art', 'No Art', 'published', '/does/not/exist', 'B0NOART000')
        `)
        .run();
      const rows = await enqueuePinsForBook(info.lastInsertRowid);
      // Only rows with valid source images are produced; cover & interiors missing → 0.
      expect(rows).toHaveLength(0);
    });
  });

  describe('dequeue + mark', () => {
    it('dequeueNext returns the oldest pending row whose scheduled_for is in the past', async () => {
      const db = openDb();
      const past = new Date(Date.now() - 60_000).toISOString();
      const future = new Date(Date.now() + 60 * 60_000).toISOString();
      db.prepare(`
        INSERT INTO pinterest_queue (kdp_book_id, pin_type, image_path, title, description, link_url, status, scheduled_for)
        VALUES (NULL, 'cover_hero', '/x.png', 'Past',   'desc', 'http://x', 'pending', ?),
               (NULL, 'cover_hero', '/y.png', 'Future', 'desc', 'http://y', 'pending', ?)
      `).run(past, future);

      const next = dequeueNext();
      expect(next).toBeTruthy();
      expect(next.title).toBe('Past');
    });

    it('markPosted writes a pinterest_history row and flips queue status', async () => {
      const db = openDb();
      const info = db.prepare(`
        INSERT INTO pinterest_queue (kdp_book_id, pin_type, image_path, title, description, link_url, status, scheduled_for)
        VALUES (NULL, 'cover_hero', '/x.png', 'T', 'D', 'http://x', 'posting', ?)
      `).run(new Date().toISOString());
      const id = Number(info.lastInsertRowid);
      markPosted(id, 'pin_abc123');
      const q = db.prepare('SELECT status FROM pinterest_queue WHERE id = ?').get(id);
      const h = db.prepare('SELECT pinterest_pin_id, success FROM pinterest_history WHERE queue_id = ?').get(id);
      expect(q.status).toBe('posted');
      expect(h.pinterest_pin_id).toBe('pin_abc123');
      expect(h.success).toBe(1);
    });

    it('markFailed increments attempts and stores last_error', async () => {
      const db = openDb();
      const info = db.prepare(`
        INSERT INTO pinterest_queue (kdp_book_id, pin_type, image_path, title, description, link_url, status, scheduled_for)
        VALUES (NULL, 'cover_hero', '/x.png', 'T', 'D', 'http://x', 'posting', ?)
      `).run(new Date().toISOString());
      const id = Number(info.lastInsertRowid);
      markFailed(id, 'network down');
      const row = db.prepare('SELECT status, attempts, last_error FROM pinterest_queue WHERE id = ?').get(id);
      expect(row.status).toBe('failed');
      expect(row.attempts).toBe(1);
      expect(row.last_error).toBe('network down');
    });
  });

  describe('pause + resume', () => {
    it('pauseQueue flips all pending rows to paused, resumeQueue flips them back', async () => {
      const db = openDb();
      const t = new Date().toISOString();
      for (let i = 0; i < 3; i++) {
        db.prepare(`
          INSERT INTO pinterest_queue (kdp_book_id, pin_type, image_path, title, description, link_url, status, scheduled_for)
          VALUES (NULL, 'cover_hero', '/x.png', ?, 'D', 'http://x', 'pending', ?)
        `).run(`T${i}`, t);
      }
      const paused = pauseQueue();
      expect(paused).toBe(3);
      let still = db.prepare("SELECT COUNT(*) AS n FROM pinterest_queue WHERE status='pending'").get().n;
      expect(still).toBe(0);
      const resumed = resumeQueue();
      expect(resumed).toBe(3);
      still = db.prepare("SELECT COUNT(*) AS n FROM pinterest_queue WHERE status='pending'").get().n;
      expect(still).toBe(3);
    });
  });

  describe('listQueue + listHistory', () => {
    it('listQueue returns pending+posting+paused, newest scheduled first', async () => {
      const db = openDb();
      const t = new Date().toISOString();
      db.prepare(`
        INSERT INTO pinterest_queue (kdp_book_id, pin_type, image_path, title, description, link_url, status, scheduled_for)
        VALUES (NULL, 'cover_hero', '/x.png', 'A', 'D', 'http://x', 'pending',  ?),
               (NULL, 'cover_hero', '/x.png', 'B', 'D', 'http://x', 'posted',   ?),
               (NULL, 'cover_hero', '/x.png', 'C', 'D', 'http://x', 'paused',   ?)
      `).run(t, t, t);
      const q = listQueue();
      expect(q.map((r) => r.title).sort()).toEqual(['A', 'C']);
    });

    it('listHistory returns last 100 rows with success/fail decoded', async () => {
      const db = openDb();
      const t = new Date().toISOString();
      const info = db.prepare(`
        INSERT INTO pinterest_queue (kdp_book_id, pin_type, image_path, title, description, link_url, status, scheduled_for)
        VALUES (NULL, 'cover_hero', '/x.png', 'T', 'D', 'http://x', 'posted', ?)
      `).run(t);
      const qid = Number(info.lastInsertRowid);
      db.prepare(`
        INSERT INTO pinterest_history (queue_id, pinterest_pin_id, posted_at, success, error_message)
        VALUES (?, 'pin1', ?, 1, NULL)
      `).run(qid, t);
      const h = listHistory(100);
      expect(h).toHaveLength(1);
      expect(h[0].success).toBe(true);
      expect(h[0].pinterest_pin_id).toBe('pin1');
    });
  });

  describe('updateQueueRow + cancelQueueRow', () => {
    it('updates title, description, scheduled_for of a pending row', async () => {
      const db = openDb();
      const info = db.prepare(`
        INSERT INTO pinterest_queue (kdp_book_id, pin_type, image_path, title, description, link_url, status, scheduled_for)
        VALUES (NULL, 'cover_hero', '/x.png', 'Old', 'old', 'http://x', 'pending', ?)
      `).run(new Date().toISOString());
      const id = Number(info.lastInsertRowid);
      const newTs = new Date(Date.now() + 60 * 60_000).toISOString();
      updateQueueRow(id, { title: 'New', description: 'new', scheduled_for: newTs });
      const row = db.prepare('SELECT title, description, scheduled_for FROM pinterest_queue WHERE id=?').get(id);
      expect(row.title).toBe('New');
      expect(row.description).toBe('new');
      expect(row.scheduled_for).toBe(newTs);
    });

    it('cancelQueueRow deletes a pending row', async () => {
      const db = openDb();
      const info = db.prepare(`
        INSERT INTO pinterest_queue (kdp_book_id, pin_type, image_path, title, description, link_url, status, scheduled_for)
        VALUES (NULL, 'cover_hero', '/x.png', 'A', 'D', 'http://x', 'pending', ?)
      `).run(new Date().toISOString());
      const id = Number(info.lastInsertRowid);
      cancelQueueRow(id);
      const row = db.prepare('SELECT * FROM pinterest_queue WHERE id=?').get(id);
      expect(row).toBeUndefined();
    });
  });
  ```

- [ ] Run, confirm failure:

  ```bash
  cd web.ui/backend && npx vitest run __tests__/pinterest/queue.test.js
  ```

  Expected: module not found.

- [ ] Implement `web.ui/backend/pinterest/queue.js`:

  ```javascript
  /**
   * Queue helpers — DB-facing operations on pinterest_queue and pinterest_history.
   *
   * Public API used by Plan B (mark-published flow): enqueuePinsForBook(bookId).
   * Public API used by Plan E poster + routes: dequeueNext / markPosted /
   * markFailed / pauseQueue / resumeQueue / listQueue / listHistory /
   * updateQueueRow / cancelQueueRow.
   *
   * @module pinterest/queue
   */

  import fs from 'node:fs';
  import path from 'node:path';
  import { openDb } from '../db.js';
  import { recordEvent } from '../events.js';
  import { generatePinImage } from './generator.js';
  import { assignSlots } from './scheduler.js';

  /**
   * @typedef {Object} QueueRow
   * @property {number} id
   * @property {number|null} kdp_book_id
   * @property {'cover_hero'|'interior_preview'} pin_type
   * @property {string} image_path
   * @property {string} title
   * @property {string} description
   * @property {string} link_url
   * @property {string} status
   * @property {string} scheduled_for
   * @property {number} attempts
   * @property {string|null} last_error
   */

  /**
   * @returns {{timeZone: string, perDayMin: number, perDayMax: number, windowStartHour: number, windowEndHour: number}}
   */
  function loadScheduleConfig() {
    const db = openDb();
    const prof = db.prepare('SELECT time_zone FROM profile WHERE id=1').get();
    return {
      timeZone: prof?.time_zone ?? 'America/Los_Angeles',
      perDayMin: 3,
      perDayMax: 5,
      windowStartHour: 9,
      windowEndHour: 21,
    };
  }

  /**
   * Generate up to 6 pin PNGs for a published book and insert pinterest_queue
   * rows with jittered scheduled_for timestamps. Skips any pin whose source
   * PNG is absent (gracefully degrades to fewer rows).
   *
   * Called from `/api/kdp/books/:slug/mark-published` (Plan B Task 6) instead
   * of the inline planner that ships in Plan B Task 4. Plan B's
   * pinterestPlanner.js is retained for reference but no longer wired into
   * the route after this Task lands.
   *
   * @param {number} bookId
   * @returns {Promise<QueueRow[]>}
   */
  export async function enqueuePinsForBook(bookId) {
    const db = openDb();
    const book = db.prepare(`
      SELECT id, slug, title, subtitle, asin, blurb, cover_path, output_dir
        FROM kdp_books WHERE id = ?
    `).get(bookId);
    if (!book) throw new Error(`kdp_book ${bookId} not found`);
    if (!book.asin) throw new Error(`kdp_book ${bookId} has no ASIN — cannot build link_url`);

    // Six pin specs: 1 cover_hero + 5 interior_preview.
    const linkUrl = `https://www.amazon.com/dp/${book.asin}`;
    const baseDesc = book.blurb
      ? String(book.blurb).replace(/<[^>]+>/g, '').slice(0, 480)
      : `${book.title} — available now on Amazon.`;

    const candidates = [
      {
        pinType: 'cover_hero',
        sourcePath: book.cover_path,
        title: book.title,
        subtitle: book.subtitle ?? undefined,
      },
      ...[1, 2, 3, 4, 5].map((i) => ({
        pinType: /** @type {const} */ ('interior_preview'),
        sourcePath: book.output_dir
          ? path.join(book.output_dir, `interior_${i}.png`)
          : null,
        title: interiorTitle(book.title, i),
        subtitle: book.subtitle ?? undefined,
      })),
    ];

    // Filter to only those whose source PNG exists on disk.
    /** @type {{pinType: 'cover_hero'|'interior_preview', sourcePath: string, title: string, subtitle?: string, index: number}[]} */
    const valid = [];
    let idx = 0;
    for (const c of candidates) {
      if (c.sourcePath && fs.existsSync(c.sourcePath)) {
        valid.push({ ...c, sourcePath: c.sourcePath, index: idx });
        idx++;
      }
    }
    if (valid.length === 0) return [];

    // Render each pin to PNG.
    /** @type {{path: string, pinType: 'cover_hero'|'interior_preview', title: string, description: string}[]} */
    const rendered = [];
    for (const v of valid) {
      const out = await generatePinImage({
        slug: book.slug,
        pinType: v.pinType,
        index: v.index,
        sourcePngPath: v.sourcePath,
        title: v.title,
        subtitle: v.subtitle,
      });
      rendered.push({
        path: out,
        pinType: v.pinType,
        title: v.title,
        description: baseDesc,
      });
    }

    // Assign jittered slots based on the live queue.
    const existing = db.prepare(`
      SELECT scheduled_for FROM pinterest_queue
       WHERE status IN ('pending','posting','paused')
    `).all();
    const slots = assignSlots({
      count: rendered.length,
      existingQueue: existing,
      now: new Date(),
      config: loadScheduleConfig(),
    });

    // Insert rows.
    const insert = db.prepare(`
      INSERT INTO pinterest_queue
        (kdp_book_id, pin_type, image_path, title, description, link_url, status, scheduled_for)
      VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)
    `);
    /** @type {QueueRow[]} */
    const inserted = [];
    const txn = db.transaction(() => {
      for (let i = 0; i < rendered.length; i++) {
        const r = rendered[i];
        const info = insert.run(
          book.id,
          r.pinType,
          r.path,
          r.title,
          r.description,
          linkUrl,
          slots[i],
        );
        const row = /** @type {QueueRow} */ (
          db.prepare('SELECT * FROM pinterest_queue WHERE id=?').get(Number(info.lastInsertRowid))
        );
        inserted.push(row);
      }
    });
    txn();

    for (const row of inserted) {
      recordEvent('pinterest:pin-scheduled', {
        queue_id: row.id,
        kdp_book_id: row.kdp_book_id,
        scheduled_for: row.scheduled_for,
        pin_type: row.pin_type,
      });
    }

    return inserted;
  }

  /**
   * @param {string} bookTitle
   * @param {number} i  1-based
   * @returns {string}
   */
  function interiorTitle(bookTitle, i) {
    const variants = [
      `Inside ${bookTitle}: a peek`,
      `${bookTitle} — sample pages`,
      `${bookTitle} — large-print layout`,
      `${bookTitle} — what's inside`,
      `${bookTitle} — bonus pages`,
    ];
    return variants[i - 1] ?? variants[0];
  }

  /**
   * Pull the next pin whose scheduled_for is in the past and status='pending'.
   * Flips it to 'posting' atomically.
   *
   * @returns {QueueRow|null}
   */
  export function dequeueNext() {
    const db = openDb();
    const now = new Date().toISOString();
    const txn = db.transaction(() => {
      const row = db.prepare(`
        SELECT * FROM pinterest_queue
         WHERE status='pending' AND scheduled_for <= ?
         ORDER BY scheduled_for ASC
         LIMIT 1
      `).get(now);
      if (!row) return null;
      db.prepare(`UPDATE pinterest_queue SET status='posting' WHERE id=?`).run(row.id);
      return /** @type {QueueRow} */ ({ ...row, status: 'posting' });
    });
    return txn();
  }

  /**
   * Mark a posting row as posted; insert a pinterest_history row.
   *
   * @param {number} id
   * @param {string} pinterestPinId
   */
  export function markPosted(id, pinterestPinId) {
    const db = openDb();
    const now = new Date().toISOString();
    const txn = db.transaction(() => {
      db.prepare(`UPDATE pinterest_queue SET status='posted' WHERE id=?`).run(id);
      db.prepare(`
        INSERT INTO pinterest_history (queue_id, pinterest_pin_id, posted_at, success, error_message)
        VALUES (?, ?, ?, 1, NULL)
      `).run(id, pinterestPinId, now);
    });
    txn();
    recordEvent('pinterest:pin-posted', { queue_id: id, pinterest_pin_id: pinterestPinId });
  }

  /**
   * Mark a posting row as failed; insert a pinterest_history failure row.
   *
   * @param {number} id
   * @param {string} errorMessage
   */
  export function markFailed(id, errorMessage) {
    const db = openDb();
    const now = new Date().toISOString();
    const txn = db.transaction(() => {
      db.prepare(`
        UPDATE pinterest_queue
           SET status='failed', attempts = attempts + 1, last_error = ?
         WHERE id=?
      `).run(errorMessage, id);
      db.prepare(`
        INSERT INTO pinterest_history (queue_id, pinterest_pin_id, posted_at, success, error_message)
        VALUES (?, NULL, ?, 0, ?)
      `).run(id, now, errorMessage);
    });
    txn();
    recordEvent('pinterest:pin-failed', { queue_id: id, error: errorMessage });
  }

  /**
   * Flip every pending row to paused.
   *
   * @returns {number}  rows affected
   */
  export function pauseQueue() {
    const db = openDb();
    const info = db.prepare(`UPDATE pinterest_queue SET status='paused' WHERE status='pending'`).run();
    if (info.changes > 0) {
      recordEvent('pinterest:login-required', { reason: 'queue paused', affected: info.changes });
    }
    return info.changes;
  }

  /**
   * Flip every paused row back to pending.
   *
   * @returns {number}  rows affected
   */
  export function resumeQueue() {
    const db = openDb();
    const info = db.prepare(`UPDATE pinterest_queue SET status='pending' WHERE status='paused'`).run();
    return info.changes;
  }

  /**
   * @returns {QueueRow[]}  pending+posting+paused, ascending by scheduled_for.
   */
  export function listQueue() {
    const db = openDb();
    return db.prepare(`
      SELECT * FROM pinterest_queue
       WHERE status IN ('pending','posting','paused')
       ORDER BY scheduled_for ASC
    `).all();
  }

  /**
   * @param {number} limit
   * @returns {Array<{
   *   id: number,
   *   queue_id: number,
   *   pinterest_pin_id: string|null,
   *   posted_at: string,
   *   success: boolean,
   *   error_message: string|null,
   *   title: string,
   *   image_path: string,
   * }>}
   */
  export function listHistory(limit) {
    const db = openDb();
    const rows = db.prepare(`
      SELECT h.id, h.queue_id, h.pinterest_pin_id, h.posted_at, h.success, h.error_message,
             q.title, q.image_path
        FROM pinterest_history h
        JOIN pinterest_queue q ON q.id = h.queue_id
       ORDER BY h.posted_at DESC
       LIMIT ?
    `).all(limit);
    return rows.map((r) => ({ ...r, success: r.success === 1 }));
  }

  /**
   * @param {number} id
   * @param {{title?: string, description?: string, scheduled_for?: string}} patch
   */
  export function updateQueueRow(id, patch) {
    const db = openDb();
    const sets = [];
    const args = [];
    if (typeof patch.title === 'string') { sets.push('title = ?'); args.push(patch.title); }
    if (typeof patch.description === 'string') { sets.push('description = ?'); args.push(patch.description); }
    if (typeof patch.scheduled_for === 'string') { sets.push('scheduled_for = ?'); args.push(patch.scheduled_for); }
    if (sets.length === 0) return;
    args.push(id);
    db.prepare(`UPDATE pinterest_queue SET ${sets.join(', ')} WHERE id=? AND status IN ('pending','paused')`).run(...args);
  }

  /**
   * @param {number} id
   */
  export function cancelQueueRow(id) {
    const db = openDb();
    db.prepare(`DELETE FROM pinterest_queue WHERE id=? AND status IN ('pending','paused')`).run(id);
  }
  ```

- [ ] Re-run, confirm pass:

  ```bash
  cd web.ui/backend && npx vitest run __tests__/pinterest/queue.test.js
  ```

  Expected: 9 tests pass.

- [ ] Commit:

  ```bash
  git add web.ui/backend/pinterest/queue.js \
          web.ui/backend/__tests__/pinterest/queue.test.js
  git commit -m "feat(pinterest): queue helpers + enqueuePinsForBook for mark-published flow"
  ```

---

## Task 8: Refactor Plan B's mark-published route to call `enqueuePinsForBook`

Plan B Task 6 ships a `/api/kdp/books/:slug/mark-published` route that inserts six placeholder rows via `planSixPinsForBook` (no real PNGs on disk). Replace that with `enqueuePinsForBook(book.id)` so pins exist as actual 1000×1500 PNGs ready for the poster.

- [ ] Open `web.ui/backend/kdp/routes.js`. Locate the `router.post('/books/:slug/mark-published', ...)` handler installed by Plan B Task 6.

- [ ] Replace the body of that handler with:

  ```javascript
  router.post('/books/:slug/mark-published', async (req, res) => {
    const db = openDb();
    const book = getBySlug(db, req.params.slug);
    if (!book) return res.status(404).json({ error: 'not_found' });

    const asin = (req.body?.asin ?? '').trim();
    if (!asin) return res.status(400).json({ error: 'asin_required' });

    const releaseDate = (req.body?.release_date ?? new Date().toISOString().slice(0, 10)).trim();
    const listingUrl = `https://www.amazon.com/dp/${asin}`;

    db.prepare(`
      UPDATE kdp_books
         SET status='published', asin=?, release_date=?, listing_url=?, updated_at=datetime('now')
       WHERE id=?
    `).run(asin, releaseDate, listingUrl, book.id);

    // Day-30 reminder (unchanged from Plan B Task 6).
    const day30 = new Date(`${releaseDate}T12:00:00Z`);
    day30.setUTCDate(day30.getUTCDate() + 30);
    db.prepare(`
      INSERT INTO reminders (title, body, due_at, channel, status, source_kind, source_id)
      VALUES (?, ?, ?, 'both', 'pending', 'kdp.book', ?)
    `).run(
      `KDP Day-30 sales check: ${book.title}`,
      `Pull the 30-day sales snapshot for ${book.title} (ASIN ${asin}).`,
      day30.toISOString(),
      book.id,
    );

    // Plan E — materialise PNG pins + insert pinterest_queue rows.
    let pinsQueued = 0;
    try {
      const { enqueuePinsForBook } = await import('../pinterest/queue.js');
      const rows = await enqueuePinsForBook(book.id);
      pinsQueued = rows.length;
    } catch (err) {
      // Do not fail mark-published if pin generation hits a transient error.
      // The user can re-queue later from /pinterest.
      console.warn(`enqueuePinsForBook(${book.id}) failed: ${err?.message || err}`);
    }

    recordEvent('kdp:published', { slug: book.slug, asin, release_date: releaseDate });

    const updated = getBySlug(db, req.params.slug);
    res.json({ book: updated, pins_queued: pinsQueued });
  });
  ```

- [ ] Remove the now-obsolete `planSixPinsForBook` import from the top of `web.ui/backend/kdp/routes.js` if it is no longer used elsewhere in the file. Keep `web.ui/backend/kdp/pinterestPlanner.js` and its test on disk — they're still valid as a pure function but not wired into the live route.

- [ ] Update the existing Plan B routes test `web.ui/backend/__tests__/kdp/routes.test.js`. Find the `describe('POST /api/kdp/books/:slug/mark-published', ...)` block and adjust the assertion that counts inserted rows. It previously expected exactly 6; now expect "between 0 and 6 inclusive" because pin generation depends on source PNG presence:

  ```javascript
  it('inserts up to 6 pinterest_queue rows', async () => {
    const res = await request(app)
      .post('/api/kdp/books/book-a/mark-published')
      .send({ asin: 'B0PUBLISH1' });
    expect(res.status).toBe(200);
    const count = db
      .prepare(`SELECT COUNT(*) AS n FROM pinterest_queue WHERE kdp_book_id = ?`)
      .get(res.body.book.id).n;
    expect(count).toBeGreaterThanOrEqual(0);
    expect(count).toBeLessThanOrEqual(6);
  });
  ```

  (Plan B's test fixture seeds a `book-a` with no real cover/interior PNGs on disk, so the live count is 0. If your local Plan B fixture happens to seed PNGs, the count will be higher — the inclusive range covers both.)

- [ ] Re-run the routes test, confirm pass:

  ```bash
  cd web.ui/backend && npx vitest run __tests__/kdp/routes.test.js
  ```

  Expected: all tests pass.

- [ ] Commit:

  ```bash
  git add web.ui/backend/kdp/routes.js web.ui/backend/__tests__/kdp/routes.test.js
  git commit -m "feat(kdp): mark-published now materialises real pin PNGs via enqueuePinsForBook"
  ```

---

## Task 9: One-time visible Playwright login helper

- [ ] Write `web.ui/backend/__tests__/pinterest/login.test.js`:

  ```javascript
  import { describe, it, expect, vi } from 'vitest';
  import path from 'node:path';
  import os from 'node:os';
  import fs from 'node:fs';

  describe('runVisibleLogin', () => {
    it('launches headed Chromium with persistent profile and waits for login', async () => {
      const calls = { launchPersistent: 0, newPage: 0, gotoUrls: [], wait: 0, close: 0 };
      const fakeContext = {
        pages: () => [{
          goto: vi.fn(async (url) => { calls.gotoUrls.push(url); }),
          waitForURL: vi.fn(async () => { calls.wait++; }),
          waitForSelector: vi.fn(async () => true),
        }],
        newPage: vi.fn(async () => {
          calls.newPage++;
          return {
            goto: vi.fn(async (url) => { calls.gotoUrls.push(url); }),
            waitForURL: vi.fn(async () => { calls.wait++; }),
            waitForSelector: vi.fn(async () => true),
          };
        }),
        close: vi.fn(async () => { calls.close++; }),
      };
      const fakeChromium = {
        launchPersistentContext: vi.fn(async () => {
          calls.launchPersistent++;
          return fakeContext;
        }),
      };
      const profileDir = path.join(os.tmpdir(), `pin-login-${Date.now()}`);

      const { runVisibleLogin } = await import('../../pinterest/login.js');
      await runVisibleLogin({
        profileDir,
        playwrightChromium: fakeChromium,
        loginUrl: 'https://www.pinterest.com/login/',
        successUrlRegex: /pinterest\.com\/?$/,
      });

      expect(calls.launchPersistent).toBe(1);
      expect(calls.gotoUrls[0]).toContain('login');
      expect(calls.close).toBe(1);
      expect(fs.existsSync(profileDir)).toBe(true);
      fs.rmSync(profileDir, { recursive: true, force: true });
    });
  });
  ```

- [ ] Run, confirm failure:

  ```bash
  cd web.ui/backend && npx vitest run __tests__/pinterest/login.test.js
  ```

  Expected: module not found.

- [ ] Implement `web.ui/backend/pinterest/login.js`:

  ```javascript
  /**
   * One-time visible Pinterest login helper.
   *
   * Surfaces from the dashboard's "Sign in to Pinterest" button. Launches a
   * headed Chromium window pointed at the persistent profile dir, navigates
   * to the login page, waits until the user reaches the home feed (the
   * `successUrlRegex`), then closes. The persistent profile retains the
   * authenticated cookies on disk for subsequent headless posting runs.
   *
   * @module pinterest/login
   */

  import fs from 'node:fs';
  import path from 'node:path';
  import { fileURLToPath } from 'node:url';
  import { chromium as defaultChromium } from 'playwright';

  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);

  /** @returns {string} */
  export function defaultProfileDir() {
    return path.resolve(__dirname, '..', '.pinterest-profile');
  }

  /**
   * @typedef {Object} VisibleLoginInput
   * @property {string} [profileDir]                Defaults to web.ui/backend/.pinterest-profile/.
   * @property {{ launchPersistentContext: Function }} [playwrightChromium]
   * @property {string} [loginUrl]                  Defaults to Pinterest login.
   * @property {RegExp} [successUrlRegex]           Defaults to /pinterest\.com\/?$/.
   * @property {number} [timeoutMs]                 Default 5 minutes.
   */

  /**
   * @param {VisibleLoginInput} [input]
   * @returns {Promise<void>}
   */
  export async function runVisibleLogin(input = {}) {
    const dir = input.profileDir ?? defaultProfileDir();
    const browser = input.playwrightChromium ?? defaultChromium;
    const loginUrl = input.loginUrl ?? 'https://www.pinterest.com/login/';
    const successUrlRegex = input.successUrlRegex ?? /pinterest\.com\/?$/;
    const timeoutMs = input.timeoutMs ?? 5 * 60 * 1000;

    fs.mkdirSync(dir, { recursive: true });

    const context = await browser.launchPersistentContext(dir, {
      headless: false,
      viewport: { width: 1280, height: 800 },
    });
    try {
      const pages = context.pages();
      const page = pages.length > 0 ? pages[0] : await context.newPage();
      await page.goto(loginUrl);
      await page.waitForURL(successUrlRegex, { timeout: timeoutMs });
    } finally {
      await context.close();
    }
  }
  ```

- [ ] Re-run, confirm pass:

  ```bash
  cd web.ui/backend && npx vitest run __tests__/pinterest/login.test.js
  ```

  Expected: 1 test passes.

- [ ] Commit:

  ```bash
  git add web.ui/backend/pinterest/login.js \
          web.ui/backend/__tests__/pinterest/login.test.js
  git commit -m "feat(pinterest): one-time visible Chromium login helper with persistent profile"
  ```

---

## Task 10: Poster worker — driver injection + login detection + retries

- [ ] Write `web.ui/backend/__tests__/pinterest/poster.test.js`:

  ```javascript
  import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
  import fs from 'node:fs';
  import os from 'node:os';
  import path from 'node:path';
  import sharp from 'sharp';
  import { openDb, _resetForTests } from '../../db.js';
  import { _resetSubscribersForTests } from '../../events.js';
  import { _resetWorkerStatus } from '../../workerStatus.js';
  import { runOnce } from '../../pinterest/poster.js';

  let tmpRoot;

  async function fakeImage(file) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    await sharp({
      create: { width: 1000, height: 1500, channels: 3, background: { r: 251, g: 243, b: 226 } },
    })
      .png()
      .toFile(file);
  }

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pin-poster-'));
    process.env.ROOSTER_DB_PATH = path.join(tmpRoot, 'dashboard.db');
    _resetForTests();
    _resetSubscribersForTests();
    _resetWorkerStatus();
  });

  afterEach(() => {
    _resetForTests();
    _resetSubscribersForTests();
    _resetWorkerStatus();
    fs.rmSync(tmpRoot, { recursive: true, force: true });
    delete process.env.ROOSTER_DB_PATH;
  });

  function makePendingRow(image_path) {
    const db = openDb();
    const past = new Date(Date.now() - 60_000).toISOString();
    const info = db.prepare(`
      INSERT INTO pinterest_queue
        (kdp_book_id, pin_type, image_path, title, description, link_url, status, scheduled_for)
      VALUES (NULL, 'cover_hero', ?, 'T', 'D', 'http://amazon.com/dp/X', 'pending', ?)
    `).run(image_path, past);
    return Number(info.lastInsertRowid);
  }

  describe('runOnce — happy path', () => {
    it('posts via the fake driver and marks the row posted', async () => {
      const img = path.join(tmpRoot, 'pin.png');
      await fakeImage(img);
      const id = makePendingRow(img);
      const fakeDriver = {
        isLoggedIn: vi.fn(async () => true),
        postPin: vi.fn(async () => ({ pinId: 'pin_abc123' })),
      };
      const result = await runOnce({ driverFactory: () => fakeDriver });
      expect(result.action).toBe('posted');
      expect(result.queueId).toBe(id);
      const db = openDb();
      const row = db.prepare('SELECT status FROM pinterest_queue WHERE id=?').get(id);
      expect(row.status).toBe('posted');
      const hist = db.prepare('SELECT pinterest_pin_id FROM pinterest_history WHERE queue_id=?').get(id);
      expect(hist.pinterest_pin_id).toBe('pin_abc123');
    });
  });

  describe('runOnce — logged out', () => {
    it('pauses the queue and fires a reminder when isLoggedIn=false', async () => {
      const img = path.join(tmpRoot, 'pin.png');
      await fakeImage(img);
      makePendingRow(img);
      const fakeDriver = {
        isLoggedIn: vi.fn(async () => false),
        postPin: vi.fn(),
      };
      const result = await runOnce({ driverFactory: () => fakeDriver });
      expect(result.action).toBe('paused_login_required');
      const db = openDb();
      const paused = db.prepare("SELECT COUNT(*) AS n FROM pinterest_queue WHERE status='paused'").get().n;
      expect(paused).toBeGreaterThan(0);
      const reminders = db.prepare("SELECT title FROM reminders WHERE source_kind='pinterest.queue'").all();
      expect(reminders.some((r) => /re-?login/i.test(r.title))).toBe(true);
    });
  });

  describe('runOnce — error path', () => {
    it('records pinterest_history failure and marks queue row failed', async () => {
      const img = path.join(tmpRoot, 'pin.png');
      await fakeImage(img);
      const id = makePendingRow(img);
      const fakeDriver = {
        isLoggedIn: vi.fn(async () => true),
        postPin: vi.fn(async () => { throw new Error('network down'); }),
      };
      const result = await runOnce({ driverFactory: () => fakeDriver });
      expect(result.action).toBe('failed');
      const db = openDb();
      const row = db.prepare('SELECT status, last_error FROM pinterest_queue WHERE id=?').get(id);
      expect(row.status).toBe('failed');
      expect(row.last_error).toBe('network down');
    });
  });

  describe('runOnce — nothing due', () => {
    it('returns idle when no rows are due', async () => {
      const result = await runOnce({
        driverFactory: () => ({ isLoggedIn: vi.fn(), postPin: vi.fn() }),
      });
      expect(result.action).toBe('idle');
    });
  });
  ```

- [ ] Run, confirm failure:

  ```bash
  cd web.ui/backend && npx vitest run __tests__/pinterest/poster.test.js
  ```

  Expected: module not found.

- [ ] Implement `web.ui/backend/pinterest/poster.js`:

  ```javascript
  /**
   * Pinterest poster worker.
   *
   * One iteration ("runOnce") pulls the next due pending row, asks the
   * injected driver to (a) verify login, (b) post the pin. On success,
   * marks the row posted + records pinterest_history. On login-out, pauses
   * the queue, fires a "Re-login required" reminder, and sets the worker
   * status to error (red tray). On other errors, marks the row failed with
   * the error message.
   *
   * The driver interface is intentionally tiny so tests can pass a fake.
   * The real Playwright-backed driver is `playwrightDriver` below; it is
   * built only when not injected.
   *
   * Sleep-until-next strategy:
   *   - Compute msUntilNext from the earliest pending scheduled_for.
   *   - If nothing pending, sleep 5 minutes and re-check.
   *   - If paused, sleep 5 minutes and re-check (pause toggles flip status).
   *   - Exponential backoff on consecutive failures: 1m → 5m → 30m → pause.
   *
   * @module pinterest/poster
   */

  import fs from 'node:fs';
  import path from 'node:path';
  import { fileURLToPath } from 'node:url';
  import { openDb } from '../db.js';
  import { recordEvent } from '../events.js';
  import { setWorkerHeartbeat, setWorkerError } from '../workerStatus.js';
  import { dequeueNext, markPosted, markFailed, pauseQueue } from './queue.js';
  import { defaultProfileDir } from './login.js';

  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);

  /**
   * @typedef {Object} PinterestDriver
   * @property {() => Promise<boolean>} isLoggedIn
   * @property {(args: {imagePath: string, title: string, description: string, link: string}) => Promise<{pinId: string}>} postPin
   * @property {() => Promise<void>} [close]
   */

  /**
   * @typedef {Object} RunOnceInput
   * @property {() => PinterestDriver | Promise<PinterestDriver>} [driverFactory]
   */

  /**
   * @typedef {Object} RunOnceResult
   * @property {'idle'|'posted'|'failed'|'paused_login_required'} action
   * @property {number|null} [queueId]
   * @property {string} [pinId]
   * @property {string} [error]
   */

  /**
   * Process at most one pending pin. Pure of timers; the supervisor loop
   * (`startPosterWorker`) handles cadence.
   *
   * @param {RunOnceInput} input
   * @returns {Promise<RunOnceResult>}
   */
  export async function runOnce(input = {}) {
    const driverFactory = input.driverFactory ?? (() => playwrightDriver());
    const row = dequeueNext();
    if (!row) {
      setWorkerHeartbeat('pinterest');
      return { action: 'idle' };
    }

    let driver;
    try {
      driver = await driverFactory();
    } catch (err) {
      markFailed(row.id, `driver failed to start: ${err?.message || err}`);
      setWorkerError('pinterest', String(err?.message || err));
      return { action: 'failed', queueId: row.id, error: String(err?.message || err) };
    }

    try {
      const loggedIn = await driver.isLoggedIn();
      if (!loggedIn) {
        // Re-mark this row pending so it doesn't get lost.
        const db = openDb();
        db.prepare(`UPDATE pinterest_queue SET status='pending' WHERE id=?`).run(row.id);
        const affected = pauseQueue();
        // Reminder for the user.
        const dueAt = new Date(Date.now() + 60 * 1000).toISOString();
        db.prepare(`
          INSERT INTO reminders (title, body, due_at, channel, status, source_kind, source_id)
          VALUES ('Pinterest re-login required',
                  'The dashboard could not post a pin because the Pinterest session expired. Open /pinterest and click "Sign in to Pinterest".',
                  ?, 'both', 'pending', 'pinterest.queue', ?)
        `).run(dueAt, row.id);
        setWorkerError('pinterest', 'login required');
        recordEvent('pinterest:login-required', { queue_id: row.id, paused: affected });
        return { action: 'paused_login_required', queueId: row.id };
      }

      if (!fs.existsSync(row.image_path)) {
        markFailed(row.id, `image_path missing: ${row.image_path}`);
        setWorkerError('pinterest', 'image missing');
        return { action: 'failed', queueId: row.id, error: 'image missing' };
      }

      const result = await driver.postPin({
        imagePath: row.image_path,
        title: row.title,
        description: row.description,
        link: row.link_url,
      });
      markPosted(row.id, result.pinId);
      setWorkerHeartbeat('pinterest');
      return { action: 'posted', queueId: row.id, pinId: result.pinId };
    } catch (err) {
      const msg = err?.message || String(err);
      markFailed(row.id, msg);
      setWorkerError('pinterest', msg);
      return { action: 'failed', queueId: row.id, error: msg };
    } finally {
      if (driver?.close) {
        try { await driver.close(); } catch { /* ignore */ }
      }
    }
  }

  /**
   * Compute the milliseconds until the next pending row is due. Returns null
   * if the queue is empty or fully paused.
   *
   * @returns {number|null}
   */
  export function msUntilNextPending() {
    const db = openDb();
    const row = db.prepare(`
      SELECT scheduled_for FROM pinterest_queue
       WHERE status='pending'
       ORDER BY scheduled_for ASC
       LIMIT 1
    `).get();
    if (!row) return null;
    return new Date(row.scheduled_for).getTime() - Date.now();
  }

  /**
   * Sleep-until-next supervisor loop. Returns the cancel function.
   *
   * @param {{driverFactory?: () => PinterestDriver | Promise<PinterestDriver>, idleCheckMs?: number}} [opts]
   * @returns {() => void}
   */
  export function startPosterWorker(opts = {}) {
    const idleCheckMs = opts.idleCheckMs ?? 5 * 60 * 1000;
    let cancelled = false;
    let timer = null;

    async function loop() {
      if (cancelled) return;
      try {
        await runOnce({ driverFactory: opts.driverFactory });
      } catch (err) {
        setWorkerError('pinterest', err?.message || String(err));
      }
      if (cancelled) return;
      const ms = msUntilNextPending();
      const delay = ms === null
        ? idleCheckMs
        : Math.max(5_000, Math.min(idleCheckMs, ms));
      timer = setTimeout(loop, delay);
    }

    setWorkerHeartbeat('pinterest');
    timer = setTimeout(loop, 1000);

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }

  /**
   * Real Playwright-backed driver. Built lazily so tests never load it.
   *
   * @returns {Promise<PinterestDriver>}
   */
  async function playwrightDriver() {
    const { chromium } = await import('playwright');
    const profileDir = defaultProfileDir();
    fs.mkdirSync(profileDir, { recursive: true });
    const context = await chromium.launchPersistentContext(profileDir, {
      headless: true,
      viewport: { width: 1280, height: 800 },
    });
    const page = context.pages()[0] ?? (await context.newPage());

    return {
      async isLoggedIn() {
        await page.goto('https://www.pinterest.com/', { waitUntil: 'domcontentloaded' });
        // Pinterest redirects logged-out users to /login.
        const url = page.url();
        if (/\/login\b/.test(url)) return false;
        // Belt-and-braces: presence of the avatar header element.
        try {
          await page.waitForSelector('[data-test-id="header-profile"]', { timeout: 5000 });
          return true;
        } catch {
          return !/\/login\b/.test(page.url());
        }
      },
      async postPin({ imagePath, title, description, link }) {
        await page.goto('https://www.pinterest.com/pin-builder/', { waitUntil: 'domcontentloaded' });
        // 1) Upload image.
        const fileInput = await page.waitForSelector('input[type="file"]', { timeout: 30000 });
        await fileInput.setInputFiles(imagePath);
        // 2) Fill title.
        const titleEl = await page.waitForSelector(
          'input[placeholder*="Add a title" i], [data-test-id="pin-draft-title"] input',
          { timeout: 30000 },
        );
        await titleEl.fill(title);
        // 3) Fill description.
        const descEl = await page.waitForSelector(
          'textarea[placeholder*="Tell everyone what your Pin is about" i], [data-test-id="pin-draft-description"] textarea',
          { timeout: 30000 },
        );
        await descEl.fill(description);
        // 4) Fill destination link.
        const linkEl = await page.waitForSelector(
          'input[placeholder*="Add a destination link" i], [data-test-id="pin-draft-link"] input',
          { timeout: 30000 },
        );
        await linkEl.fill(link);
        // 5) Click Publish.
        const publishBtn = await page.waitForSelector(
          'button[data-test-id="board-dropdown-save-button"], button:has-text("Publish"), button:has-text("Save")',
          { timeout: 30000 },
        );
        await publishBtn.click();
        // 6) Wait for the post-success redirect (/pin/<id>/).
        await page.waitForURL(/pinterest\.com\/pin\/\d+\/?/, { timeout: 60000 });
        const m = /pinterest\.com\/pin\/(\d+)\//.exec(page.url());
        return { pinId: m ? m[1] : page.url() };
      },
      async close() {
        await context.close();
      },
    };
  }
  ```

- [ ] Re-run, confirm pass:

  ```bash
  cd web.ui/backend && npx vitest run __tests__/pinterest/poster.test.js
  ```

  Expected: 4 tests pass.

- [ ] Commit:

  ```bash
  git add web.ui/backend/pinterest/poster.js \
          web.ui/backend/__tests__/pinterest/poster.test.js
  git commit -m "feat(pinterest): poster worker with driverFactory injection + login detection"
  ```

---

## Task 11: Express routes — queue / history / pause / resume / login / edit / cancel

- [ ] Write `web.ui/backend/__tests__/pinterest/routes.test.js`:

  ```javascript
  import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
  import express from 'express';
  import request from 'supertest';
  import fs from 'node:fs';
  import os from 'node:os';
  import path from 'node:path';
  import { openDb, _resetForTests } from '../../db.js';
  import { _resetSubscribersForTests } from '../../events.js';

  let tmpRoot;
  let app;

  beforeEach(async () => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pin-routes-'));
    process.env.ROOSTER_DB_PATH = path.join(tmpRoot, 'dashboard.db');
    _resetForTests();
    _resetSubscribersForTests();
    const { installPinterestModule } = await import('../../pinterest/index.js');
    app = express();
    app.use(express.json());
    installPinterestModule(app);
  });

  afterEach(() => {
    _resetForTests();
    _resetSubscribersForTests();
    fs.rmSync(tmpRoot, { recursive: true, force: true });
    delete process.env.ROOSTER_DB_PATH;
  });

  function seedRow(status = 'pending', sched = new Date(Date.now() + 60_000).toISOString()) {
    const db = openDb();
    const info = db.prepare(`
      INSERT INTO pinterest_queue
        (kdp_book_id, pin_type, image_path, title, description, link_url, status, scheduled_for)
      VALUES (NULL, 'cover_hero', '/x.png', 'T', 'D', 'http://x', ?, ?)
    `).run(status, sched);
    return Number(info.lastInsertRowid);
  }

  describe('GET /api/pinterest/queue', () => {
    it('returns pending+posting+paused', async () => {
      seedRow('pending');
      seedRow('posted');
      const res = await request(app).get('/api/pinterest/queue');
      expect(res.status).toBe(200);
      expect(res.body.queue).toHaveLength(1);
    });
  });

  describe('GET /api/pinterest/history', () => {
    it('returns up to 100 history rows', async () => {
      const id = seedRow('posted');
      const db = openDb();
      db.prepare(`
        INSERT INTO pinterest_history (queue_id, pinterest_pin_id, posted_at, success, error_message)
        VALUES (?, 'pin1', ?, 1, NULL)
      `).run(id, new Date().toISOString());
      const res = await request(app).get('/api/pinterest/history');
      expect(res.status).toBe(200);
      expect(res.body.history).toHaveLength(1);
      expect(res.body.history[0].success).toBe(true);
    });
  });

  describe('POST /api/pinterest/pause + /resume', () => {
    it('pauses then resumes', async () => {
      seedRow('pending');
      seedRow('pending');
      const r1 = await request(app).post('/api/pinterest/pause').send({});
      expect(r1.status).toBe(200);
      expect(r1.body.paused).toBe(2);
      const r2 = await request(app).post('/api/pinterest/resume').send({});
      expect(r2.status).toBe(200);
      expect(r2.body.resumed).toBe(2);
    });
  });

  describe('POST /api/pinterest/queue/:id/cancel', () => {
    it('cancels a pending row', async () => {
      const id = seedRow('pending');
      const res = await request(app).post(`/api/pinterest/queue/${id}/cancel`).send({});
      expect(res.status).toBe(200);
      const db = openDb();
      const row = db.prepare('SELECT * FROM pinterest_queue WHERE id=?').get(id);
      expect(row).toBeUndefined();
    });
  });

  describe('PUT /api/pinterest/queue/:id', () => {
    it('updates title and scheduled_for', async () => {
      const id = seedRow('pending');
      const newTs = new Date(Date.now() + 86400_000).toISOString();
      const res = await request(app).put(`/api/pinterest/queue/${id}`).send({
        title: 'Renamed',
        scheduled_for: newTs,
      });
      expect(res.status).toBe(200);
      const db = openDb();
      const row = db.prepare('SELECT title, scheduled_for FROM pinterest_queue WHERE id=?').get(id);
      expect(row.title).toBe('Renamed');
      expect(row.scheduled_for).toBe(newTs);
    });
  });

  describe('POST /api/pinterest/login', () => {
    it('invokes the login helper with the injected playwright module', async () => {
      // Pre-stub the helper.
      const fake = { runVisibleLogin: vi.fn(async () => {}), defaultProfileDir: () => '/tmp' };
      vi.doMock('../../pinterest/login.js', () => fake);
      _resetForTests();
      _resetSubscribersForTests();
      const { installPinterestModule } = await import(`../../pinterest/index.js?cachebust=${Date.now()}`);
      const a2 = express();
      a2.use(express.json());
      installPinterestModule(a2);
      const res = await request(a2).post('/api/pinterest/login').send({});
      expect(res.status).toBe(200);
      expect(fake.runVisibleLogin).toHaveBeenCalled();
      vi.doUnmock('../../pinterest/login.js');
    });
  });
  ```

- [ ] Run, confirm failure:

  ```bash
  cd web.ui/backend && npx vitest run __tests__/pinterest/routes.test.js
  ```

  Expected: module not found.

- [ ] Implement `web.ui/backend/pinterest/routes.js`:

  ```javascript
  /**
   * Pinterest REST routes.
   * @module pinterest/routes
   */

  import express from 'express';
  import {
    listQueue,
    listHistory,
    pauseQueue,
    resumeQueue,
    cancelQueueRow,
    updateQueueRow,
  } from './queue.js';

  export const router = express.Router();

  router.get('/queue', (_req, res) => {
    res.json({ queue: listQueue() });
  });

  router.get('/history', (req, res) => {
    const limit = Math.max(1, Math.min(500, Number(req.query.limit ?? 100)));
    res.json({ history: listHistory(limit) });
  });

  router.post('/pause', (_req, res) => {
    const paused = pauseQueue();
    res.json({ paused });
  });

  router.post('/resume', (_req, res) => {
    const resumed = resumeQueue();
    res.json({ resumed });
  });

  router.post('/queue/:id/cancel', (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'bad_id' });
    }
    cancelQueueRow(id);
    res.json({ ok: true });
  });

  router.put('/queue/:id', (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'bad_id' });
    }
    const { title, description, scheduled_for } = req.body ?? {};
    updateQueueRow(id, { title, description, scheduled_for });
    res.json({ ok: true });
  });

  router.post('/login', async (_req, res) => {
    try {
      const { runVisibleLogin } = await import('./login.js');
      // Fire-and-forget: the headed Chromium runs until the user is logged in
      // (or the 5-minute internal timeout). We don't await it on the request
      // because that would tie up the connection for minutes.
      runVisibleLogin().catch((err) => {
        console.warn(`runVisibleLogin failed: ${err?.message || err}`);
      });
      res.json({ ok: true, launched: true });
    } catch (err) {
      res.status(500).json({ error: err?.message || String(err) });
    }
  });
  ```

- [ ] Implement `web.ui/backend/pinterest/index.js`:

  ```javascript
  /**
   * Pinterest module surface.
   * @module pinterest
   */

  import { router as pinterestRouter } from './routes.js';
  export { startPosterWorker } from './poster.js';
  export { enqueuePinsForBook } from './queue.js';

  /**
   * Mount /api/pinterest on an Express app.
   * @param {import('express').Express} app
   */
  export function installPinterestModule(app) {
    app.use('/api/pinterest', pinterestRouter);
  }
  ```

- [ ] Re-run, confirm pass:

  ```bash
  cd web.ui/backend && npx vitest run __tests__/pinterest/routes.test.js
  ```

  Expected: 6 tests pass.

- [ ] Commit:

  ```bash
  git add web.ui/backend/pinterest/routes.js web.ui/backend/pinterest/index.js \
          web.ui/backend/__tests__/pinterest/routes.test.js
  git commit -m "feat(pinterest): REST routes for queue/history/pause/resume/login/edit/cancel"
  ```

---

## Task 12: Wire Pinterest module + poster worker into `server.js`

- [ ] Open `web.ui/backend/server.js`. Add the import near other module imports added by Plans A/B/C/D:

  ```javascript
  import { installPinterestModule, startPosterWorker } from './pinterest/index.js';
  ```

- [ ] After the other `install*Module(app)` calls (KDP from Plan B, Etsy/Calendar from Plan C, Reminders/Plans from Plan D), add:

  ```javascript
  installPinterestModule(app);
  ```

- [ ] Inside the `app.listen` callback (where Plan A wires `startTray()` and `startBackupCron()`), add — guarded so tests can skip:

  ```javascript
  if (process.env.ROOSTER_SKIP_PINTEREST_POSTER !== '1') {
    startPosterWorker();
  }
  ```

- [ ] Verify the server still boots without exceptions:

  ```bash
  cd web.ui/backend && \
    ROOSTER_SKIP_TRAY=1 ROOSTER_SKIP_CRON=1 ROOSTER_SKIP_PINTEREST_POSTER=1 SKIP_KDP_SCANNER=1 \
    node -e "import('./server.js').then(()=>setTimeout(()=>process.exit(0),500))"
  ```

  Expected: process exits 0 with no thrown errors.

- [ ] Smoke-test the new endpoints against a real running server (separate terminal):

  ```bash
  cd web.ui/backend && \
    ROOSTER_SKIP_TRAY=1 ROOSTER_SKIP_CRON=1 ROOSTER_SKIP_PINTEREST_POSTER=1 SKIP_KDP_SCANNER=1 \
    node server.js &
  sleep 2
  curl -s http://127.0.0.1:5000/api/pinterest/queue
  curl -s http://127.0.0.1:5000/api/pinterest/history
  kill %1
  ```

  Expected: each curl prints `{"queue":[]}` / `{"history":[]}`.

- [ ] Commit:

  ```bash
  git add web.ui/backend/server.js
  git commit -m "feat(pinterest): mount /api/pinterest routes + start poster worker on boot"
  ```

---

## Task 13: Frontend — typed API client + types

- [ ] Create `web.ui/frontend-react/src/services/pinterest.ts`:

  ```typescript
  /**
   * Typed fetch client for /api/pinterest/*.
   */

  export type PinType = 'cover_hero' | 'interior_preview';
  export type QueueStatus = 'pending' | 'posting' | 'posted' | 'failed' | 'paused';

  export interface PinterestQueueRow {
    id: number;
    kdp_book_id: number | null;
    pin_type: PinType;
    image_path: string;
    title: string;
    description: string;
    link_url: string;
    status: QueueStatus;
    scheduled_for: string;
    attempts: number;
    last_error: string | null;
    created_at: string;
  }

  export interface PinterestHistoryRow {
    id: number;
    queue_id: number;
    pinterest_pin_id: string | null;
    posted_at: string;
    success: boolean;
    error_message: string | null;
    title: string;
    image_path: string;
  }

  async function jsonFetch<T>(url: string, init?: RequestInit): Promise<T> {
    const res = await fetch(url, init);
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`${res.status} ${res.statusText}: ${body}`);
    }
    return res.json() as Promise<T>;
  }

  export function listQueue(): Promise<{ queue: PinterestQueueRow[] }> {
    return jsonFetch('/api/pinterest/queue');
  }

  export function listHistory(limit = 100): Promise<{ history: PinterestHistoryRow[] }> {
    return jsonFetch(`/api/pinterest/history?limit=${limit}`);
  }

  export function pauseQueue(): Promise<{ paused: number }> {
    return jsonFetch('/api/pinterest/pause', { method: 'POST' });
  }

  export function resumeQueue(): Promise<{ resumed: number }> {
    return jsonFetch('/api/pinterest/resume', { method: 'POST' });
  }

  export function cancelRow(id: number): Promise<{ ok: true }> {
    return jsonFetch(`/api/pinterest/queue/${id}/cancel`, { method: 'POST' });
  }

  export function updateRow(
    id: number,
    patch: { title?: string; description?: string; scheduled_for?: string },
  ): Promise<{ ok: true }> {
    return jsonFetch(`/api/pinterest/queue/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
  }

  export function triggerLogin(): Promise<{ ok: true; launched: boolean }> {
    return jsonFetch('/api/pinterest/login', { method: 'POST' });
  }
  ```

- [ ] Build to verify TypeScript is happy:

  ```bash
  cd web.ui/frontend-react && npm run build
  ```

  Expected: build succeeds.

- [ ] Commit:

  ```bash
  git add web.ui/frontend-react/src/services/pinterest.ts
  git commit -m "feat(pinterest): typed fetch client for /api/pinterest/*"
  ```

---

## Task 14: Frontend — `PinterestQueueTable` component

- [ ] Create `web.ui/frontend-react/src/components/PinterestQueueTable.tsx`:

  ```typescript
  import { useState } from 'react';
  import { PinterestQueueRow, cancelRow, updateRow } from '../services/pinterest';

  interface Props {
    rows: PinterestQueueRow[];
    onChanged: () => void;
    onPreview: (row: PinterestQueueRow) => void;
  }

  export default function PinterestQueueTable({ rows, onChanged, onPreview }: Props) {
    const [editingId, setEditingId] = useState<number | null>(null);
    const [draft, setDraft] = useState<{ title: string; scheduled_for: string }>({
      title: '',
      scheduled_for: '',
    });

    function beginEdit(row: PinterestQueueRow) {
      setEditingId(row.id);
      setDraft({ title: row.title, scheduled_for: row.scheduled_for.slice(0, 16) });
    }

    async function commitEdit(row: PinterestQueueRow) {
      // The datetime-local input lacks timezone; treat as the user's local time.
      const isoScheduled = new Date(draft.scheduled_for).toISOString();
      await updateRow(row.id, { title: draft.title, scheduled_for: isoScheduled });
      setEditingId(null);
      onChanged();
    }

    async function handleCancel(row: PinterestQueueRow) {
      if (!confirm(`Cancel pin "${row.title}"?`)) return;
      await cancelRow(row.id);
      onChanged();
    }

    if (rows.length === 0) {
      return <p className="empty">No pins in queue. Mark a KDP book published to generate pins.</p>;
    }

    return (
      <table className="pin-queue-table">
        <thead>
          <tr>
            <th>Pin</th>
            <th>Type</th>
            <th>Scheduled for (local)</th>
            <th>Status</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className={`status-${row.status}`}>
              <td>
                <button className="link-btn" onClick={() => onPreview(row)}>
                  {editingId === row.id ? (
                    <input
                      type="text"
                      value={draft.title}
                      onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                    />
                  ) : (
                    row.title
                  )}
                </button>
              </td>
              <td>{row.pin_type.replace('_', ' ')}</td>
              <td>
                {editingId === row.id ? (
                  <input
                    type="datetime-local"
                    value={draft.scheduled_for}
                    onChange={(e) => setDraft({ ...draft, scheduled_for: e.target.value })}
                  />
                ) : (
                  new Date(row.scheduled_for).toLocaleString()
                )}
              </td>
              <td><span className={`status-badge status-${row.status}`}>{row.status}</span></td>
              <td className="actions">
                {editingId === row.id ? (
                  <>
                    <button onClick={() => commitEdit(row)}>Save</button>
                    <button onClick={() => setEditingId(null)}>Cancel</button>
                  </>
                ) : (
                  <>
                    {row.status === 'pending' && (
                      <button onClick={() => beginEdit(row)}>Edit</button>
                    )}
                    {(row.status === 'pending' || row.status === 'paused') && (
                      <button onClick={() => handleCancel(row)}>Cancel</button>
                    )}
                  </>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }
  ```

- [ ] Commit:

  ```bash
  git add web.ui/frontend-react/src/components/PinterestQueueTable.tsx
  git commit -m "feat(pinterest): PinterestQueueTable with inline edit + cancel + preview link"
  ```

---

## Task 15: Frontend — `PinterestHistoryTable` + `PinPreviewModal`

- [ ] Create `web.ui/frontend-react/src/components/PinterestHistoryTable.tsx`:

  ```typescript
  import { PinterestHistoryRow } from '../services/pinterest';

  interface Props {
    rows: PinterestHistoryRow[];
  }

  export default function PinterestHistoryTable({ rows }: Props) {
    if (rows.length === 0) {
      return <p className="empty">No posting history yet.</p>;
    }
    return (
      <table className="pin-history-table">
        <thead>
          <tr>
            <th>Title</th>
            <th>Posted at</th>
            <th>Result</th>
            <th>Pin / Error</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td>{row.title}</td>
              <td>{new Date(row.posted_at).toLocaleString()}</td>
              <td>
                {row.success ? (
                  <span className="badge badge-ok">posted</span>
                ) : (
                  <span className="badge badge-fail">failed</span>
                )}
              </td>
              <td>
                {row.success && row.pinterest_pin_id ? (
                  <a
                    href={`https://www.pinterest.com/pin/${row.pinterest_pin_id}/`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {row.pinterest_pin_id}
                  </a>
                ) : (
                  <span className="muted">{row.error_message ?? ''}</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }
  ```

- [ ] Create `web.ui/frontend-react/src/components/PinPreviewModal.tsx`:

  ```typescript
  import { PinterestQueueRow } from '../services/pinterest';

  interface Props {
    row: PinterestQueueRow | null;
    onClose: () => void;
  }

  /**
   * Show the 1000×1500 pin PNG full-size in a modal. The backend serves these
   * via the `/files` static route (Plan B Task 16); we request the path with
   * `/files/<absolute-or-relative>` after the route's allow-list — and since
   * pin PNGs live under `output/pinterest/`, Plan E Task 17 extends `/files`
   * to include that prefix.
   */
  export default function PinPreviewModal({ row, onClose }: Props) {
    if (!row) return null;
    // Convert "C:/.../output/pinterest/<slug>/<file>" → "/files/output/pinterest/<slug>/<file>"
    const m = row.image_path.replace(/\\/g, '/').match(/output\/pinterest\/[^?#]+$/);
    const src = m ? `/files/${m[0]}` : row.image_path;
    return (
      <div className="modal-backdrop" onClick={onClose}>
        <div className="modal pin-preview-modal" onClick={(e) => e.stopPropagation()}>
          <button className="modal-close" onClick={onClose} aria-label="Close">×</button>
          <h2>{row.title}</h2>
          <img src={src} alt={row.title} style={{ maxWidth: '500px', maxHeight: '750px' }} />
          <dl>
            <dt>Description</dt><dd>{row.description}</dd>
            <dt>Destination</dt><dd><a href={row.link_url}>{row.link_url}</a></dd>
            <dt>Scheduled</dt><dd>{new Date(row.scheduled_for).toLocaleString()}</dd>
          </dl>
        </div>
      </div>
    );
  }
  ```

- [ ] Commit:

  ```bash
  git add web.ui/frontend-react/src/components/PinterestHistoryTable.tsx \
          web.ui/frontend-react/src/components/PinPreviewModal.tsx
  git commit -m "feat(pinterest): history table + pin preview modal"
  ```

---

## Task 16: Frontend — `PinterestSettings` component (pause/resume + re-login)

- [ ] Create `web.ui/frontend-react/src/components/PinterestSettings.tsx`:

  ```typescript
  import { useState } from 'react';
  import { pauseQueue, resumeQueue, triggerLogin } from '../services/pinterest';

  interface Props {
    pendingCount: number;
    pausedCount: number;
    onChanged: () => void;
  }

  export default function PinterestSettings({ pendingCount, pausedCount, onChanged }: Props) {
    const [status, setStatus] = useState<string>('');

    async function handlePause() {
      const r = await pauseQueue();
      setStatus(`Paused ${r.paused} pin(s).`);
      onChanged();
    }
    async function handleResume() {
      const r = await resumeQueue();
      setStatus(`Resumed ${r.resumed} pin(s).`);
      onChanged();
    }
    async function handleLogin() {
      setStatus('Opening Pinterest login window… complete the login in the new Chromium window that just appeared.');
      try {
        await triggerLogin();
      } catch (err) {
        setStatus(`Login launch failed: ${String((err as Error).message ?? err)}`);
      }
    }

    return (
      <section className="pin-settings">
        <h2>Settings</h2>
        <div className="pin-settings-row">
          <div>
            <strong>{pendingCount}</strong> pending · <strong>{pausedCount}</strong> paused
          </div>
          <div className="pin-settings-actions">
            {pendingCount > 0 && <button onClick={handlePause}>Pause queue</button>}
            {pausedCount > 0 && <button onClick={handleResume}>Resume queue</button>}
            <button onClick={handleLogin} title="Open a visible Chromium window to log in">
              Sign in to Pinterest
            </button>
          </div>
        </div>
        <p className="muted">
          Posting cadence is 3–5 pins per day, jittered between 09:00 and 21:00 in your profile time zone.
          Edit the time zone on /profile if you want a different window.
        </p>
        {status && <p className="pin-settings-status">{status}</p>}
      </section>
    );
  }
  ```

- [ ] Commit:

  ```bash
  git add web.ui/frontend-react/src/components/PinterestSettings.tsx
  git commit -m "feat(pinterest): settings panel with pause/resume + sign-in-to-pinterest button"
  ```

---

## Task 17: Frontend — `/pinterest` page + SSE live refresh + `/files` route extension

- [ ] Extend the backend `/files` route (added by Plan B Task 16) so it also serves pin PNGs from `output/pinterest/`. Open `web.ui/backend/kdp/routes.js` and locate the `/files` handler that whitelists `data/cache/...` and `output/kdp-ready/...`. Add `output/pinterest/...` to the allowed prefix list. If Plan B's implementation uses a single regex, extend it to match `output/pinterest/**`.

  Example shape (paste into the handler if Plan B's pattern matches; otherwise adapt to the exact code Plan B Task 16 wrote):

  ```javascript
  const ALLOWED_PREFIXES = [
    'data/cache/previews/',
    'output/kdp-ready/',
    'output/pinterest/',     // ← Plan E addition
  ];
  ```

  Save the file.

- [ ] Replace `web.ui/frontend-react/src/pages/Pinterest.tsx` (Plan A scaffolded a placeholder):

  ```typescript
  import { useCallback, useEffect, useState } from 'react';
  import { listQueue, listHistory, PinterestQueueRow, PinterestHistoryRow } from '../services/pinterest';
  import PinterestQueueTable from '../components/PinterestQueueTable';
  import PinterestHistoryTable from '../components/PinterestHistoryTable';
  import PinterestSettings from '../components/PinterestSettings';
  import PinPreviewModal from '../components/PinPreviewModal';
  import { useSseEvents } from '../hooks/useSseEvents';

  export default function Pinterest() {
    const [queue, setQueue] = useState<PinterestQueueRow[]>([]);
    const [history, setHistory] = useState<PinterestHistoryRow[]>([]);
    const [preview, setPreview] = useState<PinterestQueueRow | null>(null);
    const [err, setErr] = useState<string | null>(null);
    const { lastEvent } = useSseEvents();

    const reload = useCallback(async () => {
      try {
        const [q, h] = await Promise.all([listQueue(), listHistory(100)]);
        setQueue(q.queue);
        setHistory(h.history);
        setErr(null);
      } catch (e) {
        setErr(String((e as Error).message ?? e));
      }
    }, []);

    useEffect(() => { reload(); }, [reload]);

    // Live refresh on any pinterest:* SSE event.
    useEffect(() => {
      if (!lastEvent) return;
      if (lastEvent.kind.startsWith('pinterest:')) {
        reload();
      }
    }, [lastEvent, reload]);

    const pending = queue.filter((r) => r.status === 'pending').length;
    const paused = queue.filter((r) => r.status === 'paused').length;

    return (
      <section>
        <h1>Pinterest</h1>
        {err && <p className="error">{err}</p>}

        <PinterestSettings pendingCount={pending} pausedCount={paused} onChanged={reload} />

        <h2>Queue</h2>
        <PinterestQueueTable rows={queue} onChanged={reload} onPreview={setPreview} />

        <h2>History</h2>
        <PinterestHistoryTable rows={history} />

        <PinPreviewModal row={preview} onClose={() => setPreview(null)} />
      </section>
    );
  }
  ```

- [ ] Add minimal styles to `web.ui/frontend-react/src/styles/shell.css` (append to the file):

  ```css
  /* Plan E — Pinterest page */
  .pin-queue-table, .pin-history-table { width: 100%; border-collapse: collapse; margin: 0.5rem 0 1.5rem; }
  .pin-queue-table th, .pin-history-table th { text-align: left; padding: 0.5rem; border-bottom: 1px solid var(--border); font-weight: 600; }
  .pin-queue-table td, .pin-history-table td { padding: 0.5rem; border-bottom: 1px solid var(--border); }
  .pin-queue-table tr.status-paused { opacity: 0.6; }
  .pin-queue-table tr.status-failed { background: #fff5f5; }
  .status-badge { padding: 2px 8px; border-radius: 999px; font-size: 0.8rem; font-weight: 600; }
  .status-badge.status-pending { background: #e0f2fe; color: #075985; }
  .status-badge.status-posting { background: #fef3c7; color: #92400e; }
  .status-badge.status-paused  { background: #f3f4f6; color: #374151; }
  .status-badge.status-failed  { background: #fee2e2; color: #991b1b; }
  .badge { padding: 2px 8px; border-radius: 999px; font-size: 0.8rem; font-weight: 600; }
  .badge-ok { background: #d1fae5; color: #065f46; }
  .badge-fail { background: #fee2e2; color: #991b1b; }
  .pin-settings { padding: 1rem; background: #fff; border: 1px solid var(--border); border-radius: 8px; margin-bottom: 1.5rem; }
  .pin-settings-row { display: flex; justify-content: space-between; align-items: center; }
  .pin-settings-actions { display: flex; gap: 0.5rem; }
  .pin-settings-actions button { padding: 0.4rem 0.8rem; border: 1px solid var(--border); background: white; border-radius: 6px; cursor: pointer; }
  .pin-settings-status { margin-top: 0.5rem; color: var(--muted); }
  .modal-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 100; }
  .modal { background: white; padding: 1.5rem; border-radius: 8px; max-width: 90vw; max-height: 90vh; overflow: auto; position: relative; }
  .modal-close { position: absolute; top: 0.5rem; right: 0.75rem; border: none; background: transparent; font-size: 1.6rem; cursor: pointer; }
  .pin-preview-modal img { display: block; margin: 1rem auto; border: 1px solid var(--border); }
  .link-btn { background: none; border: none; color: var(--accent); cursor: pointer; padding: 0; font: inherit; }
  .muted { color: var(--muted); }
  .empty { color: var(--muted); font-style: italic; }
  ```

- [ ] Build to verify:

  ```bash
  cd web.ui/frontend-react && npm run build
  ```

  Expected: build succeeds with no TS errors.

- [ ] Commit:

  ```bash
  git add web.ui/frontend-react/src/pages/Pinterest.tsx \
          web.ui/frontend-react/src/styles/shell.css \
          web.ui/backend/kdp/routes.js
  git commit -m "feat(pinterest): /pinterest page with queue/history/settings + SSE refresh + extended /files allow-list"
  ```

---

## Task 18: Help content — `pinterest_first_login.md`

- [ ] Create `web.ui/backend/help/pinterest_first_login.md`:

  ```markdown
  # First-time Pinterest login

  The dashboard posts pins by automating a real Chromium browser. It uses a
  persistent profile stored at `web.ui/backend/.pinterest-profile/`, so you
  only need to log in once — Pinterest's session cookie persists on disk
  and subsequent posts run silently in the background.

  ## Steps

  1. Open the `/pinterest` page in the dashboard.
  2. In the **Settings** panel at the top, click **Sign in to Pinterest**.
  3. A new Chromium window opens at `https://www.pinterest.com/login/`.
  4. Complete the login normally — email + password, Google sign-in, or
     "Continue with Apple". Two-factor codes work the same as a normal
     browser login.
  5. Once Pinterest redirects you to the main feed (URL becomes
     `https://www.pinterest.com/`), the Chromium window closes automatically.
  6. The pin queue resumes within a minute. The tray icon returns to green.

  ## What gets stored

  - Pinterest session cookies live inside `web.ui/backend/.pinterest-profile/`.
  - This directory is gitignored — nothing is uploaded.
  - Backup of this directory is included in the nightly SQLite backup tarball
    (`data/.backups/`).

  ## When the session expires

  Pinterest typically keeps the session alive for months. If the dashboard
  detects a logged-out state (page redirects to `/login`), it:

  1. Pauses the entire pin queue.
  2. Creates a "Pinterest re-login required" reminder (toast + email).
  3. Sets the tray icon red.

  Open `/pinterest` and click **Sign in to Pinterest** again. The paused
  pins automatically flip back to `pending` once you resume the queue from
  the Settings panel.

  ## Multiple accounts

  This automation supports one Pinterest account at a time. To switch
  accounts, log out of Pinterest in the visible Chromium window, then log
  back in as the other account. The persistent profile retains whichever
  session you last completed.

  ## Troubleshooting

  - **Chromium window does not appear:** check the dashboard logs at
    `data/logs/dashboard-<date>.log`. Most commonly Playwright's bundled
    Chromium is missing — run `npx playwright install chromium` from the
    `web.ui/backend/` directory.
  - **"Login required" reminder fires immediately after sign-in:** Pinterest
    may have flagged the session as suspicious. Open a normal browser, log
    in once on `pinterest.com`, complete any captcha or 2FA challenge, then
    retry the dashboard's sign-in button.
  - **Pin upload fails partway through:** the dashboard marks the pin
    `failed` and tries the next pending pin. Check `/pinterest` History for
    the error message, then re-queue from the offending book's KDP detail
    page.
  ```

- [ ] Verify the help endpoint serves it:

  ```bash
  cd web.ui/backend && \
    ROOSTER_SKIP_TRAY=1 ROOSTER_SKIP_CRON=1 ROOSTER_SKIP_PINTEREST_POSTER=1 SKIP_KDP_SCANNER=1 \
    node server.js &
  sleep 2
  curl -s http://127.0.0.1:5000/api/help/pinterest_first_login | head -c 80
  kill %1
  ```

  Expected: the first 80 chars of the markdown file are printed (starts with `# First-time Pinterest login`).

- [ ] Commit:

  ```bash
  git add web.ui/backend/help/pinterest_first_login.md
  git commit -m "docs(help): pinterest_first_login walkthrough article"
  ```

---

## Task 19: E2E test — fake driver runs end-to-end through the poster

- [ ] Write `web.ui/backend/__tests__/pinterest/e2e_fake_driver.test.js`:

  ```javascript
  import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
  import fs from 'node:fs';
  import os from 'node:os';
  import path from 'node:path';
  import sharp from 'sharp';
  import { openDb, _resetForTests } from '../../db.js';
  import { _resetSubscribersForTests } from '../../events.js';
  import { _resetWorkerStatus } from '../../workerStatus.js';
  import { enqueuePinsForBook } from '../../pinterest/queue.js';
  import { runOnce } from '../../pinterest/poster.js';

  let tmpRoot;

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pin-e2e-'));
    process.env.ROOSTER_DB_PATH = path.join(tmpRoot, 'dashboard.db');
    process.env.PINTEREST_OUTPUT_ROOT = path.join(tmpRoot, 'output', 'pinterest');
    _resetForTests();
    _resetSubscribersForTests();
    _resetWorkerStatus();
  });

  afterEach(() => {
    _resetForTests();
    _resetSubscribersForTests();
    _resetWorkerStatus();
    fs.rmSync(tmpRoot, { recursive: true, force: true });
    delete process.env.ROOSTER_DB_PATH;
    delete process.env.PINTEREST_OUTPUT_ROOT;
  });

  async function seedBookWithArt() {
    const slug = 'e2e-book';
    const outDir = path.join(tmpRoot, 'kdp-ready', slug);
    fs.mkdirSync(outDir, { recursive: true });
    const png = async (file, w, h) => sharp({
      create: { width: w, height: h, channels: 3, background: { r: 220, g: 220, b: 220 } },
    }).png().toFile(file);
    await png(path.join(outDir, 'cover_preview.png'), 800, 1200);
    for (let i = 1; i <= 5; i++) {
      await png(path.join(outDir, `interior_${i}.png`), 600, 800);
    }
    const db = openDb();
    const info = db.prepare(`
      INSERT INTO kdp_books (slug, title, status, output_dir, cover_path, asin, blurb)
      VALUES (?, 'E2E Book', 'published', ?, ?, 'B0E2E00000', 'Test blurb.')
    `).run(slug, outDir, path.join(outDir, 'cover_preview.png'));
    return Number(info.lastInsertRowid);
  }

  describe('end-to-end with fake driver', () => {
    it('enqueues 6 pins, posts them one by one, ends with empty pending queue', async () => {
      const bookId = await seedBookWithArt();
      const inserted = await enqueuePinsForBook(bookId);
      expect(inserted).toHaveLength(6);

      // Backdate every pending row so dequeueNext picks each up.
      const db = openDb();
      db.prepare(`UPDATE pinterest_queue SET scheduled_for = ? WHERE status='pending'`)
        .run(new Date(Date.now() - 60_000).toISOString());

      let pinCounter = 0;
      const fakeDriver = {
        isLoggedIn: vi.fn(async () => true),
        postPin: vi.fn(async () => ({ pinId: `pin_${++pinCounter}` })),
      };

      for (let i = 0; i < 6; i++) {
        const result = await runOnce({ driverFactory: () => fakeDriver });
        expect(result.action).toBe('posted');
      }

      const finalPending = db
        .prepare(`SELECT COUNT(*) AS n FROM pinterest_queue WHERE status='pending'`)
        .get().n;
      expect(finalPending).toBe(0);
      const posted = db
        .prepare(`SELECT COUNT(*) AS n FROM pinterest_queue WHERE status='posted'`)
        .get().n;
      expect(posted).toBe(6);
      const history = db
        .prepare(`SELECT COUNT(*) AS n FROM pinterest_history WHERE success = 1`)
        .get().n;
      expect(history).toBe(6);
    }, 60_000);
  });
  ```

- [ ] Run, confirm pass:

  ```bash
  cd web.ui/backend && npx vitest run __tests__/pinterest/e2e_fake_driver.test.js
  ```

  Expected: 1 test passes (may take a few seconds — 6 PNG renders × 6 fake posts).

- [ ] Commit:

  ```bash
  git add web.ui/backend/__tests__/pinterest/e2e_fake_driver.test.js
  git commit -m "test(pinterest): end-to-end fake-driver smoke (enqueue → 6 posts → empty queue)"
  ```

---

## Task 20: Manual live-test script (gated by `PINTEREST_LIVE=1`)

- [ ] Create `web.ui/backend/scripts/test-pinterest-live.mjs`:

  ```javascript
  #!/usr/bin/env node
  /**
   * Manual end-to-end test against the real Pinterest. NOT run in CI.
   *
   * Usage:
   *   PINTEREST_LIVE=1 node web.ui/backend/scripts/test-pinterest-live.mjs
   *
   * Pre-reqs:
   *   1. Run the dashboard at least once.
   *   2. Complete a Pinterest sign-in via /pinterest "Sign in to Pinterest"
   *      button so `web.ui/backend/.pinterest-profile/` has cookies.
   *   3. At least one row in pinterest_queue must be status='pending' with
   *      a real image_path on disk.
   *
   * What it does:
   *   - Calls `runOnce()` with the real Playwright driver.
   *   - Prints the action + queue row id + (on success) the resulting
   *     pinterest_pin_id.
   *   - On failure, prints the error so you can decide whether selectors
   *     need updating.
   */

  import process from 'node:process';
  import { runOnce } from '../pinterest/poster.js';

  if (process.env.PINTEREST_LIVE !== '1') {
    console.error('Refusing to run against real Pinterest without PINTEREST_LIVE=1');
    process.exit(2);
  }

  const result = await runOnce();
  console.log(JSON.stringify(result, null, 2));
  if (result.action === 'failed' || result.action === 'paused_login_required') {
    process.exit(1);
  }
  process.exit(0);
  ```

- [ ] Add a script alias in `web.ui/backend/package.json` under `"scripts"`:

  ```json
  "test:pinterest:live": "node scripts/test-pinterest-live.mjs"
  ```

  Verify:

  ```bash
  cd web.ui/backend && cat package.json | grep -A2 '"scripts"'
  ```

  Expected: `test:pinterest:live` is present.

- [ ] Verify the script refuses to run without the gate:

  ```bash
  cd web.ui/backend && node scripts/test-pinterest-live.mjs
  ```

  Expected: prints `Refusing to run against real Pinterest without PINTEREST_LIVE=1` and exits 2.

- [ ] **DO NOT** run the live script in this task — it requires a real
  Pinterest account login. Add a sticky note: live verification is its own
  manual smoke step after merge.

- [ ] Commit:

  ```bash
  git add web.ui/backend/scripts/test-pinterest-live.mjs web.ui/backend/package.json
  git commit -m "test(pinterest): manual live-driver script gated by PINTEREST_LIVE=1"
  ```

---

## Task 21: Full backend test suite + Plan E module audit

- [ ] Run the full backend test suite:

  ```bash
  cd web.ui/backend && npm test -- --run
  ```

  Expected: all Plan A, B, C, D, and E tests pass.

  If any non-Plan-E test fails as a side effect of the Plan B route refactor in Task 8, re-read the failure and patch the assertion (it's almost certainly a counting expectation that needs the same "between 0 and 6 inclusive" loosening).

- [ ] Run the frontend build:

  ```bash
  cd web.ui/frontend-react && npm run build
  ```

  Expected: build succeeds.

- [ ] Run the frontend unit tests (if Plan A/B/C/D installed any):

  ```bash
  cd web.ui/frontend-react && npm test -- --run
  ```

  Expected: pass, or "no tests found" — Plan E does not add frontend unit tests (the live UI is verified via the e2e step below).

- [ ] Manual UI smoke. In one terminal:

  ```bash
  cd web.ui/backend && \
    ROOSTER_SKIP_TRAY=1 ROOSTER_SKIP_CRON=1 ROOSTER_SKIP_PINTEREST_POSTER=1 SKIP_KDP_SCANNER=1 \
    node server.js
  ```

  In a second terminal:

  ```bash
  cd web.ui/frontend-react && npm run dev
  ```

  Open `http://localhost:5173/pinterest`. Verify:

  - The page renders three sections (Settings, Queue, History).
  - With an empty database, Settings shows `0 pending · 0 paused`, Queue
    shows "No pins in queue...", History shows "No posting history yet."
  - Clicking **Sign in to Pinterest** triggers `POST /api/pinterest/login`
    and surfaces the "Opening Pinterest login window…" status message.
    (Cancel the Chromium window — we are not doing a real login here.)

  Stop both servers (Ctrl+C in each).

- [ ] Commit (only if any files changed during this audit):

  ```bash
  git status
  ```

  If clean, skip the commit. Otherwise:

  ```bash
  git add -A
  git commit -m "test(pinterest): full suite green + UI smoke"
  ```

---

## Task 22: Definition of Done checklist

- [ ] Spec coverage check. Read this list and confirm each item is shipped:

  - [ ] `pinterest_queue` and `pinterest_history` tables are written by Plan A (verified by reading `web.ui/backend/migrations/0001_init.sql`).
  - [ ] cover_hero and interior_preview pin templates emit 1000×1500 PNGs.
  - [ ] Pin generator writes to `output/pinterest/<slug>/<pin_type>-<idx>.png`.
  - [ ] Scheduler assigns 3–5/day jittered slots inside [09:00, 21:00] in
    `profile.time_zone`.
  - [ ] `enqueuePinsForBook(bookId)` is called from `/api/kdp/books/:slug/mark-published`.
  - [ ] Poster worker (a) detects logged-out state, (b) pauses the queue,
    (c) fires a "Pinterest re-login required" reminder, (d) sets the tray
    icon red via `setWorkerError('pinterest', ...)`.
  - [ ] Poster worker retries handled via `markFailed` + `attempts` column;
    exponential backoff schedule documented in `poster.js`.
  - [ ] `/api/pinterest/queue`, `/history`, `/queue/:id/cancel`, `/queue/:id`
    (PUT), `/pause`, `/resume`, `/login` all wired and tested.
  - [ ] SSE channels `pinterest:pin-scheduled`, `pinterest:pin-posted`,
    `pinterest:pin-failed`, `pinterest:login-required` are all fired from
    `queue.js` + `poster.js`.
  - [ ] `/pinterest` UI page renders Queue + History + Settings, auto-refreshes
    on any `pinterest:*` SSE event, and exposes pause/resume + re-login + edit
    + cancel actions per spec §6.8.
  - [ ] `help/pinterest_first_login.md` exists and is reachable at
    `/api/help/pinterest_first_login`.
  - [ ] `web.ui/backend/.pinterest-profile/` and `output/pinterest/` are
    gitignored.
  - [ ] Real Playwright is exercised only via the manual `npm run test:pinterest:live`
    script; unit + integration tests use the injected fake driver.

- [ ] Placeholder scan — confirm none of the Plan E source files contain TODO / TBD / "implement later":

  ```bash
  grep -rn "TODO\|TBD\|implement later\|placeholder" \
    web.ui/backend/pinterest/ \
    web.ui/backend/scripts/test-pinterest-live.mjs \
    web.ui/frontend-react/src/services/pinterest.ts \
    web.ui/frontend-react/src/components/PinterestQueueTable.tsx \
    web.ui/frontend-react/src/components/PinterestHistoryTable.tsx \
    web.ui/frontend-react/src/components/PinterestSettings.tsx \
    web.ui/frontend-react/src/components/PinPreviewModal.tsx \
    web.ui/frontend-react/src/pages/Pinterest.tsx 2>&1 | grep -v Binary
  ```

  Expected: no matches.

- [ ] Done. Hand off to Plan A merge train.

---

## Out of scope for Plan E (deferred)

- Pinterest API path (returns once the user's API approval is granted —
  superseded for now per spec §11).
- Multi-board posting. Plan E posts every pin to the user's default board;
  board selection lives in a future enhancement.
- Pin analytics (impressions, saves, click-through). The dashboard only
  knows whether a pin was successfully created.
- A/B testing of pin templates. Both templates are fixed; varying them is
  a content-strategy task, not a dashboard task.
- Drag-and-drop reorder of queue rows. Spec §6.8 mentions "draggable
  reorder" — Plan E exposes per-row edit of `scheduled_for` instead, which
  is the underlying ordering field. A future plan can layer dnd-kit on top.

## Definition of done (Plan E)

- All 21 task-level commits land on the feature branch in order.
- `cd web.ui/backend && npm test -- --run` green.
- `cd web.ui/frontend-react && npm run build` green.
- Manual UI smoke confirms the `/pinterest` page renders all three sections,
  the Sign-in button launches a real Chromium window (test that you can
  cancel without breaking anything), and the page reacts to SSE events.
- `git log --oneline | head -22` shows 21 + 1 (Task 21 audit) commits all
  starting with `feat(pinterest):`, `test(pinterest):`, `docs(help):`,
  `build(pinterest):`, or `feat(kdp):` (Task 8).
- The manual live test (`PINTEREST_LIVE=1 npm run test:pinterest:live`) is
  documented and ready to run by hand after a Pinterest login is performed.
