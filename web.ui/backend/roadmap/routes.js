/**
 * Publishing roadmap routes:
 *   GET    /api/roadmap                    — list, optional ?kind=&status=&from=&to=
 *   POST   /api/roadmap                    — insert; 201 + {row}, 409 on UNIQUE
 *   PUT    /api/roadmap/:id                — patch; 200 + {row}, 404 unknown
 *   DELETE /api/roadmap/:id                — hard delete; 204
 *
 * @module roadmap/routes
 */
import express from 'express';
import {
  insertRoadmapRow, listRoadmapRows, getRoadmapRowById,
  updateRoadmapRow, deleteRoadmapRow,
} from './repo.js';

const REQUIRED = ['kind', 'slug', 'title', 'target_release_date', 'status', 'source'];
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const KIND = new Set(['kdp', 'etsy']);
const STATUS = new Set(['planned', 'building', 'built', 'scheduled', 'published', 'skipped']);
const SOURCE = new Set(['reuse', 'build']);

function validate(body) {
  const missing = REQUIRED.filter((k) => body[k] == null || body[k] === '');
  if (missing.length) return `required fields missing: ${missing.join(', ')}`;
  if (!KIND.has(body.kind)) return `kind must be one of: kdp,etsy`;
  if (!STATUS.has(body.status)) return `status invalid`;
  if (!SOURCE.has(body.source)) return `source must be one of: reuse,build`;
  if (!ISO_DATE.test(body.target_release_date)) return `target_release_date must be yyyy-mm-dd`;
  return null;
}

/**
 * @param {{db: import('better-sqlite3').Database}} args
 * @returns {import('express').Router}
 */
export function createRoadmapRouter({ db }) {
  const router = express.Router();

  router.get('/', (req, res) => {
    const rows = listRoadmapRows(db, {
      kind: req.query.kind,
      status: req.query.status,
      from: req.query.from,
      to: req.query.to,
    });
    res.json({ rows });
  });

  router.post('/', (req, res) => {
    const body = req.body ?? {};
    const err = validate(body);
    if (err) return res.status(400).json({ error: err });
    try {
      const id = insertRoadmapRow(db, body);
      const row = getRoadmapRowById(db, id);
      res.status(201).json({ row });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (/UNIQUE/i.test(msg)) {
        return res.status(409).json({ error: 'duplicate (kind, slug, target_release_date) — already exists' });
      }
      res.status(500).json({ error: msg });
    }
  });

  router.put('/:id', (req, res) => {
    const id = Number.parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'id must be numeric' });
    const body = req.body ?? {};
    if (body.target_release_date !== undefined && !ISO_DATE.test(body.target_release_date)) {
      return res.status(400).json({ error: 'target_release_date must be yyyy-mm-dd' });
    }
    if (body.status !== undefined && !STATUS.has(body.status)) {
      return res.status(400).json({ error: 'status invalid' });
    }
    const ok = updateRoadmapRow(db, id, body);
    if (!ok) return res.status(404).json({ error: 'not_found' });
    res.json({ row: getRoadmapRowById(db, id) });
  });

  router.delete('/:id', (req, res) => {
    const id = Number.parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'id must be numeric' });
    const ok = deleteRoadmapRow(db, id);
    if (!ok) return res.status(404).json({ error: 'not_found' });
    res.status(204).end();
  });

  return router;
}
