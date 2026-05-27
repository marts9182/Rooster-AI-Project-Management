/**
 * Calendar HTTP route — thin wrapper over the pure aggregator.
 *
 *   GET /api/calendar/events?from=yyyy-mm-dd&to=yyyy-mm-dd
 *     → 200 { events: CalendarEvent[] }
 *     → 400 if from/to missing or not ISO yyyy-mm-dd
 *
 * The window is inclusive-exclusive [from, to). Frontend Calendar page
 * (Plan C Task 13) is the primary consumer.
 *
 * @module calendar/routes
 */

import { aggregateCalendarEvents } from './aggregator.js';

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * @typedef {Object} MountArgs
 * @property {import('better-sqlite3').Database} db
 */

/**
 * Mount calendar routes on the given Express app.
 *
 * @param {import('express').Express} app
 * @param {MountArgs} args
 */
export function mountCalendarRoutes(app, { db }) {
  app.get('/api/calendar/events', (req, res) => {
    const from = typeof req.query.from === 'string' ? req.query.from : '';
    const to = typeof req.query.to === 'string' ? req.query.to : '';
    if (!from || !to) {
      res
        .status(400)
        .json({ error: 'from and to query params are required (yyyy-mm-dd)' });
      return;
    }
    if (!ISO_DATE_RE.test(from) || !ISO_DATE_RE.test(to)) {
      res.status(400).json({ error: 'from/to must be ISO yyyy-mm-dd' });
      return;
    }
    const events = aggregateCalendarEvents(db, from, to);
    res.json({ events });
  });
}
