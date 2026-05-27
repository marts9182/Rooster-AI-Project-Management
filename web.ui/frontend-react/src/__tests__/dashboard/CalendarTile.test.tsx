import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import CalendarTile from '../../components/dashboard/CalendarTile';
import * as calendarApi from '../../api/calendar';
import type { CalendarEvent } from '../../api/calendar';

afterEach(() => {
  vi.restoreAllMocks();
});

function renderTile() {
  return render(
    <MemoryRouter>
      <CalendarTile />
    </MemoryRouter>,
  );
}

describe('CalendarTile', () => {
  it('groups events by date', async () => {
    const events: CalendarEvent[] = [
      {
        date: '2026-05-28',
        kind: 'kdp.release',
        title: 'Release: Book A',
        source_kind: 'kdp',
        source_id: 1,
      },
      {
        date: '2026-05-29',
        kind: 'reminder',
        title: 'Pay quarterly tax',
        source_kind: 'reminder',
        source_id: 7,
      },
    ];
    vi.spyOn(calendarApi, 'listEvents').mockResolvedValue(events);
    renderTile();
    await waitFor(() => screen.getByText('Release: Book A'));
    expect(screen.getByText('2026-05-28')).toBeInTheDocument();
    expect(screen.getByText('2026-05-29')).toBeInTheDocument();
    expect(screen.getByText('Pay quarterly tax')).toBeInTheDocument();
  });

  it('shows empty state when no events', async () => {
    vi.spyOn(calendarApi, 'listEvents').mockResolvedValue([]);
    renderTile();
    await waitFor(() => {
      expect(screen.getByText(/No events in the next 7 days/i)).toBeInTheDocument();
    });
  });

  it('view-all link points to /calendar', async () => {
    vi.spyOn(calendarApi, 'listEvents').mockResolvedValue([]);
    renderTile();
    await waitFor(() => screen.getByText(/view all/i));
    expect(screen.getByText(/view all/i)).toHaveAttribute('href', '/calendar');
  });

  it('renders error message on fetch failure', async () => {
    vi.spyOn(calendarApi, 'listEvents').mockRejectedValue(new Error('boom'));
    renderTile();
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/boom/);
    });
  });
});
