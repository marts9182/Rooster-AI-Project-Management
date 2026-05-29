# Dashboard Modernization — Visual + Component Design

**Date:** 2026-05-29
**Status:** Draft (auto-approved; no clarifying questions per user direction)

## Goal

Take the Rooster Dashboard from "functional and dense" to "modern and professional" via three focused token + component passes — without changing any behavior, breaking dark mode, or touching the data layer. The audit identified that the foundation is sound (color + dark-mode tokens are well-structured) but the surface layer is uneven: no typography scale, inconsistent buttons, hard-coded calendar colors, ~50 inline-style violations.

## Background (audit summary)

- Color/shadow/spacing tokens already exist at `:root` and `[data-theme="dark"]` in `web.ui/frontend-react/src/styles/shell.css` and are used consistently for static UI.
- Dark mode works via `data-theme="dark"` attribute on `<html>` — preserved.
- 16 files contain inline hex colors (Calendar's `KIND_COLORS`, Etsy filter chip selected state, profile color swatch, ChatBlob gradients).
- ~50 inline `style={{...}}` for spacing/alignment scattered across pages.
- No typography scale — sizes ad-hoc (1.5rem, 1rem, 0.9rem, 0.85rem, 0.75rem in different places).
- No shared button vocabulary — same CTA looks different on KDP vs Etsy vs Pinterest.
- FullCalendar's own CSS layers over our tokens (acceptable; the library is what it is).
- ChatBlob's hand-tuned SVG gradient stays as-is (decorative, not data).

## Section 1 — Typography scale + button vocabulary

### Typography tokens

Add to `:root` in `shell.css` (no dark-mode override needed — these are font-family/size/weight, not color):

```css
:root {
  /* Typography scale — 8-step modular */
  --font-sans: 'Inter', system-ui, -apple-system, sans-serif;
  --font-mono: ui-monospace, 'SF Mono', Menlo, monospace;

  --text-xs:   0.75rem;   /* 12px — labels, badges, metadata */
  --text-sm:   0.875rem;  /* 14px — secondary body, table cells */
  --text-base: 1rem;      /* 16px — body */
  --text-lg:   1.125rem;  /* 18px — sub-headers */
  --text-xl:   1.25rem;   /* 20px — card titles */
  --text-2xl:  1.5rem;    /* 24px — page H1 */
  --text-3xl:  1.875rem;  /* 30px — hero / stat values */
  --text-4xl:  2.25rem;   /* 36px — large stat values */

  --weight-regular: 400;
  --weight-medium: 500;
  --weight-semibold: 600;
  --weight-bold: 700;

  --leading-tight: 1.2;
  --leading-snug:  1.35;
  --leading-base:  1.5;
  --leading-relaxed: 1.65;

  --tracking-tight: -0.01em;  /* large display */
  --tracking-base:  0;
  --tracking-wide:  0.04em;   /* uppercase labels */
}

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

`Inter` is loaded from Google Fonts via a `<link>` in `index.html`. The system-ui fallback chain ensures no FOUT — Inter is a progressive enhancement.

### Button vocabulary

Add to `shell.css`:

```css
/* ── Button system ─────────────────────────────────────────────────────── */
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

Adoption strategy: high-traffic CTAs first. Goal is no naked `<button>` elements in the pages list (Home, KDP Catalog, Etsy Catalog, Plans, Calendar, Pinterest, Profile). Component-internal buttons (modal close, BellPopover row actions, PinPreviewModal actions) stay with their existing scoped styles since they don't visually leak into the page layouts.

### Files touched (Section 1)

- Modify: `web.ui/frontend-react/src/styles/shell.css` — add tokens + button rules at the top of the file, just below the existing `:root` block.
- Modify: `web.ui/frontend-react/index.html` — add `<link>` for Inter.
- Modify (button-class sweep): `KdpCatalog.tsx`, `EtsyCatalog.tsx`, `Plans.tsx`, `Calendar.tsx`, `Pinterest.tsx`, `Profile.tsx`, plus key components (`EtsyStatusBanner.tsx`, `KdpPendingSyncBanner.tsx`, `RoadmapDetailModal.tsx`, `KdpIngestReviewModal.tsx`).

## Section 2 — Theme-safe dynamic colors

### Calendar event colors

Move Calendar's `KIND_COLORS` from inline hex to CSS variables and read them at render time. New tokens in `shell.css`:

```css
:root {
  --cal-kdp-release:        #2563eb;   /* blue */
  --cal-etsy-listed:        #ea580c;   /* orange */
  --cal-pinterest-scheduled:#db2777;   /* magenta */
  --cal-reminder:           #d97706;   /* amber */
  --cal-roadmap-release:    #7c3aed;   /* violet */
  --cal-roadmap-lock:       #a78bfa;   /* violet-soft */
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

`Calendar.tsx` reads them via `getComputedStyle(document.documentElement).getPropertyValue(...)` once at mount (and on theme change) into the `KIND_COLORS` object FullCalendar consumes via `eventBackgroundColor`. This is the cleanest path because FullCalendar's API accepts hex strings, not CSS vars.

### Filter chip selected state

`EtsyCatalog.tsx` has inline `background: '#cfe4ff'` for selected filter chips. Replace with a `.filter-chip` + `.filter-chip--selected` rule that uses `var(--accent)` (subtle tint via `color-mix(in srgb, var(--accent) 12%, var(--surface))` for the bg, `var(--accent)` for the border). Dark mode automatically works.

### Files touched (Section 2)

- Modify: `web.ui/frontend-react/src/styles/shell.css` — add 6 calendar color tokens + `.filter-chip` rules.
- Modify: `web.ui/frontend-react/src/pages/Calendar.tsx` — read colors from CSS at mount.
- Modify: `web.ui/frontend-react/src/pages/EtsyCatalog.tsx` — replace inline filter-chip styles with class.

## Section 3 — Spacing rhythm + header polish

### Spacing tokens + utilities

Already present in shell.css (rem-based). Add utility classes for the spacing rhythm so inline styles can be removed:

```css
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

/* Layout utilities — used to replace inline style={{}} */
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

Sweep the most-touched files (Calendar.tsx, EtsyCatalog.tsx, Pinterest.tsx, Plans.tsx) and replace the 20 highest-leverage inline styles with utilities. Stop when each page's `style={{}}` count is under 10. Don't chase every last one — diminishing returns.

### Header polish

Small refinements to `.app-header`, `.header-nav`, `.header-nav-link`:

- Increase header height from 64px to 68px (was cramped).
- Logo image gets a 4px right-padding for better visual gap.
- Nav links get a 2px underline-on-hover (more polished than background swap).
- Active nav link gets a colored bottom-border in `var(--accent)`.
- Right-side icon buttons (theme toggle, bell, chat blob, profile) get consistent 36px square hit areas + 8px gap between them.
- Subtle 1px border on the bottom of the header (currently uses shadow).

### Files touched (Section 3)

- Modify: `web.ui/frontend-react/src/styles/shell.css` — append utilities + header rules.
- Modify: 4 pages (`Calendar.tsx`, `EtsyCatalog.tsx`, `Pinterest.tsx`, `Plans.tsx`) — replace the top 20 inline styles.
- No JSX changes to `Header.tsx` — pure CSS.

## Out of scope (explicit)

- No new pages.
- No data-model changes.
- No accessibility audit beyond `focus-visible` already added to buttons.
- No FullCalendar custom theme — uses default library styling for the calendar grid lines / week numbers.
- ChatBlob's SVG gradients stay (decorative, hand-tuned).
- No icon library swap (existing emoji icons stay).
- No animation pass beyond button hover transitions.
- No mobile-responsive overhaul — desktop-first stays.

## Tests

- New snapshot-ish smoke test in `web.ui/frontend-react/src/__tests__/styles-tokens.test.ts` verifying that the new tokens are reachable via `getComputedStyle` (catches accidental deletes).
- Update `Calendar.test.tsx` to confirm event colors are read from CSS (not hard-coded) — the implementation already exercises FullCalendar through real DOM, so the test asserts that the `eventBackgroundColor` prop strings are non-empty and match the computed-style values.
- Existing test suites stay green; the modernization is additive, not behavior-changing.

## Risks

- **Inter font load delay.** Mitigation: the `font-family` fallback chain starts with `Inter`, then `system-ui` — if Inter hasn't loaded the OS font renders. FOUT is acceptable.
- **`color-mix()` browser support.** Modern browsers (Chrome 111+, Safari 16.4+, Firefox 113+) all support it. The fallback degrades to no-mix (still legible). Listed as a known limit.
- **Calendar reading CSS vars at mount only.** When the user toggles theme, the in-JS `KIND_COLORS` object holds stale values until the page re-renders. Mitigation: subscribe to the theme-toggle event (or use a small `useTheme()` hook) to recompute. The Theme toggle already lives in `ThemeToggle.tsx`; we wire a tiny custom-event broadcast (`window.dispatchEvent(new CustomEvent('themechange'))`) on toggle and have Calendar listen.
- **Token sprawl.** The spec adds ~30 new tokens. Mitigation: they're grouped semantically (typography / buttons / calendar / spacing / radii), commented in shell.css, and replace existing inline values.
