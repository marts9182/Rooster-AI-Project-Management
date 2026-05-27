/**
 * Smoke test: server must import and start without depending on the
 * archived AgentRuntime. Confirms Commit 1 cleanly severs the Kanban
 * dependency before Commit 2 introduces SQLite + SSE + workers.
 */
import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../server.js';
import fs from 'node:fs';
import url from 'node:url';
import path from 'node:path';

describe('server smoke', () => {
  it('boots and exports an Express app', () => {
    expect(app).toBeDefined();
    // Express apps are functions
    expect(typeof app).toBe('function');
  });

  it('does not import anything under ./agents/ or ../shared/workflow', () => {
    const here = path.dirname(url.fileURLToPath(import.meta.url));
    const src = fs.readFileSync(path.join(here, '..', 'server.js'), 'utf8');
    expect(src).not.toMatch(/from\s+['"]\.\/agents/);
    expect(src).not.toMatch(/from\s+['"]\.\.\/shared\/workflow/);
  });

  it('mounts POST /api/kdp/books/:slug/audit-puzzles', async () => {
    // No book seeded with this slug → expect 404, NOT "Cannot POST" from
    // the express default 404 handler.
    const res = await request(app)
      .post('/api/kdp/books/nonexistent-slug/audit-puzzles')
      .send();
    expect([400, 404, 500]).toContain(res.status);
    expect(String(res.text)).not.toMatch(/Cannot POST/i);
  });
});
