/**
 * Canonical agent IDs and roles — single source of truth for both
 * backend agent classes and frontend display lookups.
 *
 * Add a new agent by appending here and updating both AgentRuntime
 * (backend) and the frontend resolveAgentName lookup (which imports
 * AGENTS from this file).
 */

export const AGENT_IDS = Object.freeze({
  MANAGER: 'agent-manager-001',
  TECH_LEAD: 'agent-techlead-001',
  DEVELOPER: 'agent-developer-001',
  INTERN: 'agent-intern-001',
  QA: 'agent-qa-001',
  ACCESSIBILITY: 'agent-accessibility-001',
  PRODUCT_OWNER: 'agent-po-001',
});

export const AGENT_ROLES = Object.freeze({
  MANAGER: 'Manager',
  TECH_LEAD: 'Tech Lead',
  DEVELOPER: 'Developer',
  INTERN: 'Intern',
  QA: 'QA',
  ACCESSIBILITY: 'Accessibility',
  PRODUCT_OWNER: 'Product Owner',
});

/**
 * Display directory used by the frontend to render agent names and by
 * the prompt builder to enumerate valid `to_agent_id` recipients.
 */
export const AGENTS = Object.freeze([
  { id: AGENT_IDS.MANAGER, name: 'Marcus Thompson', role: AGENT_ROLES.MANAGER },
  { id: AGENT_IDS.TECH_LEAD, name: 'Sarah Chen', role: AGENT_ROLES.TECH_LEAD },
  { id: AGENT_IDS.DEVELOPER, name: 'Alex Rivera', role: AGENT_ROLES.DEVELOPER },
  { id: AGENT_IDS.INTERN, name: 'Jamie Park', role: AGENT_ROLES.INTERN },
  { id: AGENT_IDS.QA, name: 'Taylor Johnson', role: AGENT_ROLES.QA },
  { id: AGENT_IDS.ACCESSIBILITY, name: 'Morgan Davis', role: AGENT_ROLES.ACCESSIBILITY },
  { id: AGENT_IDS.PRODUCT_OWNER, name: 'Jordan Lee', role: AGENT_ROLES.PRODUCT_OWNER },
]);

const AGENTS_BY_ID = new Map(AGENTS.map((a) => [a.id, a]));
const AGENTS_BY_ROLE = new Map(AGENTS.map((a) => [a.role, a]));

export function getAgentById(id) {
  return AGENTS_BY_ID.get(id) ?? null;
}

export function getAgentByRole(role) {
  return AGENTS_BY_ROLE.get(role) ?? null;
}

/** Resolve an agent ID to "Name (Role)" for UI display. */
export function resolveAgentName(agentId) {
  const a = AGENTS_BY_ID.get(agentId);
  return a ? `${a.name} (${a.role})` : agentId;
}
