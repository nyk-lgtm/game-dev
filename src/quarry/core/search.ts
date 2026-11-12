// Board search: every path on the face that spells a word. Used by the bots,
// the hint and the "is anything playable?" check after the face changes.

import { N, NEIGHBORS, spell, type Tile } from './board';
import type { Dict } from './dict';

export interface Found {
  path: number[];
  word: string;
}

export interface SearchOpts {
  /** Only the common words (bots). */
  commonOnly?: boolean;
  /** Longest word to look for, in letters. */
  maxLen?: number;
  /** Stop after this many finds. */
  limit?: number;
}

const ABC = 'abcdefghijklmnopqrstuvwxyz';

/** All word paths on the board (a word found along two paths is listed twice). */
export function findWords(board: Tile[], dict: Dict, o: SearchOpts = {}): Found[] {
  const words = o.commonOnly ? dict.common : dict.words;
  const pre = dict.prefixes(!!o.commonOnly);
  const maxLen = o.maxLen ?? 8;
  const limit = o.limit ?? Infinity;
  const out: Found[] = [];
  const path: number[] = [];
  const used = new Uint8Array(N);
  const visit = (i: number, s: string) => {
    if (out.length >= limit) return;
    const t = board[i];
    const opts = t.ch === '*' ? [...ABC] : [spell(t)];
    used[i] = 1;
    path.push(i);
    for (const piece of opts) {
      const w = s + piece;
      if (w.length > maxLen) continue;
      if (w.length >= 3 && words.has(w)) out.push({ path: path.slice(), word: w });
      if (!pre.has(w)) continue;
      for (const n of NEIGHBORS[i]) if (!used[n] && !board[n].rock) visit(n, w);
    }
    path.pop();
    used[i] = 0;
  };
  for (let i = 0; i < N; i++) if (!board[i].rock) visit(i, '');
  return out;
}

export const anyWord = (board: Tile[], dict: Dict) => findWords(board, dict, { limit: 1 }).length > 0;
