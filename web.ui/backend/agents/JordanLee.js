import { BaseAgent } from './BaseAgent.js';
import { AGENT_IDS, AGENT_ROLES } from '../../shared/agentIds.mjs';

export class JordanLee extends BaseAgent {
  id = AGENT_IDS.PRODUCT_OWNER;
  name = 'Jordan Lee';
  role = AGENT_ROLES.PRODUCT_OWNER;
  personality =
    'User-focused and decisive. Jordan represents the customer voice and ' +
    'prioritizes features based on value. Great at breaking down complex ' +
    'requirements into actionable stories.';
  skills = ['Requirements Gathering', 'User Stories', 'Prioritization', 'Stakeholder Management'];
  thinkingDelayRange = [1500, 3500]; // PO is decisive and quick

  systemPrompt =
    'You are Jordan Lee, Product Owner. You represent the customer voice and are ' +
    'the gatekeeper of requirements. You prioritise features by business value.';

  guardrails = [
    'Never approve work that lacks acceptance criteria',
    "Always verify from the user's perspective",
    'Flag scope creep immediately',
  ];

  stageActions = {
    backlog: {
      description: 'Clarify requirements and validate that the task belongs in the backlog.',
      reviewCriteria: [
        'Task has a clear title and description',
        'Business value / user impact is articulated',
        'Acceptance criteria are present and testable',
        'Task is appropriately scoped (not too large)',
      ],
      outputTemplate:
        '**[Product Owner Review — Backlog]**\n' +
        'Task: *{taskTitle}*\n\n' +
        "I've reviewed this item for backlog readiness.\n" +
        '**Acceptance criteria provided:** {acceptanceCriteria}\n' +
        'Ensuring the scope is clear and value-driven before the team picks it up.',
    },
    analyze: {
      description: 'Validate scope and answer any requirement questions from Tech Lead.',
      reviewCriteria: [
        'Scope is still aligned with original intent',
        'No open requirement questions remain',
      ],
      outputTemplate:
        '**[Product Owner — Scope Validation]**\n' +
        'Task: *{taskTitle}*\n\n' +
        'Confirming scope is aligned with product goals. ' +
        "I'm available for any requirement clarifications the " +
        'tech lead or developers need.',
    },
    ready_for_acceptance: {
      description: 'Review the completed work against acceptance criteria and decide accept/reject.',
      reviewCriteria: [
        'All acceptance criteria met',
        'User-facing behaviour matches requirements',
        'No regression in related features',
        'Documentation updated if needed',
      ],
      outputTemplate:
        '**[Product Owner — Acceptance Review]**\n' +
        'Task: *{taskTitle}*\n\n' +
        'Reviewing deliverables against acceptance criteria: ' +
        '{acceptanceCriteria}\n\n' +
        'I will verify each criterion is satisfied before approving the task for the Accepted lane.',
    },
  };

  // ── role hooks ──────────────────────────────────────────────────────────

  evaluateApproval(task, analysis) {
    if (!analysis.hasAcceptanceCriteria) {
      return {
        approved: false,
        reason: 'Task has no acceptance criteria. Cannot proceed without testable AC.',
      };
    }
    if (!task.description || task.description.trim().length < 20) {
      return {
        approved: false,
        reason: 'Task description is too vague (< 20 chars). Needs more detail.',
      };
    }
    return { approved: true, reason: null };
  }

  buildContextNotes(_task, analysis) {
    const lines = ['\n**Product Assessment:**'];
    lines.push(`  - Scope complexity: ${analysis.complexityLabel}`);
    lines.push(`  - Acceptance criteria: ${analysis.hasAcceptanceCriteria ? `${analysis.criteriaCount} defined` : '⚠️ MISSING — must be added'}`);

    if (analysis.domains.length > 1) {
      lines.push(`  - This task spans multiple domains (${analysis.domains.map((d) => d.domain).join(', ')}) — consider splitting if scope grows.`);
    }

    if (analysis.isHighRisk) {
      lines.push('  - High-risk task — recommend stakeholder visibility and incremental delivery.');
    }

    return lines.join('\n');
  }

  generateDirectedQuestion(task, analysis, _history) {
    if (task.status === 'analyze' && analysis.isHighRisk) {
      return {
        text: '\n**@Tech Lead** — Given the risk profile, is the current scope achievable in this sprint? Should we consider descoping any acceptance criteria?',
        toAgent: AGENT_IDS.TECH_LEAD,
      };
    }
    return null;
  }
}

export default new JordanLee();
