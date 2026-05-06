/**
 * Type declarations for agentIds.mjs (consumed by the React frontend).
 */

export interface AgentInfo {
  readonly id: string;
  readonly name: string;
  readonly role: string;
}

export const AGENT_IDS: Readonly<{
  MANAGER: string;
  TECH_LEAD: string;
  DEVELOPER: string;
  INTERN: string;
  QA: string;
  ACCESSIBILITY: string;
  PRODUCT_OWNER: string;
}>;

export const AGENT_ROLES: Readonly<{
  MANAGER: 'Manager';
  TECH_LEAD: 'Tech Lead';
  DEVELOPER: 'Developer';
  INTERN: 'Intern';
  QA: 'QA';
  ACCESSIBILITY: 'Accessibility';
  PRODUCT_OWNER: 'Product Owner';
}>;

export const AGENTS: readonly AgentInfo[];

export function getAgentById(id: string): AgentInfo | null;
export function getAgentByRole(role: string): AgentInfo | null;
export function resolveAgentName(agentId: string): string;
