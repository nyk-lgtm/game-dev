// Prints the hint texts a player would see following hints from a blank board:
// `npx vite-node scripts/gleam/hints.ts <seed> [size]`.
import { blankBoard, generate, nextHint, setCode, type Size } from '../../src/gleam/core';

const seed = Number(process.argv[2] ?? 1);
const size = (process.argv[3] ?? 'medium') as Size;
const p = generate(seed, size);
let board = blankBoard(p);
for (let k = 0; k < 20; k++) {
  const h = nextHint(p, board);
  if (h.kind !== 'place') break;
  console.log(`ring ${h.socket} (d${h.depth}): ${h.text.replace(/<\/?b>/g, '')}`);
  board = setCode(p, board, h.socket, h.code)!;
}
