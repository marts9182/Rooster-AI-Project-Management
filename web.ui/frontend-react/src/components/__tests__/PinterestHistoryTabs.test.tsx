import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PinterestHistoryTabs from '../PinterestHistoryTabs';

function mockJson(body: unknown) {
  return {
    ok: true, status: 200,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

describe('PinterestHistoryTabs', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch');
    try { localStorage.removeItem('pinterest_history_tab'); } catch { /* ignore */ }
  });
  afterEach(() => { fetchSpy.mockRestore(); });

  it('defaults to the Recent tab', () => {
    render(<PinterestHistoryTabs recentChildren={<div>RECENT-PANEL</div>} />);
    expect(screen.getByText('RECENT-PANEL')).toBeInTheDocument();
  });

  it('switches to Cadence and fetches cadence data', async () => {
    fetchSpy.mockResolvedValueOnce(mockJson({
      days: 30, target_per_day: 4,
      buckets: Array.from({ length: 30 }, (_, i) => ({
        date: `2026-05-${String(i + 1).padStart(2, '0')}`, posted: 1, failed: 0,
      })),
      summary: { posted: 30, failed: 0, success_rate: 1, avg_per_day: 1 },
    }));
    render(<PinterestHistoryTabs recentChildren={<div>RECENT-PANEL</div>} />);
    await userEvent.click(screen.getByRole('tab', { name: /cadence/i }));
    expect(await screen.findByText(/Posted 30 over 30 days/i)).toBeInTheDocument();
  });

  it('switches to Engagement and fetches engagement data', async () => {
    fetchSpy.mockResolvedValueOnce(mockJson({ rows: [], engagement_disabled: false }));
    render(<PinterestHistoryTabs recentChildren={<div>RECENT-PANEL</div>} />);
    await userEvent.click(screen.getByRole('tab', { name: /engagement/i }));
    expect(await screen.findByRole('table')).toBeInTheDocument();
  });
});
