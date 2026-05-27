import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import PinterestTile from '../../components/dashboard/PinterestTile';
import * as pinApi from '../../api/pinterest';
import type {
  PinterestQueueRow,
  PinterestHistoryRow,
} from '../../api/pinterest';

function queueRow(
  id: number,
  status: PinterestQueueRow['status'],
  scheduled_for: string,
): PinterestQueueRow {
  return {
    id,
    kdp_book_id: null,
    pin_type: 'cover_hero',
    image_path: `/tmp/${id}.png`,
    title: `Pin ${id}`,
    description: '',
    link_url: '',
    status,
    scheduled_for,
    attempts: 0,
    last_error: null,
    created_at: '2026-05-20T00:00:00Z',
  };
}

function historyRow(id: number, posted_at: string): PinterestHistoryRow {
  return {
    id,
    queue_id: id,
    pinterest_pin_id: 'abc',
    posted_at,
    success: true,
    error_message: null,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

function renderTile() {
  return render(
    <MemoryRouter>
      <PinterestTile />
    </MemoryRouter>,
  );
}

describe('PinterestTile', () => {
  it('renders queue depth and pending count', async () => {
    const future = new Date(Date.now() + 3 * 3600_000).toISOString();
    vi.spyOn(pinApi, 'listQueue').mockResolvedValue([
      queueRow(1, 'pending', future),
      queueRow(2, 'pending', future),
      queueRow(3, 'paused', future),
    ]);
    vi.spyOn(pinApi, 'listHistory').mockResolvedValue([
      historyRow(99, new Date(Date.now() - 3600_000).toISOString()),
    ]);
    renderTile();
    await waitFor(() => screen.getByText('In queue'));
    // queue depth = 3, pending = 2
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText(/Last posted:/i)).toBeInTheDocument();
  });

  it('shows "none scheduled" when no pending rows', async () => {
    vi.spyOn(pinApi, 'listQueue').mockResolvedValue([]);
    vi.spyOn(pinApi, 'listHistory').mockResolvedValue([]);
    renderTile();
    await waitFor(() => screen.getByText(/none scheduled/i));
  });

  it('view-all link points to /pinterest', async () => {
    vi.spyOn(pinApi, 'listQueue').mockResolvedValue([]);
    vi.spyOn(pinApi, 'listHistory').mockResolvedValue([]);
    renderTile();
    await waitFor(() => screen.getByText(/view all/i));
    expect(screen.getByText(/view all/i)).toHaveAttribute('href', '/pinterest');
  });

  it('renders an error if either fetch fails', async () => {
    vi.spyOn(pinApi, 'listQueue').mockRejectedValue(new Error('boom'));
    vi.spyOn(pinApi, 'listHistory').mockResolvedValue([]);
    renderTile();
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/boom/);
    });
  });
});
