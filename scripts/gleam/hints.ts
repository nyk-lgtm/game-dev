// Hint texts a player would see following hints from a blank board:
// `npx vite-node scripts/gleam/hints.ts <seed> [size]`, or `hints.ts longest [n]` for the longest
// hints over n puzzles of each size (the message box must fit them: 4 lines at 360 px).
import { SIZES, blankBoard, generate, nextHint, setCode, type Size } from '../../src/gleam/core';

const texts = (seed: number, size: Size): string[] => {
  const p = generate(seed, size);
  let board = blankBoard(p);
  const out: string[] = [];
  for (let k = 0; k < 20; k++) {
    const h = nextHint(p, board);
    if (h.kind !== 'place') break;
    out.push(h.text);
    board = setCode(p, board, h.socket, h.code)!;
  }
  return out;
};

if (process.argv[2] === 'longest') {
  const n = Number(process.argv[3] ?? 100);
  const all: string[] = [];
  for (const size of Object.keys(SIZES) as Size[]) for (let s = 1; s <= n; s++) all.push(...texts(s, size));
  const plain = (t: string) => t.replace(/<\/?b>/g, '');
  all.sort((a, b) => plain(b).length - plain(a).length);
  for (const t of all.slice(0, 5)) console.log(plain(t).length, t);
} else {
  const seed = Number(process.argv[2] ?? 1);
  const size = (process.argv[3] ?? 'medium') as Size;
  for (const t of texts(seed, size)) console.log(t.replace(/<\/?b>/g, ''));
}
