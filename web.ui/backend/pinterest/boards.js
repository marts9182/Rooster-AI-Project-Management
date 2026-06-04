/**
 * Theme/niche board map + idempotent bootstrap.
 *
 * ensureBoards() lists the account's existing boards, creates any board named
 * in NICHE_BOARD_MAP that is missing, and writes a `niche → board_id` map to
 * data/pinterest_boards.json. Boards not named in the map (e.g. the existing
 * product-type boards) are left untouched. Safe to run on every boot.
 *
 * @module pinterest/boards
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** niche key → board display name. Multiple niches may share a board. */
export const NICHE_BOARD_MAP = Object.freeze({
  sudoku: 'Large-Print Sudoku',
  'travel-sudoku': 'Large-Print Sudoku',
  'word-search': 'Word Search Puzzles',
  historical: 'Word Search Puzzles',
  kakuro: 'Kakuro & Logic Puzzles',
  futoshiki: 'Kakuro & Logic Puzzles',
  cryptogram: 'Cryptograms & Codes',
  coloring: 'Coloring Pages',
  'hobbyist-birds': 'Birding & Nature',
  cottagecore: 'Cottagecore SVG Cut Files',
  mandala: 'Cottagecore SVG Cut Files',
  poster: 'Printable Wall Art',
});

/** @returns {string} default on-disk path for the persisted map. */
export function defaultMapPath() {
  return path.resolve(__dirname, '..', '..', '..', 'data', 'pinterest_boards.json');
}

/**
 * @param {{listBoards: () => Promise<Array<{id:string,name:string}>>,
 *          createBoard: (name: string) => Promise<{id:string,name:string}>}} apiClient
 * @param {{mapPath?: string}} [opts]
 * @returns {Promise<Record<string,string>>}  niche → board_id
 */
export async function ensureBoards(apiClient, opts = {}) {
  const mapPath = opts.mapPath ?? defaultMapPath();
  const existing = await apiClient.listBoards();
  /** @type {Map<string,string>} name → id */
  const byName = new Map(existing.map((b) => [b.name, b.id]));

  const wantedTitles = [...new Set(Object.values(NICHE_BOARD_MAP))];
  for (const title of wantedTitles) {
    if (!byName.has(title)) {
      const created = await apiClient.createBoard(title);
      byName.set(title, created.id);
    }
  }

  /** @type {Record<string,string>} */
  const nicheMap = {};
  for (const [niche, title] of Object.entries(NICHE_BOARD_MAP)) {
    const id = byName.get(title);
    if (id) nicheMap[niche] = id;
  }

  fs.mkdirSync(path.dirname(mapPath), { recursive: true });
  fs.writeFileSync(mapPath, JSON.stringify(nicheMap, null, 2), 'utf8');
  return nicheMap;
}

/**
 * Read the persisted niche→board_id map; {} if absent.
 * @param {string} [mapPath]
 * @returns {Record<string,string>}
 */
export function readBoardMap(mapPath = defaultMapPath()) {
  try {
    return JSON.parse(fs.readFileSync(mapPath, 'utf8'));
  } catch {
    return {};
  }
}
