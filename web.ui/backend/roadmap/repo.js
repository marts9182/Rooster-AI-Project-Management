/**
 * Publishing roadmap repo — pure DB helpers for the `publishing_roadmap`
 * table. No HTTP layer here.
 *
 * @module roadmap/repo
 */

/**
 * @typedef {Object} RoadmapRow
 * @property {number} id
 * @property {'kdp'|'etsy'} kind
 * @property {string} slug
 * @property {string} title
 * @property {string} target_release_date    yyyy-mm-dd
 * @property {'planned'|'building'|'built'|'scheduled'|'published'|'skipped'} status
 * @property {'reuse'|'build'} source
 * @property {string|null} niche
 * @property {string|null} rationale
 * @property {string|null} file_lock_date    yyyy-mm-dd; release - 15 days
 * @property {number|null} kdp_book_id
 * @property {number|null} etsy_listing_id
 * @property {string|null} notes
 * @property {string} created_at
 * @property {string} updated_at
 */

/**
 * @param {string} releaseDate   yyyy-mm-dd
 * @returns {string}             yyyy-mm-dd, 15 calendar days earlier
 */
export function _fileLockDateFor(releaseDate) {
  const d = new Date(`${releaseDate}T12:00:00Z`); // noon avoids DST edges
  d.setUTCDate(d.getUTCDate() - 15);
  return d.toISOString().slice(0, 10);
}

/**
 * @param {import('better-sqlite3').Database} db
 * @param {Omit<RoadmapRow, 'id'|'file_lock_date'|'created_at'|'updated_at'|'kdp_book_id'|'etsy_listing_id'> & {niche?: string|null, rationale?: string|null, notes?: string|null}} row
 * @returns {number}  inserted id
 */
export function insertRoadmapRow(db, row) {
  const lock = _fileLockDateFor(row.target_release_date);
  const result = db.prepare(
    `INSERT INTO publishing_roadmap
       (kind, slug, title, target_release_date, status, source,
        niche, rationale, file_lock_date, notes)
     VALUES (@kind, @slug, @title, @target_release_date, @status, @source,
             @niche, @rationale, @file_lock_date, @notes)`,
  ).run({
    kind: row.kind,
    slug: row.slug,
    title: row.title,
    target_release_date: row.target_release_date,
    status: row.status,
    source: row.source,
    niche: row.niche ?? null,
    rationale: row.rationale ?? null,
    file_lock_date: lock,
    notes: row.notes ?? null,
  });
  return Number(result.lastInsertRowid);
}

/**
 * @param {import('better-sqlite3').Database} db
 * @param {{kind?: 'kdp'|'etsy', status?: string, from?: string, to?: string}} filters
 *   status accepts a comma-separated list ("planned,building").
 * @returns {RoadmapRow[]}
 */
export function listRoadmapRows(db, { kind, status, from, to }) {
  const wheres = [];
  const params = {};
  if (kind) { wheres.push('kind = @kind'); params.kind = kind; }
  if (status) {
    const list = status.split(',').map((s) => s.trim()).filter(Boolean);
    if (list.length > 0) {
      const placeholders = list.map((_, i) => `@s${i}`).join(',');
      wheres.push(`status IN (${placeholders})`);
      list.forEach((s, i) => { params[`s${i}`] = s; });
    }
  }
  if (from) { wheres.push('target_release_date >= @from'); params.from = from; }
  if (to)   { wheres.push('target_release_date < @to');    params.to = to; }
  const sql =
    `SELECT * FROM publishing_roadmap` +
    (wheres.length ? ` WHERE ${wheres.join(' AND ')}` : '') +
    ` ORDER BY target_release_date ASC, id ASC`;
  return /** @type {RoadmapRow[]} */ (db.prepare(sql).all(params));
}

/**
 * @param {import('better-sqlite3').Database} db
 * @param {number} id
 * @returns {RoadmapRow | null}
 */
export function getRoadmapRowById(db, id) {
  const row = db.prepare('SELECT * FROM publishing_roadmap WHERE id = ?').get(id);
  return row ?? null;
}

const PATCHABLE = ['status', 'target_release_date', 'title', 'niche', 'rationale', 'notes'];

/**
 * @param {import('better-sqlite3').Database} db
 * @param {number} id
 * @param {Partial<RoadmapRow>} patch
 * @returns {boolean}  true when a row was updated
 */
export function updateRoadmapRow(db, id, patch) {
  const cols = [];
  const params = { id };
  for (const k of PATCHABLE) {
    if (patch[k] !== undefined) {
      cols.push(`${k} = @${k}`);
      params[k] = patch[k];
    }
  }
  if (cols.length === 0) return false;
  if (patch.target_release_date !== undefined) {
    cols.push('file_lock_date = @file_lock_date');
    params.file_lock_date = _fileLockDateFor(patch.target_release_date);
  }
  cols.push(`updated_at = datetime('now')`);
  const result = db.prepare(
    `UPDATE publishing_roadmap SET ${cols.join(', ')} WHERE id = @id`,
  ).run(params);
  return result.changes > 0;
}

/**
 * @param {import('better-sqlite3').Database} db
 * @param {number} id
 * @returns {boolean}
 */
export function deleteRoadmapRow(db, id) {
  const result = db.prepare('DELETE FROM publishing_roadmap WHERE id = ?').run(id);
  return result.changes > 0;
}

/**
 * Advance any non-terminal roadmap row matching (kind, slug) to the given
 * status and back-fill the kdp_book_id / etsy_listing_id link. Returns the
 * number of rows touched. Terminal statuses ('published', 'skipped') are
 * left alone.
 *
 * @param {import('better-sqlite3').Database} db
 * @param {{kind: 'kdp'|'etsy', slug: string, toStatus: RoadmapRow['status'], linkId: number}} args
 * @returns {number}
 */
export function advanceRoadmapBySlug(db, { kind, slug, toStatus, linkId }) {
  const linkCol = kind === 'kdp' ? 'kdp_book_id' : 'etsy_listing_id';
  const result = db.prepare(
    `UPDATE publishing_roadmap
        SET status = @toStatus,
            ${linkCol} = @linkId,
            updated_at = datetime('now')
      WHERE kind = @kind
        AND slug = @slug
        AND status NOT IN ('published','skipped')`,
  ).run({ kind, slug, toStatus, linkId });
  return result.changes;
}
