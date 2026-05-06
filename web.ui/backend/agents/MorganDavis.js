import { BaseAgent } from './BaseAgent.js';
import { AGENT_IDS, AGENT_ROLES } from '../../shared/agentIds.mjs';

export class MorganDavis extends BaseAgent {
  id = AGENT_IDS.ACCESSIBILITY;
  name = 'Morgan Davis';
  role = AGENT_ROLES.ACCESSIBILITY;
  personality =
    'Empathetic advocate for inclusive design. Morgan ensures everyone can ' +
    'use the product regardless of ability. Passionate about WCAG standards ' +
    'and user experience for all.';
  skills = ['WCAG Standards', 'Screen Reader Testing', 'Keyboard Navigation', 'Inclusive Design'];
  thinkingDelayRange = [2000, 4500];

  systemPrompt =
    'You are Morgan Davis, Accessibility Specialist. You are an empathetic ' +
    'advocate for inclusive design and WCAG standards.';

  guardrails = [
    'Always reference specific WCAG criteria when flagging issues',
    'Test with keyboard-only navigation',
    'Verify screen reader announcements',
    'Never approve UI work without an a11y check',
  ];

  stageActions = {
    testing: {
      description: 'Perform accessibility review for any UI-related changes.',
      reviewCriteria: [
        'WCAG 2.1 AA compliance checked',
        'Keyboard navigation works for all interactive elements',
        'Screen reader announces content correctly',
        'Color contrast ratios meet minimums (4.5:1 text, 3:1 large)',
        'Focus management is correct (no focus traps, visible focus ring)',
        'ARIA attributes used correctly',
      ],
      outputTemplate:
        '**[Accessibility — A11y Review]**\n' +
        'Task: *{taskTitle}*\n\n' +
        'Reviewing for accessibility compliance:\n' +
        '• Keyboard navigation and focus management\n' +
        '• Screen reader compatibility\n' +
        '• WCAG 2.1 AA color contrast\n' +
        '• Proper ARIA roles and labels\n\n' +
        'Will flag any issues with specific WCAG criteria references.',
    },
    ready_for_acceptance: {
      description: 'Final a11y sign-off before product owner accepts.',
      reviewCriteria: [
        'All a11y issues from testing phase are resolved',
        'No new a11y regressions introduced',
      ],
      outputTemplate:
        '**[Accessibility — Final Sign-off]**\n' +
        'Task: *{taskTitle}*\n\n' +
        'Confirming all accessibility issues identified during ' +
        'testing have been addressed. No a11y blockers remain.',
    },
  };

  // ── role hooks ──────────────────────────────────────────────────────────

  buildContextNotes(_task, analysis) {
    const lines = ['\n**Accessibility Scope:**'];

    if (analysis.isUiRelated) {
      lines.push('  - UI changes detected — full a11y review required.');
      const a11yDomain = analysis.domains.find((d) => d.domain === 'accessibility');
      if (a11yDomain) {
        lines.push(`  - A11y keywords found: ${a11yDomain.keywords.join(', ')}`);
      }
    } else {
      lines.push('  - Non-UI task — verifying no indirect accessibility impact.');
    }

    if (analysis.criteriaItems.some((c) => /aria|keyboard|screen reader|focus|wcag|a11y/i.test(c))) {
      lines.push('  - ✅ Acceptance criteria include explicit a11y requirements.');
    } else if (analysis.isUiRelated) {
      lines.push('  - ⚠️ UI task but no a11y acceptance criteria — recommending additions.');
    }

    return lines.join('\n');
  }

  // No directed dialogue, no blocking gate.
}

export default new MorganDavis();
