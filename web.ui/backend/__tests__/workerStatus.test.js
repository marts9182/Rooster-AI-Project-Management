import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  setWorkerHeartbeat,
  setWorkerError,
  getAllStatuses,
  trayColor,
  _resetWorkerStatus,
} from '../workerStatus.js';

beforeEach(() => {
  _resetWorkerStatus();
});

afterEach(() => {
  vi.useRealTimers();
  _resetWorkerStatus();
});

describe('workerStatus.js', () => {
  it('setWorkerHeartbeat populates last_success_at', () => {
    setWorkerHeartbeat('kdp');
    const all = getAllStatuses();
    expect(all.kdp).toBeDefined();
    expect(typeof all.kdp.last_success_at).toBe('string');
    expect(all.kdp.last_error_at).toBeNull();
  });

  it('setWorkerError populates last_error_at + last_error_message', () => {
    setWorkerError('etsy', 'OAuth failed');
    const all = getAllStatuses();
    expect(all.etsy.last_error_at).toBeTruthy();
    expect(all.etsy.last_error_message).toBe('OAuth failed');
  });

  it('getAllStatuses returns a snapshot of every registered worker', () => {
    setWorkerHeartbeat('kdp');
    setWorkerHeartbeat('etsy');
    setWorkerError('pinterest', 'rate limited');
    const all = getAllStatuses();
    expect(Object.keys(all).sort()).toEqual(['etsy', 'kdp', 'pinterest']);
  });

  it('_resetWorkerStatus clears every worker', () => {
    setWorkerHeartbeat('kdp');
    _resetWorkerStatus();
    expect(getAllStatuses()).toEqual({});
  });

  describe('trayColor', () => {
    it('returns green when no workers are registered', () => {
      expect(trayColor()).toBe('green');
    });

    it('returns green when a worker has heartbeated recently and has no error', () => {
      setWorkerHeartbeat('kdp');
      expect(trayColor()).toBe('green');
    });

    it('returns red when a worker has an error newer than its last success', () => {
      setWorkerHeartbeat('kdp');
      setWorkerError('kdp', 'something blew up');
      expect(trayColor()).toBe('red');
    });

    it('returns green when a worker recovered (heartbeat after error)', () => {
      setWorkerError('kdp', 'transient');
      setWorkerHeartbeat('kdp');
      expect(trayColor()).toBe('green');
    });

    it('returns yellow when no worker has heartbeated in the last 5 minutes', () => {
      const past = new Date('2026-05-26T12:00:00.000Z');
      vi.useFakeTimers();
      vi.setSystemTime(past);
      setWorkerHeartbeat('kdp');
      // Advance 6 minutes
      vi.setSystemTime(new Date(past.getTime() + 6 * 60 * 1000));
      expect(trayColor()).toBe('yellow');
    });
  });
});
