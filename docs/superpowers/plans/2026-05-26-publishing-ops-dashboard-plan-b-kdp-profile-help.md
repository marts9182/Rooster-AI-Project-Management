# Publishing Ops Dashboard — Plan B: KDP + Profile + Help

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Prerequisites:** Plan A merged. `db.js`, `events.js`, `workerStatus.js`, and the React Router shell with empty page components must exist.

**Goal:** Stand up the KDP catalog (auto-discover + checkbox publish + interior previews), the Profile editor, and the in-app Help drawer infrastructure. After this plan ships, the user can see every built/in-review/published KDP book, mark books published with a one-paste ASIN flow, and edit their profile.

**Architecture:** `kdp/` module scans the local `kdp-ready/` directory on a 10-min interval and upserts rows; routes expose CRUD + the mark-in-review/mark-published transitions, with the published transition fanning out to reminders + `pinterest_queue` rows. Profile is a single-row read/write. Help is a thin layer serving markdown from disk via a reusable drawer component.

**Tech Stack:** Express, better-sqlite3, pdf2pic, Vitest, supertest, React 19, react-markdown.

**Spec reference:** [`docs/superpowers/specs/2026-05-26-publishing-ops-dashboard-design.md`](../specs/2026-05-26-publishing-ops-dashboard-design.md)

---

## Pre-flight context (read once)

This plan extends `web.ui/backend/` (Node ESM, JSDoc + jsconfig.json) and `web.ui/frontend-react/` (React 19 + TypeScript + Vite). All paths in this plan are repo-relative unless otherwise noted; the repo root is `C:/Sandbox/AIProjectManagement/Rooster-AI-Project-Management`.

**Run backend tests with:**
```bash
cd web.ui/backend
npm test                                   # full vitest run
npx vitest run __tests__/kdp/parser.test.js  # one file
```

**Run frontend tests with:**
```bash
cd web.ui/frontend-react
npm test                                   # vitest
npx playwright test tests/e2e/kdp.spec.ts  # one e2e
```

**Plan A is assumed to have delivered:**

- `web.ui/backend/db.js` — `export function openDb(): import('better-sqlite3').Database`. Opens `data/dashboard.db` (WAL), runs migrations. Tests may pass `ROOSTER_DB_PATH` env var to point at a temp file.
- `web.ui/backend/events.js` — `export function recordEvent(kind: string, payload: object): void` (INSERTs into `events` AND broadcasts via subscribers — there is no separate broadcast export); `export function subscribe(fn): () => void`; `export function replayRecent(n): DashboardEvent[]` for SSE on-connect replay.
- `web.ui/backend/workerStatus.js` — exports the procedural functions `setWorkerHeartbeat(worker: string)`, `setWorkerError(worker: string, message: string)`, `getAllStatuses()`, and `trayColor()`. Workers call these directly with their own name string (no factory). The map is mounted at `/api/status`.
- SQLite tables `kdp_books`, `profile`, `reminders`, `pinterest_queue`, `events` already created (schema in spec §4). Plan A seeds `profile` row id=1 with NULLs.
- `web.ui/frontend-react/src/pages/` has empty exports `KdpCatalog`, `KdpDetail`, `Profile`, `HelpIndex` wired into React Router at `/kdp`, `/kdp/:slug`, `/profile`, `/help`.
- `web.ui/frontend-react/src/hooks/useSse.ts` — `useSse(channelPrefix: string, handler: (evt: {kind:string, payload:any}) => void): void`.
- `vitest.config.js` exists in both packages; Playwright configured under `web.ui/frontend-react/playwright.config.ts`.

**Verify before starting:**
```bash
node -e "import('./web.ui/backend/db.js').then(({openDb})=>{const db=openDb();console.log(db.prepare(\"SELECT name FROM sqlite_master WHERE type='table'\").all());});"
```
Expected output includes `kdp_books`, `profile`, `reminders`, `pinterest_queue`, `events`.

**KDP source assets parsed by this plan:**
- `projects/kdp-puzzle-press/output/kdp-ready/<slug>/listing.md` — title, subtitle, blurb (Section 5 HTML), price, BISAC, trim.
- `projects/kdp-puzzle-press/output/kdp-ready/<slug>/metadata.json` — structured fields. Source of truth where overlapping with `listing.md`.
- `projects/kdp-puzzle-press/output/kdp-ready/<slug>/interior.pdf` — page-count + preview rendering.
- `projects/kdp-puzzle-press/output/kdp-ready/<slug>/cover.pdf` — cover preview rendering.

The path to the kdp-ready root is configurable via env `KDP_READY_DIR`; default is `<repoRoot>/projects/kdp-puzzle-press/output/kdp-ready`.

---

## File structure

**New backend source files:**
- `web.ui/backend/kdp/parser.js` — pure functions to parse `listing.md` + `metadata.json`.
- `web.ui/backend/kdp/scanner.js` — directory scanner + 10-min worker registration.
- `web.ui/backend/kdp/routes.js` — Express router mounted at `/api/kdp`.
- `web.ui/backend/kdp/previewRenderer.js` — pdf2pic wrapper, 8-page interior preview cache.
- `web.ui/backend/kdp/pinterestPlanner.js` — computes 6 pin rows + jittered schedules for `mark-published`.
- `web.ui/backend/kdp/index.js` — re-exports + `installKdpModule(app)` mount helper.
- `web.ui/backend/profile/routes.js` — Express router mounted at `/api/profile`.
- `web.ui/backend/profile/index.js` — `installProfileModule(app)`.
- `web.ui/backend/help/routes.js` — Express router mounted at `/api/help`.
- `web.ui/backend/help/index.js` — `installHelpModule(app)`.
- `web.ui/backend/help/asin.md`, `kdp_author_url.md`, `etsy_shop_url.md`, `pinterest_url.md`, `gmail_app_password.md`, `bisac_code.md`, `release_date.md` — markdown content.
- `web.ui/backend/help/screenshots/.gitkeep` — placeholder.

**New backend test files:**
- `web.ui/backend/__tests__/kdp/parser.test.js`
- `web.ui/backend/__tests__/kdp/scanner.test.js`
- `web.ui/backend/__tests__/kdp/routes.test.js`
- `web.ui/backend/__tests__/kdp/previewRenderer.test.js`
- `web.ui/backend/__tests__/kdp/pinterestPlanner.test.js`
- `web.ui/backend/__tests__/profile/routes.test.js`
- `web.ui/backend/__tests__/help/routes.test.js`

**New frontend source files:**
- `web.ui/frontend-react/src/pages/KdpCatalog.tsx` — replaces empty stub.
- `web.ui/frontend-react/src/pages/KdpDetail.tsx` — replaces empty stub.
- `web.ui/frontend-react/src/pages/Profile.tsx` — replaces empty stub.
- `web.ui/frontend-react/src/pages/HelpIndex.tsx` — replaces empty stub.
- `web.ui/frontend-react/src/components/HelpDrawer.tsx`
- `web.ui/frontend-react/src/components/HelpIcon.tsx`
- `web.ui/frontend-react/src/components/MarkPublishedModal.tsx`
- `web.ui/frontend-react/src/api/kdp.ts` — typed fetch wrappers.
- `web.ui/frontend-react/src/api/profile.ts`
- `web.ui/frontend-react/src/api/help.ts`

**New frontend test files:**
- `web.ui/frontend-react/src/__tests__/KdpCatalog.test.tsx`
- `web.ui/frontend-react/src/__tests__/KdpDetail.test.tsx`
- `web.ui/frontend-react/src/__tests__/Profile.test.tsx`
- `web.ui/frontend-react/src/__tests__/HelpDrawer.test.tsx`
- `web.ui/frontend-react/tests/e2e/kdp-publish.spec.ts`
- `web.ui/frontend-react/tests/e2e/profile.spec.ts`

**Modified files:**
- `web.ui/backend/server.js` — mount `installKdpModule(app)`, `installProfileModule(app)`, `installHelpModule(app)`, start scanner worker.
- `web.ui/backend/package.json` — add `pdf2pic`, `gray-matter`, `marked`, `multer`-not-needed; only `pdf2pic`, `gray-matter`, `marked`.
- `web.ui/frontend-react/package.json` — add `react-markdown`, `react-router-dom` if not present, `@testing-library/react`, `@testing-library/user-event`, `jsdom` (devDeps).

---

## Task 1: Add npm dependencies + scaffold directories

- [ ] Verify current backend deps:
  ```bash
  cd web.ui/backend && cat package.json
  ```
  Expected: existing deps include `express`, `dotenv`. No `pdf2pic`, no `gray-matter`, no `marked`.

- [ ] Install backend deps:
  ```bash
  cd web.ui/backend
  npm install pdf2pic@^3.1.3 gray-matter@^4.0.3 marked@^14.1.3
  ```
  Expected: `package.json` `dependencies` now lists those three. `node_modules/pdf2pic/package.json` exists.

- [ ] Verify current frontend deps:
  ```bash
  cd web.ui/frontend-react && cat package.json
  ```
  Expected: existing deps include `react@^19.2.0`. `react-router-dom`, `react-markdown` may or may not be there from Plan A.

- [ ] Install frontend deps (skip any already present):
  ```bash
  cd web.ui/frontend-react
  npm install react-markdown@^9.0.1
  npm install --save-dev @testing-library/react@^16.1.0 @testing-library/user-event@^14.5.2 @testing-library/jest-dom@^6.6.3 jsdom@^25.0.1
  ```
  Expected: those packages appear in `package.json`.

- [ ] Create directories:
  ```bash
  mkdir -p web.ui/backend/kdp web.ui/backend/profile web.ui/backend/help/screenshots
  mkdir -p web.ui/backend/__tests__/kdp web.ui/backend/__tests__/profile web.ui/backend/__tests__/help
  mkdir -p web.ui/frontend-react/src/components web.ui/frontend-react/src/api web.ui/frontend-react/src/__tests__ web.ui/frontend-react/tests/e2e
  echo "" > web.ui/backend/help/screenshots/.gitkeep
  ```
  Expected: `ls web.ui/backend/kdp` succeeds and prints nothing (empty dir).

- [ ] Commit:
  ```bash
  git add web.ui/backend/package.json web.ui/backend/package-lock.json \
          web.ui/frontend-react/package.json web.ui/frontend-react/package-lock.json \
          web.ui/backend/help/screenshots/.gitkeep
  git commit -m "chore(deps): add pdf2pic, gray-matter, marked, react-markdown, testing-library"
  ```

---

## Task 2: KDP parser — pure parse of `listing.md` + `metadata.json`

- [ ] Write the failing test at `web.ui/backend/__tests__/kdp/parser.test.js`:

  ```javascript
  import { describe, it, expect } from 'vitest';
  import { parseMetadataJson, parseListingMd, mergeBookFields } from '../../kdp/parser.js';
  import fs from 'node:fs';
  import path from 'node:path';

  const FIXTURE_DIR = path.resolve(
    process.cwd(),
    '../../projects/kdp-puzzle-press/output/kdp-ready/kakuro-quiet-minds'
  );

  describe('parseMetadataJson', () => {
    it('extracts core fields from a real metadata.json', () => {
      const raw = fs.readFileSync(path.join(FIXTURE_DIR, 'metadata.json'), 'utf8');
      const result = parseMetadataJson(raw);
      expect(result.slug).toBe('kakuro-quiet-minds');
      expect(result.title).toBe('Kakuro for Quiet Minds');
      expect(result.subtitle).toMatch(/Cross-Sum Puzzles/);
      expect(result.trim_size).toBe('8.5x11');
      expect(result.page_count).toBe(180);
      expect(result.price_usd).toBe(9.99);
    });

    it('returns null fields when keys are missing', () => {
      const result = parseMetadataJson('{"book_id":"x","title":"T"}');
      expect(result.slug).toBe('x');
      expect(result.title).toBe('T');
      expect(result.subtitle).toBeNull();
      expect(result.page_count).toBeNull();
      expect(result.price_usd).toBeNull();
    });

    it('throws on invalid JSON', () => {
      expect(() => parseMetadataJson('{not json')).toThrow(/JSON/);
    });
  });

  describe('parseListingMd', () => {
    it('extracts blurb from Section 5 HTML block of a real listing.md', () => {
      const raw = fs.readFileSync(path.join(FIXTURE_DIR, 'listing.md'), 'utf8');
      const result = parseListingMd(raw);
      expect(result.blurb).toMatch(/Kakuro is the elegant cousin of Sudoku/);
      expect(result.title).toBe('Kakuro for Quiet Minds');
    });

    it('returns null blurb when no Section 5 fenced block', () => {
      const result = parseListingMd('# Title\n\nNo description here.');
      expect(result.title).toBe('Title');
      expect(result.blurb).toBeNull();
    });
  });

  describe('mergeBookFields', () => {
    it('prefers metadata fields over listing fields where both present', () => {
      const meta = { slug: 'a', title: 'Meta T', subtitle: null, page_count: 100, price_usd: 9.99, trim_size: '6x9' };
      const listing = { title: 'Listing T', blurb: 'B', subtitle: 'Listing S' };
      const merged = mergeBookFields(meta, listing);
      expect(merged.title).toBe('Meta T');
      expect(merged.subtitle).toBe('Listing S');
      expect(merged.blurb).toBe('B');
      expect(merged.page_count).toBe(100);
    });
  });
  ```

- [ ] Run the test, confirm it fails because `parser.js` does not exist:
  ```bash
  cd web.ui/backend && npx vitest run __tests__/kdp/parser.test.js
  ```
  Expected: `FAIL` with "Cannot find module '../../kdp/parser.js'".

- [ ] Implement `web.ui/backend/kdp/parser.js`:

  ```javascript
  /**
   * Pure parsers for KDP `listing.md` + `metadata.json`. No I/O.
   * @module kdp/parser
   */

  /**
   * @typedef {Object} ParsedMetadata
   * @property {string} slug
   * @property {string} title
   * @property {string|null} subtitle
   * @property {string|null} trim_size
   * @property {number|null} page_count
   * @property {number|null} price_usd
   */

  /**
   * @typedef {Object} ParsedListing
   * @property {string|null} title
   * @property {string|null} subtitle
   * @property {string|null} blurb
   */

  /**
   * @typedef {Object} MergedBookFields
   * @property {string} slug
   * @property {string} title
   * @property {string|null} subtitle
   * @property {string|null} blurb
   * @property {string|null} trim_size
   * @property {number|null} page_count
   * @property {number|null} price_usd
   */

  /**
   * Parse a metadata.json blob into a normalized shape.
   * @param {string} raw - File contents of metadata.json.
   * @returns {ParsedMetadata}
   */
  export function parseMetadataJson(raw) {
    let obj;
    try {
      obj = JSON.parse(raw);
    } catch (err) {
      throw new Error(`Invalid JSON in metadata.json: ${err.message}`);
    }
    const priceUsd =
      obj?.pricing?.list_prices?.amazon_com_USD ??
      obj?.pricing?.list_prices?.USD ??
      null;
    return {
      slug: obj.book_id ?? null,
      title: obj.title ?? null,
      subtitle: obj.subtitle ?? null,
      trim_size: obj.trim_size ?? null,
      page_count: typeof obj.page_count_target === 'number' ? obj.page_count_target : null,
      price_usd: typeof priceUsd === 'number' ? priceUsd : null,
    };
  }

  /**
   * Parse listing.md, extracting H1 title and the Section 5 HTML blurb block.
   * @param {string} raw - File contents of listing.md.
   * @returns {ParsedListing}
   */
  export function parseListingMd(raw) {
    const titleMatch = raw.match(/^#\s+(.+?)\s*$/m);
    const title = titleMatch ? titleMatch[1].trim() : null;

    let blurb = null;
    // Section 5 is "## 5. Description (HTML, ...)" followed by ```html ... ```
    const section5Match = raw.match(/##\s*5\.[^\n]*\n+```html\n([\s\S]*?)\n```/);
    if (section5Match) {
      blurb = section5Match[1].trim();
    }

    let subtitle = null;
    const subtitleMatch = raw.match(/##\s*2\.\s*Subtitle\s*\n+```\n([\s\S]*?)\n```/);
    if (subtitleMatch) {
      subtitle = subtitleMatch[1].trim();
    }

    return { title, subtitle, blurb };
  }

  /**
   * Merge metadata (primary) with listing.md (fallback) into one row shape.
   * @param {ParsedMetadata} meta
   * @param {ParsedListing} listing
   * @returns {MergedBookFields}
   */
  export function mergeBookFields(meta, listing) {
    return {
      slug: meta.slug,
      title: meta.title ?? listing.title ?? meta.slug,
      subtitle: meta.subtitle ?? listing.subtitle ?? null,
      blurb: listing.blurb ?? null,
      trim_size: meta.trim_size ?? null,
      page_count: meta.page_count ?? null,
      price_usd: meta.price_usd ?? null,
    };
  }
  ```

- [ ] Re-run the test, confirm pass:
  ```bash
  cd web.ui/backend && npx vitest run __tests__/kdp/parser.test.js
  ```
  Expected: `PASS  __tests__/kdp/parser.test.js`, all describe blocks green.

- [ ] Commit:
  ```bash
  git add web.ui/backend/kdp/parser.js web.ui/backend/__tests__/kdp/parser.test.js
  git commit -m "feat(kdp): pure parser for listing.md + metadata.json"
  ```

---

## Task 3: KDP scanner — directory walk + upsert + worker registration

- [ ] Write `web.ui/backend/__tests__/kdp/scanner.test.js`:

  ```javascript
  import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
  import fs from 'node:fs';
  import path from 'node:path';
  import os from 'node:os';
  import { scanOnce } from '../../kdp/scanner.js';

  let tmpRoot;
  let tmpDb;

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kdp-scan-'));
    tmpDb = path.join(tmpRoot, 'test.db');
    process.env.DASHBOARD_DB_PATH = tmpDb;
    process.env.KDP_READY_DIR = path.join(tmpRoot, 'kdp-ready');
    fs.mkdirSync(process.env.KDP_READY_DIR, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
    delete process.env.DASHBOARD_DB_PATH;
    delete process.env.KDP_READY_DIR;
    vi.resetModules();
  });

  function seedBook(slug, title) {
    const dir = path.join(process.env.KDP_READY_DIR, slug);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, 'metadata.json'),
      JSON.stringify({
        book_id: slug,
        title,
        subtitle: 'Sub',
        trim_size: '8.5x11',
        page_count_target: 120,
        pricing: { list_prices: { amazon_com_USD: 9.99 } },
      })
    );
    fs.writeFileSync(
      path.join(dir, 'listing.md'),
      `# ${title}\n\n## 5. Description (HTML, <= 4000 chars)\n\n\`\`\`html\n<p>The blurb for ${title}.</p>\n\`\`\`\n`
    );
  }

  describe('scanOnce', () => {
    it('inserts new built rows for each subdir with metadata.json', async () => {
      seedBook('book-a', 'Book A');
      seedBook('book-b', 'Book B');

      const { openDb } = await import('../../db.js');
      const db = openDb();
      const result = await scanOnce();
      expect(result.inserted).toBe(2);
      expect(result.updated).toBe(0);
      const rows = db.prepare('SELECT slug, title, status FROM kdp_books ORDER BY slug').all();
      expect(rows).toEqual([
        { slug: 'book-a', title: 'Book A', status: 'built' },
        { slug: 'book-b', title: 'Book B', status: 'built' },
      ]);
    });

    it('updates title when listing.md changes, but does not overwrite status', async () => {
      seedBook('book-a', 'Book A');
      const { openDb } = await import('../../db.js');
      const db = openDb();
      await scanOnce();
      db.prepare("UPDATE kdp_books SET status='in_review' WHERE slug='book-a'").run();
      seedBook('book-a', 'Book A v2');
      const result = await scanOnce();
      expect(result.updated).toBe(1);
      const row = db.prepare('SELECT title, status FROM kdp_books WHERE slug=?').get('book-a');
      expect(row.title).toBe('Book A v2');
      expect(row.status).toBe('in_review');
    });

    it('skips subdirs without metadata.json silently', async () => {
      fs.mkdirSync(path.join(process.env.KDP_READY_DIR, 'incomplete'), { recursive: true });
      const result = await scanOnce();
      expect(result.inserted).toBe(0);
      expect(result.skipped).toBe(1);
    });

    it('emits kdp:new-book event on first insert', async () => {
      const events = [];
      vi.doMock('../../events.js', () => ({
        recordEvent: (kind, payload) => events.push({ kind, payload }),
      }));
      vi.resetModules();
      const { scanOnce: scanFresh } = await import('../../kdp/scanner.js');
      seedBook('book-x', 'Book X');
      await scanFresh();
      expect(events.find((e) => e.kind === 'kdp:new-book')).toBeTruthy();
    });
  });
  ```

- [ ] Run, confirm fail:
  ```bash
  cd web.ui/backend && npx vitest run __tests__/kdp/scanner.test.js
  ```
  Expected: `Cannot find module '../../kdp/scanner.js'`.

- [ ] Implement `web.ui/backend/kdp/scanner.js`:

  ```javascript
  /**
   * KDP scanner — walks projects/kdp-puzzle-press/output/kdp-ready/<slug>/
   * and upserts kdp_books rows.
   * @module kdp/scanner
   */
  import fs from 'node:fs';
  import path from 'node:path';
  import { openDb } from '../db.js';
  import { recordEvent } from '../events.js';
  import { setWorkerHeartbeat, setWorkerError } from '../workerStatus.js';
  import { parseListingMd, parseMetadataJson, mergeBookFields } from './parser.js';

  const SCAN_INTERVAL_MS = 10 * 60 * 1000;

  /**
   * Resolves the kdp-ready root.
   * @returns {string}
   */
  function kdpReadyDir() {
    if (process.env.KDP_READY_DIR) return process.env.KDP_READY_DIR;
    return path.resolve(
      process.cwd(),
      '../../projects/kdp-puzzle-press/output/kdp-ready'
    );
  }

  /**
   * @returns {Promise<{inserted:number, updated:number, skipped:number}>}
   */
  export async function scanOnce() {
    const root = kdpReadyDir();
    let inserted = 0;
    let updated = 0;
    let skipped = 0;

    if (!fs.existsSync(root)) {
      return { inserted, updated, skipped };
    }

    const db = openDb();
    const entries = fs.readdirSync(root, { withFileTypes: true })
      .filter((e) => e.isDirectory());

    for (const entry of entries) {
      const dirAbs = path.join(root, entry.name);
      const metaPath = path.join(dirAbs, 'metadata.json');
      const listingPath = path.join(dirAbs, 'listing.md');
      const coverPath = path.join(dirAbs, 'cover.pdf');

      if (!fs.existsSync(metaPath)) {
        skipped++;
        continue;
      }

      let meta;
      let listing;
      try {
        meta = parseMetadataJson(fs.readFileSync(metaPath, 'utf8'));
      } catch (_err) {
        skipped++;
        continue;
      }
      try {
        listing = fs.existsSync(listingPath)
          ? parseListingMd(fs.readFileSync(listingPath, 'utf8'))
          : { title: null, subtitle: null, blurb: null };
      } catch (_err) {
        listing = { title: null, subtitle: null, blurb: null };
      }

      const merged = mergeBookFields(meta, listing);
      const slug = merged.slug ?? entry.name;
      const coverRel = fs.existsSync(coverPath)
        ? path.relative(process.cwd(), coverPath)
        : null;

      const existing = db.prepare('SELECT id, status FROM kdp_books WHERE slug = ?').get(slug);

      if (!existing) {
        db.prepare(`
          INSERT INTO kdp_books
            (slug, title, subtitle, status, page_count, trim_size, price_usd, blurb, cover_path, output_dir)
          VALUES (?, ?, ?, 'built', ?, ?, ?, ?, ?, ?)
        `).run(
          slug,
          merged.title,
          merged.subtitle,
          merged.page_count,
          merged.trim_size,
          merged.price_usd,
          merged.blurb,
          coverRel,
          dirAbs
        );
        inserted++;
        recordEvent('kdp:new-book', { slug, title: merged.title });
      } else {
        db.prepare(`
          UPDATE kdp_books
             SET title = ?, subtitle = ?, page_count = ?, trim_size = ?,
                 price_usd = ?, blurb = ?, cover_path = ?, output_dir = ?,
                 updated_at = datetime('now')
           WHERE slug = ?
        `).run(
          merged.title,
          merged.subtitle,
          merged.page_count,
          merged.trim_size,
          merged.price_usd,
          merged.blurb,
          coverRel,
          dirAbs,
          slug
        );
        updated++;
      }
    }

    return { inserted, updated, skipped };
  }

  /**
   * Boot the scanner worker — runs immediately, then every 10 minutes.
   * @returns {{stop: () => void}}
   */
  export function startScannerWorker() {
    let timer = null;
    let stopped = false;

    async function tick() {
      try {
        await scanOnce();
        setWorkerHeartbeat('kdp.scanner');
      } catch (err) {
        setWorkerError('kdp.scanner', err.message);
      }
      if (!stopped) {
        timer = setTimeout(tick, SCAN_INTERVAL_MS);
      }
    }

    tick();

    return {
      stop() {
        stopped = true;
        if (timer) clearTimeout(timer);
      },
    };
  }
  ```

- [ ] Re-run scanner tests, confirm pass:
  ```bash
  cd web.ui/backend && npx vitest run __tests__/kdp/scanner.test.js
  ```
  Expected: 4 tests pass.

- [ ] Commit:
  ```bash
  git add web.ui/backend/kdp/scanner.js web.ui/backend/__tests__/kdp/scanner.test.js
  git commit -m "feat(kdp): scanner module reading output/kdp-ready/ into kdp_books"
  ```

---

## Task 4: Pinterest planner — compute 6 queue rows for mark-published

- [ ] Write `web.ui/backend/__tests__/kdp/pinterestPlanner.test.js`:

  ```javascript
  import { describe, it, expect } from 'vitest';
  import { planSixPinsForBook } from '../../kdp/pinterestPlanner.js';

  describe('planSixPinsForBook', () => {
    const book = {
      id: 7,
      slug: 'kakuro-quiet-minds',
      title: 'Kakuro for Quiet Minds',
      asin: 'B0ABCDEFG1',
      blurb: 'Kakuro is the elegant cousin of Sudoku',
    };

    it('returns exactly 6 pin rows', () => {
      const rows = planSixPinsForBook(book, new Date('2026-05-26T10:00:00Z'));
      expect(rows).toHaveLength(6);
    });

    it('produces one cover_hero and five interior_preview rows', () => {
      const rows = planSixPinsForBook(book, new Date('2026-05-26T10:00:00Z'));
      const covers = rows.filter((r) => r.pin_type === 'cover_hero');
      const interiors = rows.filter((r) => r.pin_type === 'interior_preview');
      expect(covers).toHaveLength(1);
      expect(interiors).toHaveLength(5);
    });

    it('schedules pins across the next 7 days within 09:00-21:00 local', () => {
      const start = new Date('2026-05-26T10:00:00Z');
      const rows = planSixPinsForBook(book, start);
      const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
      for (const row of rows) {
        const sched = new Date(row.scheduled_for);
        const offset = sched.getTime() - start.getTime();
        expect(offset).toBeGreaterThanOrEqual(0);
        expect(offset).toBeLessThanOrEqual(sevenDaysMs);
        const hour = sched.getUTCHours();
        expect(hour).toBeGreaterThanOrEqual(9);
        expect(hour).toBeLessThanOrEqual(21);
      }
    });

    it('builds amazon link from ASIN', () => {
      const rows = planSixPinsForBook(book, new Date('2026-05-26T10:00:00Z'));
      for (const row of rows) {
        expect(row.link_url).toBe('https://www.amazon.com/dp/B0ABCDEFG1');
        expect(row.kdp_book_id).toBe(7);
        expect(row.title).toContain('Kakuro');
      }
    });
  });
  ```

- [ ] Run, confirm fail:
  ```bash
  cd web.ui/backend && npx vitest run __tests__/kdp/pinterestPlanner.test.js
  ```
  Expected: module not found.

- [ ] Implement `web.ui/backend/kdp/pinterestPlanner.js`:

  ```javascript
  /**
   * Computes the 6-pin queue rows fired when a book is marked published.
   * @module kdp/pinterestPlanner
   */

  /**
   * @typedef {Object} BookForPlanning
   * @property {number} id
   * @property {string} slug
   * @property {string} title
   * @property {string} asin
   * @property {string|null} [blurb]
   */

  /**
   * @typedef {Object} PinQueueRow
   * @property {number} kdp_book_id
   * @property {'cover_hero'|'interior_preview'} pin_type
   * @property {string} image_path
   * @property {string} title
   * @property {string} description
   * @property {string} link_url
   * @property {string} scheduled_for - ISO datetime
   */

  /**
   * Plan exactly 6 Pinterest pins for a freshly published book.
   * The poster (Plan E) reads image_path off disk; here we just declare the
   * intended paths under data/cache/pins/<slug>/.
   *
   * @param {BookForPlanning} book
   * @param {Date} fromDate - "now" anchor; first pin schedules ~1h after this.
   * @returns {PinQueueRow[]}
   */
  export function planSixPinsForBook(book, fromDate) {
    const link = `https://www.amazon.com/dp/${book.asin}`;
    const baseTitle = book.title;
    const baseDesc = book.blurb
      ? book.blurb.replace(/<[^>]+>/g, '').slice(0, 480)
      : `${baseTitle} — available now on Amazon.`;
    const slug = book.slug;
    const rows = [];

    const pinSpecs = [
      { pin_type: 'cover_hero', image: 'cover_hero.png', title: baseTitle },
      { pin_type: 'interior_preview', image: 'interior_01.png', title: `Inside ${baseTitle}: a peek` },
      { pin_type: 'interior_preview', image: 'interior_02.png', title: `${baseTitle} — sample pages` },
      { pin_type: 'interior_preview', image: 'interior_03.png', title: `${baseTitle} — large-print layout` },
      { pin_type: 'interior_preview', image: 'interior_04.png', title: `${baseTitle} — what's inside` },
      { pin_type: 'interior_preview', image: 'interior_05.png', title: `${baseTitle} — answer key & extras` },
    ];

    for (let i = 0; i < pinSpecs.length; i++) {
      const spec = pinSpecs[i];
      const dayOffset = i + 1; // day 1..6 in next 7 days
      const slotHourLocal = 9 + ((i * 2) % 12); // 9, 11, 13, 15, 17, 19
      const sched = new Date(fromDate);
      sched.setUTCDate(sched.getUTCDate() + dayOffset);
      sched.setUTCHours(slotHourLocal, (i * 7) % 60, 0, 0);

      rows.push({
        kdp_book_id: book.id,
        pin_type: spec.pin_type,
        image_path: `data/cache/pins/${slug}/${spec.image}`,
        title: spec.title,
        description: baseDesc,
        link_url: link,
        scheduled_for: sched.toISOString(),
      });
    }

    return rows;
  }
  ```

- [ ] Re-run, confirm pass:
  ```bash
  cd web.ui/backend && npx vitest run __tests__/kdp/pinterestPlanner.test.js
  ```
  Expected: 4 tests pass.

- [ ] Commit:
  ```bash
  git add web.ui/backend/kdp/pinterestPlanner.js web.ui/backend/__tests__/kdp/pinterestPlanner.test.js
  git commit -m "feat(kdp): pinterest planner produces 6 queue rows scheduled across 7 days"
  ```

---

## Task 5: Preview renderer — interior PDF to 8 cached PNGs via pdf2pic

- [ ] Write `web.ui/backend/__tests__/kdp/previewRenderer.test.js`:

  ```javascript
  import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
  import fs from 'node:fs';
  import path from 'node:path';
  import os from 'node:os';

  let tmpRoot;

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'preview-'));
    process.env.PREVIEW_CACHE_DIR = path.join(tmpRoot, 'cache', 'previews');
  });

  afterEach(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
    delete process.env.PREVIEW_CACHE_DIR;
    vi.resetModules();
  });

  describe('renderInteriorPreview', () => {
    it('creates a cache dir and writes 8 PNGs when none exist', async () => {
      vi.doMock('pdf2pic', () => ({
        fromPath: () => ({
          bulk: async (count) => {
            const dir = path.join(process.env.PREVIEW_CACHE_DIR, 'sample-slug');
            fs.mkdirSync(dir, { recursive: true });
            const arr = [];
            for (let i = 1; i <= Math.abs(count === -1 ? 8 : count); i++) {
              const p = path.join(dir, `interior.${i}.png`);
              fs.writeFileSync(p, Buffer.from([0x89, 0x50, 0x4e, 0x47]));
              arr.push({ path: p, page: i });
            }
            return arr;
          },
        }),
      }));
      const { renderInteriorPreview } = await import('../../kdp/previewRenderer.js');
      const fakeInteriorPdf = path.join(tmpRoot, 'interior.pdf');
      fs.writeFileSync(fakeInteriorPdf, 'fake-pdf');
      const result = await renderInteriorPreview('sample-slug', fakeInteriorPdf);
      expect(result.images.length).toBe(8);
      for (const p of result.images) {
        expect(fs.existsSync(p)).toBe(true);
      }
    });

    it('returns cached paths without re-rendering on second call', async () => {
      const calls = { n: 0 };
      vi.doMock('pdf2pic', () => ({
        fromPath: () => ({
          bulk: async () => {
            calls.n++;
            const dir = path.join(process.env.PREVIEW_CACHE_DIR, 'sample-slug');
            fs.mkdirSync(dir, { recursive: true });
            const arr = [];
            for (let i = 1; i <= 8; i++) {
              const p = path.join(dir, `interior.${i}.png`);
              fs.writeFileSync(p, Buffer.from([0x89, 0x50, 0x4e, 0x47]));
              arr.push({ path: p, page: i });
            }
            return arr;
          },
        }),
      }));
      const { renderInteriorPreview } = await import('../../kdp/previewRenderer.js');
      const fakeInteriorPdf = path.join(tmpRoot, 'interior.pdf');
      fs.writeFileSync(fakeInteriorPdf, 'fake-pdf');
      await renderInteriorPreview('sample-slug', fakeInteriorPdf);
      await renderInteriorPreview('sample-slug', fakeInteriorPdf);
      expect(calls.n).toBe(1);
    });

    it('returns empty list when interior pdf missing', async () => {
      vi.doMock('pdf2pic', () => ({ fromPath: () => ({ bulk: async () => [] }) }));
      const { renderInteriorPreview } = await import('../../kdp/previewRenderer.js');
      const result = await renderInteriorPreview('no-pdf', path.join(tmpRoot, 'missing.pdf'));
      expect(result.images).toEqual([]);
    });
  });
  ```

- [ ] Run, confirm fail:
  ```bash
  cd web.ui/backend && npx vitest run __tests__/kdp/previewRenderer.test.js
  ```
  Expected: module not found.

- [ ] Implement `web.ui/backend/kdp/previewRenderer.js`:

  ```javascript
  /**
   * Renders 8 interior PDF pages to PNG once, caches under data/cache/previews/<slug>/.
   * @module kdp/previewRenderer
   */
  import fs from 'node:fs';
  import path from 'node:path';
  import { fromPath } from 'pdf2pic';

  const PAGE_COUNT = 8;

  /**
   * Resolves the preview cache directory.
   * @returns {string}
   */
  function previewCacheDir() {
    if (process.env.PREVIEW_CACHE_DIR) return process.env.PREVIEW_CACHE_DIR;
    return path.resolve(process.cwd(), 'data', 'cache', 'previews');
  }

  /**
   * Render up to 8 interior PNGs for one book, cached on disk.
   * @param {string} slug
   * @param {string} interiorPdfPath - absolute path to interior.pdf
   * @returns {Promise<{images: string[], cached: boolean}>}
   */
  export async function renderInteriorPreview(slug, interiorPdfPath) {
    const outDir = path.join(previewCacheDir(), slug);

    if (fs.existsSync(outDir)) {
      const existing = fs.readdirSync(outDir)
        .filter((f) => f.endsWith('.png'))
        .map((f) => path.join(outDir, f))
        .sort();
      if (existing.length >= PAGE_COUNT) {
        return { images: existing.slice(0, PAGE_COUNT), cached: true };
      }
    }

    if (!fs.existsSync(interiorPdfPath)) {
      return { images: [], cached: false };
    }

    fs.mkdirSync(outDir, { recursive: true });

    const converter = fromPath(interiorPdfPath, {
      density: 100,
      format: 'png',
      width: 600,
      height: 800,
      savePath: outDir,
      saveFilename: 'interior',
    });
    const results = await converter.bulk(PAGE_COUNT);
    const images = results
      .map((r) => r.path)
      .filter(Boolean)
      .sort();

    return { images, cached: false };
  }
  ```

- [ ] Re-run, confirm pass:
  ```bash
  cd web.ui/backend && npx vitest run __tests__/kdp/previewRenderer.test.js
  ```
  Expected: 3 tests pass.

- [ ] Commit:
  ```bash
  git add web.ui/backend/kdp/previewRenderer.js web.ui/backend/__tests__/kdp/previewRenderer.test.js
  git commit -m "feat(kdp): interior pdf preview renderer with disk cache"
  ```

---

## Task 6: KDP routes — list, detail, mark-in-review, mark-published

- [ ] Write `web.ui/backend/__tests__/kdp/routes.test.js`:

  ```javascript
  import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
  import express from 'express';
  import request from 'supertest';
  import fs from 'node:fs';
  import path from 'node:path';
  import os from 'node:os';

  let tmpRoot;
  let app;

  beforeEach(async () => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kdp-routes-'));
    process.env.DASHBOARD_DB_PATH = path.join(tmpRoot, 'test.db');
    process.env.PREVIEW_CACHE_DIR = path.join(tmpRoot, 'previews');

    vi.doMock('../../kdp/previewRenderer.js', () => ({
      renderInteriorPreview: async (slug) => ({
        images: [path.join(tmpRoot, 'previews', slug, 'interior.1.png')],
        cached: false,
      }),
    }));

    const { installKdpModule } = await import('../../kdp/index.js');
    app = express();
    app.use(express.json());
    installKdpModule(app);

    const { openDb } = await import('../../db.js');
    const db = openDb();
    db.prepare(`
      INSERT INTO kdp_books (slug, title, status, output_dir, page_count)
      VALUES ('book-a', 'Book A', 'built', ?, 120)
    `).run(path.join(tmpRoot, 'book-a'));
    db.prepare(`
      INSERT INTO kdp_books (slug, title, status, output_dir, asin, release_date)
      VALUES ('book-b', 'Book B', 'published', ?, 'B0XYZ', '2026-05-01')
    `).run(path.join(tmpRoot, 'book-b'));
  });

  afterEach(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
    delete process.env.DASHBOARD_DB_PATH;
    delete process.env.PREVIEW_CACHE_DIR;
    vi.resetModules();
  });

  describe('GET /api/kdp/books', () => {
    it('returns all rows sorted by updated_at desc', async () => {
      const res = await request(app).get('/api/kdp/books');
      expect(res.status).toBe(200);
      expect(res.body.books).toHaveLength(2);
      const slugs = res.body.books.map((b) => b.slug).sort();
      expect(slugs).toEqual(['book-a', 'book-b']);
    });
  });

  describe('GET /api/kdp/books/:slug', () => {
    it('returns the book + preview image list', async () => {
      const res = await request(app).get('/api/kdp/books/book-a');
      expect(res.status).toBe(200);
      expect(res.body.book.slug).toBe('book-a');
      expect(res.body.previews).toBeInstanceOf(Array);
    });
    it('404s on unknown slug', async () => {
      const res = await request(app).get('/api/kdp/books/nonesuch');
      expect(res.status).toBe(404);
    });
  });

  describe('POST /api/kdp/books/:slug/mark-in-review', () => {
    it('transitions built→in_review and inserts a 3-day reminder', async () => {
      const res = await request(app).post('/api/kdp/books/book-a/mark-in-review');
      expect(res.status).toBe(200);
      expect(res.body.book.status).toBe('in_review');
      const { openDb } = await import('../../db.js');
      const db = openDb();
      const rem = db.prepare(`
        SELECT title FROM reminders WHERE source_kind='kdp.book' AND status='pending'
      `).all();
      expect(rem.length).toBe(1);
      expect(rem[0].title).toMatch(/Check KDP review status/);
    });

    it('rejects when status is not built', async () => {
      const res = await request(app).post('/api/kdp/books/book-b/mark-in-review');
      expect(res.status).toBe(409);
    });
  });

  describe('POST /api/kdp/books/:slug/mark-published', () => {
    it('requires ASIN', async () => {
      const res = await request(app)
        .post('/api/kdp/books/book-a/mark-published')
        .send({ release_date: '2026-05-26' });
      expect(res.status).toBe(400);
    });

    it('updates row, inserts day-30 reminder, queues 6 pinterest rows', async () => {
      const res = await request(app)
        .post('/api/kdp/books/book-a/mark-published')
        .send({ asin: 'B0NEWBOOK1', release_date: '2026-05-26' });
      expect(res.status).toBe(200);
      expect(res.body.book.status).toBe('published');
      expect(res.body.book.asin).toBe('B0NEWBOOK1');
      expect(res.body.book.listing_url).toBe('https://www.amazon.com/dp/B0NEWBOOK1');

      const { openDb } = await import('../../db.js');
      const db = openDb();
      const rem = db.prepare(`
        SELECT title FROM reminders WHERE source_kind='kdp.book' AND title LIKE 'KDP Day-30%'
      `).all();
      expect(rem.length).toBe(1);

      const pins = db.prepare(
        `SELECT pin_type FROM pinterest_queue WHERE kdp_book_id =
           (SELECT id FROM kdp_books WHERE slug='book-a')`
      ).all();
      expect(pins.length).toBe(6);
      expect(pins.filter((p) => p.pin_type === 'cover_hero').length).toBe(1);
      expect(pins.filter((p) => p.pin_type === 'interior_preview').length).toBe(5);
    });
  });
  ```

- [ ] Run, confirm fail:
  ```bash
  cd web.ui/backend && npx vitest run __tests__/kdp/routes.test.js
  ```
  Expected: module not found.

- [ ] Implement `web.ui/backend/kdp/index.js`:

  ```javascript
  /**
   * KDP module entry point.
   * @module kdp
   */
  import { router as kdpRouter } from './routes.js';
  export { startScannerWorker, scanOnce } from './scanner.js';
  export { renderInteriorPreview } from './previewRenderer.js';

  /**
   * Mount /api/kdp on an Express app.
   * @param {import('express').Express} app
   */
  export function installKdpModule(app) {
    app.use('/api/kdp', kdpRouter);
  }
  ```

- [ ] Implement `web.ui/backend/kdp/routes.js`:

  ```javascript
  /**
   * KDP routes.
   * @module kdp/routes
   */
  import express from 'express';
  import path from 'node:path';
  import { openDb } from '../db.js';
  import { recordEvent } from '../events.js';
  import { renderInteriorPreview } from './previewRenderer.js';
  import { planSixPinsForBook } from './pinterestPlanner.js';

  export const router = express.Router();

  /**
   * @param {import('better-sqlite3').Database} db
   * @param {string} slug
   * @returns {object|null}
   */
  function getBySlug(db, slug) {
    return db.prepare('SELECT * FROM kdp_books WHERE slug = ?').get(slug) ?? null;
  }

  router.get('/books', (_req, res) => {
    const db = openDb();
    const books = db.prepare(`
      SELECT id, slug, title, subtitle, asin, status, release_date, listing_url,
             page_count, trim_size, price_usd, cover_path, updated_at
        FROM kdp_books
       ORDER BY updated_at DESC
    `).all();
    res.json({ books });
  });

  router.get('/books/:slug', async (req, res) => {
    const db = openDb();
    const book = getBySlug(db, req.params.slug);
    if (!book) return res.status(404).json({ error: 'not_found' });

    const interiorPdf = book.output_dir
      ? path.join(book.output_dir, 'interior.pdf')
      : null;
    let previews = [];
    if (interiorPdf) {
      try {
        const result = await renderInteriorPreview(book.slug, interiorPdf);
        previews = result.images;
      } catch (err) {
        previews = [];
      }
    }
    res.json({ book, previews });
  });

  router.post('/books/:slug/mark-in-review', (req, res) => {
    const db = openDb();
    const book = getBySlug(db, req.params.slug);
    if (!book) return res.status(404).json({ error: 'not_found' });
    if (book.status !== 'built') {
      return res.status(409).json({ error: 'invalid_state', current: book.status });
    }
    db.prepare(`
      UPDATE kdp_books SET status='in_review', updated_at=datetime('now') WHERE id=?
    `).run(book.id);

    const due = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
    db.prepare(`
      INSERT INTO reminders (title, body, due_at, channel, status, source_kind, source_id)
      VALUES (?, ?, ?, 'both', 'pending', 'kdp.book', ?)
    `).run(
      `Check KDP review status: ${book.title}`,
      `It has been 3 days since you submitted ${book.title} to KDP. Has it gone live?`,
      due,
      book.id
    );

    recordEvent('kdp:status-changed', { slug: book.slug, from: 'built', to: 'in_review' });

    const updated = getBySlug(db, req.params.slug);
    res.json({ book: updated });
  });

  router.post('/books/:slug/mark-published', (req, res) => {
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

    // Day-30 reminder
    const day30 = new Date(`${releaseDate}T12:00:00Z`);
    day30.setUTCDate(day30.getUTCDate() + 30);
    db.prepare(`
      INSERT INTO reminders (title, body, due_at, channel, status, source_kind, source_id)
      VALUES (?, ?, ?, 'both', 'pending', 'kdp.book', ?)
    `).run(
      `KDP Day-30 sales check: ${book.title}`,
      `Pull the 30-day sales snapshot for ${book.title} (ASIN ${asin}).`,
      day30.toISOString(),
      book.id
    );

    // Six Pinterest queue rows
    const rows = planSixPinsForBook(
      { id: book.id, slug: book.slug, title: book.title, asin, blurb: book.blurb },
      new Date()
    );
    const insertPin = db.prepare(`
      INSERT INTO pinterest_queue
        (kdp_book_id, pin_type, image_path, title, description, link_url, status, scheduled_for)
      VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)
    `);
    const txn = db.transaction((pins) => {
      for (const p of pins) {
        insertPin.run(
          p.kdp_book_id, p.pin_type, p.image_path, p.title, p.description, p.link_url, p.scheduled_for
        );
      }
    });
    txn(rows);

    recordEvent('kdp:published', { slug: book.slug, asin, release_date: releaseDate });

    const updated = getBySlug(db, req.params.slug);
    res.json({ book: updated, pins_queued: rows.length });
  });
  ```

- [ ] Re-run routes tests, confirm pass:
  ```bash
  cd web.ui/backend && npx vitest run __tests__/kdp/routes.test.js
  ```
  Expected: 7 tests pass.

- [ ] Commit:
  ```bash
  git add web.ui/backend/kdp/index.js web.ui/backend/kdp/routes.js web.ui/backend/__tests__/kdp/routes.test.js
  git commit -m "feat(kdp): mark-published flow with ASIN paste + Pinterest queue trigger"
  ```

---

## Task 7: Wire scanner worker + KDP module into server.js

- [ ] Read current `web.ui/backend/server.js` to find the mount block:
  ```bash
  cd web.ui/backend && cat server.js
  ```
  Expected: Plan A added a `// MODULE_MOUNT_POINT` comment or similar pattern. If not present, locate the section just after `app.use(express.json())` and before `app.listen(...)`.

- [ ] Edit `web.ui/backend/server.js` to add KDP wiring. Insert after the existing module mounts (or just before `app.listen`):

  ```javascript
  import { installKdpModule, startScannerWorker } from './kdp/index.js';

  installKdpModule(app);

  // Start KDP scanner unless explicitly disabled (e.g., during tests)
  if (process.env.SKIP_KDP_SCANNER !== '1') {
    startScannerWorker();
  }
  ```

  (If the file already imports modules via a different pattern established in Plan A, follow that pattern. The two API surface points required by this plan are `installKdpModule(app)` being invoked and `startScannerWorker()` being invoked unless `SKIP_KDP_SCANNER=1`.)

- [ ] Verify server boots without exceptions:
  ```bash
  cd web.ui/backend && SKIP_KDP_SCANNER=1 node -e "import('./server.js').then(()=>setTimeout(()=>process.exit(0),500))"
  ```
  Expected: process exits 0 with no thrown errors.

- [ ] Smoke-test the new endpoints against a real running server in a separate terminal:
  ```bash
  cd web.ui/backend && SKIP_KDP_SCANNER=1 node server.js &
  sleep 2
  curl -s http://127.0.0.1:5000/api/kdp/books | head -c 200
  kill %1
  ```
  Expected: a JSON object `{"books":[...]}` (possibly empty) printed.

- [ ] Commit:
  ```bash
  git add web.ui/backend/server.js
  git commit -m "feat(kdp): wire KDP routes + scanner worker into server.js"
  ```

---

## Task 8: Profile routes — GET/PUT /api/profile

- [ ] Write `web.ui/backend/__tests__/profile/routes.test.js`:

  ```javascript
  import { describe, it, expect, beforeEach, afterEach } from 'vitest';
  import express from 'express';
  import request from 'supertest';
  import fs from 'node:fs';
  import path from 'node:path';
  import os from 'node:os';

  let tmpRoot;
  let app;

  beforeEach(async () => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'profile-'));
    process.env.DASHBOARD_DB_PATH = path.join(tmpRoot, 'test.db');
    const { installProfileModule } = await import('../../profile/index.js');
    app = express();
    app.use(express.json());
    installProfileModule(app);
  });

  afterEach(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
    delete process.env.DASHBOARD_DB_PATH;
  });

  describe('GET /api/profile', () => {
    it('returns the single profile row', async () => {
      const res = await request(app).get('/api/profile');
      expect(res.status).toBe(200);
      expect(res.body.profile.id).toBe(1);
      expect(res.body.profile.time_zone).toBe('America/Los_Angeles');
    });
  });

  describe('PUT /api/profile', () => {
    it('updates writable fields and parses pen_names array', async () => {
      const res = await request(app)
        .put('/api/profile')
        .send({
          display_name: 'Shane',
          pen_names: ['Pocket Rooster Press', 'Seven Martin'],
          kdp_author_url: 'https://amazon.com/author/x',
          etsy_shop_url: 'https://etsy.com/shop/PocketRoosterPress',
          pinterest_url: 'https://pinterest.com/pocketroosterpress',
          gmail_address: 'marts9182@gmail.com',
          time_zone: 'America/New_York',
        });
      expect(res.status).toBe(200);
      expect(res.body.profile.display_name).toBe('Shane');
      expect(res.body.profile.pen_names).toEqual(['Pocket Rooster Press', 'Seven Martin']);
      expect(res.body.profile.time_zone).toBe('America/New_York');
    });

    it('rejects pen_names that are not arrays of strings', async () => {
      const res = await request(app).put('/api/profile').send({ pen_names: 'not-an-array' });
      expect(res.status).toBe(400);
    });

    it('ignores unknown fields silently', async () => {
      const res = await request(app)
        .put('/api/profile')
        .send({ display_name: 'X', evil_field: 'drop tables' });
      expect(res.status).toBe(200);
      expect(res.body.profile.display_name).toBe('X');
    });
  });
  ```

- [ ] Run, confirm fail:
  ```bash
  cd web.ui/backend && npx vitest run __tests__/profile/routes.test.js
  ```
  Expected: module not found.

- [ ] Implement `web.ui/backend/profile/routes.js`:

  ```javascript
  /**
   * Profile routes (single-row table).
   * @module profile/routes
   */
  import express from 'express';
  import { openDb } from '../db.js';
  import { recordEvent } from '../events.js';

  export const router = express.Router();

  const WRITABLE_FIELDS = [
    'display_name',
    'kdp_author_url',
    'etsy_shop_url',
    'pinterest_url',
    'gmail_address',
    'time_zone',
  ];

  /**
   * @returns {object}
   */
  function loadProfile() {
    const db = openDb();
    const row = db.prepare('SELECT * FROM profile WHERE id = 1').get();
    return {
      id: row?.id ?? 1,
      display_name: row?.display_name ?? null,
      pen_names: row?.pen_names_json ? JSON.parse(row.pen_names_json) : [],
      kdp_author_url: row?.kdp_author_url ?? null,
      etsy_shop_url: row?.etsy_shop_url ?? null,
      pinterest_url: row?.pinterest_url ?? null,
      gmail_address: row?.gmail_address ?? null,
      brand_palette: row?.brand_palette_json ? JSON.parse(row.brand_palette_json) : [],
      time_zone: row?.time_zone ?? 'America/Los_Angeles',
    };
  }

  router.get('/', (_req, res) => {
    res.json({ profile: loadProfile() });
  });

  router.put('/', (req, res) => {
    const body = req.body ?? {};

    if (body.pen_names !== undefined) {
      if (!Array.isArray(body.pen_names) || body.pen_names.some((x) => typeof x !== 'string')) {
        return res.status(400).json({ error: 'pen_names_must_be_string_array' });
      }
    }
    if (body.brand_palette !== undefined) {
      if (!Array.isArray(body.brand_palette)) {
        return res.status(400).json({ error: 'brand_palette_must_be_array' });
      }
    }

    const db = openDb();
    const sets = [];
    const params = [];
    for (const f of WRITABLE_FIELDS) {
      if (f in body) {
        sets.push(`${f} = ?`);
        params.push(body[f] ?? null);
      }
    }
    if (body.pen_names !== undefined) {
      sets.push('pen_names_json = ?');
      params.push(JSON.stringify(body.pen_names));
    }
    if (body.brand_palette !== undefined) {
      sets.push('brand_palette_json = ?');
      params.push(JSON.stringify(body.brand_palette));
    }
    if (sets.length > 0) {
      db.prepare(`UPDATE profile SET ${sets.join(', ')} WHERE id = 1`).run(...params);
    }

    recordEvent('profile:updated', { fields: Object.keys(body) });
    res.json({ profile: loadProfile() });
  });
  ```

- [ ] Implement `web.ui/backend/profile/index.js`:

  ```javascript
  /**
   * Profile module entry.
   * @module profile
   */
  import { router } from './routes.js';

  /**
   * @param {import('express').Express} app
   */
  export function installProfileModule(app) {
    app.use('/api/profile', router);
  }
  ```

- [ ] Re-run, confirm pass:
  ```bash
  cd web.ui/backend && npx vitest run __tests__/profile/routes.test.js
  ```
  Expected: 4 tests pass.

- [ ] Wire profile into `web.ui/backend/server.js`. Add next to the KDP mount:

  ```javascript
  import { installProfileModule } from './profile/index.js';
  installProfileModule(app);
  ```

- [ ] Commit:
  ```bash
  git add web.ui/backend/profile/ web.ui/backend/__tests__/profile/ web.ui/backend/server.js
  git commit -m "feat(profile): GET/PUT routes + single-row read/write"
  ```

---

## Task 9: Help routes — markdown content + per-field endpoint

- [ ] Write `web.ui/backend/__tests__/help/routes.test.js`:

  ```javascript
  import { describe, it, expect, beforeEach } from 'vitest';
  import express from 'express';
  import request from 'supertest';

  let app;

  beforeEach(async () => {
    const { installHelpModule } = await import('../../help/index.js');
    app = express();
    installHelpModule(app);
  });

  describe('GET /api/help/:field', () => {
    it('returns rendered HTML for asin', async () => {
      const res = await request(app).get('/api/help/asin');
      expect(res.status).toBe(200);
      expect(res.body.field).toBe('asin');
      expect(res.body.html).toContain('<h1');
      expect(res.body.markdown).toContain('# ');
    });

    it('returns rendered HTML for gmail_app_password', async () => {
      const res = await request(app).get('/api/help/gmail_app_password');
      expect(res.status).toBe(200);
      expect(res.body.markdown.length).toBeGreaterThan(50);
    });

    it('404s on unknown field', async () => {
      const res = await request(app).get('/api/help/nonesuch');
      expect(res.status).toBe(404);
    });

    it('rejects path traversal', async () => {
      const res = await request(app).get('/api/help/..%2F..%2Fpackage');
      expect(res.status).toBe(404);
    });
  });

  describe('GET /api/help', () => {
    it('returns an index of all help articles', async () => {
      const res = await request(app).get('/api/help');
      expect(res.status).toBe(200);
      const fields = res.body.articles.map((a) => a.field);
      expect(fields).toEqual(
        expect.arrayContaining([
          'asin',
          'kdp_author_url',
          'etsy_shop_url',
          'pinterest_url',
          'gmail_app_password',
          'bisac_code',
          'release_date',
        ])
      );
    });
  });
  ```

- [ ] Run, confirm fail.

- [ ] Author the markdown content. Create each file at `web.ui/backend/help/<field>.md`:

  `web.ui/backend/help/asin.md`:
  ```markdown
  # Where to find your ASIN

  Amazon Standard Identification Number — the 10-character ID Amazon assigns
  to your book the moment it goes live.

  ## How to find it

  1. Sign in to <https://kdp.amazon.com>.
  2. Open **Bookshelf**.
  3. For the book in question, click the **`...`** menu → **View on Amazon**.
  4. The URL ends in `/dp/B0XXXXXXXX` — that's your ASIN.

  ## Where to paste it

  In Rooster Dashboard, click **Mark live** on the book row, then paste the
  ASIN into the modal that appears. The dashboard builds the Amazon link for
  you from this.

  ![ASIN in the KDP bookshelf URL](screenshots/asin.png)

  > TODO (user): drop a screenshot at `web.ui/backend/help/screenshots/asin.png`
  > showing the KDP Bookshelf with an ASIN circled.
  ```

  `web.ui/backend/help/kdp_author_url.md`:
  ```markdown
  # Your KDP Author URL

  Your Author Central page — used by the dashboard to deep-link reviews and
  by Pinterest pins as a fallback link target.

  ## How to find it

  1. Sign in to <https://author.amazon.com>.
  2. Click your name in the top-right.
  3. The URL is `https://www.amazon.com/stores/author/B0XXXXXXXX`.

  If you have not claimed Author Central yet, do that first — it takes one
  business day to approve.

  ![Author Central URL location](screenshots/kdp_author_url.png)

  > TODO (user): drop a screenshot at `web.ui/backend/help/screenshots/kdp_author_url.png`.
  ```

  `web.ui/backend/help/etsy_shop_url.md`:
  ```markdown
  # Your Etsy shop URL

  The dashboard uses your Etsy shop URL to deep-link the Etsy catalog table
  back to your storefront.

  ## How to find it

  1. Sign in to <https://www.etsy.com>.
  2. Click your shop icon in the top-right → **Visit your shop**.
  3. Copy the URL — it looks like `https://www.etsy.com/shop/YourShopName`.

  Trailing slashes and tracking params are stripped on save.

  ![Etsy shop URL location](screenshots/etsy_shop_url.png)

  > TODO (user): drop a screenshot at `web.ui/backend/help/screenshots/etsy_shop_url.png`.
  ```

  `web.ui/backend/help/pinterest_url.md`:
  ```markdown
  # Your Pinterest profile URL

  This is the URL the dashboard surfaces for deep-linking pins back to your
  Pinterest profile. (For the Pinterest **posting** automation, see the
  separate `/pinterest` page — that uses a Playwright browser session, not
  this URL.)

  ## How to find it

  1. Sign in to <https://www.pinterest.com>.
  2. Click your avatar in the top-right.
  3. Copy the URL — it looks like `https://www.pinterest.com/yourname/`.

  ![Pinterest profile URL location](screenshots/pinterest_url.png)

  > TODO (user): drop a screenshot at `web.ui/backend/help/screenshots/pinterest_url.png`.
  ```

  `web.ui/backend/help/gmail_app_password.md`:
  ```markdown
  # How to generate a Gmail app password

  The dashboard sends reminder emails via Gmail SMTP. Because Google blocks
  raw account passwords for SMTP, you need an **app password** — a
  16-character throwaway credential scoped to one app.

  ## Steps

  1. Open <https://myaccount.google.com/security>.
  2. Confirm **2-Step Verification** is on. If it is not, turn it on first.
  3. Under "How you sign in to Google," click **App passwords**.
  4. Name the app "Rooster Dashboard" → click **Create**.
  5. Copy the 16-character password (shown once, with spaces — copy without
     spaces).
  6. Paste it into `web.ui/backend/.env` as `GMAIL_APP_PASSWORD=...`.
  7. Restart the dashboard.

  ![App password creation screen](screenshots/gmail_app_password.png)

  > TODO (user): drop a screenshot at `web.ui/backend/help/screenshots/gmail_app_password.png`.

  ## Troubleshooting

  - "Less secure app access" is **not** a valid path — Google has retired it.
  - If reminder emails stop arriving, regenerate the app password and update
    `.env`.
  ```

  `web.ui/backend/help/bisac_code.md`:
  ```markdown
  # BISAC code

  BISAC (Book Industry Standards and Communications) codes classify your
  book for retailers. KDP accepts up to two.

  ## How to pick one

  - Browse <https://www.bisg.org/complete-bisac-subject-headings-list>.
  - For puzzle books: `GAM015000` (Games & Activities / Puzzles / Logic) is
    a solid default.
  - For coloring books: `CGN004080` (Comics & Graphic Novels / Activity
    Books) or `JNF038000` (Juvenile Nonfiction / Activity Books).

  Each book's chosen BISACs live under the `bisac` key in
  `metadata.json` — the dashboard reads them from there.

  ![BISAC lookup site](screenshots/bisac_code.png)

  > TODO (user): drop a screenshot at `web.ui/backend/help/screenshots/bisac_code.png`.
  ```

  `web.ui/backend/help/release_date.md`:
  ```markdown
  # Release date

  The date KDP marks the book "live and orderable." The dashboard uses this
  to anchor Day-30 sales reminders and to compute Pinterest pin schedules.

  ## What to enter

  - If KDP just approved the book today, enter today.
  - If you set a future on-sale date in KDP, enter that date.
  - The format is `YYYY-MM-DD`; the dashboard's date picker enforces this.

  ## How it's used

  - Day-30 reminder fires at `release_date + 30 days`.
  - Pinterest pins schedule across the **7 days following the mark-live
    action**, not relative to release date — so pin cadence is the same
    whether release_date is today or in the past.

  ![Release date field in KDP](screenshots/release_date.png)

  > TODO (user): drop a screenshot at `web.ui/backend/help/screenshots/release_date.png`.
  ```

- [ ] Implement `web.ui/backend/help/routes.js`:

  ```javascript
  /**
   * Help routes — serves markdown from web.ui/backend/help/<field>.md
   * @module help/routes
   */
  import express from 'express';
  import fs from 'node:fs';
  import path from 'node:path';
  import { fileURLToPath } from 'node:url';
  import { marked } from 'marked';

  export const router = express.Router();

  const __filename = fileURLToPath(import.meta.url);
  const HELP_DIR = path.dirname(__filename);

  /** @type {Set<string>} */
  const ALLOWED_FIELDS = new Set([
    'asin',
    'kdp_author_url',
    'etsy_shop_url',
    'pinterest_url',
    'gmail_app_password',
    'bisac_code',
    'release_date',
  ]);

  router.get('/', (_req, res) => {
    const articles = [...ALLOWED_FIELDS].map((field) => {
      const mdPath = path.join(HELP_DIR, `${field}.md`);
      const raw = fs.readFileSync(mdPath, 'utf8');
      const titleMatch = raw.match(/^#\s+(.+)$/m);
      return {
        field,
        title: titleMatch ? titleMatch[1].trim() : field,
      };
    });
    res.json({ articles });
  });

  router.get('/:field', (req, res) => {
    const field = req.params.field;
    if (!ALLOWED_FIELDS.has(field)) {
      return res.status(404).json({ error: 'unknown_field' });
    }
    const mdPath = path.join(HELP_DIR, `${field}.md`);
    if (!fs.existsSync(mdPath)) {
      return res.status(404).json({ error: 'not_found' });
    }
    const markdown = fs.readFileSync(mdPath, 'utf8');
    const html = marked.parse(markdown, { headerIds: false, mangle: false });
    res.json({ field, markdown, html });
  });
  ```

- [ ] Implement `web.ui/backend/help/index.js`:

  ```javascript
  /**
   * Help module entry.
   * @module help
   */
  import { router } from './routes.js';

  /**
   * @param {import('express').Express} app
   */
  export function installHelpModule(app) {
    app.use('/api/help', router);
  }
  ```

- [ ] Re-run help tests, confirm pass:
  ```bash
  cd web.ui/backend && npx vitest run __tests__/help/routes.test.js
  ```
  Expected: 5 tests pass.

- [ ] Wire help into `web.ui/backend/server.js`:
  ```javascript
  import { installHelpModule } from './help/index.js';
  installHelpModule(app);
  ```

- [ ] Commit:
  ```bash
  git add web.ui/backend/help/ web.ui/backend/__tests__/help/ web.ui/backend/server.js
  git commit -m "feat(help): per-field markdown drawer endpoint + 7 articles"
  ```

---

## Task 10: Frontend API clients — kdp, profile, help

- [ ] Implement `web.ui/frontend-react/src/api/kdp.ts`:

  ```typescript
  export interface KdpBook {
    id: number;
    slug: string;
    title: string;
    subtitle: string | null;
    asin: string | null;
    status: 'built' | 'in_review' | 'published' | 'archived';
    release_date: string | null;
    listing_url: string | null;
    page_count: number | null;
    trim_size: string | null;
    price_usd: number | null;
    cover_path: string | null;
    blurb?: string | null;
    output_dir?: string;
    updated_at: string;
  }

  export interface KdpDetail {
    book: KdpBook;
    previews: string[];
  }

  export async function listKdpBooks(): Promise<KdpBook[]> {
    const r = await fetch('/api/kdp/books');
    if (!r.ok) throw new Error(`listKdpBooks: ${r.status}`);
    const data = await r.json();
    return data.books;
  }

  export async function getKdpBook(slug: string): Promise<KdpDetail> {
    const r = await fetch(`/api/kdp/books/${encodeURIComponent(slug)}`);
    if (!r.ok) throw new Error(`getKdpBook: ${r.status}`);
    return r.json();
  }

  export async function markInReview(slug: string): Promise<KdpBook> {
    const r = await fetch(`/api/kdp/books/${encodeURIComponent(slug)}/mark-in-review`, {
      method: 'POST',
    });
    if (!r.ok) throw new Error(`markInReview: ${r.status}`);
    const data = await r.json();
    return data.book;
  }

  export async function markPublished(
    slug: string,
    asin: string,
    releaseDate: string,
  ): Promise<KdpBook> {
    const r = await fetch(`/api/kdp/books/${encodeURIComponent(slug)}/mark-published`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ asin, release_date: releaseDate }),
    });
    if (!r.ok) {
      const err = await r.json().catch(() => ({}));
      throw new Error(err.error ?? `markPublished: ${r.status}`);
    }
    const data = await r.json();
    return data.book;
  }
  ```

- [ ] Implement `web.ui/frontend-react/src/api/profile.ts`:

  ```typescript
  export interface Profile {
    id: number;
    display_name: string | null;
    pen_names: string[];
    kdp_author_url: string | null;
    etsy_shop_url: string | null;
    pinterest_url: string | null;
    gmail_address: string | null;
    brand_palette: string[];
    time_zone: string;
  }

  export async function getProfile(): Promise<Profile> {
    const r = await fetch('/api/profile');
    if (!r.ok) throw new Error(`getProfile: ${r.status}`);
    const data = await r.json();
    return data.profile;
  }

  export async function updateProfile(patch: Partial<Profile>): Promise<Profile> {
    const r = await fetch('/api/profile', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    if (!r.ok) {
      const err = await r.json().catch(() => ({}));
      throw new Error(err.error ?? `updateProfile: ${r.status}`);
    }
    const data = await r.json();
    return data.profile;
  }
  ```

- [ ] Implement `web.ui/frontend-react/src/api/help.ts`:

  ```typescript
  export interface HelpArticle {
    field: string;
    title: string;
  }

  export interface HelpContent {
    field: string;
    markdown: string;
    html: string;
  }

  export async function listHelpArticles(): Promise<HelpArticle[]> {
    const r = await fetch('/api/help');
    if (!r.ok) throw new Error(`listHelpArticles: ${r.status}`);
    const data = await r.json();
    return data.articles;
  }

  export async function getHelpArticle(field: string): Promise<HelpContent> {
    const r = await fetch(`/api/help/${encodeURIComponent(field)}`);
    if (!r.ok) throw new Error(`getHelpArticle: ${r.status}`);
    return r.json();
  }
  ```

- [ ] Type-check:
  ```bash
  cd web.ui/frontend-react && npx tsc --noEmit
  ```
  Expected: no errors related to the new files.

- [ ] Commit:
  ```bash
  git add web.ui/frontend-react/src/api/
  git commit -m "feat(api-clients): typed fetch wrappers for kdp, profile, help"
  ```

---

## Task 11: HelpDrawer + HelpIcon components

- [ ] Write `web.ui/frontend-react/src/__tests__/HelpDrawer.test.tsx`:

  ```tsx
  import { describe, it, expect, vi, beforeEach } from 'vitest';
  import { render, screen, waitFor } from '@testing-library/react';
  import userEvent from '@testing-library/user-event';
  import '@testing-library/jest-dom/vitest';
  import { HelpDrawer } from '../components/HelpDrawer';

  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          field: 'asin',
          markdown: '# ASIN\n\nbody',
          html: '<h1>ASIN</h1><p>body</p>',
        }),
      }),
    );
  });

  describe('HelpDrawer', () => {
    it('renders nothing when closed', () => {
      const { container } = render(<HelpDrawer field="asin" open={false} onClose={() => {}} />);
      expect(container.querySelector('[role="dialog"]')).toBeNull();
    });

    it('loads and renders article HTML when open', async () => {
      render(<HelpDrawer field="asin" open={true} onClose={() => {}} />);
      await waitFor(() => expect(screen.getByText(/ASIN/)).toBeInTheDocument());
      expect(screen.getByText(/body/)).toBeInTheDocument();
    });

    it('calls onClose when close button clicked', async () => {
      const onClose = vi.fn();
      render(<HelpDrawer field="asin" open={true} onClose={onClose} />);
      await waitFor(() => screen.getByText(/ASIN/));
      await userEvent.click(screen.getByRole('button', { name: /close/i }));
      expect(onClose).toHaveBeenCalled();
    });
  });
  ```

- [ ] Implement `web.ui/frontend-react/src/components/HelpDrawer.tsx`:

  ```tsx
  import { useEffect, useState } from 'react';
  import { getHelpArticle, type HelpContent } from '../api/help';

  interface Props {
    field: string;
    open: boolean;
    onClose: () => void;
  }

  export function HelpDrawer({ field, open, onClose }: Props) {
    const [content, setContent] = useState<HelpContent | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
      if (!open) return;
      let cancelled = false;
      setContent(null);
      setError(null);
      getHelpArticle(field)
        .then((c) => {
          if (!cancelled) setContent(c);
        })
        .catch((err) => {
          if (!cancelled) setError(err.message);
        });
      return () => {
        cancelled = true;
      };
    }, [field, open]);

    if (!open) return null;

    return (
      <div
        role="dialog"
        aria-label={`Help: ${field}`}
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          width: '420px',
          height: '100vh',
          background: '#fff',
          boxShadow: '-4px 0 16px rgba(0,0,0,0.2)',
          overflow: 'auto',
          padding: '24px',
          zIndex: 1000,
        }}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close help"
          style={{ float: 'right' }}
        >
          Close
        </button>
        {error && <p style={{ color: 'crimson' }}>Failed to load help: {error}</p>}
        {!content && !error && <p>Loading…</p>}
        {content && (
          <article
            className="help-article"
            // eslint-disable-next-line react/no-danger -- markdown is trusted local content
            dangerouslySetInnerHTML={{ __html: content.html }}
          />
        )}
      </div>
    );
  }
  ```

- [ ] Implement `web.ui/frontend-react/src/components/HelpIcon.tsx`:

  ```tsx
  import { useState } from 'react';
  import { HelpDrawer } from './HelpDrawer';

  interface Props {
    field: string;
    label?: string;
  }

  export function HelpIcon({ field, label = 'Help' }: Props) {
    const [open, setOpen] = useState(false);
    return (
      <>
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={`${label} for ${field}`}
          style={{
            background: 'transparent',
            border: '1px solid #888',
            borderRadius: '50%',
            width: '20px',
            height: '20px',
            fontSize: '12px',
            cursor: 'pointer',
            lineHeight: '18px',
            padding: 0,
          }}
        >
          ?
        </button>
        <HelpDrawer field={field} open={open} onClose={() => setOpen(false)} />
      </>
    );
  }
  ```

- [ ] Run tests, confirm pass:
  ```bash
  cd web.ui/frontend-react && npx vitest run src/__tests__/HelpDrawer.test.tsx
  ```
  Expected: 3 tests pass.

- [ ] Commit:
  ```bash
  git add web.ui/frontend-react/src/components/HelpDrawer.tsx \
          web.ui/frontend-react/src/components/HelpIcon.tsx \
          web.ui/frontend-react/src/__tests__/HelpDrawer.test.tsx
  git commit -m "feat(help): reusable HelpDrawer + HelpIcon components"
  ```

---

## Task 12: HelpIndex page

- [ ] Replace `web.ui/frontend-react/src/pages/HelpIndex.tsx`:

  ```tsx
  import { useEffect, useState } from 'react';
  import { listHelpArticles, type HelpArticle } from '../api/help';
  import { HelpDrawer } from '../components/HelpDrawer';

  export default function HelpIndex() {
    const [articles, setArticles] = useState<HelpArticle[]>([]);
    const [selected, setSelected] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
      listHelpArticles().then(setArticles).catch((err) => setError(err.message));
    }, []);

    return (
      <main style={{ padding: '24px' }}>
        <h1>Help</h1>
        {error && <p style={{ color: 'crimson' }}>{error}</p>}
        <ul>
          {articles.map((a) => (
            <li key={a.field}>
              <button type="button" onClick={() => setSelected(a.field)}>
                {a.title}
              </button>
            </li>
          ))}
        </ul>
        {selected && (
          <HelpDrawer field={selected} open={true} onClose={() => setSelected(null)} />
        )}
      </main>
    );
  }
  ```

- [ ] Type-check:
  ```bash
  cd web.ui/frontend-react && npx tsc --noEmit
  ```
  Expected: no errors.

- [ ] Commit:
  ```bash
  git add web.ui/frontend-react/src/pages/HelpIndex.tsx
  git commit -m "feat(help): /help index page lists articles + opens drawer"
  ```

---

## Task 13: KdpCatalog page

- [ ] Write `web.ui/frontend-react/src/__tests__/KdpCatalog.test.tsx`:

  ```tsx
  import { describe, it, expect, vi, beforeEach } from 'vitest';
  import { render, screen, waitFor } from '@testing-library/react';
  import '@testing-library/jest-dom/vitest';
  import { MemoryRouter } from 'react-router-dom';
  import KdpCatalog from '../pages/KdpCatalog';

  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          books: [
            {
              id: 1, slug: 'book-a', title: 'Book A', subtitle: null, asin: null,
              status: 'built', release_date: null, listing_url: null, page_count: 120,
              trim_size: '8.5x11', price_usd: 9.99, cover_path: null, updated_at: '2026-05-26',
            },
            {
              id: 2, slug: 'book-b', title: 'Book B', subtitle: null, asin: 'B0XYZ',
              status: 'published', release_date: '2026-05-01', listing_url: 'https://amazon.com/dp/B0XYZ',
              page_count: 80, trim_size: '8.5x11', price_usd: 7.99, cover_path: null, updated_at: '2026-05-20',
            },
          ],
        }),
      }),
    );
  });

  describe('KdpCatalog', () => {
    it('renders rows for each book', async () => {
      render(<MemoryRouter><KdpCatalog /></MemoryRouter>);
      await waitFor(() => expect(screen.getByText('Book A')).toBeInTheDocument());
      expect(screen.getByText('Book B')).toBeInTheDocument();
    });

    it('shows status badges', async () => {
      render(<MemoryRouter><KdpCatalog /></MemoryRouter>);
      await waitFor(() => expect(screen.getByText(/built/i)).toBeInTheDocument());
      expect(screen.getByText(/live/i)).toBeInTheDocument();
    });
  });
  ```

- [ ] Implement `web.ui/frontend-react/src/pages/KdpCatalog.tsx`:

  ```tsx
  import { useEffect, useMemo, useState } from 'react';
  import { Link } from 'react-router-dom';
  import { listKdpBooks, type KdpBook } from '../api/kdp';

  type SortKey = 'title' | 'status' | 'release_date' | 'updated_at';
  type SortDir = 'asc' | 'desc';

  function statusBadge(s: KdpBook['status']): string {
    if (s === 'published') return 'live';
    if (s === 'in_review') return 'in review';
    if (s === 'archived') return 'archived';
    return 'built';
  }

  export default function KdpCatalog() {
    const [books, setBooks] = useState<KdpBook[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [sortKey, setSortKey] = useState<SortKey>('updated_at');
    const [sortDir, setSortDir] = useState<SortDir>('desc');

    useEffect(() => {
      listKdpBooks().then(setBooks).catch((err) => setError(err.message));
    }, []);

    const sorted = useMemo(() => {
      const arr = [...books];
      arr.sort((a, b) => {
        const av = (a[sortKey] ?? '') as string;
        const bv = (b[sortKey] ?? '') as string;
        const cmp = av < bv ? -1 : av > bv ? 1 : 0;
        return sortDir === 'asc' ? cmp : -cmp;
      });
      return arr;
    }, [books, sortKey, sortDir]);

    function toggleSort(key: SortKey) {
      if (sortKey === key) {
        setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
      } else {
        setSortKey(key);
        setSortDir('asc');
      }
    }

    return (
      <main style={{ padding: '24px' }}>
        <h1>KDP Catalog</h1>
        {error && <p style={{ color: 'crimson' }}>{error}</p>}
        <table>
          <thead>
            <tr>
              <th><button onClick={() => toggleSort('title')}>Title</button></th>
              <th><button onClick={() => toggleSort('status')}>Status</button></th>
              <th>ASIN</th>
              <th><button onClick={() => toggleSort('release_date')}>Released</button></th>
              <th>Trim</th>
              <th>Pages</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((b) => (
              <tr key={b.slug}>
                <td><Link to={`/kdp/${b.slug}`}>{b.title}</Link></td>
                <td>{statusBadge(b.status)}</td>
                <td>{b.asin ?? '—'}</td>
                <td>{b.release_date ?? '—'}</td>
                <td>{b.trim_size ?? '—'}</td>
                <td>{b.page_count ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </main>
    );
  }
  ```

- [ ] Run tests:
  ```bash
  cd web.ui/frontend-react && npx vitest run src/__tests__/KdpCatalog.test.tsx
  ```
  Expected: 2 tests pass.

- [ ] Commit:
  ```bash
  git add web.ui/frontend-react/src/pages/KdpCatalog.tsx \
          web.ui/frontend-react/src/__tests__/KdpCatalog.test.tsx
  git commit -m "feat(kdp): /kdp catalog table page with sort + row links"
  ```

---

## Task 14: MarkPublishedModal component

- [ ] Implement `web.ui/frontend-react/src/components/MarkPublishedModal.tsx`:

  ```tsx
  import { useState } from 'react';
  import { markPublished, type KdpBook } from '../api/kdp';
  import { HelpIcon } from './HelpIcon';

  interface Props {
    book: KdpBook;
    onClose: () => void;
    onSaved: (updated: KdpBook) => void;
  }

  function todayIso(): string {
    return new Date().toISOString().slice(0, 10);
  }

  export function MarkPublishedModal({ book, onClose, onSaved }: Props) {
    const [asin, setAsin] = useState('');
    const [releaseDate, setReleaseDate] = useState(todayIso());
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function handleSave() {
      setError(null);
      if (!/^[A-Z0-9]{10}$/.test(asin.trim())) {
        setError('ASIN must be 10 alphanumeric characters (e.g. B0ABCDEFG1).');
        return;
      }
      setBusy(true);
      try {
        const updated = await markPublished(book.slug, asin.trim(), releaseDate);
        onSaved(updated);
        onClose();
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setBusy(false);
      }
    }

    return (
      <div
        role="dialog"
        aria-label="Mark book published"
        style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
        }}
      >
        <div style={{ background: '#fff', padding: '24px', minWidth: '380px', borderRadius: '8px' }}>
          <h2>Mark live: {book.title}</h2>
          <label style={{ display: 'block', marginBottom: '12px' }}>
            ASIN <HelpIcon field="asin" />
            <input
              type="text"
              value={asin}
              onChange={(e) => setAsin(e.target.value.toUpperCase())}
              placeholder="B0ABCDEFG1"
              maxLength={10}
              style={{ display: 'block', width: '100%', marginTop: '4px' }}
            />
          </label>
          <label style={{ display: 'block', marginBottom: '12px' }}>
            Release date <HelpIcon field="release_date" />
            <input
              type="date"
              value={releaseDate}
              onChange={(e) => setReleaseDate(e.target.value)}
              style={{ display: 'block', marginTop: '4px' }}
            />
          </label>
          {error && <p style={{ color: 'crimson' }}>{error}</p>}
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
            <button type="button" onClick={onClose} disabled={busy}>Cancel</button>
            <button type="button" onClick={handleSave} disabled={busy}>
              {busy ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    );
  }
  ```

- [ ] Type-check:
  ```bash
  cd web.ui/frontend-react && npx tsc --noEmit
  ```
  Expected: no errors.

- [ ] Commit:
  ```bash
  git add web.ui/frontend-react/src/components/MarkPublishedModal.tsx
  git commit -m "feat(kdp): MarkPublishedModal with ASIN + date + inline help"
  ```

---

## Task 15: KdpDetail page

- [ ] Write `web.ui/frontend-react/src/__tests__/KdpDetail.test.tsx`:

  ```tsx
  import { describe, it, expect, vi, beforeEach } from 'vitest';
  import { render, screen, waitFor } from '@testing-library/react';
  import '@testing-library/jest-dom/vitest';
  import { MemoryRouter, Route, Routes } from 'react-router-dom';
  import KdpDetail from '../pages/KdpDetail';

  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          book: {
            id: 1, slug: 'book-a', title: 'Book A', subtitle: 'Sub', asin: null,
            status: 'built', release_date: null, listing_url: null, page_count: 120,
            trim_size: '8.5x11', price_usd: 9.99, cover_path: null, blurb: '<p>Hi</p>',
            updated_at: '2026-05-26',
          },
          previews: [
            'data/cache/previews/book-a/interior.1.png',
            'data/cache/previews/book-a/interior.2.png',
          ],
        }),
      }),
    );
  });

  describe('KdpDetail', () => {
    it('renders title, metadata, and preview images', async () => {
      render(
        <MemoryRouter initialEntries={['/kdp/book-a']}>
          <Routes>
            <Route path="/kdp/:slug" element={<KdpDetail />} />
          </Routes>
        </MemoryRouter>,
      );
      await waitFor(() => expect(screen.getByText('Book A')).toBeInTheDocument());
      expect(screen.getByText(/Sub/)).toBeInTheDocument();
      expect(screen.getByText(/8\.5x11/)).toBeInTheDocument();
      const imgs = screen.getAllByRole('img');
      expect(imgs.length).toBeGreaterThanOrEqual(2);
    });

    it('shows Mark in-review button when status is built', async () => {
      render(
        <MemoryRouter initialEntries={['/kdp/book-a']}>
          <Routes>
            <Route path="/kdp/:slug" element={<KdpDetail />} />
          </Routes>
        </MemoryRouter>,
      );
      await waitFor(() => screen.getByText('Book A'));
      expect(screen.getByRole('button', { name: /mark in-review/i })).toBeInTheDocument();
    });
  });
  ```

- [ ] Implement `web.ui/frontend-react/src/pages/KdpDetail.tsx`:

  ```tsx
  import { useEffect, useState } from 'react';
  import { useParams } from 'react-router-dom';
  import { getKdpBook, markInReview, type KdpBook } from '../api/kdp';
  import { MarkPublishedModal } from '../components/MarkPublishedModal';
  import { HelpIcon } from '../components/HelpIcon';

  export default function KdpDetail() {
    const { slug } = useParams<{ slug: string }>();
    const [book, setBook] = useState<KdpBook | null>(null);
    const [previews, setPreviews] = useState<string[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [modalOpen, setModalOpen] = useState(false);

    useEffect(() => {
      if (!slug) return;
      getKdpBook(slug)
        .then((d) => { setBook(d.book); setPreviews(d.previews); })
        .catch((err) => setError(err.message));
    }, [slug]);

    async function handleMarkInReview() {
      if (!book) return;
      try {
        const updated = await markInReview(book.slug);
        setBook(updated);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    }

    if (error) return <main style={{ padding: '24px' }}><p style={{ color: 'crimson' }}>{error}</p></main>;
    if (!book) return <main style={{ padding: '24px' }}><p>Loading…</p></main>;

    return (
      <main style={{ padding: '24px', display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '24px' }}>
        <section>
          {book.cover_path
            ? <img src={`/files/${book.cover_path}`} alt={`${book.title} cover`} style={{ maxWidth: '100%' }} />
            : <div style={{ background: '#eee', aspectRatio: '0.66', display: 'grid', placeItems: 'center' }}>No cover</div>}
        </section>
        <section>
          <h1>{book.title}</h1>
          {book.subtitle && <h2>{book.subtitle}</h2>}
          <dl>
            <dt>Status</dt><dd>{book.status}</dd>
            <dt>ASIN <HelpIcon field="asin" /></dt><dd>{book.asin ?? '—'}</dd>
            <dt>Trim</dt><dd>{book.trim_size ?? '—'}</dd>
            <dt>Pages</dt><dd>{book.page_count ?? '—'}</dd>
            <dt>Price</dt><dd>{book.price_usd != null ? `$${book.price_usd.toFixed(2)}` : '—'}</dd>
            <dt>Release <HelpIcon field="release_date" /></dt><dd>{book.release_date ?? '—'}</dd>
          </dl>
          <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
            {book.listing_url && (
              <a href={book.listing_url} target="_blank" rel="noreferrer">
                <button type="button">Open on Amazon</button>
              </a>
            )}
            {book.status === 'built' && (
              <button type="button" onClick={handleMarkInReview}>Mark in-review</button>
            )}
            {(book.status === 'built' || book.status === 'in_review') && (
              <button type="button" onClick={() => setModalOpen(true)}>Mark live</button>
            )}
          </div>
          {book.blurb && (
            <section style={{ marginTop: '16px' }}>
              <h3>Description</h3>
              {/* eslint-disable-next-line react/no-danger -- blurb is local content */}
              <div dangerouslySetInnerHTML={{ __html: book.blurb }} />
            </section>
          )}
        </section>
        <section style={{ gridColumn: '1 / -1' }}>
          <h3>Interior preview</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' }}>
            {previews.map((p) => (
              <img key={p} src={`/files/${p}`} alt="" style={{ width: '100%' }} />
            ))}
          </div>
        </section>
        {modalOpen && (
          <MarkPublishedModal
            book={book}
            onClose={() => setModalOpen(false)}
            onSaved={(b) => setBook(b)}
          />
        )}
      </main>
    );
  }
  ```

- [ ] Run tests:
  ```bash
  cd web.ui/frontend-react && npx vitest run src/__tests__/KdpDetail.test.tsx
  ```
  Expected: 2 tests pass.

- [ ] Commit:
  ```bash
  git add web.ui/frontend-react/src/pages/KdpDetail.tsx \
          web.ui/frontend-react/src/__tests__/KdpDetail.test.tsx
  git commit -m "feat(kdp): /kdp/:slug detail page with cover, metadata, 4x4 preview grid"
  ```

---

## Task 16: Add /files static route for cover + preview images

- [ ] In `web.ui/backend/server.js`, mount a static handler for the repo-rooted cache + project paths. Add (between the module installs and `app.listen`):

  ```javascript
  import path from 'node:path';
  // Serve cover/preview images and other repo files referenced by stored relative paths.
  app.use('/files', (req, res, next) => {
    // Sanitize: only allow paths under data/cache/previews or projects/kdp-puzzle-press/output/kdp-ready
    const repoRoot = path.resolve(process.cwd(), '..', '..');
    const requested = path.normalize(path.join(repoRoot, decodeURIComponent(req.path)));
    const allowedRoots = [
      path.join(repoRoot, 'data', 'cache', 'previews'),
      path.join(repoRoot, 'projects', 'kdp-puzzle-press', 'output', 'kdp-ready'),
    ];
    const ok = allowedRoots.some((r) => requested.startsWith(r + path.sep) || requested === r);
    if (!ok) return res.status(403).json({ error: 'forbidden' });
    res.sendFile(requested, (err) => { if (err) next(); });
  });
  ```

- [ ] Smoke test (with a known existing PNG, if any; otherwise just verify the 403 path):
  ```bash
  cd web.ui/backend && SKIP_KDP_SCANNER=1 node server.js &
  sleep 2
  curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:5000/files/../package.json
  kill %1
  ```
  Expected: `403`.

- [ ] Commit:
  ```bash
  git add web.ui/backend/server.js
  git commit -m "feat(kdp): /files static route scoped to cache + kdp-ready"
  ```

---

## Task 17: Profile page

- [ ] Write `web.ui/frontend-react/src/__tests__/Profile.test.tsx`:

  ```tsx
  import { describe, it, expect, vi, beforeEach } from 'vitest';
  import { render, screen, waitFor } from '@testing-library/react';
  import userEvent from '@testing-library/user-event';
  import '@testing-library/jest-dom/vitest';
  import Profile from '../pages/Profile';

  beforeEach(() => {
    const initial = {
      id: 1, display_name: 'Shane', pen_names: ['Pocket Rooster Press'],
      kdp_author_url: null, etsy_shop_url: null, pinterest_url: null,
      gmail_address: 'marts9182@gmail.com', brand_palette: [], time_zone: 'America/Los_Angeles',
    };
    const fetchMock = vi.fn();
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ profile: initial }) });
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ profile: { ...initial, display_name: 'Shane M' } }),
    });
    vi.stubGlobal('fetch', fetchMock);
  });

  describe('Profile', () => {
    it('loads initial profile values', async () => {
      render(<Profile />);
      await waitFor(() => expect((screen.getByLabelText(/Display name/i) as HTMLInputElement).value).toBe('Shane'));
    });

    it('saves edits via PUT', async () => {
      render(<Profile />);
      await waitFor(() => screen.getByLabelText(/Display name/i));
      const input = screen.getByLabelText(/Display name/i) as HTMLInputElement;
      await userEvent.clear(input);
      await userEvent.type(input, 'Shane M');
      await userEvent.click(screen.getByRole('button', { name: /save/i }));
      await waitFor(() => expect(screen.getByText(/saved/i)).toBeInTheDocument());
    });
  });
  ```

- [ ] Implement `web.ui/frontend-react/src/pages/Profile.tsx`:

  ```tsx
  import { useEffect, useState } from 'react';
  import { getProfile, updateProfile, type Profile as ProfileT } from '../api/profile';
  import { HelpIcon } from '../components/HelpIcon';

  export default function Profile() {
    const [p, setP] = useState<ProfileT | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [saved, setSaved] = useState(false);
    const [busy, setBusy] = useState(false);
    const [penInput, setPenInput] = useState('');

    useEffect(() => {
      getProfile().then(setP).catch((err) => setError(err.message));
    }, []);

    function update<K extends keyof ProfileT>(key: K, value: ProfileT[K]) {
      setP((prev) => (prev ? { ...prev, [key]: value } : prev));
      setSaved(false);
    }

    function addPenName() {
      if (!penInput.trim() || !p) return;
      update('pen_names', [...p.pen_names, penInput.trim()]);
      setPenInput('');
    }
    function removePenName(i: number) {
      if (!p) return;
      update('pen_names', p.pen_names.filter((_, idx) => idx !== i));
    }

    async function handleSave() {
      if (!p) return;
      setBusy(true);
      setError(null);
      try {
        const updated = await updateProfile({
          display_name: p.display_name,
          pen_names: p.pen_names,
          kdp_author_url: p.kdp_author_url,
          etsy_shop_url: p.etsy_shop_url,
          pinterest_url: p.pinterest_url,
          gmail_address: p.gmail_address,
          time_zone: p.time_zone,
        });
        setP(updated);
        setSaved(true);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setBusy(false);
      }
    }

    if (error) return <main style={{ padding: '24px' }}><p style={{ color: 'crimson' }}>{error}</p></main>;
    if (!p) return <main style={{ padding: '24px' }}><p>Loading…</p></main>;

    return (
      <main style={{ padding: '24px', maxWidth: '640px' }}>
        <h1>Profile</h1>
        <label>
          Display name
          <input
            type="text"
            value={p.display_name ?? ''}
            onChange={(e) => update('display_name', e.target.value)}
          />
        </label>
        <fieldset>
          <legend>Pen names</legend>
          <ul>
            {p.pen_names.map((n, i) => (
              <li key={`${n}-${i}`}>
                {n}{' '}
                <button type="button" onClick={() => removePenName(i)} aria-label={`Remove ${n}`}>×</button>
              </li>
            ))}
          </ul>
          <input
            type="text"
            placeholder="Add pen name"
            value={penInput}
            onChange={(e) => setPenInput(e.target.value)}
          />
          <button type="button" onClick={addPenName}>Add</button>
        </fieldset>
        <label>
          KDP author URL <HelpIcon field="kdp_author_url" />
          <input
            type="url"
            value={p.kdp_author_url ?? ''}
            onChange={(e) => update('kdp_author_url', e.target.value)}
          />
        </label>
        <label>
          Etsy shop URL <HelpIcon field="etsy_shop_url" />
          <input
            type="url"
            value={p.etsy_shop_url ?? ''}
            onChange={(e) => update('etsy_shop_url', e.target.value)}
          />
        </label>
        <label>
          Pinterest URL <HelpIcon field="pinterest_url" />
          <input
            type="url"
            value={p.pinterest_url ?? ''}
            onChange={(e) => update('pinterest_url', e.target.value)}
          />
        </label>
        <label>
          Gmail address <HelpIcon field="gmail_app_password" />
          <input
            type="email"
            value={p.gmail_address ?? ''}
            onChange={(e) => update('gmail_address', e.target.value)}
          />
        </label>
        <label>
          Time zone
          <input
            type="text"
            value={p.time_zone ?? ''}
            onChange={(e) => update('time_zone', e.target.value)}
          />
        </label>
        <div style={{ marginTop: '16px' }}>
          <button type="button" onClick={handleSave} disabled={busy}>
            {busy ? 'Saving…' : 'Save'}
          </button>
          {saved && <span style={{ marginLeft: '12px', color: 'green' }}>Saved</span>}
        </div>
      </main>
    );
  }
  ```

- [ ] Run tests:
  ```bash
  cd web.ui/frontend-react && npx vitest run src/__tests__/Profile.test.tsx
  ```
  Expected: 2 tests pass.

- [ ] Commit:
  ```bash
  git add web.ui/frontend-react/src/pages/Profile.tsx \
          web.ui/frontend-react/src/__tests__/Profile.test.tsx
  git commit -m "feat(profile): /profile editor form with chip-style pen names + help icons"
  ```

---

## Task 18: SSE wiring on KdpCatalog — refresh on kdp:new-book / kdp:published

- [ ] Edit `web.ui/frontend-react/src/pages/KdpCatalog.tsx`. Replace the existing `useEffect` mount block with a version that subscribes to SSE and re-fetches on `kdp:*` events:

  ```tsx
  import { useEffect, useMemo, useState } from 'react';
  import { Link } from 'react-router-dom';
  import { listKdpBooks, type KdpBook } from '../api/kdp';
  import { useSse } from '../hooks/useSse';

  // ... type defs unchanged ...

  export default function KdpCatalog() {
    const [books, setBooks] = useState<KdpBook[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [sortKey, setSortKey] = useState<SortKey>('updated_at');
    const [sortDir, setSortDir] = useState<SortDir>('desc');

    function reload() {
      listKdpBooks().then(setBooks).catch((err) => setError(err.message));
    }

    useEffect(() => { reload(); }, []);
    useSse('kdp:', (evt) => {
      if (evt.kind === 'kdp:new-book' || evt.kind === 'kdp:status-changed' || evt.kind === 'kdp:published') {
        reload();
      }
    });

    // ... rest unchanged ...
  }
  ```

  (Keep the table JSX from Task 13 unchanged. Only the data-fetch effect changes.)

- [ ] Re-run KdpCatalog tests to make sure the SSE hook doesn't break the existing test (it should noop when `useSse` has no real EventSource available in jsdom — the hook from Plan A is documented to early-return in that case):
  ```bash
  cd web.ui/frontend-react && npx vitest run src/__tests__/KdpCatalog.test.tsx
  ```
  Expected: 2 tests still pass.

- [ ] Commit:
  ```bash
  git add web.ui/frontend-react/src/pages/KdpCatalog.tsx
  git commit -m "feat(kdp): KdpCatalog auto-refreshes on kdp:* SSE events"
  ```

---

## Task 19: E2E — KDP publish flow

- [ ] Write `web.ui/frontend-react/tests/e2e/kdp-publish.spec.ts`:

  ```typescript
  import { test, expect } from '@playwright/test';

  test.describe('KDP publish flow', () => {
    test.beforeAll(async () => {
      // Backend boot is handled by playwright.config.ts webServer; tests assume
      // the backend has been started with KDP_READY_DIR pointing at a tmp dir
      // pre-seeded with one book "e2e-book" (see playwright global-setup.ts in
      // Plan A scope; we just consume it here).
    });

    test('user marks a built book in-review, then live', async ({ page }) => {
      await page.goto('http://127.0.0.1:5000/kdp');
      await expect(page.getByText('E2E Book')).toBeVisible();
      await page.getByRole('link', { name: 'E2E Book' }).click();
      await expect(page.getByRole('button', { name: /mark in-review/i })).toBeVisible();
      await page.getByRole('button', { name: /mark in-review/i }).click();
      await expect(page.getByText(/in_review/i)).toBeVisible();

      await page.getByRole('button', { name: /mark live/i }).click();
      await page.getByLabel(/ASIN/i).fill('B0E2EBOOK1');
      await page.getByRole('button', { name: /^save$/i }).click();
      await expect(page.getByText('B0E2EBOOK1')).toBeVisible();
      await expect(page.getByRole('link', { name: /open on amazon/i })).toBeVisible();
    });
  });
  ```

  > Note: This test depends on Plan A's `playwright.config.ts` global-setup which seeds an "E2E Book" in the dashboard's temp DB. If that seeding does not exist, add a pre-test API call in this spec's `test.beforeAll` to POST a fixture row directly via SQL through `openDb()`. The fixture-seeding mechanism is owned by Plan A; this plan just consumes whatever shape Plan A established.

- [ ] Run e2e:
  ```bash
  cd web.ui/frontend-react && npx playwright test tests/e2e/kdp-publish.spec.ts
  ```
  Expected: 1 test passes.

- [ ] Commit:
  ```bash
  git add web.ui/frontend-react/tests/e2e/kdp-publish.spec.ts
  git commit -m "test(e2e): KDP mark-in-review then mark-live flow"
  ```

---

## Task 20: E2E — Profile editor + Help drawer

- [ ] Write `web.ui/frontend-react/tests/e2e/profile.spec.ts`:

  ```typescript
  import { test, expect } from '@playwright/test';

  test('profile editor saves and reloads', async ({ page }) => {
    await page.goto('http://127.0.0.1:5000/profile');
    await page.getByLabel(/Display name/i).fill('Shane Test');
    await page.getByLabel(/Etsy shop URL/i).fill('https://etsy.com/shop/PocketRoosterPress');
    await page.getByRole('button', { name: /^save$/i }).click();
    await expect(page.getByText(/saved/i)).toBeVisible();

    await page.reload();
    await expect(page.getByLabel(/Display name/i)).toHaveValue('Shane Test');
  });

  test('help drawer opens from KDP detail page and shows ASIN article', async ({ page }) => {
    await page.goto('http://127.0.0.1:5000/help');
    await page.getByRole('button', { name: /where to find your asin/i }).click();
    await expect(page.getByRole('dialog', { name: /help: asin/i })).toBeVisible();
    await expect(page.getByText(/10-character ID Amazon assigns/i)).toBeVisible();
    await page.getByRole('button', { name: /close help/i }).click();
    await expect(page.getByRole('dialog', { name: /help: asin/i })).not.toBeVisible();
  });
  ```

- [ ] Run e2e:
  ```bash
  cd web.ui/frontend-react && npx playwright test tests/e2e/profile.spec.ts
  ```
  Expected: 2 tests pass.

- [ ] Commit:
  ```bash
  git add web.ui/frontend-react/tests/e2e/profile.spec.ts
  git commit -m "test(e2e): profile save + help drawer open/close"
  ```

---

## Task 21: Full test pass + manual smoke

- [ ] Run the entire backend test suite:
  ```bash
  cd web.ui/backend && npm test
  ```
  Expected: all tests added in this plan pass; Plan A tests remain green. No new failures.

- [ ] Run the entire frontend unit suite:
  ```bash
  cd web.ui/frontend-react && npm test -- --run
  ```
  Expected: all tests pass.

- [ ] Run frontend type-check:
  ```bash
  cd web.ui/frontend-react && npx tsc --noEmit
  ```
  Expected: zero errors.

- [ ] Run Playwright e2e:
  ```bash
  cd web.ui/frontend-react && npx playwright test tests/e2e/
  ```
  Expected: all e2e tests pass.

- [ ] Manual smoke on a Windows session:
  1. `cd web.ui/backend && npm start` in one terminal.
  2. `cd web.ui/frontend-react && npm run dev` in another.
  3. Open <http://localhost:5173> (or whatever Vite dev port Plan A set).
  4. Visit `/kdp` — confirm the existing kdp-ready books appear.
  5. Click into one — confirm cover + 4×4 preview grid render (preview renderer may take 5–15s on first load while pdf2pic does its work; subsequent loads are instant from cache).
  6. Visit `/profile` — confirm form loads and saves.
  7. Click the `?` next to ASIN — confirm the drawer opens and renders the markdown.

- [ ] No commit needed (verification only).

---

## Definition of Done

- [ ] All 21 tasks complete; every test green.
- [ ] `web.ui/backend/kdp/` directory has parser, scanner, routes, previewRenderer, pinterestPlanner, and index modules.
- [ ] `web.ui/backend/profile/` has routes + index.
- [ ] `web.ui/backend/help/` has 7 markdown files + screenshots/.gitkeep + routes + index.
- [ ] `web.ui/frontend-react/src/pages/` has KdpCatalog, KdpDetail, Profile, HelpIndex implementations (no longer empty stubs).
- [ ] `web.ui/frontend-react/src/components/` has HelpDrawer, HelpIcon, MarkPublishedModal.
- [ ] `web.ui/frontend-react/src/api/` has kdp, profile, help typed clients.
- [ ] Server boots with `SKIP_KDP_SCANNER=1` for tests and without it in production.
- [ ] Marking a book published inserts 6 pinterest_queue rows + 1 Day-30 reminder; Plan D / Plan E will pick them up.
- [ ] User can edit profile, paste an ASIN, and read help articles without leaving the dashboard.
