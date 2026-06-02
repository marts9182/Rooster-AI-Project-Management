import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import { runClaudeTurn } from '../cli_runner.js';

/**
 * Build a fake ChildProcess that we can drive from tests by emitting stdout/
 * stderr 'data' events and finally a 'close' event.
 */
function makeFakeProc() {
  const proc = new EventEmitter();
  proc.stdout = new EventEmitter();
  proc.stderr = new EventEmitter();
  proc.stdin = {
    chunks: [],
    ended: false,
    write(chunk) { this.chunks.push(String(chunk)); },
    end() { this.ended = true; },
  };
  proc.kill = vi.fn(function killImpl() {
    proc.killed = true;
    return true;
  });
  proc.killed = false;
  return proc;
}

/** Helper: emit a single JSON-line object on stdout (with trailing newline). */
function emitJsonLine(proc, obj) {
  proc.stdout.emit('data', Buffer.from(JSON.stringify(obj) + '\n'));
}

/** Build a minimal "result" event line. */
function resultEvent({ text = 'done', cost = 0.01 } = {}) {
  return {
    type: 'result',
    subtype: 'success',
    is_error: false,
    duration_ms: 100,
    result: text,
    session_id: 'whatever',
    total_cost_usd: cost,
    usage: {},
  };
}

describe('chat/cli_runner.js — runClaudeTurn', () => {
  beforeEach(() => {
    // Tests using fake timers will opt in individually.
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('first turn captures session_id from system/init event', async () => {
    const proc = makeFakeProc();
    const spawnFn = vi.fn(() => proc);

    const newSid = randomUUID();
    const onChunk = vi.fn();
    const onToolCall = vi.fn();
    const onError = vi.fn();
    const onComplete = vi.fn();

    const promise = runClaudeTurn({
      conversationId: 1,
      claudeSessionId: null,
      prompt: 'hi',
      cwd: process.cwd(),
      onChunk,
      onToolCall,
      onError,
      onComplete,
      timeoutMs: 60_000,
      spawnFn,
    });

    // Let the spawn handler attach listeners.
    await Promise.resolve();

    emitJsonLine(proc, {
      type: 'system',
      subtype: 'init',
      session_id: newSid,
      cwd: process.cwd(),
      tools: [],
    });
    emitJsonLine(proc, resultEvent({ text: 'hello' }));
    proc.emit('close', 0);

    const result = await promise;
    expect(result.claudeSessionId).toBe(newSid);
    expect(result.exitCode).toBe(0);
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onComplete.mock.calls[0][0].claudeSessionId).toBe(newSid);
  });

  it('resume turn uses --resume <id> and not --session-id', async () => {
    const proc = makeFakeProc();
    const spawnFn = vi.fn(() => proc);
    const oldSid = 'old-sid';

    const promise = runClaudeTurn({
      conversationId: 1,
      claudeSessionId: oldSid,
      prompt: 'hi again',
      cwd: process.cwd(),
      onChunk: vi.fn(),
      onToolCall: vi.fn(),
      onError: vi.fn(),
      onComplete: vi.fn(),
      timeoutMs: 60_000,
      spawnFn,
    });

    await Promise.resolve();

    const argsArray = spawnFn.mock.calls[0][1];
    expect(argsArray).toContain('--resume');
    const resumeIdx = argsArray.indexOf('--resume');
    expect(argsArray[resumeIdx + 1]).toBe(oldSid);
    expect(argsArray).not.toContain('--session-id');

    emitJsonLine(proc, {
      type: 'system',
      subtype: 'init',
      session_id: oldSid,
      cwd: process.cwd(),
      tools: [],
    });
    emitJsonLine(proc, resultEvent());
    proc.emit('close', 0);
    await promise;
  });

  it('first turn uses --session-id with a newly-generated UUID', async () => {
    const proc = makeFakeProc();
    const spawnFn = vi.fn(() => proc);

    const promise = runClaudeTurn({
      conversationId: 2,
      claudeSessionId: null,
      prompt: 'kickoff',
      cwd: process.cwd(),
      onChunk: vi.fn(),
      onToolCall: vi.fn(),
      onError: vi.fn(),
      onComplete: vi.fn(),
      timeoutMs: 60_000,
      spawnFn,
    });

    await Promise.resolve();

    const argsArray = spawnFn.mock.calls[0][1];
    expect(argsArray).toContain('--session-id');
    const sidIdx = argsArray.indexOf('--session-id');
    const generated = argsArray[sidIdx + 1];
    // UUID v4 shape: 8-4-4-4-12 hex chars
    expect(generated).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
    expect(argsArray).not.toContain('--resume');

    emitJsonLine(proc, {
      type: 'system',
      subtype: 'init',
      session_id: generated,
      cwd: process.cwd(),
      tools: [],
    });
    emitJsonLine(proc, resultEvent());
    proc.emit('close', 0);
    await promise;
  });

  it('text chunks are emitted from content_block_delta events', async () => {
    const proc = makeFakeProc();
    const spawnFn = vi.fn(() => proc);
    const onChunk = vi.fn();
    const newSid = randomUUID();

    const promise = runClaudeTurn({
      conversationId: 3,
      claudeSessionId: null,
      prompt: 'p',
      cwd: process.cwd(),
      onChunk,
      onToolCall: vi.fn(),
      onError: vi.fn(),
      onComplete: vi.fn(),
      timeoutMs: 60_000,
      spawnFn,
    });

    await Promise.resolve();

    emitJsonLine(proc, {
      type: 'system',
      subtype: 'init',
      session_id: newSid,
      cwd: process.cwd(),
      tools: [],
    });
    emitJsonLine(proc, {
      type: 'stream_event',
      event: {
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'text_delta', text: 'Hello' },
      },
    });
    emitJsonLine(proc, {
      type: 'stream_event',
      event: {
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'text_delta', text: ' world' },
      },
    });
    emitJsonLine(proc, resultEvent({ text: 'Hello world' }));
    proc.emit('close', 0);

    const result = await promise;
    expect(onChunk).toHaveBeenCalledTimes(2);
    expect(onChunk.mock.calls[0][0]).toBe('Hello');
    expect(onChunk.mock.calls[1][0]).toBe(' world');
    expect(result.aggregatedText).toBe('Hello world');
  });

  it('tool calls accumulate from content_block_start + stop pairs', async () => {
    const proc = makeFakeProc();
    const spawnFn = vi.fn(() => proc);
    const onToolCall = vi.fn();
    const newSid = randomUUID();

    const promise = runClaudeTurn({
      conversationId: 4,
      claudeSessionId: null,
      prompt: 'read file',
      cwd: process.cwd(),
      onChunk: vi.fn(),
      onToolCall,
      onError: vi.fn(),
      onComplete: vi.fn(),
      timeoutMs: 60_000,
      spawnFn,
    });

    await Promise.resolve();

    emitJsonLine(proc, {
      type: 'system',
      subtype: 'init',
      session_id: newSid,
      cwd: process.cwd(),
      tools: [],
    });
    // tool_use block opens at index 1
    emitJsonLine(proc, {
      type: 'stream_event',
      event: {
        type: 'content_block_start',
        index: 1,
        content_block: {
          type: 'tool_use',
          id: 't1',
          name: 'Read',
          input: {},
        },
      },
    });
    // partial input delta filling args
    emitJsonLine(proc, {
      type: 'stream_event',
      event: {
        type: 'content_block_delta',
        index: 1,
        delta: { type: 'input_json_delta', partial_json: '{"file_path":"x"}' },
      },
    });
    // block close
    emitJsonLine(proc, {
      type: 'stream_event',
      event: { type: 'content_block_stop', index: 1 },
    });
    emitJsonLine(proc, resultEvent());
    proc.emit('close', 0);

    const result = await promise;
    expect(onToolCall).toHaveBeenCalledTimes(2);
    expect(onToolCall.mock.calls[0][0]).toMatchObject({
      tool: 'Read',
      id: 't1',
      status: 'started',
    });
    expect(onToolCall.mock.calls[1][0]).toMatchObject({
      tool: 'Read',
      id: 't1',
      status: 'completed',
      args: { file_path: 'x' },
    });
    expect(typeof onToolCall.mock.calls[1][0].ms).toBe('number');
    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls[0]).toMatchObject({
      tool: 'Read',
      id: 't1',
      args: { file_path: 'x' },
    });
    expect(typeof result.toolCalls[0].ms).toBe('number');
  });

  it('non-zero exit triggers onError and returns exitCode', async () => {
    const proc = makeFakeProc();
    const spawnFn = vi.fn(() => proc);
    const onError = vi.fn();

    const promise = runClaudeTurn({
      conversationId: 5,
      claudeSessionId: null,
      prompt: 'crash',
      cwd: process.cwd(),
      onChunk: vi.fn(),
      onToolCall: vi.fn(),
      onError,
      onComplete: vi.fn(),
      timeoutMs: 60_000,
      spawnFn,
    });

    await Promise.resolve();

    proc.stderr.emit('data', Buffer.from('boom'));
    proc.emit('close', 1);

    const result = await promise;
    expect(result.exitCode).toBe(1);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0][0].message).toMatch(/boom/);
  });

  it('prompt is piped over stdin (not passed as positional argv)', async () => {
    // Regression: on Windows with shell:true, an unquoted prompt argv is split
    // at whitespace by cmd.exe and only the first word reaches `claude`.
    // We now pipe the prompt to child.stdin instead.
    const proc = makeFakeProc();
    const spawnFn = vi.fn(() => proc);
    const prompt = 'Can you list all the books in my catalog';

    const promise = runClaudeTurn({
      conversationId: 7,
      claudeSessionId: null,
      prompt,
      cwd: process.cwd(),
      onChunk: vi.fn(),
      onToolCall: vi.fn(),
      onError: vi.fn(),
      onComplete: vi.fn(),
      timeoutMs: 60_000,
      spawnFn,
    });

    await Promise.resolve();

    // Prompt must not appear in argv.
    const argsArray = spawnFn.mock.calls[0][1];
    expect(argsArray).not.toContain(prompt);
    // It must, however, have been written to stdin and stdin closed.
    expect(proc.stdin.chunks.join('')).toBe(prompt);
    expect(proc.stdin.ended).toBe(true);

    emitJsonLine(proc, {
      type: 'system',
      subtype: 'init',
      session_id: 'sid',
      cwd: process.cwd(),
      tools: [],
    });
    emitJsonLine(proc, resultEvent());
    proc.emit('close', 0);
    await promise;
  });

  it('timeout kills the subprocess', async () => {
    vi.useFakeTimers();
    const proc = makeFakeProc();
    const spawnFn = vi.fn(() => proc);

    const promise = runClaudeTurn({
      conversationId: 6,
      claudeSessionId: null,
      prompt: 'long',
      cwd: process.cwd(),
      onChunk: vi.fn(),
      onToolCall: vi.fn(),
      onError: vi.fn(),
      onComplete: vi.fn(),
      timeoutMs: 1000,
      spawnFn,
    });

    // Let promise constructor attach handlers
    await Promise.resolve();

    vi.advanceTimersByTime(1500);
    expect(proc.kill).toHaveBeenCalledWith('SIGTERM');

    proc.emit('close', 143);
    const result = await promise;
    expect(result.exitCode).toBe(143);
  });
});
