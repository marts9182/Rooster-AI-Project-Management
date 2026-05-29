import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PinterestSettings from '../components/PinterestSettings';
import * as pinterestApi from '../api/pinterest';
import type {
  PinterestUser,
  PinterestBoard,
  PinterestTokenStatus,
} from '../api/pinterest';

const userBody: PinterestUser = {
  username: 'pocketroosterpress',
  business_name: 'Pocket Rooster Press',
};
const boardsBody: PinterestBoard[] = [
  { id: 'B1', name: 'Cottagecore Coloring' },
  { id: 'B2', name: 'Sudoku Puzzles' },
];

function statusFresh(): PinterestTokenStatus {
  return {
    connected: true,
    expires_at: new Date(Date.now() + 30 * 86400_000).toISOString(),
    last_refresh_at: null,
  };
}

function statusExpiringSoon(): PinterestTokenStatus {
  return {
    connected: true,
    expires_at: new Date(Date.now() + 3 * 86400_000).toISOString(),
    last_refresh_at: null,
  };
}

const statusDisconnected: PinterestTokenStatus = {
  connected: false,
  expires_at: null,
  last_refresh_at: null,
};

let getTokenStatusSpy: ReturnType<typeof vi.spyOn>;
let listBoardsSpy: ReturnType<typeof vi.spyOn>;
let getWhoamiSpy: ReturnType<typeof vi.spyOn>;
let refreshTokenSpy: ReturnType<typeof vi.spyOn>;
let listQueueSpy: ReturnType<typeof vi.spyOn>;
let pauseQueueSpy: ReturnType<typeof vi.spyOn>;
let resumeQueueSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  localStorage.clear();
  getTokenStatusSpy = vi
    .spyOn(pinterestApi, 'getTokenStatus')
    .mockResolvedValue(statusFresh());
  listBoardsSpy = vi
    .spyOn(pinterestApi, 'listBoards')
    .mockResolvedValue(boardsBody);
  getWhoamiSpy = vi
    .spyOn(pinterestApi, 'getWhoami')
    .mockResolvedValue(userBody);
  refreshTokenSpy = vi
    .spyOn(pinterestApi, 'refreshToken')
    .mockResolvedValue(undefined);
  listQueueSpy = vi
    .spyOn(pinterestApi, 'listQueue')
    .mockResolvedValue([]);
  pauseQueueSpy = vi
    .spyOn(pinterestApi, 'pauseQueue')
    .mockResolvedValue({ paused: 6 });
  resumeQueueSpy = vi
    .spyOn(pinterestApi, 'resumeQueue')
    .mockResolvedValue({ resumed: 6 });
  vi.spyOn(pinterestApi, 'getTopupStatus').mockResolvedValue({
    topup_days_runway: 30,
    topup_last_run: null,
    topup_next_run: null,
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe('<PinterestSettings />', () => {
  it('renders the "Connected" chip when token-status returns connected=true with a selected board and >7d remaining', async () => {
    localStorage.setItem('pinterest_default_board_id', 'B1');
    render(<PinterestSettings />);
    await waitFor(() =>
      expect(screen.getByText(/✓ Connected/i)).toBeInTheDocument(),
    );
    expect(screen.getByText(/✓ Connected/i).getAttribute('data-tone')).toBe(
      'ok',
    );
  });

  it('renders an amber "Expires in Xd" chip when expires_at <= 7 days', async () => {
    localStorage.setItem('pinterest_default_board_id', 'B1');
    getTokenStatusSpy.mockResolvedValue(statusExpiringSoon());
    render(<PinterestSettings />);
    await waitFor(() =>
      expect(screen.getByText(/Expires in/i)).toBeInTheDocument(),
    );
    expect(screen.getByText(/Expires in/i).getAttribute('data-tone')).toBe(
      'warn',
    );
  });

  it('renders a red "Disconnected" chip when token-status.connected=false', async () => {
    getTokenStatusSpy.mockResolvedValue(statusDisconnected);
    render(<PinterestSettings />);
    await waitFor(() =>
      expect(screen.getByText(/✗ Disconnected/i)).toBeInTheDocument(),
    );
    expect(screen.getByText(/✗ Disconnected/i).getAttribute('data-tone')).toBe(
      'fail',
    );
    // listBoards is skipped when not connected.
    expect(listBoardsSpy).not.toHaveBeenCalled();
  });

  it('renders an amber "Board not selected" chip when connected but no board chosen', async () => {
    render(<PinterestSettings />);
    await waitFor(() =>
      expect(screen.getByText(/Board not selected/i)).toBeInTheDocument(),
    );
    expect(
      screen.getByText(/Board not selected/i).getAttribute('data-tone'),
    ).toBe('warn');
  });

  it('"Test connection" button calls getWhoami and displays the username', async () => {
    localStorage.setItem('pinterest_default_board_id', 'B1');
    render(<PinterestSettings />);
    await waitFor(() => screen.getByRole('button', { name: /Test connection/i }));
    await userEvent.click(
      screen.getByRole('button', { name: /Test connection/i }),
    );
    await waitFor(() =>
      expect(
        screen.getByText(/Connected as @pocketroosterpress/i),
      ).toBeInTheDocument(),
    );
    expect(getWhoamiSpy).toHaveBeenCalled();
  });

  it('"Refresh token now" button calls refreshToken and re-fetches token-status', async () => {
    localStorage.setItem('pinterest_default_board_id', 'B1');
    render(<PinterestSettings />);
    await waitFor(() =>
      screen.getByRole('button', { name: /Refresh token now/i }),
    );
    // Clear the initial mount fetch call counts.
    getTokenStatusSpy.mockClear();
    refreshTokenSpy.mockClear();

    await userEvent.click(
      screen.getByRole('button', { name: /Refresh token now/i }),
    );
    await waitFor(() => expect(refreshTokenSpy).toHaveBeenCalled());
    expect(getTokenStatusSpy).toHaveBeenCalled();
  });

  it('board dropdown populates from listBoards and selecting writes localStorage', async () => {
    render(<PinterestSettings />);
    await waitFor(() =>
      screen.getByRole('combobox', { name: /Default board/i }),
    );
    const select = screen.getByRole('combobox', { name: /Default board/i });
    const opts = screen.getAllByRole('option').map((o) => o.textContent);
    expect(opts).toContain('Cottagecore Coloring');
    expect(opts).toContain('Sudoku Puzzles');

    await userEvent.selectOptions(select, 'B2');
    expect(localStorage.getItem('pinterest_default_board_id')).toBe('B2');
  });

  it('shows the board-warning banner when connected but no board selected, then hides it after selection', async () => {
    render(<PinterestSettings />);
    await waitFor(() =>
      expect(
        screen.getByText(/Pick a default board to enable posting/i),
      ).toBeInTheDocument(),
    );
    const select = await screen.findByRole('combobox', {
      name: /Default board/i,
    });
    await userEvent.selectOptions(select, 'B1');
    await waitFor(() =>
      expect(
        screen.queryByText(/Pick a default board to enable posting/i),
      ).not.toBeInTheDocument(),
    );
  });

  it('displays an error message when getTokenStatus throws on mount', async () => {
    getTokenStatusSpy.mockRejectedValue(new Error('network down'));
    render(<PinterestSettings />);
    await waitFor(() =>
      expect(screen.getByText(/network down/i)).toBeInTheDocument(),
    );
  });

  it('"Pause queue" button calls pauseQueue and flips to "Resume queue" on success', async () => {
    localStorage.setItem('pinterest_default_board_id', 'B1');
    render(<PinterestSettings />);
    await waitFor(() =>
      screen.getByRole('button', { name: /Pause queue/i }),
    );
    // Mount fetches listQueue once with no paused rows; arrange the post-toggle
    // refresh to return a paused row so the button label flips.
    listQueueSpy.mockResolvedValueOnce([
      {
        id: 99,
        kdp_book_id: 1,
        pin_type: 'cover_hero',
        image_path: 'x.png',
        title: 't',
        description: 'd',
        link_url: 'https://x',
        status: 'paused',
        scheduled_for: new Date().toISOString(),
        attempts: 0,
        last_error: null,
        created_at: new Date().toISOString(),
      },
    ]);
    await userEvent.click(
      screen.getByRole('button', { name: /Pause queue/i }),
    );
    await waitFor(() => expect(pauseQueueSpy).toHaveBeenCalled());
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: /Resume queue/i }),
      ).toBeInTheDocument(),
    );
  });

  it('"Resume queue" button calls resumeQueue when starting in paused state', async () => {
    localStorage.setItem('pinterest_default_board_id', 'B1');
    listQueueSpy.mockResolvedValue([
      {
        id: 99,
        kdp_book_id: 1,
        pin_type: 'cover_hero',
        image_path: 'x.png',
        title: 't',
        description: 'd',
        link_url: 'https://x',
        status: 'paused',
        scheduled_for: new Date().toISOString(),
        attempts: 0,
        last_error: null,
        created_at: new Date().toISOString(),
      },
    ]);
    render(<PinterestSettings />);
    await waitFor(() =>
      screen.getByRole('button', { name: /Resume queue/i }),
    );
    // Arrange the post-toggle refresh to return no paused rows.
    listQueueSpy.mockResolvedValueOnce([]);
    await userEvent.click(
      screen.getByRole('button', { name: /Resume queue/i }),
    );
    await waitFor(() => expect(resumeQueueSpy).toHaveBeenCalled());
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: /Pause queue/i }),
      ).toBeInTheDocument(),
    );
  });
});
