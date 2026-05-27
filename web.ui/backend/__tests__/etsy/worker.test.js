import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { startEtsyWorker } from '../../etsy/worker.js';

describe('startEtsyWorker', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('runs an initial pass then re-runs every interval ms', async () => {
    const runPass = vi
      .fn()
      .mockResolvedValue({ inserted: 0, updated: 0, statusChanged: 0 });
    const onHeartbeat = vi.fn();
    const onError = vi.fn();
    const stop = startEtsyWorker({
      intervalMs: 1000,
      runPass,
      onHeartbeat,
      onError,
    });
    // Let initial microtasks settle.
    await vi.advanceTimersByTimeAsync(0);
    expect(runPass).toHaveBeenCalledTimes(1);
    expect(onHeartbeat).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1000);
    expect(runPass).toHaveBeenCalledTimes(2);

    stop();
    await vi.advanceTimersByTimeAsync(5000);
    expect(runPass).toHaveBeenCalledTimes(2);
  });

  it('reports errors without stopping the loop', async () => {
    const runPass = vi
      .fn()
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce({ inserted: 0, updated: 0, statusChanged: 0 });
    const onError = vi.fn();
    const stop = startEtsyWorker({
      intervalMs: 1000,
      runPass,
      onHeartbeat: vi.fn(),
      onError,
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(onError).toHaveBeenCalledWith(expect.stringContaining('boom'));

    await vi.advanceTimersByTimeAsync(1000);
    expect(runPass).toHaveBeenCalledTimes(2);
    stop();
  });
});
