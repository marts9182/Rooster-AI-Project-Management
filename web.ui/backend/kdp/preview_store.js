/**
 * In-memory KDP ingest preview store.
 *
 * Entries expire 30 minutes after their `putAt` timestamp. Expiry is
 * checked lazily on every read; there is no background timer.
 *
 * @module kdp/preview_store
 */

const TTL_MS = 30 * 60 * 1000;

/** @type {Map<string, {preview: object, putAt: number, seq: number}>} */
const store = new Map();

/**
 * Monotonic sequence so two puts within the same millisecond still have
 * a well-defined order (Windows `Date.now()` can repeat). See
 * `workerStatus.js` for the same pattern.
 */
let seq = 0;

/**
 * @param {{preview_id: string, created_at: string}} preview
 */
export function putPreview(preview) {
  store.set(preview.preview_id, {
    preview,
    putAt: Date.now(),
    seq: ++seq,
  });
}

/**
 * @param {string} previewId
 * @returns {object | null}
 */
export function getPreview(previewId) {
  const entry = store.get(previewId);
  if (!entry) return null;
  if (Date.now() - entry.putAt >= TTL_MS) {
    store.delete(previewId);
    return null;
  }
  return entry.preview;
}

/**
 * Returns the most-recently-put non-expired preview, or null when none.
 * @returns {object | null}
 */
export function getLatestPreview() {
  let latestId = null;
  let latestSeq = -1;
  const now = Date.now();
  for (const [id, entry] of store.entries()) {
    if (now - entry.putAt >= TTL_MS) {
      store.delete(id);
      continue;
    }
    if (entry.seq > latestSeq) {
      latestSeq = entry.seq;
      latestId = id;
    }
  }
  return latestId ? store.get(latestId).preview : null;
}

/**
 * @param {string} previewId
 */
export function deletePreview(previewId) {
  store.delete(previewId);
}

/** Test helper — clears the store. */
export function _resetForTests() {
  store.clear();
  seq = 0;
}
