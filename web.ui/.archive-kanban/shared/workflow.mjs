/**
 * Shared workflow definitions — single source of truth for both backend (Node)
 * and frontend (Vite/TS). Plain ESM so it can be imported from either side.
 *
 * If you change STAGE_ORDER or WORKFLOW_RULES, both halves of the app pick
 * the change up automatically.
 */

/** @type {readonly TaskStatusKey[]} */
export const STAGE_ORDER = Object.freeze([
  'backlog',
  'analyze',
  'develop',
  'ready_for_test',
  'testing',
  'ready_for_acceptance',
  'accepted',
]);

/** Human-friendly labels keyed by stage. */
export const LANE_LABELS = Object.freeze({
  backlog: 'Backlog',
  analyze: 'Analyze',
  develop: 'Develop',
  ready_for_test: 'Ready for Test',
  testing: 'Testing',
  ready_for_acceptance: 'Ready for Acceptance',
  accepted: 'Accepted',
});

/**
 * Lane definitions for the Kanban board (frontend-friendly order).
 * Derived from STAGE_ORDER + LANE_LABELS.
 */
export const LANES = Object.freeze(
  STAGE_ORDER.map((key) => Object.freeze({ key, label: LANE_LABELS[key] }))
);

/**
 * Required and conditional roles that engage at each stage.
 * - requiredRoles always engage when a task enters the stage.
 * - conditionalRoles engage based on task heuristics (UI/intern keywords).
 */
export const WORKFLOW_RULES = Object.freeze({
  backlog: {
    requiredRoles: ['Product Owner', 'Manager'],
    conditionalRoles: [],
  },
  analyze: {
    requiredRoles: ['Tech Lead', 'Product Owner'],
    conditionalRoles: ['Intern'],
  },
  develop: {
    requiredRoles: ['Developer', 'Tech Lead'],
    conditionalRoles: ['Intern'],
  },
  ready_for_test: {
    requiredRoles: ['QA', 'Developer', 'Tech Lead'],
    conditionalRoles: ['Intern'],
  },
  testing: {
    requiredRoles: ['QA'],
    conditionalRoles: ['Accessibility', 'Intern'],
  },
  ready_for_acceptance: {
    requiredRoles: ['Product Owner', 'Manager'],
    conditionalRoles: ['Accessibility'],
  },
  accepted: {
    requiredRoles: ['Manager'],
    conditionalRoles: [],
  },
});

const UI_KEYWORDS = new Set([
  'ui', 'interface', 'user', 'form', 'button', 'page', 'modal',
  'dialog', 'css', 'style', 'layout', 'component', 'frontend',
  'design', 'visual', 'display', 'screen', 'render', 'html',
  'accessibility', 'a11y', 'wcag', 'keyboard', 'focus',
]);

const INTERN_KEYWORDS = [
  'documentation', 'docs', 'readme', 'simple', 'small',
  'agent', 'test', 'review', 'update', 'add', 'fix', 'implement',
  'feature', 'task', 'system', 'component', 'module',
];

/** Does this task touch the UI (frontend / a11y)? */
export function isUiTask(task) {
  const text = `${task?.title ?? ''} ${task?.description ?? ''}`.toLowerCase();
  for (const kw of UI_KEYWORDS) {
    if (text.includes(kw)) return true;
  }
  return false;
}

/** Is this a task suitable for an intern to engage on? */
export function isInternTask(task) {
  const text = `${task?.title ?? ''} ${task?.description ?? ''}`.toLowerCase();
  return INTERN_KEYWORDS.some((kw) => text.includes(kw));
}

/**
 * Roles that should engage on this stage given the task content.
 * Returns required + applicable conditional roles.
 */
export function getActiveRoles(stage, task) {
  const rule = WORKFLOW_RULES[stage];
  if (!rule) return [];

  const roles = [...rule.requiredRoles];
  for (const cond of rule.conditionalRoles) {
    if (cond === 'Accessibility' && isUiTask(task)) roles.push(cond);
    if (cond === 'Intern' && isInternTask(task)) roles.push(cond);
  }
  return roles;
}

/**
 * Validate a stage transition.
 * - Returns null if the transition is OK (move to next stage, stay, or move backwards).
 * - Returns an error string if the transition would skip stages forward.
 */
export function validateTransition(fromStage, toStage) {
  const fromIdx = STAGE_ORDER.indexOf(fromStage);
  const toIdx = STAGE_ORDER.indexOf(toStage);
  if (fromIdx === -1 || toIdx === -1) return null;

  if (toIdx > fromIdx + 1) {
    const skipped = STAGE_ORDER.slice(fromIdx + 1, toIdx);
    return `Cannot skip stages. Task must pass through ${skipped.join(', ')} before reaching ${toStage}.`;
  }
  return null;
}

/** All allowed stage values (used by Express request validation). */
export const ALLOWED_STATUSES = STAGE_ORDER;

/**
 * @typedef {'backlog'|'analyze'|'develop'|'ready_for_test'|'testing'|'ready_for_acceptance'|'accepted'} TaskStatusKey
 */
