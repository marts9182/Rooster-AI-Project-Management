import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PinPreviewModal, {
  imagePathToFilesUrl,
} from '../components/PinPreviewModal';
import type { PinterestQueueRow } from '../api/pinterest';

const sampleRow: PinterestQueueRow = {
  id: 7,
  kdp_book_id: 1,
  pin_type: 'cover_hero',
  image_path:
    'C:\\Sandbox\\AIProjectManagement\\Rooster-AI-Project-Management\\output\\pinterest\\sample\\cover_hero-0.png',
  title: 'Pin preview title',
  description: 'Lovely description',
  link_url: 'https://www.amazon.com/dp/B01ABCDEFG',
  status: 'pending',
  scheduled_for: '2026-06-01T15:00:00Z',
  attempts: 0,
  last_error: null,
  created_at: '2026-05-26T00:00:00Z',
};

describe('imagePathToFilesUrl', () => {
  it('converts a Windows backslash path to the /files URL', () => {
    expect(imagePathToFilesUrl(sampleRow.image_path)).toBe(
      '/files/output/pinterest/sample/cover_hero-0.png',
    );
  });

  it('converts a forward-slash absolute path to the /files URL', () => {
    expect(
      imagePathToFilesUrl('/tmp/repo/output/pinterest/foo/cover_hero-1.png'),
    ).toBe('/files/output/pinterest/foo/cover_hero-1.png');
  });

  it('passes through a path with no output/pinterest segment', () => {
    expect(imagePathToFilesUrl('/some/other/path.png')).toBe(
      '/some/other/path.png',
    );
  });
});

describe('<PinPreviewModal />', () => {
  it('returns null when row is null', () => {
    const { container } = render(
      <PinPreviewModal row={null} onClose={vi.fn()} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('shows the title, description, scheduled_for, and the image src', () => {
    render(<PinPreviewModal row={sampleRow} onClose={vi.fn()} />);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Pin preview title' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Lovely description')).toBeInTheDocument();
    const img = screen.getByRole('img', { name: 'Pin preview title' });
    expect(img).toHaveAttribute(
      'src',
      '/files/output/pinterest/sample/cover_hero-0.png',
    );
  });

  it('Close button fires onClose', async () => {
    const onClose = vi.fn();
    render(<PinPreviewModal row={sampleRow} onClose={onClose} />);
    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('the × close button also fires onClose', async () => {
    const onClose = vi.fn();
    render(<PinPreviewModal row={sampleRow} onClose={onClose} />);
    await userEvent.click(
      screen.getByRole('button', { name: 'Close modal' }),
    );
    expect(onClose).toHaveBeenCalled();
  });

  it('Escape key fires onClose', async () => {
    const onClose = vi.fn();
    render(<PinPreviewModal row={sampleRow} onClose={onClose} />);
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalled();
  });

  it('shows the Edit button only when onEdit is provided', () => {
    const { rerender } = render(
      <PinPreviewModal row={sampleRow} onClose={vi.fn()} />,
    );
    expect(screen.queryByRole('button', { name: /^Edit$/ })).toBeNull();
    rerender(
      <PinPreviewModal
        row={sampleRow}
        onClose={vi.fn()}
        onEdit={vi.fn()}
      />,
    );
    expect(
      screen.getByRole('button', { name: /^Edit$/ }),
    ).toBeInTheDocument();
  });

  it('clicking Edit flips to an inline form and Save fires onEdit', async () => {
    const onEdit = vi.fn();
    render(
      <PinPreviewModal
        row={sampleRow}
        onClose={vi.fn()}
        onEdit={onEdit}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: /^Edit$/ }));
    const titleInput = screen.getByLabelText(
      /Edit title/i,
    ) as HTMLInputElement;
    expect(titleInput.value).toBe('Pin preview title');
    await userEvent.clear(titleInput);
    await userEvent.type(titleInput, 'New title from modal');
    await userEvent.click(screen.getByRole('button', { name: /^Save$/ }));
    expect(onEdit).toHaveBeenCalledTimes(1);
    const [id, patch] = onEdit.mock.calls[0];
    expect(id).toBe(7);
    expect(patch.title).toBe('New title from modal');
  });
});
