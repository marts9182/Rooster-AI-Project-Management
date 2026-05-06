import { describe, it, expect } from 'vitest';
import { analyzeTask } from '../agents/TaskAnalyzer.js';

describe('analyzeTask', () => {
  it('detects tech domains from keywords', () => {
    const result = analyzeTask({
      title: 'Add React component for user form',
      description: 'Create a new React component with CSS styling and a button.',
      acceptance_criteria: '1. Component renders\n2. Form submits\n3. Validates input',
    });
    expect(result.domains.length).toBeGreaterThan(0);
    expect(result.domains.some((d) => d.domain === 'frontend')).toBe(true);
    expect(result.primaryDomain).toBe('frontend');
    expect(result.isUiRelated).toBe(true);
  });

  it('flags risk signals like "migration" and "breaking change"', () => {
    const result = analyzeTask({
      title: 'Database schema migration',
      description: 'Breaking change to migrate the user table — will replace the old schema.',
      acceptance_criteria: '1. Old data preserved\n2. Migration scripts tested',
    });
    expect(result.risks.length).toBeGreaterThan(0);
    const riskNames = result.risks.map((r) => r.risk);
    expect(riskNames.some((r) => r.includes('breaking') || r.includes('high complexity') || r.includes('data'))).toBe(true);
  });

  it('scores complexity higher for long descriptions and many ACs', () => {
    const simple = analyzeTask({
      title: 'Fix typo',
      description: 'Fix the spelling on the home page.',
      acceptance_criteria: '1. Typo gone',
    });
    const complex = analyzeTask({
      title: 'Refactor the entire authentication subsystem',
      description: 'A large rewrite of the authentication module to migrate from session cookies to JWT. This involves updating the API endpoints, the middleware, the login flow, and adding refresh token support. Breaking change — all existing tokens will be invalidated.'.repeat(2),
      acceptance_criteria: '1. JWT issued\n2. Refresh works\n3. Login flow updated\n4. Logout invalidates\n5. Migration documented\n6. Old endpoints deprecated',
    });
    expect(complex.complexityScore).toBeGreaterThan(simple.complexityScore);
    expect(complex.complexityLabel).toBe('high');
    expect(simple.complexityLabel).toBe('low');
  });

  it('parses acceptance criteria into items', () => {
    const result = analyzeTask({
      title: 'Add login',
      description: 'Login button',
      acceptance_criteria: '1. Form has email\n2. Form has password\n3. Submit logs in',
    });
    expect(result.criteriaCount).toBe(3);
    expect(result.criteriaItems).toEqual([
      'Form has email',
      'Form has password',
      'Submit logs in',
    ]);
    expect(result.hasAcceptanceCriteria).toBe(true);
  });

  it('handles tasks with no description or AC', () => {
    const result = analyzeTask({ title: 'Untitled', description: '', acceptance_criteria: null });
    expect(result.complexityScore).toBe(0);
    expect(result.criteriaCount).toBe(0);
    expect(result.hasAcceptanceCriteria).toBe(false);
    expect(result.risks).toEqual([]);
  });
});
