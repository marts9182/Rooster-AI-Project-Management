/**
 * Calendar aggregator — reads dated rows from kdp_books, etsy_listings,
 * reminders, and pinterest_queue and emits a unified, sorted list of
 * `{date, kind, title, source_kind, source_id, url}` records the calendar
 * page (and any drawer that hangs off it) can render directly.
 *
 * This module is intentionally pure: no SSE, no HTTP, no side effects.
 * The HTTP route layer (`calendar/routes.js`) wraps it with parameter
 * validation; the Calendar page consumes the route output.
 *
 * @module calendar/aggregator
 */

/**
 * @typedef {Object} CalendarEvent
 * @property {string} date           ISO yyyy-mm-dd
 * @property {string} kind           e.g. 'kdp.release', 'etsy.listed',
 *                                   'reminder', 'pinterest.scheduled'
 * @property {string} title
 * @property {string} source_kind    e.g. 'kdp.book', 'etsy.listing',
 *                                   'reminder', 'pinterest.queue'
 * @property {number | string} source_id
 * @property {string} url            in-app route to drill into the source row
 */

/**
 * Aggregate dated rows from kdp_books, etsy_listings, reminders, and
 * pinterest_queue into a single calendar-ready stream within [from, to).
 *
 * `from` and `to` are inclusive-exclusive ISO yyyy-mm-dd strings. Datetime
 * columns (listed_at, due_at, scheduled_for) are compared by their leading
 * yyyy-mm-dd slice, so the window is timezone-stable as long as the caller
 * stores ISO-8601-with-zone strings consistently.
 *
 * Reminders in 'dismissed' or 'fired' status are excluded — the calendar
 * only surfaces pending action items.
 *
 * @param {import('better-sqlite3').Database} db
 * @param {string} from
 * @param {string} to
 * @returns {CalendarEvent[]}
 */
export function aggregateCalendarEvents(db, from, to) {
  /** @type {CalendarEvent[]} */
  const out = [];

  // ── KDP releases ──────────────────────────────────────────────────────
  const kdpRows = /** @type {Array<{slug:string,title:string,release_date:string}>} */ (
    db
      .prepare(
        `SELECT slug, title, release_date
           FROM kdp_books
          WHERE release_date IS NOT NULL
            AND release_date >= ? AND release_date < ?`,
      )
      .all(from, to)
  );
  for (const r of kdpRows) {
    out.push({
      date: r.release_date,
      kind: 'kdp.release',
      title: `KDP release: ${r.title}`,
      source_kind: 'kdp.book',
      source_id: r.slug,
      url: `/kdp/${r.slug}`,
    });
  }

  // ── Etsy listings — use yyyy-mm-dd slice of listed_at ─────────────────
  const etsyRows = /** @type {Array<{etsy_listing_id:number,title:string,listed_at:string}>} */ (
    db
      .prepare(
        `SELECT etsy_listing_id, title, listed_at
           FROM etsy_listings
          WHERE listed_at IS NOT NULL
            AND substr(listed_at, 1, 10) >= ?
            AND substr(listed_at, 1, 10) < ?`,
      )
      .all(from, to)
  );
  for (const r of etsyRows) {
    out.push({
      date: r.listed_at.slice(0, 10),
      kind: 'etsy.listed',
      title: `Etsy listed: ${r.title}`,
      source_kind: 'etsy.listing',
      source_id: r.etsy_listing_id,
      url: `/etsy/${r.etsy_listing_id}`,
    });
  }

  // ── Reminders — pending only; date portion of due_at; carry link ─────
  const reminderRows = /** @type {Array<{id:number,title:string,due_at:string,source_kind:string|null,source_id:number|null}>} */ (
    db
      .prepare(
        `SELECT id, title, due_at, source_kind, source_id
           FROM reminders
          WHERE status = 'pending'
            AND substr(due_at, 1, 10) >= ?
            AND substr(due_at, 1, 10) < ?`,
      )
      .all(from, to)
  );
  for (const r of reminderRows) {
    let url = '/calendar';
    if (r.source_kind === 'kdp.book' && r.source_id != null) {
      url = `/kdp/${r.source_id}`;
    } else if (r.source_kind === 'etsy.listing' && r.source_id != null) {
      url = `/etsy/${r.source_id}`;
    } else if (r.source_kind === 'pinterest.queue' && r.source_id != null) {
      url = '/pinterest';
    }
    out.push({
      date: r.due_at.slice(0, 10),
      kind: 'reminder',
      title: r.title,
      source_kind: 'reminder',
      source_id: r.id,
      url,
    });
  }

  // ── Pinterest queue ───────────────────────────────────────────────────
  const pinRows = /** @type {Array<{id:number,title:string,scheduled_for:string}>} */ (
    db
      .prepare(
        `SELECT id, title, scheduled_for
           FROM pinterest_queue
          WHERE substr(scheduled_for, 1, 10) >= ?
            AND substr(scheduled_for, 1, 10) < ?`,
      )
      .all(from, to)
  );
  for (const r of pinRows) {
    out.push({
      date: r.scheduled_for.slice(0, 10),
      kind: 'pinterest.scheduled',
      title: r.title,
      source_kind: 'pinterest.queue',
      source_id: r.id,
      url: '/pinterest',
    });
  }

  // ── Publishing roadmap — release + lock events ────────────────────────
  const roadmapRows = /** @type {Array<{id:number,kind:string,slug:string,title:string,target_release_date:string,file_lock_date:string|null,status:string}>} */ (
    db
      .prepare(
        `SELECT id, kind, slug, title, target_release_date, file_lock_date, status
           FROM publishing_roadmap
          WHERE status != 'skipped'
            AND (
                  (target_release_date >= ? AND target_release_date < ?)
               OR (file_lock_date IS NOT NULL AND file_lock_date >= ? AND file_lock_date < ?)
            )`,
      )
      .all(from, to, from, to)
  );
  for (const r of roadmapRows) {
    const kindUpper = r.kind.toUpperCase();
    if (r.target_release_date >= from && r.target_release_date < to) {
      out.push({
        date: r.target_release_date,
        kind: 'roadmap.release',
        title: `${kindUpper}: ${r.title}`,
        source_kind: 'publishing.roadmap',
        source_id: r.id,
        url: '/calendar',
      });
    }
    if (r.file_lock_date && r.file_lock_date >= from && r.file_lock_date < to) {
      out.push({
        date: r.file_lock_date,
        kind: 'roadmap.lock',
        title: `Lock file: ${r.title}`,
        source_kind: 'publishing.roadmap',
        source_id: r.id,
        url: '/calendar',
      });
    }
  }

  out.sort(
    (a, b) => a.date.localeCompare(b.date) || a.kind.localeCompare(b.kind),
  );
  return out;
}
