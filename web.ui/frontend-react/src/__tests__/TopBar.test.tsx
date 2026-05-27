import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TopBar from '../components/TopBar';
import * as remindersApi from '../api/reminders';
import * as sseHook from '../hooks/useSseEvents';
import type { Reminder } from '../api/reminders';

function makeReminder(id: number): Reminder {
  return {
    id,
    title: `Reminder ${id}`,
    body: null,
    due_at: '2026-05-27T12:00:00Z',
    channel: 'toast',
    status: 'pending',
    source_kind: null,
    source_id: null,
    fired_at: null,
    created_at: '2026-05-26T12:00:00Z',
  };
}

beforeEach(() => {
  vi.spyOn(sseHook, 'useSseEvents').mockReturnValue({
    connected: true,
    lastEvent: null,
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('TopBar', () => {
  it('renders the SSE status dot reflecting useSseEvents', () => {
    vi.spyOn(remindersApi, 'listReminders').mockResolvedValue([]);
    render(<TopBar />);
    const dot = screen.getByLabelText('connected');
    expect(dot).toBeInTheDocument();
    expect(dot.className).toContain('sse-dot-ok');
  });

  it('renders the disconnected dot when SSE is not connected', () => {
    vi.mocked(sseHook.useSseEvents).mockReturnValue({
      connected: false,
      lastEvent: null,
    });
    vi.spyOn(remindersApi, 'listReminders').mockResolvedValue([]);
    render(<TopBar />);
    const dot = screen.getByLabelText('disconnected');
    expect(dot.className).toContain('sse-dot-down');
  });

  it('fetches pending reminders on mount and shows the badge count', async () => {
    const spy = vi
      .spyOn(remindersApi, 'listReminders')
      .mockResolvedValue([makeReminder(1), makeReminder(2), makeReminder(3)]);
    render(<TopBar />);
    expect(spy).toHaveBeenCalledWith({ status: 'pending', limit: 100 });
    await waitFor(() => {
      expect(screen.getByLabelText('3 pending reminders')).toBeInTheDocument();
    });
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('hides the badge when count is 0', async () => {
    vi.spyOn(remindersApi, 'listReminders').mockResolvedValue([]);
    const { container } = render(<TopBar />);
    await waitFor(() => {
      expect(screen.getByLabelText('0 pending reminders')).toBeInTheDocument();
    });
    expect(container.querySelector('.bell-badge')).toBeNull();
  });

  it('respects pendingRemindersCount prop and skips fetching', async () => {
    const spy = vi.spyOn(remindersApi, 'listReminders').mockResolvedValue([]);
    render(<TopBar pendingRemindersCount={7} />);
    expect(spy).not.toHaveBeenCalled();
    expect(screen.getByLabelText('7 pending reminders')).toBeInTheDocument();
    expect(screen.getByText('7')).toBeInTheDocument();
  });

  it('clicking the bell opens the popover', async () => {
    const user = userEvent.setup();
    vi.spyOn(remindersApi, 'listReminders').mockResolvedValue([
      makeReminder(42),
    ]);
    render(<TopBar />);
    await waitFor(() => {
      expect(screen.getByLabelText('1 pending reminders')).toBeInTheDocument();
    });
    // Popover not yet open.
    expect(screen.queryByRole('dialog', { name: /pending reminders/i })).toBeNull();
    await user.click(screen.getByLabelText('1 pending reminders'));
    await waitFor(() => {
      expect(
        screen.getByRole('dialog', { name: /pending reminders/i }),
      ).toBeInTheDocument();
    });
  });

  it('ignores non-reminder SSE events', async () => {
    const spy = vi
      .spyOn(remindersApi, 'listReminders')
      .mockResolvedValue([makeReminder(1)]);
    const { rerender } = render(<TopBar />);
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(1));

    vi.mocked(sseHook.useSseEvents).mockReturnValue({
      connected: true,
      lastEvent: {
        kind: 'kdp:new-book',
        payload: {},
        occurred_at: '2026-05-26T12:00:00Z',
      },
    });
    rerender(<TopBar />);

    // Give any pending microtasks a chance — should remain 1 call.
    await new Promise((r) => setTimeout(r, 20));
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('refetches count when a reminder:fired SSE event arrives', async () => {
    const spy = vi
      .spyOn(remindersApi, 'listReminders')
      .mockResolvedValue([makeReminder(1)]);

    const { rerender } = render(<TopBar />);
    await waitFor(() => {
      expect(spy).toHaveBeenCalledTimes(1);
    });

    // Switch the SSE mock to surface a fired event, then force a rerender so
    // the effect dependency (lastEvent) updates.
    vi.mocked(sseHook.useSseEvents).mockReturnValue({
      connected: true,
      lastEvent: {
        kind: 'reminder:fired',
        payload: { id: 1 },
        occurred_at: '2026-05-26T12:00:00Z',
      },
    });
    rerender(<TopBar />);

    await waitFor(() => {
      expect(spy).toHaveBeenCalledTimes(2);
    });
  });
});
