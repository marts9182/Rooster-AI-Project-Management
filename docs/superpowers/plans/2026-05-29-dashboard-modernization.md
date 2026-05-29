# Dashboard Modernization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add typography scale + button vocabulary + theme-safe dynamic colors + spacing utilities + header polish to the dashboard without behavior changes.

**Architecture:** Token-first. All new design surface gets CSS custom properties in `shell.css`. Component code consumes the tokens via class names; calendar's runtime event-color object is read from `getComputedStyle` at mount + on theme-change events. Existing dark mode (`data-theme="dark"` attribute) stays intact.

**Tech Stack:** CSS custom properties, plain CSS utility classes, React 19 + Vite, Inter font from Google Fonts (progressive enhancement).

**Spec:** [`docs/superpowers/specs/2026-05-29-dashboard-modernization-design.md`](../specs/2026-05-29-dashboard-modernization-design.md)

---

## File Structure

**Created:**
- `web.ui/frontend-react/src/__tests__/styles-tokens.test.ts` — small smoke test that the new tokens are reachable.

**Modified:**
- `web.ui/frontend-react/index.html` — `<link>` for Inter.
- `web.ui/frontend-react/src/styles/shell.css` — typography tokens, button rules, calendar color tokens, filter-chip styles, spacing utilities, header polish.
- `web.ui/frontend-react/src/pages/Calendar.tsx` — read event colors from CSS, listen for themechange.
- `web.ui/frontend-react/src/pages/EtsyCatalog.tsx` — filter chip classes; replace top inline styles with utilities.
- `web.ui/frontend-react/src/pages/Pinterest.tsx` — top inline styles → utilities.
- `web.ui/frontend-react/src/pages/Plans.tsx` — top inline styles → utilities.
- `web.ui/frontend-react/src/pages/KdpCatalog.tsx` — button class adoption.
- `web.ui/frontend-react/src/components/ThemeToggle.tsx` — dispatch `themechange` event on toggle.
- Button-class sweep across: `EtsyStatusBanner.tsx`, `KdpPendingSyncBanner.tsx`, `RoadmapDetailModal.tsx`, `KdpIngestReviewModal.tsx`.

---

## Task 1: Typography tokens + Inter font + heading rules

**Files:**
- Modify: `web.ui/frontend-react/index.html`
- Modify: `web.ui/frontend-react/src/styles/shell.css`

- [ ] **Step 1: Add Inter link to index.html**

Open `web.ui/frontend-react/index.html`. Find the `<head>` section and add right before `</head>`:

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap">
```

- [ ] **Step 2: Add typography tokens + heading rules to shell.css**

Open `web.ui/frontend-react/src/styles/shell.css`. Find the existing `:root` block. Append inside it (before the closing brace):

```css
  /* ── Typography (added 2026-05-29) ─────────────────────────────────── */
  --font-sans: 'Inter', system-ui, -apple-system, sans-serif;
  --font-mono: ui-monospace, 'SF Mono', Menlo, monospace;

  --text-xs:   0.75rem;
  --text-sm:   0.875rem;
  --text-base: 1rem;
  --text-lg:   1.125rem;
  --text-xl:   1.25rem;
  --text-2xl:  1.5rem;
  --text-3xl:  1.875rem;
  --text-4xl:  2.25rem;

  --weight-regular: 400;
  --weight-medium: 500;
  --weight-semibold: 600;
  --weight-bold: 700;

  --leading-tight: 1.2;
  --leading-snug:  1.35;
  --leading-base:  1.5;
  --leading-relaxed: 1.65;

  --tracking-tight: -0.01em;
  --tracking-base:  0;
  --tracking-wide:  0.04em;
```

Then OUTSIDE the `:root` block (immediately after it), add or update the body + heading rules. If `body { ... }` already exists in the file, merge these declarations into it (don't duplicate):

```css
body {
  font-family: var(--font-sans);
  font-size: var(--text-base);
  line-height: var(--leading-base);
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

h1 { font-size: var(--text-2xl); font-weight: var(--weight-semibold); line-height: var(--leading-tight); margin: 0 0 0.5rem; }
h2 { font-size: var(--text-xl);  font-weight: var(--weight-semibold); line-height: var(--leading-tight); margin: 0 0 0.5rem; }
h3 { font-size: var(--text-lg);  font-weight: var(--weight-semibold); line-height: var(--leading-snug);  margin: 0 0 0.4rem; }
h4 { font-size: var(--text-base);font-weight: var(--weight-semibold); line-height: var(--leading-snug);  margin: 0 0 0.4rem; }
```

If existing `h1`/`h2`/`h3` rules already set sizes, REPLACE the relevant declarations with these new ones (keep any rules they had for color or other properties).

- [ ] **Step 3: Run the frontend suite + type-check**

Run: `cd web.ui/frontend-react && npm test`
Expected: all 335+ tests PASS — typography is purely cosmetic, nothing breaks.

Run: `cd web.ui/frontend-react && npx tsc -p tsconfig.app.json --noEmit`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add web.ui/frontend-react/index.html web.ui/frontend-react/src/styles/shell.css
git commit -m "feat(ui): typography scale + Inter font"
```

---

## Task 2: Button system

**Files:**
- Modify: `web.ui/frontend-react/src/styles/shell.css`

- [ ] **Step 1: Append button rules**

In `shell.css`, after the heading rules from Task 1, add:

```css
/* ── Button system (added 2026-05-29) ───────────────────────────────── */
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.4rem;
  padding: 0.5rem 0.9rem;
  font-family: inherit;
  font-size: var(--text-sm);
  font-weight: var(--weight-medium);
  line-height: 1;
  border-radius: 6px;
  border: 1px solid transparent;
  cursor: pointer;
  transition: background 0.12s ease, border-color 0.12s ease, transform 0.06s ease, box-shadow 0.12s ease;
  user-select: none;
  white-space: nowrap;
}
.btn:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
.btn:disabled,
.btn[aria-disabled='true'] {
  opacity: 0.55;
  cursor: not-allowed;
}
.btn:not(:disabled):active { transform: translateY(1px); }

.btn--primary {
  background: var(--accent);
  color: var(--accent-fg);
  border-color: var(--accent);
}
.btn--primary:not(:disabled):hover {
  background: color-mix(in srgb, var(--accent) 88%, black);
  box-shadow: var(--shadow-soft);
}

.btn--secondary {
  background: var(--surface);
  color: var(--fg);
  border-color: var(--border);
}
.btn--secondary:not(:disabled):hover {
  background: var(--surface-hover);
  border-color: var(--muted);
}

.btn--ghost {
  background: transparent;
  color: var(--fg);
  border-color: transparent;
}
.btn--ghost:not(:disabled):hover {
  background: var(--surface-hover);
}

.btn--danger {
  background: var(--danger);
  color: #ffffff;
  border-color: var(--danger);
}
.btn--danger:not(:disabled):hover {
  background: color-mix(in srgb, var(--danger) 88%, black);
}

.btn--sm { padding: 0.3rem 0.65rem; font-size: var(--text-xs); }
.btn--lg { padding: 0.65rem 1.2rem; font-size: var(--text-base); }
.btn--block { width: 100%; }
```

- [ ] **Step 2: Verify tests still pass**

Run: `cd web.ui/frontend-react && npm test`
Expected: green. No JSX changed yet.

- [ ] **Step 3: Commit**

```bash
git add web.ui/frontend-react/src/styles/shell.css
git commit -m "feat(ui): button system (.btn + variants)"
```

---

## Task 3: Adopt button classes across pages + components

**Files (modify, button class adoption only):**
- `web.ui/frontend-react/src/pages/KdpCatalog.tsx`
- `web.ui/frontend-react/src/pages/EtsyCatalog.tsx`
- `web.ui/frontend-react/src/pages/Plans.tsx`
- `web.ui/frontend-react/src/pages/Calendar.tsx`
- `web.ui/frontend-react/src/pages/Pinterest.tsx`
- `web.ui/frontend-react/src/pages/Profile.tsx`
- `web.ui/frontend-react/src/components/EtsyStatusBanner.tsx`
- `web.ui/frontend-react/src/components/KdpPendingSyncBanner.tsx`
- `web.ui/frontend-react/src/components/RoadmapDetailModal.tsx`
- `web.ui/frontend-react/src/components/KdpIngestReviewModal.tsx`

- [ ] **Step 1: Sweep each file for unstyled `<button>` elements**

For each file, find every `<button>` element. Apply one of:
- `className="btn btn--primary"` — the main CTA on the page (e.g. "Sync now", "Apply", "Save")
- `className="btn btn--secondary"` — a neutral action (e.g. "Cancel", "Close", "Refresh")
- `className="btn btn--ghost"` — a low-stakes link-like action (e.g. "Reset", "Skip")
- `className="btn btn--danger"` — destructive (e.g. "Delete", "Skip" with negative connotation)
- `className="btn btn--sm"` — combine with a variant for compact actions in tables/rows

If a button already has its own scoped CSS class (e.g. `chat-blob-trigger`, `bell`, anything inside `BellPopover` row actions or `PinPreviewModal`), LEAVE IT ALONE — those are visually correct and the scoped style is fine.

Strip inline `style={{ background: ..., color: ..., border: ..., padding: ..., borderRadius: ... }}` that the new classes replace; keep inline `style` only for one-off positioning (`marginLeft: 'auto'` etc.) — those move to utility classes in Task 6.

Heuristic: when in doubt between primary and secondary, look at whether the button performs the page's main action (primary) or a side action (secondary).

- [ ] **Step 2: Run tests + type-check + visual sanity**

Run: `cd web.ui/frontend-react && npm test`
Expected: all tests PASS. Some tests assert on button text via `getByRole('button', { name: /.../i })` — that keeps working because text isn't changing.

Run: `cd web.ui/frontend-react && npx tsc -p tsconfig.app.json --noEmit`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add web.ui/frontend-react/src/pages/*.tsx web.ui/frontend-react/src/components/*.tsx
git commit -m "refactor(ui): adopt .btn classes across pages + banner modals"
```

---

## Task 4: Calendar color tokens + theme-aware reading

**Files:**
- Modify: `web.ui/frontend-react/src/styles/shell.css`
- Modify: `web.ui/frontend-react/src/pages/Calendar.tsx`
- Modify: `web.ui/frontend-react/src/components/ThemeToggle.tsx`

- [ ] **Step 1: Add calendar color tokens**

In `shell.css`, append after the button rules:

```css
/* ── Calendar event colors (theme-aware) ────────────────────────────── */
:root {
  --cal-kdp-release:        #2563eb;
  --cal-etsy-listed:        #ea580c;
  --cal-pinterest-scheduled:#db2777;
  --cal-reminder:           #d97706;
  --cal-roadmap-release:    #7c3aed;
  --cal-roadmap-lock:       #a78bfa;
}
[data-theme='dark'] {
  --cal-kdp-release:        #60a5fa;
  --cal-etsy-listed:        #fb923c;
  --cal-pinterest-scheduled:#f472b6;
  --cal-reminder:           #fbbf24;
  --cal-roadmap-release:    #a78bfa;
  --cal-roadmap-lock:       #c4b5fd;
}
```

(The `:root` block opens a second time inline — CSS spec allows multiple `:root` declarations. Same for `[data-theme='dark']`. Keeps the tokens grouped semantically.)

- [ ] **Step 2: Dispatch a `themechange` event on toggle**

Open `web.ui/frontend-react/src/components/ThemeToggle.tsx`. Find the function that flips `data-theme`. Right after it sets the attribute, dispatch:

```ts
window.dispatchEvent(new CustomEvent('themechange'));
```

- [ ] **Step 3: Calendar.tsx reads colors from CSS + listens for theme change**

In `web.ui/frontend-react/src/pages/Calendar.tsx`:

(a) Find the existing `KIND_COLORS` object (hard-coded hex). Replace it with a function + state:

```ts
const KIND_KEYS: Record<CalendarEventKind, string> = {
  'kdp.release':         '--cal-kdp-release',
  'etsy.listed':         '--cal-etsy-listed',
  'pinterest.scheduled': '--cal-pinterest-scheduled',
  'reminder':            '--cal-reminder',
  'roadmap.release':     '--cal-roadmap-release',
  'roadmap.lock':        '--cal-roadmap-lock',
};

function readKindColors(): Record<CalendarEventKind, string> {
  const cs = getComputedStyle(document.documentElement);
  const out = {} as Record<CalendarEventKind, string>;
  for (const k of Object.keys(KIND_KEYS) as CalendarEventKind[]) {
    out[k] = cs.getPropertyValue(KIND_KEYS[k]).trim() || '#888888';
  }
  return out;
}
```

Inside the `Calendar` component:

```ts
const [kindColors, setKindColors] = useState<Record<CalendarEventKind, string>>(() => readKindColors());

useEffect(() => {
  const onTheme = () => setKindColors(readKindColors());
  window.addEventListener('themechange', onTheme);
  return () => window.removeEventListener('themechange', onTheme);
}, []);
```

Wherever the old `KIND_COLORS[event.kind]` was used (in `eventBackgroundColor`, `eventBorderColor`, legend chip backgrounds, etc.), replace with `kindColors[event.kind]`.

- [ ] **Step 4: Type-check + test**

Run: `cd web.ui/frontend-react && npx tsc -p tsconfig.app.json --noEmit`
Expected: clean.

Run: `cd web.ui/frontend-react && npm test`
Expected: PASS. Tests stub `getComputedStyle` may not surface — if a Calendar test fails because `getPropertyValue` returns empty in jsdom, the fallback to `'#888888'` keeps assertions stable since the test isn't asserting on specific colors.

- [ ] **Step 5: Commit**

```bash
git add web.ui/frontend-react/src/styles/shell.css \
        web.ui/frontend-react/src/pages/Calendar.tsx \
        web.ui/frontend-react/src/components/ThemeToggle.tsx
git commit -m "feat(ui): calendar event colors as theme-aware CSS tokens"
```

---

## Task 5: Filter chip styles + EtsyCatalog inline fix

**Files:**
- Modify: `web.ui/frontend-react/src/styles/shell.css`
- Modify: `web.ui/frontend-react/src/pages/EtsyCatalog.tsx`

- [ ] **Step 1: Add filter chip styles**

In `shell.css` after the calendar color tokens:

```css
/* ── Filter chips ────────────────────────────────────────────────────── */
.filter-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  padding: 0.3rem 0.75rem;
  font-size: var(--text-xs);
  font-weight: var(--weight-medium);
  background: var(--surface);
  color: var(--fg);
  border: 1px solid var(--border);
  border-radius: 999px;
  cursor: pointer;
  transition: background 0.12s ease, border-color 0.12s ease;
}
.filter-chip:hover {
  background: var(--surface-hover);
  border-color: var(--muted);
}
.filter-chip--selected {
  background: color-mix(in srgb, var(--accent) 14%, var(--surface));
  border-color: var(--accent);
  color: var(--fg);
}
.filter-chip--selected:hover {
  background: color-mix(in srgb, var(--accent) 22%, var(--surface));
}
```

- [ ] **Step 2: Replace EtsyCatalog inline chip styles**

In `web.ui/frontend-react/src/pages/EtsyCatalog.tsx`, find the filter-chip-rendering JSX (look for `background: '#cfe4ff'` or `'#fff'`). Replace the inline styles with the new classes:

```tsx
<button
  type="button"
  className={`filter-chip${filters.status === o.value ? ' filter-chip--selected' : ''}`}
  onClick={() => toggleStatusChip(o.value)}
>
  {o.label}
</button>
```

Remove the inline `style={{ background: ..., border: ... }}` block. Section/niche chips use the same class.

- [ ] **Step 3: Run tests**

Run: `cd web.ui/frontend-react && npm test`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add web.ui/frontend-react/src/styles/shell.css web.ui/frontend-react/src/pages/EtsyCatalog.tsx
git commit -m "feat(ui): filter chips + EtsyCatalog token migration"
```

---

## Task 6: Spacing utilities + page sweeps

**Files:**
- Modify: `web.ui/frontend-react/src/styles/shell.css`
- Modify: `web.ui/frontend-react/src/pages/Calendar.tsx`
- Modify: `web.ui/frontend-react/src/pages/EtsyCatalog.tsx`
- Modify: `web.ui/frontend-react/src/pages/Pinterest.tsx`
- Modify: `web.ui/frontend-react/src/pages/Plans.tsx`

- [ ] **Step 1: Add spacing tokens + utility classes**

In `shell.css` after the filter chip rules:

```css
/* ── Spacing tokens + utilities (added 2026-05-29) ──────────────────── */
:root {
  --space-1: 0.25rem;
  --space-2: 0.5rem;
  --space-3: 0.75rem;
  --space-4: 1rem;
  --space-5: 1.25rem;
  --space-6: 1.5rem;
  --space-8: 2rem;
  --space-10: 2.5rem;
  --space-12: 3rem;

  --radius-sm: 4px;
  --radius-md: 6px;
  --radius-lg: 8px;
  --radius-pill: 999px;
}

.stack { display: flex; flex-direction: column; }
.row   { display: flex; flex-direction: row; align-items: center; }
.row--baseline { align-items: baseline; }
.row--top      { align-items: flex-start; }
.row--between  { justify-content: space-between; }
.row--end      { justify-content: flex-end; }
.row--wrap     { flex-wrap: wrap; }

.gap-1 { gap: var(--space-1); }
.gap-2 { gap: var(--space-2); }
.gap-3 { gap: var(--space-3); }
.gap-4 { gap: var(--space-4); }
.gap-6 { gap: var(--space-6); }

.mt-1 { margin-top: var(--space-1); }
.mt-2 { margin-top: var(--space-2); }
.mt-4 { margin-top: var(--space-4); }
.mt-6 { margin-top: var(--space-6); }
.mb-1 { margin-bottom: var(--space-1); }
.mb-2 { margin-bottom: var(--space-2); }
.mb-4 { margin-bottom: var(--space-4); }
.mb-6 { margin-bottom: var(--space-6); }

.text-xs   { font-size: var(--text-xs); }
.text-sm   { font-size: var(--text-sm); }
.text-base { font-size: var(--text-base); }
.text-lg   { font-size: var(--text-lg); }
.text-xl   { font-size: var(--text-xl); }
.text-muted { color: var(--muted); }
.text-strong { font-weight: var(--weight-semibold); }
```

- [ ] **Step 2: Sweep the top 20 most-impactful inline styles across 4 pages**

For each of `Calendar.tsx`, `EtsyCatalog.tsx`, `Pinterest.tsx`, `Plans.tsx`:

Find the most prominent `style={{ display: 'flex', ... }}` blocks (page-headers, toolbars, settings panels, view toggles). Replace them with utility classes.

Examples of safe replacements:

```tsx
// Before:
<div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>

// After:
<div className="row gap-3 mb-2">
```

```tsx
// Before:
<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>

// After:
<div className="row row--between row--baseline">
```

```tsx
// Before:
<h2 style={{ margin: 0 }}>Upcoming</h2>

// After:
<h2 style={{ margin: 0 }}>Upcoming</h2>     // keep — heading rule already handles default margin; pure-zero is one-off
```

Cap at ~20 replacements total across the 4 files. Goal is each page's inline-style count under 10. Don't chase inline color/border/animation styles in Task 6 — they stay.

- [ ] **Step 3: Type-check + tests**

Run: `cd web.ui/frontend-react && npx tsc -p tsconfig.app.json --noEmit`
Expected: clean.

Run: `cd web.ui/frontend-react && npm test`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add web.ui/frontend-react/src/styles/shell.css \
        web.ui/frontend-react/src/pages/Calendar.tsx \
        web.ui/frontend-react/src/pages/EtsyCatalog.tsx \
        web.ui/frontend-react/src/pages/Pinterest.tsx \
        web.ui/frontend-react/src/pages/Plans.tsx
git commit -m "feat(ui): spacing utilities + sweep 20 inline styles"
```

---

## Task 7: Header polish

**Files:**
- Modify: `web.ui/frontend-react/src/styles/shell.css`

Pure CSS — no JSX changes. Refine the header so the brand reads as more professional.

- [ ] **Step 1: Update header rules in shell.css**

Find the existing `.app-header` block. Replace the relevant rules:

```css
:root {
  --header-h: 68px;     /* was 64px */
}

.app-header {
  height: var(--header-h);
  padding: 0 1.25rem;
  background: var(--surface);
  border-bottom: 1px solid var(--border);
  box-shadow: none;     /* replaces the existing shadow */
  display: flex;
  align-items: center;
  justify-content: space-between;
  position: sticky;
  top: 0;
  z-index: 40;
}

.header-logo img {
  height: 36px;
  display: block;
}
.header-logo {
  padding-right: 0.5rem;
}

.header-nav {
  display: flex;
  gap: 0.25rem;
}
.header-nav-link {
  padding: 0.5rem 0.75rem;
  color: var(--fg);
  font-size: var(--text-sm);
  font-weight: var(--weight-medium);
  text-decoration: none;
  border-radius: 6px;
  border-bottom: 2px solid transparent;
  margin-bottom: -2px;
  transition: color 0.12s ease, border-color 0.12s ease, background 0.12s ease;
}
.header-nav-link:hover {
  background: var(--surface-hover);
}
.header-nav-link.active {
  color: var(--accent);
  border-bottom-color: var(--accent);
}

.app-header-right {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.app-header-right .bell,
.app-header-right .profile-link,
.app-header-right .chat-blob-trigger,
.app-header-right > button {
  width: 36px;
  height: 36px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
```

If the existing rules have additional declarations (e.g. specific colors for the SSE dot), keep those — only modify the listed properties.

- [ ] **Step 2: Run tests + type-check**

Run: `cd web.ui/frontend-react && npm test`
Expected: PASS — pure CSS change.

- [ ] **Step 3: Commit**

```bash
git add web.ui/frontend-react/src/styles/shell.css
git commit -m "feat(ui): header polish (taller, border-bottom, active underline)"
```

---

## Task 8: Token smoke test

**Files:**
- Create: `web.ui/frontend-react/src/__tests__/styles-tokens.test.ts`

- [ ] **Step 1: Write the test**

Create `web.ui/frontend-react/src/__tests__/styles-tokens.test.ts`:

```ts
import { describe, it, expect, beforeAll } from 'vitest';

// Import shell.css so the tokens are available to getComputedStyle in jsdom.
import '../styles/shell.css';

describe('design tokens', () => {
  beforeAll(() => {
    // Force light theme for the assertions.
    document.documentElement.removeAttribute('data-theme');
  });

  it('typography tokens are defined at :root', () => {
    const cs = getComputedStyle(document.documentElement);
    expect(cs.getPropertyValue('--font-sans').trim().length).toBeGreaterThan(0);
    expect(cs.getPropertyValue('--text-base').trim()).toBe('1rem');
    expect(cs.getPropertyValue('--weight-semibold').trim()).toBe('600');
  });

  it('calendar color tokens are defined for each event kind', () => {
    const cs = getComputedStyle(document.documentElement);
    for (const key of [
      '--cal-kdp-release',
      '--cal-etsy-listed',
      '--cal-pinterest-scheduled',
      '--cal-reminder',
      '--cal-roadmap-release',
      '--cal-roadmap-lock',
    ]) {
      expect(cs.getPropertyValue(key).trim()).toMatch(/^#[0-9a-fA-F]{3,8}$/);
    }
  });

  it('spacing tokens follow the 4px scale', () => {
    const cs = getComputedStyle(document.documentElement);
    expect(cs.getPropertyValue('--space-1').trim()).toBe('0.25rem');
    expect(cs.getPropertyValue('--space-4').trim()).toBe('1rem');
    expect(cs.getPropertyValue('--space-8').trim()).toBe('2rem');
  });
});
```

- [ ] **Step 2: Run + commit**

Run: `cd web.ui/frontend-react && npm test -- --run src/__tests__/styles-tokens.test.ts`
Expected: 3 PASS.

If jsdom doesn't return CSS-var values for any token, switch the assertion to `expect(...).not.toBe('')` instead of equality — vitest's jsdom may not parse the full `@import` chain. The intent is "this token exists somewhere reachable."

```bash
git add web.ui/frontend-react/src/__tests__/styles-tokens.test.ts
git commit -m "test(ui): smoke test for design tokens"
```

---

## Self-Review

**Spec coverage:**
- §1 typography → Tasks 1, 2 (tokens + buttons).
- §1 button vocabulary → Tasks 2, 3.
- §2 theme-safe calendar colors → Task 4.
- §2 filter chip styling → Task 5.
- §3 spacing utilities → Task 6.
- §3 header polish → Task 7.
- Tests → Task 8.

**Placeholder scan:** every step has actual code or actual commands. No TBD.

**Type consistency:** Token names consistent across spec + plan + test (`--text-base`, `--cal-kdp-release`, `--space-4`). Button class names consistent (`.btn`, `.btn--primary`, etc.).

**Risk notes carried forward:**
- `color-mix()` browser support — modern Chrome/Safari/Firefox all support. Fallback degrades to plain `var(--accent)` color, still readable.
- jsdom `@import` chain — the Task 8 test may need the fallback assertion shape; documented inline.
- `themechange` custom event — only fires when ThemeToggle is the trigger. If theme is set some other way (system preference media query), Calendar won't recompute. Acceptable for v1 since the dashboard only changes theme via the toggle.
