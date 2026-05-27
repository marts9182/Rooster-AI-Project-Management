import { describe, it, expect } from 'vitest';
import nodemailer from 'nodemailer';
import { sendEmail, _buildTransportFromEnv } from '../../reminders/email.js';

describe('reminders/email', () => {
  it('sends via the provided transport and resolves with messageId', async () => {
    const transport = nodemailer.createTransport({ streamTransport: true, buffer: true });
    const transportFactory = () => transport;
    const result = await sendEmail(
      { to: 'marts9182@gmail.com', subject: 'KDP Day-30', text: 'Sudoku Vol 1' },
      { transportFactory },
    );
    expect(result.ok).toBe(true);
    expect(result.messageId).toBeDefined();
    expect(result.message.toString()).toContain('To: marts9182@gmail.com');
    expect(result.message.toString()).toContain('Subject: KDP Day-30');
    expect(result.message.toString()).toContain('Sudoku Vol 1');
  });

  it('from header reads profile.gmail_address (passed via from)', async () => {
    const transport = nodemailer.createTransport({ streamTransport: true, buffer: true });
    const transportFactory = () => transport;
    const result = await sendEmail(
      { to: 'a@b.com', from: 'me@gmail.com', subject: 's', text: 'x' },
      { transportFactory },
    );
    expect(result.message.toString()).toContain('From: me@gmail.com');
  });

  it('rejects when transport errors', async () => {
    const transportFactory = () => ({
      sendMail: (_opts, cb) => cb(new Error('SMTP 535 authentication failed')),
    });
    await expect(
      sendEmail({ to: 'a@b.com', subject: 's', text: 'x' }, { transportFactory }),
    ).rejects.toThrow('SMTP 535');
  });

  it('_buildTransportFromEnv configures Gmail SMTP with provided creds', () => {
    const t = _buildTransportFromEnv({ user: 'me@gmail.com', pass: 'app-pwd' });
    expect(t.options.host).toBe('smtp.gmail.com');
    expect(t.options.port).toBe(587);
    expect(t.options.secure).toBe(false);
    expect(t.options.requireTLS).toBe(true);
    expect(t.options.auth.user).toBe('me@gmail.com');
    expect(t.options.auth.pass).toBe('app-pwd');
  });

  it('_buildTransportFromEnv throws when GMAIL_APP_PASSWORD missing', () => {
    expect(() => _buildTransportFromEnv({ user: 'me@gmail.com', pass: '' })).toThrow(
      /GMAIL_APP_PASSWORD/,
    );
  });
});
