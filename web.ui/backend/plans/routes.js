/**
 * @file Express router for /api/plans (read-only browser over docs/superpowers/).
 */

import express from 'express';
import fs from 'node:fs';
import matter from 'gray-matter';
import { scanDocs } from './scanner.js';

const SLUG_OK = /^[a-z0-9][a-z0-9-]*$/i;

/**
 * @param {{ superpowersRoot: string }} deps
 * @returns {express.Router}
 */
export function createPlansRouter({ superpowersRoot }) {
  const router = express.Router();

  router.get('/', (_req, res) => {
    res.json({ entries: scanDocs(superpowersRoot) });
  });

  router.get('/:slug', (req, res) => {
    const { slug } = req.params;
    if (!SLUG_OK.test(slug)) {
      res.status(400).json({ error: 'invalid slug' });
      return;
    }
    const all = scanDocs(superpowersRoot);
    const matches = all.filter((e) => e.slug === slug);
    if (matches.length === 0) {
      res.status(404).json({ error: 'not found' });
      return;
    }
    const entries = matches.map((entry) => {
      const raw = fs.readFileSync(entry.path, 'utf8');
      const parsed = matter(raw);
      return {
        ...entry,
        markdown: parsed.content,
        frontmatter: parsed.data,
      };
    });
    // Sort so plans come before specs in detail view (most users want the actionable doc).
    entries.sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'plan' ? -1 : 1));
    res.json({ entries });
  });

  return router;
}
