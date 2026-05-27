/**
 * better-sqlite3 wrapper. Opens (or creates) `data/dashboard.db`, sets
 * WAL mode, applies any pending migrations from `web.ui/backend/migrations/`,
 * and exposes a singleton handle.
 *
 * Tests override the DB location by setting ROOSTER_DB_PATH before importing.
 */

import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** @returns {string} */
function resolveDbPath() {
  if (process.env.ROOSTER_DB_PATH) {
    return path.resolve(process.env.ROOSTER_DB_PATH);
  }
  // Default: <repo-root>/data/dashboard.db
  return path.resolve(__dirname, '..', '..', 'data', 'dashboard.db');
}

/** @returns {string} */
function migrationsDir() {
  return path.resolve(__dirname, 'migrations');
}

/**
 * Apply any unapplied migration files (sorted by filename). Each successful
 * migration is recorded in a `_schema_migrations` table so re-running is a
 * no-op.
 *
 * @param {Database.Database} db
 */
function migrate(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS _schema_migrations (
    name TEXT PRIMARY KEY,
    applied_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);
  const applied = new Set(
    db.prepare('SELECT name FROM _schema_migrations').all().map((r) => r.name),
  );
  const dir = migrationsDir();
  if (!fs.existsSync(dir)) return;
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  const insert = db.prepare(
    'INSERT INTO _schema_migrations(name) VALUES (?)',
  );
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = fs.readFileSync(path.join(dir, file), 'utf8');
    db.exec('BEGIN');
    try {
      db.exec(sql);
      insert.run(file);
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw new Error(`Migration ${file} failed: ${err.message}`);
    }
  }
}

/** @type {Database.Database | null} */
let cached = null;

/**
 * Open (or return the cached) database handle. WAL mode enabled; foreign keys on.
 *
 * @returns {Database.Database}
 */
export function openDb() {
  if (cached && cached.open) return cached;
  cached = null;
  const dbPath = resolveDbPath();
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  migrate(db);
  cached = db;
  return db;
}

/** For tests — resets the cached handle so a new path takes effect. */
export function _resetForTests() {
  if (cached) cached.close();
  cached = null;
}
