/**
 * Tests for pinterest/api_client.js — PinterestApiClient.
 *
 * Uses msw to intercept https://api.pinterest.com/v5/* so no real network
 * call ever happens. Each test seeds a tokenStore so the client doesn't
 * have to do its own refresh dance.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach, beforeEach, vi } from 'vitest';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PinterestApiClient, PinterestApiError } from '../../pinterest/api_client.js';

const BASE = 'https://api.pinterest.com';
const NOW_MS = 1_700_000_000_000;

let tmpDir;
let tokenPath;
let imagePath;

function seedToken(extra = {}) {
  fs.writeFileSync(
    tokenPath,
    JSON.stringify({
      access_token: 'access-T',
      refresh_token: 'refresh-R',
      expires_at: new Date(NOW_MS + 60 * 60 * 1000).toISOString(),
      ...extra,
    }),
  );
}

function makeClient(overrides = {}) {
  // Tiny backoff so 429 / 5xx tests don't burn real wall time.
  return new PinterestApiClient({
    tokenStorePath: tokenPath,
    appId: '1572111',
    appSecret: 'shh',
    backoffMs: [10, 20, 30],
    ...overrides,
  });
}

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

beforeEach(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pin-client-'));
  tokenPath = path.join(tmpDir, 'pinterest_token.json');
  imagePath = path.join(tmpDir, 'pin.png');
  // 4-byte PNG-ish payload is enough — we only need readFileSync to succeed.
  fs.writeFileSync(imagePath, Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  vi.spyOn(Date, 'now').mockReturnValue(NOW_MS);
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

describe('createPin', () => {
  it('POSTs base64-encoded media_source to /v5/pins with Bearer auth', async () => {
    seedToken();
    /** @type {any} */
    let bodyReceived;
    let authHeader;
    server.use(
      http.post(`${BASE}/v5/pins`, async ({ request }) => {
        authHeader = request.headers.get('authorization');
        bodyReceived = await request.json();
        return HttpResponse.json({ id: 'PIN_123', url: 'https://pin.it/PIN_123' });
      }),
    );

    const client = makeClient();
    const out = await client.createPin({
      board_id: 'BOARD_A',
      title: 'T',
      description: 'D',
      link: 'http://x',
      imagePath,
    });

    expect(out.id).toBe('PIN_123');
    expect(out.url).toBe('https://pin.it/PIN_123');
    expect(authHeader).toBe('Bearer access-T');
    expect(bodyReceived.board_id).toBe('BOARD_A');
    expect(bodyReceived.title).toBe('T');
    expect(bodyReceived.description).toBe('D');
    expect(bodyReceived.link).toBe('http://x');
    expect(bodyReceived.media_source.source_type).toBe('image_base64');
    expect(bodyReceived.media_source.content_type).toBe('image/png');
    expect(bodyReceived.media_source.data).toBe(
      Buffer.from([0x89, 0x50, 0x4e, 0x47]).toString('base64'),
    );
  });

  it('on 401: refreshes the token and retries exactly once', async () => {
    seedToken({ expires_at: new Date(NOW_MS + 60 * 60 * 1000).toISOString() });
    let pinHit = 0;
    let refreshHit = 0;
    server.use(
      http.post(`${BASE}/v5/oauth/token`, async () => {
        refreshHit++;
        return HttpResponse.json({
          access_token: 'access-T2',
          refresh_token: 'refresh-R',
          expires_in: 3600,
        });
      }),
      http.post(`${BASE}/v5/pins`, async ({ request }) => {
        pinHit++;
        if (pinHit === 1) {
          return HttpResponse.json({ code: 7, message: 'unauthorized' }, { status: 401 });
        }
        const auth = request.headers.get('authorization');
        expect(auth).toBe('Bearer access-T2');
        return HttpResponse.json({ id: 'PIN_OK' });
      }),
    );

    const out = await makeClient().createPin({
      board_id: 'B', title: 'T', description: 'D', link: 'L', imagePath,
    });
    expect(out.id).toBe('PIN_OK');
    expect(pinHit).toBe(2);
    expect(refreshHit).toBe(1);
  });

  it('on 401 twice in a row: gives up after one refresh and throws PinterestApiError', async () => {
    seedToken();
    let pinHit = 0;
    server.use(
      http.post(`${BASE}/v5/oauth/token`, async () =>
        HttpResponse.json({
          access_token: 'access-T2',
          refresh_token: 'refresh-R',
          expires_in: 3600,
        }),
      ),
      http.post(`${BASE}/v5/pins`, async () => {
        pinHit++;
        return HttpResponse.json({ code: 7, message: 'still unauth' }, { status: 401 });
      }),
    );

    await expect(
      makeClient().createPin({ board_id: 'B', title: 'T', description: 'D', link: 'L', imagePath }),
    ).rejects.toBeInstanceOf(PinterestApiError);
    expect(pinHit).toBe(2); // first + 1 retry after refresh, then surrender
  });

  it('on 429: backs off and retries through the ladder', async () => {
    seedToken();
    let hits = 0;
    server.use(
      http.post(`${BASE}/v5/pins`, async () => {
        hits++;
        if (hits < 3) return HttpResponse.json({ code: 8 }, { status: 429 });
        return HttpResponse.json({ id: 'PIN_LATE' });
      }),
    );
    const out = await makeClient().createPin({
      board_id: 'B', title: 'T', description: 'D', link: 'L', imagePath,
    });
    expect(out.id).toBe('PIN_LATE');
    expect(hits).toBe(3);
  });

  it('on 429 four times in a row: throws PinterestApiError (cap exceeded)', async () => {
    seedToken();
    let hits = 0;
    server.use(
      http.post(`${BASE}/v5/pins`, async () => {
        hits++;
        return HttpResponse.json({ code: 8 }, { status: 429 });
      }),
    );
    let caught;
    try {
      await makeClient().createPin({
        board_id: 'B', title: 'T', description: 'D', link: 'L', imagePath,
      });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(PinterestApiError);
    expect(caught.status).toBe(429);
    expect(caught.body).toBeTruthy();
    expect(hits).toBeLessThanOrEqual(4); // initial + 3 retries max
    expect(hits).toBeGreaterThanOrEqual(4);
  });

  it('on 5xx: retries up to 3 attempts then throws PinterestApiError', async () => {
    seedToken();
    let hits = 0;
    server.use(
      http.post(`${BASE}/v5/pins`, async () => {
        hits++;
        return HttpResponse.text('boom', { status: 503 });
      }),
    );
    let caught;
    try {
      await makeClient().createPin({
        board_id: 'B', title: 'T', description: 'D', link: 'L', imagePath,
      });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(PinterestApiError);
    expect(caught.status).toBe(503);
    expect(caught.body).toMatch(/boom/);
    expect(hits).toBe(3);
  });

  it('on 5xx then 200: retries and returns success', async () => {
    seedToken();
    let hits = 0;
    server.use(
      http.post(`${BASE}/v5/pins`, async () => {
        hits++;
        if (hits === 1) return HttpResponse.text('boom', { status: 500 });
        return HttpResponse.json({ id: 'PIN_R' });
      }),
    );
    const out = await makeClient().createPin({
      board_id: 'B', title: 'T', description: 'D', link: 'L', imagePath,
    });
    expect(out.id).toBe('PIN_R');
    expect(hits).toBe(2);
  });

  it('on 400: throws PinterestApiError without retry, with .status/.body/.code', async () => {
    seedToken();
    let hits = 0;
    server.use(
      http.post(`${BASE}/v5/pins`, async () => {
        hits++;
        return HttpResponse.json({ code: 1, message: 'bad title' }, { status: 400 });
      }),
    );
    let caught;
    try {
      await makeClient().createPin({
        board_id: 'B', title: 'T', description: 'D', link: 'L', imagePath,
      });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(PinterestApiError);
    expect(caught.status).toBe(400);
    expect(caught.body).toMatch(/bad title/);
    expect(caught.code).toBe(1);
    expect(hits).toBe(1);
  });
});

describe('listBoards', () => {
  it('GETs /v5/boards and returns the items array', async () => {
    seedToken();
    server.use(
      http.get(`${BASE}/v5/boards`, ({ request }) => {
        expect(request.headers.get('authorization')).toBe('Bearer access-T');
        return HttpResponse.json({
          items: [
            { id: 'B1', name: 'Cottagecore Coloring', privacy: 'PUBLIC' },
            { id: 'B2', name: 'Sudoku Puzzles', privacy: 'PUBLIC' },
          ],
        });
      }),
    );
    const boards = await makeClient().listBoards();
    expect(boards).toHaveLength(2);
    expect(boards[0].id).toBe('B1');
    expect(boards[0].name).toBe('Cottagecore Coloring');
  });

  it('returns [] when /v5/boards has no items', async () => {
    seedToken();
    server.use(http.get(`${BASE}/v5/boards`, () => HttpResponse.json({})));
    const boards = await makeClient().listBoards();
    expect(boards).toEqual([]);
  });
});

describe('getUserAccount', () => {
  it('GETs /v5/user_account and returns the body', async () => {
    seedToken();
    server.use(
      http.get(`${BASE}/v5/user_account`, () =>
        HttpResponse.json({ username: 'pocketroosterpress', business_name: 'Pocket Rooster Press' }),
      ),
    );
    const u = await makeClient().getUserAccount();
    expect(u.username).toBe('pocketroosterpress');
    expect(u.business_name).toBe('Pocket Rooster Press');
  });
});

describe('getTokenStatus', () => {
  it('returns connected=true and expires_at from the stored token', async () => {
    const exp = new Date(NOW_MS + 7 * 86400_000).toISOString();
    seedToken({ expires_at: exp });
    const status = await makeClient().getTokenStatus();
    expect(status.connected).toBe(true);
    expect(status.expires_at).toBe(exp);
  });

  it('returns connected=false when token file is missing', async () => {
    // Belt-and-braces: scrub env vars so getTokenStatus (which reads the
    // file directly via readStoredToken, not ensureFreshToken) cannot be
    // fooled into bootstrapping mid-test.
    const saved = {
      a: process.env.PINTEREST_ACCESS_TOKEN,
      r: process.env.PINTEREST_REFRESH_TOKEN,
    };
    delete process.env.PINTEREST_ACCESS_TOKEN;
    delete process.env.PINTEREST_REFRESH_TOKEN;
    try {
      const status = await makeClient().getTokenStatus();
      expect(status.connected).toBe(false);
      expect(status.expires_at).toBeNull();
    } finally {
      if (saved.a !== undefined) process.env.PINTEREST_ACCESS_TOKEN = saved.a;
      if (saved.r !== undefined) process.env.PINTEREST_REFRESH_TOKEN = saved.r;
    }
  });

  it('returns connected=false when the stored token has already expired', async () => {
    seedToken({ expires_at: new Date(NOW_MS - 60_000).toISOString() });
    const status = await makeClient().getTokenStatus();
    expect(status.connected).toBe(false);
  });
});
