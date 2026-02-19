/**
 * Agent display helpers — lightweight lookup for rendering agent names.
 * Agent processing runs entirely server-side; this is just for UI display.
 */

interface AgentInfo {
  id: string;
  name: string;
  role: string;
}

const AGENTS: AgentInfo[] = [
  { id: 'agent-manager-001', name: 'Marcus Thompson', role: 'Manager' },
  { id: 'agent-techlead-001', name: 'Sarah Chen', role: 'Tech Lead' },
  { id: 'agent-developer-001', name: 'Alex Rivera', role: 'Developer' },
  { id: 'agent-intern-001', name: 'Jamie Park', role: 'Intern' },
  { id: 'agent-qa-001', name: 'Taylor Johnson', role: 'QA' },
  { id: 'agent-accessibility-001', name: 'Morgan Davis', role: 'Accessibility' },
  { id: 'agent-po-001', name: 'Jordan Lee', role: 'Product Owner' },
];

const AGENT_MAP = new Map(AGENTS.map((a) => [a.id, a]));

/**
 * Resolve an agent ID (e.g. "agent-po-001") to a display label
 * like "Jordan Lee (Product Owner)".
 */
export function resolveAgentName(agentId: string): string {
  const agent = AGENT_MAP.get(agentId);
  return agent ? `${agent.name} (${agent.role})` : agentId;
}
