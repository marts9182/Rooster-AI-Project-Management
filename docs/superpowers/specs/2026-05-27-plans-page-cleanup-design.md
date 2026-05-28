# Plans Page Completion Cleanup — Dashboard Design

**Date:** 2026-05-27
**Status:** Draft for review
**Mini-spec 2 of 3** in the dashboard-improvements brainstorm (Etsy → Plans → KDP).

## Goal

Stop completed plans from competing for attention with active work on the dashboard's `/specs & plans` page, and surface the relationship between a spec and its already-shipped implementation. Today the page mixes `done`, `in-flight`, and `open` entries in date order — as the catalog grows past ~10 plans, the noise will drown the active ones.

## Background

The page is implemented at [`web.ui/frontend-react/src/pages/Plans.tsx`](../../web.ui/frontend-react/src/pages/Plans.tsx) and reads from [`web.ui/backend/plans/scanner.js`](../../web.ui/backend/plans/scanner.js). The scanner already computes a `status: 'open' | 'in-flight' | 'done'` per entry from checkbox counts in the markdown body, and `PlanCard` already renders a progress bar for plans with checkboxes. So this is **presentation-layer** work: surface what the scanner already knows, plus derive two small new signals (spec-shipped flag, completion timestamp).

## Section 1 — Backend scanner changes

**File:** `web.ui/backend/plans/scanner.js`. **Tests:** extend `web.ui/backend/__tests__/plans/scanner.test.js`.

### New fields on `PlanEntry`

```js
/**
 * @typedef {Object} PlanEntry
 * @property {'spec'|'plan'} kind
 * @property {string} title
 * @property {string} date          ISO yyyy-mm-dd (from filename prefix)
 * @property {'open'|'in-flight'|'done'} status
 * @property {string} path
 * @property {string} slug
 * @property {PlanProgress} progress
 * @property {string | null} completedAt   // NEW — ISO datetime; only set when status === 'done'
 * @property {boolean} [shipped]           // NEW — true on kind === 'spec' when a same-slug plan is 'done'
 */
```

- `completedAt` — populated via `fs.statSync(path).mtime.toISOString()` only when `_statusOf(progress) === 'done'`. Otherwise `null`. mtime is approximate (the moment the last `[x]` got saved) but good enough for "Completed — 3 days ago"-style copy.
- `shipped` — set on specs only. Absent on plan entries. Computed during `scanDocs` by first walking the plan list and collecting the slugs of entries whose status is `done`, then setting `shipped: true` on any spec whose slug is in that set.

### Algorithm change in `scanDocs(superpowersRoot)`

The current two-step (scan specs, scan plans, combine, sort) becomes a three-step:

1. Scan `plans/` first.
2. Build `shippedSlugs = new Set(plans.filter(p => p.status === 'done').map(p => p.slug))`.
3. Scan `specs/`, and for each spec entry: if `shippedSlugs.has(entry.slug)`, set `entry.shipped = true`.
4. Concatenate and sort.

### New sort

Today's sort: date DESC, title ASC.

New sort (single key tuple, applied to the combined list):

1. Active before done: `status === 'done'` → 1, else 0. Ascending.
2. Date DESC.
3. Title ASC.

Done entries sink to the bottom; relative order among active and among done preserves the existing date-DESC behavior.

### Slug-matching contract

The existing `_slugFromFilename(filename)` regex strips `-design` and `-implementation` suffixes:

- `2026-05-27-etsy-dashboard-port-design.md` → slug `etsy-dashboard-port`
- `2026-05-27-etsy-dashboard-port.md` → slug `etsy-dashboard-port` (no suffix, matches the non-greedy `.+?` group)

So a spec/plan pair authored on the same date with the canonical `-design`/no-suffix convention will match by slug. Pairs that drift from this convention (e.g. spec dated 2026-05-20 with a plan dated 2026-05-22 under a renamed slug) won't link — that's acceptable; ad-hoc cross-linking is out of scope.

### Tests to add to `scanner.test.js`

1. `scanDocs` sets `completedAt` to the file's mtime ISO when status is done; leaves it `null` otherwise. (Use `fs.utimesSync` on a temp file to pin mtime deterministically.)
2. `scanDocs` sets `shipped: true` on a spec when a same-slug plan exists with all checkboxes done.
3. `scanDocs` leaves `shipped` undefined on a spec when (a) no matching plan exists, or (b) the matching plan still has open checkboxes.
4. `scanDocs` sort puts an active in-flight plan ahead of a done plan with a newer date.

## Section 2 — Frontend UI

**File:** `web.ui/frontend-react/src/pages/Plans.tsx`. **CSS:** `web.ui/frontend-react/src/styles/shell.css` — that's where the existing `plan-card`, `plan-card__progress`, and `status-badge` rules live (no standalone plans stylesheet). New rules append at the bottom of the existing plans block in that file.

### Shared relative-time helper

Extract the existing `relTime` helper from `EtsyStatusBanner.tsx` into `web.ui/frontend-react/src/lib/relativeTime.ts`:

```ts
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

Replace the inline `relTime` in `EtsyStatusBanner.tsx` with an import. Same for the new Plans card.

### `PlanCard` rendering rules

| Condition | Visual |
|---|---|
| `kind === 'plan' && status === 'done'` | `plan-card--done-collapsed`. Card opacity 0.55. Hover restores opacity 1.0. Progress bar suppressed. Adds a `<p className="plan-card__completed-at">Completed — {relTime(entry.completedAt)}</p>` line below the meta row. Status badge stays. |
| `kind === 'spec' && entry.shipped === true` | Status badge replaced with a green "shipped" badge (`status-badge--shipped`). No dimming — shipped specs remain visually prominent because they're useful reference material. |
| All other entries | Unchanged from today. |

### Sort

Server-side sort drives ordering. The frontend's existing `useMemo` filter by `kind` operates on a list that's already in the new order — no additional client-side sort needed.

### Tests

Create new test file `web.ui/frontend-react/src/__tests__/Plans.test.tsx` (matches the existing `EtsyCatalog.test.tsx` convention — top-level `__tests__/` folder, not `pages/__tests__/`). No prior Plans page test exists. One test per state:

1. Done-collapsed plan card: renders with the `plan-card--done-collapsed` class, no progress bar visible, "Completed — `<time>`" line present.
2. Shipped spec card: renders the green "shipped" badge instead of "open".
3. Active in-flight plan card: unchanged — progress bar present, no dimming.

## Section 3 — Out of scope (explicit)

- No filter/toggle UI. Visual sink + collapse handles the noise for the current entry count.
- No per-task completion timestamps. Per-checkbox completion times would require `git blame` per line and is expensive on every page load.
- No cross-project linking. Spec↔plan matching is by slug only; no fuzzy matching, no manual override.
- No backwards-compat shim around the `completedAt` / `shipped` API shape. Field additions don't break the existing frontend; older bundles will just ignore them.

## Risks

- **mtime drifts when files are touched without content change.** Acceptable: re-saving a markdown file in an editor or running git pull will bump mtime. The "Completed — X days ago" copy is intentionally fuzzy; we don't promise it's the moment the last checkbox got ticked. If it ever needs to be precise, we'd source the timestamp from `git log -1 --format=%cI -- <file>` — out of scope here.
- **Spec/plan slug drift.** Authors who diverge from the dated-slug-with-`-design`-suffix convention won't get the "shipped" badge. The plan filename convention is enforced by the writing-plans skill and the spec filename by the brainstorming skill, so this should self-correct.
