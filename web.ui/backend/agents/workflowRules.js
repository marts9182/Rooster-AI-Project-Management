/**
 * Workflow rules — which roles engage at each Kanban stage.
 * Ported from the frontend TypeScript to plain Node.js.
 */

export const STAGE_ORDER = [
  'backlog', 'analyze', 'develop', 'ready_for_test',
  'testing', 'ready_for_acceptance', 'accepted',
];

export const WORKFLOW_RULES = {
  backlog: {
    requiredRoles: ['Product Owner', 'Manager'],
    conditionalRoles: [],
  },
  analyze: {
    requiredRoles: ['Tech Lead', 'Product Owner'],
    conditionalRoles: [],
  },
  develop: {
    requiredRoles: ['Developer', 'Tech Lead'],
    conditionalRoles: ['Intern'],
  },
  ready_for_test: {
    requiredRoles: ['QA', 'Developer', 'Tech Lead'],
    conditionalRoles: [],
  },
  testing: {
    requiredRoles: ['QA'],
    conditionalRoles: ['Accessibility'],
  },
  ready_for_acceptance: {
    requiredRoles: ['Product Owner', 'Manager'],
    conditionalRoles: ['Accessibility'],
  },
  accepted: {
    requiredRoles: ['Manager'],
    conditionalRoles: [],
  },
};

const UI_KEYWORDS = new Set([
  'ui', 'interface', 'user', 'form', 'button', 'page', 'modal',
  'dialog', 'css', 'style', 'layout', 'component', 'frontend',
  'design', 'visual', 'display', 'screen', 'render', 'html',
  'accessibility', 'a11y', 'wcag', 'keyboard', 'focus',
]);

export function isUiTask(task) {
  const text = `${task.title} ${task.description ?? ''}`.toLowerCase();
  for (const kw of UI_KEYWORDS) {
    if (text.includes(kw)) return true;
  }
  return false;
}

const INTERN_KEYWORDS = ['documentation', 'docs', 'readme', 'simple', 'small'];

export function isInternTask(task) {
  const text = `${task.title} ${task.description ?? ''}`.toLowerCase();
  return INTERN_KEYWORDS.some((kw) => text.includes(kw));
}

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
