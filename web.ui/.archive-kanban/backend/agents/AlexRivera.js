import { BaseAgent } from './BaseAgent.js';
import { AGENT_IDS, AGENT_ROLES } from '../../shared/agentIds.mjs';

export class AlexRivera extends BaseAgent {
  id = AGENT_IDS.DEVELOPER;
  name = 'Alex Rivera';
  role = AGENT_ROLES.DEVELOPER;
  personality =
    'Creative problem-solver with a pragmatic approach. Alex enjoys tackling ' +
    'challenging features and writing clean, maintainable code. Always ready ' +
    'to help teammates debug issues.';
  skills = ['Full-Stack Development', 'API Design', 'Database Design', 'Performance Optimization'];
  thinkingDelayRange = [1000, 3000]; // devs are fast

  systemPrompt =
    'You are Alex Rivera, Developer. You are a creative problem-solver with a pragmatic approach. ' +
    'You write clean, maintainable code and enjoy tackling challenging features.';

  guardrails = [
    'Never skip unit tests',
    'Always document breaking changes',
    'Request code review before marking ready for test',
  ];

  stageActions = {
    develop: {
      description: 'Plan implementation, write code, add unit tests.',
      reviewCriteria: [
        'Implementation plan is clear',
        'Edge cases identified',
        'Unit tests written',
        'Code is readable and well-commented',
      ],
      outputTemplate:
        '**[Developer — Implementation]**\n' +
        'Task: *{taskTitle}*\n\n' +
        "Taking ownership of implementation. Here's my approach:\n" +
        '• Reviewing requirements: {taskDescription}\n' +
        '• Identifying edge cases and writing tests alongside code.\n' +
        '• Will request Tech Lead review before marking ready for test.',
    },
    ready_for_test: {
      description: 'Provide handoff notes for QA — what changed, what to test.',
      reviewCriteria: [
        'All code changes documented',
        'Known limitations listed',
        'Test data or setup instructions provided',
      ],
      outputTemplate:
        '**[Developer — QA Handoff]**\n' +
        'Task: *{taskTitle}*\n\n' +
        'Implementation complete. Handing off to QA with the following notes:\n' +
        '• Changes made per requirements\n' +
        '• Unit tests passing\n' +
        '• See acceptance criteria: {acceptanceCriteria}',
    },
  };

  // ── role hooks ──────────────────────────────────────────────────────────

  evaluateApproval(task, _analysis) {
    if (task.status === 'develop') {
      const desc = (task.description || '').toLowerCase();
      const hasTechApproach = /implement|refactor|add|update|fix|create|build|rewrite|endpoint|function|method|class|module|component|api|database|query/.test(desc);
      if (!hasTechApproach) {
        return {
          approved: false,
          reason: 'Task description lacks technical approach indicators. Add implementation details (what to build, modify, or fix) before development begins.',
        };
      }
    }
    return { approved: true, reason: null };
  }

  buildContextNotes(_task, analysis) {
    const lines = ['\n**Implementation Notes:**'];

    if (analysis.actionVerbs.length > 0) {
      lines.push(`  - Key actions: ${analysis.actionVerbs.join(', ')}`);
    }

    lines.push(`  - Estimated scope: ${analysis.criteriaCount} acceptance criteria to satisfy`);

    if (analysis.domains.length > 0) {
      const techAreas = analysis.domains.filter((d) => d.keywords.length > 0);
      if (techAreas.length > 0) {
        lines.push(`  - Tech stack involved: ${techAreas.map((d) => `${d.domain} (${d.keywords.slice(0, 3).join(', ')})`).join('; ')}`);
      }
    }

    if (analysis.risks.some((r) => r.risk === 'breaking change')) {
      lines.push('  - ⚠️ Potential breaking changes detected — will add migration notes and backward compat.');
    }

    if (analysis.complexityLabel === 'high') {
      lines.push('  - Recommending a phased approach given high complexity.');
    }

    return lines.join('\n');
  }

  generateDirectedQuestion(task, analysis, _history) {
    if (task.status === 'develop' && analysis.criteriaCount > 3) {
      return {
        text: '\n**@Intern** — This task has several moving parts. Can you start drafting documentation for the changes as I implement them? Focus on the API changes and any new patterns introduced.',
        toAgent: AGENT_IDS.INTERN,
      };
    }
    return null;
  }
}

export default new AlexRivera();
