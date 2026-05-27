import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import BellPopover from '../components/BellPopover';
import * as remindersApi from '../api/reminders';
import type { Reminder } from '../api/reminders';

const sampleReminders: Reminder[] = [
  {
    id: 1,
    title: 'KDP Day-30 check: Sudoku Vol 1',
    body: 'How are sales tracking?',
    due_at: '2026-05-27T12:00:00Z',
    channel: 'both',
    status: 'pending',
    source_kind: 'kdp.book',
    source_id: 7,
    fired_at: null,
    created_at: '2026-05-26T12:00:00Z',
  },
  {
    id: 2,
    title: 'Etsy Day-60 gate: Mushroom Mandala',
    body: null,
    due_at: '2026-05-29T13:00:00Z',
    channel: 'email',
    status: 'pending',
    source_kind: 'etsy.listing',
    source_id: 1234567890,
    fired_at: null,
    created_at: '2026-05-26T12:00:00Z',
  },
];

beforeEach(() => {
  vi.spyOn(remindersApi, 'listReminders').mockResolvedValue(sampleReminders);
  vi.spyOn(remindersApi, 'snoozeReminder').mockResolvedValue({
    ok: true,
    due_at: '2026-05-27T13:00:00Z',
  });
  vi.spyOn(remindersApi, 'dismissReminder').mockResolvedValue({ ok: true });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('BellPopover', () => {
  it('renders nothing when isOpen is false', () => {
    const { container } = render(
      <BellPopover isOpen={false} onClose={() => {}} />,
    );
    expect(container.querySelector('[role="dialog"]')).toBeNull();
  });

  it('fetches and renders pending reminders when isOpen', async () => {
    render(<BellPopover isOpen={true} onClose={() => {}} />);
    expect(remindersApi.listReminders).toHaveBeenCalledWith({
      status: 'pending',
      limit: 10,
      order: 'due_at_asc',
    });
    await waitFor(() => {
      expect(screen.getByText(/KDP Day-30 check/)).toBeInTheDocument();
      expect(screen.getByText(/Etsy Day-60 gate/)).toBeInTheDocument();
    });
  });

  it('renders the empty state when there are no pending reminders', async () => {
    vi.mocked(remindersApi.listReminders).mockResolvedValue([]);
    render(<BellPopover isOpen={true} onClose={() => {}} />);
    await waitFor(() => {
      expect(screen.getByText(/no pending reminders/i)).toBeInTheDocument();
    });
  });

  it('Snooze 1h button calls snoozeReminder(id, 1) and refetches', async () => {
    const user = userEvent.setup();
    render(<BellPopover isOpen={true} onClose={() => {}} />);
    await waitFor(() => screen.getByText(/KDP Day-30 check/));
    // listReminders called once for the initial fetch
    expect(remindersApi.listReminders).toHaveBeenCalledTimes(1);
    const snoozeBtns = screen.getAllByRole('button', { name: /snooze .* for 1 hour/i });
    await user.click(snoozeBtns[0]);
    await waitFor(() => {
      expect(remindersApi.snoozeReminder).toHaveBeenCalledWith(1, 1);
    });
    // Refetched after the action.
    await waitFor(() => {
      expect(remindersApi.listReminders).toHaveBeenCalledTimes(2);
    });
  });

  it('Snooze 24h button calls snoozeReminder(id, 24)', async () => {
    const user = userEvent.setup();
    render(<BellPopover isOpen={true} onClose={() => {}} />);
    await waitFor(() => screen.getByText(/KDP Day-30 check/));
    const snoozeBtns = screen.getAllByRole('button', {
      name: /snooze .* for 24 hours/i,
    });
    await user.click(snoozeBtns[0]);
    await waitFor(() => {
      expect(remindersApi.snoozeReminder).toHaveBeenCalledWith(1, 24);
    });
  });

  it('Dismiss button calls dismissReminder(id) and refetches', async () => {
    const user = userEvent.setup();
    render(<BellPopover isOpen={true} onClose={() => {}} />);
    await waitFor(() => screen.getByText(/KDP Day-30 check/));
    const dismissBtns = screen.getAllByRole('button', { name: /^dismiss/i });
    await user.click(dismissBtns[0]);
    await waitFor(() => {
      expect(remindersApi.dismissReminder).toHaveBeenCalledWith(1);
    });
    await waitFor(() => {
      expect(remindersApi.listReminders).toHaveBeenCalledTimes(2);
    });
  });

  it('invokes onChange with the refetched list', async () => {
    const onChange = vi.fn();
    render(<BellPopover isOpen={true} onClose={() => {}} onChange={onChange} />);
    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith(sampleReminders);
    });
  });

  it('closes on overlay click', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<BellPopover isOpen={true} onClose={onClose} />);
    await waitFor(() => screen.getByText(/KDP Day-30 check/));
    await user.click(screen.getByTestId('bell-overlay'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes on Escape key', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<BellPopover isOpen={true} onClose={onClose} />);
    await waitFor(() => screen.getByText(/KDP Day-30 check/));
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes when the close button is clicked', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<BellPopover isOpen={true} onClose={onClose} />);
    await waitFor(() => screen.getByText(/KDP Day-30 check/));
    await user.click(
      screen.getByRole('button', { name: /close reminders/i }),
    );
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('surfaces an error banner when listReminders fails', async () => {
    vi.mocked(remindersApi.listReminders).mockRejectedValue(
      new Error('boom'),
    );
    render(<BellPopover isOpen={true} onClose={() => {}} />);
    await waitFor(() => {
      expect(screen.getByText(/failed to load.*boom/i)).toBeInTheDocument();
    });
  });
});
