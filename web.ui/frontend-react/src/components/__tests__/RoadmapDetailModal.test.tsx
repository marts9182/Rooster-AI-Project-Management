import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import RoadmapDetailModal from '../RoadmapDetailModal';
import type { RoadmapRow } from '../../api/roadmap';

const sample: RoadmapRow = {
  id: 7, kind: 'kdp', slug: 'foo', title: 'Foo',
  target_release_date: '2026-09-15', status: 'planned', source: 'reuse',
  niche: 'faith', rationale: 'because faith Q4 evergreen',
  file_lock_date: '2026-08-31',
  kdp_book_id: null, etsy_listing_id: null, notes: '',
  created_at: '', updated_at: '',
};

function mockJson(body: unknown, ok = true, status = 200) {
  return { ok, status, json: async () => body, text: async () => '{}' } as unknown as Response;
}

describe('RoadmapDetailModal', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => { fetchSpy = vi.spyOn(globalThis, 'fetch'); });
  afterEach(() => { fetchSpy.mockRestore(); });

  it('fetches row on mount and renders the title + slug + niche', async () => {
    fetchSpy.mockResolvedValueOnce(mockJson({ rows: [sample] }));
    render(<RoadmapDetailModal id={7} onClose={vi.fn()} onChanged={vi.fn()} />);
    expect(await screen.findByText('Foo')).toBeInTheDocument();
    expect(screen.getByText('foo')).toBeInTheDocument();
    expect(screen.getAllByText(/faith/i).length).toBeGreaterThan(0);
  });

  it('status dropdown PUTs the new status', async () => {
    fetchSpy
      .mockResolvedValueOnce(mockJson({ rows: [sample] }))
      .mockResolvedValueOnce(mockJson({ row: { ...sample, status: 'building' } }));
    const onChanged = vi.fn();
    render(<RoadmapDetailModal id={7} onClose={vi.fn()} onChanged={onChanged} />);
    await screen.findByText('Foo');
    const select = screen.getByLabelText(/status/i) as HTMLSelectElement;
    await userEvent.selectOptions(select, 'building');
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    const putCall = fetchSpy.mock.calls.find(
      (c: unknown[]) => String(c[0]).includes('/api/roadmap/7') && (c[1] as RequestInit)?.method === 'PUT',
    );
    expect(putCall).toBeTruthy();
    const body = JSON.parse((putCall![1] as RequestInit).body as string);
    expect(body.status).toBe('building');
  });

  it('changing target_release_date recomputes file_lock_date via PUT response', async () => {
    fetchSpy
      .mockResolvedValueOnce(mockJson({ rows: [sample] }))
      .mockResolvedValueOnce(mockJson({
        row: { ...sample, target_release_date: '2026-12-01', file_lock_date: '2026-11-16' },
      }));
    render(<RoadmapDetailModal id={7} onClose={vi.fn()} onChanged={vi.fn()} />);
    await screen.findByText('Foo');
    const dateInput = screen.getByLabelText(/target release/i) as HTMLInputElement;
    await userEvent.clear(dateInput);
    await userEvent.type(dateInput, '2026-12-01');
    await userEvent.tab();
    expect(await screen.findByText('2026-11-16')).toBeInTheDocument();
  });

  it('Close button calls onClose', async () => {
    fetchSpy.mockResolvedValueOnce(mockJson({ rows: [sample] }));
    const onClose = vi.fn();
    render(<RoadmapDetailModal id={7} onClose={onClose} onChanged={vi.fn()} />);
    await screen.findByText('Foo');
    await userEvent.click(screen.getByRole('button', { name: /close/i }));
    expect(onClose).toHaveBeenCalled();
  });
});
