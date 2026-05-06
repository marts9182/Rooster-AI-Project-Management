/**
 * Prompt builder for the Anthropic adapter.
 *
 * Splits content into:
 *   - System blocks (agent identity, guardrails, stage descriptions) — CACHED
 *     via cache_control: ephemeral. These are stable per agent.
 *   - User message (the specific task, analysis, history) — NOT cached.
 *
 * The Anthropic adapter forces the model to call the post_comment tool,
 * so we don't need to coax structured output out of free-form text.
 */

import { AGENTS } from '../../shared/agentIds.mjs';

/**
 * Build the system blocks for an agent. These are stable per agent and
 * marked cache_control: ephemeral so the 5-minute prompt cache absorbs
 * repeated calls within a sprint.
 *
 * @param {object} agent - Agent instance (id, name, role, personality, skills, systemPrompt, guardrails, stageActions)
 * @returns {Array<{type: 'text', text: string, cache_control?: {type: 'ephemeral'}}>}
 */
export function buildSystemBlocks(agent) {
  const stageDescriptions = Object.entries(agent.stageActions || {})
    .map(([stage, action]) => `- ${stage}: ${action.description}`)
    .join('\n');

  const sections = [
    agent.systemPrompt,
    '',
    `## Your skills`,
    (agent.skills || []).map((s) => `- ${s}`).join('\n'),
    '',
    `## Your personality`,
    agent.personality || '',
    '',
    `## Your guardrails (non-negotiable rules)`,
    (agent.guardrails || []).map((g) => `- ${g}`).join('\n'),
    '',
    `## Stages you engage on`,
    stageDescriptions,
    '',
    `## How to respond`,
    `You are part of a 7-person AI team that simulates a software team on a Kanban board.`,
    `When asked, you will post a single short comment about a task as it moves between stages.`,
    `Speak in YOUR voice — strategic and supportive (Manager), analytical (Tech Lead), pragmatic (Developer), enthusiastic (Intern), meticulous (QA), empathetic (Accessibility), or decisive (PO) — to match your role.`,
    `Always reference SPECIFIC content from the task (its title, description, acceptance criteria) — do not produce generic boilerplate.`,
    `Be concise: 2–5 short paragraphs or bullet points, well under 400 words.`,
    `If you want to direct a question to another teammate, set to_agent_id to their agent ID.`,
    `Set approved=false ONLY for serious blockers — vague descriptions, missing acceptance criteria, technical risk without mitigation. Otherwise leave it true.`,
  ];

  return [
    {
      type: 'text',
      text: sections.join('\n'),
      cache_control: { type: 'ephemeral' },
    },
  ];
}

/**
 * Build the per-call user message describing the current task, analysis,
 * conversation history, and the stage the task is entering.
 *
 * @param {{task: object, analysis: object, conversationHistory: object[], stage: string, validToAgents: Array<{id:string, name:string, role:string}>}} args
 * @returns {string}
 */
export function buildUserMessage({ task, analysis, conversationHistory, stage, validToAgents }) {
  const lines = [];

  lines.push(`# Task entering stage: \`${stage}\``);
  lines.push('');
  lines.push(`## Task`);
  lines.push(`- **id:** ${task.id}`);
  lines.push(`- **title:** ${task.title || '(untitled)'}`);
  if (task.description) {
    lines.push(`- **description:**`);
    lines.push('  ' + task.description.replace(/\n/g, '\n  '));
  } else {
    lines.push(`- **description:** _none_`);
  }
  if (task.acceptance_criteria) {
    lines.push(`- **acceptance criteria:**`);
    lines.push('  ' + task.acceptance_criteria.replace(/\n/g, '\n  '));
  } else {
    lines.push(`- **acceptance criteria:** _none defined_`);
  }
  lines.push('');

  lines.push(`## Automated analysis`);
  lines.push(`- complexity: ${analysis.complexityLabel} (score ${analysis.complexityScore}/10)`);
  lines.push(`- primary domain: ${analysis.primaryDomain}`);
  if (analysis.domains.length > 0) {
    lines.push(`- domains touched: ${analysis.domains.map((d) => `${d.domain} [${d.keywords.slice(0, 3).join(', ')}]`).join('; ')}`);
  }
  if (analysis.risks.length > 0) {
    lines.push(`- risks flagged: ${analysis.risks.map((r) => `${r.risk} (${r.signals.join(', ')})`).join('; ')}`);
  }
  lines.push(`- ${analysis.criteriaCount} acceptance criteria`);
  if (analysis.isHighRisk) lines.push(`- ⚠️ HIGH RISK overall`);
  if (analysis.isUiRelated) lines.push(`- UI-related task`);
  lines.push('');

  // Recent conversation — last 8 comments only, to keep prompt short
  const recent = conversationHistory.slice(-8);
  if (recent.length > 0) {
    lines.push(`## Conversation so far on this task`);
    for (const c of recent) {
      const sender = validToAgents.find((a) => a.id === c.from_agent);
      const senderLabel = sender ? `${sender.name} (${sender.role})` : c.from_agent;
      const directed = c.to_agent ? ` → @${validToAgents.find((a) => a.id === c.to_agent)?.role || c.to_agent}` : '';
      // Truncate long previous comments
      const body = (c.content || '').slice(0, 400);
      lines.push(`---`);
      lines.push(`**${senderLabel}**${directed}:`);
      lines.push(body);
    }
    lines.push('');
  }

  lines.push(`## Valid teammates you can address`);
  for (const a of validToAgents) {
    if (a.id === task.from_agent) continue;
    lines.push(`- ${a.id} — ${a.name} (${a.role})`);
  }
  lines.push('');

  lines.push(`## Your task right now`);
  lines.push(`Call the \`post_comment\` tool exactly once with your comment for this stage transition.`);

  return lines.join('\n');
}

/** Convenience: enumerate all known agents for the prompt's recipient list. */
export function getValidToAgents() {
  return AGENTS;
}
