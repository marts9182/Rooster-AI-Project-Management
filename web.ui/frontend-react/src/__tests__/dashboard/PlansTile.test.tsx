import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import PlansTile from '../../components/dashboard/PlansTile';
import * as plansApi from '../../api/plans';
import type { PlanEntry } from '../../api/plans';

function plan(
  slug: string,
  status: PlanEntry['status'],
  date: string,
  percent = 0,
): PlanEntry {
  return {
    kind: 'plan',
    slug,
    title: `Plan ${slug}`,
    date,
    status,
    path: `/abs/${slug}.md`,
    progress: { open: 0, done: 0, total: 0, percent },
    completedAt: null,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

function renderTile() {
  return render(
    <MemoryRouter>
      <PlansTile />
    </MemoryRouter>,
  );
}

describe('PlansTile', () => {
  it('shows in-flight and done counts', async () => {
    vi.spyOn(plansApi, 'listPlans').mockResolvedValue([
      plan('a', 'in-flight', '2026-05-20', 50),
      plan('b', 'in-flight', '2026-05-21', 30),
      plan('c', 'done', '2026-05-19', 100),
      // spec entries should be ignored by the counts
      { ...plan('d', 'open', '2026-05-18', 0), kind: 'spec' },
    ]);
    renderTile();
    await waitFor(() => screen.getByText('In flight'));
    const stats = within(screen.getByTestId('tile-plans')).getByLabelText(/Plan status counts/i);
    expect(within(stats).getByText('2')).toBeInTheDocument();
    expect(within(stats).getByText('1')).toBeInTheDocument();
  });

  it('renders 3 most-recent plans with title + percent', async () => {
    vi.spyOn(plansApi, 'listPlans').mockResolvedValue([
      plan('older', 'in-flight', '2026-05-01', 10),
      plan('newer', 'in-flight', '2026-05-26', 70),
      plan('newest', 'done', '2026-05-27', 100),
      plan('mid', 'open', '2026-05-15', 0),
    ]);
    renderTile();
    await waitFor(() => screen.getByText('Plan newest'));
    expect(screen.getByText('Plan newer')).toBeInTheDocument();
    expect(screen.getByText('Plan mid')).toBeInTheDocument();
    // The percentages appear; check the 70 and 100 are present.
    expect(screen.getByText('70%')).toBeInTheDocument();
    expect(screen.getByText('100%')).toBeInTheDocument();
  });

  it('shows view-all link to /plans', async () => {
    vi.spyOn(plansApi, 'listPlans').mockResolvedValue([]);
    renderTile();
    await waitFor(() => screen.getByText(/view all/i));
    expect(screen.getByText(/view all/i)).toHaveAttribute('href', '/plans');
  });

  it('handles fetch error', async () => {
    vi.spyOn(plansApi, 'listPlans').mockRejectedValue(new Error('nope'));
    renderTile();
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/nope/);
    });
  });
});
