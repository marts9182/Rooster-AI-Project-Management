import { describe, it, expect, beforeEach } from 'vitest';
import {
  get,
  set,
  clearForConversation,
  cleanupIdle,
  _resetForTests as resetSessionState,
} from '../session_state.js';

beforeEach(() => resetSessionState());

describe('chat/session_state.js', () => {
  it('get returns null for unknown conversation', () => {
    expect(get(99)).toBeNull();
  });
  it('set stores claudeSessionId + lastActivityAt', () => {
    set(1, { claudeSessionId: 'abc', lastActivityAt: 1000 });
    expect(get(1)).toEqual({ claudeSessionId: 'abc', lastActivityAt: 1000 });
  });
  it('clearForConversation removes entry', () => {
    set(1, { claudeSessionId: 'abc', lastActivityAt: 1000 });
    clearForConversation(1);
    expect(get(1)).toBeNull();
  });
  it('cleanupIdle removes entries older than maxIdleMs', () => {
    set(1, { claudeSessionId: 'a', lastActivityAt: 0 });
    set(2, { claudeSessionId: 'b', lastActivityAt: 10_000 });
    cleanupIdle({ maxIdleMs: 5_000, now: 10_001 });
    expect(get(1)).toBeNull();
    expect(get(2)).not.toBeNull();
  });
});
