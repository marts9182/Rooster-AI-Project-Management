/**
 * Side-effect env loader — imported FIRST in server.js so process.env is
 * populated before any module that reads it (AgentRuntime, ImageGenerationService).
 *
 * Loads `.env` then `.env.local` with override, matching the Vite convention
 * the frontend already uses. Paths are anchored to this file so node can be
 * launched from any cwd.
 */
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(here, '.env') });
dotenv.config({ path: path.join(here, '.env.local'), override: true });
