/** Typed API service — all fetch calls with error handling. */

import type { Task, Project, Sprint, Comment } from '../types';

class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
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

export async function moveTask(taskId: string, newStatus: string): Promise<void> {
  const res = await fetch(`/api/tasks/${taskId}/move`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: newStatus }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    throw new ApiError(res.status, body.error ?? `Move failed`);
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
