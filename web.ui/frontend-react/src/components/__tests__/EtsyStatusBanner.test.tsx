import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import EtsyStatusBanner from '../EtsyStatusBanner';
import type { EtsyStatus } from '../../api/etsy';

const baseOk: EtsyStatus = {
  configured: true,
  missingEnv: [],
  tokenPresent: true,
  tokenExpiresAt: '2030-01-01T00:00:00Z',
  lastHeartbeatAt: new Date(Date.now() - 60_000).toISOString(),
  lastError: null,
  lastSyncAt: new Date(Date.now() - 60_000).toISOString(),
};

function mockJson(body: unknown, ok = true, status = 200) {
  return {
    ok,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

describe('EtsyStatusBanner', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });
  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('renders not-configured state with missingEnv list', async () => {
    const s: EtsyStatus = {
      ...baseOk,
      configured: false,
      missingEnv: ['ETSY_KEYSTRING', 'ETSY_SHARED_SECRET'],
      tokenPresent: false,
      tokenExpiresAt: null,
      lastHeartbeatAt: null,
      lastError: null,
      lastSyncAt: null,
    };
    fetchSpy.mockResolvedValueOnce(mockJson(s));
    render(<EtsyStatusBanner onSynced={vi.fn()} />);
    expect(await screen.findByRole('alert')).toHaveTextContent(/Etsy not configured/i);
    expect(screen.getByRole('alert')).toHaveTextContent('ETSY_KEYSTRING');
    expect(screen.getByRole('alert')).toHaveTextContent('ETSY_SHARED_SECRET');
  });

  it('renders no-token state with bootstrap hint', async () => {
    const s: EtsyStatus = {
      ...baseOk,
      tokenPresent: false,
      tokenExpiresAt: null,
      lastHeartbeatAt: null,
      lastSyncAt: null,
    };
    fetchSpy.mockResolvedValueOnce(mockJson(s));
    render(<EtsyStatusBanner onSynced={vi.fn()} />);
    expect(await screen.findByRole('alert')).toHaveTextContent(/Etsy token missing/i);
    expect(screen.getByRole('alert')).toHaveTextContent(/etsy_oauth_setup\.py/);
  });

  it('renders sync-failed state when lastError is set', async () => {
    const s: EtsyStatus = { ...baseOk, lastError: 'token refresh failed: 401' };
    fetchSpy.mockResolvedValueOnce(mockJson(s));
    render(<EtsyStatusBanner onSynced={vi.fn()} />);
    expect(await screen.findByRole('alert')).toHaveTextContent(/Last sync failed/i);
    expect(screen.getByRole('alert')).toHaveTextContent('token refresh failed: 401');
  });

  it('renders ok state as a collapsed status strip', async () => {
    fetchSpy.mockResolvedValueOnce(mockJson(baseOk));
    render(<EtsyStatusBanner onSynced={vi.fn()} />);
    expect(await screen.findByRole('status')).toHaveTextContent(/Synced/i);
    expect(screen.getByRole('button', { name: /sync now/i })).toBeEnabled();
  });

  it('clicking Sync now POSTs sync-now, refetches status, and calls onSynced', async () => {
    fetchSpy
      .mockResolvedValueOnce(mockJson(baseOk))                              // initial GET /status
      .mockResolvedValueOnce(mockJson({ inserted: 1, updated: 0, statusChanged: 0 })) // POST /sync-now
      .mockResolvedValueOnce(mockJson(baseOk));                             // refetch GET /status
    const onSynced = vi.fn();
    render(<EtsyStatusBanner onSynced={onSynced} />);
    await screen.findByRole('button', { name: /sync now/i });
    await userEvent.click(screen.getByRole('button', { name: /sync now/i }));
    await waitFor(() => expect(onSynced).toHaveBeenCalled());
    const calls = fetchSpy.mock.calls.map((c) => String(c[0]));
    expect(calls).toEqual([
      '/api/etsy/status',
      '/api/etsy/sync-now',
      '/api/etsy/status',
    ]);
  });

  it('on sync failure surfaces error inside the banner (no toast)', async () => {
    fetchSpy
      .mockResolvedValueOnce(mockJson(baseOk))                                // initial GET
      .mockResolvedValueOnce(mockJson({ error: 'etsy 401' }, false, 500));    // POST fails
    render(<EtsyStatusBanner onSynced={vi.fn()} />);
    await userEvent.click(await screen.findByRole('button', { name: /sync now/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/etsy 401/i);
  });
});
