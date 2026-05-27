/**
 * Side-effect env loader — imported FIRST in server.js so process.env is
 * populated before any module that reads it.
 *
 * Load order (later loads override earlier ones):
 *   1. web.ui/backend/.env             — module defaults (committed via .env.example)
 *   2. <repo-root>/.env.local          — workspace-wide secrets (Pinterest, KDP, Etsy, Gemini, etc.)
 *   3. web.ui/backend/.env.local       — backend-specific overrides
 *
 * Paths are anchored to this file so node can be launched from any cwd.
 */
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..');

dotenv.config({ path: path.join(here, '.env') });
dotenv.config({ path: path.join(repoRoot, '.env.local'), override: true });
dotenv.config({ path: path.join(here, '.env.local'), override: true });
