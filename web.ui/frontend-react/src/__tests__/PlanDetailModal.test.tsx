import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PlanDetailModal } from '../components/PlanDetailModal';
import * as plansApi from '../api/plans';
import type { PlanDetail } from '../api/plans';

const sampleDetail: PlanDetail = {
  kind: 'plan',
  slug: 'etsy-plan-2e',
  title: 'Etsy Plan 2e Implementation',
  date: '2026-05-22',
  status: 'in-flight',
  path: '/abs/2026-05-22-etsy-plan-2e-implementation.md',
  progress: { open: 3, done: 7, total: 10, percent: 70 },
  markdown:
    '# Plan body\n\n- [ ] open step\n- [x] done step\n\n| col | val |\n| --- | --- |\n| a | b |\n',
  frontmatter: { title: 'Etsy Plan 2e Implementation' },
};

beforeEach(() => {
  vi.spyOn(plansApi, 'getPlan').mockResolvedValue(sampleDetail);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('PlanDetailModal', () => {
  it('renders nothing when slug is null', () => {
    const { container } = render(
      <PlanDetailModal slug={null} onClose={() => {}} />,
    );
    expect(container.querySelector('[role="dialog"]')).toBeNull();
  });

  it('fetches the plan by slug and renders the markdown body', async () => {
    render(
      <PlanDetailModal slug="etsy-plan-2e" onClose={() => {}} />,
    );
    await waitFor(() => {
      expect(plansApi.getPlan).toHaveBeenCalledWith('etsy-plan-2e');
    });
    await waitFor(() => {
      // Title in the modal header.
      expect(
        screen.getByText('Etsy Plan 2e Implementation'),
      ).toBeInTheDocument();
      // Markdown body H1.
      expect(
        screen.getByRole('heading', { name: /plan body/i, level: 1 }),
      ).toBeInTheDocument();
    });
  });

  it('renders GFM tables from the markdown body', async () => {
    render(
      <PlanDetailModal slug="etsy-plan-2e" onClose={() => {}} />,
    );
    await waitFor(() => {
      // remark-gfm should produce a <table> for the pipe-table.
      expect(screen.getByRole('table')).toBeInTheDocument();
    });
  });

  it('shows the kind badge, date, and status in the header', async () => {
    render(
      <PlanDetailModal slug="etsy-plan-2e" onClose={() => {}} />,
    );
    await waitFor(() => {
      expect(screen.getByText('Plan')).toBeInTheDocument();
      expect(screen.getByText('2026-05-22')).toBeInTheDocument();
      expect(screen.getByText('in flight')).toBeInTheDocument();
    });
  });

  it('closes on Escape key', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <PlanDetailModal slug="etsy-plan-2e" onClose={onClose} />,
    );
    await waitFor(() =>
      screen.getByText('Etsy Plan 2e Implementation'),
    );
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes when the close button is clicked', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <PlanDetailModal slug="etsy-plan-2e" onClose={onClose} />,
    );
    await waitFor(() =>
      screen.getByText('Etsy Plan 2e Implementation'),
    );
    await user.click(
      screen.getByRole('button', { name: /close plan detail/i }),
    );
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes on overlay click', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <PlanDetailModal slug="etsy-plan-2e" onClose={onClose} />,
    );
    await waitFor(() =>
      screen.getByText('Etsy Plan 2e Implementation'),
    );
    await user.click(screen.getByTestId('plan-modal-overlay'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('renders an error banner when getPlan fails', async () => {
    vi.mocked(plansApi.getPlan).mockRejectedValue(new Error('kaboom'));
    render(
      <PlanDetailModal slug="etsy-plan-2e" onClose={() => {}} />,
    );
    await waitFor(() => {
      expect(
        screen.getByText(/failed to load.*kaboom/i),
      ).toBeInTheDocument();
    });
  });

  it('refetches when the slug prop changes', async () => {
    const { rerender } = render(
      <PlanDetailModal slug="etsy-plan-2e" onClose={() => {}} />,
    );
    await waitFor(() => {
      expect(plansApi.getPlan).toHaveBeenCalledWith('etsy-plan-2e');
    });
    rerender(
      <PlanDetailModal slug="kdp-day-30" onClose={() => {}} />,
    );
    await waitFor(() => {
      expect(plansApi.getPlan).toHaveBeenCalledWith('kdp-day-30');
    });
  });
});
