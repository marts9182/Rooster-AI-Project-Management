#!/usr/bin/env node
/**
 * Upsert the publishing roadmap YAML into the dashboard's
 * /api/roadmap endpoint. Idempotent: on a 409 UNIQUE collision, the
 * script does a follow-up PUT with the non-key fields.
 *
 * Usage:
 *   node scripts/import_roadmap.mjs [path/to/file.yml]
 *
 * Defaults to docs/superpowers/roadmap/2026-h2-pocket-rooster-press.yml.
 */
import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';

const DEFAULT_YAML = path.resolve(
  path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')),
  '..',
  'docs/superpowers/roadmap/2026-h2-pocket-rooster-press.yml',
);
const DEFAULT_BASE = process.env.ROOSTER_DASHBOARD_URL || 'http://127.0.0.1:5000';

/**
 * @param {{yaml: string, fetchFn: typeof fetch, baseUrl: string}} args
 * @returns {Promise<{created:number, updated:number, errors:string[]}>}
 */
export async function importRoadmap({ yaml: yamlStr, fetchFn, baseUrl }) {
  const doc = yaml.load(yamlStr);
  const entries = Array.isArray(doc?.entries) ? doc.entries : [];
  let created = 0, updated = 0;
  /** @type {string[]} */
  const errors = [];
  for (const e of entries) {
    try {
      const postResp = await fetchFn(`${baseUrl}/api/roadmap`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(e),
      });
      if (postResp.status === 201) {
        created += 1;
        continue;
      }
      if (postResp.status === 409) {
        const qs = new URLSearchParams({
          kind: e.kind, from: e.target_release_date,
          to: nextDay(e.target_release_date),
        });
        const findResp = await fetchFn(`${baseUrl}/api/roadmap?${qs}`);
        const data = await findResp.json();
        const match = (data.rows ?? []).find((r) => r.slug === e.slug);
        if (!match) {
          errors.push(`${e.kind}/${e.slug}@${e.target_release_date}: 409 but no matching row found on lookup`);
          continue;
        }
        const { kind, slug, target_release_date, ...patch } = e;
        void kind; void slug; void target_release_date;
        const putResp = await fetchFn(`${baseUrl}/api/roadmap/${match.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(patch),
        });
        if (putResp.ok) {
          updated += 1;
        } else {
          errors.push(`${e.kind}/${e.slug}@${e.target_release_date}: PUT ${putResp.status}`);
        }
        continue;
      }
      const detail = await postResp.text();
      errors.push(`${e.kind}/${e.slug}@${e.target_release_date}: POST ${postResp.status} ${detail}`);
    } catch (err) {
      errors.push(`${e?.kind}/${e?.slug}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return { created, updated, errors };
}

function nextDay(yyyyMmDd) {
  const d = new Date(`${yyyyMmDd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

// CLI entry — only when run directly.
if (import.meta.url === `file://${process.argv[1]}`) {
  const filePath = process.argv[2] || DEFAULT_YAML;
  const yamlStr = fs.readFileSync(filePath, 'utf8');
  const result = await importRoadmap({ yaml: yamlStr, fetchFn: fetch, baseUrl: DEFAULT_BASE });
  console.log(`Created: ${result.created}, Updated: ${result.updated}, Errors: ${result.errors.length}`);
  for (const e of result.errors) console.error('  ' + e);
  process.exit(result.errors.length > 0 ? 1 : 0);
}
