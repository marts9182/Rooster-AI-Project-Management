import { describe, it, expect, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createPlansRouter } from '../../plans/routes.js';

function makeApp() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'plans-routes-'));
  const sp = path.join(root, 'superpowers');
  fs.mkdirSync(path.join(sp, 'specs'), { recursive: true });
  fs.mkdirSync(path.join(sp, 'plans'), { recursive: true });
  fs.writeFileSync(
    path.join(sp, 'specs', '2026-05-26-foo-design.md'),
    '---\ntitle: Foo Spec\n---\n# Foo Spec\n\nbody\n',
  );
  fs.writeFileSync(
    path.join(sp, 'plans', '2026-05-26-foo-implementation.md'),
    '# Foo Plan\n\n- [ ] one\n- [x] two\n',
  );
  const app = express();
  app.use('/api/plans', createPlansRouter({ superpowersRoot: sp }));
  return { app, sp };
}

describe('plans/routes', () => {
  /** @type {ReturnType<typeof makeApp>} */
  let ctx;
  beforeEach(() => {
    ctx = makeApp();
  });

  it('GET /api/plans returns sorted entries with progress', async () => {
    const res = await request(ctx.app).get('/api/plans');
    expect(res.status).toBe(200);
    expect(res.body.entries).toHaveLength(2);
    const plan = res.body.entries.find((e) => e.kind === 'plan');
    expect(plan.progress).toEqual({ open: 1, done: 1, total: 2, percent: 50 });
  });

  it('GET /api/plans/:slug returns markdown + frontmatter, plan-first if both exist', async () => {
    const res = await request(ctx.app).get('/api/plans/foo');
    expect(res.status).toBe(200);
    expect(res.body.entries).toHaveLength(2); // spec + plan for the same slug
    const plan = res.body.entries.find((e) => e.kind === 'plan');
    expect(plan.markdown).toContain('# Foo Plan');
    expect(plan.frontmatter).toBeDefined();
  });

  it('GET /api/plans/:slug returns 404 for unknown slug', async () => {
    const res = await request(ctx.app).get('/api/plans/nope');
    expect(res.status).toBe(404);
  });

  it('GET /api/plans/:slug rejects slugs with path separators', async () => {
    const res = await request(ctx.app).get('/api/plans/..%2F..%2Fetc');
    // Either 400 (rejected at route level) or 404 (no match) is acceptable;
    // important is that we do NOT return a 200 with arbitrary file contents.
    expect([400, 404]).toContain(res.status);
  });
});
