# Release date

The **release date** is the date Amazon marks the book as live and
orderable. It is the same value Amazon shows under "Publication date" on
the product details section of your book's Amazon page. The dashboard
uses release date for two things:

- Anchoring the **Day-30 sales reminder** (fires at `release_date + 30
  days` once the book is marked live).
- Display only on the KDP table and book detail view — it is not used
  for Pinterest pin scheduling. (Pinterest pins schedule across the 7
  days following the **mark-live action**, regardless of release date.)

## How to determine it

1. After KDP approves your book and you receive the "It's live" email,
   open the Amazon product page for the book (the `/dp/<ASIN>` URL).
2. Scroll to the **Product details** section.
3. Look for the line labeled **Publication date** (sometimes
   "Publisher" on older listings). That date is your release date.
4. Enter it into the dashboard in `YYYY-MM-DD` format — the **Mark
   live** modal's date picker enforces that shape.

## Edge cases

- If you scheduled a future on-sale date in KDP and the book is not yet
  live, enter the scheduled date — the Day-30 reminder math still works.
- If you republish a book (new edition, new ASIN), enter the new ASIN's
  publication date. The old book row stays in the dashboard with its
  original date.

_TODO: drop a screenshot at `web.ui/backend/help/screenshots/release_date.png`._
