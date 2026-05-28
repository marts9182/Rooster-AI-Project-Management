/**
 * Map the verbatim KDP status label (as it appears on the bookshelf)
 * to the dashboard's normalized `kdp_books.status` enum.
 *
 * @module kdp/status_map
 */

/** @typedef {'built'|'in_review'|'published'|'archived'} DashboardStatus */

const MAP = new Map([
  ['live', 'published'],
  ['in review', 'in_review'],
  ['draft', 'built'],
  ['blocked', 'archived'],
  ['unpublished', 'archived'],
]);

/**
 * @param {string} raw  verbatim label from the KDP bookshelf
 * @returns {{status: DashboardStatus, mappedFrom: string} | {ambiguous: true}}
 */
export function kdpToDashboardStatus(raw) {
  const status = MAP.get(String(raw ?? '').toLowerCase().trim());
  if (!status) return { ambiguous: true };
  return { status, mappedFrom: raw };
}
