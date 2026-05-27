import { describe, it, expect } from 'vitest';
import { computeBlobPath, makeNoise } from '../blob_engine';

describe('blob_engine', () => {
  it('produces a deterministic path for fixed t + seed', () => {
    const noise = makeNoise(42);
    const d1 = computeBlobPath({ mood: 'idle', t: 0, size: 100, noise });
    const d2 = computeBlobPath({ mood: 'idle', t: 0, size: 100, noise });
    expect(d1).toBe(d2);
    expect(d1).toMatch(/^M [-\d.]+,/);
  });
  it('produces different paths across moods at same t', () => {
    const noise = makeNoise(42);
    const idle = computeBlobPath({ mood: 'idle', t: 0.5, size: 100, noise });
    const thinking = computeBlobPath({ mood: 'thinking', t: 0.5, size: 100, noise });
    expect(idle).not.toBe(thinking);
  });
});
