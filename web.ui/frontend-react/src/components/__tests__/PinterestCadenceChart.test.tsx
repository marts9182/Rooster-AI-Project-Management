import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PinterestCadenceChart from '../PinterestCadenceChart';
import type { CadenceResponse } from '../../api/pinterest';

const sample: CadenceResponse = {
  days: 7, target_per_day: 4,
  buckets: [
    { date: '2026-05-23', posted: 3, failed: 0 },
    { date: '2026-05-24', posted: 4, failed: 1 },
    { date: '2026-05-25', posted: 2, failed: 0 },
    { date: '2026-05-26', posted: 5, failed: 0 },
    { date: '2026-05-27', posted: 4, failed: 0 },
    { date: '2026-05-28', posted: 3, failed: 2 },
    { date: '2026-05-29', posted: 4, failed: 0 },
  ],
  summary: { posted: 25, failed: 3, success_rate: 25 / 28, avg_per_day: 25 / 7 },
};

describe('PinterestCadenceChart', () => {
  it('renders summary copy', () => {
    render(<PinterestCadenceChart data={sample} onBarClick={vi.fn()} />);
    expect(screen.getByText(/Posted 25 over 7 days/i)).toBeInTheDocument();
    expect(screen.getByText(/target 4\/day/i)).toBeInTheDocument();
  });

  it('renders one bar per bucket', () => {
    const { container } = render(<PinterestCadenceChart data={sample} onBarClick={vi.fn()} />);
    expect(container.querySelectorAll('.cadence-bar').length).toBe(7);
  });

  it('clicking a bar fires onBarClick with the bucket', async () => {
    const onBarClick = vi.fn();
    const { container } = render(<PinterestCadenceChart data={sample} onBarClick={onBarClick} />);
    const bars = container.querySelectorAll('.cadence-bar');
    await userEvent.click(bars[0]);
    expect(onBarClick).toHaveBeenCalledWith(sample.buckets[0]);
  });
});
