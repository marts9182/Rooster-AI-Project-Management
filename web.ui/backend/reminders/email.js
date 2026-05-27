/**
 * @file Thin wrapper around nodemailer for Gmail SMTP delivery.
 * Inject `transportFactory` in tests (typically a stream transport).
 * In production we build a real SMTP transport from env vars.
 */

import nodemailer from 'nodemailer';

/**
 * @typedef {Object} EmailInput
 * @property {string} to
 * @property {string} [from]
 * @property {string} subject
 * @property {string} text
 * @property {string} [html]
 *
 * @typedef {Object} EmailDeps
 * @property {() => import('nodemailer').Transporter} [transportFactory]
 *
 * @typedef {Object} EmailResult
 * @property {true} ok
 * @property {string} messageId
 * @property {Buffer|string} [message] only present with streamTransport
 */

/**
 * Build a real Gmail SMTP transport. Throws if `pass` is empty.
 * Exposed for tests; production code calls this from sendEmail when no factory is passed.
 * @param {{ user: string, pass: string }} creds
 * @returns {import('nodemailer').Transporter}
 */
export function _buildTransportFromEnv({ user, pass }) {
  if (!pass) {
    throw new Error(
      'GMAIL_APP_PASSWORD env var is required to send reminder emails. ' +
        'See web.ui/backend/help/gmail_app_password.md for setup.',
    );
  }
  return nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    requireTLS: true,
    auth: { user, pass },
  });
}

/**
 * Send one email. Resolves with messageId; rejects on transport error.
 * @param {EmailInput} input
 * @param {EmailDeps} [deps]
 * @returns {Promise<EmailResult>}
 */
export function sendEmail(input, deps = {}) {
  const transport =
    deps.transportFactory != null
      ? deps.transportFactory()
      : _buildTransportFromEnv({
          user: input.from ?? '',
          pass: process.env.GMAIL_APP_PASSWORD ?? '',
        });
  return new Promise((resolve, reject) => {
    transport.sendMail(
      {
        from: input.from,
        to: input.to,
        subject: input.subject,
        text: input.text,
        html: input.html,
      },
      (err, info) => {
        if (err) {
          reject(err);
          return;
        }
        resolve({ ok: true, messageId: info.messageId, message: info.message });
      },
    );
  });
}
