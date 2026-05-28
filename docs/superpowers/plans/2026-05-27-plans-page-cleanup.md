# Plans Page Completion Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop completed plans from competing for attention with active work on `/specs & plans`, and surface the spec↔plan completion relationship by marking shipped specs.

**Architecture:** The backend scanner already computes `status` from checkbox counts. This plan adds two derived fields (`completedAt` from `fs.stat` mtime, `shipped` from cross-referencing plan→spec slugs) and a new sort that sinks done entries to the bottom. The frontend dims done plan cards and replaces the "open" badge with a green "shipped" chip on specs whose plan is done. A shared `relTime` helper gets extracted from `EtsyStatusBanner.tsx` so the new Plans card and the existing banner use the same fuzzy-time formatting.

**Tech Stack:** Node 18+ ESM + vitest (backend); React 19 + Vite + TypeScript + vitest + React Testing Library (frontend).

**Spec:** [`docs/superpowers/specs/2026-05-27-plans-page-cleanup-design.md`](../specs/2026-05-27-plans-page-cleanup-design.md)

---

## File Structure

**Created:**
- `web.ui/frontend-react/src/lib/relativeTime.ts` — shared `relTime(iso, now?)` helper, extracted from `EtsyStatusBanner.tsx`.
- `web.ui/frontend-react/src/__tests__/Plans.test.tsx` — Plans page React tests (3 cases).

**Modified:**
- `web.ui/backend/plans/scanner.js` — add `completedAt` + `shipped` derivation; new sort tuple.
- `web.ui/backend/__tests__/plans/scanner.test.js` — four new test cases.
- `web.ui/frontend-react/src/api/plans.ts` — extend `PlanEntry` interface with the two new fields.
- `web.ui/frontend-react/src/components/EtsyStatusBanner.tsx` — replace inline `relTime` with the shared import.
- `web.ui/frontend-react/src/pages/Plans.tsx` — done-collapsed card, shipped-spec badge, completedAt line.
- `web.ui/frontend-react/src/styles/shell.css` — three new rules appended to the existing plans block (`plan-card--done-collapsed`, `plan-card__completed-at`, `status-badge--shipped`).

---

## Task 1: Backend scanner — `completedAt`, `shipped`, new sort

**Files:**
- Modify: `web.ui/backend/plans/scanner.js`
- Test: `web.ui/backend/__tests__/plans/scanner.test.js`

- [ ] **Step 1: Write the failing tests (append four describe cases)**

Append to `web.ui/backend/__tests__/plans/scanner.test.js`, after the existing `scanDocs` tests:

```js
  it('scanDocs sets completedAt to file mtime on done plans only', () => {
    const donePlan = path.join(root, 'superpowers', 'plans', '2026-05-20-finished.md');
    fs.writeFileSync(donePlan, '# Done plan\n\n- [x] one\n- [x] two\n');
    const fixedMtime = new Date('2026-05-22T15:30:00Z');
    fs.utimesSync(donePlan, fixedMtime, fixedMtime);

    const openPlan = path.join(root, 'superpowers', 'plans', '2026-05-21-active.md');
    fs.writeFileSync(openPlan, '# Active\n\n- [ ] one\n- [x] two\n');

    const entries = scanDocs(path.join(root, 'superpowers'));
    const done = entries.find((e) => e.slug === 'finished');
    const active = entries.find((e) => e.slug === 'active');

    expect(done.status).toBe('done');
    expect(done.completedAt).toBe('2026-05-22T15:30:00.000Z');
    expect(active.status).toBe('in-flight');
    expect(active.completedAt).toBeNull();
  });

  it('scanDocs sets shipped:true on a spec whose same-slug plan is done', () => {
    fs.writeFileSync(
      path.join(root, 'superpowers', 'specs', '2026-05-20-thing-design.md'),
      '---\ntitle: Thing Design\n---\n# Thing\n',
    );
    fs.writeFileSync(
      path.join(root, 'superpowers', 'plans', '2026-05-20-thing.md'),
      '# Thing plan\n\n- [x] task\n',
    );
    const entries = scanDocs(path.join(root, 'superpowers'));
    const spec = entries.find((e) => e.kind === 'spec');
    expect(spec.shipped).toBe(true);
  });

  it('scanDocs leaves shipped undefined when matching plan is still in-flight or absent', () => {
    fs.writeFileSync(
      path.join(root, 'superpowers', 'specs', '2026-05-20-inflight-design.md'),
      '---\ntitle: Inflight Design\n---\n# In flight\n',
    );
    fs.writeFileSync(
      path.join(root, 'superpowers', 'plans', '2026-05-20-inflight.md'),
      '# In-flight plan\n\n- [ ] task\n- [x] task\n',
    );
    fs.writeFileSync(
      path.join(root, 'superpowers', 'specs', '2026-05-20-orphan-design.md'),
      '---\ntitle: Orphan\n---\n# Orphan\n',
    );

    const entries = scanDocs(path.join(root, 'superpowers'));
    const inflightSpec = entries.find((e) => e.slug === 'inflight' && e.kind === 'spec');
    const orphanSpec = entries.find((e) => e.slug === 'orphan');
    expect(inflightSpec.shipped).toBeUndefined();
    expect(orphanSpec.shipped).toBeUndefined();
  });

  it('scanDocs sort puts active in-flight ahead of a more-recent done plan', () => {
    fs.writeFileSync(
      path.join(root, 'superpowers', 'plans', '2026-05-20-active.md'),
      '# Active\n\n- [ ] t\n- [x] t\n',
    );
    fs.writeFileSync(
      path.join(root, 'superpowers', 'plans', '2026-05-25-finished.md'),
      '# Finished\n\n- [x] all done\n',
    );
    const entries = scanDocs(path.join(root, 'superpowers'));
    const planSlugs = entries.filter((e) => e.kind === 'plan').map((e) => e.slug);
    expect(planSlugs).toEqual(['active', 'finished']);
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd web.ui/backend && npm test -- --run __tests__/plans/scanner.test.js`
Expected: FAIL — the four new tests fail because `completedAt`, `shipped`, and the new sort aren't implemented yet.

- [ ] **Step 3: Implement the scanner changes**

Edit `web.ui/backend/plans/scanner.js`.

Replace the existing `PlanEntry` JSDoc typedef (currently at lines 19-27):

```js
/**
 * @typedef {Object} PlanEntry
 * @property {'spec'|'plan'} kind
 * @property {string} title
 * @property {string} date          ISO yyyy-mm-dd (from filename prefix)
 * @property {'open'|'in-flight'|'done'} status
 * @property {string} path          absolute path to the .md file
 * @property {string} slug
 * @property {PlanProgress} progress
 * @property {string | null} completedAt   ISO datetime; only set when status === 'done'
 * @property {boolean} [shipped]           true on a spec when a same-slug plan is done
 */
```

In `_scanDir` (currently the loop that builds `out`), populate `completedAt` from `fs.stat` mtime when status is done. Replace the existing `out.push({...})` block with:

```js
    const status = _statusOf(progress);
    const completedAt =
      status === 'done'
        ? fs.statSync(full).mtime.toISOString()
        : null;
    out.push({
      kind,
      title: _titleFrom(parsed, slug),
      date,
      status,
      path: full,
      slug,
      progress,
      completedAt,
    });
```

(Note: `status` is now computed once and reused, replacing the previous inline `_statusOf(progress)` call. `completedAt` is added; `shipped` is **not** set in `_scanDir` — that happens in `scanDocs` after both directories are walked.)

Replace the existing `scanDocs` function (currently at the bottom):

```js
/**
 * Scan `<superpowersRoot>/specs/*.md` and `<superpowersRoot>/plans/*.md`.
 * Returns a combined array sorted by status (active first), then date DESC,
 * then title ASC. Specs whose same-slug plan is done get `shipped: true`.
 *
 * @param {string} superpowersRoot  absolute path to docs/superpowers/
 * @returns {PlanEntry[]}
 */
export function scanDocs(superpowersRoot) {
  const plans = _scanDir(path.join(superpowersRoot, 'plans'), 'plan');
  const specs = _scanDir(path.join(superpowersRoot, 'specs'), 'spec');

  const shippedSlugs = new Set(
    plans.filter((p) => p.status === 'done').map((p) => p.slug),
  );
  for (const spec of specs) {
    if (shippedSlugs.has(spec.slug)) spec.shipped = true;
  }

  const all = [...specs, ...plans];
  all.sort((a, b) => {
    // Active (status !== 'done') before done.
    const aDone = a.status === 'done' ? 1 : 0;
    const bDone = b.status === 'done' ? 1 : 0;
    if (aDone !== bDone) return aDone - bDone;
    // Date DESC.
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    // Title ASC.
    return a.title.localeCompare(b.title);
  });
  return all;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd web.ui/backend && npm test -- --run __tests__/plans/scanner.test.js`
Expected: PASS — all original tests (the existing date-DESC sort test now exercises mixed-status, and a same-date all-active set, both of which still order by date then title — confirm pass) plus the four new ones.

If the existing "sorts entries by date DESC then title ASC" test (lines ~73-88) fails because all its entries are now `status:'open'` (no checkboxes → status 'open' → grouped as 'active'), it should still pass: all three are non-done, so the new sort degenerates to date DESC, title ASC — identical to the old behavior.

- [ ] **Step 5: Run the full backend suite to confirm no regressions**

Run: `cd web.ui/backend && npm test`
Expected: all tests PASS.

- [ ] **Step 6: Commit**

```bash
git add web.ui/backend/plans/scanner.js web.ui/backend/__tests__/plans/scanner.test.js
git commit -m "feat(plans): add completedAt + shipped fields and sink-done sort"
```

---

## Task 2: Frontend — extract shared `relTime` helper

**Files:**
- Create: `web.ui/frontend-react/src/lib/relativeTime.ts`
- Modify: `web.ui/frontend-react/src/components/EtsyStatusBanner.tsx`

Mechanical refactor. Move the existing inline `relTime` out of the banner so the new Plans card can import it without duplicating.

- [ ] **Step 1: Create the shared helper**

Create `web.ui/frontend-react/src/lib/relativeTime.ts`:

```ts
/**
 * Fuzzy relative-time formatter. Returns "" for null/invalid input.
 * Uses coarse buckets: just now / N min / N hr / N day(s) / N month(s) / N year(s).
 */
export function relTime(iso: string | null, now: Date = new Date()): string {
  if (!iso) return '';
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '';
  const sec = Math.round((now.getTime() - t) / 1000);
  if (sec < 60) return 'just now';
  if (sec < 3600) return `${Math.round(sec / 60)} min ago`;
  if (sec < 86400) return `${Math.round(sec / 3600)} hr ago`;
  const days = Math.round(sec / 86400);
  if (days < 30) return `${days} day(s) ago`;
  const months = Math.round(days / 30);
  if (months < 12) return `${months} month(s) ago`;
  return `${Math.round(days / 365)} year(s) ago`;
}
```

- [ ] **Step 2: Replace the inline `relTime` in EtsyStatusBanner**

Edit `web.ui/frontend-react/src/components/EtsyStatusBanner.tsx`.

Add this import next to the existing `getStatus` import (line 2):

```ts
import { relTime } from '../lib/relativeTime';
```

Delete the local `relTime` function (currently lines 9-18 — the function and its preceding blank line). The component's existing call sites (`relTime(status.lastHeartbeatAt)`, `relTime(status.lastSyncAt)`) work unchanged because the imported function has the same name and signature.

- [ ] **Step 3: Run banner tests + type-check**

Run: `cd web.ui/frontend-react && npm test -- --run src/components/__tests__/EtsyStatusBanner.test.tsx`
Expected: 6/6 PASS — the banner tests check behavior, not the function's location.

Run: `cd web.ui/frontend-react && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add web.ui/frontend-react/src/lib/relativeTime.ts web.ui/frontend-react/src/components/EtsyStatusBanner.tsx
git commit -m "refactor(ui): extract relTime helper into lib/relativeTime.ts"
```

---

## Task 3: Frontend — extend `PlanEntry` interface

**Files:**
- Modify: `web.ui/frontend-react/src/api/plans.ts`

- [ ] **Step 1: Add the two new fields**

Edit `web.ui/frontend-react/src/api/plans.ts`. Replace the existing `PlanEntry` interface (currently lines 30-38) with:

```ts
export interface PlanEntry {
  kind: PlanKind;
  slug: string;
  title: string;
  date: string | null;
  status: PlanStatus;
  path: string;
  progress?: PlanProgress;
  /** ISO datetime; only set on entries with status === 'done'. */
  completedAt: string | null;
  /** True on a spec when a same-slug plan has status === 'done'. */
  shipped?: boolean;
}
```

- [ ] **Step 2: Type-check**

Run: `cd web.ui/frontend-react && npx tsc --noEmit`
Expected: no errors. `Plans.tsx` doesn't yet reference the new fields, so adding them as optional/null-allowed doesn't break anything.

- [ ] **Step 3: Commit**

```bash
git add web.ui/frontend-react/src/api/plans.ts
git commit -m "feat(plans): add completedAt + shipped to PlanEntry type"
```

---

## Task 4: Frontend — Plans page tests (TDD)

**Files:**
- Test: `web.ui/frontend-react/src/__tests__/Plans.test.tsx`

Write tests first; they'll fail because the component doesn't implement the new rendering yet (Task 5 makes them pass).

- [ ] **Step 1: Write the three failing tests**

Create `web.ui/frontend-react/src/__tests__/Plans.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Plans from '../pages/Plans';
import type { PlanEntry } from '../api/plans';

const samples: PlanEntry[] = [
  {
    kind: 'spec',
    slug: 'shipped-thing',
    title: 'Shipped Thing Design',
    date: '2026-05-20',
    status: 'open',
    path: '/x/specs/2026-05-20-shipped-thing-design.md',
    completedAt: null,
    shipped: true,
  },
  {
    kind: 'spec',
    slug: 'open-thing',
    title: 'Open Thing Design',
    date: '2026-05-22',
    status: 'open',
    path: '/x/specs/2026-05-22-open-thing-design.md',
    completedAt: null,
  },
  {
    kind: 'plan',
    slug: 'in-flight-thing',
    title: 'In-Flight Thing',
    date: '2026-05-21',
    status: 'in-flight',
    path: '/x/plans/2026-05-21-in-flight-thing.md',
    progress: { open: 1, done: 2, total: 3, percent: 67 },
    completedAt: null,
  },
  {
    kind: 'plan',
    slug: 'done-thing',
    title: 'Done Thing',
    date: '2026-05-18',
    status: 'done',
    path: '/x/plans/2026-05-18-done-thing.md',
    progress: { open: 0, done: 5, total: 5, percent: 100 },
    completedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
  },
];

function mockListPlans(entries: PlanEntry[]): Response {
  return {
    ok: true,
    status: 200,
    json: async () => ({ entries }),
    text: async () => JSON.stringify({ entries }),
  } as unknown as Response;
}

describe('Plans page', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });
  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('renders a done plan card with the collapsed visual + completedAt copy', async () => {
    fetchSpy.mockResolvedValueOnce(mockListPlans(samples));
    render(
      <MemoryRouter>
        <Plans />
      </MemoryRouter>,
    );
    const doneCard = await screen.findByText('Done Thing');
    const cardEl = doneCard.closest('.plan-card');
    expect(cardEl).not.toBeNull();
    expect(cardEl?.classList.contains('plan-card--done-collapsed')).toBe(true);
    // Progress bar suppressed.
    expect(within(cardEl as HTMLElement).queryByRole('progressbar')).toBeNull();
    // CompletedAt line present.
    expect(within(cardEl as HTMLElement).getByText(/Completed\s*—/)).toBeInTheDocument();
  });

  it('renders a shipped spec with the green "shipped" badge instead of "open"', async () => {
    fetchSpy.mockResolvedValueOnce(mockListPlans(samples));
    render(
      <MemoryRouter>
        <Plans />
      </MemoryRouter>,
    );
    const specCard = (await screen.findByText('Shipped Thing Design')).closest('.plan-card');
    expect(specCard).not.toBeNull();
    const badges = within(specCard as HTMLElement).getAllByText(/shipped|open/i);
    expect(badges.some((b) => /shipped/i.test(b.textContent ?? ''))).toBe(true);
    expect(badges.some((b) => /^open$/i.test((b.textContent ?? '').trim()))).toBe(false);
  });

  it('renders an in-flight plan card with progress bar and no dimming', async () => {
    fetchSpy.mockResolvedValueOnce(mockListPlans(samples));
    render(
      <MemoryRouter>
        <Plans />
      </MemoryRouter>,
    );
    const inflightCard = (await screen.findByText('In-Flight Thing')).closest('.plan-card');
    expect(inflightCard).not.toBeNull();
    expect(inflightCard?.classList.contains('plan-card--done-collapsed')).toBe(false);
    expect(within(inflightCard as HTMLElement).getByRole('progressbar')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd web.ui/frontend-react && npm test -- --run src/__tests__/Plans.test.tsx`
Expected: FAIL — at least one of the assertions fails because the page doesn't yet render the `plan-card--done-collapsed` class, the "Completed —" line, or the "shipped" badge variant.

(Don't commit yet — the failing test stays in the working tree until Task 5 makes it pass.)

---

## Task 5: Frontend — Plans.tsx rendering + shell.css rules

**Files:**
- Modify: `web.ui/frontend-react/src/pages/Plans.tsx`
- Modify: `web.ui/frontend-react/src/styles/shell.css`

- [ ] **Step 1: Update `PlanCard` to handle the three new visual states**

Edit `web.ui/frontend-react/src/pages/Plans.tsx`.

Add the import for the shared helper near the top, after the existing imports:

```ts
import { relTime } from '../lib/relativeTime';
```

Replace the existing `PlanCard` function (currently lines 121-149) with:

```tsx
function PlanCard({ entry, onOpen }: PlanCardProps) {
  const isDonePlan = entry.kind === 'plan' && entry.status === 'done';
  const hasProgress =
    !isDonePlan &&
    entry.kind === 'plan' &&
    entry.progress != null &&
    (entry.progress.open + entry.progress.done) > 0;

  const cardClass = `plan-card plan-card--${entry.status}${
    isDonePlan ? ' plan-card--done-collapsed' : ''
  }`;

  return (
    <li className={cardClass}>
      <button
        type="button"
        className="plan-card__button"
        onClick={onOpen}
      >
        <div className="plan-card__title">{entry.title}</div>
        <div className="plan-card__meta">
          {entry.date && (
            <time className="plan-card__date" dateTime={entry.date}>
              {entry.date}
            </time>
          )}
          <StatusBadge entry={entry} />
        </div>
        {hasProgress && entry.progress && (
          <ProgressBar progress={entry.progress} />
        )}
        {isDonePlan && entry.completedAt && (
          <p className="plan-card__completed-at">
            Completed — {relTime(entry.completedAt)}
          </p>
        )}
      </button>
    </li>
  );
}
```

Replace the existing `StatusBadge` component (currently lines 151-156) with:

```tsx
function StatusBadge({ entry }: { entry: PlanEntry }) {
  if (entry.kind === 'spec' && entry.shipped) {
    return <span className="status-badge status-badge--shipped">shipped</span>;
  }
  const label = entry.status === 'in-flight' ? 'in flight' : entry.status;
  return (
    <span className={`status-badge status-badge--${entry.status}`}>{label}</span>
  );
}
```

(The signature change — from `{status}` to `{entry}` — flows through naturally since `PlanCard` is the only caller and passes the whole entry below.)

- [ ] **Step 2: Add the three new CSS rules**

Edit `web.ui/frontend-react/src/styles/shell.css`. Append the following block right after the existing `.status-badge--done` rule (currently around line 554):

```css
/* Plans page — completion treatment. */
.plan-card--done-collapsed { opacity: 0.55; transition: opacity 0.15s ease; }
.plan-card--done-collapsed:hover { opacity: 1; }
.plan-card__completed-at {
  margin: 0.4rem 0 0;
  font-size: 0.75rem;
  color: var(--muted);
  font-style: italic;
}
.status-badge--shipped {
  background: var(--badge-posted-bg);
  color: var(--badge-posted-fg);
}
```

(The shipped badge intentionally reuses the same green tokens as `--posted` / `--done` — they already harmonize with the rest of the theme.)

- [ ] **Step 3: Run the Plans tests to verify they pass**

Run: `cd web.ui/frontend-react && npm test -- --run src/__tests__/Plans.test.tsx`
Expected: PASS (3/3).

- [ ] **Step 4: Run the full frontend test suite**

Run: `cd web.ui/frontend-react && npm test`
Expected: all PASS — including the existing EtsyStatusBanner / EtsyCatalog / other suites.

- [ ] **Step 5: Type-check**

Run: `cd web.ui/frontend-react && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add web.ui/frontend-react/src/pages/Plans.tsx web.ui/frontend-react/src/styles/shell.css web.ui/frontend-react/src/__tests__/Plans.test.tsx
git commit -m "feat(plans): dim done cards, shipped-spec badge, completedAt copy"
```

---

## Self-Review

**Spec coverage check** — every requirement maps to a task:

- §1 backend `completedAt` field → Task 1.
- §1 backend `shipped` field → Task 1.
- §1 backend sort change (active first, then date DESC, then title ASC) → Task 1.
- §1 backend tests (four cases) → Task 1.
- §2 shared `relTime` helper → Task 2.
- §2 frontend `PlanEntry` interface extension → Task 3.
- §2 frontend done-collapsed plan card rendering → Task 5.
- §2 frontend "shipped" badge on specs → Task 5.
- §2 frontend tests (three cases) → Task 4.
- §2 CSS rules → Task 5.

No gaps.

**Placeholder scan:** every step has actual code or actual commands. No "TBD", "etc.", or "similar to…" references.

**Type consistency:**
- `completedAt: string | null` and `shipped?: boolean` — same shape in backend JSDoc (Task 1) and frontend interface (Task 3). ✓
- `StatusBadge` prop changes from `{status: PlanStatus}` to `{entry: PlanEntry}` in Task 5 — the only caller (`PlanCard`) is updated in the same task. ✓
- `relTime(iso, now?)` signature is identical between the original inline (EtsyStatusBanner) and the extracted file (Task 2). ✓
- Sort tuple is implemented exactly once (Task 1's `scanDocs`) and not duplicated in the frontend (which relies on server-side order). ✓
