import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import PinterestHistoryTable from '../components/PinterestHistoryTable';
import type { PinterestHistoryRow } from '../api/pinterest';

const successRow: PinterestHistoryRow = {
  id: 1,
  queue_id: 1,
  pinterest_pin_id: '987654321',
  posted_at: '2026-05-26T12:00:00Z',
  success: true,
  error_message: null,
  title: 'Successful pin',
  image_path: '/tmp/output/pinterest/sample/cover_hero-0.png',
};

const failRow: PinterestHistoryRow = {
  id: 2,
  queue_id: 2,
  pinterest_pin_id: null,
  posted_at: '2026-05-26T13:00:00Z',
  success: false,
  error_message: 'Pinterest rejected: rate limited',
  title: 'Failed pin',
  image_path: '/tmp/output/pinterest/sample/cover_hero-1.png',
};

describe('<PinterestHistoryTable />', () => {
  it('renders the empty-state message with no rows', () => {
    render(<PinterestHistoryTable rows={[]} />);
    expect(screen.getByText(/No posting history yet/i)).toBeInTheDocument();
  });

  it('renders title, posted_at, and posted badge for a success row', () => {
    render(<PinterestHistoryTable rows={[successRow]} />);
    expect(screen.getByText('Successful pin')).toBeInTheDocument();
    // The "✓ posted" badge.
    expect(screen.getByText(/✓ posted/i)).toBeInTheDocument();
  });

  it('shows a pinterest.com link for successful rows', () => {
    render(<PinterestHistoryTable rows={[successRow]} />);
    const link = screen.getByRole('link', { name: '987654321' });
    expect(link).toHaveAttribute(
      'href',
      'https://www.pinterest.com/pin/987654321/',
    );
  });

  it('shows the error_message for failed rows', () => {
    render(<PinterestHistoryTable rows={[failRow]} />);
    expect(screen.getByText('Failed pin')).toBeInTheDocument();
    expect(screen.getByText(/⚠ failed/i)).toBeInTheDocument();
    expect(
      screen.getByText('Pinterest rejected: rate limited'),
    ).toBeInTheDocument();
  });

  it('renders multiple rows with one row per id', () => {
    render(<PinterestHistoryTable rows={[successRow, failRow]} />);
    const rows = screen
      .getAllByRole('row')
      .filter((r) => r.querySelector('td') !== null);
    expect(rows).toHaveLength(2);
  });
});
