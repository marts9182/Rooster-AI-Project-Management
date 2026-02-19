/** Shared TypeScript interfaces matching the Express API JSON shapes. */

export type TaskStatusKey =
  | 'backlog'
  | 'analyze'
  | 'develop'
  | 'ready_for_test'
  | 'testing'
  | 'ready_for_acceptance'
  | 'accepted';

export interface Lane {
  key: TaskStatusKey;
  label: string;
}

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
}

export interface Comment {
  id: string;
  from_agent: string;
  to_agent?: string | null;
  content?: string;
  text?: string;
  task_id?: string;
  timestamp?: string;
}
