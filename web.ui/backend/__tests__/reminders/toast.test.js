import { describe, it, expect, vi } from 'vitest';
import { sendToast } from '../../reminders/toast.js';

describe('reminders/toast', () => {
  it('calls notifier.notify with title, message, icon', async () => {
    const notify = vi.fn((opts, cb) => cb(null, 'ok'));
    const notifierFactory = () => ({ notify });
    const result = await sendToast(
      { title: 'KDP Day-30 check', body: 'Sudoku Vol 1' },
      { notifierFactory },
    );
    expect(notify).toHaveBeenCalledTimes(1);
    const args = notify.mock.calls[0][0];
    expect(args.title).toBe('KDP Day-30 check');
    expect(args.message).toBe('Sudoku Vol 1');
    expect(args.icon).toMatch(/rooster/);
    expect(result.ok).toBe(true);
  });

  it('rejects with error when notifier callback errors', async () => {
    const notify = vi.fn((opts, cb) => cb(new Error('SnoreToast missing')));
    const notifierFactory = () => ({ notify });
    await expect(
      sendToast({ title: 't', body: 'b' }, { notifierFactory }),
    ).rejects.toThrow('SnoreToast missing');
  });

  it('uses empty string for body when undefined', async () => {
    const notify = vi.fn((opts, cb) => cb(null, 'ok'));
    const notifierFactory = () => ({ notify });
    await sendToast({ title: 't' }, { notifierFactory });
    expect(notify.mock.calls[0][0].message).toBe('');
  });
});
