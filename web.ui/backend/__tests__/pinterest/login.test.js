/**
 * Tests for pinterest/login.js — runVisibleLogin().
 *
 * The real implementation launches a HEADED Chromium with a persistent
 * profile so the user can sign in once. These tests inject a fake
 * playwrightChromium object so no real browser ever launches.
 */
import { describe, it, expect, vi } from 'vitest';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';

describe('runVisibleLogin', () => {
  it('launches headed Chromium with persistent profile and waits for login', async () => {
    const calls = { launchPersistent: 0, newPage: 0, gotoUrls: [], wait: 0, close: 0 };
    const fakeContext = {
      pages: () => [{
        goto: vi.fn(async (url) => { calls.gotoUrls.push(url); }),
        waitForURL: vi.fn(async () => { calls.wait++; }),
        waitForSelector: vi.fn(async () => true),
      }],
      newPage: vi.fn(async () => {
        calls.newPage++;
        return {
          goto: vi.fn(async (url) => { calls.gotoUrls.push(url); }),
          waitForURL: vi.fn(async () => { calls.wait++; }),
          waitForSelector: vi.fn(async () => true),
        };
      }),
      close: vi.fn(async () => { calls.close++; }),
    };
    const fakeChromium = {
      launchPersistentContext: vi.fn(async (dir, opts) => {
        calls.launchPersistent++;
        calls.launchOpts = opts;
        return fakeContext;
      }),
    };
    const profileDir = path.join(os.tmpdir(), `pin-login-${Date.now()}`);

    const { runVisibleLogin } = await import('../../pinterest/login.js');
    await runVisibleLogin({
      profileDir,
      playwrightChromium: fakeChromium,
      loginUrl: 'https://www.pinterest.com/login/',
      successUrlRegex: /pinterest\.com\/?$/,
    });

    expect(calls.launchPersistent).toBe(1);
    expect(calls.launchOpts.headless).toBe(false);
    expect(calls.gotoUrls[0]).toContain('login');
    expect(calls.close).toBe(1);
    expect(fs.existsSync(profileDir)).toBe(true);
    fs.rmSync(profileDir, { recursive: true, force: true });
  });

  it('still closes the context if waitForURL throws (timeout)', async () => {
    let closed = 0;
    const fakeContext = {
      pages: () => [{
        goto: vi.fn(async () => {}),
        waitForURL: vi.fn(async () => { throw new Error('Timeout 300000ms exceeded'); }),
      }],
      newPage: vi.fn(),
      close: vi.fn(async () => { closed++; }),
    };
    const fakeChromium = {
      launchPersistentContext: vi.fn(async () => fakeContext),
    };
    const profileDir = path.join(os.tmpdir(), `pin-login-${Date.now()}-to`);

    const { runVisibleLogin } = await import('../../pinterest/login.js');
    await expect(runVisibleLogin({
      profileDir,
      playwrightChromium: fakeChromium,
      timeoutMs: 1000,
    })).rejects.toThrow(/Timeout/);
    expect(closed).toBe(1);
    fs.rmSync(profileDir, { recursive: true, force: true });
  });

  it('opens a new page when the persistent context has none', async () => {
    let newPaged = 0;
    const fakeContext = {
      pages: () => [],
      newPage: vi.fn(async () => {
        newPaged++;
        return {
          goto: vi.fn(async () => {}),
          waitForURL: vi.fn(async () => {}),
        };
      }),
      close: vi.fn(async () => {}),
    };
    const fakeChromium = {
      launchPersistentContext: vi.fn(async () => fakeContext),
    };
    const profileDir = path.join(os.tmpdir(), `pin-login-${Date.now()}-np`);

    const { runVisibleLogin } = await import('../../pinterest/login.js');
    await runVisibleLogin({
      profileDir,
      playwrightChromium: fakeChromium,
    });
    expect(newPaged).toBe(1);
    fs.rmSync(profileDir, { recursive: true, force: true });
  });
});
