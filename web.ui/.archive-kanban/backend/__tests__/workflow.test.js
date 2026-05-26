import { describe, it, expect } from 'vitest';
import {
  STAGE_ORDER,
  WORKFLOW_RULES,
  LANES,
  isUiTask,
  isInternTask,
  getActiveRoles,
} from '../../shared/workflow.mjs';

describe('Shared workflow SSOT', () => {
  it('STAGE_ORDER and LANES are in lockstep', () => {
    const laneKeys = LANES.map((l) => l.key);
    expect(laneKeys).toEqual([...STAGE_ORDER]);
  });

  it('every stage has WORKFLOW_RULES with at least one required role', () => {
    for (const stage of STAGE_ORDER) {
      const rule = WORKFLOW_RULES[stage];
      expect(rule).toBeDefined();
      expect(rule.requiredRoles.length).toBeGreaterThan(0);
    }
  });

  it('isUiTask detects frontend keywords', () => {
    expect(isUiTask({ title: 'Add a button', description: '' })).toBe(true);
    expect(isUiTask({ title: 'Update API', description: 'GraphQL endpoint' })).toBe(false);
  });

  it('isInternTask detects intern-friendly work', () => {
    expect(isInternTask({ title: 'Add documentation for module', description: '' })).toBe(true);
    expect(isInternTask({ title: 'X', description: 'Y' })).toBe(false);
  });

  it('getActiveRoles always includes required roles', () => {
    for (const stage of STAGE_ORDER) {
      const roles = getActiveRoles(stage, { title: 'X', description: '' });
      for (const required of WORKFLOW_RULES[stage].requiredRoles) {
        expect(roles).toContain(required);
      }
    }
  });

  it('getActiveRoles adds Accessibility for UI tasks at testing', () => {
    const roles = getActiveRoles('testing', { title: 'Add button UI', description: '' });
    expect(roles).toContain('Accessibility');
  });

  it('getActiveRoles omits Accessibility for non-UI tasks', () => {
    const roles = getActiveRoles('testing', { title: 'Database tweak', description: 'index' });
    expect(roles).not.toContain('Accessibility');
  });
});
