/**
 * Pinterest analytics — pure functions over the queue + history tables.
 * @module pinterest/analytics
 */

/**
 * Bucket history rows by local date over the last N days.
 * @param {import('better-sqlite3').Database} db
 * @param {{days:number, target:number, now?: Date}} args
 * @returns {{
 *   days:number, target_per_day:number,
 *   buckets: Array<{date:string, posted:number, failed:number}>,
 *   summary: {posted:number, failed:number, success_rate:number, avg_per_day:number}
 * }}
 */
export function cadenceBuckets(db, { days, target, now = new Date() }) {
  const start = new Date(now.getTime() - (days - 1) * 24 * 60 * 60 * 1000);
  const startIso = start.toISOString().slice(0, 10);
  const rows = db.prepare(
    `SELECT substr(posted_at, 1, 10) AS date, status, COUNT(*) AS n
       FROM pinterest_history
       WHERE substr(posted_at, 1, 10) >= ?
       GROUP BY substr(posted_at, 1, 10), status`,
  ).all(startIso);

  const byDate = new Map();
  for (let i = 0; i < days; i++) {
    const d = new Date(start.getTime() + i * 24 * 60 * 60 * 1000)
      .toISOString().slice(0, 10);
    byDate.set(d, { date: d, posted: 0, failed: 0 });
  }
  for (const r of rows) {
    const bucket = byDate.get(r.date);
    if (!bucket) continue;
    if (r.status === 'posted') bucket.posted = r.n;
    else if (r.status === 'failed') bucket.failed = r.n;
  }
  const buckets = [...byDate.values()];
  const posted = buckets.reduce((s, b) => s + b.posted, 0);
  const failed = buckets.reduce((s, b) => s + b.failed, 0);
  const total = posted + failed;
  const success_rate = total === 0 ? 0 : posted / total;
  const avg_per_day = posted / days;
  return {
    days,
    target_per_day: target,
    buckets,
    summary: { posted, failed, success_rate, avg_per_day },
  };
}

/**
 * Recent successfully-posted rows with engagement, joined with the book slug.
 * @param {import('better-sqlite3').Database} db
 * @param {{limit?:number, engagementDisabled?:boolean}} args
 */
export function engagementRows(db, { limit = 50, engagementDisabled = false } = {}) {
  const rows = db.prepare(
    `SELECT h.id AS history_id, h.image_path,
            b.slug AS book_slug, h.posted_at,
            h.saves, h.clicks, h.impressions,
            h.pinterest_url
       FROM pinterest_history h
       JOIN pinterest_queue q ON q.id = h.queue_id
       LEFT JOIN kdp_books b ON b.id = q.kdp_book_id
       WHERE h.status = 'posted'
       ORDER BY h.posted_at DESC
       LIMIT ?`,
  ).all(limit);
  return {
    rows: rows.map((r) => ({
      ...r,
      engagement_available: r.saves != null,
    })),
    engagement_disabled: engagementDisabled,
  };
}
