/**
 * Persistence layer — JSON-file backed, with a per-file in-memory write queue
 * so concurrent agents can't lose comments via interleaved read-modify-write.
 *
 * Single-process only (single-user localhost). For multi-process deployments,
 * swap this for SQLite or a real DB.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Resolved absolute path to the data directory. Tests override this by
 * setting ROOSTER_DATA_DIR before importing this module.
 */
export const DATA_DIR = process.env.ROOSTER_DATA_DIR
  ? path.resolve(process.env.ROOSTER_DATA_DIR)
  : path.resolve(__dirname, '../../data');

// ── Write queue ─────────────────────────────────────────────────────────────
//
// Per-file Promise chain: every enqueueWrite(file, ...) waits for the previous
// in-flight operation on the same file to settle before reading-modifying-
// writing. This serializes the 7 agents' concurrent saveComment calls.

/** @type {Map<string, Promise<unknown>>} */
const writeChains = new Map();

/**
 * Run `mutator` exclusively for `filename`. The mutator is given the parsed
 * current contents (or `[]` if missing/invalid) and must return the new
 * contents to write back. Returns whatever the mutator returns.
 *
 * @template T
 * @param {string} filename
 * @param {(current: any) => { next: any, result: T }} mutator
 * @returns {Promise<T>}
 */
export function enqueueWrite(filename, mutator) {
  const prev = writeChains.get(filename) ?? Promise.resolve();
  const next = prev.then(async () => {
    const current = readJsonRaw(filename);
    const { next: nextValue, result } = mutator(current);
    writeJsonRaw(filename, nextValue);
    return result;
  });
  // Keep the chain alive but don't let a rejection poison the next call.
  writeChains.set(
    filename,
    next.catch((err) => {
      console.error(`[persistence] write to ${filename} failed:`, err);
    }),
  );
  return next;
}

// ── Raw file IO ─────────────────────────────────────────────────────────────

function readJsonRaw(filename) {
  const filepath = path.join(DATA_DIR, filename);
  try {
    return JSON.parse(fs.readFileSync(filepath, 'utf-8'));
  } catch (err) {
    if (err && err.code !== 'ENOENT') {
      console.error(`[persistence] failed to read ${filename}:`, err.message);
    }
    return [];
  }
}

function writeJsonRaw(filename, data) {
  const filepath = path.join(DATA_DIR, filename);
  fs.writeFileSync(filepath, JSON.stringify(data, null, 2), 'utf-8');
}

/** Synchronous read — fine for read paths (idempotent, no race). */
export function readJson(filename) {
  return readJsonRaw(filename);
}

/**
 * Direct synchronous write (use sparingly — prefer enqueueWrite for any
 * file written by more than one caller). Currently used for one-shot
 * agent-state initialization at startup.
 */
export function writeJson(filename, data) {
  writeJsonRaw(filename, data);
}

// ── High-level helpers used by AgentRuntime ─────────────────────────────────

/**
 * Append a comment to messages.json, serialized with all other writers.
 */
export async function saveComment(comment) {
  return enqueueWrite('messages.json', (current) => {
    const messages = Array.isArray(current) ? current : [];
    messages.push(comment);
    return { next: messages, result: comment };
  });
}

/**
 * Get all comments for a task (chronological order; same as input order).
 */
export function getTaskComments(taskId) {
  const messages = readJson('messages.json');
  return messages.filter((m) => String(m.task_id) === String(taskId));
}

/**
 * Update an agent record's status and current_task in agents.json.
 * Serialized so concurrent thinking/idle events don't clobber each other.
 */
export async function updateAgentStatus(agentId, status, currentTask = null) {
  return enqueueWrite('agents.json', (current) => {
    const agents = Array.isArray(current) ? current : [];
    const rec = agents.find((a) => a.id === agentId);
    if (rec) {
      rec.status = status;
      rec.current_task = currentTask;
    }
    return { next: agents, result: rec };
  });
}

/** Replace the entire agents.json (used at startup to reset to idle). */
export async function replaceAgents(agentRecords) {
  return enqueueWrite('agents.json', () => ({ next: agentRecords, result: agentRecords }));
}

/**
 * Wait for any pending writes to flush. Useful in tests and on graceful
 * shutdown so in-flight comments don't disappear.
 */
export async function flushAllWrites() {
  const inFlight = Array.from(writeChains.values());
  await Promise.allSettled(inFlight);
}

// ── Shaped facade matching the previous `persistence` object ────────────────
//
// AgentRuntime / BaseAgent expect a synchronous-ish API. We expose async
// methods now (saveComment is awaited internally inside _onTaskMoved) but
// keep the same names.

export const persistence = {
  saveComment,
  getTaskComments,
  updateAgentStatus,
  replaceAgents,
  flushAllWrites,
  enqueueWrite,
  readJson,
  writeJson,
  DATA_DIR,
};
