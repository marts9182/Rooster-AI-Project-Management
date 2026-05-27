import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PinterestQueueTable from '../components/PinterestQueueTable';
import type { PinterestQueueRow } from '../api/pinterest';

const baseRow: PinterestQueueRow = {
  id: 1,
  kdp_book_id: 1,
  pin_type: 'cover_hero',
  image_path: '/tmp/output/pinterest/sample/cover_hero-0.png',
  title: 'Sample pin one',
  description: 'desc one',
  link_url: 'https://www.amazon.com/dp/B01ABCDEFG',
  status: 'pending',
  scheduled_for: '2026-06-01T15:00:00Z',
  attempts: 0,
  last_error: null,
  created_at: '2026-05-26T00:00:00Z',
};

const pausedRow: PinterestQueueRow = {
  ...baseRow,
  id: 2,
  title: 'Sample pin two (paused)',
  status: 'paused',
  scheduled_for: '2026-06-02T15:00:00Z',
};

const postedRow: PinterestQueueRow = {
  ...baseRow,
  id: 3,
  title: 'Sample pin three (posted)',
  status: 'posted',
  pin_type: 'interior_preview',
  scheduled_for: '2026-05-25T15:00:00Z',
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('<PinterestQueueTable />', () => {
  it('renders an empty-state message when there are no rows', () => {
    render(
      <PinterestQueueTable
        rows={[]}
        onEdit={vi.fn()}
        onCancel={vi.fn()}
        onPreview={vi.fn()}
      />,
    );
    expect(screen.getByText(/No pins in queue/i)).toBeInTheDocument();
  });

  it('renders one tbody row per queue row with the title and status badge', () => {
    render(
      <PinterestQueueTable
        rows={[baseRow, pausedRow, postedRow]}
        onEdit={vi.fn()}
        onCancel={vi.fn()}
        onPreview={vi.fn()}
      />,
    );
    expect(screen.getByText('Sample pin one')).toBeInTheDocument();
    expect(screen.getByText('Sample pin two (paused)')).toBeInTheDocument();
    expect(screen.getByText('Sample pin three (posted)')).toBeInTheDocument();
    // Each row gets a status-<name> class.
    const table = screen.getByRole('table');
    expect(table.querySelector('tr.status-pending')).not.toBeNull();
    expect(table.querySelector('tr.status-paused')).not.toBeNull();
    expect(table.querySelector('tr.status-posted')).not.toBeNull();
  });

  it('clicking a title cell fires onPreview with the row', async () => {
    const onPreview = vi.fn();
    render(
      <PinterestQueueTable
        rows={[baseRow]}
        onEdit={vi.fn()}
        onCancel={vi.fn()}
        onPreview={onPreview}
      />,
    );
    await userEvent.click(screen.getByText('Sample pin one'));
    expect(onPreview).toHaveBeenCalledWith(baseRow);
  });

  it('Edit button opens an inline form; Save fires onEdit with the patch', async () => {
    const onEdit = vi.fn();
    render(
      <PinterestQueueTable
        rows={[baseRow]}
        onEdit={onEdit}
        onCancel={vi.fn()}
        onPreview={vi.fn()}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: /^Edit$/ }));
    const titleInput = screen.getByLabelText('Title') as HTMLInputElement;
    expect(titleInput).toBeInTheDocument();
    await userEvent.clear(titleInput);
    await userEvent.type(titleInput, 'New title');
    await userEvent.click(screen.getByRole('button', { name: /^Save$/ }));
    expect(onEdit).toHaveBeenCalledTimes(1);
    const [id, patch] = onEdit.mock.calls[0];
    expect(id).toBe(1);
    expect(patch.title).toBe('New title');
  });

  it('Cancel button asks for confirmation then fires onCancel', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const onCancel = vi.fn();
    render(
      <PinterestQueueTable
        rows={[baseRow]}
        onEdit={vi.fn()}
        onCancel={onCancel}
        onPreview={vi.fn()}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: /^Cancel$/ }));
    expect(confirmSpy).toHaveBeenCalled();
    expect(onCancel).toHaveBeenCalledWith(1);
  });

  it('Cancel button does not fire onCancel when confirm is dismissed', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    const onCancel = vi.fn();
    render(
      <PinterestQueueTable
        rows={[baseRow]}
        onEdit={vi.fn()}
        onCancel={onCancel}
        onPreview={vi.fn()}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: /^Cancel$/ }));
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('hides Edit/Cancel buttons for posted rows', () => {
    render(
      <PinterestQueueTable
        rows={[postedRow]}
        onEdit={vi.fn()}
        onCancel={vi.fn()}
        onPreview={vi.fn()}
      />,
    );
    const table = screen.getByRole('table');
    expect(within(table).queryByRole('button', { name: /^Edit$/ })).toBeNull();
    expect(within(table).queryByRole('button', { name: /^Cancel$/ })).toBeNull();
  });

  it('clicking the Scheduled header toggles sort order', async () => {
    render(
      <PinterestQueueTable
        rows={[baseRow, pausedRow]}
        onEdit={vi.fn()}
        onCancel={vi.fn()}
        onPreview={vi.fn()}
      />,
    );
    let titles = screen
      .getAllByRole('row')
      .slice(1)
      .map((tr) => tr.textContent ?? '');
    expect(titles[0]).toContain('Sample pin one');
    await userEvent.click(screen.getByRole('button', { name: /Scheduled/i }));
    titles = screen
      .getAllByRole('row')
      .slice(1)
      .map((tr) => tr.textContent ?? '');
    expect(titles[0]).toContain('Sample pin two');
  });
});
