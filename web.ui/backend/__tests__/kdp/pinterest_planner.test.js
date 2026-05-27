/**
 * Tests for the Pinterest planner: pure function that returns 6 queue rows
 * for `pinterest_queue` when a book is marked published.
 *
 * The planner does NOT touch the DB. The route layer (Task 6) does the
 * inserts using these rows.
 */
import { describe, it, expect } from 'vitest';
import { planSixPinsForBook } from '../../kdp/pinterest_planner.js';

describe('planSixPinsForBook', () => {
  const book = {
    id: 7,
    slug: 'kakuro-quiet-minds',
    title: 'Kakuro for Quiet Minds',
    asin: 'B0ABCDEFG1',
    blurb: 'Kakuro is the elegant cousin of Sudoku',
  };

  it('returns exactly 6 pin rows', () => {
    const rows = planSixPinsForBook(book, new Date('2026-05-26T10:00:00Z'));
    expect(rows).toHaveLength(6);
  });

  it('produces one cover_hero (row 0) and five interior_preview rows', () => {
    const rows = planSixPinsForBook(book, new Date('2026-05-26T10:00:00Z'));
    expect(rows[0].pin_type).toBe('cover_hero');
    const covers = rows.filter((r) => r.pin_type === 'cover_hero');
    const interiors = rows.filter((r) => r.pin_type === 'interior_preview');
    expect(covers).toHaveLength(1);
    expect(interiors).toHaveLength(5);
  });

  it('schedules pins across the next 7 days within 09:00-21:00 UTC and at distinct times', () => {
    const start = new Date('2026-05-26T10:00:00Z');
    const rows = planSixPinsForBook(book, start);
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
    const seen = new Set();
    for (const row of rows) {
      const sched = new Date(row.scheduled_for);
      const offset = sched.getTime() - start.getTime();
      expect(offset).toBeGreaterThanOrEqual(0);
      expect(offset).toBeLessThanOrEqual(sevenDaysMs);
      const hour = sched.getUTCHours();
      expect(hour).toBeGreaterThanOrEqual(9);
      expect(hour).toBeLessThanOrEqual(21);
      seen.add(row.scheduled_for);
    }
    expect(seen.size).toBe(6);
  });

  it('builds amazon link from ASIN and uses book id/title', () => {
    const rows = planSixPinsForBook(book, new Date('2026-05-26T10:00:00Z'));
    for (const row of rows) {
      expect(row.link_url).toBe('https://www.amazon.com/dp/B0ABCDEFG1');
      expect(row.kdp_book_id).toBe(7);
      expect(row.title).toContain('Kakuro');
    }
  });

  it('produces stub image paths under output/pinterest/<slug>/', () => {
    const rows = planSixPinsForBook(book, new Date('2026-05-26T10:00:00Z'));
    expect(rows[0].image_path).toBe('output/pinterest/kakuro-quiet-minds/cover-hero.png');
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i].image_path).toMatch(
        /^output\/pinterest\/kakuro-quiet-minds\/interior-\d{2}\.png$/,
      );
    }
  });
});
