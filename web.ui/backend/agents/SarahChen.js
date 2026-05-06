import { BaseAgent } from './BaseAgent.js';
import { AGENT_IDS, AGENT_ROLES } from '../../shared/agentIds.mjs';

export class SarahChen extends BaseAgent {
  id = AGENT_IDS.TECH_LEAD;
  name = 'Sarah Chen';
  role = AGENT_ROLES.TECH_LEAD;
  personality =
    'Analytical and detail-oriented. Sarah excels at technical architecture ' +
    "and code quality. She's passionate about best practices and loves " +
    'mentoring the team on complex technical challenges.';
  skills = ['System Architecture', 'Code Review', 'Technical Mentoring', 'Technology Selection'];
  thinkingDelayRange = [2500, 5000]; // thorough technical analysis takes time

  systemPrompt =
    'You are Sarah Chen, Tech Lead. You are analytical and detail-oriented. ' +
    'You evaluate every task for architectural implications, code quality, and technical debt.';

  guardrails = [
    'Always consider backward compatibility',
    'Flag any missing unit tests',
    'Recommend refactoring over quick hacks',
  ];

  stageActions = {
    analyze: {
      description: 'Perform technical analysis — architecture impact, dependencies, risks.',
      reviewCriteria: [
        'Architecture impact assessed',
        'Third-party dependencies identified',
        'Breaking changes flagged',
        'Performance implications considered',
        'Suggested implementation approach documented',
      ],
      outputTemplate:
        '**[Tech Lead — Technical Analysis]**\n' +
        'Task: *{taskTitle}*\n\n' +
        'Analyzing technical requirements for: {taskDescription}\n\n' +
        "I'll identify architectural impacts, dependency risks, " +
        'and recommend an implementation approach before development begins.',
    },
    develop: {
      description: 'Provide architecture guidance and review implementation direction.',
      reviewCriteria: [
        'Implementation follows agreed architecture',
        'Code patterns are consistent with codebase',
        'No unnecessary complexity introduced',
      ],
      outputTemplate:
        '**[Tech Lead — Development Guidance]**\n' +
        'Task: *{taskTitle}*\n\n' +
        'Providing architectural guidance for implementation. ' +
        'Ensure the approach aligns with our patterns and review ' +
        'any PRs before moving to test.',
    },
    ready_for_test: {
      description: 'Quick code-review sanity check before QA takes over.',
      reviewCriteria: [
        'Code changes are clean and well-structured',
        'No obvious technical debt introduced',
        'Unit tests cover new logic',
      ],
      outputTemplate:
        '**[Tech Lead — Pre-QA Code Review]**\n' +
        'Task: *{taskTitle}*\n\n' +
        'Running a quick code-review pass before QA testing. ' +
        'Confirming the implementation is clean and test-ready.',
    },
  };

  // ── role hooks ──────────────────────────────────────────────────────────

  evaluateApproval(task, analysis) {
    if (!task.description || task.description.trim().length < 10) {
      return {
        approved: false,
        reason: 'Task has no meaningful description. Cannot assess technical approach.',
      };
    }
    if (task.status === 'develop' && analysis.complexityScore >= 8) {
      const desc = (task.description || '').toLowerCase();
      const hasRiskMitigation = /risk|mitigation|incremental|phased|rollback|fallback|safeguard/.test(desc);
      if (!hasRiskMitigation) {
        return {
          approved: false,
          reason: `High-complexity task (${analysis.complexityScore}/10) entering develop without risk mitigation strategy. Add a risk mitigation approach to the description before proceeding.`,
        };
      }
    }
    return { approved: true, reason: null };
  }

  buildContextNotes(_task, analysis) {
    const lines = ['\n**Technical Assessment:**'];
    lines.push(`  - Complexity: **${analysis.complexityLabel}** (score ${analysis.complexityScore}/10)`);
    lines.push(`  - Primary domain: ${analysis.primaryDomain}`);

    if (analysis.domains.length > 1) {
      lines.push(`  - Cross-cutting concerns: ${analysis.domains.map((d) => d.domain).join(', ')}`);
    }

    if (analysis.risks.length > 0) {
      lines.push('  - **Risks identified:**');
      for (const risk of analysis.risks) {
        lines.push(`    - ${risk.risk} (signals: ${risk.signals.join(', ')})`);
      }
    }

    if (analysis.isHighRisk) {
      lines.push('  - ⚠️ This is a high-risk task — recommend incremental implementation and extra review.');
    }

    if (!analysis.hasAcceptanceCriteria) {
      lines.push('  - ⚠️ **No acceptance criteria defined** — this needs to be fixed before development.');
    }

    return lines.join('\n');
  }

  generateDirectedQuestion(task, analysis, _history) {
    if (task.status === 'analyze' && analysis.complexityLabel === 'high') {
      return {
        text: '\n**@Product Owner** — This is a high-complexity task. Can you confirm the priority of each acceptance criterion? I want to suggest a phased approach and need to know which criteria are must-haves vs nice-to-haves.',
        toAgent: AGENT_IDS.PRODUCT_OWNER,
      };
    }
    if (task.status === 'develop' && analysis.risks.length > 0) {
      return {
        text: `\n**@Developer** — I've flagged ${analysis.risks.length} risk area(s): ${analysis.risks.map((r) => r.risk).join(', ')}. Please outline your mitigation strategy before proceeding with implementation.`,
        toAgent: AGENT_IDS.DEVELOPER,
      };
    }
    return null;
  }
}

export default new SarahChen();
