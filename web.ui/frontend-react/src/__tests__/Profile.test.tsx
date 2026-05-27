import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Profile from '../pages/Profile';

const initial = {
  id: 1,
  display_name: 'Shane',
  pen_names: ['Pocket Rooster Press'],
  kdp_author_url: null,
  etsy_shop_url: null,
  pinterest_url: null,
  gmail_address: 'marts9182@gmail.com',
  brand_palette: [],
  time_zone: 'America/Los_Angeles',
};

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  fetchMock.mockResolvedValueOnce({
    ok: true,
    json: async () => ({ profile: initial }),
  });
  fetchMock.mockResolvedValueOnce({
    ok: true,
    json: async () => ({ profile: { ...initial, display_name: 'Shane M' } }),
  });
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('Profile', () => {
  it('loads initial profile values into the Display name field', async () => {
    render(<Profile />);
    await waitFor(() => {
      const input = screen.getByLabelText(/Display name/i) as HTMLInputElement;
      expect(input.value).toBe('Shane');
    });
  });

  it('shows existing pen names as chips', async () => {
    render(<Profile />);
    await waitFor(() => screen.getByLabelText(/Display name/i));
    expect(screen.getByText('Pocket Rooster Press')).toBeInTheDocument();
  });

  it('lets the user add a pen name by pressing Enter', async () => {
    render(<Profile />);
    await waitFor(() => screen.getByLabelText(/Display name/i));
    const penInput = screen.getByLabelText(/Add pen name/i);
    await userEvent.type(penInput, 'Seven Martin{Enter}');
    expect(screen.getByText('Seven Martin')).toBeInTheDocument();
  });

  it('lets the user remove a pen name chip', async () => {
    render(<Profile />);
    await waitFor(() => screen.getByLabelText(/Display name/i));
    const removeBtn = screen.getByRole('button', {
      name: /Remove Pocket Rooster Press/i,
    });
    await userEvent.click(removeBtn);
    expect(screen.queryByText('Pocket Rooster Press')).not.toBeInTheDocument();
  });

  it('renders five brand color swatches', async () => {
    render(<Profile />);
    await waitFor(() => screen.getByLabelText(/Display name/i));
    for (let i = 1; i <= 5; i++) {
      expect(
        screen.getByLabelText(new RegExp(`Brand color ${i}`, 'i')),
      ).toBeInTheDocument();
    }
  });

  it('saves edits via PUT and shows Saved confirmation', async () => {
    render(<Profile />);
    await waitFor(() => screen.getByLabelText(/Display name/i));
    const input = screen.getByLabelText(/Display name/i) as HTMLInputElement;
    await userEvent.clear(input);
    await userEvent.type(input, 'Shane M');
    await userEvent.click(screen.getByRole('button', { name: /^Save$/ }));
    await waitFor(() =>
      expect(screen.getByText(/Saved/)).toBeInTheDocument(),
    );

    // Verify the PUT.
    const putCall = fetchMock.mock.calls.find(
      ([, init]) => (init as RequestInit | undefined)?.method === 'PUT',
    );
    expect(putCall).toBeDefined();
    expect(putCall![0]).toBe('/api/profile');
    const body = JSON.parse((putCall![1] as RequestInit).body as string);
    expect(body.display_name).toBe('Shane M');
  });
});
