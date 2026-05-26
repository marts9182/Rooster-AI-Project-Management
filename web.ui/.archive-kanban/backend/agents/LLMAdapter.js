/**
 * LLM Adapter system — pluggable response generation.
 *
 * BaseLLMAdapter defines the interface.
 * SmartTemplateAdapter is the default — assembles a comment from
 * agent-provided context-building hooks (no external LLM call).
 *
 * To plug in OpenAI/Anthropic, create a subclass that overrides generate()
 * and set it via BaseAgent.setLLMAdapter(adapter). See AnthropicAdapter.js.
 */

// ── Base interface ────────────────────────────────────────────────────────

export class BaseLLMAdapter {
  /**
   * Generate a response for the given context. Receives an object with
   * { systemPrompt, task, action, analysis, conversationHistory, agent }.
   * Returns (or resolves to) { content, approved, reason, toAgent }.
   */
  generate(/* params */) {
    throw new Error('BaseLLMAdapter.generate() must be overridden');
  }
}

// ── Smart Template Adapter (default — no LLM required) ────────────────────

export class SmartTemplateAdapter extends BaseLLMAdapter {
  generate({ systemPrompt: _systemPrompt, task, action, analysis, conversationHistory, agent }) {
    const parts = [];

    // Header from template
    if (action?.outputTemplate) {
      parts.push(this._fillTemplate(action.outputTemplate, task));
    }

    // Role-specific context bullets — agent owns its own analysis voice.
    const contextNotes = agent.buildContextNotes?.(task, analysis);
    if (contextNotes) parts.push(contextNotes);

    // Respond to messages directed at this agent
    const directedMessages = conversationHistory.filter(
      (c) => c.to_agent === agent.id && c.from_agent !== agent.id,
    );
    if (directedMessages.length > 0) {
      parts.push(this._buildDirectedResponses(directedMessages));
    }

    // Acknowledge prior conversation
    if (conversationHistory.length > 0) {
      const otherComments = conversationHistory.filter((c) => c.from_agent !== agent.id);
      if (otherComments.length > 0) {
        parts.push(this._buildConversationAwareness(otherComments));
      }
    }

    // Optional @mention dialogue with another agent.
    const dialogue = agent.generateDirectedQuestion?.(task, analysis, conversationHistory) ?? null;
    if (dialogue) parts.push(dialogue.text);

    // Synchronous gate-keeping: agent owns its own approval rules.
    const approval = agent.evaluateApproval?.(task, analysis) ?? { approved: true, reason: null };
    if (!approval.approved) {
      parts.push(`\n**🚫 BLOCKING — ${approval.reason}**`);
    }

    // Review checklist
    if (action?.reviewCriteria?.length > 0) {
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

    return {
      content: parts.join('\n'),
      approved: approval.approved,
      reason: approval.reason,
      toAgent: dialogue?.toAgent || null,
    };
  }

  _buildDirectedResponses(directedMessages) {
    const lines = ['\n**Responding to directed questions:**'];
    for (const msg of directedMessages) {
      const senderMatch = msg.content?.match(/\*\*\[(.+?)(?:\]|\s*—)/);
      const sender = senderMatch ? senderMatch[1] : msg.from_agent;
      const questionMatch = msg.content?.match(/@[^\n]+/);
      const question = questionMatch ? questionMatch[0] : 'your question';
      lines.push(`  - Replying to **${sender}**: Acknowledged — ${question}. I'll address this in my analysis above.`);
    }
    return lines.join('\n');
  }

  _buildConversationAwareness(otherComments) {
    const lines = ['\n**Team context:**'];

    const byAgent = {};
    for (const c of otherComments) {
      const key = c.from_agent;
      if (!byAgent[key]) byAgent[key] = [];
      byAgent[key].push(c);
    }

    for (const [agentId, comments] of Object.entries(byAgent)) {
      const latest = comments[comments.length - 1];
      const headerMatch = latest.content?.match(/\*\*\[(.+?)(?:\]|\s*—)/);
      const agentLabel = headerMatch ? headerMatch[1] : agentId;

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
