import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import HelpDrawer from '../components/HelpDrawer';
import * as helpApi from '../api/help';

beforeEach(() => {
  vi.spyOn(helpApi, 'getHelpMarkdown').mockResolvedValue(
    '# ASIN\n\nFind your **ASIN** on the KDP dashboard.',
  );
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('HelpDrawer', () => {
  it('renders nothing when isOpen is false', () => {
    const { container } = render(
      <HelpDrawer field="asin" isOpen={false} onClose={() => {}} />,
    );
    expect(container.querySelector('[role="dialog"]')).toBeNull();
  });

  it('fetches and renders the markdown when isOpen is true', async () => {
    render(<HelpDrawer field="asin" isOpen={true} onClose={() => {}} />);
    expect(helpApi.getHelpMarkdown).toHaveBeenCalledWith('asin');
    await waitFor(() => {
      expect(
        screen.getByRole('heading', { level: 1, name: /ASIN/i }),
      ).toBeInTheDocument();
    });
    expect(screen.getByText(/Find your/i)).toBeInTheDocument();
  });

  it('calls onClose when the close button is clicked', async () => {
    const onClose = vi.fn();
    render(<HelpDrawer field="asin" isOpen={true} onClose={onClose} />);
    await waitFor(() =>
      screen.getByRole('heading', { level: 1, name: /ASIN/i }),
    );
    await userEvent.click(
      screen.getByRole('button', { name: /close help/i }),
    );
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when Escape is pressed', async () => {
    const onClose = vi.fn();
    render(<HelpDrawer field="asin" isOpen={true} onClose={onClose} />);
    await waitFor(() =>
      screen.getByRole('heading', { level: 1, name: /ASIN/i }),
    );
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalled();
  });

  it('calls onClose when the overlay is clicked', async () => {
    const onClose = vi.fn();
    render(<HelpDrawer field="asin" isOpen={true} onClose={onClose} />);
    await waitFor(() =>
      screen.getByRole('heading', { level: 1, name: /ASIN/i }),
    );
    await userEvent.click(screen.getByTestId('help-overlay'));
    expect(onClose).toHaveBeenCalled();
  });

  it('shows an error banner when the fetch fails', async () => {
    vi.mocked(helpApi.getHelpMarkdown).mockRejectedValueOnce(
      new Error('getHelpMarkdown: 404'),
    );
    render(<HelpDrawer field="missing" isOpen={true} onClose={() => {}} />);
    await waitFor(() =>
      expect(screen.getByText(/Failed to load help/i)).toBeInTheDocument(),
    );
  });
});
