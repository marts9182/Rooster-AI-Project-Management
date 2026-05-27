/**
 * Pure scheduler — given the existing queue and a target cadence, compute
 * jittered scheduled_for timestamps for new pins.
 *
 * Cadence: 3..5 pins per local date, only within the [windowStartHour,
 * windowEndHour] window. Slot positions are jittered.
 *
 * @module pinterest/scheduler
 */

/**
 * @typedef {Object} ScheduleConfig
 * @property {string} timeZone           IANA tz, e.g. 'America/Los_Angeles'.
 * @property {number} perDayMin          3
 * @property {number} perDayMax          5
 * @property {number} windowStartHour    9
 * @property {number} windowEndHour      21
 */

/**
 * @typedef {Object} ExistingQueueRow
 * @property {string} scheduled_for      ISO datetime.
 */

/**
 * @typedef {Object} AssignSlotsInput
 * @property {number} count
 * @property {ExistingQueueRow[]} existingQueue
 * @property {Date} now
 * @property {ScheduleConfig} config
 * @property {() => number} [random]     Defaults to Math.random.
 */

/**
 * @param {AssignSlotsInput} input
 * @returns {string[]}                   ISO datetimes, ascending.
 */
export function assignSlots({ count, existingQueue, now, config, random = Math.random }) {
  const { timeZone, perDayMin, perDayMax, windowStartHour, windowEndHour } = config;

  // Count existing pins per local date.
  /** @type {Map<string, number>} */
  const usedPerDay = new Map();
  for (const row of existingQueue) {
    const day = localDateKey(new Date(row.scheduled_for), timeZone);
    usedPerDay.set(day, (usedPerDay.get(day) ?? 0) + 1);
  }

  /** @type {string[]} */
  const assigned = [];
  let dayCursor = new Date(now);
  // If we're past windowEndHour today, start tomorrow.
  if (localHour(dayCursor, timeZone) >= windowEndHour) {
    dayCursor = addDays(dayCursor, 1);
  }

  let safety = 0;
  while (assigned.length < count && safety < 365) {
    safety++;
    const dayKey = localDateKey(dayCursor, timeZone);
    const already = usedPerDay.get(dayKey) ?? 0;
    const capacity = perDayMax - already;
    if (capacity <= 0) {
      dayCursor = addDays(dayCursor, 1);
      continue;
    }
    const target = Math.min(
      capacity,
      count - assigned.length,
      Math.max(perDayMin - already, 1) +
        Math.floor(random() * (perDayMax - perDayMin + 1)),
    );

    // Pick `target` jittered times in [windowStartHour, windowEndHour] for this day.
    const totalMinutes = (windowEndHour - windowStartHour) * 60;
    const segmentMinutes = Math.max(1, Math.floor(totalMinutes / target));
    for (let i = 0; i < target; i++) {
      const baseMin = i * segmentMinutes + Math.floor(random() * segmentMinutes);
      const totalMin = windowStartHour * 60 + baseMin;
      const hour = Math.floor(totalMin / 60);
      const minute = totalMin % 60;
      const slot = makeLocalDate(dayCursor, hour, minute, timeZone);
      // Skip slots that are in the past or too close to now.
      if (slot.getTime() < now.getTime() + 5 * 60 * 1000) continue;
      assigned.push(slot.toISOString());
      usedPerDay.set(dayKey, (usedPerDay.get(dayKey) ?? 0) + 1);
      if (assigned.length >= count) break;
    }
    dayCursor = addDays(dayCursor, 1);
  }

  assigned.sort();
  return assigned;
}

/**
 * Check whether a given Date sits in the posting window of its local day.
 *
 * @param {Date} date
 * @param {string} timeZone
 * @param {number} [startHour=9]
 * @param {number} [endHour=21]
 * @returns {boolean}
 */
export function withinPostingWindow(date, timeZone, startHour = 9, endHour = 21) {
  const h = localHour(date, timeZone);
  const m = localMinute(date, timeZone);
  if (h < startHour) return false;
  if (h > endHour) return false;
  if (h === endHour && m > 0) return false;
  return true;
}

/**
 * "YYYY-MM-DD" key for a Date in the given timezone.
 *
 * @param {Date} date
 * @param {string} tz
 * @returns {string}
 */
function localDateKey(date, tz) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return fmt.format(date); // en-CA gives YYYY-MM-DD
}

/**
 * @param {Date} date
 * @param {string} tz
 * @returns {number}
 */
function localHour(date, tz) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour: 'numeric',
    hour12: false,
  });
  // Some engines render "24" for midnight when hour12=false; normalise.
  const raw = fmt.format(date);
  const n = Number(raw);
  return n === 24 ? 0 : n;
}

/**
 * @param {Date} date
 * @param {string} tz
 * @returns {number}
 */
function localMinute(date, tz) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    minute: 'numeric',
  });
  return Number(fmt.format(date));
}

/**
 * @param {Date} date
 * @param {number} days
 * @returns {Date}
 */
function addDays(date, days) {
  const copy = new Date(date);
  copy.setUTCDate(copy.getUTCDate() + days);
  return copy;
}

/**
 * Build a Date that represents (Y/M/D from `referenceDay` in tz) at hour:minute in tz.
 *
 * Implementation: take the reference day's local YYYY-MM-DD, assume that wall
 * clock time in tz, then derive UTC by comparing what tz reports for that
 * naive UTC instant.
 *
 * @param {Date} referenceDay
 * @param {number} hour
 * @param {number} minute
 * @param {string} tz
 * @returns {Date}
 */
function makeLocalDate(referenceDay, hour, minute, tz) {
  const day = localDateKey(referenceDay, tz); // YYYY-MM-DD
  const trial = new Date(`${day}T${pad2(hour)}:${pad2(minute)}:00Z`);
  const tzHour = localHour(trial, tz);
  const tzMinute = localMinute(trial, tz);
  const deltaMinutes = (hour - tzHour) * 60 + (minute - tzMinute);
  return new Date(trial.getTime() + deltaMinutes * 60 * 1000);
}

function pad2(n) {
  return String(n).padStart(2, '0');
}
