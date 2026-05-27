import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import HelpIcon from '../components/HelpIcon';
import * as helpApi from '../api/help';

beforeEach(() => {
  vi.spyOn(helpApi, 'getHelpMarkdown').mockResolvedValue(
    '# Pinterest URL\n\nGrab the URL from your profile.',
  );
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('HelpIcon', () => {
  it('renders an accessible button labelled by field name', () => {
    render(<HelpIcon field="pinterest_url" />);
    const btn = screen.getByRole('button', { name: /help for pinterest_url/i });
    expect(btn).toBeInTheDocument();
  });

  it('honors a custom ariaLabel when provided', () => {
    render(
      <HelpIcon field="pinterest_url" ariaLabel="Explain Pinterest URL" />,
    );
    expect(
      screen.getByRole('button', { name: /explain pinterest url/i }),
    ).toBeInTheDocument();
  });

  it('opens the HelpDrawer on click and closes it via the overlay', async () => {
    render(<HelpIcon field="pinterest_url" />);
    // Drawer not visible yet
    expect(screen.queryByRole('dialog')).toBeNull();

    // First click — opens the drawer.
    await userEvent.click(
      screen.getByRole('button', { name: /help for pinterest_url/i }),
    );
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
    expect(helpApi.getHelpMarkdown).toHaveBeenCalledWith('pinterest_url');

    // Click overlay — closes the drawer.
    await userEvent.click(screen.getByTestId('help-overlay'));
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
  });
});
