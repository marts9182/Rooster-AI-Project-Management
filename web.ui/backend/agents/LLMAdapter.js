/**
 * LLM Adapter system — pluggable response generation.
 *
 * BaseLLMAdapter defines the interface.
 * SmartTemplateAdapter is the default — uses TaskAnalyzer for context-aware
 * responses without requiring an external LLM API.
 *
 * To plug in OpenAI/Anthropic, create a subclass that overrides generate()
 * and set it via BaseAgent.setLLMAdapter(adapter).
 */

import { analyzeTask } from './TaskAnalyzer.js';

// ── Base interface ────────────────────────────────────────────────────────

export class BaseLLMAdapter {
  /**
   * Generate a response for the given context.
   * @param {object} params
   * @param {string} params.systemPrompt - The agent's system prompt / persona
   * @param {object} params.task - The full task object
   * @param {object} params.action - The stage action config
   * @param {object} params.analysis - TaskAnalyzer output
   * @param {Array}  params.conversationHistory - Prior comments on this task
   * @param {object} params.agent - The agent instance (id, name, role, etc.)
   * @returns {string} The generated response content
   */
  generate(params) {
    throw new Error('BaseLLMAdapter.generate() must be overridden');
  }
}

// ── Smart Template Adapter (default — no LLM required) ────────────────────

export class SmartTemplateAdapter extends BaseLLMAdapter {
  generate({ systemPrompt, task, action, analysis, conversationHistory, agent }) {
    const parts = [];

    // Header from template
    if (action.outputTemplate) {
      parts.push(this._fillTemplate(action.outputTemplate, task));
    }

    // Context-aware analysis section (unique per task)
    const analysisParts = this._buildAnalysisSection(agent, task, action, analysis);
    if (analysisParts) {
      parts.push(analysisParts);
    }

    // Respond to messages directed at this agent
    const directedMessages = conversationHistory.filter(
      c => c.to_agent === agent.id && c.from_agent !== agent.id
    );
    if (directedMessages.length > 0) {
      parts.push(this._buildDirectedResponses(directedMessages, agent));
    }

    // Acknowledge prior conversation
    if (conversationHistory.length > 0) {
      const otherComments = conversationHistory.filter(c => c.from_agent !== agent.id);
      if (otherComments.length > 0) {
        parts.push(this._buildConversationAwareness(otherComments, agent));
      }
    }

    // Generate questions/mentions directed at other agents
    const dialogue = this._generateDialogue(agent, task, analysis, conversationHistory);

    if (dialogue) {
      parts.push(dialogue.text);
    }

    // Gate-keeping: determine approval based on analysis
    const approval = this._evaluateApproval(agent, task, analysis);

    if (!approval.approved) {
      parts.push(`\n**🚫 BLOCKING — ${approval.reason}**`);
    }

    // Review checklist
    if (action.reviewCriteria?.length > 0) {
      parts.push('\n**Review checklist:**');
      for (const criterion of action.reviewCriteria) {
        parts.push(`  - ${criterion}`);
      }
    }

    // Guardrails
    if (agent.guardrails?.length > 0) {
      parts.push('\n**Standing rules applied:**');
      for (const rule of agent.guardrails) {
        parts.push(`  - ${rule}`);
      }
    }

    const content = parts.join('\n');
    return {
      content,
      approved: approval.approved,
      reason: approval.reason,
      toAgent: dialogue?.toAgent || null,
    };
  }

  /**
   * Build response to messages directed at this agent.
   */
  _buildDirectedResponses(directedMessages, agent) {
    const lines = ['\n**Responding to directed questions:**'];
    for (const msg of directedMessages) {
      const senderMatch = msg.content?.match(/\*\*\[(.+?)(?:\]|\s*—)/);
      const sender = senderMatch ? senderMatch[1] : msg.from_agent;
      // Extract the question part (look for lines starting with @)
      const questionMatch = msg.content?.match(/@[^\n]+/);
      const question = questionMatch ? questionMatch[0] : 'your question';
      lines.push(`  - Replying to **${sender}**: Acknowledged — ${question}. I'll address this in my analysis above.`);
    }
    return lines.join('\n');
  }

  /**
   * Role-based dialogue generation — agents ask questions of specific teammates.
   */
  _generateDialogue(agent, task, analysis, conversationHistory) {
    // Only generate dialogue if there are meaningful things to ask
    const dialogueRules = {
      'Tech Lead': () => {
        // During analyze: ask PO to clarify vague requirements
        if (task.status === 'analyze' && analysis.complexityLabel === 'high') {
          return {
            text: '\n**@Product Owner** — This is a high-complexity task. Can you confirm the priority of each acceptance criterion? I want to suggest a phased approach and need to know which criteria are must-haves vs nice-to-haves.',
            toAgent: 'agent-po-001',
          };
        }
        // During develop: ask developer about approach
        if (task.status === 'develop' && analysis.risks.length > 0) {
          return {
            text: `\n**@Developer** — I've flagged ${analysis.risks.length} risk area(s): ${analysis.risks.map(r => r.risk).join(', ')}. Please outline your mitigation strategy before proceeding with implementation.`,
            toAgent: 'agent-developer-001',
          };
        }
        return null;
      },
      'QA': () => {
        // During ready_for_test: ask developer what changed
        if (task.status === 'ready_for_test') {
          return {
            text: '\n**@Developer** — Before I write the test plan, can you confirm: what files changed, any known edge cases, and are there areas you\'re less confident about?',
            toAgent: 'agent-developer-001',
          };
        }
        return null;
      },
      'Product Owner': () => {
        // During analyze: ask tech lead about feasibility
        if (task.status === 'analyze' && analysis.isHighRisk) {
          return {
            text: '\n**@Tech Lead** — Given the risk profile, is the current scope achievable in this sprint? Should we consider descoping any acceptance criteria?',
            toAgent: 'agent-techlead-001',
          };
        }
        return null;
      },
      'Developer': () => {
        // During develop: ask intern to help with docs
        if (task.status === 'develop' && analysis.criteriaCount > 3) {
          return {
            text: '\n**@Intern** — This task has several moving parts. Can you start drafting documentation for the changes as I implement them? Focus on the API changes and any new patterns introduced.',
            toAgent: 'agent-intern-001',
          };
        }
        return null;
      },
      'Manager': () => {
        // During ready_for_acceptance: ask PO to confirm
        if (task.status === 'ready_for_acceptance') {
          return {
            text: '\n**@Product Owner** — All stages completed. Please confirm you\'ve reviewed the deliverables against the acceptance criteria before I mark this as accepted.',
            toAgent: 'agent-po-001',
          };
        }
        return null;
      },
    };

    const rule = dialogueRules[agent.role];
    return rule ? rule() : null;
  }

  /**
   * Role-specific approval logic — agents can block transitions.
   */
  _evaluateApproval(agent, task, analysis) {
    const checks = {
      'Product Owner': () => {
        if (!analysis.hasAcceptanceCriteria) {
          return { approved: false, reason: 'Task has no acceptance criteria. Cannot proceed without testable AC.' };
        }
        if (!task.description || task.description.trim().length < 20) {
          return { approved: false, reason: 'Task description is too vague (< 20 chars). Needs more detail.' };
        }
        return { approved: true, reason: null };
      },
      'Tech Lead': () => {
        if (!task.description || task.description.trim().length < 10) {
          return { approved: false, reason: 'Task has no meaningful description. Cannot assess technical approach.' };
        }
        return { approved: true, reason: null };
      },
      'QA': () => {
        if (!analysis.hasAcceptanceCriteria) {
          return { approved: false, reason: 'Cannot create test plan — no acceptance criteria defined.' };
        }
        return { approved: true, reason: null };
      },
      // Manager, Developer, Accessibility, Intern default to approve
    };

    const check = checks[agent.role];
    return check ? check() : { approved: true, reason: null };
  }

  _buildAnalysisSection(agent, task, action, analysis) {
    // Each role generates different analysis based on their expertise
    const builders = {
      'Tech Lead': () => this._techLeadAnalysis(analysis, task),
      'Developer': () => this._developerAnalysis(analysis, task),
      'QA': () => this._qaAnalysis(analysis, task),
      'Product Owner': () => this._poAnalysis(analysis, task),
      'Manager': () => this._managerAnalysis(analysis, task),
      'Accessibility': () => this._a11yAnalysis(analysis, task),
      'Intern': () => this._internAnalysis(analysis, task),
    };

    const builder = builders[agent.role];
    return builder ? builder() : null;
  }

  _techLeadAnalysis(analysis, task) {
    const lines = ['\n**Technical Assessment:**'];
    lines.push(`  - Complexity: **${analysis.complexityLabel}** (score ${analysis.complexityScore}/10)`);
    lines.push(`  - Primary domain: ${analysis.primaryDomain}`);

    if (analysis.domains.length > 1) {
      lines.push(`  - Cross-cutting concerns: ${analysis.domains.map(d => d.domain).join(', ')}`);
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

  _developerAnalysis(analysis, task) {
    const lines = ['\n**Implementation Notes:**'];

    if (analysis.actionVerbs.length > 0) {
      lines.push(`  - Key actions: ${analysis.actionVerbs.join(', ')}`);
    }

    lines.push(`  - Estimated scope: ${analysis.criteriaCount} acceptance criteria to satisfy`);

    if (analysis.domains.length > 0) {
      const techAreas = analysis.domains.filter(d => d.keywords.length > 0);
      if (techAreas.length > 0) {
        lines.push(`  - Tech stack involved: ${techAreas.map(d => `${d.domain} (${d.keywords.slice(0, 3).join(', ')})`).join('; ')}`);
      }
    }

    if (analysis.risks.some(r => r.risk === 'breaking change')) {
      lines.push('  - ⚠️ Potential breaking changes detected — will add migration notes and backward compat.');
    }

    if (analysis.complexityLabel === 'high') {
      lines.push('  - Recommending a phased approach given high complexity.');
    }

    return lines.join('\n');
  }

  _qaAnalysis(analysis, task) {
    const lines = ['\n**Test Strategy:**'];

    lines.push(`  - ${analysis.criteriaCount} acceptance criteria to verify`);

    if (analysis.criteriaItems.length > 0) {
      lines.push('  - **Specific test cases planned:**');
      for (const item of analysis.criteriaItems.slice(0, 5)) {
        lines.push(`    - Verify: ${item}`);
      }
      if (analysis.criteriaItems.length > 5) {
        lines.push(`    - ... and ${analysis.criteriaItems.length - 5} more criteria`);
      }
    }

    if (analysis.risks.length > 0) {
      lines.push(`  - Risk areas to stress-test: ${analysis.risks.map(r => r.risk).join(', ')}`);
    }

    if (analysis.isUiRelated) {
      lines.push('  - UI task detected — will include visual regression and cross-browser checks.');
    }

    if (!analysis.hasAcceptanceCriteria) {
      lines.push('  - ⚠️ **Cannot write test plan — no acceptance criteria defined!** Blocking until AC is provided.');
    }

    return lines.join('\n');
  }

  _poAnalysis(analysis, task) {
    const lines = ['\n**Product Assessment:**'];

    lines.push(`  - Scope complexity: ${analysis.complexityLabel}`);
    lines.push(`  - Acceptance criteria: ${analysis.hasAcceptanceCriteria ? `${analysis.criteriaCount} defined` : '⚠️ MISSING — must be added'}`);

    if (analysis.domains.length > 1) {
      lines.push(`  - This task spans multiple domains (${analysis.domains.map(d => d.domain).join(', ')}) — consider splitting if scope grows.`);
    }

    if (analysis.isHighRisk) {
      lines.push('  - High-risk task — recommend stakeholder visibility and incremental delivery.');
    }

    return lines.join('\n');
  }

  _managerAnalysis(analysis, task) {
    const lines = ['\n**Resource & Planning Assessment:**'];

    lines.push(`  - Task complexity: ${analysis.complexityLabel} (score ${analysis.complexityScore}/10)`);
    lines.push(`  - Domains touched: ${analysis.domains.map(d => d.domain).join(', ') || 'general'}`);

    if (analysis.isHighRisk) {
      lines.push('  - 🔴 High-risk — scheduling buffer and adding checkpoint reviews.');
    }

    if (analysis.domains.length > 2) {
      lines.push('  - Multi-domain task — may need collaboration across multiple team members.');
    }

    return lines.join('\n');
  }

  _a11yAnalysis(analysis, task) {
    const lines = ['\n**Accessibility Scope:**'];

    if (analysis.isUiRelated) {
      lines.push('  - UI changes detected — full a11y review required.');
      const a11yDomain = analysis.domains.find(d => d.domain === 'accessibility');
      if (a11yDomain) {
        lines.push(`  - A11y keywords found: ${a11yDomain.keywords.join(', ')}`);
      }
    } else {
      lines.push('  - Non-UI task — verifying no indirect accessibility impact.');
    }

    if (analysis.criteriaItems.some(c => /aria|keyboard|screen reader|focus|wcag|a11y/i.test(c))) {
      lines.push('  - ✅ Acceptance criteria include explicit a11y requirements.');
    } else if (analysis.isUiRelated) {
      lines.push('  - ⚠️ UI task but no a11y acceptance criteria — recommending additions.');
    }

    return lines.join('\n');
  }

  _internAnalysis(analysis, task) {
    const lines = ['\n**Learning Notes:**'];

    lines.push(`  - This is a ${analysis.complexityLabel}-complexity task in the ${analysis.primaryDomain} domain.`);

    if (analysis.domains.length > 0) {
      lines.push(`  - Technologies I'll learn about: ${analysis.domains.map(d => d.domain).join(', ')}`);
    }

    if (analysis.complexityLabel === 'high') {
      lines.push('  - 📝 Complex task — I\'ll focus on documentation and supporting the senior devs.');
    } else {
      lines.push('  - I can contribute to implementation with guidance from the tech lead.');
    }

    return lines.join('\n');
  }

  _buildConversationAwareness(otherComments, agent) {
    const lines = ['\n**Team context:**'];

    // Group by agent
    const byAgent = {};
    for (const c of otherComments) {
      const key = c.from_agent;
      if (!byAgent[key]) byAgent[key] = [];
      byAgent[key].push(c);
    }

    for (const [agentId, comments] of Object.entries(byAgent)) {
      // Extract key info from the latest comment
      const latest = comments[comments.length - 1];
      const headerMatch = latest.content?.match(/\*\*\[(.+?)(?:\]|\s*—)/);
      const agentLabel = headerMatch ? headerMatch[1] : agentId;

      // Check for warnings/risks flagged
      const hasWarning = latest.content?.includes('⚠️');
      const hasBlocking = latest.content?.toLowerCase().includes('blocking');

      if (hasBlocking) {
        lines.push(`  - 🔴 **${agentLabel}** raised a blocking concern — addressing in my response.`);
      } else if (hasWarning) {
        lines.push(`  - ⚠️ **${agentLabel}** flagged warnings — noted and incorporated.`);
      } else {
        lines.push(`  - **${agentLabel}** reviewed — aligned with their assessment.`);
      }
    }

    return lines.join('\n');
  }

  _fillTemplate(template, task) {
    return template
      .replace(/\{taskTitle\}/g, task.title || 'Untitled')
      .replace(/\{taskDescription\}/g, task.description || '')
      .replace(/\{taskStatus\}/g, task.status || '')
      .replace(/\{agentName\}/g, '')
      .replace(/\{agentRole\}/g, '')
      .replace(/\{acceptanceCriteria\}/g, task.acceptance_criteria || 'Not specified');
  }
}

// Default singleton
export const defaultAdapter = new SmartTemplateAdapter();
