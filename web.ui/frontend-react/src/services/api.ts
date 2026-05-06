/** Typed API service — all fetch calls with error handling. */

import type { Task, Project, Sprint, Comment, RetroAnalytics } from '../types';

export interface MoveBlocker {
  agent_id: string;
  agent_name: string;
  reason: string;
}

export class ApiError extends Error {
  status: number;
  blockers?: MoveBlocker[];
  canForce?: boolean;
  constructor(status: number, message: string, extras: { blockers?: MoveBlocker[]; canForce?: boolean } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.blockers = extras.blockers;
    this.canForce = extras.canForce;
  }
}

async function get<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    throw new ApiError(res.status, body.error ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export async function fetchSprints(): Promise<Sprint[]> {
  return get<Sprint[]>('/api/sprints');
}

export async function fetchProjects(): Promise<Project[]> {
  return get<Project[]>('/api/projects');
}

export async function fetchTasks(): Promise<Task[]> {
  return get<Task[]>('/api/tasks');
}

export async function fetchComments(taskId: string): Promise<Comment[]> {
  return get<Comment[]>(`/api/tasks/${taskId}/comments`);
}

export async function moveTask(
  taskId: string,
  newStatus: string,
  opts: { force?: boolean } = {},
): Promise<void> {
  const res = await fetch(`/api/tasks/${taskId}/move`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: newStatus, force: opts.force ?? false }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    throw new ApiError(res.status, body.error ?? `Move failed`, {
      blockers: body.blockers,
      canForce: body.canForce,
    });
  }
}

/** Save agent-generated comments for a task (bulk). */
export async function saveComments(taskId: string, comments: Comment[]): Promise<void> {
  const res = await fetch(`/api/tasks/${taskId}/comments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(comments),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    throw new ApiError(res.status, body.error ?? `Failed to save comments`);
  }
}

export interface RetroResponse {
  success: boolean;
  analytics: RetroAnalytics;
  content: string;
  review: string;
}

export async function generateRetro(sprintId: string): Promise<RetroResponse> {
  const res = await fetch(`/api/sprints/${sprintId}/retro`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    throw new ApiError(res.status, body.error ?? `Retro generation failed`);
  }
  return res.json() as Promise<RetroResponse>;
}
