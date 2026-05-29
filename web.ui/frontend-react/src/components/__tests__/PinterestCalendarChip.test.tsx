import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PinterestCalendarChip from '../PinterestCalendarChip';
import type { PinterestQueueRow } from '../../api/pinterest';

const baseRow: PinterestQueueRow = {
  id: 1,
  kdp_book_id: 1,
  pin_type: 'cover_hero',
  image_path: '/x.png',
  title: 'Travel Sudoku Vol 1',
  description: 'd',
  link_url: 'https://amazon.com',
  status: 'pending',
  scheduled_for: '2026-05-29T09:00:00Z',
  book_slug: 'travel-sudoku-v1',
};

describe('PinterestCalendarChip', () => {
  it('renders the book slug abbreviation', () => {
    render(<PinterestCalendarChip row={baseRow} onClick={vi.fn()} />);
    expect(screen.getByRole('button')).toHaveTextContent(/travel/i);
  });

  it('applies status class for each status', () => {
    const statuses = ['pending', 'paused', 'posting', 'failed'] as const;
    for (const s of statuses) {
      const { unmount } = render(
        <PinterestCalendarChip row={{ ...baseRow, status: s }} onClick={vi.fn()} />,
      );
      expect(document.querySelector(`.pin-chip--${s}`)).not.toBeNull();
      unmount();
    }
  });

  it('calls onClick with the row', async () => {
    const onClick = vi.fn();
    render(<PinterestCalendarChip row={baseRow} onClick={onClick} />);
    await userEvent.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledWith(baseRow);
  });
});
