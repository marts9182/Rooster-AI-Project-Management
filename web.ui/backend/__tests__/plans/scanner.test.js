import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { scanDocs, computeProgress, _slugFromFilename, _statusOf } from '../../plans/scanner.js';

/**
 * Builds an isolated docs/ tree with the same layout the scanner expects.
 * Returns the temp root (caller passes `${root}/superpowers` into scanDocs).
 */
function makeDocsTree() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'plans-scanner-'));
  fs.mkdirSync(path.join(root, 'superpowers', 'specs'), { recursive: true });
  fs.mkdirSync(path.join(root, 'superpowers', 'plans'), { recursive: true });
  return root;
}

describe('plans/scanner', () => {
  /** @type {string} */
  let root;
  beforeEach(() => {
    root = makeDocsTree();
  });

  it('computeProgress counts open and done checkboxes', () => {
    const md = `# Title\n\n- [ ] task one\n- [x] task two\n- [X] case insensitive\n- not a task\n`;
    expect(computeProgress(md)).toEqual({ open: 1, done: 2, total: 3, percent: 67 });
  });

  it('computeProgress returns 0% for files with no checkboxes', () => {
    const md = `# Heading\nparagraph\n`;
    expect(computeProgress(md)).toEqual({ open: 0, done: 0, total: 0, percent: 0 });
  });

  it('_slugFromFilename strips date prefix and -implementation/-design suffix', () => {
    expect(_slugFromFilename('2026-05-22-etsy-rooster-shop-plan-3-implementation.md')).toBe(
      'etsy-rooster-shop-plan-3',
    );
    expect(_slugFromFilename('2026-05-22-etsy-rooster-shop-plan-3-design.md')).toBe(
      'etsy-rooster-shop-plan-3',
    );
    expect(_slugFromFilename('2026-05-13-may-release-pair.md')).toBe('may-release-pair');
  });

  it('_statusOf returns done/in-flight/open per progress', () => {
    expect(_statusOf({ open: 0, done: 5, total: 5, percent: 100 })).toBe('done');
    expect(_statusOf({ open: 2, done: 1, total: 3, percent: 33 })).toBe('in-flight');
    expect(_statusOf({ open: 0, done: 0, total: 0, percent: 0 })).toBe('open');
  });

  it('scanDocs finds specs and plans, parses date from filename + frontmatter title', () => {
    fs.writeFileSync(
      path.join(root, 'superpowers', 'specs', '2026-05-26-foo-design.md'),
      '---\ntitle: Foo Design\ndate: 2026-05-26\n---\n# Foo\n',
    );
    fs.writeFileSync(
      path.join(root, 'superpowers', 'plans', '2026-05-26-foo-implementation.md'),
      '# Foo Implementation Plan\n\n- [ ] one\n- [x] two\n',
    );
    const entries = scanDocs(path.join(root, 'superpowers'));
    expect(entries).toHaveLength(2);
    const spec = entries.find((e) => e.kind === 'spec');
    const plan = entries.find((e) => e.kind === 'plan');
    expect(spec.title).toBe('Foo Design');
    expect(spec.date).toBe('2026-05-26');
    expect(spec.slug).toBe('foo');
    expect(spec.status).toBe('open');
    expect(plan.slug).toBe('foo');
    expect(plan.status).toBe('in-flight');
    expect(plan.progress).toEqual({ open: 1, done: 1, total: 2, percent: 50 });
  });

  it('scanDocs sorts entries by date DESC then title ASC', () => {
    fs.writeFileSync(
      path.join(root, 'superpowers', 'specs', '2026-05-01-old.md'),
      '---\ntitle: Old\n---\n',
    );
    fs.writeFileSync(
      path.join(root, 'superpowers', 'specs', '2026-05-26-new-b.md'),
      '---\ntitle: New B\n---\n',
    );
    fs.writeFileSync(
      path.join(root, 'superpowers', 'specs', '2026-05-26-new-a.md'),
      '---\ntitle: New A\n---\n',
    );
    const entries = scanDocs(path.join(root, 'superpowers'));
    expect(entries.map((e) => e.title)).toEqual(['New A', 'New B', 'Old']);
  });

  it('scanDocs handles missing frontmatter (uses H1 as title)', () => {
    fs.writeFileSync(
      path.join(root, 'superpowers', 'plans', '2026-05-26-no-fm.md'),
      '# Heading Used As Title\n\nbody\n',
    );
    const entries = scanDocs(path.join(root, 'superpowers'));
    expect(entries[0].title).toBe('Heading Used As Title');
  });

  it('scanDocs falls back to slug if no H1 and no frontmatter title', () => {
    fs.writeFileSync(
      path.join(root, 'superpowers', 'plans', '2026-05-26-bare-file.md'),
      'just some text\n',
    );
    const entries = scanDocs(path.join(root, 'superpowers'));
    expect(entries[0].title).toBe('bare-file');
  });
});
