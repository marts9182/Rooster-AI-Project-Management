/**
 * Type declarations for workflow.mjs (consumed by the React frontend).
 * Backend Node code reads workflow.mjs directly via JSDoc.
 */

export type TaskStatusKey =
  | 'backlog'
  | 'analyze'
  | 'develop'
  | 'ready_for_test'
  | 'testing'
  | 'ready_for_acceptance'
  | 'accepted';

export interface Lane {
  readonly key: TaskStatusKey;
  readonly label: string;
}

export interface WorkflowRule {
  readonly requiredRoles: readonly string[];
  readonly conditionalRoles: readonly string[];
}

export const STAGE_ORDER: readonly TaskStatusKey[];
export const LANE_LABELS: Readonly<Record<TaskStatusKey, string>>;
export const LANES: readonly Lane[];
export const WORKFLOW_RULES: Readonly<Record<TaskStatusKey, WorkflowRule>>;
export const ALLOWED_STATUSES: readonly TaskStatusKey[];

export function isUiTask(task: { title?: string; description?: string }): boolean;
export function isInternTask(task: { title?: string; description?: string }): boolean;
export function getActiveRoles(stage: TaskStatusKey, task: { title?: string; description?: string }): string[];
export function validateTransition(fromStage: string, toStage: string): string | null;
