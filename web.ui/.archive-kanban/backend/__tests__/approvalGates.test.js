import { describe, it, expect } from 'vitest';
import { analyzeTask } from '../agents/TaskAnalyzer.js';
import sarah from '../agents/SarahChen.js';
import alex from '../agents/AlexRivera.js';
import taylor from '../agents/TaylorJohnson.js';
import jordan from '../agents/JordanLee.js';
import marcus from '../agents/MarcusThompson.js';
import jamie from '../agents/JamiePark.js';
import morgan from '../agents/MorganDavis.js';

function check(agent, task) {
  const analysis = analyzeTask(task);
  return agent.evaluateApproval(task, analysis);
}

describe('Product Owner gate (Jordan)', () => {
  it('blocks tasks with no acceptance criteria', () => {
    const v = check(jordan, {
      id: 't1',
      title: 'Add feature',
      description: 'Some implementation work to do here, more than 20 chars.',
      status: 'backlog',
      acceptance_criteria: null,
    });
    expect(v.approved).toBe(false);
    expect(v.reason).toMatch(/acceptance criteria/i);
  });

  it('blocks tasks with vague descriptions', () => {
    const v = check(jordan, {
      id: 't1',
      title: 'X',
      description: 'todo',
      status: 'backlog',
      acceptance_criteria: '1. Works',
    });
    expect(v.approved).toBe(false);
    expect(v.reason).toMatch(/vague|description/i);
  });

  it('approves well-formed tasks', () => {
    const v = check(jordan, {
      id: 't1',
      title: 'Add login form with validation',
      description: 'Build the email/password login form with client-side validation.',
      status: 'backlog',
      acceptance_criteria: '1. Email validates\n2. Password required\n3. Login routes to dashboard',
    });
    expect(v.approved).toBe(true);
  });
});

describe('Tech Lead gate (Sarah)', () => {
  it('blocks tasks with no meaningful description', () => {
    const v = check(sarah, {
      id: 't1',
      title: 'Foo',
      description: '',
      status: 'analyze',
      acceptance_criteria: '1. ok',
    });
    expect(v.approved).toBe(false);
  });

  it('blocks high-complexity develop tasks without risk mitigation', () => {
    // Hit the +8 complexity threshold: long description (+2), 6+ ACs (+2),
    // multiple domains (+2 cross-cutting frontend/backend/architecture),
    // and several risk signals (+3).
    const longDesc = (
      'Refactor the entire database migration to rewrite the architecture, ' +
      'replace the old REST api endpoint, deprecate the breaking middleware, ' +
      'and rebuild the React component layout for the form. ' +
      'This is a cache and performance overhaul affecting the server.'
    ).repeat(3);
    const v = check(sarah, {
      id: 't1',
      title: 'Massive overhaul',
      description: longDesc,
      status: 'develop',
      acceptance_criteria: '1. a\n2. b\n3. c\n4. d\n5. e\n6. f\n7. g',
    });
    expect(v.approved).toBe(false);
    expect(v.reason).toMatch(/risk|mitigation/i);
  });

  it('approves high-complexity develop tasks WITH risk mitigation', () => {
    const longDesc = (
      'Refactor the entire database migration to rewrite the architecture, ' +
      'replace the old REST api endpoint, deprecate the breaking middleware, ' +
      'and rebuild the React component layout for the form. ' +
      'This is a cache and performance overhaul affecting the server. ' +
      'Phased rollout with rollback fallback safeguards and incremental risk mitigation.'
    ).repeat(2);
    const v = check(sarah, {
      id: 't1',
      title: 'Massive overhaul',
      description: longDesc,
      status: 'develop',
      acceptance_criteria: '1. a\n2. b\n3. c\n4. d\n5. e\n6. f\n7. g',
    });
    expect(v.approved).toBe(true);
  });
});

describe('Developer gate (Alex)', () => {
  it('blocks develop transitions without technical approach indicators', () => {
    const v = check(alex, {
      id: 't1',
      title: 'Make better',
      description: 'Things should be nicer somewhere generally speaking.',
      status: 'develop',
      acceptance_criteria: '1. Better',
    });
    expect(v.approved).toBe(false);
    expect(v.reason).toMatch(/technical approach|implementation/i);
  });

  it('approves develop transitions with implementation language', () => {
    const v = check(alex, {
      id: 't1',
      title: 'Add login endpoint',
      description: 'Implement the /api/login endpoint with JWT issuance.',
      status: 'develop',
      acceptance_criteria: '1. Endpoint returns JWT',
    });
    expect(v.approved).toBe(true);
  });
});

describe('QA gate (Taylor)', () => {
  it('blocks if no AC defined', () => {
    const v = check(taylor, {
      id: 't1',
      title: 'Test something',
      description: 'Test the thing.',
      status: 'ready_for_test',
      acceptance_criteria: null,
    });
    expect(v.approved).toBe(false);
  });

  it('blocks if entering testing with fewer than 3 AC', () => {
    const v = check(taylor, {
      id: 't1',
      title: 'Test something',
      description: 'Test the thing.',
      status: 'testing',
      acceptance_criteria: '1. One thing\n2. Another',
    });
    expect(v.approved).toBe(false);
    expect(v.reason).toMatch(/3|three/i);
  });

  it('approves if 3+ AC and entering testing', () => {
    const v = check(taylor, {
      id: 't1',
      title: 'Test something',
      description: 'Test the thing.',
      status: 'testing',
      acceptance_criteria: '1. One\n2. Two\n3. Three',
    });
    expect(v.approved).toBe(true);
  });
});

describe('Always-approve agents', () => {
  it('Marcus, Jamie, Morgan never block', () => {
    const task = {
      id: 't1',
      title: '',
      description: '',
      status: 'develop',
      acceptance_criteria: null,
    };
    const analysis = analyzeTask(task);
    expect(marcus.evaluateApproval(task, analysis).approved).toBe(true);
    expect(jamie.evaluateApproval(task, analysis).approved).toBe(true);
    expect(morgan.evaluateApproval(task, analysis).approved).toBe(true);
  });
});
