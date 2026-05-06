/**
 * Workflow rules — thin re-export of the shared SSOT in web.ui/shared/workflow.mjs.
 * Backend Node consumers import from here; shared module is also imported by
 * the frontend so both halves stay in lockstep.
 */

export {
  STAGE_ORDER,
  LANE_LABELS,
  LANES,
  WORKFLOW_RULES,
  ALLOWED_STATUSES,
  isUiTask,
  isInternTask,
  getActiveRoles,
  validateTransition,
} from '../../shared/workflow.mjs';
