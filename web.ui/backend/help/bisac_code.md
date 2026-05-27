# BISAC code

**BISAC** (Book Industry Standards and Communications) codes are the
classification system US retailers use to categorize books. KDP requires
you to pick at least one BISAC code per book and allows up to two. The
codes drive which Amazon browse categories your book lands in.

## How to pick one

Browse the official list at
<https://www.bisg.org/complete-bisac-subject-headings-list>. The site
lets you drill down from major subjects (Fiction, Games & Activities,
Juvenile Nonfiction, etc.) to leaf-level codes.

A few defaults that have worked well for this shop:

- **Puzzle books (adults):** `GAM015000` — Games & Activities / Puzzles
  / Logic.
- **Word-based puzzles:** `GAM004000` — Games & Activities / Puzzles /
  Crosswords.
- **Coloring books (general):** `CGN004080` — Comics & Graphic Novels /
  Manga / Activity Books, **or** `JNF038000` — Juvenile Nonfiction /
  Activity Books / Coloring Books, depending on audience.
- **Folk-horror fiction:** `FIC015000` — Fiction / Horror.

## Where it lives in the dashboard

Each book's chosen BISAC codes are stored on disk under the `bisac` key
in `metadata.json`. The KDP scanner picks them up automatically when the
book row is rebuilt — you do not enter them through the dashboard UI.

_TODO: drop a screenshot at `web.ui/backend/help/screenshots/bisac_code.png`._
