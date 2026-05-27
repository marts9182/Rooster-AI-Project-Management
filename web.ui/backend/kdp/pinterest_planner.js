/**
 * Computes the 6-pin queue rows fired when a book is marked published.
 *
 * Pure function: no DB I/O, no filesystem I/O. The route layer (Task 6) is
 * responsible for inserting these rows into `pinterest_queue`. Plan E will
 * later replace this implementation with one that generates real pin images,
 * but the signature is stable.
 *
 * @module kdp/pinterest_planner
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
 * @property {string} image_path - Stub path; Plan E will create the actual file.
 * @property {string} title
 * @property {string} description
 * @property {string} link_url
 * @property {string} scheduled_for - ISO datetime; 6 distinct values across next 7 days.
 */

/**
 * Plan exactly 6 Pinterest pins for a freshly published book.
 *
 * The first pin (row 0) is the cover hero; the remaining 5 are interior previews.
 * Schedules slot at 09:00, 11:00, 13:00, 15:00, 17:00, 19:00 UTC on days 1-6
 * after `fromDate`, with a per-row minute offset so values stay distinct.
 *
 * @param {BookForPlanning} book
 * @param {Date} [fromDate=new Date()] - "now" anchor; first pin schedules day+1.
 * @returns {PinQueueRow[]}
 */
export function planSixPinsForBook(book, fromDate = new Date()) {
  const link = `https://www.amazon.com/dp/${book.asin}`;
  const baseTitle = book.title;
  const baseDesc = book.blurb
    ? book.blurb.replace(/<[^>]+>/g, '').slice(0, 480)
    : `${baseTitle} — available now on Amazon.`;
  const slug = book.slug;

  /** @type {Array<{pin_type: 'cover_hero'|'interior_preview', image: string, title: string}>} */
  const pinSpecs = [
    { pin_type: 'cover_hero', image: 'cover-hero.png', title: baseTitle },
    {
      pin_type: 'interior_preview',
      image: 'interior-01.png',
      title: `Inside ${baseTitle}: a peek`,
    },
    {
      pin_type: 'interior_preview',
      image: 'interior-02.png',
      title: `${baseTitle} — sample pages`,
    },
    {
      pin_type: 'interior_preview',
      image: 'interior-03.png',
      title: `${baseTitle} — large-print layout`,
    },
    {
      pin_type: 'interior_preview',
      image: 'interior-04.png',
      title: `${baseTitle} — what's inside`,
    },
    {
      pin_type: 'interior_preview',
      image: 'interior-05.png',
      title: `${baseTitle} — answer key & extras`,
    },
  ];

  /** @type {PinQueueRow[]} */
  const rows = [];
  for (let i = 0; i < pinSpecs.length; i++) {
    const spec = pinSpecs[i];
    const dayOffset = i + 1; // day 1..6 in next 7 days
    const slotHour = 9 + i * 2; // 9, 11, 13, 15, 17, 19 — all within 09-21
    const jitterMin = (i * 7) % 60;

    const sched = new Date(fromDate);
    sched.setUTCDate(sched.getUTCDate() + dayOffset);
    sched.setUTCHours(slotHour, jitterMin, 0, 0);

    rows.push({
      kdp_book_id: book.id,
      pin_type: spec.pin_type,
      image_path: `output/pinterest/${slug}/${spec.image}`,
      title: spec.title,
      description: baseDesc,
      link_url: link,
      scheduled_for: sched.toISOString(),
    });
  }

  return rows;
}
