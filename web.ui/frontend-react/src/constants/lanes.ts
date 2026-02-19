/** Board lane constants — single source of truth. */

import type { Lane } from '../types';

export const LANES: Lane[] = [
  { key: 'backlog', label: 'Backlog' },
  { key: 'analyze', label: 'Analyze' },
  { key: 'develop', label: 'Develop' },
  { key: 'ready_for_test', label: 'Ready for Test' },
  { key: 'testing', label: 'Testing' },
  { key: 'ready_for_acceptance', label: 'Ready for Acceptance' },
  { key: 'accepted', label: 'Accepted' },
];
