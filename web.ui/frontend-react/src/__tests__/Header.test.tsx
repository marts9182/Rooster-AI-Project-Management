import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import Header from '../components/Header';
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

function renderAt(path = '/') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Header />
    </MemoryRouter>,
  );
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

describe('Header', () => {
  it('renders the logo with accessible alt text', () => {
    vi.spyOn(remindersApi, 'listReminders').mockResolvedValue([]);
    renderAt();
    const img = screen.getByAltText(/Rooster Dashboard/i);
    expect(img).toBeInTheDocument();
    expect(img.tagName).toBe('IMG');
  });

  it('renders the five primary nav links', () => {
    vi.spyOn(remindersApi, 'listReminders').mockResolvedValue([]);
    renderAt();
    for (const label of ['KDP', 'Etsy', 'Plans', 'Calendar', 'Pinterest']) {
      expect(
        screen.getByRole('link', { name: new RegExp(`^${label}$`, 'i') }),
      ).toBeInTheDocument();
    }
  });

  it('marks the active nav link with the .active class', () => {
    vi.spyOn(remindersApi, 'listReminders').mockResolvedValue([]);
    renderAt('/etsy');
    const link = screen.getByRole('link', { name: /^Etsy$/i });
    expect(link.className).toContain('active');
  });

  it('renders the ThemeToggle button', () => {
    vi.spyOn(remindersApi, 'listReminders').mockResolvedValue([]);
    renderAt();
    const toggle = screen.getByRole('button', {
      name: /switch to (dark|light) mode/i,
    });
    expect(toggle).toBeInTheDocument();
  });

  it('renders the SSE status dot when connected', () => {
    vi.spyOn(remindersApi, 'listReminders').mockResolvedValue([]);
    renderAt();
    const dot = screen.getByLabelText('connected');
    expect(dot.className).toContain('sse-dot-ok');
  });

  it('renders the disconnected dot when SSE is down', () => {
    vi.mocked(sseHook.useSseEvents).mockReturnValue({
      connected: false,
      lastEvent: null,
    });
    vi.spyOn(remindersApi, 'listReminders').mockResolvedValue([]);
    renderAt();
    const dot = screen.getByLabelText('disconnected');
    expect(dot.className).toContain('sse-dot-down');
  });

  it('shows the bell button and badge with pending count', async () => {
    vi.spyOn(remindersApi, 'listReminders').mockResolvedValue([
      makeReminder(1),
      makeReminder(2),
    ]);
    renderAt();
    await waitFor(() => {
      expect(screen.getByLabelText('2 pending reminders')).toBeInTheDocument();
    });
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('hides the badge when no reminders are pending', async () => {
    vi.spyOn(remindersApi, 'listReminders').mockResolvedValue([]);
    const { container } = renderAt();
    await waitFor(() => {
      expect(screen.getByLabelText('0 pending reminders')).toBeInTheDocument();
    });
    expect(container.querySelector('.bell-badge')).toBeNull();
  });

  it('clicking the bell opens the popover', async () => {
    const user = userEvent.setup();
    vi.spyOn(remindersApi, 'listReminders').mockResolvedValue([
      makeReminder(99),
    ]);
    renderAt();
    await waitFor(() => {
      expect(screen.getByLabelText('1 pending reminders')).toBeInTheDocument();
    });
    expect(screen.queryByRole('dialog', { name: /pending reminders/i })).toBeNull();
    await user.click(screen.getByLabelText('1 pending reminders'));
    await waitFor(() => {
      expect(
        screen.getByRole('dialog', { name: /pending reminders/i }),
      ).toBeInTheDocument();
    });
  });

  it('renders a Profile link', () => {
    vi.spyOn(remindersApi, 'listReminders').mockResolvedValue([]);
    renderAt();
    const link = screen.getByRole('link', { name: /^Profile$/i });
    expect(link).toHaveAttribute('href', '/profile');
  });

  it('respects pendingRemindersCount prop and skips fetching', async () => {
    const spy = vi
      .spyOn(remindersApi, 'listReminders')
      .mockResolvedValue([]);
    renderAt();
    // pass through MemoryRouter render with prop
    spy.mockClear();
    render(
      <MemoryRouter>
        <Header pendingRemindersCount={4} />
      </MemoryRouter>,
    );
    expect(spy).not.toHaveBeenCalled();
    expect(screen.getByLabelText('4 pending reminders')).toBeInTheDocument();
  });
});
