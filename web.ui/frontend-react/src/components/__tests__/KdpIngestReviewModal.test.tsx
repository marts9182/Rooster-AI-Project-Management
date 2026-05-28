import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import KdpIngestReviewModal from '../KdpIngestReviewModal';
import type { IngestPreview } from '../../api/kdp';

const samplePreview: IngestPreview = {
  preview_id: 'preview-uuid-1',
  created_at: '2026-05-27T10:00:00Z',
  matches: [
    {
      kind: 'MATCHED_BY_ASIN',
      dashboard_slug: 'foo',
      dashboard_title_before: 'Foo Old Title',
      scraped: { asin: 'B0CFOOFOOFO', kdp_title: 'Foo New Title', kdp_status: 'Live' },
      new_dashboard_status: 'published',
      title_will_change: true,
      status_ambiguous: false,
    },
  ],
  ambiguous: [
    {
      scraped: { asin: 'B0CAMBIGUOU', kdp_title: 'Ambig Book', kdp_status: 'Live' },
      candidate_slugs: ['cand-a', 'cand-b'],
    },
  ],
  orphans: [
    {
      scraped: { asin: 'B0CORPHANBC', kdp_title: 'Orphan Book', kdp_status: 'Live' },
    },
  ],
  missing_from_kdp: [
    { dashboard_slug: 'lost', dashboard_title: 'Lost Book' },
  ],
};

function mockJson(body: unknown, ok = true, status = 200) {
  return {
    ok,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

describe('KdpIngestReviewModal', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });
  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('renders the four section counts in the headings', () => {
    render(
      <KdpIngestReviewModal
        preview={samplePreview}
        onClose={vi.fn()}
        onApplied={vi.fn()}
      />,
    );
    expect(screen.getByText(/Matches \(1\)/)).toBeInTheDocument();
    expect(screen.getByText(/Ambiguous \(1\)/)).toBeInTheDocument();
    expect(screen.getByText(/Orphans \(1\)/)).toBeInTheDocument();
    expect(screen.getByText(/Missing from KDP \(1\)/)).toBeInTheDocument();
  });

  it('disables Apply until every ambiguous row has a selection', async () => {
    render(
      <KdpIngestReviewModal
        preview={samplePreview}
        onClose={vi.fn()}
        onApplied={vi.fn()}
      />,
    );
    const applyBtn = screen.getByRole('button', { name: /apply/i });
    expect(applyBtn).toBeDisabled();

    const select = screen.getByLabelText(/Ambig Book/i) as HTMLSelectElement;
    await userEvent.selectOptions(select, 'cand-a');
    expect(applyBtn).toBeEnabled();
  });

  it('toggling an orphan checkbox flips the commit body', async () => {
    fetchSpy.mockResolvedValueOnce(
      mockJson({ applied: 1, created: 1, skipped: 0, errors: [] }),
    );
    render(
      <KdpIngestReviewModal
        preview={samplePreview}
        onClose={vi.fn()}
        onApplied={vi.fn()}
      />,
    );
    await userEvent.selectOptions(screen.getByLabelText(/Ambig Book/i), 'cand-a');
    await userEvent.click(screen.getByLabelText(/Orphan Book/i));
    await userEvent.click(screen.getByRole('button', { name: /apply/i }));

    const [, options] = fetchSpy.mock.calls[0];
    const body = JSON.parse((options as RequestInit).body as string);
    expect(body.preview_id).toBe('preview-uuid-1');
    expect(body.confirmed_orphans).toEqual(['B0CORPHANBC']);
    expect(body.ambiguous_resolutions).toEqual({ B0CAMBIGUOU: 'cand-a' });
  });

  it('calls onApplied on commit success', async () => {
    fetchSpy.mockResolvedValueOnce(
      mockJson({ applied: 1, created: 0, skipped: 0, errors: [] }),
    );
    const onApplied = vi.fn();
    render(
      <KdpIngestReviewModal
        preview={samplePreview}
        onClose={vi.fn()}
        onApplied={onApplied}
      />,
    );
    await userEvent.selectOptions(screen.getByLabelText(/Ambig Book/i), 'cand-a');
    await userEvent.click(screen.getByRole('button', { name: /apply/i }));
    await screen.findByText(/Applied 1/i);
    expect(onApplied).toHaveBeenCalled();
  });

  it('surfaces error inside the modal on commit failure', async () => {
    fetchSpy.mockResolvedValueOnce(mockJson({ error: 'boom' }, false, 500));
    render(
      <KdpIngestReviewModal
        preview={samplePreview}
        onClose={vi.fn()}
        onApplied={vi.fn()}
      />,
    );
    await userEvent.selectOptions(screen.getByLabelText(/Ambig Book/i), 'cand-a');
    await userEvent.click(screen.getByRole('button', { name: /apply/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/boom|500/i);
  });
});
