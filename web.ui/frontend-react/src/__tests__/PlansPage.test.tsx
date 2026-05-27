import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Plans from '../pages/Plans';
import * as plansApi from '../api/plans';
import type { PlanEntry, PlanDetail } from '../api/plans';

const sampleEntries: PlanEntry[] = [
  {
    kind: 'spec',
    slug: 'etsy-plan-2e',
    title: 'Etsy Plan 2e Design',
    date: '2026-05-22',
    status: 'done',
    path: '/abs/2026-05-22-etsy-plan-2e-design.md',
    progress: { open: 0, done: 0, total: 0, percent: 0 },
  },
  {
    kind: 'plan',
    slug: 'etsy-plan-2e',
    title: 'Etsy Plan 2e Implementation',
    date: '2026-05-22',
    status: 'in-flight',
    path: '/abs/2026-05-22-etsy-plan-2e-implementation.md',
    progress: { open: 3, done: 7, total: 10, percent: 70 },
  },
  {
    kind: 'plan',
    slug: 'kdp-day-30',
    title: 'KDP Day-30 Gate Plan',
    date: '2026-05-10',
    status: 'open',
    path: '/abs/2026-05-10-kdp-day-30-implementation.md',
    progress: { open: 5, done: 0, total: 5, percent: 0 },
  },
];

const sampleDetail: PlanDetail = {
  ...sampleEntries[1],
  markdown: '# Plan body\n\n- [ ] step\n- [x] done step\n',
  frontmatter: { title: 'Etsy Plan 2e Implementation' },
};

beforeEach(() => {
  vi.spyOn(plansApi, 'listPlans').mockResolvedValue(sampleEntries);
  vi.spyOn(plansApi, 'getPlan').mockResolvedValue(sampleDetail);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Plans page', () => {
  it('renders the two column headings: Specs and Implementation Plans', async () => {
    render(<Plans />);
    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: /^specs$/i, level: 2 }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole('heading', { name: /implementation plans/i, level: 2 }),
      ).toBeInTheDocument();
    });
  });

  it('places specs in the Specs column and plans in the Implementation Plans column', async () => {
    render(<Plans />);
    await waitFor(() => screen.getByText('Etsy Plan 2e Design'));

    const specsSection = screen
      .getByRole('heading', { name: /^specs$/i, level: 2 })
      .closest('section');
    const plansSection = screen
      .getByRole('heading', { name: /implementation plans/i, level: 2 })
      .closest('section');
    expect(specsSection).not.toBeNull();
    expect(plansSection).not.toBeNull();

    // Spec entry only in specs column.
    expect(specsSection!).toHaveTextContent('Etsy Plan 2e Design');
    expect(plansSection!).not.toHaveTextContent('Etsy Plan 2e Design');

    // Plan entries only in plans column.
    expect(plansSection!).toHaveTextContent('Etsy Plan 2e Implementation');
    expect(plansSection!).toHaveTextContent('KDP Day-30 Gate Plan');
    expect(specsSection!).not.toHaveTextContent('Etsy Plan 2e Implementation');
    expect(specsSection!).not.toHaveTextContent('KDP Day-30 Gate Plan');
  });

  it('renders status badges with the appropriate label for each status', async () => {
    render(<Plans />);
    await waitFor(() => screen.getByText('Etsy Plan 2e Design'));
    // done (the spec), in flight (etsy plan), open (kdp plan)
    expect(screen.getByText('done')).toBeInTheDocument();
    expect(screen.getByText('in flight')).toBeInTheDocument();
    expect(screen.getByText('open')).toBeInTheDocument();
  });

  it('renders a progress bar and tasks count for plans with checkboxes', async () => {
    render(<Plans />);
    await waitFor(() => screen.getByText('Etsy Plan 2e Implementation'));
    expect(screen.getByText('70%')).toBeInTheDocument();
    expect(screen.getByText('7/10 tasks')).toBeInTheDocument();

    // ARIA progressbar reflects percent.
    const bars = screen.getAllByRole('progressbar');
    const etsyBar = bars.find(
      (el) => el.getAttribute('aria-valuenow') === '70',
    );
    expect(etsyBar).toBeDefined();
  });

  it('opens the detail modal with rendered markdown when a card is clicked', async () => {
    const user = userEvent.setup();
    render(<Plans />);
    await waitFor(() => screen.getByText('Etsy Plan 2e Implementation'));

    await user.click(screen.getByText('Etsy Plan 2e Implementation'));

    await waitFor(() => {
      expect(plansApi.getPlan).toHaveBeenCalledWith('etsy-plan-2e');
    });
    await waitFor(() => {
      // The H1 of the rendered markdown should appear in the modal.
      expect(
        screen.getByRole('heading', { name: /plan body/i, level: 1 }),
      ).toBeInTheDocument();
    });
  });

  it('renders empty state when listPlans returns no entries', async () => {
    vi.mocked(plansApi.listPlans).mockResolvedValue([]);
    render(<Plans />);
    await waitFor(() => {
      expect(screen.getByText(/no specs found/i)).toBeInTheDocument();
      expect(
        screen.getByText(/no implementation plans found/i),
      ).toBeInTheDocument();
    });
  });

  it('surfaces an error banner when listPlans fails', async () => {
    vi.mocked(plansApi.listPlans).mockRejectedValue(new Error('boom'));
    render(<Plans />);
    await waitFor(() => {
      expect(screen.getByText(/failed to load.*boom/i)).toBeInTheDocument();
    });
  });
});
