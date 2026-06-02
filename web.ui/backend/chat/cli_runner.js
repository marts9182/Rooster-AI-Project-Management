/**
 * Spawn the Claude Code CLI for one chat turn and stream its output.
 *
 * IMPORTANT — design corrections vs. the original plan (informed by the
 * Phase 1 spike, see docs/superpowers/specs/2026-05-27-claude-chat-spike-report.md):
 *
 *  1. `--session-id <uuid>` is CREATE-only. Subsequent turns into the same
 *     conversation MUST use `--resume <uuid>` instead; reusing
 *     `--session-id` errors with "Session ID … is already in use."
 *  2. On Windows, `claude` is an npm shim (`claude.cmd`). Plain
 *     `spawn('claude', ...)` without `shell: true` fails with ENOENT. We
 *     pass `shell: true` here; it is harmless on macOS/Linux.
 *  3. Tool-use markers and fine-grained streaming require
 *     `--output-format stream-json --verbose --include-partial-messages`.
 *     Without these, stdout arrives as a single end-of-turn block and
 *     tool calls are invisible. The plan's `__TOOL__{json}` marker scheme
 *     never existed — disregard it.
 *  4. Output is therefore a stream of newline-delimited JSON objects.
 *     The shapes we care about:
 *       - {type:"system", subtype:"init", session_id:"..."}
 *           → capture session_id (especially needed on first turn).
 *       - {type:"stream_event", event:{type:"content_block_start",
 *           content_block:{type:"tool_use", id, name, input}}}
 *           → emit tool-call `started` event.
 *       - {type:"stream_event", event:{type:"content_block_delta",
 *           delta:{type:"text_delta", text}}}
 *           → emit a text chunk.
 *       - {type:"stream_event", event:{type:"content_block_delta",
 *           delta:{type:"input_json_delta", partial_json}}}
 *           → accumulate tool-input JSON shards.
 *       - {type:"stream_event", event:{type:"content_block_stop", index}}
 *           → if that block was a tool_use, emit `completed` event with
 *             parsed args and ms elapsed.
 *       - {type:"result", subtype:"success", result, total_cost_usd, …}
 *           → terminal-of-turn; record final text and cost.
 */

import { spawn as defaultSpawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';

/**
 * @typedef {Object} ToolCallEvent
 * @property {string} tool
 * @property {string} id
 * @property {'started'|'completed'} status
 * @property {object} [args]
 * @property {number} [ms]
 */

/**
 * @typedef {Object} ToolCall
 * @property {string} tool
 * @property {string} id
 * @property {object} args
 * @property {number} ms
 */

/**
 * @typedef {Object} RunResult
 * @property {string} aggregatedText
 * @property {ToolCall[]} toolCalls
 * @property {string} claudeSessionId
 * @property {number} exitCode
 * @property {number} [costUsd]
 */

/**
 * @param {{
 *   conversationId: number,
 *   claudeSessionId: string | null,
 *   prompt: string,
 *   cwd: string,
 *   onChunk: (text: string) => void,
 *   onToolCall: (call: ToolCallEvent) => void,
 *   onError: (err: Error) => void,
 *   onComplete: (result: RunResult) => void,
 *   timeoutMs: number,
 *   spawnFn?: typeof defaultSpawn,
 * }} args
 * @returns {Promise<RunResult>}
 */
export function runClaudeTurn({
  conversationId: _conversationId,
  claudeSessionId,
  prompt,
  cwd,
  onChunk,
  onToolCall,
  onError,
  onComplete,
  timeoutMs,
  spawnFn = defaultSpawn,
}) {
  // Build argv per spike findings.
  // NOTE: On Windows, `shell: true` joins argv with spaces and re-parses the
  // string via cmd.exe. If the prompt is passed as a positional arg, cmd.exe
  // splits it at unquoted whitespace and only the first word reaches `claude`.
  // We pipe the prompt over stdin instead — `claude --print` reads from stdin
  // when no prompt argv is supplied. This sidesteps cross-platform shell
  // quoting entirely.
  const args = [
    '--print',
    '--output-format', 'stream-json',
    '--verbose',
    '--include-partial-messages',
  ];

  // First turn → create session with a fresh UUID; subsequent turns → resume.
  let effectiveSessionId = claudeSessionId;
  if (claudeSessionId) {
    args.push('--resume', claudeSessionId);
  } else {
    effectiveSessionId = randomUUID();
    args.push('--session-id', effectiveSessionId);
  }

  const child = spawnFn('claude', args, {
    cwd,
    stdio: ['pipe', 'pipe', 'pipe'],
    shell: true,
  });

  try {
    child.stdin.write(prompt);
    child.stdin.end();
  } catch { /* if stdin is already gone, the close handler will report exit */ }

  // Buffers and accumulators.
  let stdoutBuf = '';
  let stderrBuf = '';
  let aggregatedText = '';
  let capturedSessionId = effectiveSessionId;
  let costUsd;

  /**
   * @typedef {Object} OpenToolBlock
   * @property {string} id
   * @property {string} name
   * @property {number} startedAt
   * @property {string} jsonShards
   */
  /** @type {Map<number, OpenToolBlock>} */
  const openToolBlocksByIndex = new Map();
  /** @type {ToolCall[]} */
  const completedToolCalls = [];

  return new Promise((resolve) => {
    let settled = false;

    const timeoutHandle = setTimeout(() => {
      // Kill on timeout. The 'close' handler will resolve once the process exits.
      try {
        if (!child.killed) child.kill('SIGTERM');
      } catch { /* ignore */ }
    }, timeoutMs);

    const finalize = (exitCode) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutHandle);

      /** @type {RunResult} */
      const result = {
        aggregatedText,
        toolCalls: completedToolCalls,
        claudeSessionId: capturedSessionId,
        exitCode,
        ...(typeof costUsd === 'number' ? { costUsd } : {}),
      };

      if (exitCode !== 0) {
        const msg = stderrBuf.trim() || `claude exited with code ${exitCode}`;
        try { onError(new Error(msg)); } catch { /* ignore */ }
      }

      try { onComplete(result); } catch { /* ignore */ }
      resolve(result);
    };

    const handleLine = (line) => {
      const trimmed = line.trim();
      if (!trimmed) return;
      let obj;
      try {
        obj = JSON.parse(trimmed);
      } catch {
        // Not JSON — ignore; CLI shouldn't emit non-JSON to stdout in
        // stream-json mode, but tolerate it.
        return;
      }

      if (obj.type === 'system' && obj.subtype === 'init' && obj.session_id) {
        capturedSessionId = obj.session_id;
        return;
      }

      if (obj.type === 'stream_event' && obj.event) {
        const ev = obj.event;
        if (ev.type === 'content_block_start' && ev.content_block) {
          const cb = ev.content_block;
          if (cb.type === 'tool_use') {
            openToolBlocksByIndex.set(ev.index, {
              id: cb.id,
              name: cb.name,
              startedAt: Date.now(),
              jsonShards: '',
            });
            try {
              onToolCall({
                tool: cb.name,
                id: cb.id,
                status: 'started',
                args: cb.input ?? {},
              });
            } catch { /* ignore */ }
          }
          return;
        }
        if (ev.type === 'content_block_delta' && ev.delta) {
          if (ev.delta.type === 'text_delta' && typeof ev.delta.text === 'string') {
            aggregatedText += ev.delta.text;
            try { onChunk(ev.delta.text); } catch { /* ignore */ }
            return;
          }
          if (ev.delta.type === 'input_json_delta' &&
              typeof ev.delta.partial_json === 'string') {
            const block = openToolBlocksByIndex.get(ev.index);
            if (block) block.jsonShards += ev.delta.partial_json;
            return;
          }
        }
        if (ev.type === 'content_block_stop') {
          const block = openToolBlocksByIndex.get(ev.index);
          if (block) {
            openToolBlocksByIndex.delete(ev.index);
            let parsedArgs = {};
            if (block.jsonShards) {
              try { parsedArgs = JSON.parse(block.jsonShards); }
              catch { parsedArgs = { _raw: block.jsonShards }; }
            }
            const ms = Date.now() - block.startedAt;
            completedToolCalls.push({
              tool: block.name,
              id: block.id,
              args: parsedArgs,
              ms,
            });
            try {
              onToolCall({
                tool: block.name,
                id: block.id,
                status: 'completed',
                args: parsedArgs,
                ms,
              });
            } catch { /* ignore */ }
          }
          return;
        }
        return;
      }

      if (obj.type === 'result') {
        if (typeof obj.total_cost_usd === 'number') costUsd = obj.total_cost_usd;
        if (typeof obj.result === 'string' && !aggregatedText) {
          // Fallback: if no streaming text was emitted, take final result text.
          aggregatedText = obj.result;
        }
        return;
      }
    };

    child.stdout.on('data', (buf) => {
      stdoutBuf += buf.toString('utf8');
      let nlIdx;
      while ((nlIdx = stdoutBuf.indexOf('\n')) !== -1) {
        const line = stdoutBuf.slice(0, nlIdx);
        stdoutBuf = stdoutBuf.slice(nlIdx + 1);
        handleLine(line);
      }
    });

    child.stderr.on('data', (buf) => {
      stderrBuf += buf.toString('utf8');
    });

    child.on('error', (err) => {
      try { onError(err); } catch { /* ignore */ }
      finalize(typeof child.exitCode === 'number' ? child.exitCode : 1);
    });

    child.on('close', (code) => {
      // Flush any final partial line.
      if (stdoutBuf.length > 0) {
        handleLine(stdoutBuf);
        stdoutBuf = '';
      }
      finalize(typeof code === 'number' ? code : 0);
    });
  });
}
