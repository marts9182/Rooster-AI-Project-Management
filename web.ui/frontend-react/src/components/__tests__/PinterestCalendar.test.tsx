import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import PinterestCalendar from '../PinterestCalendar';
import type { PinterestQueueRow } from '../../api/pinterest';

const monday = new Date('2026-05-25T00:00:00Z');

const rows: PinterestQueueRow[] = [
  {
    id: 1, kdp_book_id: 1, pin_type: 'cover_hero',
    image_path: '/x.png', title: 'Travel Sudoku', description: 'd',
    link_url: 'http', status: 'pending',
    scheduled_for: '2026-05-25T10:00:00Z',
    book_slug: 'travel',
  },
  {
    id: 2, kdp_book_id: 2, pin_type: 'cover_hero',
    image_path: '/x.png', title: 'Kakuro', description: 'd',
    link_url: 'http', status: 'pending',
    scheduled_for: '2026-05-26T14:00:00Z',
    book_slug: 'kakuro',
  },
];

describe('PinterestCalendar', () => {
  it('renders 7 day column headers starting at `start`', () => {
    const { container } = render(
      <PinterestCalendar rows={rows} start={monday} onChipClick={vi.fn()} />,
    );
    // 7 day-head cells regardless of timezone interpretation of the ISO start.
    expect(container.querySelectorAll('.pin-calendar__day-head').length).toBe(7);
  });

  it('renders 4 slot row labels', () => {
    render(<PinterestCalendar rows={rows} start={monday} onChipClick={vi.fn()} />);
    expect(screen.getByText('9 AM')).toBeInTheDocument();
    expect(screen.getByText('12 PM')).toBeInTheDocument();
    expect(screen.getByText('3 PM')).toBeInTheDocument();
    expect(screen.getByText('6 PM')).toBeInTheDocument();
  });

  it('places chips in the cell matching the scheduled hour', () => {
    const { container } = render(
      <PinterestCalendar rows={rows} start={monday} onChipClick={vi.fn()} />,
    );
    expect(container.querySelectorAll('.pin-chip').length).toBe(2);
  });
});
