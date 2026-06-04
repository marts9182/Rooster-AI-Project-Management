import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { NICHE_BOARD_MAP, ensureBoards } from '../../pinterest/boards.js';

let tmpDir; let mapPath;
beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pin-boards-'));
  mapPath = path.join(tmpDir, 'pinterest_boards.json');
});
afterEach(() => { fs.rmSync(tmpDir, { recursive: true, force: true }); });

function fakeClient({ existing = [], onCreate } = {}) {
  return {
    async listBoards() { return existing; },
    async createBoard(name) {
      const board = onCreate ? onCreate(name) : { id: `new-${name}`, name };
      existing.push(board);
      return board;
    },
  };
}

describe('ensureBoards', () => {
  it('creates only the missing boards and writes a niche→id map', async () => {
    const boardTitles = [...new Set(Object.values(NICHE_BOARD_MAP))];
    // Pretend an unrelated product board AND the first niche board already exist.
    const existing = [
      { id: 'prod-books', name: 'Pocket Rooster Press Books' },
      { id: 'existing-0', name: boardTitles[0] },
    ];
    const created = [];
    const client = fakeClient({ existing, onCreate: (name) => { created.push(name); return { id: `c-${name}`, name }; } });

    const map = await ensureBoards(client, { mapPath });
    for (const niche of Object.keys(NICHE_BOARD_MAP)) {
      expect(typeof map[niche]).toBe('string');
      expect(map[niche].length).toBeGreaterThan(0);
    }
    expect(created).not.toContain(boardTitles[0]);       // existing niche board reused
    expect(created).not.toContain('Pocket Rooster Press Books'); // unrelated board untouched
    expect(fs.existsSync(mapPath)).toBe(true);
  });

  it('is idempotent — a second run creates nothing new', async () => {
    const client = fakeClient();
    await ensureBoards(client, { mapPath });
    const before = (await client.listBoards()).length;
    await ensureBoards(client, { mapPath });
    const after = (await client.listBoards()).length;
    expect(after).toBe(before);
  });
});
