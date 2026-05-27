import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PinterestSettings from '../components/PinterestSettings';
import type { PinterestQueueRow } from '../api/pinterest';

function jsonOk(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

const pendingRow: PinterestQueueRow = {
  id: 1,
  kdp_book_id: 1,
  pin_type: 'cover_hero',
  image_path: '/tmp/output/pinterest/sample/cover_hero-0.png',
  title: 'A pending pin',
  description: 'desc',
  link_url: 'https://www.amazon.com/dp/B01ABCDEFG',
  status: 'pending',
  scheduled_for: '2026-06-01T15:00:00Z',
  attempts: 0,
  last_error: null,
  created_at: '2026-05-26T00:00:00Z',
};

const pausedRow: PinterestQueueRow = { ...pendingRow, id: 2, status: 'paused' };

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('<PinterestSettings />', () => {
  it('shows the pending and paused counts derived from the queue', () => {
    render(
      <PinterestSettings
        queue={[pendingRow, pendingRow, pausedRow]}
        onChanged={vi.fn()}
      />,
    );
    const heading = screen.getByText(/pending/i);
    // "2 pending · 1 paused" — assert both numbers appear.
    expect(heading.textContent).toMatch(/2.*pending/);
    expect(heading.textContent).toMatch(/1.*paused/);
  });

  it('clicking "Pause queue" POSTs /api/pinterest/pause and calls onChanged', async () => {
    fetchMock.mockResolvedValueOnce(jsonOk({ paused: 3 }));
    const onChanged = vi.fn();
    render(
      <PinterestSettings queue={[pendingRow]} onChanged={onChanged} />,
    );
    await userEvent.click(
      screen.getByRole('button', { name: /Pause queue/i }),
    );
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    expect(fetchMock).toHaveBeenCalledWith('/api/pinterest/pause', {
      method: 'POST',
    });
    expect(screen.getByText(/Paused 3 pin\(s\)/i)).toBeInTheDocument();
  });

  it('clicking "Resume queue" POSTs /api/pinterest/resume and calls onChanged', async () => {
    fetchMock.mockResolvedValueOnce(jsonOk({ resumed: 2 }));
    const onChanged = vi.fn();
    render(
      <PinterestSettings queue={[pausedRow]} onChanged={onChanged} />,
    );
    await userEvent.click(
      screen.getByRole('button', { name: /Resume queue/i }),
    );
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    expect(fetchMock).toHaveBeenCalledWith('/api/pinterest/resume', {
      method: 'POST',
    });
    expect(screen.getByText(/Resumed 2 pin\(s\)/i)).toBeInTheDocument();
  });

  it('shows "Sign in to Pinterest" button that POSTs /api/pinterest/login', async () => {
    fetchMock.mockResolvedValueOnce(jsonOk({ ok: true, launched: true }));
    render(
      <PinterestSettings queue={[pendingRow]} onChanged={vi.fn()} />,
    );
    await userEvent.click(
      screen.getByRole('button', { name: /Sign in to Pinterest/i }),
    );
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith('/api/pinterest/login', {
        method: 'POST',
      }),
    );
    expect(
      screen.getByText(/Browser window opening/i),
    ).toBeInTheDocument();
  });

  it('shows the cadence summary in muted copy', () => {
    render(<PinterestSettings queue={[]} onChanged={vi.fn()} />);
    expect(
      screen.getByText(/3.{1,3}5 pins\/day between 09:00 and 21:00/i),
    ).toBeInTheDocument();
  });

  it('disables Pause when the queue has nothing pending', () => {
    render(<PinterestSettings queue={[]} onChanged={vi.fn()} />);
    const pauseBtn = screen.getByRole('button', { name: /Pause queue/i });
    expect(pauseBtn).toBeDisabled();
  });

  it('renders an error message when pause fails', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({ error: 'boom' }),
    });
    render(
      <PinterestSettings queue={[pendingRow]} onChanged={vi.fn()} />,
    );
    await userEvent.click(
      screen.getByRole('button', { name: /Pause queue/i }),
    );
    await waitFor(() =>
      expect(screen.getByText(/Pause failed/i)).toBeInTheDocument(),
    );
  });
});
