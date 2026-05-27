import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Help from '../pages/Help';
import * as helpApi from '../api/help';

const ALL_TOPICS = [
  'Finding your ASIN',
  'Your Amazon Author page URL',
  'Your Etsy shop URL',
  'Your Pinterest profile URL',
  'Generating a Gmail App Password',
  'Picking a BISAC code',
  'Finding your book release date',
];

beforeEach(() => {
  vi.spyOn(helpApi, 'getHelpMarkdown').mockResolvedValue(
    '# Stub\n\nstub body',
  );
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Help page', () => {
  it('renders the page heading and intro', () => {
    render(<Help />);
    expect(
      screen.getByRole('heading', { level: 1, name: /help/i }),
    ).toBeInTheDocument();
  });

  it('renders one card for each of the 7 topics', () => {
    render(<Help />);
    for (const title of ALL_TOPICS) {
      expect(screen.getByText(title)).toBeInTheDocument();
    }
    // Each card is a button (also listitem role).
    const cards = screen.getAllByRole('listitem');
    expect(cards).toHaveLength(ALL_TOPICS.length);
  });

  it('opens the HelpDrawer with the matching field when a card is clicked', async () => {
    render(<Help />);
    // Initially no dialog.
    expect(screen.queryByRole('dialog')).toBeNull();

    await userEvent.click(
      screen.getByRole('listitem', {
        name: /open help: generating a gmail app password/i,
      }),
    );

    await waitFor(() =>
      expect(screen.getByRole('dialog')).toBeInTheDocument(),
    );
    expect(helpApi.getHelpMarkdown).toHaveBeenCalledWith('gmail_app_password');
  });

  it('closes the drawer when the close button is clicked', async () => {
    render(<Help />);
    await userEvent.click(
      screen.getByRole('listitem', { name: /open help: finding your asin/i }),
    );
    await waitFor(() =>
      expect(screen.getByRole('dialog')).toBeInTheDocument(),
    );
    await userEvent.click(
      screen.getByRole('button', { name: /close help/i }),
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });
});
