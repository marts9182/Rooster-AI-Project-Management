/**
 * @file Thin wrapper around node-notifier for Windows toast notifications.
 * Inject `notifierFactory` in tests; in production we use the real `node-notifier`.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import nodeNotifier from 'node-notifier';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * @typedef {Object} ToastInput
 * @property {string} title
 * @property {string} [body]
 *
 * @typedef {Object} ToastDeps
 * @property {() => { notify: (opts: object, cb: (err: Error|null, res?: unknown) => void) => void }} [notifierFactory]
 *
 * @typedef {Object} ToastResult
 * @property {true} ok
 */

const ICON_PATH = path.resolve(__dirname, '..', 'assets', 'rooster-icon.png');

/**
 * Fire one Windows toast. Resolves on success, rejects on notifier error.
 * @param {ToastInput} input
 * @param {ToastDeps} [deps]
 * @returns {Promise<ToastResult>}
 */
export function sendToast(input, deps = {}) {
  const notifier = (deps.notifierFactory ?? (() => nodeNotifier))();
  return new Promise((resolve, reject) => {
    notifier.notify(
      {
        title: input.title,
        message: input.body ?? '',
        icon: ICON_PATH,
        sound: false,
        wait: false,
        appID: 'Rooster Dashboard',
      },
      (err) => {
        if (err) {
          reject(err);
          return;
        }
        resolve({ ok: true });
      },
    );
  });
}
