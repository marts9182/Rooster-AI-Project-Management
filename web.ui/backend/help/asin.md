# Where to find your ASIN

The **ASIN** (Amazon Standard Identification Number) is the 10-character ID
Amazon assigns to your book the moment it goes live. It always starts with
`B0` and is used by the dashboard to build review links, Pinterest pin
destinations, and Day-30 sales-check reminders.

## How to find it on KDP

1. Sign in to <https://kdp.amazon.com>.
2. Open **Bookshelf**.
3. Find the row for your book. Click the **"..."** (more actions) menu
   on the right edge of the row, then choose **View on Amazon**.
4. A new tab opens to the Amazon product page. The URL ends in
   `/dp/B0XXXXXXXX` — those 10 characters after `/dp/` are your ASIN.
5. You can also see the ASIN on the product page itself, in the
   **Product details** section near the bottom (labeled "ASIN").

## Where to paste it in the dashboard

When the book moves from review to live on Amazon, click **Mark live** on
the book's row in the KDP page. A modal appears asking for two values:

- **ASIN** — paste the 10 characters here (e.g. `B0CMQR4F8X`).
- **Release date** — the date Amazon now shows on the product page as
  "Publication date."

The dashboard validates the ASIN against `B0` + 8 alphanumeric characters,
builds the `https://www.amazon.com/dp/<ASIN>` listing link automatically,
and schedules the Day-30 sales reminder.

_TODO: drop a screenshot at `web.ui/backend/help/screenshots/asin.png`._
