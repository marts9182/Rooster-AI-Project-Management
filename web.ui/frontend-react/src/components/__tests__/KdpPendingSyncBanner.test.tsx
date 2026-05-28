import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import KdpPendingSyncBanner from '../KdpPendingSyncBanner';
import type { IngestPreview } from '../../api/kdp';

function previewWithCounts(matches: number, ambiguous: number, orphans: number): IngestPreview {
  return {
    preview_id: 'p1',
    created_at: new Date().toISOString(),
    matches: Array.from({ length: matches }, (_, i) => ({
      kind: 'MATCHED_BY_ASIN',
      dashboard_slug: `s${i}`,
      dashboard_title_before: 'T',
      scraped: { asin: 'B0CTESTTEST', kdp_title: 'T', kdp_status: 'Live' },
      new_dashboard_status: 'published',
      title_will_change: false,
      status_ambiguous: false,
    })),
    ambiguous: Array.from({ length: ambiguous }, () => ({
      scraped: { asin: 'B0CABCABCAB', kdp_title: 'T', kdp_status: 'Live' },
      candidate_slugs: ['a', 'b'],
    })),
    orphans: Array.from({ length: orphans }, () => ({
      scraped: { asin: 'B0CORPHANBC', kdp_title: 'T', kdp_status: 'Live' },
    })),
    missing_from_kdp: [],
  };
}

function mockJson(body: unknown, ok = true, status = 200) {
  return {
    ok,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

describe('KdpPendingSyncBanner', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });
  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('renders nothing when there is no pending preview', async () => {
    fetchSpy.mockResolvedValueOnce(mockJson({ preview: null }));
    const { container } = render(<KdpPendingSyncBanner onApplied={vi.fn()} />);
    await waitFor(() => expect(fetchSpy).toHaveBeenCalled());
    expect(container.firstChild).toBeNull();
  });

  it('renders counts and a Review button when a preview is pending', async () => {
    fetchSpy.mockResolvedValueOnce(mockJson({ preview: previewWithCounts(5, 2, 1) }));
    render(<KdpPendingSyncBanner onApplied={vi.fn()} />);
    expect(await screen.findByText(/Pending KDP sync/i)).toBeInTheDocument();
    expect(screen.getByText(/5 matched/i)).toBeInTheDocument();
    expect(screen.getByText(/2 ambiguous/i)).toBeInTheDocument();
    expect(screen.getByText(/1 orphan/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /review/i })).toBeEnabled();
  });
});
