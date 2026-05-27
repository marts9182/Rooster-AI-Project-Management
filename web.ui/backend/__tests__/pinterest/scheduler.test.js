/**
 * Tests for pinterest/scheduler.js — pure 3–5/day jittered slot assignment.
 */
import { describe, it, expect } from 'vitest';
import { assignSlots, withinPostingWindow } from '../../pinterest/scheduler.js';

describe('withinPostingWindow', () => {
  it('accepts 09:00 and 21:00 in the local timezone', () => {
    expect(withinPostingWindow(new Date('2026-05-26T09:00:00-07:00'), 'America/Los_Angeles')).toBe(true);
    expect(withinPostingWindow(new Date('2026-05-26T21:00:00-07:00'), 'America/Los_Angeles')).toBe(true);
  });

  it('rejects 08:59 and 21:01 in the local timezone', () => {
    expect(withinPostingWindow(new Date('2026-05-26T08:59:00-07:00'), 'America/Los_Angeles')).toBe(false);
    expect(withinPostingWindow(new Date('2026-05-26T21:01:00-07:00'), 'America/Los_Angeles')).toBe(false);
  });
});

describe('assignSlots', () => {
  const cfg = {
    timeZone: 'America/Los_Angeles',
    perDayMin: 3,
    perDayMax: 5,
    windowStartHour: 9,
    windowEndHour: 21,
  };

  function seededRandom(seed) {
    let s = seed;
    return () => {
      s = (s * 9301 + 49297) % 233280;
      return s / 233280;
    };
  }

  it('assigns one ISO timestamp per requested pin', () => {
    const slots = assignSlots({
      count: 6,
      existingQueue: [],
      now: new Date('2026-05-26T16:00:00-07:00'),
      config: cfg,
      random: seededRandom(1),
    });
    expect(slots).toHaveLength(6);
    for (const s of slots) {
      expect(typeof s).toBe('string');
      expect(new Date(s).toString()).not.toBe('Invalid Date');
    }
  });

  it('every returned slot is within [09:00, 21:00] local', () => {
    const slots = assignSlots({
      count: 12,
      existingQueue: [],
      now: new Date('2026-05-26T10:00:00-07:00'),
      config: cfg,
      random: seededRandom(2),
    });
    for (const s of slots) {
      expect(withinPostingWindow(new Date(s), cfg.timeZone)).toBe(true);
    }
  });

  it('respects perDayMax — never puts >5 slots on any one local date', () => {
    const slots = assignSlots({
      count: 20,
      existingQueue: [],
      now: new Date('2026-05-26T10:00:00-07:00'),
      config: cfg,
      random: seededRandom(3),
    });
    const byDay = new Map();
    for (const s of slots) {
      const d = new Date(s).toLocaleDateString('en-US', { timeZone: cfg.timeZone });
      byDay.set(d, (byDay.get(d) ?? 0) + 1);
    }
    for (const n of byDay.values()) {
      expect(n).toBeLessThanOrEqual(cfg.perDayMax);
    }
  });

  it('counts existingQueue when placing new slots on the same days', () => {
    const today = new Date('2026-05-26T10:00:00-07:00');
    const existing = [];
    for (let i = 0; i < 5; i++) {
      existing.push({
        scheduled_for: new Date(`2026-05-27T${10 + i}:00:00-07:00`).toISOString(),
      });
    }
    const slots = assignSlots({
      count: 3,
      existingQueue: existing,
      now: today,
      config: cfg,
      random: seededRandom(4),
    });
    const onMay27 = slots.filter((s) => {
      return new Date(s).toLocaleDateString('en-US', { timeZone: cfg.timeZone }) ===
             new Date('2026-05-27T12:00:00-07:00').toLocaleDateString('en-US', { timeZone: cfg.timeZone });
    });
    expect(onMay27.length).toBe(0);
  });

  it('returns slots in ascending order', () => {
    const slots = assignSlots({
      count: 8,
      existingQueue: [],
      now: new Date('2026-05-26T10:00:00-07:00'),
      config: cfg,
      random: seededRandom(5),
    });
    for (let i = 1; i < slots.length; i++) {
      expect(new Date(slots[i]).getTime()).toBeGreaterThan(new Date(slots[i - 1]).getTime());
    }
  });
});
