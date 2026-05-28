/**
 * Fuzzy relative-time formatter. Returns "" for null/invalid input.
 * Uses coarse buckets: just now / N min / N hr / N day(s) / N month(s) / N year(s).
 */
export function relTime(iso: string | null, now: Date = new Date()): string {
  if (!iso) return '';
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '';
  const sec = Math.round((now.getTime() - t) / 1000);
  if (sec < 60) return 'just now';
  if (sec < 3600) return `${Math.round(sec / 60)} min ago`;
  if (sec < 86400) return `${Math.round(sec / 3600)} hr ago`;
  const days = Math.round(sec / 86400);
  if (days < 30) return `${days} day(s) ago`;
  const months = Math.round(days / 30);
  if (months < 12) return `${months} month(s) ago`;
  return `${Math.round(days / 365)} year(s) ago`;
}
