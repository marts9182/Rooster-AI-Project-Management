import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import PinterestEngagementTable from '../PinterestEngagementTable';
import type { EngagementResponse } from '../../api/pinterest';

const baseRow = {
  history_id: 1, image_path: '/p/x.png',
  book_slug: 'travel-v1', posted_at: '2026-05-29T10:00:00Z',
  saves: 12 as number | null, clicks: 3 as number | null, impressions: 287 as number | null,
  pinterest_url: 'https://pin/1', engagement_available: true,
};

describe('PinterestEngagementTable', () => {
  it('renders one row per data row', () => {
    const data: EngagementResponse = {
      rows: [baseRow, { ...baseRow, history_id: 2, book_slug: 'sudoku' }],
      engagement_disabled: false,
    };
    render(<PinterestEngagementTable data={data} />);
    expect(screen.getByText('travel-v1')).toBeInTheDocument();
    expect(screen.getByText('sudoku')).toBeInTheDocument();
  });

  it('shows em-dash for null engagement columns', () => {
    const data: EngagementResponse = {
      rows: [{ ...baseRow, saves: null, clicks: null, impressions: null, engagement_available: false }],
      engagement_disabled: false,
    };
    render(<PinterestEngagementTable data={data} />);
    const cells = screen.getAllByText('—');
    expect(cells.length).toBeGreaterThanOrEqual(3);
  });

  it('renders the disabled banner when engagement_disabled is true', () => {
    const data: EngagementResponse = { rows: [], engagement_disabled: true };
    render(<PinterestEngagementTable data={data} />);
    expect(screen.getByText(/analytics not available/i)).toBeInTheDocument();
  });
});
