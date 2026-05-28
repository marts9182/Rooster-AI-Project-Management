import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  putPreview,
  getPreview,
  getLatestPreview,
  deletePreview,
  _resetForTests,
} from '../../kdp/preview_store.js';

describe('preview_store', () => {
  beforeEach(() => {
    _resetForTests();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('stores and retrieves a preview by id', () => {
    const preview = { preview_id: 'a', created_at: new Date().toISOString() };
    putPreview(preview);
    expect(getPreview('a')).toEqual(preview);
  });

  it('returns null for unknown id', () => {
    expect(getPreview('nope')).toBeNull();
  });

  it('getLatest returns the most recently put preview', () => {
    putPreview({ preview_id: 'a', created_at: '2026-05-27T10:00:00Z' });
    putPreview({ preview_id: 'b', created_at: '2026-05-27T11:00:00Z' });
    expect(getLatestPreview()?.preview_id).toBe('b');
  });

  it('getLatest returns null when the store is empty', () => {
    expect(getLatestPreview()).toBeNull();
  });

  it('delete removes a preview', () => {
    putPreview({ preview_id: 'a', created_at: new Date().toISOString() });
    deletePreview('a');
    expect(getPreview('a')).toBeNull();
  });

  it('expires entries after 30 minutes', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-27T10:00:00Z'));
    putPreview({ preview_id: 'a', created_at: new Date().toISOString() });
    vi.setSystemTime(new Date('2026-05-27T10:29:59Z'));
    expect(getPreview('a')).not.toBeNull();
    vi.setSystemTime(new Date('2026-05-27T10:30:01Z'));
    expect(getPreview('a')).toBeNull();
    expect(getLatestPreview()).toBeNull();
  });
});
