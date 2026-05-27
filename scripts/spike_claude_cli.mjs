#!/usr/bin/env node
/**
 * Spike — verifies the 5 risks in spec §8 against the local Claude Code CLI.
 *
 * Runs TWO turns inside a single --session-id to test:
 *   (a) session-id resume — turn 2 must remember turn 1
 *   (b) streaming granularity — measures chunk count + inter-chunk gaps
 *   (c) tool-call markers — turn 2 prompt forces a Read; we grep stdout
 *   (d) permission-prompt headless behavior — no TTY; does it block?
 *   (e) startup latency — wall-time from spawn → first stdout byte
 *
 * Prints a markdown report to stdout. Pipe into the report file.
 */
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(__filename), '..');

const sessionId = randomUUID();

/**
 * `--session-id <uuid>` only works for the FIRST turn (it errors with
 * "already in use" if reused). Subsequent turns must use `--resume <uuid>`.
 * The runTurn helper takes a `resume` flag to pick the right flag per turn.
 *
 * @param {string} prompt
 * @param {{resume: boolean}} opts
 * @returns {Promise<{stdout: string, stderr: string, code: number, firstByteMs: number, totalMs: number, chunkCount: number}>}
 */
function runTurn(prompt, opts) {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now();
    let firstByteAt = null;
    let chunkCount = 0;
    const out = [];
    const err = [];
    const sessionArgs = opts.resume
      ? ['--resume', sessionId]
      : ['--session-id', sessionId];
    // Use stream-json so we can observe streaming granularity AND see explicit
    // tool_use events (risks (b) and (c)). --verbose is required for
    // stream-json with --print per the CLI.
    // On Windows the `claude` binary is a .cmd/.ps1 shim; node's spawn() cannot
    // resolve those without a shell. Use shell:true so the OS PATH lookup runs.
    const child = spawn(
      'claude',
      [
        '--print',
        '--output-format', 'stream-json',
        '--verbose',
        '--include-partial-messages',
        ...sessionArgs,
        JSON.stringify(prompt),
      ],
      { cwd: REPO_ROOT, stdio: ['ignore', 'pipe', 'pipe'], shell: true },
    );
    child.stdout.on('data', (buf) => {
      if (firstByteAt === null) firstByteAt = Date.now();
      chunkCount += 1;
      out.push(buf.toString('utf8'));
    });
    child.stderr.on('data', (buf) => err.push(buf.toString('utf8')));
    child.on('error', reject);
    child.on('close', (code) => {
      const totalMs = Date.now() - startedAt;
      const firstByteMs = firstByteAt === null ? totalMs : firstByteAt - startedAt;
      resolve({
        stdout: out.join(''),
        stderr: err.join(''),
        code,
        firstByteMs,
        totalMs,
        chunkCount,
      });
    });
    // Hard 60s timeout per turn so a hung permission prompt is detectable.
    setTimeout(() => child.kill('SIGTERM'), 60_000).unref();
  });
}

const turn1 = await runTurn(
  'Remember the magic word for this conversation is "octopus". Reply with one short sentence acknowledging.',
  { resume: false },
);
const turn2 = await runTurn(
  'First, state the magic word from earlier in this conversation verbatim. ' +
  'Second, use the Read tool to open web.ui/backend/package.json and tell me ' +
  'the value of the top-level "name" field.',
  { resume: true },
);

process.stdout.write(`# Claude CLI spike report

Session ID: ${sessionId}

## Turn 1
- exit code: ${turn1.code}
- first-byte latency: ${turn1.firstByteMs}ms
- total: ${turn1.totalMs}ms
- chunk count (stdout 'data' events): ${turn1.chunkCount}
- stderr present: ${turn1.stderr.length > 0 ? 'YES' : 'no'}

### stdout
\`\`\`
${turn1.stdout}
\`\`\`

### stderr
\`\`\`
${turn1.stderr}
\`\`\`

## Turn 2
- exit code: ${turn2.code}
- first-byte latency: ${turn2.firstByteMs}ms
- total: ${turn2.totalMs}ms
- chunk count: ${turn2.chunkCount}
- stderr present: ${turn2.stderr.length > 0 ? 'YES' : 'no'}

### stdout
\`\`\`
${turn2.stdout}
\`\`\`

### stderr
\`\`\`
${turn2.stderr}
\`\`\`

## Risk evaluation
- (a) session-id resume: ${/octopus/i.test(turn2.stdout) ? 'PASS' : 'FAIL'} (looked for "octopus" in turn 2 stdout)
- (b) streaming granularity: ${turn2.chunkCount > 1 ? 'PASS (multi-chunk, ' + turn2.chunkCount + ' chunks)' : 'PARTIAL (single block)'}
- (c) tool-call markers: ${/"type"\s*:\s*"tool_use"|"name"\s*:\s*"Read"/i.test(turn2.stdout) ? 'PASS (tool_use event observed in stream-json)' : 'FAIL (no tool_use event)'}
- (d) permission-prompt headless: ${turn1.code === 0 && turn2.code === 0 ? 'PASS (both turns exit 0)' : 'FAIL (turn1=' + turn1.code + ' turn2=' + turn2.code + ')'}
- (e) startup latency: ${turn1.firstByteMs}ms turn 1 / ${turn2.firstByteMs}ms turn 2
`);
