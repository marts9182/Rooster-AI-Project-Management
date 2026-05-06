/**
 * Backend type definitions — JSDoc typedefs callable from .js files via
 *   /** @type {import('./types').Task} *\/
 *
 * Mirrors web.ui/frontend-react/src/types/index.ts. The two should stay
 * in lockstep — Task fields here must match what the frontend reads.
 */

export type TaskStatusKey =
  | 'backlog'
  | 'analyze'
  | 'develop'
  | 'ready_for_test'
  | 'testing'
  | 'ready_for_acceptance'
  | 'accepted';

export interface Task {
  id: string;
  project_id: string;
  title: string;
  description?: string;
  status: TaskStatusKey;
  assignee?: string | null;
  acceptance_criteria?: string | null;
  sprint_id?: string | null;
  created_at?: string;
  updated_at?: string;
  notes?: string[];
}

export interface Project {
  id: string;
  name: string;
  description?: string;
  repo_url?: string | null;
  repo_path?: string | null;
  created_at?: string;
}

export interface Sprint {
  id: string;
  name: string;
  status: string;
  start_date: string;
  end_date: string;
  retrospective?: string;
  review?: string;
}

export interface Approval {
  approved: boolean;
  reason: string | null;
}

export interface Comment {
  id: string;
  from_agent: string;
  to_agent: string | null;
  content: string;
  task_id: string | null;
  sprint_id?: string;
  timestamp: string;
  approval?: Approval;
  type?: string;
}

export interface AgentRecord {
  id: string;
  name: string;
  role: string;
  personality?: string;
  skills?: string[];
  status: 'idle' | 'thinking' | 'responding';
  current_task: string | null;
}

export interface RiskFinding {
  risk: string;
  signals: string[];
}

export interface DomainFinding {
  domain: string;
  matchCount: number;
  keywords: string[];
}

export interface Analysis {
  primaryDomain: string;
  domains: DomainFinding[];
  risks: RiskFinding[];
  complexityScore: number;
  complexityLabel: 'low' | 'medium' | 'high';
  criteriaItems: string[];
  criteriaCount: number;
  actionVerbs: string[];
  hasAcceptanceCriteria: boolean;
  isUiRelated: boolean;
  isHighRisk: boolean;
  taskSummary: string;
}

export interface AgentEventBase {
  agentId: string;
  agentName?: string;
  role?: string;
  taskId?: string;
  _ts?: number;
}

export interface AgentCommentEvent extends AgentEventBase {
  comment: Comment;
  approved: boolean;
  reason: string | null;
}

export interface GenerateParams {
  systemPrompt: string;
  task: Task;
  action: {
    description?: string;
    reviewCriteria?: string[];
    outputTemplate?: string;
  };
  analysis: Analysis;
  conversationHistory: Comment[];
  agent: { id: string; name: string; role: string; guardrails?: string[]; personality?: string; skills?: string[] };
}

export interface GenerateResult {
  content: string;
  approved: boolean;
  reason: string | null;
  toAgent: string | null;
}
