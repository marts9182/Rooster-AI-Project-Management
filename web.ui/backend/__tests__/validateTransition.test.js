import { describe, it, expect } from 'vitest';
import { validateTransition, STAGE_ORDER } from '../../shared/workflow.mjs';

describe('validateTransition', () => {
  it('allows moving to the next stage', () => {
    expect(validateTransition('backlog', 'analyze')).toBeNull();
    expect(validateTransition('analyze', 'develop')).toBeNull();
    expect(validateTransition('develop', 'ready_for_test')).toBeNull();
    expect(validateTransition('ready_for_test', 'testing')).toBeNull();
    expect(validateTransition('testing', 'ready_for_acceptance')).toBeNull();
    expect(validateTransition('ready_for_acceptance', 'accepted')).toBeNull();
  });

  it('allows staying in the same stage', () => {
    for (const stage of STAGE_ORDER) {
      expect(validateTransition(stage, stage)).toBeNull();
    }
  });

  it('allows moving backwards (e.g. testing → develop on rejection)', () => {
    expect(validateTransition('testing', 'develop')).toBeNull();
    expect(validateTransition('accepted', 'backlog')).toBeNull();
  });

  it('blocks skipping a stage forward', () => {
    const violation = validateTransition('backlog', 'develop');
    expect(violation).toBeTruthy();
    expect(violation).toMatch(/skip/i);
    expect(violation).toMatch(/analyze/);
  });

  it('blocks skipping multiple stages', () => {
    const violation = validateTransition('backlog', 'accepted');
    expect(violation).toBeTruthy();
    expect(violation).toContain('analyze');
    expect(violation).toContain('develop');
  });

  it('returns null for unknown stages (treats as no constraint)', () => {
    expect(validateTransition('unknown', 'analyze')).toBeNull();
    expect(validateTransition('analyze', 'unknown')).toBeNull();
  });
});
