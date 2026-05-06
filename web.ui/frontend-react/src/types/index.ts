/** Shared TypeScript interfaces matching the Express API JSON shapes. */

export type { TaskStatusKey, Lane } from '../../../shared/workflow.mjs';

import type { TaskStatusKey } from '../../../shared/workflow.mjs';

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
  to_agent?: string | null;
  /** The agent's response content. Always present. */
  content: string;
  task_id?: string;
  sprint_id?: string;
  timestamp?: string;
  approval?: Approval;
  type?: string;
}

export interface RetroAnalytics {
  totalTasks: number;
  completedTasks: number;
  statusCounts: Record<string, number>;
  avgCycleTimeHours: string | number;
  cycleTimeRange: { min: string | number; max: string | number };
  totalComments: number;
  rejections: number;
  agentEngagement: Record<string, number>;
  topContributor: { agent: string; comments: number } | null;
  stuckTasks: { id: string; title: string; status: string }[];
  workloadSkew: string | number;
  commentDepth: { short: number; substantive: number };
}
