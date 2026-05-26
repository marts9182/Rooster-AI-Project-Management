/**
 * Smoke test: server must import and start without depending on the
 * archived AgentRuntime. Confirms Commit 1 cleanly severs the Kanban
 * dependency before Commit 2 introduces SQLite + SSE + workers.
 */
import { describe, it, expect } from 'vitest';
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
});
